import {
  parseRemoteMemoryItem,
  parseRemoteMemorySettings,
  type RemoteMemoryItem,
  type RemoteMemorySettings,
} from '../protocol/remoteHostV1';

const parseMemoryArray = (value: unknown): RemoteMemoryItem[] => {
  if (!Array.isArray(value)) {
    throw new Error('Memory list must be an array');
  }
  return value.map(parseRemoteMemoryItem);
};

export const listMemories = parseMemoryArray;
export const parseMemoryItem = parseRemoteMemoryItem;
export const parseMemorySettings = parseRemoteMemorySettings;

export type { RemoteMemoryItem, RemoteMemorySettings };