import { create } from 'zustand';

export type DebugLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DebugLogEntry {
  id: number;
  timestamp: number;
  level: DebugLogLevel;
  tag: string;
  message: string;
  details?: string;
}

const MAX_ENTRIES = 500;

interface DebugLogState {
  entries: DebugLogEntry[];
  append: (level: DebugLogLevel, tag: string, message: string, details?: unknown) => void;
  clear: () => void;
  getText: () => string;
}

let nextId = 1;
let maxEntries = MAX_ENTRIES;

const serializeDetails = (details: unknown): string | undefined => {
  if (details === undefined || details === null) return undefined;
  if (typeof details === 'string') return details;
  if (typeof details === 'number' || typeof details === 'boolean') return String(details);
  try {
    return JSON.stringify(details, (_key, value) => {
      if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
      }
      return value;
    });
  } catch {
    return String(details);
  }
};

const formatTimestamp = (ts: number): string => {
  const date = new Date(ts);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
};

export const useDebugLogStore = create<DebugLogState>((set, get) => ({
  entries: [],

  append: (level, tag, message, details) => {
    const entry: DebugLogEntry = {
      id: nextId++,
      timestamp: Date.now(),
      level,
      tag,
      message,
      details: serializeDetails(details),
    };
    const current = get().entries;
    const next = [...current, entry];
    if (next.length > maxEntries) {
      next.splice(0, next.length - maxEntries);
    }
    set({ entries: next });
  },

  clear: () => set({ entries: [] }),

  getText: () => {
    const entries = get().entries;
    return entries
      .map(e => {
        const header = `${formatTimestamp(e.timestamp)} [${e.level.toUpperCase()}] ${e.tag} ${e.message}`;
        if (e.details) return `${header}\n  ${e.details}`;
        return header;
      })
      .join('\n');
  },
}));

export const resetDebugLogStore = () => {
  nextId = 1;
  useDebugLogStore.getState().clear();
};

export const setDebugLogMaxEntries = (max: number) => {
  maxEntries = max;
};
