import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { miraHostClient } from '../api/miraHostClient';
import { useHostStore } from '../store/hostStore';
import { useTailscaleConnectivityStore } from '../store/tailscaleConnectivityStore';
import { subscribeToSystemNetworkChanges } from './systemNetworkMonitor';

/**
 * Keeps the observable Direct/Tailscale transport state fresh. In paired
 * Remote Host mode, a failed Direct probe does not mark the whole connection
 * offline while Relay remains an available fallback.
 */
export function TailscaleConnectivityLifecycle() {
  const configuredHostUrl = useHostStore((state) => state.config?.hostUrl ?? '');
  const setHostUrl = useTailscaleConnectivityStore((state) => state.setHostUrl);
  const probe = useTailscaleConnectivityStore((state) => state.probe);
  const connectivityState = useTailscaleConnectivityStore((state) => state.state);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastConfiguredHost = useRef('');
  const networkRecoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (configuredHostUrl || !miraHostClient.isSecureStorageAvailable()) {
      return () => {
        cancelled = true;
      };
    }

    miraHostClient
      .getStoredHostUrl()
      .then((storedHostUrl) => {
        if (cancelled || !storedHostUrl) return;
        useHostStore.getState().setConfig({
          hostUrl: storedHostUrl,
          token: '',
        });
      })
      .catch(() => {
        if (!cancelled && !miraHostClient.hasRelayFallback()) {
          useHostStore.getState().setConnectionStatus('disconnected');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configuredHostUrl]);

  useEffect(() => {
    const target = configuredHostUrl.trim();
    if (!target) return;

    setHostUrl(target);
    if (lastConfiguredHost.current !== target) {
      lastConfiguredHost.current = target;
      void probe(target, 'startup');
    }
  }, [configuredHostUrl, probe, setHostUrl]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground =
        appState.current === 'background' || appState.current === 'inactive';
      appState.current = nextState;

      const target = useTailscaleConnectivityStore.getState().hostUrl.trim();
      const currentState = useTailscaleConnectivityStore.getState().state;
      if (
        wasBackground &&
        nextState === 'active' &&
        target &&
        currentState !== 'probing'
      ) {
        void useTailscaleConnectivityStore
          .getState()
          .probe(target, 'foreground');
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToSystemNetworkChanges(() => {
      if (networkRecoveryTimer.current) {
        clearTimeout(networkRecoveryTimer.current);
      }

      networkRecoveryTimer.current = setTimeout(() => {
        const store = useTailscaleConnectivityStore.getState();
        const target = store.hostUrl.trim();
        if (!target || store.state === 'probing') return;
        void store.probe(target, 'network-recovery');
      }, 900);
    });

    return () => {
      unsubscribe();
      if (networkRecoveryTimer.current) {
        clearTimeout(networkRecoveryTimer.current);
        networkRecoveryTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hostState = useHostStore.getState();

    if (connectivityState === 'probing') {
      if (
        hostState.connectionStatus === 'connected' &&
        !miraHostClient.hasRelayFallback()
      ) {
        hostState.setConnectionStatus('reconnecting');
      }
      return () => {
        cancelled = true;
      };
    }

    if (connectivityState === 'ready') {
      if (!miraHostClient.isSecureStorageAvailable()) {
        hostState.setConnectionStatus('disconnected');
        return () => {
          cancelled = true;
        };
      }

      void miraHostClient
        .restoreConnection()
        .then((restored) => {
          if (cancelled) return;
          useHostStore
            .getState()
            .setConnectionStatus(restored ? 'connected' : 'disconnected');
        })
        .catch(() => {
          if (cancelled) return;
          if (!miraHostClient.hasRelayFallback()) {
            useHostStore.getState().setConnectionStatus('disconnected');
          }
        });

      return () => {
        cancelled = true;
      };
    }

    if (connectivityState !== 'idle' && !miraHostClient.hasRelayFallback()) {
      const status = hostState.connectionStatus;
      if (
        status === 'connected' ||
        status === 'connecting' ||
        status === 'reconnecting'
      ) {
        hostState.setConnectionStatus('reconnecting');
      }
    }

    return () => {
      cancelled = true;
    };
  }, [connectivityState]);

  useEffect(() => {
    const transientHostUrl = useTailscaleConnectivityStore
      .getState()
      .hostUrl.trim();
    if (
      !configuredHostUrl &&
      !transientHostUrl &&
      connectivityState !== 'idle'
    ) {
      useTailscaleConnectivityStore.getState().reset();
      lastConfiguredHost.current = '';
    }
  }, [configuredHostUrl, connectivityState]);

  return null;
}
