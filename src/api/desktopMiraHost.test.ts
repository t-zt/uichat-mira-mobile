import { DesktopMiraHostClient } from './desktopMiraHost';
import { MemoryDesktopCredentialStore } from '../security/desktopCredentialStore';
import type { DesktopCredential } from '../security/desktopCredentialStore';
import { MiraHostError } from './miraHost';

const makeCredential = (overrides: Partial<DesktopCredential> = {}): DesktopCredential => ({
  hostUrl: 'https://host.example',
  token: 'jwt-token',
  username: 'Tomz',
  savedAt: new Date().toISOString(),
  ...overrides,
});

describe('DesktopMiraHostClient', () => {
  it('maps remote threads to sessions in listSessions', async () => {
    const store = new MemoryDesktopCredentialStore();
    await store.save(makeCredential());

    const client = new DesktopMiraHostClient(store);
    const jsonTransport = jest.fn().mockResolvedValue([
      {
        id: 't1',
        title: 'Hello',
        modelName: null,
        workspaceId: null,
        knowledgeBaseId: null,
        roleId: null,
        agentEnabled: false,
        status: 'active',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
        messageCount: 2,
      },
    ]);
    (client as unknown as { requestJson: unknown }).requestJson = jsonTransport;

    const sessions = await client.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual({
      id: 't1',
      title: 'Hello',
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    });
    expect(jsonTransport).toHaveBeenCalledWith(
      expect.objectContaining({ hostUrl: 'https://host.example' }),
      expect.objectContaining({
        path: '/threads?status=active&sortBy=updatedAt&sortOrder=desc',
      }),
    );
  });

  it('maps remote messages to chat messages in getMessages', async () => {
    const store = new MemoryDesktopCredentialStore();
    await store.save(makeCredential());

    const client = new DesktopMiraHostClient(store);
    const jsonTransport = jest.fn().mockResolvedValue([
      {
        id: 'm1',
        threadId: 't1',
        role: 'user',
        content: 'hi',
        parts: [{ type: 'text', text: 'hi' }],
        metadata: {},
        createdAt: '2026-08-02T00:00:00.000Z',
      },
    ]);
    (client as unknown as { requestJson: unknown }).requestJson = jsonTransport;

    const messages = await client.getMessages('t1');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      id: 'm1',
      role: 'user',
      content: 'hi',
      timestamp: new Date('2026-08-02T00:00:00.000Z'),
    });
  });

  it('streams only text-delta chunks from the chat SSE session', async () => {
    const store = new MemoryDesktopCredentialStore();
    await store.save(makeCredential());

    const client = new DesktopMiraHostClient(store);

    const sseSession = {
      events: (async function* () {
        yield { type: 'start' as const };
        yield { type: 'text-delta' as const, id: 'a', delta: '你' };
        yield { type: 'text-delta' as const, id: 'a', delta: '好' };
        yield { type: 'finish' as const, finishReason: 'stop' as const };
      })(),
      abort: jest.fn(),
    };

    let acc = '';
    for await (const chunk of client.toTextStream(sseSession)) {
      acc += chunk;
    }
    expect(acc).toBe('你好');
  });

  it('propagates error events from the chat SSE session', async () => {
    const store = new MemoryDesktopCredentialStore();
    await store.save(makeCredential());

    const client = new DesktopMiraHostClient(store);

    const sseSession = {
      events: (async function* () {
        yield { type: 'error' as const, errorText: '模型超时' };
      })(),
      abort: jest.fn(),
    };

    const chunks: string[] = [];
    let thrown: unknown = null;
    try {
      for await (const chunk of client.toTextStream(sseSession)) {
        chunks.push(chunk);
      }
    } catch (error) {
      thrown = error;
    }

    expect(chunks).toEqual([]);
    expect(thrown).not.toBeNull();
    expect((thrown as { message?: string }).message).toContain('模型超时');
  });

  it('throws a typed error when not connected', async () => {
    const store = new MemoryDesktopCredentialStore();
    const client = new DesktopMiraHostClient(store);

    let thrown: unknown = null;
    try {
      await client.listSessions();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).not.toBeNull();
    expect(thrown).toBeInstanceOf(MiraHostError);
  });
});

jest.mock('./remoteHttp', () => ({
  requestRemoteJson: jest.fn(),
  RemoteHostError: jest.requireActual('./remoteHttp').RemoteHostError,
}));

import { requestRemoteJson } from './remoteHttp';
import { useHostStore } from '../store/hostStore';

const mockedRequestRemoteJson = requestRemoteJson as jest.Mock;

// 模拟真实 requestRemoteJson：raw 模式下把响应体直接交给 parse。
const respondWith = (body: unknown) => {
  mockedRequestRemoteJson.mockImplementation(async ({ parse }: { parse: (v: unknown) => unknown }) =>
    parse(body),
  );
};

describe('DesktopMiraHostClient login', () => {
  beforeEach(() => {
    mockedRequestRemoteJson.mockReset();
    useHostStore.getState().clearConfig();
  });

  it('accepts the standard success envelope', async () => {
    respondWith({
      success: true,
      data: { token: 'jwt-1', tokenType: 'Bearer', user: { id: 1, username: 'Tomz', role: 'admin' } },
    });

    const store = new MemoryDesktopCredentialStore();
    const client = new DesktopMiraHostClient(store);
    await client.login('https://host.example', 'Tomz', '123456');

    const saved = await store.load();
    expect(saved?.token).toBe('jwt-1');
    expect(saved?.username).toBe('Tomz');
    expect(useHostStore.getState().connectionStatus).toBe('connected');
  });

  it('accepts a bare object without the success envelope', async () => {
    respondWith({
      token: 'jwt-2',
      user: { username: 'Dang' },
    });

    const store = new MemoryDesktopCredentialStore();
    const client = new DesktopMiraHostClient(store);
    await client.login('https://host.example', 'Dang', '123456');

    const saved = await store.load();
    expect(saved?.token).toBe('jwt-2');
    expect(saved?.username).toBe('Dang');
  });

  it('surfaces the server error message for a failed envelope', async () => {
    respondWith({
      success: false,
      message: 'Invalid username or password',
    });

    const store = new MemoryDesktopCredentialStore();
    const client = new DesktopMiraHostClient(store);

    let thrown: unknown = null;
    try {
      await client.login('https://host.example', 'Tomz', 'wrong');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MiraHostError);
    expect((thrown as MiraHostError).code).toBe('LOGIN_FAILED');
    expect((thrown as MiraHostError).message).toContain('Invalid username or password');
  });

  it('reports an unrecognizable response with its body for diagnosis', async () => {
    respondWith({ foo: 'bar' });

    const store = new MemoryDesktopCredentialStore();
    const client = new DesktopMiraHostClient(store);

    let thrown: unknown = null;
    try {
      await client.login('https://host.example', 'Tomz', '123456');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MiraHostError);
    expect((thrown as MiraHostError).code).toBe('INVALID_LOGIN_RESPONSE');
    expect(String((thrown as MiraHostError).details)).toContain('foo');
  });
});
