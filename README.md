# ejoy2d-web

用 TypeScript + WebGL2 重写 ejoy2d 核心 2D 能力的学习项目。已完成 [MVP 计划](docs/mvp-plan.md) 的 M0–M7，并提供 9 个交互示例。

![实验室桌面预览](docs/screenshots/lab-desktop.png)

## 运行

使用 Node.js 22.12+ 或 24+。本次验证环境为 Node.js 24.13.0。

```sh
npm ci
npm run dev
```

浏览器打开终端显示的本地地址。原版 sample 资源及转换后的 JSON 已随仓库提供，运行时不依赖原版仓库或 Lua VM。

```sh
npm run assets      # 从 assets-source/sample.lua 重新生成资源及转换报告
npm test            # 35 项逻辑测试
npm run build       # 严格类型检查 + 生产构建
npm run test:e2e    # 7 项浏览器/像素验收
npm run check       # 转换、逻辑测试、构建、浏览器验收
npm run preview     # 预览 dist 生产构建
```

浏览器测试在 Windows 默认使用本机 Microsoft Edge；其他系统使用 Playwright Chromium，首次运行先执行 `npx playwright install chromium`。可通过 `PLAYWRIGHT_CHANNEL` 指定已安装的浏览器。测试使用软件 WebGL，截图写入 `docs/screenshots/`。

## 示例与操作

| 示例 | 内容 |
| --- | --- |
| ex01 | cannon/mine 层级动画、具名子节点独立帧、AABB 多行文本 |
| ex02 | 原版硬编码四边形的贴图与 UV |
| Matrix | 平移、旋转、非均匀缩放、镜像 |
| ex03 | mine 的 Canvas 位图文本；粒子属于选做 M8 |
| ex04 | 点击 label 修改文本，点击 panel/矿场切换裁剪，空白返回 Not Hit |
| ex05 | anchor.worldMatrix 跟随；可切换为直接 mount 文字 |
| ex06 | 同一个 proxy/炮管挂载到两门炮 |
| Color | 乘色、半透明、加色和动态合批 |
| Clear | 灰色清屏与 30 Hz 固定逻辑帧 |

页面支持暂停、单步、帧拖动、缩放、旋转、透明度和 AABB 显示。逻辑画布固定为 1024×768，指针和 scissor 会换算 CSS 尺寸及设备像素密度。加上 `?demo=ex04&paused=1` 可直接进入暂停的指定示例。

控制台中的 `window.ejoy2d` 暴露真实的 `renderer`、`game`、`scene`、`options`、`select(id)` 和 `render()`，方便逐帧学习。它是本地演示的调试接口。

## 代码入口

| 路径 | 职责 |
| --- | --- |
| `src/core/` | 行向量矩阵、颜色、PPM、WebGL2 状态、纹理、合批、scissor |
| `src/sprite/` | 资源校验、包加载、Sprite 树、动作/帧、挂载、命中、AABB |
| `src/text/` | Canvas 文本布局和纹理缓存 |
| `src/app/` | 固定步长循环与 Pointer Events |
| `src/examples/scenes.ts` | ex01–ex06 的 TypeScript 对照实现 |
| `tools/convert-assets.mjs` | 用 Fengari 在转换期读取 Lua 资源，展开共享矩阵池 |
| `test/` / `e2e/` | 纯逻辑回归 / 浏览器交互与真实 GPU 像素验证 |

阅读 [实现与验收记录](docs/implementation.md) 可查看逐模块差异、测试证据与仍属 M8 的范围。

## 资源来源

`assets-source/sample.lua`、`public/assets/sample.1.ppm/.pgm` 来自 cloudwu/ejoy2d 的 `examples/asset`，遵循原项目 MIT 许可。保留原版权声明于 [assets-source/LICENSE.ejoy2d](assets-source/LICENSE.ejoy2d)。各核心模块文件头标明原版对应源文件。
