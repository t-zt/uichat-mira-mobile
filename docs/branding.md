# UIChat Mira 品牌规范

## 品牌身份

| 项目 | 规范值 |
|------|--------|
| 应用名 | `UIChat Mira` |
| Android application ID | `io.tomz.mira.mobile` |
| iOS Bundle ID | `io.tomz.mira.mobile` |
| 配对深链 | `mira://pair` |

应用商店、系统桌面、启动页和应用内首要品牌文字统一使用 `UIChat Mira`。内部工程名和 React Native 模块名不作为用户可见品牌。

## Logo

- 品牌源图：`assets/branding/mira-logo-square.png`
- 画布比例：`1:1`
- 画布背景：`#f5f4ed`
- Logo 前景从原始图片中抠出后居中放置，不允许直接给原图补边形成可见色块。
- 不拉伸、不旋转、不改变人物、对话框、星形和轨迹之间的相对位置。
- 不单独重绘或替换 Logo 中的棕色、珊瑚色元素。
- 系统应用图标使用固定的浅色品牌画布，不随系统深色模式反转。

平台资源位置：

- Android：`android/app/src/main/res/mipmap-*/ic_launcher*.png`
- iOS：`ios/UIChatMira/Images.xcassets/AppIcon.appiconset/`

## 颜色关系

- 品牌强调色：`#c96442`
- 浅色画布：`#f5f4ed`
- 浅色抬升表面：`#faf9f5`
- 浅色主文字：`#141413`
- 深色画布：`#0f0f10`
- 深色表面：`#1c1c1e`
- 深色主文字：`#f5f5f7`

珊瑚色用于主要操作、选中状态和少量品牌强调，不作为大面积页面背景。深色模式保留独立的中性色表面层级，不能简单反转浅色颜色。

## 品牌文字

- 首次出现使用完整名称 `UIChat Mira`。
- 对话和紧凑导航中可以使用 `Mira`。
- 不使用旧大小写或模板占位名称作为用户可见名称。
