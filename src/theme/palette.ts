import { colors as designColors } from './tokens';

export type ThemePresetId = 'default' | 'knowledge-blue' | 'archive-green' | 'slate-ocean';

export interface ThemeColors {
  primary: string;
  primaryActive: string;
  primaryDisabled: string;

  text: {
    ink: string;
    base: string;
    strong: string;
    muted: string;
    soft: string;
    placeholder: string;
  };

  bg: {
    canvas: string;
    card: string;
    soft: string;
    input: string;
    bubble: string;
    elevated: string;
  };

  border: {
    default: string;
    soft: string;
  };

  status: {
    success: string;
    warning: string;
    error: string;
    errorBg: string;
  };

  onPrimary: string;
  overlay: string;
  divider: string;
}

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  swatch: string;
  light: ThemeColors;
  dark: ThemeColors;
}

const statusLight = {
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  errorBg: '#FEE2E2',
};

const statusDark = {
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  errorBg: '#450A0A',
};

const warmNeutralLight: ThemeColors = {
  primary: designColors.primary,
  primaryActive: designColors.primaryActive,
  primaryDisabled: designColors.primaryDisabled,
  text: {
    ink: designColors.text.ink,
    base: designColors.text.base,
    strong: designColors.text.strong,
    muted: designColors.text.muted,
    soft: designColors.text.soft,
    placeholder: designColors.text.placeholder,
  },
  bg: {
    canvas: designColors.bg.canvas,
    card: designColors.bg.card,
    soft: designColors.bg.soft,
    input: designColors.bg.input,
    bubble: designColors.bg.bubble,
    elevated: designColors.bg.card,
  },
  border: {
    default: designColors.border.default,
    soft: designColors.border.soft,
  },
  status: statusLight,
  onPrimary: designColors.onPrimary,
  overlay: 'rgba(0,0,0,0.4)',
  divider: designColors.border.soft,
};

const warmNeutralDark: ThemeColors = {
  primary: '#E08A66',
  primaryActive: '#C56D4B',
  primaryDisabled: '#3E3933',
  text: {
    ink: '#F7F3EC',
    base: '#E7DED2',
    strong: '#FFF8EF',
    muted: '#B4A99B',
    soft: '#7E756B',
    placeholder: '#7E756B',
  },
  bg: {
    canvas: '#12100E',
    card: '#1D1A17',
    soft: '#26211D',
    input: '#211D19',
    bubble: '#2C261F',
    elevated: '#24201C',
  },
  border: {
    default: '#353029',
    soft: '#29241F',
  },
  status: statusDark,
  onPrimary: '#17110D',
  overlay: 'rgba(0,0,0,0.6)',
  divider: '#29241F',
};

const knowledgeBlueLight: ThemeColors = {
  primary: '#766B86',
  primaryActive: '#5E546D',
  primaryDisabled: '#DED8E4',
  text: {
    ink: '#1C1A20',
    base: '#44404C',
    strong: '#27232E',
    muted: '#67616F',
    soft: '#908899',
    placeholder: '#908899',
  },
  bg: {
    canvas: '#F4F1F6',
    card: '#FBF9FD',
    soft: '#EAE5EF',
    input: '#FBF9FD',
    bubble: '#EDE8F2',
    elevated: '#FEFCFF',
  },
  border: {
    default: '#DED7E6',
    soft: '#ECE6F1',
  },
  status: statusLight,
  onPrimary: '#FFFFFF',
  overlay: 'rgba(28,26,32,0.42)',
  divider: '#ECE6F1',
};

const knowledgeBlueDark: ThemeColors = {
  primary: '#A899BB',
  primaryActive: '#8F7EA4',
  primaryDisabled: '#393242',
  text: {
    ink: '#F4EFF8',
    base: '#E0D7E8',
    strong: '#FFFFFF',
    muted: '#B0A5BA',
    soft: '#766D80',
    placeholder: '#766D80',
  },
  bg: {
    canvas: '#111015',
    card: '#1C1921',
    soft: '#24202A',
    input: '#211D27',
    bubble: '#2B2632',
    elevated: '#211D27',
  },
  border: {
    default: '#332E3A',
    soft: '#292531',
  },
  status: statusDark,
  onPrimary: '#17121D',
  overlay: 'rgba(0,0,0,0.62)',
  divider: '#292531',
};

const archiveGreenLight: ThemeColors = {
  primary: '#557B61',
  primaryActive: '#42624C',
  primaryDisabled: '#D8E2D5',
  text: {
    ink: '#171D18',
    base: '#3D493F',
    strong: '#223025',
    muted: '#627064',
    soft: '#889386',
    placeholder: '#889386',
  },
  bg: {
    canvas: '#F1F4EE',
    card: '#FBFCF8',
    soft: '#E4EBDF',
    input: '#FBFCF8',
    bubble: '#E7EEE2',
    elevated: '#FEFFF9',
  },
  border: {
    default: '#D9E1D4',
    soft: '#E9EEE5',
  },
  status: statusLight,
  onPrimary: '#FFFFFF',
  overlay: 'rgba(23,29,24,0.42)',
  divider: '#E9EEE5',
};

const archiveGreenDark: ThemeColors = {
  primary: '#8FB89A',
  primaryActive: '#78A282',
  primaryDisabled: '#2F3B31',
  text: {
    ink: '#F1F6EE',
    base: '#DDE8D9',
    strong: '#FFFFFF',
    muted: '#A7B6A3',
    soft: '#707D6D',
    placeholder: '#707D6D',
  },
  bg: {
    canvas: '#0F130F',
    card: '#181E18',
    soft: '#20271F',
    input: '#1D241C',
    bubble: '#263022',
    elevated: '#1D241C',
  },
  border: {
    default: '#2E392C',
    soft: '#252E24',
  },
  status: statusDark,
  onPrimary: '#0F170F',
  overlay: 'rgba(0,0,0,0.62)',
  divider: '#252E24',
};

const slateOceanLight: ThemeColors = {
  primary: '#557D8A',
  primaryActive: '#436674',
  primaryDisabled: '#D5E1E4',
  text: {
    ink: '#172024',
    base: '#3C4A4F',
    strong: '#213139',
    muted: '#607078',
    soft: '#85949A',
    placeholder: '#85949A',
  },
  bg: {
    canvas: '#EFF4F5',
    card: '#F9FCFC',
    soft: '#E1EAEC',
    input: '#F9FCFC',
    bubble: '#E5EEF0',
    elevated: '#FCFEFE',
  },
  border: {
    default: '#D5E0E3',
    soft: '#E7EEF0',
  },
  status: statusLight,
  onPrimary: '#FFFFFF',
  overlay: 'rgba(23,32,36,0.42)',
  divider: '#E7EEF0',
};

const slateOceanDark: ThemeColors = {
  primary: '#8CB2BD',
  primaryActive: '#759BA8',
  primaryDisabled: '#2D3A3E',
  text: {
    ink: '#EFF6F7',
    base: '#D9E7EA',
    strong: '#FFFFFF',
    muted: '#A4B5BA',
    soft: '#6E7E84',
    placeholder: '#6E7E84',
  },
  bg: {
    canvas: '#0E1315',
    card: '#171E20',
    soft: '#1F282B',
    input: '#1B2427',
    bubble: '#243034',
    elevated: '#1B2427',
  },
  border: {
    default: '#2C393D',
    soft: '#233033',
  },
  status: statusDark,
  onPrimary: '#0E1517',
  overlay: 'rgba(0,0,0,0.62)',
  divider: '#233033',
};

export const themePresets: Record<ThemePresetId, ThemePreset> = {
  default: {
    id: 'default',
    label: '暖陶米色',
    swatch: warmNeutralLight.primary,
    light: warmNeutralLight,
    dark: warmNeutralDark,
  },
  'knowledge-blue': {
    id: 'knowledge-blue',
    label: '铁墨紫灰',
    swatch: knowledgeBlueLight.primary,
    light: knowledgeBlueLight,
    dark: knowledgeBlueDark,
  },
  'archive-green': {
    id: 'archive-green',
    label: '档案墨绿',
    swatch: archiveGreenLight.primary,
    light: archiveGreenLight,
    dark: archiveGreenDark,
  },
  'slate-ocean': {
    id: 'slate-ocean',
    label: '岩板海雾',
    swatch: slateOceanLight.primary,
    light: slateOceanLight,
    dark: slateOceanDark,
  },
};

export const lightColors = themePresets.default.light;
export const darkColors = themePresets.default.dark;
