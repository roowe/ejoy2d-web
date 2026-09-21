# ejoy2d-web WebGL2 MVP 开发计划

> 目标：把 cloudwu/ejoy2d（C + OpenGL ES 2.0 + Lua）的核心 2D 引擎能力，用 **TypeScript + WebGL2** 重写一个**可运行的最小版本（MVP）**，用于学习游戏引擎开发。
> 定位：**学习项目，不是生产级引擎**。优先保证架构忠实、代码可读、能与原版示例逐帧对照，不追求性能、兼容性和功能完备。
> 参考源码：`F:\github\ejoy2d`（下文路径均相对于该目录）。

---

## 1. 目标与非目标

### 1.1 MVP 要达成的目标

做完后，应当能用浏览器**复刻原版 `examples/ex01.lua` ~ `ex05.lua` 的核心效果**：

1. 加载图元资源包（sprite package）和贴图；
2. 从资源包构造 sprite（图片 / 骨骼式层级动画 / 文本 / 裁剪面板）；
3. sprite 树的运行时变换（位移、缩放、旋转、颜色、透明度、加色）；
4. 帧动画播放、动作（action）切换、命名挂点（anchor）、动态挂载（mount）；
5. 画家算法递归渲染，同纹理自动合批（batching）；
6. 固定步长逻辑帧 + rAF 渲染帧的主循环；
7. 鼠标/触摸命中测试（`test`）、轴对齐包围盒（`aabb`）、矩形裁剪（scissor）；
8. 位图字体文本（label，简化版）；
9. 可选进阶：自定义 shader（对照 ex08）、粒子（对照 ex03）。

### 1.2 明确不做（非目标）

| 功能 | 原版位置 | 不做的原因 / 后续 |
| --- | --- | --- |
| Lua 脚本运行时 | `lua/` | 游戏逻辑直接用 TS 写；只解析资源数据，不跑 Lua VM |
| FreeType 矢量字体、描边 SDF | `lib/dfont.c` `lib/label.c` | MVP 用 Canvas 动态位图字库替代 |
| 富文本 `#[color]` 标签 | `ejoy2d/richtext.lua` | 后期可选，先支持纯色单行/多行文本 |
| RenderTarget / 截图 | `lib/screenshot.c` `texture_new_rt` | 与核心渲染学习无关 |
| 压缩纹理 PVR/ETC、RGBA4/RGB565 | `lib/texture.c` | Web 端直接用 RGBA8 |
| renderbuffer 静态合批 | `lib/renderbuffer.c` | 进阶练习（ex07），MVP 只做动态合批 |
| geometry 调试图元（线/框/多边形） | `lib/lgeometry.c`（ex09） | 进阶练习 |
| 手势识别、iOS/Mac/Win32 窗口层 | `ios/ mac/ posix/ msvc/` | 浏览器只做 pointer 事件 |
| 二进制 `.raw` 包导出/导入 | `spritepack.export/import` | Web 端直接用 JSON，无需二进制打包 |
| 多纹理通道、mask blend shader | `shader.lua` BLEND | 进阶练习 |

### 1.3 判断完成的标准（DoD）

- `npm run dev` 启动后，页面依次演示：清屏 → 单张贴图四边形 → cannon/mine 动画播放与变换 → 点击命中与裁剪 → 文本；
- 每个里程碑都有**对照原版示例的验收截图/行为清单**；
- 矩阵、颜色运算、资源解析、帧传播与命中规则有单元测试，测试数据取自原版 C 代码、示例资源及第 8 节的回归用例；浮点计算与原版定点结果的比较需注明误差容限；
- 代码中每个模块顶部注释标明对应的原版源文件，方便对照学习。

---

## 2. 原生 ejoy2d 架构速览（源码地图）

动手前必须先读懂原版的分层。ejoy2d 是一个**数据驱动的层级精灵渲染器**，核心只有三件事：**资源包 → sprite 实例树 → 递归提交四边形合批渲染**。

### 2.1 分层结构

```
游戏脚本 (examples/ex01.lua)
        │  require "ejoy2d"，ej.start(game)，实现 update/drawframe/touch
        ▼
Lua 框架层 (ejoy2d/*.lua)
  init.lua            主循环回调注册（ej.start/clear/define_shader）
  simplepackage.lua   按命名规则加载资源包（? .lua + .N.ppm/.pgm）
  spritepack.lua      把 Lua 资源表打包成二进制块（类型/字节序/偏移）
  sprite.lua          sprite 对象的 Lua 包装（getter/setter、fetch、mount）
  shader.lua          内置 GLSL 程序、shader 注册、material
  matrix.lua          定点矩阵包装
  particle.lua        粒子系统的 sprite 封装
  richtext.lua        富文本排版
        ▼
C 引擎层 (lib/*.c)
  ejoy2dgame.c   主循环：固定 30Hz 逻辑帧 + drawframe；Lua 回调调度
  spritepack.c   资源二进制块的构造/解析（pack/import）
  sprite.c       ★核心：sprite 树、递归 draw/test/aabb、矩阵与颜色沿树合成
  matrix.c       3×2 仿射矩阵（1024 定点，旋转查表）
  texture.c      纹理槽位管理（MAX_TEXTURE=128）
  ppm.c          PPM(P6)/PGM(P5) 图片解析与上传
  shader.c       ★渲染：动态合批缓冲、program/material、blend 状态
  renderbuffer.c 顶点/四边形打包（MAX_COMMBINE=1024）
  render/render.c 渲染后端抽象（buffer/layout/texture/shader/uniform）
  screen.c       屏幕坐标 → NDC 变换、viewport
  scissor.c      裁剪矩形栈（最多 8 层，逐层取交集）
  particle.c     cocos2d 风格粒子模拟（重力/半径两种模式）
  label.c/dfont.c 字体图集与文本排版
        ▼
OpenGL ES 2.0（固定功能很少，核心就一个带 color/additive 属性的 shader）
```

### 2.2 关键数值约定（移植时必须保留语义）

| 约定 | 值 | 出处 | 说明 |
| --- | --- | --- | --- |
| 矩阵定点因子 | 线性分量 `1024 = 1.0` | `lib/matrix.h` `lib/sprite.c` | `m[0..3]` 使用 ×1024；平移 `m[4..5]` 使用像素 ×16；单位矩阵 `{1024,0,0,1024,0,0}` |
| 屏幕坐标定点因子 | `SCREEN_SCALE = 16` | `lib/spritepack.h` | 资源里 screen 坐标是像素 ×16 |
| 旋转角度定点 | 2048 项半圈查表，`1024 = 90°`（整圈 4096） | `lib/matrix.c icost` | `matrix.rot` 的度 → 查表索引 `deg/360*4096` |
| 颜色格式 | `0xAARRGGBB`（color）、`0x00RRGGBB`（additive） | `lib/sprite.c color_mul/color_add` | 顶点属性顺序是 RGBA |
| 默认混合 | `glBlendFunc(ONE, ONE_MINUS_SRC_ALPHA)` | `lib/shader.c` `ejoy2d/shader.lua` | shader 先让纹理 RGB 乘 `color.rgb`，再让 RGB 和 alpha 同乘 `color.a`，最后加 `additive.rgb * tex.a` |
| 每批四边形 | `MAX_COMMBINE = 1024` | `lib/renderbuffer.h` | 满 1024 个 quad 强制 flush |
| 裁剪栈深度 | `SCISSOR_MAX = 8` | `lib/scissor.c` | |
| 逻辑帧率 | `LOGIC_FRAME = 30` Hz | `lib/ejoy2dgame.c` | 累加器追帧，渲染帧跟随显示器 |
| 图元类型 | PICTURE=1 ANIMATION=2 POLYGON=3 LABEL=4 PANNEL=5 ANCHOR=6 MATRIX=7 | `lib/spritepack.h` | |
| Anchor 占位 id | `0xffff` | `lib/spritepack.h` | component 只有 name 没有 id 时即为 anchor |

### 2.3 一次 draw 的完整数据流（以 ex01 为例）

1. `simplepackage.load`：读 `sample.lua`（资源描述表）→ `spritepack.pack` 打包；读 `sample.1.ppm`（RGB）+ `sample.1.pgm`（alpha）→ 上传成第 0 号纹理；
2. `ej.sprite("sample","cannon")`：按导出名查到 id=26（animation），递归实例化整棵组件树；`turret` 有 id=19，创建时即为子 animation；无 id 的命名 component 则实例化为 anchor，之后可用 mount 替换（对照 `lib/lsprite.c newsprite/newanchor`）；
3. 每帧逻辑：`turret.frame = turret.frame + 3`，`obj2.frame = obj2.frame + 1`；后者默认向无名子 animation 传播，具名的 `resource` 保留独立设置的 frame=70；
4. `obj:draw(screencoord)` → `sprite_draw` → `draw_child` 递归：
   - 取当前 frame 中的 parts（每个 part 引用一个 component 索引，带可选 mat/color/add/touch）；
   - 沿树合成 `sprite_trans`（矩阵相乘、颜色 `color_mul`、加色 `color_add`）；
   - picture 叶子：`sprite_drawquad` 把资源里 4 个 screen 坐标（×16）用矩阵变换成顶点，`screen_trans` 转 NDC，连同 UV/颜色塞进合批缓冲；
   - 纹理/program/blend 变化或缓冲满 → `rs_commit` 上传 VBO 并提交索引三角形绘制；
5. panel 叶子开启裁剪时调用 `scissor_push`（与栈顶取交集），影响所属 animation 中后续绘制的兄弟节点及其子树；该 animation 遍历结束后，统一弹出这一层遍历所 push 的裁剪（对照 `draw_child`）；
6. label 叶子：走文字专用 shader 与字库纹理；
7. anchor：渲染后记录自己的世界矩阵（`world_matrix`），供挂点定位/粒子发射使用。

### 2.4 坐标系（最容易搞错的地方，务必先理解）

- 资源坐标：使用资源作者指定的图元局部原点，x 向右、y 向下，单位 = 像素 ×16；原点不一定在图元中心；
- 画布坐标 `srt = {x, y, sx, sy, rot}`：`x/y` 是屏幕**左上角**为原点的像素偏移，`scale`、`rot` 作用于整棵树；变换顺序固定为 **缩放 → 旋转 → 平移**（`matrix_srt`）；
- 顶点变换：行向量 `p * m`，矩阵三行依次为 `[m0,m1,0]`、`[m2,m3,0]`、`[m4,m5,1]`；节点累计矩阵按 **节点自身 × 帧 part × 父累计矩阵** 合成，最后应用 draw 的 srt；
- 原版 NDC 映射（`screen.c` + `shader.lua` 的 sprite_vs，输入仍是像素 ×16）：
  - `screen_trans`：`x' = x * 2/(16*W)`，`y' = y * -2/(16*H)`（此时左上是 (0,0)，右下是 (2,-2)）；
  - 顶点着色器：`gl_Position = position + vec4(-1, +1, 0, 0)` → 标准 NDC（左上 (-1,+1)，右下 (+1,-1)）。
- WebGL2 版运行时统一使用**逻辑像素**：资源加载时将 `screen` 与矩阵平移 `/16`，矩阵线性分量 `/1024`。CPU 端直接计算最终 NDC：`ndcX = 2*x/W - 1`、`ndcY = 1 - 2*y/H`；顶点着色器直接写 `vec4(aPosition, 0, 1)`，不再重复 `/16` 或添加 `(-1,+1)` 偏移。`W/H` 是逻辑分辨率。

---

## 3. WebGL2 版设计决策

### 3.1 技术栈

| 项 | 选择 | 理由 |
| --- | --- | --- |
| 语言 | TypeScript（`strict: true`） | 类型系统适合表达资源结构；与 C 结构体一一对应 |
| 构建 | Vite + 原生 ESM | 零配置、启动快、无框架噪声，专注引擎本身 |
| 渲染 | 裸 WebGL2（GLSL ES 3.00） | 不使用 Three.js/PixiJS，否则学不到缓冲/状态机/合批 |
| 测试 | Vitest | 矩阵/颜色/解析等纯逻辑单测 |
| 资源-贴图 | **运行时直接解析原版 PPM/PGM** | P5/P6 格式极简（约 60 行解析），是练习 `texImage2D` 数据上传的好材料；零依赖 |
| 资源-描述 | Node 转换脚本 `*.lua → *.json` | 资源表是 Lua 字面量，转换期一次性解析（可用 fengari Lua VM 或自写子集解析器），运行时只 `fetch JSON` |
| 字体 | OffscreenCanvas 位图字库 | 替代 FreeType：按需把字符绘制到一张 atlas 纹理 |
| 定点数 | **坐标与矩阵改 float（`Float32Array`/`number`）** | 加载时将 `screen` 与矩阵平移 `/16`，矩阵线性分量 `/1024`，之后统一使用逻辑像素；颜色仍按整数通道运算。在代码注释中保留原约定说明 |

> 备选方案（不推荐但要知道）：运行时解析 Lua 资源表。好处是零转换步骤，坏处是要在浏览器里维护一个 Lua 子集 parser，调试成本高，对引擎学习没有帮助。转换脚本只做一次，逻辑简单可控。

### 3.2 与原版的模块映射

| 原版 C/Lua 文件 | Web 版模块 | 核心职责 |
| --- | --- | --- |
| `lib/matrix.c` `ejoy2d/matrix.lua` | `src/core/Matrix.ts` | 3×2 矩阵：identity/mul/scale/rot/trans/srt/inverse |
| `lib/screen.c` | `src/core/Screen.ts` | 逻辑分辨率、viewport、屏幕坐标→NDC |
| `lib/texture.c` `lib/ppm.c` | `src/core/Texture.ts` `src/core/PpmLoader.ts` | 纹理槽位、PPM/PGM 解析、RGBA 合成、UV 归一化 |
| `lib/render/render.c` | `src/core/Renderer.ts` | WebGL2 上下文、program/uniform/状态封装 |
| `lib/shader.c` `ejoy2d/shader.lua` | `src/core/Shader.ts` `src/core/shaders.ts` | 内置 GLSL、program 切换、材质参数 |
| `lib/renderbuffer.c` | `src/core/BatchBuffer.ts` | 交错顶点流、quad 打包、按纹理/program 合批 flush |
| `lib/scissor.c` | `src/core/ScissorStack.ts` | 裁剪栈与交集 |
| `lib/spritepack.c` `ejoy2d/spritepack.lua` | `src/sprite/SpritePack.ts` | JSON 资源解析、类型常量、导出名字典 |
| `ejoy2d/simplepackage.lua` | `src/sprite/PackageLoader.ts` | 按规则加载 json + ppm/pgm、分配纹理 id |
| `lib/sprite.c` `ejoy2d/sprite.lua` | `src/sprite/Sprite.ts` | sprite 树、递归 draw/test/aabb、mount/fetch、属性 |
| `lib/label.c` `lib/dfont.c` | `src/text/FontAtlas.ts` `src/text/Label.ts` | 位图字库、文本排版与提交 |
| `lib/particle.c` `ejoy2d/particle.lua` | `src/fx/Particle.ts`（M8） | 粒子模拟 |
| `lib/ejoy2dgame.c` `ejoy2d/init.lua` | `src/app/Game.ts` | 固定步长主循环、生命周期回调 |
| 平台窗口层（`winfw.c` 等） | `src/app/Input.ts` | pointer 事件 → BEGIN/MOVE/END |
| —（新增） | `tools/convert-assets.mjs` | lua 资源表 → JSON |

### 3.3 目标目录结构

```
ejoy2d-web/
├─ docs/
│  └─ mvp-plan.md                # 本文档
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ public/
│  └─ assets/                    # 从原版 examples/asset 复制/转换的资源
│     ├─ sample.json             # 由 sample.lua 转换
│     ├─ sample.1.ppm            # RGB（原版原样）
│     ├─ sample.1.pgm            # alpha（原版原样）
│     ├─ birds.json / birds.1.ppm ...
│     └─ particle/
├─ tools/
│  ├─ convert-assets.mjs         # lua 表 → json（入口）
│  └─ lua-table-parse.mjs        # 资源用到的 Lua 字面量子集解析器
├─ src/
│  ├─ core/
│  │  ├─ Matrix.ts               # 定点语义 → float
│  │  ├─ Color.ts                # 0xAARRGGBB 乘加、字节打包
│  │  ├─ Screen.ts
│  │  ├─ Renderer.ts             # WebGL2 设备/状态封装
│  │  ├─ Shader.ts               # program 缓存、uniform
│  │  ├─ shaders.ts              # sprite/text/gray/color 的 GLSL ES3
│  │  ├─ Texture.ts
│  │  ├─ PpmLoader.ts            # P5/P6 ArrayBuffer 解析
│  │  ├─ BatchBuffer.ts          # 动态合批（一个大 VBO + VAO）
│  │  └─ ScissorStack.ts
│  ├─ sprite/
│  │  ├─ types.ts                # TYPE_*、资源接口定义
│  │  ├─ SpritePack.ts           # 资源包（不可变数据）
│  │  ├─ PackageLoader.ts
│  │  └─ Sprite.ts               # 运行时实例（可变）
│  ├─ text/
│  │  ├─ FontAtlas.ts            # Canvas 字符图集 + LRU
│  │  └─ Label.ts
│  ├─ fx/
│  │  └─ Particle.ts             # M8
│  ├─ app/
│  │  ├─ Game.ts                 # start(game)、主循环
│  │  └─ Input.ts
│  ├─ examples/
│  │  ├─ ex01.ts … ex05.ts       # 对照原版示例
│  │  └─ ex08.ts（M8 自定义 shader）
│  └─ main.ts                    # demo 选择入口
└─ test/
   ├─ matrix.test.ts
   ├─ color.test.ts
   ├─ spritepack.test.ts
   ├─ sprite.test.ts             # 帧传播、命中捕获、裁剪作用域与 AABB
   └─ fixtures/                  # 从 C 代码/资源中摘录的测试数据
```

---

## 4. 核心子系统设计

### 4.1 矩阵（Matrix.ts）

- 用 `class Matrix { m: Float32Array(6) }`，语义对照 `struct matrix`；行向量 `p * m`；
- 构造支持原版三种形式：`new Matrix()`、`new Matrix([...])`、`Matrix.fromSrt({sx,sy,rot,x,y,scale})`；
- `mul(other)` 严格照抄 `matrix_mul`（注意 JS 里直接浮点，不再 `/1024`）；
- `srt` 顺序：scale → rot → trans，照抄 `matrix_srt`；
- 旋转：MVP 用 `Math.cos/sin`；与 `icost` 查表值对照时，测试需注明角度量化及定点截断造成的误差容限，不要求浮点结果与查表值逐位相等；保留原版查表算法的注释；
- `inverse` 照抄 `matrix_inverse` 的三种分支（纯缩放/纯旋转/一般仿射）；
- `SpritePack` 解析时按分量归一化：`m[0..3] /= 1024`，`m[4..5] /= 16`，`screen` 的各坐标 `/= 16`。例如 `{1024,0,0,1024,-800,800}` 转成 `{1,0,0,1,-50,50}`；原版依据是 `sprite_drawquad` 在线性变换 `/1024` 后直接加平移；
- 运行时 Matrix 的平移、draw 的 srt、命中坐标和 AABB 都使用逻辑像素；label/panel 的 width/height 本来就是像素，保持不变。**纹理 src 坐标保持像素整数，按纹理宽高归一化为 0..1**（原版用 uint16 的 0..65535，Web 版直接用 float UV）；
- 必测非交换变换：子节点平移 `(10,0)`、父节点缩放 2，按 `local * parent` 得到世界平移 `(20,0)`；再覆盖父节点旋转与子节点平移的组合。

### 4.2 渲染设备与合批（Renderer / BatchBuffer / Shader）

- 初始化一个全屏 canvas；WebGL2 context：`premultipliedAlpha: true`（或关闭后自行处理，需在文档记录取舍）；
- **一个动态 VBO + 一个 VAO**，顶点布局照抄 `struct vertex`：

  | 属性 | 类型 | 含义 |
  | --- | --- | --- |
  | aPosition | `vec2 float` | CPU 端从逻辑像素计算的最终 NDC，公式见 2.4 |
  | aTexCoord | `vec2 float`（或 `usnorm2x16`） | UV |
  | aColor | `vec4 u8 normalized` | 乘色 RGBA（alpha 在 w） |
  | aAdditive | `vec4 u8 normalized` | 加色 RGB |

  MVP 的 UV 使用 float，颜色属性使用 `UNSIGNED_BYTE` normalized；
- 索引缓冲：启动时一次性生成 1024 个 quad 的索引（0,1,2,0,2,3 …），照抄 `shader_init`；
- `BatchBuffer` 接口：`addQuad(v4, color, additive)`；当 **纹理变化 / program 变化 / blend 变化 / 数量满 1024 / scissor 变化** 时 `flush()`（与 `rs_commit`、`shader_texture`、`scissor_push` 的 flush 时机一一对应）；
- 内置 shader 直接移植 `ejoy2d/shader.lua`，改成 GLSL ES 3.00 语法（`in/out`、`texture()`、`#version 300 es`）：
  - NORMAL（必做）、GRAY、COLOR（M5/M8）、TEXT（M7）；
  - sprite 片元着色器核心公式保持不变：
    `rgb = tex.rgb * color.rgb * color.a + additive.rgb * tex.a; a = tex.a * color.a;`
- 混合：`blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`，与原版一致。`sprite_fs` 先将 RGB 和 alpha 同乘 `color.a`，再加 additive，因此 additive 项不额外乘 `color.a`。PPM/PGM loader 只交织原始通道；格式本身不能说明 RGB 是否已预乘，原版资源按原样上传并配合原版公式使用；
- 验收透明度时同时覆盖白色不透明纹理上的 `color=0xffffffff`、`0x80ffffff`、`0x00ffffff` 且 `additive=0`：输出 RGB 和 alpha 应分别为 1、128/255、0。另测 additive 非零，确认加色项仍为 `additive.rgb * tex.a`。

### 4.3 纹理与 PPM 加载（Texture / PpmLoader）

- `Texture` 维护 id → `{glTex, width, height}` 的槽位表（原版上限 128，MVP 可放开但保留常量与断言）；
- PPM 解析（`PpmLoader.ts`）：
  - 读 magic：`P6` 二进制 RGB、`P5` 二进制灰度（alpha）；跳过注释行（`#`）与空白；解析 `width height maxval`；
  - `maxval=255` → 8bit；`maxval=15` → 4bit（MVP 可断言只接受 255，遇到 15 报清晰错误）；
  - 与 `ppm.c loadppm_from_file` 相同的组合规则：
    - 只有 .ppm → RGB（上传时 `internalformat=RGB8`，或扩展成 RGBA）；
    - 只有 .pgm → A8（上传 `RGBA` 时填 `(a,a,a,a)` 或按 text shader 需要处理）；
    - 两者都有 → 交织成 RGBA8（RGB 来自 ppm，A 来自 pgm）；
  - 用 `gl.texImage2D(..., gl.RGBA, gl.UNSIGNED_BYTE, pixels)` 上传；
- UV：原版 `texture_coord()` 把像素坐标映射到 [0,65535]；Web 版在 pack 解析时直接存 `u = srcX / width`。

### 4.4 资源包（SpritePack）

JSON 结构由转换脚本从 Lua 表生成，**字段名与 Lua 资源保持一致**（降低对照成本）：

```jsonc
{
  "textureCount": 1,
  "exports": { "cannon": 26, "mine": 38 },
  "objects": [
    { "type": "picture", "id": 0,
      "quads": [ { "tex": 1, "src": [8 个整数], "screen": [8 个整数] } ] },
    { "type": "animation", "id": 26, "export": "cannon",
      "components": [ { "id": 24 }, { "id": 25 }, { "id": 19, "name": "turret" } ],
      "actions": [ { "name": "", "frames": [ { "parts": [ {"index":0}, {"index":1}, {"index":2} ] } ] } ] },
    { "type": "label", "id": 39, "color": 4294967295, "align": 2, "size": 20, "width": 100, "height": 40, "noedge": false },
    { "type": "pannel", "id": 40, "width": 100, "height": 150, "scissor": false }
  ]
}
```

- 类型常量、anchor（component 无 id 有 name → 虚拟 id 0xffff）、默认 action（第一组，名字为空串）等规则全部照抄 `ejoy2d/spritepack.lua` 与 `lib/spritepack.h`；
- frame part 支持的字段：`index`（数字简写等价于 `{index=n}`）、`mat`（6 数矩阵）、`color`、`add`、`touch`；tag 压缩位（`i/M/m/c/a/t`）是二进制包优化，**JSON 版不需要**，但要在代码注释里解释原版为什么有它；
- `type="matrix"` 矩阵池：MVP 中动画 part 的 mat 都内联在 JSON 里，若资源引用了共享矩阵池（sample.lua 开头的 matrix 块），转换脚本负责把它解析成数组，运行时按索引取用（对照 `TYPE_MATRIX` 的处理，别直接丢弃）；
- Pack 对象**不可变**，可被多个 sprite 实例共享（对应原版一个 `sprite_pack*` 被多实例引用）。

### 4.5 Sprite 运行时树（Sprite.ts）—— 本项目的学习重心

逐字段对照 `struct sprite`：

```ts
class Sprite {
  pack: SpritePack;
  type: number; id: number;
  parent: Sprite | null;
  name: string | null;
  // 运行时变换（对应 struct sprite_trans t）
  matrix: Matrix; color: number; additive: number; program: number;
  frame: number; visible: boolean; message: boolean;
  // animation 专用
  private children: (Sprite | null)[];   // 按 component 槽位
  private startFrame: number; totalFrame: number;
  // 叶子数据：解析后的 picture/label/panel 引用（不可变，来自 pack）
  // anchor 专用：worldMatrix
}
```

必须实现的 API（命名向 Lua 版靠拢，用 TS 习惯）：

- 静态 `Sprite.create(packName, nameOrId)`；`sprite.proxy()`（M5）、`sprite.label(opts)`（M7）；
- `draw(srt?)`：递归入口，对应 `sprite_draw`；
- `ps(x?, y?, scale?)`、`sr(sx?, sy?, rot?)`：参数省略语义照抄文档（只传一个参数时表示 scale / rot）；
- getter/setter：`frame`、`frameCount`、`action`（切换动作并重置 frame=0）、`visible`、`message`、`color`、`additive`、`text`、`program`、`scissor`、`worldMatrix`；
- `frame` setter 对照 `lib/lsprite.c lsetframe` → `lib/sprite.c sprite_setframe/propagate_frame`：保存未取模的帧号，默认递归传给**无名子 animation**，具名子 animation 独立控制，anchor 槽位挂载的 animation 默认也不继承。取当前帧时才按各节点的 action 长度循环，并正确处理负帧号；MVP 不暴露强制继承开关或 `recursion_frame`。必须验证 `mine.frame++` 推进无名子动画 id=33，同时 `mine.resource.frame` 保持 70；
- `fetch(name)` / `mount(name, child)` / `child.name` 语法糖（TS 用 `getChild(name)`，也可包 Proxy 实现属性访问，作为可选练习）；
- `test(x, y, srt?)`：逆矩阵把逻辑像素坐标变换到图元本地坐标，再做 AABB 包含测试；不可见节点跳过，不可逆矩阵视为未命中。返回规则对照 `test_animation/test_child/check_child/sprite_test`，区分几何命中与消息捕获（详见下文）；
- `aabb(srt?)`：按当前帧递归收集可见图元角点的 min/max，包含 label/panel 的尺寸；对照 `child_aabb` 保留 panel 的特殊规则：遇到开启裁剪的 panel，计入它的矩形后停止收集该 animation 的后续兄弟节点。返回单位为逻辑像素；
- 递归渲染中**严格照抄的三条合成规则**：
  1. 矩阵：子累计矩阵 = **节点自身矩阵 × 帧 part 矩阵 × 父累计矩阵**（对照 `sprite_trans_mul/2`）；叶子输出时再应用 draw 的 srt；
  2. color：父为白色直接继承，否则 `color_mul`（各通道相乘 /255）；
  3. additive：父为 0 直接继承，否则 `color_add`（RGB 相加钳制 255）；
- panel：它是叶子节点。开启裁剪时，将四角变换后的 AABB 与栈顶取交集并 push；**保留裁剪直到所属 animation 遍历结束**，影响其后续兄弟节点及其子树。每次 animation 遍历记录本层 push 数并在结束时配对 pop；嵌套 animation 退出后恢复外层裁剪。push/pop 改变 scissor 状态前都要 flush。`mine` 的 panel、图片和 label 是兄弟节点，可直接用于验收这一作用域；
- anchor：默认不可见；可见时在 draw 中由 `anchor_update` 写入 `worldMatrix`，包括节点自身、帧 part、父累计矩阵及 draw 的 srt；因此 ex05 将该矩阵赋给独立 label 后，调用 `label.draw()` 即可；
- 叶子 picture 提交：`sprite_drawquad` 的顶点公式逐行翻译：
  `vx = (sx*m0 + sy*m2) + m4; vy = (sx*m1 + sy*m3) + m5`（浮点版去掉 /1024），再走 screen → NDC。

命中捕获与裁剪遵循以下规则：

1. 创建子节点时，按初始帧 part 的 `touch` 初始化 `message`，对照 `lib/lsprite.c update_message`；之后可通过 `message` setter 修改。将 anchor 替换为其他 sprite 时，继承该 anchor 的 message 状态（`sprite_mount`）。
2. 动画按绘制逆序搜索。普通 picture 即使几何命中，若 `message=false`，也只记录候选并继续寻找可捕获的节点；例如它不能阻止后面的可捕获 panel 接收点击。
3. 若子树只有几何命中而没有节点捕获，由 `message=true` 的祖先接收；若整棵树仍只有几何命中，`sprite_test` 返回测试入口 sprite。完全未命中则返回 `null`。
4. `test_animation` 按 panel 划定的兄弟节点区段检查裁剪，先测试控制该区段的 panel；点在裁剪外时跳过对应区段，继续检查此前不受该 panel 影响的节点。嵌套区段仍遵循各自的裁剪作用域。

### 4.6 文本（M7，简化策略）

- `FontAtlas`：一张懒加载的 2D canvas 纹理（如 512×512），按 `(文本,字号,颜色无关)` 缓存字符 quad（x/y/w/h/uv）；装满后简单地换页/扩容（MVP 甚至可以每段文本一张缓存纹理，实现最简）；
- `Label` 对应 `pack_label`：width/height/size/align/color；排版只做：换行（按 width 折行）、水平对齐（align 0/1/2）；
- 渲染走 TEXT shader（移植 `text_fs`：从纹理 alpha 生成覆盖率）或 MVP 简化为普通 NORMAL shader 直接画 Canvas 纹理（在文档注明这是简化）；
- `sprite.text = str` 时重建网格；`\n` 多行（ex01 用到了 `"AABB\n%d x %d"`）。

### 4.7 主循环与输入（Game / Input）

- `Game.start({ update, drawFrame, touch })`，对照 `ejoy2d.start`；
- 固定步长累加器（照抄 `ejoy2d_game_update`）：
  `realTime += dt; while (logicTime < realTime) { update(); logicTime += 1/30; }`，然后每 rAF 一次 `drawFrame()` 并在末尾 `flush()`；
- 暴露 `clear(0xAARRGGBB)`；
- Input：pointerdown/move/up → `touch("BEGIN"|"MOVE"|"END", x, y)`，坐标换算到逻辑分辨率（考虑 canvas CSS 尺寸与 backing store 的 scale）；
- 画布 srt 与原版一致：`draw(obj, {x,y,scale,sx,sy,rot})`。

### 4.8 资源转换脚本（tools/convert-assets.mjs）

- 输入：原版 `examples/asset/*.lua`；输出：`public/assets/*.json`；
- 解析方式二选一（实现时决定，记录在脚本头注释）：
  1. 自写"Lua 表构造器子集"词法/语法分析：只需支持 `return {…}`、`key=value`、数组项、数字（含负号/小数/十六进制 `0xff`）、单双引号字符串、`true/false/nil`、注释 `--`；
  2. 引入 `fengari`（JS 版 Lua VM）直接 `loadfile` 后把返回表递归转 JS 对象（最稳，devDependency 仅此一个）；
- 数值归一化在**运行时**做而不是转换时做（JSON 保留原始整数），让数据与原版资源逐字节可对照；
- PPM/PGM 原样复制到 public，不做格式转换；
- 脚本同时输出一份转换报告（对象数、各类型数量、导出表），用于人工核对。

---

## 5. 里程碑（建议顺序，每个都可独立验收）

> 节奏建议：每个里程碑先读对应 C 源码 → 移植 → 跑通验收 → 写一段"与原版差异"笔记。

### M0 工程骨架与清屏（半天）

- 任务：Vite+TS 工程；canvas 全屏；`Renderer` 初始化 WebGL2；`Game.start` 空循环；`clear(0xff808080)`；
- 验收：页面显示灰色清屏（与 ex01 的清屏色一致）；控制台打印 WebGL2 信息与 FPS。

### M1 贴图四边形 + 底层 draw（1 天）

- 对照：`examples/ex02.lua`、`lib/ppm.c`、`lib/shader.c`、`ejoy2d/shader.lua`；
- 任务：PpmLoader 加载 `sample.1.ppm/.pgm` 并上传；NORMAL shader；手写 8 个纹理坐标 + 8 个屏幕坐标（直接抄 ex02 的数字）画出一个四边形；
- 验收：画面与 ex02 同样位置显示贴图块；UV 方向正确（y 不翻转错误）；alpha 边缘正常。

### M2 矩阵与坐标系（1 天）

- 对照：`lib/matrix.c`、`lib/screen.c`、`ejoy2d/matrix.lua`；
- 任务：Matrix 全部方法；从逻辑像素到 NDC 的 Screen 映射；矩阵单测覆盖单位矩阵、mul、srt 复合、inverse 与非交换变换，查表对照按 4.1 注明误差容限；
- 验收：单测全绿；原始矩阵 `{1024,0,0,1024,-800,800}` 的平移换算为 `(-50,50)`；局部平移 10 再经父级缩放 2 得到世界平移 20；画布 `(0,0)`、`(W,H)` 分别映射到 NDC `(-1,+1)`、`(+1,-1)`；用 Matrix 将 M1 四边形平移、缩放、旋转、镜像，结果与原版语义一致。资源加载接入后在 M3 重用换算用例。

### M3 资源包与 picture（1~2 天）

- 对照：`ejoy2d/spritepack.lua`、`lib/spritepack.c/.h`、`tools/`；
- 任务：转换脚本跑通 sample.lua → sample.json；SpritePack 解析；PackageLoader 加载 json+ppm 并分配纹理 id；Sprite 能创建 picture 类型并画出（id=0 之类单图）；
- 验收：能按 id 画出 sample 包中任意 picture，位置/UV 与原版资源一致。

### M4 动画树、帧与挂载（2~3 天，核心）

- 对照：`lib/sprite.c`（`draw_child/get_frame/sprite_setframe/propagate_frame/sprite_mount`）、`lib/lsprite.c`（`newsprite/update_message/lsetframe`）、`ejoy2d/sprite.lua`；
- 任务：animation 递归实例化；默认 action、动作切换与 frame 循环；默认帧传播；fetch/mount（含已实例化的 `turret`）；anchor；part 的 mat/color/add/touch；矩阵与颜色沿树合成。为 `mine` 创建 label/panel 运行时节点并保存尺寸、message 等元数据；文本绘制在 M7 实现，panel 裁剪在 M6 实现；
- 验收：`sprite("sample","cannon")` 正确显示三层组合结构；手动推进 `turret.frame` 炮管旋转；`fetch("turret")` 可拿到子节点；`mine.frame++` 推进无名子动画 id=33，具名 `resource.frame=70` 保持不变；更换 action 后 frame 归零，正负帧号均正确循环。

### M5 动态合批、变换与多实例（1~2 天）

- 对照：`lib/renderbuffer.c`、`lib/shader.c`（flush 时机）、ex01、ex06；
- 任务：BatchBuffer 的纹理/program/blend 切换、容量满与帧末 flush；`ps/sr`；多 sprite 实例、proxy 多重挂载（ex06）；color 半透明、additive；DOM HUD 显示 drawcall 数。scissor 切换的 flush 随 M6 接入；
- 验收：复刻 ex01 的**图形与动画部分**（cannon + mine、`obj:ps(-100,0,0.5)`、`obj2.resource.frame=70`），label 保留元数据并暂不绘制；文本与 AABB 展示在 M7 集成。同纹理、同 program/blend、无裁剪且不足 1024 个 quad 的连续提交，在帧末合为 1 次 drawcall；按 4.2 验证透明度及 additive；ex06 的共享 proxy 同时出现在两个父节点下。

### M6 输入、命中测试、裁剪（1~2 天）

- 对照：`sprite_test/test_animation/test_child/check_child/sprite_aabb/child_aabb`、`lib/scissor.c`、ex04；
- 任务：Input 与 touch 回调；`test` 的逆序遍历、逆矩阵 AABB、message 捕获与裁剪区段规则；`aabb`；panel 裁剪作用域、嵌套交集及 scissor 切换前 flush；
- 验收：用 DOM 状态栏显示命中节点名或 Not Hit，label 通过已有尺寸元数据参与测试；点击被普通 picture 覆盖的可捕获 panel 仍能切换裁剪。裁剪影响后续兄弟节点，所属 animation 退出后恢复，嵌套裁剪取交集；裁剪外的受控图元不可命中。对固定资源、帧号和 srt 记录原版 AABB 数值并按注明的浮点容差比较，覆盖裁剪开关两种状态。原版 ex04 的 sprite 文本反馈留到 M7 验收。

### M7 文本（1~2 天）

- 对照：`lib/label.c`、`lib/dfont.c`、`ejoy2d/richtext.lua`、ex01/ex03/ex04/ex05；
- 任务：FontAtlas 懒加载；Label 排版与 text setter；多行与对齐；ex05 的独立 label 读取 anchor.worldMatrix，并验证将 label 直接 mount 到 anchor 槽位的替代用法；集成 M5/M6 的文本反馈；
- 验收：完成 ex01 的图形、动画和 AABB 多行文本；ex03 的 mine 显示 "Hello World"（粒子仍属 M8c）；ex04 点击 label/panel 后由 sprite label 显示对应反馈或 Not Hit，初始富文本改成纯文本；ex05 的挂点文本跟随炮管，包含 draw 的 srt 变换。字体外观按 Canvas 简化方案记录差异。

### M8 进阶专题（每个 0.5~2 天，按需选做）

- M8a 自定义 shader：shader 注册表 + uniform/material，复刻 ex08（红色加色 shader）；移植 GRAY/COLOR 内置程序；
- M8b polygon 类型：扇形拆 quad（`shader_drawpolygon`），资源解析 polygon；
- M8c 粒子：移植 `lib/particle.c`（重力模式优先）+ particle 配置 JSON，复刻 ex03 的 fire；
- M8d renderbuffer 静态合批：ex07（100 只鸟一次上传）；
- M8b'/M8e geometry 调试绘制与 ex09；
- M8f 直接在浏览器解析原版 Lua 资源（去掉转换步骤）；
- M8g PNG 纹理加载（ImageBitmap），作为 Texture 的第二种 loader，体会原版"可插拔纹理格式"的设计。

---

## 6. 建议的源码阅读顺序

1. `doc/apicn.md`（API 全貌，注意文件是 UTF-8）→ 跑一遍原版 ex01~ex09，建立直观印象；
2. `examples/ex01.lua` + `examples/asset/sample.lua`（头尾各看一部分）→ 理解资源长什么样；
3. `ejoy2d/simplepackage.lua` → `ejoy2d/spritepack.lua` → `lib/spritepack.h`（数据结构）；
4. `lib/matrix.h/.c` → `lib/screen.c`（坐标与数学）；
5. `ejoy2d/shader.lua`（GLSL）→ `lib/shader.c`（合批）→ `lib/renderbuffer.c/.h`（顶点）；
6. `lib/sprite.c` 按本文件 2.3 的数据流读：`sprite_drawquad → draw_child → sprite_draw`，再读 mount/test/aabb；
7. `lib/ejoy2dgame.c`（主循环）→ `lib/ppm.c`（最简单的 C 模块，适合第一个移植）；
8. 最后：`lib/scissor.c`、`lib/label.c`、`lib/particle.c`。

---

## 7. 风险与对策

| 风险 | 现象/后果 | 对策 |
| --- | --- | --- |
| UV / 坐标朝向错误 | 图片上下颠倒、镜像 | M1 就用 ex02 的精确数值验收；记住 WebGL 纹理左下角为 (0,0) 而 PPM 像素从上到下存储，上传时注意行序（必要时 `UNPACK_FLIP_Y_WEBGL`，但优先在 UV 上处理并记录原因） |
| 坐标单位与矩阵顺序混淆 | 挂点偏移、图形缩小或层级变换错误 | 按分量归一化，运行时统一用像素；M2/M3 验证平移 `/16`、`local * part * parent` 与 NDC 端点；查表对照注明容差 |
| 颜色通道顺序错 | 颜色/透明度异常 | 统一在 Color.ts 中处理 `0xAARRGGBB`，顶点 RGBA 顺序照抄 `renderbuffer_add`，单测覆盖 |
| shader 漏乘透明度 | 降低 alpha 后图形仍发亮 | 按 4.2 保留 RGB 的 `color.a` 因子，分别验证透明度和 additive |
| 帧传播或命中捕获被简化 | mine 内部动画停住、resource 帧被覆盖、panel 点不到 | M4 验证无名/具名子动画；M6 区分几何命中与 message 捕获，并覆盖裁剪区段 |
| 合批 flush 时机遗漏 | scissor/纹理切换时画面串台 | 把所有原版调用 `shader_flush/rs_commit` 的位置列成清单逐一对照 |
| panel 裁剪提前 pop | 后续兄弟节点未被裁剪 | push 后持续到所属 animation 结束；M6 验证嵌套交集与外层状态恢复 |
| Lua 资源解析踩坑 | 转换脚本卡住 | 直接用 fengari，不手写 parser；转换脚本不属于引擎本体 |
| 一上来贪多 | 粒子/字体/shader 同时开工导致烂尾 | 按里程碑顺序推进；M5 跑通 ex01 图形与动画部分，M6 用 DOM 验证交互，M7 集成文本 |
| "顺手优化"偏离原版 | 后续无法对照源码 | 所有简化/偏离必须在模块头注释与本文档登记 |

---

## 8. 验收用例与原版对照清单

| 里程碑 | 原版示例 | 关键行为 |
| --- | --- | --- |
| M0 | ex01 清屏 | 灰底 `0xff808080` |
| M1 | ex02 | 单四边形，ex02 中硬编码的坐标 |
| M2/M3 | matrix/screen 源码、sample 资源 | 分量归一化、非交换变换、NDC 端点；M3 验证资源加载接入 |
| M4 | ex01 部分 | cannon 层级与帧动画、mine 无名子动画传播、resource 独立帧 |
| M5 | ex01 图形与动画部分、ex06 | 双 sprite、缩放定位、proxy 多挂载、透明度与 additive、drawcall 合批 |
| M6 | ex04 交互与裁剪部分 | DOM 状态栏显示命中/Not Hit；message 捕获、兄弟节点裁剪、嵌套恢复、AABB |
| M7 | ex01、ex03 文本、ex04 纯文本交互、ex05 | 集成 AABB 多行文本、Hello World、点击后的 sprite 文本反馈、挂点跟随 |
| M8a | ex08 | 自定义 EXAMPLE shader、material uniform |
| M8c | ex03 | fire 粒子 |
| M8d | ex07 | renderbuffer 100 鸟静态合批 |
| M8e | ex09 | line/box/polygon/按钮（含中文字体） |

以下用例必须进入对应里程碑的单测或渲染验收清单。截图固定逻辑分辨率、资源、帧号和 srt；浮点与 C 定点结果的数值比较逐例注明容差，不能只检查“数量级一致”。

| 里程碑 | 回归用例 | 预期结果 |
| --- | --- | --- |
| M2/M3 | 原始矩阵 `{1024,0,0,1024,-800,800}` | 运行时矩阵 `{1,0,0,1,-50,50}`；label/panel 尺寸保持原像素值 |
| M2/M4 | 子节点平移 `(10,0)`，父节点缩放 2；另测父旋转与子平移 | 前者世界平移为 `(20,0)`；层级结果等于逐步执行局部、part、父变换 |
| M2 | 画布坐标 `(0,0)` 和 `(W,H)` | 最终 NDC 分别为 `(-1,+1)` 和 `(+1,-1)` |
| M4 | 推进 `mine.frame`，预先设置 `mine.resource.frame=70` | 无名子 animation id=33 同步推进，resource 始终保持 70 |
| M4 | 使用含两个 action 的小型 fixture，切换动作并设置正负帧号 | 切换后 frame=0；各 action 按自身长度循环，getter 保留未取模帧号 |
| M5 | 白色不透明纹理，白色乘色，alpha 为 255/128/0，additive=0 | 输出 RGB 和 alpha 同为 1、128/255、0；开启 additive 后单独核验 `additive.rgb * tex.a` |
| M6 | panel 前后各放 picture，再绘制另一棵 sprite 树；嵌套一个带 panel 的 animation | 仅各 panel 控制的后续兄弟区段被裁剪；嵌套取交集，退出后恢复外层状态，不污染另一棵树 |
| M6 | 普通 picture 覆盖可捕获 panel；另测祖先捕获、无捕获的几何命中和空白 | 分别返回 panel、可捕获祖先、测试入口 sprite、null；受裁剪区段的图元在裁剪外不可命中 |
| M6 | 同一资源、帧号和 srt 下切换 scissor | AABB 遵循 `child_aabb` 的 panel 截止规则，并与原版记录值按容差比较 |
| M7 | ex05 先绘制 cannon，再将 anchor.worldMatrix 赋给独立 label | 文本跟随炮管及 draw 的 srt；无需再次给 label 传同一 srt |

---

## 9. 第一批任务（开工 Checklist）

1. `npm init` + 安装 vite/typescript/vitest（及转换脚本用的 fengari）；
2. 按 3.3 建目录骨架，每个核心模块先建空文件并在文件头写明对应原版源文件；
3. 复制 `examples/asset/sample.*`、`birds.*`、`particle*` 到 `public/assets/`；
4. 写 `tools/convert-assets.mjs`，先只转换 sample.lua，人工核对导出表（cannon=26、mine=38）；
5. 进入 M0：让灰底画面跑起来；
6. 建 `test/matrix.test.ts`，随 M2 补齐。
