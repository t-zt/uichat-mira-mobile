import type {
  ChatMessage,
  ConnectionStatus,
  MiraHostConfig,
  Session,
} from '../types';
import type { MiraHostApi } from './miraHost';
import { MiraHostError } from './miraHost';
import { desktopMiraHostClient } from './desktopMiraHost';
import {
  remoteMiraHostClient,
  type SendRemoteMessageInput,
} from './remoteMiraHost';
import { RemoteHostError } from './remoteHttp';
import { deviceCredentialStore } from '../security/deviceCredentialStore';
import { useHostStore } from '../store/hostStore';
import type {
  RemoteChatStreamEvent,
  RemoteMessage,
  RemoteThread,
} from '../protocol/remoteHostV1';
import type { PostSseSession } from './postSse';

type ClientMode = 'remote-device' | 'legacy' | null;

const threadToSession = (thread: RemoteThread): Session => ({
  id: thread.id,
  title: thread.title,
  updatedAt: new Date(thread.updatedAt),
});

const messageToChatMessage = (message: RemoteMessage): ChatMessage => ({
  id: message.id,
  role:
    message.role === 'tool' || message.role === 'system'
      ? 'system'
      : message.role,
  content: message.content,
  timestamp: new Date(message.createdAt),
});

const isRemoteTransportFailure = (error: unknown) =>
  error instanceof RemoteHostError &&
  (error.code === 'NETWORK_ERROR' || error.code.startsWith('RELAY_'));

class MiraHostClientFacade implements MiraHostApi {
  private mode: ClientMode = null;
  private remoteHasRelay = false;
  private currentRemoteSend: PostSseSession<RemoteChatStreamEvent> | null = null;

  configure(config: MiraHostConfig): void {
    this.mode = 'legacy';
    desktopMiraHostClient.configure(config);
  }

  getConnectionStatus(): ConnectionStatus {
    return useHostStore.getState().connectionStatus;
  }

  isRemoteDeviceMode() {
    return this.mode === 'remote-device';
  }

  hasRelayFallback() {
    return this.mode === 'remote-device' && this.remoteHasRelay;
  }

  supportsSessionMutations() {
    return this.mode !== 'remote-device';
  }

  isSecureStorageAvailable() {
    return (
      deviceCredentialStore.isAvailable() ||
      desktopMiraHostClient.isSecureStorageAvailable()
    );
  }

  async prepareStoredConnection(): Promise<boolean> {
    try {
      if (deviceCredentialStore.isAvailable()) {
        const remote = await deviceCredentialStore.load();
        if (remote) {
          this.mode = 'remote-device';
          this.remoteHasRelay = Boolean(remote.relay);
          if (remote.hostUrl) {
            useHostStore.getState().setConfig({
              hostUrl: remote.hostUrl,
              token: '',
            });
          }
          useHostStore.getState().setConnectionStatus('reconnecting');
          return true;
        }
      }
    } catch {
      // Fall through to the legacy credential if the remote-device store is
      // unavailable or corrupted. Authentication is re-validated on use.
    }

    const legacyHost = await desktopMiraHostClient.getStoredHostUrl();
    if (legacyHost) {
      this.mode = 'legacy';
      this.remoteHasRelay = false;
      return true;
    }

    this.mode = null;
    this.remoteHasRelay = false;
    return false;
  }

  async activateRemoteDevice(): Promise<void> {
    const stored = await deviceCredentialStore.load();
    if (!stored) {
      throw new MiraHostError(
        'PAIRING_REQUIRED',
        '没有找到刚刚完成的 Mira 设备配对凭据',
      );
    }
    this.mode = 'remote-device';
    this.remoteHasRelay = Boolean(stored.relay);
    if (stored.hostUrl) {
      useHostStore.getState().setConfig({ hostUrl: stored.hostUrl, token: '' });
    } else {
      useHostStore.getState().clearConfig();
    }
    useHostStore.getState().setConnectionStatus('connected');
  }

  async login(hostUrl: string, username: string, password: string): Promise<void> {
    await desktopMiraHostClient.login(hostUrl, username, password);
    this.mode = 'legacy';
    this.remoteHasRelay = false;
  }

  getUsername() {
    return this.mode === 'legacy' ? desktopMiraHostClient.getUsername() : null;
  }

  async getStoredHostUrl(): Promise<string | null> {
    if (deviceCredentialStore.isAvailable()) {
      try {
        const remote = await deviceCredentialStore.load();
        if (remote) return remote.hostUrl;
      } catch {
        // Legacy lookup below remains available.
      }
    }
    return desktopMiraHostClient.getStoredHostUrl();
  }

  async restoreConnection(): Promise<boolean> {
    if (!this.mode) {
      await this.prepareStoredConnection();
    }

    if (this.mode === 'remote-device') {
      try {
        const restored = await remoteMiraHostClient.restoreConnection();
        if (!restored) {
          this.mode = null;
          this.remoteHasRelay = false;
          useHostStore.getState().setConnectionStatus('disconnected');
          return false;
        }
        this.remoteHasRelay = Boolean(restored.credential.relay);
        if (restored.credential.hostUrl) {
          useHostStore.getState().setConfig({
            hostUrl: restored.credential.hostUrl,
            token: '',
          });
        }
        useHostStore.getState().setConnectionStatus('connected');
        return true;
      } catch (error) {
        useHostStore
          .getState()
          .setConnectionStatus(
            isRemoteTransportFailure(error) ? 'reconnecting' : 'disconnected',
          );
        return false;
      }
    }

    const restored = await desktopMiraHostClient.restoreConnection();
    if (restored) this.mode = 'legacy';
    return restored;
  }

  async connect(): Promise<void> {
    if (!this.mode) await this.prepareStoredConnection();
    if (this.mode === 'remote-device') {
      const restored = await this.restoreConnection();
      if (!restored) {
        throw new MiraHostError(
          'REMOTE_CONNECT_FAILED',
          '无法连接已配对的 Mira Desktop',
        );
      }
      return;
    }
    await desktopMiraHostClient.connect();
    this.mode = 'legacy';
  }

  async disconnect(): Promise<void> {
    this.currentRemoteSend?.abort();
    this.currentRemoteSend = null;
    await Promise.allSettled([
      remoteMiraHostClient.disconnect(),
      desktopMiraHostClient.disconnect(),
    ]);
    this.mode = null;
    this.remoteHasRelay = false;
    useHostStore.getState().clearConfig();
  }

  cancelCurrentSend() {
    if (this.mode === 'remote-device') {
      this.currentRemoteSend?.abort();
      this.currentRemoteSend = null;
      return;
    }
    desktopMiraHostClient.cancelCurrentSend();
  }

  async listSessions(): Promise<Session[]> {
    if (await this.useRemoteDevice()) {
      return this.remoteOperation(async () =>
        (await remoteMiraHostClient.listThreads()).map(threadToSession),
      );
    }
    return desktopMiraHostClient.listSessions();
  }

  async getSession(sessionId: string): Promise<Session> {
    if (await this.useRemoteDevice()) {
      return this.remoteOperation(async () =>
        threadToSession(await remoteMiraHostClient.getThread(sessionId)),
      );
    }
    return desktopMiraHostClient.getSession(sessionId);
  }

  async createSession(title?: string): Promise<Session> {
    if (await this.useRemoteDevice()) {
      throw this.remoteMutationUnsupported();
    }
    return desktopMiraHostClient.createSession(title);
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (await this.useRemoteDevice()) {
      throw this.remoteMutationUnsupported();
    }
    return desktopMiraHostClient.deleteSession(sessionId);
  }

  async renameSession(sessionId: string, title: string): Promise<Session> {
    if (await this.useRemoteDevice()) {
      throw this.remoteMutationUnsupported();
    }
    return desktopMiraHostClient.renameSession(sessionId, title);
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    if (await this.useRemoteDevice()) {
      return this.remoteOperation(async () =>
        (await remoteMiraHostClient.getMessages(sessionId)).map(
          messageToChatMessage,
        ),
      );
    }
    return desktopMiraHostClient.getMessages(sessionId);
  }

  async sendMessage(
    sessionId: string,
    content: string,
  ): Promise<AsyncIterable<string>> {
    if (await this.useRemoteDevice()) {
      const input: SendRemoteMessageInput = {
        threadId: sessionId,
        messageId: `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        content,
      };
      const session = await this.remoteOperation(() =>
        remoteMiraHostClient.sendMessage(input),
      );
      this.currentRemoteSend?.abort();
      this.currentRemoteSend = session;
      return this.remoteTextStream(session);
    }
    return desktopMiraHostClient.sendMessage(sessionId, content);
  }

  private async useRemoteDevice() {
    if (!this.mode) await this.prepareStoredConnection();
    return this.mode === 'remote-device';
  }

  private async remoteOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      const value = await operation();
      useHostStore.getState().setConnectionStatus('connected');
      return value;
    } catch (error) {
      if (isRemoteTransportFailure(error)) {
        useHostStore.getState().setConnectionStatus('reconnecting');
      }
      throw error;
    }
  }

  private async *remoteTextStream(
    session: PostSseSession<RemoteChatStreamEvent>,
  ): AsyncIterable<string> {
    try {
      for await (const event of session.events) {
        if (event.type === 'text-delta' && typeof event.delta === 'string') {
          yield event.delta;
        } else if (event.type === 'error') {
          throw new MiraHostError(
            'CHAT_STREAM_ERROR',
            typeof event.errorText === 'string' && event.errorText
              ? event.errorText
              : '对话流发生错误',
          );
        } else if (event.type === 'finish' && event.finishReason === 'error') {
          throw new MiraHostError('CHAT_FINISH_ERROR', '对话生成失败，请重试');
        }
      }
    } finally {
      if (this.currentRemoteSend === session) {
        this.currentRemoteSend = null;
      }
    }
  }

  private remoteMutationUnsupported() {
    return new MiraHostError(
      'REMOTE_SESSION_MUTATION_UNSUPPORTED',
      '当前配对连接暂不支持创建、重命名或删除会话',
    );
  }
}

/**
 * 移动端统一 API 出口。
 *
 * 配对凭据存在时使用 Remote Host V1（Direct/Tailscale 优先，Relay 回退）；
 * 否则保留现有 JWT + Tailscale / 手动 Host 登录路径。
 */
export const miraHostClient = new MiraHostClientFacade();
