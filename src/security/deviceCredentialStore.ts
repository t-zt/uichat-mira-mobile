import { NativeModules } from 'react-native';
import type { RemoteDeviceScope } from '../protocol/remoteHostV1';

export interface StoredDeviceCredential {
  hostUrl: string;
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

const parseStoredCredential = (value: string): StoredDeviceCredential => {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored Mira device credential is invalid');
  }

  const record = parsed as Record<string, unknown>;
  if (
    typeof record.hostUrl !== 'string' ||
    typeof record.credential !== 'string' ||
    typeof record.deviceId !== 'string' ||
    typeof record.savedAt !== 'string' ||
    !Array.isArray(record.scopes) ||
    !record.scopes.every((scope) => typeof scope === 'string')
  ) {
    throw new Error('Stored Mira device credential is incomplete');
  }

  return record as unknown as StoredDeviceCredential;
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
    this.value = { ...value, scopes: [...value.scopes] };
  }

  async clear() {
    this.value = null;
  }
}

export const deviceCredentialStore = new NativeDeviceCredentialStore();
