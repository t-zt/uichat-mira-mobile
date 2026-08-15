import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  remoteMiraHostClient,
  type PendingPairing,
} from '../api/remoteMiraHost';
import {
  REMOTE_DEVICE_SCOPES,
  type RemoteDeviceScope,
} from '../protocol/remoteHostV1';
import type { PairingDescriptorV1 } from '../protocol/remotePairingV1';
import { isRelayTransportError } from '../api/remoteRelay';

const PAIRING_LOG_ENABLED = __DEV__;

const logPairing = (level: 'debug' | 'info' | 'warn' | 'error', message: string, details?: unknown) => {
  if (!PAIRING_LOG_ENABLED) return;
  const tag = '[Pairing]';
  const fn = level === 'debug' ? console.log
    : level === 'info' ? console.info
    : level === 'warn' ? console.warn
    : console.error;
  if (details === undefined) fn(`${tag} ${message}`);
  else fn(`${tag} ${message}`, details);
};

export type RemotePairingPhase =
  | 'idle'
  | 'blocked'
  | 'claiming'
  | 'waiting_approval'
  | 'paired'
  | 'rejected'
  | 'expired'
  | 'error';

export type TransportMode = 'auto' | 'direct' | 'relay';

export interface RemotePairingViewState {
  phase: RemotePairingPhase;
  pending: PendingPairing | null;
  deviceId: string | null;
  scopes: RemoteDeviceScope[];
  message: string | null;
}

const INITIAL_STATE: RemotePairingViewState = {
  phase: 'idle',
  pending: null,
  deviceId: null,
  scopes: [],
  message: null,
};

const POLL_INTERVAL_MS = 1_500;

export interface UseRemotePairingOptions {
  descriptor: PairingDescriptorV1 | null;
  connectivityReady?: boolean;
  transportMode?: TransportMode;
}

export const useRemotePairing = ({
  descriptor,
  connectivityReady = false,
  transportMode = 'auto',
}: UseRemotePairingOptions) => {
  const [state, setState] = useState<RemotePairingViewState>(INITIAL_STATE);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingGeneration = useRef(0);

  const stopPolling = useCallback(() => {
    pollingGeneration.current += 1;
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setState(INITIAL_STATE);
  }, [stopPolling]);

  useEffect(() => {
    reset();
  }, [
    descriptor?.challengeId,
    descriptor?.hostUrl,
    descriptor?.relay?.endpoint,
    descriptor?.relay?.relayId,
    reset,
  ]);

  useEffect(() => stopPolling, [stopPolling]);

  const beginPolling = useCallback(
    (pending: PendingPairing) => {
      const generation = ++pollingGeneration.current;
      logPairing('info', `beginPolling started claimId=${pending.claimId} transport=${pending.transport}`);

      const pollOnce = async () => {
        if (generation !== pollingGeneration.current) return;

        try {
          const result = await remoteMiraHostClient.pollPairing(pending);
          if (generation !== pollingGeneration.current) return;

          logPairing('debug', `pollOnce status=${result.status}`);

          if (result.credential && result.deviceId) {
            logPairing('info', 'pollOnce: PAIRED - credential received');
            stopPolling();
            setState({
              phase: 'paired',
              pending,
              deviceId: result.deviceId,
              scopes: result.scopes,
              message: '桌面已批准，设备凭证已安全保存。',
            });
            return;
          }

          if (result.status === 'rejected') {
            logPairing('info', 'pollOnce: REJECTED by desktop');
            stopPolling();
            setState({
              phase: 'rejected',
              pending,
              deviceId: null,
              scopes: [],
              message: '桌面已拒绝此设备请求。',
            });
            return;
          }

          if (result.status === 'expired') {
            logPairing('info', 'pollOnce: EXPIRED');
            stopPolling();
            setState({
              phase: 'expired',
              pending,
              deviceId: null,
              scopes: [],
              message: '一次性配对请求已过期，请在桌面重新生成。',
            });
            return;
          }

          if (result.status === 'delivered') {
            logPairing('warn', 'pollOnce: DELIVERED but no credential (stale claim)');
            stopPolling();
            setState({
              phase: 'error',
              pending,
              deviceId: result.deviceId,
              scopes: result.scopes,
              message: '设备凭证已被领取，但本机没有完成保存，请重新配对。',
            });
            return;
          }

          logPairing('debug', `pollOnce: still waiting (${result.status})`);
          setState(current => ({
            ...current,
            phase: 'waiting_approval',
            pending,
            message: '已向桌面提交设备申请，等待桌面确认。',
          }));
          pollTimer.current = setTimeout(pollOnce, POLL_INTERVAL_MS);
        } catch (error) {
          if (generation !== pollingGeneration.current) return;
          const code = error instanceof Error ? error.message : 'unknown';
          logPairing('error', `pollOnce ERROR: ${code}`, error);
          stopPolling();
          const message = isRelayTransportError(error)
            ? `Relay 连接中断：${error instanceof Error ? error.message : '未知错误'}。请检查网络或桌面连接状态后重试。`
            : error instanceof Error ? error.message : '配对状态检查失败';
          setState({
            phase: 'error',
            pending,
            deviceId: null,
            scopes: [],
            message,
          });
        }
      };

      void pollOnce();
    },
    [stopPolling],
  );

  const start = useCallback(async () => {
    if (!descriptor) {
      logPairing('warn', 'start: blocked - no descriptor');
      setState({
        ...INITIAL_STATE,
        phase: 'blocked',
        message: '请先从桌面打开有效的 Mira 配对链接。',
      });
      return;
    }

    const isRelayMode = transportMode === 'relay';
    const isAutoMode = transportMode === 'auto';
    const hasRelayEndpoint = Boolean(descriptor.relay);

    logPairing('info', `start: mode=${transportMode} hasRelay=${hasRelayEndpoint} challengeId=${descriptor.challengeId}`);

    if (isRelayMode && !hasRelayEndpoint) {
      logPairing('warn', 'start: blocked - relay mode but no relay endpoint in descriptor');
      setState({
        ...INITIAL_STATE,
        phase: 'blocked',
        message: 'Relay 模式需要配对链接中包含 Relay endpoint。',
      });
      return;
    }

    if (!isRelayMode && !connectivityReady) {
      if (isAutoMode && hasRelayEndpoint) {
        logPairing('info', 'start: Direct not ready, proceeding with Auto+Relay fallback');
      } else {
        logPairing('warn', 'start: blocked - connectivity not ready');
        setState({
          ...INITIAL_STATE,
          phase: 'blocked',
          message: isAutoMode
            ? '等待网络连接中，请确保 Direct 或 Relay 可用。'
            : 'Direct 联通尚未通过，未提交配对申请。',
        });
        return;
      }
    }

    if (!remoteMiraHostClient.isSecureStorageAvailable()) {
      logPairing('warn', 'start: blocked - no secure storage');
      setState({
        ...INITIAL_STATE,
        phase: 'blocked',
        message: '当前构建没有可用的系统安全存储，未领取一次性凭证。',
      });
      return;
    }

    stopPolling();
    const generation = pollingGeneration.current;
    setState({
      ...INITIAL_STATE,
      phase: 'claiming',
      message: isRelayMode
        ? '正在通过 Relay 向 Mira Desktop 提交设备申请。'
        : '正在向 Mira Desktop 提交设备申请。',
    });

    logPairing('info', 'start: calling claimPairing...');
    try {
      const claim = await remoteMiraHostClient.claimPairing(descriptor, {
        name: `Mira Mobile (${Platform.OS})`,
        platform: Platform.OS,
        requestedScopes: [...REMOTE_DEVICE_SCOPES],
      });
      if (generation !== pollingGeneration.current) {
        logPairing('warn', 'start: claim returned but generation changed, discarding');
        return;
      }

      logPairing('info', `start: claim OK claimId=${claim.claimId} transport=${claim.transport}`);

      const pending: PendingPairing = {
        descriptor,
        transport: claim.transport,
        claimId: claim.claimId,
        pollToken: claim.pollToken,
        expiresAt: claim.expiresAt,
      };
      setState({
        phase: 'waiting_approval',
        pending,
        deviceId: null,
        scopes: [],
        message:
          claim.transport === 'relay'
            ? '已通过 Mira Relay 提交设备申请，等待桌面确认。'
            : '已通过 Direct 传输提交设备申请，等待桌面确认。',
      });
      beginPolling(pending);
    } catch (error) {
      if (generation !== pollingGeneration.current) return;
      const errMsg = error instanceof Error ? error.message : String(error);
      logPairing('error', `start: claimPairing FAILED: ${errMsg}`, error);
      const message = (() => {
        if (isRelayTransportError(error)) {
          return `Relay 传输错误：${error instanceof Error ? error.message : '未知错误'}。请确认 Mira Desktop 已连接并重新生成配对二维码。`;
        }
        if (error instanceof Error) return error.message;
        return '提交配对申请失败';
      })();
      setState({
        ...INITIAL_STATE,
        phase: 'error',
        message,
      });
    }
  }, [beginPolling, connectivityReady, descriptor, stopPolling, transportMode]);

  return {
    state,
    start,
    reset,
    stopPolling,
    secureStorageAvailable: remoteMiraHostClient.isSecureStorageAvailable(),
    isRelayMode: transportMode === 'relay',
  };
};
