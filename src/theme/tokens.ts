/**
 * Mira Mobile Design Tokens
 *
 * Claude + OpenAI inspired design language.
 * - Clean, minimal, document-like chat (no bubbles)
 * - Coral clay (#cc785c) as single brand accent
 * - Comfortable typography with generous line-height
 * - Hierarchy through spacing and color contrast
 */

// ─── Brand & Text ──────────────────────────────────────────
export const colors = {
  /** 唯一品牌强调色 — 按钮 / CTA / 徽标 */
  primary: '#cc785c',
  /** 按钮按下态 */
  primaryActive: '#a9583e',
  /** 禁用态背景 */
  primaryDisabled: '#e6dfd8',

  // Text color ramp
  text: {
    /** 标题 / 高对比正文 */
    ink: '#141413',
    /** 正文段落 */
    base: '#3d3d3a',
    /** 加粗正文 / 强调句 */
    strong: '#252523',
    /** 次要文字 */
    muted: '#6c6a64',
    /** 占位符 / 三级文字 */
    soft: '#8e8b82',
    /** deprecated alias — maps to muted */
    secondary: '#6c6a64',
    /** deprecated alias — maps to soft */
    tertiary: '#8e8b82',
    placeholder: '#8e8b82',
  },

  // ─── Surfaces ──────────────────────────────────────────
  bg: {
    /** 页面主底色 — 暖调米白 */
    canvas: '#faf9f5',
    /** alias for canvas (backwards compat) */
    base: '#faf9f5',
    /** 轻微区隔的分区底色 */
    soft: '#f5f0e8',
    /** 卡片背景（比画布更深一级） */
    card: '#efe9de',
    /** 强调型米色区块 */
    creamStrong: '#e8e0d2',
    /** 输入框底色 */
    input: '#f5f0e8',
    /** 用户消息底色 */
    bubble: '#efe9de',
    /** deprecated alias */
    subtle: '#f5f0e8',
  },

  // ─── Dark Surfaces ──────────────────────────────────────
  // 深色只用于页脚、少数 CTA、产品截图模块，不作为页面主基调
  dark: {
    /** 深色板块底色 / 页脚 */
    surface: '#181715',
    /** 深色内嵌卡片 / 状态栏 */
    elevated: '#252320',
    /** 深色次级分区 */
    soft: '#1f1e1b',
    /** 深色背景上的主文字 */
    onDark: '#faf9f5',
    /** 深色背景上的次要文字 */
    onDarkSoft: '#a09d96',
  },

  /** 珊瑚色按钮上的文字 */
  onPrimary: '#faf9f5',

  // ─── Borders ────────────────────────────────────────────
  border: {
    /** 卡片细边框 */
    default: '#e8e6dc',
    /** 更轻的分隔线 */
    soft: '#f0eee6',
    /** deprecated alias */
    light: '#f0eee6',
  },

  // ─── Accents & Status ───────────────────────────────────
  accent: {
    /** 代码高亮 / 图表点缀 */
    teal: '#5db8a6',
    /** 代码高亮 / 图表点缀 */
    amber: '#e8a55a',
  },

  status: {
    /** 成功状态 */
    success: '#5db872',
    /** 警告状态 */
    warning: '#d4a017',
    /** 错误状态 */
    error: '#c64545',
    /** 错误状态浅色背景（失败气泡 / 按下态） */
    errorBg: '#fce8e8',
  },

  // ─── Deprecated aliases (backwards compat) ─────────────
  primaryDark: '#a95034',
  success: '#5db872',
  warning: '#d4a017',
  danger: '#c64545',
  dangerLight: '#e8a55a',
  muted: '#5e5d59',

  hint: {
    bg: '#e8e6dc',
    text: '#a95034',
  },

  banner: {
    bg: '#e8e6dc',
    text: '#5e5d59',
  },
} as const;

// ─── Radius ────────────────────────────────────────────────
export const radius = {
  /** 按钮圆角 */
  sm: 8,
  /** 卡片圆角 */
  md: 12,
  /** 大卡片圆角 */
  lg: 16,
  /** 更大圆角 */
  xl: 20,
  /** 全圆角 (pill / 徽标 / 标签) */
  full: 9999,
} as const;

// ─── Spacing ───────────────────────────────────────────────
// Claude/OpenAI 风格：宽松间距，呼吸感
export const spacing = {
  /** 4px — 微间距 */
  xxs: 4,
  /** 8px — 内边距 */
  xs: 8,
  /** 12px — 紧凑间距 */
  sm: 12,
  /** 16px — 组件间距 */
  md: 16,
  /** 20px — 段间距 */
  lg: 20,
  /** 24px — 消息间距 */
  xl: 24,
  /** 32px — 卡片内边距 */
  '2xl': 32,
  /** 48px — 板块间距 */
  '3xl': 48,
  /** 96px — 主要板块垂直间距 */
  section: 96,
} as const;

// ─── Typography ────────────────────────────────────────────
// Claude/OpenAI 风格：舒适行距、克制字距、清晰层级
export const fontSize = {
  /** 展示级 — 40px */
  displayLg: 40,
  /** 区块标题 — 28px */
  displaySm: 28,
  /** 卡片大标题 — 24px */
  titleXl: 24,
  /** 卡片标题 — 20px */
  titleLg: 20,
  /** 组件标题 — 17px */
  titleMd: 17,
  /** 正文段落 — 15px */
  bodyMd: 15,
  /** 小号正文 — 14px */
  bodySm: 14,
  /** 按钮文字 — 14px */
  button: 14,
  /** 小号标签 — 13px */
  caption: 13,
  /** 代码块 — 14px */
  code: 14,

  // Backwards-compatible aliases
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 16,
  xl: 17,
  '2xl': 18,
  '3xl': 20,
  '4xl': 28,
} as const;

export const lineHeight = {
  /** 正文段落 — 舒适阅读 */
  body: 1.7,
  /** 标题行高 */
  title: 1.4,
  /** 紧凑行高（代码块、标签） */
  tight: 1.3,
  /** 展示级 — 宽松 */
  display: 1.2,
} as const;

export const letterSpacing = {
  /** 展示级 */
  display: -0.5,
  /** 大标题 */
  title: -0.2,
  /** 正文 */
  body: 0,
  /** 小号文字 */
  small: 0.2,
  /** 大写标签 */
  uppercase: 1.0,
  /** 默认 */
  default: 0,
} as const;

// ─── Component Sizing ──────────────────────────────────────
export const sizing = {
  /** 按钮统一高度 */
  buttonHeight: 40,
  /** 圆形图标按钮 */
  iconButton: 44,
  /** 最小触控区域 */
  touchTarget: 44,
} as const;

// ─── Shadows ───────────────────────────────────────────────
// 设计系统哲学：色块优先，阴影罕见
// 浅色卡片 = 细边框 + 大圆角，零阴影
// 深色卡片 = 靠色块对比制造层次，而非投影
export const shadows = {
  // FAB 保留极轻阴影作为浮动元素的最小深度提示
  fab: {
    shadowColor: '#c96442',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  composer: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
} as const;
