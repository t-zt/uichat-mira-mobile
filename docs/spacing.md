# 间距与布局

## 间距 Token

| Token | 值 | 用途 |
|-------|---|------|
| mira-xs | 4px | 图标与文字间隙、紧凑内边距 |
| mira-sm | 8px | 列表项内小间隙、按钮内边距 |
| mira-md | 12px | 标准组件间隙 |
| mira-lg | 16px | 页面边缘与消息间距 |
| mira-xl | 24px | 大模块间距 |
| mira-section | 32px | 页面分区间距 |

## 布局规范

### 页面安全区
- 顶部：使用 `SafeAreaView` 自动避让状态栏/刘海
- 底部：输入框区域需考虑 Home Indicator

### 列表项
- 高度：最小 64px（含头像 48px + 上下 12px padding）
- 分隔线：左边距 76px（头像 48 + 间距 12 + 文字起点）

### 输入框
- 最小高度：40px
- 最大高度：120px（多行输入）
- 圆角：20px

### FAB（浮动按钮）
- 尺寸：56x56px
- 位置：右下角，距边缘 20px/24px
- 阴影：紫色，偏移 0/4px，模糊 8px

## Tailwind 使用

```tsx
<View className="p-mira-xl">16px 内边距</View>
<View className="m-mira-sm">8px 外边距</View>
<View className="gap-mira-md">12px 间隙</View>
```

## 运行时引用

```ts
import { spacing } from './src/theme/tokens';

// spacing.lg === 16
// spacing.xl === 24
```
