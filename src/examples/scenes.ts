// TypeScript counterparts of examples/ex01.lua through ex06.lua (ex03 text only; particles are M8).
import { Matrix, type Srt } from '../core/Matrix';
import { colorMul, colorAdd } from '../core/Color';
import { Renderer } from '../core/Renderer';
import { Sprite } from '../sprite/Sprite';
import type { SpritePack } from '../sprite/SpritePack';
import type { TouchPhase } from '../app/Input';

export const demos = [
  { id: 'ex01', tag: '01', title: '层级与帧动画', description: '两棵 sprite 树，共享一份资源。具名子动画保留独立时间线。', source: 'ex01.lua · sprite.c', milestone: 'M4 · M5 · M7' },
  { id: 'ex02', tag: '02', title: '贴图四边形', description: '原版 ex02 的四个顶点与 UV，直接提交到底层渲染器。', source: 'ex02.lua · shader.c', milestone: 'M1' },
  { id: 'matrix', tag: 'M2', title: '矩阵与坐标', description: '同一图元的平移、旋转、缩放与镜像。行向量从局部走向世界。', source: 'matrix.h · matrix.c · screen.c', milestone: 'M2 · M3' },
  { id: 'ex03', tag: '03', title: '位图文本', description: 'Canvas 生成文字纹理，和图片一样交给 WebGL2。此示例展示纯文本部分。', source: 'ex03.lua · label.c', milestone: 'M7' },
  { id: 'ex04', tag: '04', title: '命中与裁剪', description: '点击文字改变内容；点击矿场或面板区域切换裁剪。点击空白查看 Not Hit。', source: 'ex04.lua · sprite.c · scissor.c', milestone: 'M6 · M7' },
  { id: 'ex05', tag: '05', title: '挂点与挂载', description: '挂点世界矩阵包含炮管动画与画布变换，独立文字跟随挂点。', source: 'ex05.lua · anchor_update', milestone: 'M4 · M7' },
  { id: 'ex06', tag: '06', title: '共享 proxy', description: '两门炮共享同一个炮管实例。proxy 可被多处挂载，自身没有 parent。', source: 'ex06.lua · sprite_mount', milestone: 'M5' },
  { id: 'color', tag: 'RGB', title: '颜色与合批', description: '颜色、透明度与加色沿树合成。同纹理的连续图元自动进入同一批次。', source: 'shader.lua · renderbuffer.c', milestone: 'M5' },
  { id: 'clear', tag: 'M0', title: '清屏', description: '固定 30 Hz 逻辑更新，requestAnimationFrame 驱动渲染。', source: 'ejoy2dgame.c', milestone: 'M0' },
] as const;
export type DemoId = typeof demos[number]['id'];

export interface SceneOptions {
  zoom: number;
  rotation: number;
  alpha: number;
  additive: number;
  bounds: boolean;
  mounted: boolean;
  text: string;
}

export class Scene {
  readonly objects: Sprite[] = [];
  readonly turret: Sprite | null;
  readonly mine: Sprite | null;
  readonly anchor: Sprite | null;
  readonly label: Sprite | null;
  readonly proxy: Sprite | null;
  status = 'Ready';
  frame = 0;
  private wasMounted = false;

  constructor(readonly id: DemoId, readonly pack: SpritePack) {
    let turret: Sprite | null = null, mine: Sprite | null = null, anchor: Sprite | null = null;
    let label: Sprite | null = null, proxy: Sprite | null = null;
    const cannon = () => Sprite.create(pack, 'cannon');
    if (id === 'ex01') {
      const gun = cannon().ps(-100, 0, 0.5);
      turret = gun.fetch('turret');
      mine = Sprite.create(pack, 'mine').ps(100, 0).ps(1.2);
      mine.fetch('resource').frame = 70;
      this.objects.push(gun, mine);
    } else if (id === 'ex03' || id === 'ex04') {
      mine = Sprite.create(pack, 'mine');
      if (id === 'ex04') { mine.ps(400, 300); mine.fetch('resource').frame = 70; }
      this.objects.push(mine);
    } else if (id === 'ex05' || id === 'ex06') {
      const gun = cannon();
      turret = gun.fetch('turret');
      this.objects.push(gun);
      if (id === 'ex05') {
        anchor = turret.fetch('anchor'); anchor.visible = true;
        label = Sprite.label({ width: 160, height: 100, size: 30, text: 'Hello', color: 0xffffffff });
      } else {
        proxy = Sprite.proxy();
        proxy.mount('proxy', turret);
        gun.mount('turret', proxy);
        const gun2 = cannon().ps(100, 0);
        gun2.mount('turret', proxy);
        this.objects.push(gun2);
      }
    } else if (id === 'matrix') {
      for (let i = 0; i < 4; i++) this.objects.push(Sprite.create(pack, 25));
    } else if (id === 'color') {
      for (let i = 0; i < 4; i++) this.objects.push(cannon().ps(-300 + i * 200, 0));
    }
    this.turret = turret; this.mine = mine; this.anchor = anchor; this.label = label; this.proxy = proxy;
  }

  srt(options: SceneOptions): Srt {
    if (this.id === 'ex04') return { scale: options.zoom, rot: options.rotation };
    if (this.id === 'ex03') return { x: 512, y: 360, scale: options.zoom, rot: options.rotation };
    return { x: 512, y: 384, scale: options.zoom, rot: options.rotation };
  }
  update() {
    this.frame++;
    if (this.turret) this.turret.frame += this.id === 'ex01' ? 3 : 1;
    if (this.mine && this.id !== 'ex03') this.mine.frame++;
    if (this.id === 'color') for (const sprite of this.objects) sprite.fetch('turret').frame++;
  }
  seek(frame: number) {
    this.frame = frame;
    if (this.turret) this.turret.frame = frame;
    if (this.mine) this.mine.frame = frame;
    if (this.id === 'color') for (const sprite of this.objects) sprite.fetch('turret').frame = frame;
  }
  draw(renderer: Renderer, options: SceneOptions) {
    const srt = this.srt(options);
    renderer.begin(0xff808080);
    if (this.id === 'ex02') {
      const picture = this.pack.get(25);
      if (picture.type !== 'picture') throw new Error('Sample id=25 must be a picture');
      renderer.picture(this.pack, picture, Matrix.fromSrt(srt), 0xffffffff, 0, 'normal');
    }
    if (this.id === 'ex01' && this.mine) {
      const box = this.mine.aabb(srt);
      this.mine.fetch('label').text = `AABB\n${Math.trunc(box[2] - box[0])} x ${Math.trunc(box[3] - box[1])}`;
    }
    if (this.id === 'ex03' && this.mine) this.mine.fetch('label').text = options.text;
    if (this.id === 'ex04' && this.mine) {
      this.mine.fetch('label').text = this.status === 'Ready' ? 'The quick brown fox jumps over the lazy dog' : this.status;
    }
    if (this.id === 'ex05' && this.turret && this.anchor && this.label) {
      this.label.text = options.text;
      if (options.mounted !== this.wasMounted) {
        this.turret.mount('anchor', options.mounted ? this.label : this.anchor);
        this.label.matrix = new Matrix();
        this.wasMounted = options.mounted;
      }
    }
    for (const [i, sprite] of this.objects.entries()) {
      sprite.color = ((Math.round(options.alpha * 255) << 24) | 0xffffff) >>> 0;
      sprite.additive = options.additive;
      if (this.id === 'matrix') {
        sprite.matrix = Matrix.fromSrt({ x: -300 + i * 200, sx: i === 3 ? -1.2 : 1, sy: i === 1 ? 1.5 : 1,
          rot: i === 2 ? this.frame * 2 : 0 });
      }
      if (this.id === 'color') {
        const colors = [0xffffffff, 0xffffa66c, 0x80ffffff, 0xffffffff];
        sprite.color = colorMul(sprite.color, colors[i]);
        sprite.additive = colorAdd(sprite.additive, i === 3 ? 0x00402c00 : 0);
      }
      sprite.draw(renderer, srt);
      if (options.bounds) renderer.outline(sprite.aabb(srt));
    }
    if (this.id === 'ex05' && this.label && this.anchor && !options.mounted) {
      this.label.matrix = this.anchor.worldMatrix;
      this.label.draw(renderer);
    }
    renderer.end();
  }
  touch(phase: TouchPhase, x: number, y: number, options: SceneOptions) {
    if (phase !== 'END') return;
    let hit: Sprite | null = null;
    for (let i = this.objects.length - 1; i >= 0; i--) {
      hit = this.objects[i].test(x, y, this.srt(options));
      if (hit) break;
    }
    this.status = hit ? hit.name ?? `${hit.type} #${hit.id}` : 'Not Hit';
    if (this.id === 'ex04' && hit) {
      if (hit.name === 'label') this.status = 'label touched';
      if (hit.name === 'panel') {
        hit.scissor = !hit.scissor;
        this.status = hit.scissor ? 'Set scissor' : 'Clear scissor';
      }
    }
  }
}
