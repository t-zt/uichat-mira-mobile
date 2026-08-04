# Mira Mobile 文档

## 工程与发布

- [GitHub Actions 构建与发布](github-build-release.md)

## 当前工程主线

- [Tailscale Connectivity V1 合同](remote-access/tailscale-connectivity-v1.md)
- [Tailscale 联通工程进度](remote-access/tailscale-connectivity-progress.md)

当前由 `feature/tomz-tailscale` 接管 Mira Mobile 与 Mira Desktop Host 的 Tailscale 联通、生命周期恢复、深链配对和设备授权。主链代码已经落地，但尚未完成本地构建、自动化测试和 Android / iOS 真机验收。

## 历史工程交接

- [Trae 交接：接入 Mira Desktop Host V1](remote-access/trae-host-v1-handoff.md)

该文档保留为 Host V1 应用协议与早期施工输入。当前实际施工不再交给 Trae，进度与剩余任务以“Tailscale 联通工程进度”为准。

## 设计体系

本文档目录同时维护 `uichat-mira-mobile` 的视觉规范和设计 Token。

### 目录

- [品牌规范](branding.md)
- [设计原则](design-principles.md)
- [颜色系统](colors.md)
- [排版与字号](typography.md)
- [间距与布局](spacing.md)
- [图标规范](icons.md)
- [圆角与阴影](shape.md)
- [组件规范](components.md)
- [使用方式](usage.md)

### 快速参考

| Token 类别 | 文件 | Tailwind 前缀 |
|-----------|------|--------------|
| 颜色 | `src/theme/tokens.ts` | `text-mira-*`, `bg-mira-*` |
| 字号 | `src/theme/tokens.ts` | `text-mira-*` |
| 间距 | `src/theme/tokens.ts` | `p-mira-*`, `m-mira-*` |
| 圆角 | `src/theme/tokens.ts` | `rounded-mira-*` |
| 图标 | Lucide React Native | — |

### 主色调

**Primary**: `#c96442` (Coral clay)

用于：主按钮、发送按钮、选中状态和少量品牌强调

**Success**: `#22c55e`  
**Warning**: `#f59e0b`  
**Danger**: `#ef4444`

### 文件位置

- **Token 源码**: `src/theme/tokens.ts`
- **Tailwind 配置**: `tailwind.config.js`
- **全局样式入口**: `global.css`
