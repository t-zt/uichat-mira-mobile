import React, { useCallback, useMemo, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Menu,
  MessageSquare,
  Pin,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import type { RootStackParamList } from '../types/navigation';
import type { Session } from '../types';
import { useHostStore } from '../store/hostStore';
import { hostClient } from '../api/hostClientManager';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, radius, sizing, spacing } from '../theme/tokens';
import { CustomDrawer } from '../components/CustomDrawer';

const DRAWER_WIDTH = Math.floor(Dimensions.get('window').width * 0.82);

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  return `${days}天前`;
}

function getStatusColor(
  status: string,
  colors: ReturnType<typeof useTheme>['colors'],
): string {
  switch (status) {
    case 'connected':
      return colors.status.success;
    case 'connecting':
    case 'reconnecting':
      return colors.status.warning;
    default:
      return colors.text.soft;
  }
}

interface SessionRowProps {
  item: Session;
  connectionStatus: string;
  showUnreadIndicator: boolean;
  showPinnedIndicator: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  onOpen: () => void;
}

function SessionRow({
  item,
  connectionStatus,
  showUnreadIndicator,
  showPinnedIndicator,
  colors,
  onOpen,
}: SessionRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.sessionItem,
        {
          backgroundColor: colors.bg.canvas,
          borderColor: colors.border.soft,
        },
        pressed && { backgroundColor: colors.bg.soft },
      ]}
      onPress={onOpen}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: colors.bg.card,
            borderColor: colors.border.default,
          },
        ]}
      >
        <MessageSquare size={22} strokeWidth={1.7} color={colors.primary} />
      </View>
      <View style={styles.sessionContent}>
        <View style={styles.sessionTopRow}>
          <View style={styles.sessionTitleGroup}>
            {showUnreadIndicator ? (
              <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
            ) : null}
            <Text
              style={[styles.sessionTitle, { color: colors.text.ink }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {showPinnedIndicator ? (
              <Pin size={14} strokeWidth={1.7} color={colors.text.soft} />
            ) : null}
          </View>
          <Text style={[styles.sessionTime, { color: colors.text.soft }]}>
            {formatTime(item.updatedAt)}
          </Text>
        </View>
        <Text
          style={[styles.sessionPreview, { color: colors.text.muted }]}
          numberOfLines={1}
        >
          {connectionStatus === 'connected'
            ? '继续与 Mira 对话'
            : '连接 Mira Host 后继续对话'}
        </Text>
      </View>
    </Pressable>
  );
}

export function SessionListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const { connectionStatus } = useHostStore();
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerAnim = useState(new Animated.Value(-DRAWER_WIDTH))[0];
  const backdropAnim = useState(new Animated.Value(0))[0];

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    Animated.parallel([
      Animated.timing(drawerAnim, {
        toValue: 0,
        useNativeDriver: true,
        duration: 250,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        useNativeDriver: true,
        duration: 250,
      }),
    ]).start();
  }, [drawerAnim, backdropAnim]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(drawerAnim, {
        toValue: -DRAWER_WIDTH,
        useNativeDriver: true,
        duration: 220,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        useNativeDriver: true,
        duration: 220,
      }),
    ]).start(() => setDrawerOpen(false));
  }, [drawerAnim, backdropAnim]);

  const loadSessions = useCallback(async () => {
    try {
      const list = await hostClient.listSessions();
      setSessions(list);
    } catch {
      // Connection state and authorization are surfaced elsewhere.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSessions();
    }, [loadSessions]),
  );

  const listContentStyle = useMemo(
    () => [
      styles.listContent,
      sessions.length === 0 && { flexGrow: 1 },
      { paddingBottom: insets.bottom + 24 },
    ],
    [insets.bottom, sessions.length],
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.bg.canvas }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable
          onPress={openDrawer}
          style={({ pressed }) => [
            styles.drawerBtn,
            pressed && { backgroundColor: colors.bg.soft },
          ]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Menu size={20} color={colors.text.ink} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text.ink }]}>Mira</Text>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: getStatusColor(connectionStatus, colors) },
            ]}
          />
        </View>
        <Pressable
          onPress={() => navigation.navigate('Settings')}
          style={({ pressed }) => [
            styles.settingsBtn,
            pressed && { backgroundColor: colors.bg.soft },
          ]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <SettingsIcon size={20} color={colors.text.ink} />
        </Pressable>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={listContentStyle}
        ListHeaderComponent={
          sessions.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: colors.text.soft }]}>置顶</Text>
          ) : null
        }
        renderItem={({ item, index }) => (
          <>
            {index === 1 ? (
              <Text style={[styles.recentSectionLabel, { color: colors.text.soft }]}>
                最近对话
              </Text>
            ) : null}
            <SessionRow
              item={item}
              connectionStatus={connectionStatus}
              showUnreadIndicator={index === 0}
              showPinnedIndicator={index === 0}
              colors={colors}
              onOpen={() =>
                navigation.navigate('Chat', {
                  sessionId: item.id,
                  title: item.title,
                })
              }
            />
          </>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <View
              style={[
                styles.emptyIllustration,
                {
                  backgroundColor: colors.bg.card,
                  borderColor: colors.border.default,
                },
              ]}
            >
              <MessageSquare
                size={48}
                strokeWidth={1.25}
                color={colors.border.default}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text.ink }]}>暂无会话</Text>
            <Text style={[styles.emptySubtitle, { color: colors.text.soft }]}>
              Remote Host V1 当前只展示桌面端已有会话
            </Text>
          </View>
        )}
      />

      {drawerOpen ? (
        <Modal transparent animationType="none" onRequestClose={closeDrawer}>
          <View style={StyleSheet.absoluteFill}>
            <Animated.View
              style={[
                styles.drawerBackdrop,
                { opacity: backdropAnim, backgroundColor: colors.overlay },
              ]}
              onTouchStart={closeDrawer}
            />
            <Animated.View
              style={[
                styles.drawerPanel,
                { width: DRAWER_WIDTH, transform: [{ translateX: drawerAnim }] },
              ]}
            >
              <CustomDrawer onClose={closeDrawer} />
            </Animated.View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  drawerBtn: {
    width: sizing.buttonHeight,
    height: sizing.buttonHeight,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radius.full,
    marginLeft: spacing.sm,
  },
  headerTitle: { fontSize: fontSize.titleLg, fontWeight: '600' },
  settingsBtn: {
    width: sizing.buttonHeight,
    height: sizing.buttonHeight,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: { paddingHorizontal: spacing.lg },
  sectionLabel: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
    fontSize: fontSize.captionUppercase,
  },
  recentSectionLabel: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
    fontSize: fontSize.captionUppercase,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sessionContent: { flex: 1, minWidth: 0 },
  sessionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sessionTitleGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  unreadDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radius.full,
    marginRight: spacing.sm,
  },
  sessionTitle: { fontSize: fontSize.bodyMd, fontWeight: '600', flex: 1 },
  sessionTime: { fontSize: fontSize.xs },
  sessionPreview: { fontSize: fontSize.button },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.section,
    paddingBottom: 80,
  },
  emptyIllustration: {
    width: 112,
    height: 112,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.titleLg,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  emptySubtitle: { fontSize: fontSize.button, textAlign: 'center' },
  drawerBackdrop: { ...StyleSheet.absoluteFill },
  drawerPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
});
