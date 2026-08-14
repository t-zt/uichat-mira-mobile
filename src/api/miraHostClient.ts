import type {
  ChatMessage,
  ConnectionStatus,
  MiraHostConfig,
  Session,
} from '../types';
import { useHostStore } from '../store/hostStore';
import {
  remoteMiraHostClient,
  type RemoteMiraHostClient,
} from './remoteMiraHost';
import type { RemoteMessage, RemoteThread } from '../protocol/remoteHostV1';
import type { MiraHostApi } from './miraHost';

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

const unsupportedMutation = (operation: string): never => {
  throw new Error(
    `${operation} is not available to a paired mobile device in Remote Host V1`,
  );
};

const createMessageId = () =>
  `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Mobile runtime compatibility adapter.
 *
 * The mobile app is a paired remote device. Its business identity is the
 * `mira_device_*` credential issued by Remote Host V1; it must never fall back
 * to a desktop user's username/password or JWT.
 *
 * This adapter preserves the older screen-facing MiraHostApi shape while all
 * supported operations are delegated to RemoteMiraHostClient.
 */
class PairedRemoteMiraHostClient implements MiraHostApi {
  private currentSendAbort: (() => void) | null = null;

  constructor(private readonly remote: RemoteMiraHostClient) {}

  configure(_config: MiraHostConfig): void {
    // Intentionally ignored. Remote Host V1 connection details are restored
    // from the securely stored device credential, not from a user JWT config.
  }

  getConnectionStatus(): ConnectionStatus {
    return useHostStore.getState().connectionStatus;
  }

  async connect(): Promise<void> {
    useHostStore.getState().setConnectionStatus('connecting');
    try {
      const restored = await this.remote.restoreConnection();
      if (!restored) {
        useHostStore.getState().setConnectionStatus('disconnected');
        throw new Error('This mobile device is not paired with a Mira Host');
      }
      useHostStore.getState().setConnectionStatus('connected');
    } catch (error) {
      useHostStore.getState().setConnectionStatus('disconnected');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.cancelCurrentSend();
    await this.remote.disconnect();
    useHostStore.getState().clearConfig();
    useHostStore.getState().setConnectionStatus('disconnected');
  }

  async listSessions(): Promise<Session[]> {
    return (await this.remote.listThreads()).map(threadToSession);
  }

  async getSession(sessionId: string): Promise<Session> {
    return threadToSession(await this.remote.getThread(sessionId));
  }

  async createSession(_title?: string): Promise<Session> {
    return unsupportedMutation('Creating a thread');
  }

  async deleteSession(_sessionId: string): Promise<void> {
    return unsupportedMutation('Deleting a thread');
  }

  async renameSession(_sessionId: string, _title: string): Promise<Session> {
    return unsupportedMutation('Renaming a thread');
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    return (await this.remote.getMessages(sessionId)).map(messageToChatMessage);
  }

  async sendMessage(
    sessionId: string,
    content: string,
    messageId: string = createMessageId(),
  ): Promise<AsyncIterable<string>> {
    const stableMessageId = messageId.trim();
    if (!stableMessageId) {
      throw new Error('A stable message id is required');
    }

    const session = await this.remote.sendMessage({
      threadId: sessionId,
      messageId: stableMessageId,
      content,
    });
    this.currentSendAbort = session.abort;

    const self = this;
    return (async function* () {
      try {
        for await (const event of session.events) {
          if (event.type === 'text-delta' && typeof event.delta === 'string') {
            yield event.delta;
            continue;
          }
          if (event.type === 'error') {
            const errorText =
              'errorText' in event && typeof event.errorText === 'string'
                ? event.errorText
                : 'Mira Host stream failed';
            throw new Error(errorText);
          }
        }
      } finally {
        if (self.currentSendAbort === session.abort) {
          self.currentSendAbort = null;
        }
      }
    })();
  }

  cancelCurrentSend() {
    const abort = this.currentSendAbort;
    this.currentSendAbort = null;
    abort?.();
  }
}

export const miraHostClient = new PairedRemoteMiraHostClient(
  remoteMiraHostClient,
);
