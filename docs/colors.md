# 颜色系统

## 主色调

| 名称 | 色值 | 用途 |
|-----|------|------|
| Primary | `#c96442` | 主按钮、发送按钮、强调元素 |
| Primary Dark | `#a95034` | 按下态、hover 加深 |
| Success | `#22c55e` | 已连接状态、成功提示 |
| Warning | `#f59e0b` | 连接中、重连中 |
| Danger | `#ef4444` | 错误、断开连接 |
| Danger Light | `#fca5a5` | 危险操作边框（如清除配置） |
| Muted | `#87867f` | 禁用状态、辅助信息 |

## 背景色

| 名称 | 色值 | 用途 |
|-----|------|------|
| bg-base | `#f5f4ed` | 页面主背景 |
| bg-subtle | `#e8e6dc` | 按下态、暖色分区背景 |
| bg-input | `#faf9f5` | 输入框和抬升表面 |
| bg-bubble | `#e8e6dc` | 需要区隔时的消息背景 |

## 文字色

| 名称 | 色值 | 用途 |
|-----|------|------|
| text-base | `#141413` | 主标题、正文、用户消息背景 |
| text-secondary | `#3d3d3a` | 副标题 |
| text-tertiary | `#5e5d59` | 状态文字 |
| text-muted | `#87867f` | 预览文字、辅助信息 |
| text-placeholder | `#87867f` | 输入框占位符 |

## 边框色

| 名称 | 色值 | 用途 |
|-----|------|------|
| border | `#e8e6dc` | 输入框边框 |
| border-light | `#f0eee6` | 导航栏、输入区分隔线 |

## 语义色

| 名称 | 背景 | 文字 | 用途 |
|-----|------|------|------|
| Hint | `#eef2ff` | `#4f46e5` | 提示信息框 |
| Banner | `#fef3c7` | `#92400e` | 警告横幅（未配置主机） |

## Tailwind 使用

```tsx
// 文字
<Text className="text-mira-primary">主色文字</Text>
<Text className="text-mira-text-muted">灰色文字</Text>

// 背景
<View className="bg-mira-bg-base">白色背景</View>
<View className="bg-mira-bg-subtle">浅灰背景</View>

// 边框
<View className="border border-mira-border">带边框</View>
```
