import { parseRemoteChatStreamEvent } from '../protocol/remoteHostV1';
import { RemoteHostError } from './remoteHttp';
import { SseFrameDecoder } from './postSse';

describe('SseFrameDecoder', () => {
  it('parses events split across network chunks', () => {
    const decoder = new SseFrameDecoder(parseRemoteChatStreamEvent);

    expect(decoder.feed('data: {"type":"text-del')).toEqual([]);
    expect(
      decoder.feed('ta","id":"text-1","delta":"你"}\n\ndata: {"type":"text-delta","id":"text-1","delta":"好"}\n\n'),
    ).toEqual([
      { type: 'text-delta', id: 'text-1', delta: '你' },
      { type: 'text-delta', id: 'text-1', delta: '好' },
    ]);
  });

  it('stops after the canonical done marker', () => {
    const decoder = new SseFrameDecoder(parseRemoteChatStreamEvent);

    expect(
      decoder.feed(
        'data: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\ndata: {"type":"text-delta","id":"text-1","delta":"ignored"}\n\n',
      ),
    ).toEqual([{ type: 'finish', finishReason: 'stop' }]);
    expect(decoder.finish()).toEqual([]);
  });

  it('supports CRLF and multiline SSE data fields', () => {
    const decoder = new SseFrameDecoder((value) => value);

    expect(
      decoder.feed('data: {"type":"error",\r\ndata: "errorText":"boom"}\r\n\r\n'),
    ).toEqual([{ type: 'error', errorText: 'boom' }]);
  });

  it('rejects invalid JSON instead of swallowing the stream error', () => {
    const decoder = new SseFrameDecoder(parseRemoteChatStreamEvent);

    expect(() => decoder.feed('data: not-json\n\n')).toThrow(RemoteHostError);
  });
});
