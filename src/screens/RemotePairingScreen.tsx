import React, { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CheckCircle2, Link2, XCircle } from 'lucide-react-native';
import type { RootStackParamList } from '../types/navigation';
import { parsePairingUriV1 } from '../protocol/remotePairingV1';
import { useRemotePairing } from '../pairing/useRemotePairing';
import { useTailscaleConnectivityStore } from '../store/tailscaleConnectivityStore';
import { miraHostClient } from '../api/miraHostClient';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, radius, spacing } from '../theme/tokens';

const toPairingUri = (params: RootStackParamList['Pairing']) => {
  const query = new URLSearchParams();
  const fields: Array<[string, string | undefined]> = [
    ['version', params.version],
    ['host', params.host],
    ['relay', params.relay],
    ['relayId', params.relayId],
    ['relayToken', params.relayToken],
    ['challenge', params.challenge],
    ['code', params.code],
  ];
  for (const [key, value] of fields) {
    if (value) query.set(key, value);
  }
  return `mira://pair?${query.toString()}`;
};

export function RemotePairingScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Pairing'>>();
  const { colors } = useTheme();
  const connectivityState = useTailscaleConnectivityStore(state => state.state);
  const setConnectivityHostUrl = useTailscaleConnectivityStore(
    state => state.setHostUrl,
  );
  const startAttempted = useRef(false);
  const activationStarted = useRef(false);

  const parsed = useMemo(() => {
    try {
      return {
        descriptor: parsePairingUriV1(toPairingUri(route.params)),
        error: null,
      };
    } catch (error) {
      return {
        descriptor: null,
        error: error instanceof Error ? error.message : '无效的 Mira 配对链接',
      };
    }
  }, [route.params]);

  const pairing = useRemotePairing(
    parsed.descriptor,
    connectivityState === 'ready',
  );

  useEffect(() => {
    const directHost = parsed.descriptor?.hostUrl;
    if (!directHost) return;

    setConnectivityHostUrl(directHost);
    const store = useTailscaleConnectivityStore.getState();
    if (store.state !== 'probing' && store.state !== 'ready') {
      void store.probe(directHost, 'manual');
    }
  }, [parsed.descriptor?.hostUrl, setConnectivityHostUrl]);

  useEffect(() => {
    const descriptor = parsed.descriptor;
    if (!descriptor || startAttempted.current) return;

    const canStart = Boolean(descriptor.relay) || connectivityState === 'ready';
    if (!canStart) return;

    startAttempted.current = true;
    void pairing.start();
  }, [connectivityState, pairing, parsed.descriptor]);

  useEffect(() => {
    if (pairing.state.phase !== 'paired' || activationStarted.current) return;
    activationStarted.current = true;

    void miraHostClient
      .activateRemoteDevice()
      .then(() => {
        navigation.reset({ index: 0, routes: [{ name: 'SessionList' }] });
      })
      .catch(() => {
        activationStarted.current = false;
      });
  }, [navigation, pairing.state.phase]);

  const phase = pairing.state.phase;
  const busy = phase === 'claiming' || phase === 'waiting_approval';
  const success = phase === 'paired';
  const failed =
    phase === 'error' || phase === 'rejected' || phase === 'expired' || Boolean(parsed.error);
  const message =
    parsed.error ??
    pairing.state.message ??
    (parsed.descriptor?.relay
      ? '正在通过远程连接与桌面端配对。'
      : '正在检查桌面端直连。');

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.bg.canvas }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: colors.bg.card,
              borderColor: colors.border.default,
            },
          ]}
        >
          {success ? (
            <CheckCircle2 size={36} color={colors.status.success} />
          ) : failed ? (
            <XCircle size={36} color={colors.status.error} />
          ) : (
            <Link2 size={36} color={colors.primary} />
          )}
        </View>

        <Text style={[styles.title, { color: colors.text.ink }]}>连接 Mira Desktop</Text>
        <Text style={[styles.message, { color: colors.text.muted }]}>{message}</Text>

        {busy || (!parsed.error && phase === 'idle') ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : null}

        {failed ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.replace('HostConfig')}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>返回连接设置</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.titleLg,
    fontWeight: '600',
  },
  message: {
    fontSize: fontSize.bodyMd,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
  },
  button: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
  },
  buttonText: {
    fontSize: fontSize.button,
    fontWeight: '600',
  },
});
