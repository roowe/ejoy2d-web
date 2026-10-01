# MVP 实现与验收记录

实现日期：2026-09-21。范围为 `mvp-plan.md` 的 M0–M7；M8 的粒子、自定义 material/uniform、polygon、静态 renderbuffer 等进阶专题未纳入本轮 MVP。

## 完成情况

| 里程碑 | 交付与验收证据 |
| --- | --- |
| M0 | Vite + strict TS、WebGL2 清屏、固定 30 Hz 逻辑循环；[截图](screenshots/clear.png) |
| M1 | P6/P5 读取、RGB/alpha 合成、NORMAL shader、原版 ex02 顶点；[截图](screenshots/ex02.png) |
| M2 | float 行向量矩阵、SRT/inverse、逻辑像素与 NDC、镜像；[截图](screenshots/matrix.png) |
| M3 | 可重复的 Lua→JSON 转换、输入校验、不可变 Pack、picture；41 个对象，cannon=26、mine=38，见 `public/assets/sample.report.json` |
| M4 | 动画树、动作切换、正负帧循环、无名子节点帧传播、具名独立帧、anchor/mount；单测覆盖实际 sample 与双 action fixture |
| M5 | 1024 quad 批次、纹理/program/blend 切换、透明度/加色、共享 proxy；[ex01](screenshots/ex01.png)、[ex06](screenshots/ex06.png) |
| M6 | Pointer Events、message 捕获、兄弟节点裁剪及嵌套恢复、AABB；[ex04](screenshots/ex04.png) |
| M7 | Canvas 文本缓存、多行/对齐、文字反馈、worldMatrix 与直接 mount 两种挂点用法；[ex03](screenshots/ex03.png)、[ex05](screenshots/ex05.png) |

## 验证方式与边界

- `npm test`：35 项测试，覆盖资源结构、真实 sample 帧传播、矩阵次序、颜色运算、PPM 首像素为空白字符、不可逆矩阵、消息捕获、裁剪作用域、挂载及循环时钟。
- `npm run build`：TypeScript 严格检查和 Vite 生产构建。
- `npm run test:e2e`：7 项 Edge/Chromium 验收，实际创建 WebGL2 上下文并读取 framebuffer；覆盖全部示例、交互、移动端布局、纹理/program/blend 状态切换、透明度、additive、嵌套与空裁剪、1025 quad 分成两批。
- ex05 在相同动画帧和旋转下，将独立 label 的 worldMatrix 绘制与直接 mount 绘制逐像素比较，输出相同。
- 截图由当前 Web 版生成；原生引擎窗口未在本次环境中运行，因此这些图片不是原生/Web 双端像素一致性的证明。原版对照依据是本地 C/Lua 实现、sample 资源和逐项行为规则。

## 与计划和原版的具体差异

| 模块 | 实际选择及原因 |
| --- | --- |
| Matrix / Screen | 运行时坐标统一为逻辑像素；线性分量 `/1024`、平移及 screen `/16`。使用 JS number，CPU 输出最终 NDC。旋转用 sin/cos；45° 对照 C 查表值 724/1024，容差为一个定点单位。一般浮点结果不承诺与原版逐位一致。 |
| Shader / Texture | 保留 NORMAL 的 RGB×color.a 及 additive×tex.a 公式；PPM/PGM 不二次预乘。Canvas 文本上传时预乘。GRAY/COLOR 内置程序已一并实现，通用自定义 shader/material 仍属于 M8。 |
| SpritePack | JSON 显式使用 objects/quads/components/actions/frames/parts 字段，将 Lua 混合表的数组部分展开；共享矩阵在转换期内联，原始数值保留至运行时归一化。Fengari 有符号颜色值转成 uint32。 |
| Sprite API | `Sprite.create(pack, nameOrId)` 显式传资源包；`sprite.draw(renderer, srt)` 显式传绘制目标，不使用隐式全局引擎。矩阵方法返回新 Matrix，ps/sr 返回当前 Sprite。 |
| 生命周期 | `Game` 用累加器以 30 Hz 更新，rAF 绘制；标签页隐藏时停止逻辑推进，恢复时丢弃积压时间；单帧追赶上限 250 ms，防止后台恢复卡住。 |
| Text | 采用计划允许的“每段文本一张 Canvas 缓存纹理”，按内容、尺寸、字号、对齐缓存，颜色由 shader 应用。帧末回收未使用的旧条目；不实现 FreeType、描边、富文本。align 保留原版 0=左、1=右、2=中。 |
| 示例 | ex01/ex02/ex04/ex05/ex06 保留核心坐标与行为；ex03 的文字演示移到当前逻辑画布中心，省略粒子。ex04 初始文字去掉富文本标记。多个 TS 示例集中于 `scenes.ts`，减少重复初始化代码。 |
| 调试 | HUD 与状态栏用 DOM；AABB 框直接复用白色纹理四边形，未引入独立 geometry 子系统。公开 `window.ejoy2d` 便于查看实际运行状态。 |
| 浏览器 | 面向支持 WebGL2 的现代浏览器；WebGL 上下文丢失后显示刷新提示，不自动恢复。关闭抗锯齿，保留绘图缓冲以便截图和逐像素验收，优先可观察性。 |

## 原版行为对照清单

- `matrix_mul` / `sprite_trans_mul`：节点自身 × 帧 part × 父累计矩阵；父缩放 2 将局部平移 10 放大到 20。
- `sprite_setframe` / `propagate_frame`：`mine.frame` 推进无名子动画 id=33，`resource.frame=70` 保持不变。
- `sprite_mount` / `lmount`：普通子节点移动时先解绑旧父节点；proxy 可多处挂载且 parent/name 为空；禁止构造环。
- `draw_child`：panel 的裁剪保留到所属 animation 遍历结束，嵌套 animation 退出后恢复外层状态。
- `test_animation` / `sprite_test`：区分几何命中与 message 捕获；前景普通 picture 不阻止可捕获 panel；无捕获的几何命中返回测试入口 sprite。
- `child_aabb`：遇到开启裁剪的 panel，计入 panel 后停止收集该 animation 后续兄弟节点。
- `anchor_update`：worldMatrix 包含 draw 的 srt；独立 label 不重复应用该 srt。
- `sprite_fs`：透明度为 128/255 的白色纹理在黑底输出 RGB=(128,128,128)；透明度为 0 且 additive 非零时，加色仍按原公式保留。

## 后续可选范围

M8a 的自定义 shader/material、M8b polygon、M8c 粒子、M8d 静态 renderbuffer、M8e geometry、M8f 浏览器 Lua 解析和 M8g PNG loader 均保持选做。原版 birds/particle 资源没有复制到 MVP，以免出现尚不可运行的示例入口。
