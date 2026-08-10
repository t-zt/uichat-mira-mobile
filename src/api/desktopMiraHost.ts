import type {
  ApiError,
  ChatMessage,
  ConnectionStatus,
  MiraHostConfig,
  Session,
} from '../types';
import { useHostStore } from '../store/hostStore';
import { MiraHostApi, MiraHostError } from './miraHost';
import { requestRemoteJson } from './remoteHttp';
import { openPostSse, type PostSseSession } from './postSse';
import {
  parseRemoteChatStreamEvent,
  parseRemoteMessage,
  parseRemoteThread,
  type RemoteChatStreamEvent,
  type RemoteMessage,
  type RemoteThread,
} from '../protocol/remoteHostV1';
import {
  desktopCredentialStore,
  type DesktopCredential,
  type DesktopCredentialStore,
} from '../security/desktopCredentialStore';

/**
 * 基于桌面端 Mira Host（UIChat Mira，Fastify 后端）现有 Web API 的真实客户端。
 *
 * 桌面端当前没有 remote-device 配对协议（`/remote/*` 未实现），
 * 移动端直接对接桌面端已有的认证与对话接口：
 *
 * - POST /login                          -> 获取 JWT（Bearer）
 * - GET  /threads                        -> 会话列表（status=active）
 * - GET  /threads/:id                    -> 会话详情
 * - POST /threads                        -> 新建会话
 * - PATCH /threads/:id                   -> 重命名会话
 * - DELETE /threads/:id                  -> 删除会话
 * - GET  /threads/:id/messages           -> 历史消息
 * - POST /proxy/chat/default             -> 流式对话（SSE，text-delta 事件）
 *
 * 依据：桌面端仓库 `server/src/routes/thread/threads.routes.ts`、
 * `server/src/routes/thread/messages.routes.ts`、
 * `server/src/routes/proxy-provider/chat.routes.ts`、
 * `server/src/routes/login.ts`（默认本地账户，如 Tomz/123456）。
 */

export interface DesktopMiraHostApi extends MiraHostApi {
  /** 使用桌面端本地账号登录并持久化 JWT。 */
  login(hostUrl: string, username: string, password: string): Promise<void>;
  /** 从安全存储恢复登录态并校验 token 有效性。 */
  restoreConnection(): Promise<boolean>;
  /** 当前是否已持有有效登录凭据。 */
  isAuthenticated(): boolean;
  /** 当前已登录账号（用于展示）。 */
  getUsername(): string | null;
  getStoredHostUrl(): Promise<string | null>;
  isSecureStorageAvailable(): boolean;
}

const isRecordLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 宽容解析登录响应：兼容标准信封（{success,data:{token}}）、
 * 裸对象（{token,user}）、data 包裹（{data:{token}}）等形态。
 * 若响应明确为失败信封或无法识别，返回可诊断的错误信息。
 */
const resolveLoginToken = (
  value: unknown,
  depth = 0,
): { token?: string; username?: string; errorMessage?: string } => {
  if (depth > 4 || !isRecordLike(value)) {
    return {};
  }

  if (value.success === false) {
    return {
      errorMessage:
        typeof value.message === 'string' && value.message.trim()
          ? value.message
          : '登录失败，桌面端拒绝了凭据',
    };
  }

  if (typeof value.token === 'string' && value.token) {
    const user = isRecordLike(value.user) ? value.user : null;
    return {
      token: value.token,
      username:
        user && typeof user.username === 'string' && user.username
          ? user.username
          : undefined,
    };
  }

  if (isRecordLike(value.data)) {
    return resolveLoginToken(value.data, depth + 1);
  }

  return {};
};

const formatLoginDetails = (value: unknown): string => {
  try {
    const text = JSON.stringify(value);
    return text && text.length > 400 ? `${text.slice(0, 400)}…` : (text ?? '');
  } catch {
    return String(value);
  }
};

const threadToSession = (thread: RemoteThread): Session => ({
  id: thread.id,
  title: thread.title,
  updatedAt: new Date(thread.updatedAt),
});

const messageToChatMessage = (message: RemoteMessage): ChatMessage => ({
  id: message.id,
  role: message.role === 'tool' || message.role === 'system' ? 'system' : message.role,
  content: message.content,
  timestamp: new Date(message.createdAt),
});

const normalizePath = (path: string) => (path.startsWith('/') ? path : `/${path}`);

export class DesktopMiraHostClient implements DesktopMiraHostApi {
  private config: MiraHostConfig | null = null;
  private activeCredential: DesktopCredential | null = null;
  private currentSendSession: PostSseSession<RemoteChatStreamEvent> | null = null;

  constructor(
    private readonly credentialStore: DesktopCredentialStore = desktopCredentialStore,
  ) {}

  isSecureStorageAvailable() {
    return this.credentialStore.isAvailable();
  }

  isAuthenticated() {
    return this.activeCredential !== null;
  }

  getUsername(): string | null {
    return this.activeCredential?.username ?? null;
  }

  async getStoredHostUrl(): Promise<string | null> {
    const stored = await this.credentialStore.load();
    return stored?.hostUrl ?? null;
  }

  configure(config: MiraHostConfig): void {
    this.config = config;
  }

  getConnectionStatus(): ConnectionStatus {
    return useHostStore.getState().connectionStatus;
  }

  async login(hostUrl: string, username: string, password: string): Promise<void> {
    const trimmedHost = hostUrl.trim();
    const trimmedUsername = username.trim();
    if (!trimmedHost) {
      throw new MiraHostError('INVALID_HOST', '请填写桌面端地址');
    }
    if (!trimmedUsername || !password) {
      throw new MiraHostError('INVALID_CREDENTIALS', '请填写用户名和密码');
    }

    const loginData = await requestRemoteJson({
      hostUrl: trimmedHost,
      path: '/login',
      method: 'POST',
      raw: true,
      allowInsecureDevelopment: __DEV__,
      body: { username: trimmedUsername, password },
      parse: (value) => {
        const resolved = resolveLoginToken(value);
        if (resolved.errorMessage) {
          throw new MiraHostError('LOGIN_FAILED', resolved.errorMessage);
        }
        if (!resolved.token) {
          // 无法识别响应结构：把原始响应带进错误，便于诊断。
          throw new MiraHostError(
            'INVALID_LOGIN_RESPONSE',
            '无法识别桌面端登录响应，请确认地址指向 Mira Host 后端（端口 8787），且桌面端服务正常',
            formatLoginDetails(value),
          );
        }
        return {
          token: resolved.token,
          username: resolved.username ?? 'Mira',
        };
      },
    });

    const credential: DesktopCredential = {
      hostUrl: trimmedHost,
      token: loginData.token,
      username: loginData.username,
      savedAt: new Date().toISOString(),
    };
    await this.credentialStore.save(credential);
    this.activeCredential = credential;

    this.config = { hostUrl: trimmedHost, token: loginData.token };
    useHostStore.getState().setConfig(this.config);
    useHostStore.getState().setConnectionStatus('connected');
  }

  async connect(): Promise<void> {
    const credential = await this.requireCredential();
    try {
      // 用真实接口验证 token 有效性（拉取一个会话即可）。
      await this.requestJson(credential, {
        path: '/threads?status=active&sortBy=updatedAt&sortOrder=desc&limit=1',
        parse: () => undefined,
      });
      useHostStore.getState().setConnectionStatus('connected');
    } catch (error) {
      if (this.isAuthError(error)) {
        await this.clearCredential();
      }
      throw error;
    }
  }

  async restoreConnection(): Promise<boolean> {
    const stored = await this.credentialStore.load();
    if (!stored) {
      this.activeCredential = null;
      return false;
    }

    try {
      await this.requestJson(stored, {
        path: '/threads?status=active&sortBy=updatedAt&sortOrder=desc&limit=1',
        parse: () => undefined,
      });
      this.activeCredential = stored;
      this.config = { hostUrl: stored.hostUrl, token: stored.token };
      useHostStore.getState().setConfig(this.config);
      useHostStore.getState().setConnectionStatus('connected');
      return true;
    } catch (error) {
      if (this.isAuthError(error)) {
        this.activeCredential = null;
        await this.credentialStore.clear();
      }
      useHostStore.getState().setConnectionStatus('disconnected');
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.activeCredential = null;
    this.currentSendSession?.abort();
    this.currentSendSession = null;
    await this.credentialStore.clear();
    useHostStore.getState().clearConfig();
  }

  async listSessions(): Promise<Session[]> {
    const credential = await this.requireCredential();
    const threads = await this.requestJson(credential, {
      path: '/threads?status=active&sortBy=updatedAt&sortOrder=desc',
      parse: (value) => {
        if (!Array.isArray(value)) {
          throw new Error('threads must be an array');
        }
        return value.map(parseRemoteThread);
      },
    });
    return threads.map(threadToSession);
  }

  async getSession(sessionId: string): Promise<Session> {
    const credential = await this.requireCredential();
    const thread = await this.requestJson(credential, {
      path: `/threads/${encodeURIComponent(sessionId)}`,
      parse: parseRemoteThread,
    });
    return threadToSession(thread);
  }

  async createSession(title?: string): Promise<Session> {
    const credential = await this.requireCredential();
    const thread = await this.requestJson(credential, {
      path: '/threads',
      method: 'POST',
      body: title ? { title } : {},
      parse: parseRemoteThread,
    });
    return threadToSession(thread);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const credential = await this.requireCredential();
    await this.requestJson(credential, {
      path: `/threads/${encodeURIComponent(sessionId)}`,
      method: 'DELETE',
      parse: () => undefined,
    });
  }

  async renameSession(sessionId: string, title: string): Promise<Session> {
    const credential = await this.requireCredential();
    const thread = await this.requestJson(credential, {
      path: `/threads/${encodeURIComponent(sessionId)}`,
      method: 'PATCH',
      body: { title },
      parse: parseRemoteThread,
    });
    return threadToSession(thread);
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const credential = await this.requireCredential();
    const messages = await this.requestJson(credential, {
      path: `/threads/${encodeURIComponent(sessionId)}/messages`,
      parse: (value) => {
        if (!Array.isArray(value)) {
          throw new Error('messages must be an array');
        }
        return value.map(parseRemoteMessage);
      },
    });
    return messages.map(messageToChatMessage);
  }

  async sendMessage(sessionId: string, content: string): Promise<AsyncIterable<string>> {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new MiraHostError('EMPTY_MESSAGE', '消息内容不能为空');
    }

    const credential = await this.requireCredential();
    const session = openPostSse({
      hostUrl: credential.hostUrl,
      path: '/proxy/chat/default',
      credential: credential.token,
      allowInsecureDevelopment: __DEV__,
      body: {
        id: sessionId,
        messageId: `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        // 桌面端要求 canonical 消息格式：{role, parts:[{type:'text',text}]}，
        // 简化格式 {role, content} 会被 schema 校验拒绝（Invalid request payload）。
        messages: [{ role: 'user', parts: [{ type: 'text', text: trimmed }] }],
      },
      parse: parseRemoteChatStreamEvent,
    });
    this.currentSendSession?.abort();
    this.currentSendSession = session;

    return this.toTextStream(session);
  }

  /** 取消当前进行中的流式对话（网络层）。 */
  cancelCurrentSend() {
    this.currentSendSession?.abort();
    this.currentSendSession = null;
  }

  /** 将桌面端 SSE 对话事件流转换为纯文本增量流（仅保留 text-delta）。 */
  async *toTextStream(
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
      if (this.currentSendSession === session) {
        this.currentSendSession = null;
      }
    }
  }

  private async requestJson<T>(
    credential: DesktopCredential,
    request: {
      path: string;
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: unknown;
      parse: (value: unknown) => T;
    },
  ): Promise<T> {
    try {
      return await requestRemoteJson({
        hostUrl: credential.hostUrl,
        path: normalizePath(request.path),
        method: request.method ?? 'GET',
        credential: credential.token,
        allowInsecureDevelopment: __DEV__,
        body: request.body,
        parse: request.parse,
      });
    } catch (error) {
      if (this.isAuthError(error)) {
        this.activeCredential = null;
        await this.credentialStore.clear();
      }
      throw error;
    }
  }

  private isAuthError(error: unknown): boolean {
    const status = (error as { status?: number }).status;
    return status === 401 || status === 403;
  }

  private async requireCredential(): Promise<DesktopCredential> {
    if (this.activeCredential) {
      return this.activeCredential;
    }

    const stored = await this.credentialStore.load();
    if (!stored) {
      throw new MiraHostError(
        'NOT_CONNECTED',
        '尚未连接桌面端，请先在设置中登录',
      );
    }
    this.activeCredential = stored;
    return stored;
  }

  private async clearCredential() {
    this.activeCredential = null;
    await this.credentialStore.clear();
    useHostStore.getState().setConnectionStatus('disconnected');
  }
}

export const desktopMiraHostClient = new DesktopMiraHostClient();

// 兼容旧引用：MiraHostApi 类型导出。
export type { ApiError };
export { MiraHostError };
