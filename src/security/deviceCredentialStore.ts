import { NativeModules } from 'react-native';
import type { RemoteDeviceScope } from '../protocol/remoteHostV1';
import type { RemoteRelayEndpoint } from '../protocol/remotePairingV1';

export interface RemoteEndpoints {
  hostUrl: string | null;
  relay: RemoteRelayEndpoint | null;
}

export interface StoredDeviceCredential {
  hostUrl: string | null;
  relay: RemoteRelayEndpoint | null;
  /** Historical endpoints collected during pairing attempts. Used for auto fallback. */
  endpoints: RemoteEndpoints[];
  credential: string;
  deviceId: string;
  scopes: RemoteDeviceScope[];
  savedAt: string;
}

export interface DeviceCredentialStore {
  isAvailable(): boolean;
  load(): Promise<StoredDeviceCredential | null>;
  save(value: StoredDeviceCredential): Promise<void>;
  clear(): Promise<void>;
}

interface NativeSecureCredentialModule {
  get(service: string): Promise<string | null>;
  set(service: string, value: string): Promise<void>;
  remove(service: string): Promise<void>;
}

const SERVICE_NAME = 'io.tomz.mira.mobile.remote-device';

const getNativeModule = (): NativeSecureCredentialModule | null => {
  const module = NativeModules.MiraSecureCredentialStore as
    | NativeSecureCredentialModule
    | undefined;

  if (
    !module ||
    typeof module.get !== 'function' ||
    typeof module.set !== 'function' ||
    typeof module.remove !== 'function'
  ) {
    return null;
  }
  return module;
};

const parseRelay = (value: unknown): RemoteRelayEndpoint | null => {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored Mira Relay endpoint is invalid');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.endpoint !== 'string' ||
    typeof record.relayId !== 'string' ||
    typeof record.token !== 'string'
  ) {
    throw new Error('Stored Mira Relay endpoint is incomplete');
  }
  return {
    endpoint: record.endpoint,
    relayId: record.relayId,
    token: record.token,
  };
};

const parseEndpoints = (value: unknown): RemoteEndpoints[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const hostUrl =
        typeof record.hostUrl === 'string'
          ? record.hostUrl
          : record.hostUrl === null
            ? null
            : null;
      const relay = parseRelay(record.relay);
      if (!hostUrl && !relay) return null;
      return { hostUrl, relay };
    })
    .filter((ep): ep is RemoteEndpoints => ep !== null);
};

const parseStoredCredential = (value: string): StoredDeviceCredential => {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored Mira device credential is invalid');
  }

  const record = parsed as Record<string, unknown>;
  const hostUrl =
    typeof record.hostUrl === 'string'
      ? record.hostUrl
      : record.hostUrl === null
        ? null
        : null;
  const relay = parseRelay(record.relay);
  const endpoints = parseEndpoints(record.endpoints);

  if (
    typeof record.credential !== 'string' ||
    typeof record.deviceId !== 'string' ||
    typeof record.savedAt !== 'string' ||
    !Array.isArray(record.scopes) ||
    !record.scopes.every((scope) => typeof scope === 'string')
  ) {
    throw new Error('Stored Mira device credential is incomplete');
  }
  if (!hostUrl && !relay && endpoints.length === 0) {
    throw new Error('Stored Mira device credential has no remote endpoint');
  }

  return {
    hostUrl,
    relay,
    endpoints,
    credential: record.credential,
    deviceId: record.deviceId,
    scopes: record.scopes as RemoteDeviceScope[],
    savedAt: record.savedAt,
  };
};

export class NativeDeviceCredentialStore implements DeviceCredentialStore {
  isAvailable() {
    return getNativeModule() !== null;
  }

  async load(): Promise<StoredDeviceCredential | null> {
    const module = getNativeModule();
    if (!module) {
      throw new Error('Secure credential storage is not installed in this build');
    }

    const value = await module.get(SERVICE_NAME);
    return value ? parseStoredCredential(value) : null;
  }

  async save(value: StoredDeviceCredential): Promise<void> {
    const module = getNativeModule();
    if (!module) {
      throw new Error('Secure credential storage is not installed in this build');
    }
    await module.set(SERVICE_NAME, JSON.stringify(value));
  }

  async clear(): Promise<void> {
    const module = getNativeModule();
    if (!module) {
      throw new Error('Secure credential storage is not installed in this build');
    }
    await module.remove(SERVICE_NAME);
  }
}

export class MemoryDeviceCredentialStore implements DeviceCredentialStore {
  private value: StoredDeviceCredential | null = null;

  isAvailable() {
    return true;
  }

  async load() {
    return this.value;
  }

  async save(value: StoredDeviceCredential) {
    this.value = {
      ...value,
      relay: value.relay ? { ...value.relay } : null,
      endpoints: value.endpoints.map(ep => ({
        hostUrl: ep.hostUrl,
        relay: ep.relay ? { ...ep.relay } : null,
      })),
      scopes: [...value.scopes],
    };
  }

  async clear() {
    this.value = null;
  }
}

export const deviceCredentialStore = new NativeDeviceCredentialStore();
