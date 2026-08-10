import { NativeModules } from 'react-native';

/**
 * 桌面端 Mira Host 登录凭据（JWT）的本地安全存储。
 *
 * 与 `deviceCredentialStore`（remote-device 配对凭据）分离：
 * 桌面端当前没有 remote-device 协议，移动端通过 `/login` 获取 JWT，
 * 存到独立的 service 槽位，互不干扰。
 */

export interface DesktopCredential {
  hostUrl: string;
  token: string;
  username: string;
  savedAt: string;
}

export interface DesktopCredentialStore {
  isAvailable(): boolean;
  load(): Promise<DesktopCredential | null>;
  save(value: DesktopCredential): Promise<void>;
  clear(): Promise<void>;
}

interface NativeSecureCredentialModule {
  get(service: string): Promise<string | null>;
  set(service: string, value: string): Promise<void>;
  remove(service: string): Promise<void>;
}

const SERVICE_NAME = 'io.tomz.mira.mobile.desktop-login';

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

const parseStoredCredential = (value: string): DesktopCredential => {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored Mira login credential is invalid');
  }

  const record = parsed as Record<string, unknown>;
  if (
    typeof record.hostUrl !== 'string' ||
    typeof record.token !== 'string' ||
    typeof record.username !== 'string' ||
    typeof record.savedAt !== 'string'
  ) {
    throw new Error('Stored Mira login credential is incomplete');
  }

  return record as unknown as DesktopCredential;
};

export class NativeDesktopCredentialStore implements DesktopCredentialStore {
  isAvailable() {
    return getNativeModule() !== null;
  }

  async load(): Promise<DesktopCredential | null> {
    const module = getNativeModule();
    if (!module) {
      throw new Error('Secure credential storage is not installed in this build');
    }

    const value = await module.get(SERVICE_NAME);
    return value ? parseStoredCredential(value) : null;
  }

  async save(value: DesktopCredential): Promise<void> {
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

export class MemoryDesktopCredentialStore implements DesktopCredentialStore {
  private value: DesktopCredential | null = null;

  isAvailable() {
    return true;
  }

  async load() {
    return this.value;
  }

  async save(value: DesktopCredential) {
    this.value = { ...value };
  }

  async clear() {
    this.value = null;
  }
}

export const desktopCredentialStore = new NativeDesktopCredentialStore();
