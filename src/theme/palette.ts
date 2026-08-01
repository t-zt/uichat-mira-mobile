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

// ─── Light Theme — Mira warm canvas (tomz.io coral clay) ───
export const lightColors: ThemeColors = {
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
    elevated: '#FFFFFF',
  },

  border: {
    default: designColors.border.default,
    soft: designColors.border.soft,
  },

  status: {
    success: '#5db872',
    warning: '#d4a017',
    error: '#c64545',
    errorBg: '#fce8e8',
  },

  onPrimary: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.4)',
  divider: designColors.border.soft,
};

// ─── Dark Theme (tomz.io coral clay accent) ───
export const darkColors: ThemeColors = {
  primary: '#e8a07a',
  primaryActive: '#cc785c',
  primaryDisabled: '#3d3d3a',

  text: {
    ink: '#faf9f5',
    base: '#e5e5ea',
    strong: '#FFFFFF',
    muted: '#a09d96',
    soft: '#636366',
    placeholder: '#636366',
  },

  bg: {
    canvas: '#181715',
    card: '#252320',
    soft: '#1f1e1b',
    input: '#1f1e1b',
    bubble: '#252320',
    elevated: '#252320',
  },

  border: {
    default: '#2C2C2E',
    soft: '#1f1e1b',
  },

  status: {
    success: '#5db872',
    warning: '#d4a017',
    error: '#c64545',
    errorBg: '#3d1a1a',
  },

  onPrimary: '#1A1A1C',
  overlay: 'rgba(0,0,0,0.6)',
  divider: '#2C2C2E',
};
import { colors as designColors } from './tokens';
