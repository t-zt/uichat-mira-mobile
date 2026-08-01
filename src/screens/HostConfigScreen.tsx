import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Wifi,
} from 'lucide-react-native';
import type { RootStackParamList } from '../types/navigation';
import { useHostStore } from '../store/hostStore';
import { useTailscaleConnectivityStore } from '../store/tailscaleConnectivityStore';
import {
  tailscaleConnectivityMessage,
  type TailscaleConnectivityState,
} from '../connectivity/tailscaleConnectivity';
import {
  parsePairingUri,
  type PairingDescriptor,
} from '../protocol/remoteHostV1';
import { remoteMiraHostClient } from '../api/remoteMiraHost';
import { useRemotePairing } from '../pairing/useRemotePairing';
import { useTheme } from '../theme/ThemeContext';

const connectivityTitle = (state: TailscaleConnectivityState) => {
  switch (state) {
    case 'idle':
      return '尚未检查';
    case 'probing':
      return '正在检查完整链路';
    case 'ready':
      return '已联通';
    default:
      return '联通失败';
  }
};

const buildPairingUriFromRoute = (
  params: RootStackParamList['HostConfig'],
): string | null => {
  if (!params) return null;
  const { version, host, challenge, code } = params;
  if (!version && !host && !challenge && !code) return null;
  if (!version || !host || !challenge || !code) {
    throw new Error('配对链接缺少 version、host、challenge 或 code');
  }

  const query = new URLSearchParams({ version, host, challenge, code });
  return `mira://pair?${query.toString()}`;
};

export function HostConfigScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'HostConfig'>>();
  const { colors } = useTheme();
  const { config, setConfig, clearConfig, setConnectionStatus } = useHostStore();
  const connectivityState = useTailscaleConnectivityStore((state) => state.state);
  const connectivityResult = useTailscaleConnectivityStore((state) => state.result);
  const setConnectivityHostUrl = useTailscaleConnectivityStore(
    (state) => state.setHostUrl,
  );
  const probe = useTailscaleConnectivityStore((state) => state.probe);
  const resetConnectivity = useTailscaleConnectivityStore((state) => state.reset);

  const [hostUrl, setHostUrl] = useState(config?.hostUrl ?? '');
  const [pairingDescriptor, setPairingDescriptor] =
    useState<PairingDescriptor | null>(null);
  const [pairingLinkError, setPairingLinkError] = useState<string | null>(null);

  const routeVersion = route.params?.version;
  const routeHost = route.params?.host;
  const routeChallenge = route.params?.challenge;
  const routeCode = route.params?.code;

  const isProbing = connectivityState === 'probing';
  const isReady =
    connectivityState === 'ready' && connectivityResult?.hostUrl != null;
  const {
    state: pairingState,
    start: startPairing,
    reset: resetPairing,
    secureStorageAvailable,
  } = useRemotePairing(pairingDescriptor, isReady);

  useEffect(() => {
    if (config?.hostUrl) {
      setConnectivityHostUrl(config.hostUrl);
    }
  }, [config?.hostUrl, setConnectivityHostUrl]);

  useEffect(() => {
    try {
      const uri = buildPairingUriFromRoute(route.params);
      if (!uri) return;

      const descriptor = parsePairingUri(uri);
      setPairingDescriptor(descriptor);
      setPairingLinkError(null);
      setHostUrl(descriptor.hostUrl);
      setConnectivityHostUrl(descriptor.hostUrl);

      const current = useTailscaleConnectivityStore.getState();
      if (
        current.hostUrl !== descriptor.hostUrl ||
        (current.state !== 'probing' && current.state !== 'ready')
      ) {
        void current.probe(descriptor.hostUrl, 'manual');
      }
    } catch (error) {
      setPairingDescriptor(null);
      setPairingLinkError(
        error instanceof Error ? error.message : '无法读取桌面配对链接',
      );
    }
  }, [
    route.params,
    routeVersion,
    routeHost,
    routeChallenge,
    routeCode,
    setConnectivityHostUrl,
  ]);

  useEffect(() => {
    if (pairingState.phase !== 'paired' || !connectivityResult?.hostUrl) return;
    setConfig({
      hostUrl: connectivityResult.hostUrl,
      token: '',
    });
    setConnectionStatus('connected');
  }, [
    connectivityResult?.hostUrl,
    pairingState.phase,
    setConfig,
    setConnectionStatus,
  ]);

  const statusColor =
    connectivityState === 'ready'
      ? colors.status.success
      : connectivityState === 'idle' || connectivityState === 'probing'
        ? colors.status.warning
        : colors.status.error;

  const statusMessage = useMemo(() => {
    if (connectivityState === 'idle') {
      return '输入桌面 Mira 提供的 Tailscale Serve 地址后检查。';
    }
    if (connectivityState === 'probing') {
      return '正在依次检查 Tailnet 路由、MagicDNS、HTTPS Serve 与 Mira Host。';
    }
    return tailscaleConnectivityMessage(connectivityState);
  }, [connectivityState]);

  const pairingBusy =
    pairingState.phase === 'claiming' ||
    pairingState.phase === 'waiting_approval';
  const pairingCompleted = pairingState.phase === 'paired';
  const pairingActionDisabled =
    !pairingDescriptor ||
    !isReady ||
    !secureStorageAvailable ||
    pairingBusy ||
    pairingCompleted;

  const pairingTitle = (() => {
    switch (pairingState.phase) {
      case 'claiming':
        return '正在提交设备申请';
      case 'waiting_approval':
        return '等待桌面确认';
      case 'paired':
        return '设备已配对';
      case 'rejected':
        return '桌面已拒绝';
      case 'expired':
        return '配对请求已过期';
      case 'error':
      case 'blocked':
        return '设备配对未完成';
      default:
        return isReady
          ? pairingDescriptor
            ? '联通已通过，可申请桌面批准'
            : '等待设备配对'
          : '等待 Tailscale 联通';
    }
  })();

  const pairingMessage =
    pairingState.message ??
    (!secureStorageAvailable
      ? '当前构建尚无可用的系统安全存储，因此不会领取一次性设备凭证。'
      : 'Tailscale 可达不等于获得 Mira 权限。联通验证通过后仍需由桌面明确批准设备和权限。');

  const handleCheck = async () => {
    const target = hostUrl.trim();
    setConnectivityHostUrl(target);
    setConnectionStatus('connecting');

    try {
      const result = await probe(target, 'manual');
      if (result?.state === 'ready' && result.hostUrl) {
        setHostUrl(result.hostUrl);
        setConfig({
          hostUrl: result.hostUrl,
          token: config?.token ?? '',
        });
      }
    } finally {
      if (pairingState.phase !== 'paired') {
        // Transport reachability is not Mira authorization.
        setConnectionStatus('disconnected');
      }
    }
  };

  const handleSave = () => {
    if (!connectivityResult?.hostUrl || connectivityState !== 'ready') return;
    setConfig({
      hostUrl: connectivityResult.hostUrl,
      token: '',
    });
    navigation.goBack();
  };

  const handleDisconnect = async () => {
    if (secureStorageAvailable) {
      await remoteMiraHostClient.disconnect();
    }
    clearConfig();
    resetConnectivity();
    resetPairing();
    setHostUrl('');
    setPairingDescriptor(null);
    setPairingLinkError(null);
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.bg.canvas }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { borderBottomColor: colors.border.soft }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text.ink} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.ink }]}>远程连接</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.form}>
          {pairingDescriptor || pairingLinkError ? (
            <View style={[styles.card, { backgroundColor: colors.bg.card }]}>
              <View style={styles.sectionHeading}>
                <KeyRound
                  size={20}
                  color={pairingLinkError ? colors.status.error : colors.primary}
                />
                <Text style={[styles.sectionTitle, { color: colors.text.ink }]}>
                  桌面配对请求
                </Text>
              </View>
              {pairingDescriptor ? (
                <>
                  <Text style={[styles.authorizationTitle, { color: colors.text.ink }]}>
                    已载入一次性配对信息
                  </Text>
                  <Text style={[styles.authorizationText, { color: colors.text.muted }]}>
                    请求编号 {pairingDescriptor.challengeId.slice(0, 8)}… 已绑定到当前
                    Tailscale Serve 地址。只有联通状态进入 ready 后，Mobile 才会向桌面提交设备申请。
                  </Text>
                </>
              ) : (
                <Text style={[styles.authorizationText, { color: colors.status.error }]}>
                  {pairingLinkError}
                </Text>
              )}
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: colors.bg.card }]}>
            <View style={styles.sectionHeading}>
              <Wifi size={20} color={colors.text.ink} />
              <Text style={[styles.sectionTitle, { color: colors.text.ink }]}>
                Tailscale 联通
              </Text>
            </View>

            <Text style={[styles.label, { color: colors.text.muted }]}>Mira Host 地址</Text>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: colors.border.default,
                  backgroundColor: colors.bg.input,
                  color: colors.text.ink,
                },
              ]}
              value={hostUrl}
              onChangeText={(value) => {
                setHostUrl(value);
                setConnectivityHostUrl(value);
              }}
              placeholder="https://mira-desktop.tailnet-name.ts.net"
              placeholderTextColor={colors.text.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!isProbing && !pairingDescriptor}
            />

            <View
              style={[
                styles.statusBox,
                {
                  backgroundColor:
                    connectivityState === 'ready'
                      ? colors.bg.soft
                      : connectivityState === 'idle' ||
                          connectivityState === 'probing'
                        ? colors.bg.soft
                        : colors.status.errorBg,
                  borderColor: statusColor,
                },
              ]}
            >
              <View style={styles.statusHeader}>
                {isProbing ? (
                  <ActivityIndicator size="small" color={statusColor} />
                ) : connectivityState === 'ready' ? (
                  <CheckCircle2 size={18} color={statusColor} />
                ) : connectivityState === 'idle' ? (
                  <Wifi size={18} color={statusColor} />
                ) : (
                  <AlertTriangle size={18} color={statusColor} />
                )}
                <Text style={[styles.statusTitle, { color: colors.text.ink }]}>
                  {connectivityTitle(connectivityState)}
                </Text>
              </View>
              <Text style={[styles.statusText, { color: colors.text.muted }]}>
                {statusMessage}
              </Text>
              {connectivityResult?.identity ? (
                <Text style={[styles.detailText, { color: colors.text.soft }]}>
                  {connectivityResult.identity.displayName} · v
                  {connectivityResult.identity.version} · {connectivityResult.latencyMs ?? 0} ms
                </Text>
              ) : null}
              {connectivityResult?.detail && connectivityState !== 'ready' ? (
                <Text
                  style={[styles.detailText, { color: colors.text.soft }]}
                  numberOfLines={3}
                >
                  诊断：{connectivityResult.detail}
                </Text>
              ) : null}
            </View>

            <View style={[styles.hintBox, { backgroundColor: colors.bg.soft }]}>
              <Text style={[styles.hintText, { color: colors.text.muted }]}>
                生产连接应使用桌面 Mira 生成的 HTTPS Serve 地址。100.x IP 与明文 HTTP
                只保留给明确的开发诊断场景。
              </Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.bg.card }]}>
            <View style={styles.sectionHeading}>
              <ShieldCheck size={20} color={colors.text.ink} />
              <Text style={[styles.sectionTitle, { color: colors.text.ink }]}>
                Mira 授权
              </Text>
            </View>
            <Text style={[styles.authorizationTitle, { color: colors.text.ink }]}>
              {pairingTitle}
            </Text>
            <Text style={[styles.authorizationText, { color: colors.text.muted }]}>
              {pairingMessage}
            </Text>
            {pairingState.scopes.length > 0 ? (
              <Text style={[styles.detailText, { color: colors.text.soft }]}>
                已批准权限：{pairingState.scopes.join(' · ')}
              </Text>
            ) : null}

            {pairingDescriptor ? (
              <Pressable
                style={({ pressed }) => [
                  styles.pairBtn,
                  { backgroundColor: colors.primary },
                  (pairingActionDisabled || pressed) && {
                    backgroundColor: colors.primaryDisabled,
                  },
                ]}
                onPress={startPairing}
                disabled={pairingActionDisabled}
              >
                {pairingBusy ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : pairingCompleted ? (
                  <CheckCircle2 size={18} color={colors.onPrimary} />
                ) : (
                  <KeyRound size={18} color={colors.onPrimary} />
                )}
                <Text style={[styles.pairBtnText, { color: colors.onPrimary }]}>
                  {pairingState.phase === 'waiting_approval'
                    ? '等待桌面确认'
                    : pairingCompleted
                      ? '设备已配对'
                      : '提交设备配对申请'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.checkBtn,
              { borderColor: colors.primary },
              pressed && { backgroundColor: colors.bg.soft },
            ]}
            onPress={handleCheck}
            disabled={isProbing || !hostUrl.trim()}
          >
            {isProbing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <RefreshCw size={18} color={colors.primary} />
            )}
            <Text style={[styles.checkBtnText, { color: colors.primary }]}>
              {isProbing ? '正在检查' : '检查 Tailscale 联通'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: colors.primary },
              (!isReady || pressed) && {
                backgroundColor: colors.primaryDisabled,
              },
            ]}
            onPress={handleSave}
            disabled={!isReady}
          >
            <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>
              保存此主机
            </Text>
          </Pressable>

          {config ? (
            <Pressable
              style={[styles.disconnectBtn, { borderColor: colors.status.errorBg }]}
              onPress={handleDisconnect}
            >
              <Text style={[styles.disconnectBtnText, { color: colors.status.error }]}>
                断开并清除设备授权
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingHorizontal: 4, paddingVertical: 4, minWidth: 36 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: { minWidth: 36 },
  container: { flex: 1 },
  form: { padding: 20, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    marginBottom: 14,
  },
  statusBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  statusTitle: { fontSize: 15, fontWeight: '700' },
  statusText: { fontSize: 13, lineHeight: 20 },
  detailText: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  hintBox: { borderRadius: 10, padding: 12 },
  hintText: { fontSize: 13, lineHeight: 20 },
  authorizationTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  authorizationText: { fontSize: 13, lineHeight: 20 },
  pairBtn: {
    minHeight: 46,
    marginTop: 16,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  pairBtnText: { fontSize: 14, fontWeight: '700' },
  checkBtn: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkBtnText: { fontSize: 15, fontWeight: '700' },
  saveBtn: {
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '700' },
  disconnectBtn: {
    marginTop: 16,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disconnectBtnText: { fontSize: 15, fontWeight: '600' },
});
