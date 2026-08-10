import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Laptop,
  LogOut,
  Wifi,
} from 'lucide-react-native';
import type { RootStackParamList } from '../types/navigation';
import { useHostStore } from '../store/hostStore';
import { useTailscaleConnectivityStore } from '../store/tailscaleConnectivityStore';
import {
  tailscaleConnectivityMessage,
  type TailscaleConnectivityState,
} from '../connectivity/tailscaleConnectivity';
import { desktopMiraHostClient } from '../api/desktopMiraHost';
import { useTheme } from '../theme/ThemeContext';
import { MiraHostError } from '../api/miraHost';

const connectivityTitle = (state: TailscaleConnectivityState) => {
  switch (state) {
    case 'idle':
      return '未检查';
    case 'probing':
      return '检查中';
    case 'ready':
      return '已连接';
    default:
      return '连接失败';
  }
};

export function HostConfigScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'HostConfig'>>();
  const { colors } = useTheme();
  const { config, clearConfig, setConnectionStatus } = useHostStore();
  const connectivityState = useTailscaleConnectivityStore(state => state.state);
  const connectivityResult = useTailscaleConnectivityStore(
    state => state.result,
  );
  const setConnectivityHostUrl = useTailscaleConnectivityStore(
    state => state.setHostUrl,
  );
  const resetConnectivity = useTailscaleConnectivityStore(state => state.reset);

  const [hostInput, setHostInput] = useState(
    (route.params as { host?: string } | undefined)?.host ?? '',
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const isProbing = connectivityState === 'probing';

  const applyHost = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      setHostInput(value);
      if (!trimmed) return;
      setConnectivityHostUrl(trimmed);
      const current = useTailscaleConnectivityStore.getState();
      if (
        current.hostUrl !== trimmed ||
        (current.state !== 'probing' && current.state !== 'ready')
      ) {
        current.probe(trimmed, 'manual').catch(() => {
          // 探测失败状态已写入 store，这里不打断表单输入。
        });
      }
    },
    [setConnectivityHostUrl],
  );

  useEffect(() => {
    if (config?.hostUrl) {
      setConnectivityHostUrl(config.hostUrl);
    }
  }, [config?.hostUrl, setConnectivityHostUrl]);

  const handleLogin = useCallback(async () => {
    const host = hostInput.trim();
    if (!host || !username.trim() || !password) {
      setLoginError('请填写完整的地址、用户名和密码');
      return;
    }
    if (isLoggingIn) return;

    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await desktopMiraHostClient.login(host, username, password);
      setConnectionStatus('connected');
      navigation.reset({ index: 0, routes: [{ name: 'SessionList' }] });
    } catch (error) {
      const details =
        error instanceof MiraHostError
          ? error.details
          : error instanceof Error
          ? undefined
          : undefined;
      const message =
        error instanceof MiraHostError
          ? error.message
          : error instanceof Error
          ? error.message
          : '登录失败，请检查地址与账号';
      const detailText =
        typeof details === 'string' && details.trim()
          ? `\n（服务端返回：${details}）`
          : '';
      setLoginError(`${message}${detailText}`);
    } finally {
      setIsLoggingIn(false);
    }
  }, [hostInput, username, password, isLoggingIn, navigation, setConnectionStatus]);

  const handleDisconnect = useCallback(async () => {
    try {
      await desktopMiraHostClient.disconnect();
    } catch {
      // 忽略断开时的清理错误
    }
    clearConfig();
    resetConnectivity();
    setPassword('');
  }, [clearConfig, resetConnectivity]);

  const statusColor =
    connectivityState === 'ready'
      ? colors.status.success
      : connectivityState === 'idle' || connectivityState === 'probing'
      ? colors.status.warning
      : colors.status.error;

  const statusMessage = useMemo(() => {
    if (connectivityState === 'idle') {
      return '输入桌面端地址后自动检查连接。';
    }
    if (connectivityState === 'probing') {
      return '正在检查网络与 Mira Host。';
    }
    return tailscaleConnectivityMessage(connectivityState);
  }, [connectivityState]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('SessionList');
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.bg.canvas }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { borderBottomColor: colors.border.soft }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: colors.bg.soft,
              borderColor: colors.border.default,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <ChevronLeft size={24} color={colors.text.ink} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.ink }]}>
          连接桌面端
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View
              style={[
                styles.heroIcon,
                {
                  backgroundColor: colors.bg.card,
                  borderColor: colors.border.default,
                },
              ]}
            >
              <Laptop size={38} color={colors.primary} strokeWidth={1.6} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.text.ink }]}>
              连接 Mira Host
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.text.muted }]}>
              通过 Tailscale 访问桌面端会话，登录你的 Mira 本地账号
            </Text>
          </View>

          {/* ── 连接状态 ─────────────────────── */}
          <View style={styles.section}>
            <View
              style={[
                styles.statusBox,
                {
                  backgroundColor:
                    connectivityState === 'ready' ||
                    connectivityState === 'probing' ||
                    connectivityState === 'idle'
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
              {connectivityState !== 'ready' ? (
                <Text style={[styles.statusText, { color: colors.text.muted }]}>
                  {statusMessage}
                </Text>
              ) : null}
              {connectivityResult?.identity ? (
                <Text style={[styles.detailText, { color: colors.text.soft }]}>
                  {connectivityResult.identity.displayName} · v
                  {connectivityResult.identity.version} ·{' '}
                  {connectivityResult.latencyMs ?? 0} ms
                </Text>
              ) : null}
            </View>
          </View>

          {/* ── 登录表单 ─────────────────────── */}
          <View style={styles.section}>
            <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>
              桌面端地址
            </Text>
            <TextInput
              accessibilityLabel="桌面端地址"
              style={[
                styles.input,
                {
                  borderColor: colors.border.default,
                  backgroundColor: colors.bg.input,
                  color: colors.text.ink,
                },
              ]}
              value={hostInput}
              onChangeText={applyHost}
              placeholder="https://my-machine.tailnet.ts.net"
              placeholderTextColor={colors.text.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>
              用户名
            </Text>
            <TextInput
              accessibilityLabel="用户名"
              style={[
                styles.input,
                {
                  borderColor: colors.border.default,
                  backgroundColor: colors.bg.input,
                  color: colors.text.ink,
                },
              ]}
              value={username}
              onChangeText={setUsername}
              placeholder="桌面端本地账号（如 Tomz）"
              placeholderTextColor={colors.text.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>
              密码
            </Text>
            <TextInput
              accessibilityLabel="密码"
              style={[
                styles.input,
                {
                  borderColor: colors.border.default,
                  backgroundColor: colors.bg.input,
                  color: colors.text.ink,
                },
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder="桌面端登录密码"
              placeholderTextColor={colors.text.placeholder}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleLogin}
            />

            {loginError ? (
              <Text style={[styles.errorText, { color: colors.status.error }]}>
                {loginError}
              </Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.loginBtn,
                { backgroundColor: colors.primary },
                (isLoggingIn || pressed) && {
                  backgroundColor: pressed && !isLoggingIn ? colors.primaryActive : colors.primaryDisabled,
                },
              ]}
              onPress={handleLogin}
              disabled={isLoggingIn}
            >
              {isLoggingIn ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <KeyRound size={18} color={colors.onPrimary} />
              )}
              <Text style={[styles.loginBtnText, { color: colors.onPrimary }]}>
                {isLoggingIn ? '正在登录...' : '登录并连接'}
              </Text>
            </Pressable>

            <Text style={[styles.hintText, { color: colors.text.muted }]}>
              账号密码与桌面端 Web 登录一致；未改过时默认账号
              Tomz / 123456。登录凭据只保存在本机安全存储中。
            </Text>
          </View>

          {/* ── 已连接状态 ───────────────────── */}
          {config ? (
            <View style={styles.section}>
              <View
                style={[
                  styles.connectedBox,
                  { borderColor: colors.border.default, backgroundColor: colors.bg.card },
                ]}
              >
                <View style={styles.connectedHeader}>
                  <View
                    style={[
                      styles.connectedDot,
                      { backgroundColor: colors.status.success },
                    ]}
                  />
                  <Text style={[styles.connectedTitle, { color: colors.text.ink }]}>
                    已连接
                  </Text>
                </View>
                <Text style={[styles.detailText, { color: colors.text.soft }]}>
                  {desktopMiraHostClient.getUsername()
                    ? `当前账号：${desktopMiraHostClient.getUsername()}`
                    : ''}
                </Text>
                <Text style={[styles.detailText, { color: colors.text.soft }]}>
                  {config.hostUrl}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.disconnectBtn,
                    { borderColor: colors.status.errorBg },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={handleDisconnect}
                >
                  <LogOut size={16} color={colors.status.error} />
                  <Text style={[styles.disconnectBtnText, { color: colors.status.error }]}>
                    断开并清除登录
                  </Text>
                </Pressable>
              </View>
            </View>
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: { width: 44 },
  container: { flex: 1 },
  form: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  hero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 28,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroTitle: { fontSize: 26, fontWeight: '600', textAlign: 'center' },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  section: { marginBottom: 24 },
  statusBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
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
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },
  loginBtn: {
    minHeight: 52,
    marginTop: 20,
    borderRadius: 26,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  loginBtnText: { fontSize: 15, fontWeight: '600' },
  hintText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    textAlign: 'center',
  },
  connectedBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
  },
  connectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectedDot: { width: 10, height: 10, borderRadius: 5 },
  connectedTitle: { fontSize: 15, fontWeight: '700' },
  disconnectBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectBtnText: { fontSize: 14, fontWeight: '600' },
});
