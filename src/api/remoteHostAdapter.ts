import type { ChatMessage, ConnectionStatus, MiraHostConfig, Session } from '../types';
import { RemoteMiraHostClient } from './remoteMiraHost';
import { MiraHostError, type MiraHostApi } from './miraHost';
import type { RemoteThread, RemoteMessage, RemoteChatStreamEvent } from '../protocol/remoteHostV1';
import { useHostStore } from '../store/hostStore';

function mapRemoteThreadToSession(thread: RemoteThread): Session {
  return {
    id: thread.id,
    title: thread.title,
    updatedAt: new Date(thread.updatedAt),
  };
}

function mapRemoteMessageToChatMessage(msg: RemoteMessage): ChatMessage {
  const role = msg.role === 'tool' ? 'assistant' : msg.role;
  return {
    id: msg.id,
    role,
    content: msg.content,
    timestamp: new Date(msg.createdAt),
  };
}

export class RemoteHostAdapter implements MiraHostApi {
  constructor(private client: RemoteMiraHostClient) {}

  configure(config: MiraHostConfig): void {
    useHostStore.getState().setConfig(config);
  }

  getConnectionStatus(): ConnectionStatus {
    return useHostStore.getState().connectionStatus;
  }

  async connect(): Promise<void> {
    const credential = await this.client.restoreConnection();
    if (!credential) {
      throw new MiraHostError('NO_CREDENTIAL', 'No device credential available');
    }
    useHostStore.getState().setConnectionStatus('connected');
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
    useHostStore.getState().setConnectionStatus('disconnected');
  }

  async listSessions(): Promise<Session[]> {
    try {
      const threads = await this.client.listThreads();
      return threads.map(mapRemoteThreadToSession);
    } catch (error) {
      if (error instanceof Error) {
        throw new MiraHostError('LIST_FAILED', error.message);
      }
      throw new MiraHostError('LIST_FAILED', 'Failed to list sessions');
    }
  }

  async getSession(sessionId: string): Promise<Session> {
    try {
      const thread = await this.client.getThread(sessionId);
      return mapRemoteThreadToSession(thread);
    } catch (error) {
      const err = error as { status?: number; message?: Error['message'] };
      if (err.status === 404) {
        throw new MiraHostError('NOT_FOUND', `会话 ${sessionId} 不存在`);
      }
      if (error instanceof Error) {
        throw new MiraHostError('GET_FAILED', error.message);
      }
      throw new MiraHostError('GET_FAILED', 'Failed to get session');
    }
  }

  async createSession(title?: string): Promise<Session> {
    try {
      const thread = await this.client.createThread({ title });
      return mapRemoteThreadToSession(thread);
    } catch (error) {
      if (error instanceof Error) {
        throw new MiraHostError('CREATE_FAILED', error.message);
      }
      throw new MiraHostError('CREATE_FAILED', 'Failed to create session');
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.client.deleteThread(sessionId);
    } catch (error) {
      if (error instanceof Error) {
        throw new MiraHostError('DELETE_FAILED', error.message);
      }
      throw new MiraHostError('DELETE_FAILED', 'Failed to delete session');
    }
  }

  async renameSession(sessionId: string, title: string): Promise<Session> {
    try {
      const thread = await this.client.updateThread(sessionId, { title });
      return mapRemoteThreadToSession(thread);
    } catch (error) {
      if (error instanceof Error) {
        throw new MiraHostError('RENAME_FAILED', error.message);
      }
      throw new MiraHostError('RENAME_FAILED', 'Failed to rename session');
    }
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    try {
      const messages = await this.client.getMessages(sessionId);
      return messages.map(mapRemoteMessageToChatMessage);
    } catch (error) {
      if (error instanceof Error) {
        throw new MiraHostError('GET_MESSAGES_FAILED', error.message);
      }
      throw new MiraHostError('GET_MESSAGES_FAILED', 'Failed to get messages');
    }
  }

  async sendMessage(
    sessionId: string,
    content: string,
  ): Promise<AsyncIterable<string>> {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const session = await this.client.sendMessage({
      threadId: sessionId,
      messageId,
      content,
    });

    return (async function* (): AsyncGenerator<string> {
      try {
        for await (const event of session.events) {
          const streamEvent = event as RemoteChatStreamEvent;
          if (streamEvent.type === 'text-delta') {
            yield (streamEvent as { type: 'text-delta'; delta: string }).delta;
          } else if (streamEvent.type === 'error') {
            throw new MiraHostError('STREAM_ERROR', (streamEvent as { type: 'error'; errorText: string }).errorText);
          }
        }
      } finally {
        session.abort();
      }
    })();
  }
}
