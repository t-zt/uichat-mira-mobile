import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Clock,
  FolderKanban,
  FolderOpen,
  Grid3x3,
  Image as ImageIcon,
  Monitor,
  Pin,
  Search,
} from 'lucide-react-native';
import type { RootStackParamList } from '../types/navigation';
import type { Session } from '../types';
import { useTheme } from '../theme/ThemeContext';
import { hostClient } from '../api/hostClientManager';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const miraLogo = require('../../assets/branding/mira-logo-square.png');

interface CategoryItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
}

const categories: CategoryItem[] = [
  { id: 'images', label: '图片', icon: ImageIcon },
  { id: 'files', label: '文件库', icon: FolderKanban },
  // Product term “项目” maps to the Desktop Host Chat Workspace domain.
  { id: 'workspaces', label: '项目', icon: FolderOpen },
  { id: 'remote', label: 'Remote', icon: Monitor },
  { id: 'planned', label: '已计划', icon: Clock },
  { id: 'plugins', label: '插件', icon: Grid3x3 },
];

interface CustomDrawerProps {
  onClose: () => void;
}

export function CustomDrawer({ onClose }: CustomDrawerProps) {
  const navigation = useNavigation<NavProp>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      const list = await hostClient.listSessions();
      setSessions(list.slice(0, 20));
    } catch {
      // Connection state and authorization are surfaced elsewhere.
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleOpenSession = (session: Session) => {
    onClose();
    navigation.navigate('Chat', {
      sessionId: session.id,
      title: session.title,
    });
  };

  const handleOpenRemoteConnection = () => {
    onClose();
    navigation.navigate('HostConfig');
  };

  return (
    <View
      style={[
        styles.drawer,
        {
          backgroundColor: colors.bg.canvas,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <Image source={miraLogo} style={styles.brandLogo} />
          <Text
            style={[styles.brandTitle, { color: colors.text.ink }]}
            numberOfLines={1}
          >
            UIChat Mira
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerBtn}
            onPress={() => navigation.navigate('Search')}
            accessibilityRole="button"
            accessibilityLabel="搜索会话"
          >
            <Search size={22} color={colors.text.muted} />
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.categories}>
          {categories.map((cat) => (
            <Pressable
              key={cat.id}
              style={({ pressed }) => [
                styles.categoryItem,
                pressed && { backgroundColor: colors.bg.soft },
              ]}
              onPress={cat.id === 'remote' ? handleOpenRemoteConnection : undefined}
              accessibilityRole={cat.id === 'remote' ? 'button' : undefined}
              accessibilityLabel={
                cat.id === 'remote' ? 'Remote connection' : undefined
              }
            >
              <cat.icon size={22} color={colors.text.muted} />
              <Text style={[styles.categoryLabel, { color: colors.text.base }]}>
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {sessions.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, { color: colors.text.soft }]}>已置顶</Text>
            <Pressable
              style={[styles.pinnedItem, { backgroundColor: colors.bg.card }]}
              onPress={() => handleOpenSession(sessions[0])}
            >
              <Pin size={18} color={colors.primary} />
              <Text
                style={[styles.pinnedLabel, { color: colors.text.ink }]}
                numberOfLines={1}
              >
                {sessions[0].title}
              </Text>
            </Pressable>
          </>
        ) : null}

        {sessions.length > 1 ? (
          <>
            <Text style={[styles.sectionLabel, { color: colors.text.soft }]}>最近</Text>
            <FlatList
              data={sessions.slice(1)}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.recentItem,
                    pressed && { backgroundColor: colors.bg.soft },
                  ]}
                  onPress={() => handleOpenSession(item)}
                >
                  <Text
                    style={[styles.recentLabel, { color: colors.text.base }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                </Pressable>
              )}
              ItemSeparatorComponent={() => (
                <View
                  style={[
                    styles.separator,
                    { backgroundColor: colors.border.soft },
                  ]}
                />
              )}
            />
          </>
        ) : null}

        {loading && sessions.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.text.soft }]}>加载中...</Text>
        ) : null}
      </ScrollView>

      <View style={[styles.remoteNote, { borderTopColor: colors.border.soft }]}>
        <Text style={[styles.remoteNoteText, { color: colors.text.soft }]}>
          当前远程协议只访问桌面端已有会话
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  brandMark: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: { width: 28, height: 28, borderRadius: 14 },
  brandTitle: {
    flexShrink: 1,
    fontFamily: Platform.select({
      ios: 'Georgia',
      android: 'serif',
      default: 'serif',
    }),
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0,
  },
  headerActions: { flexDirection: 'row', flexShrink: 0, gap: 4 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { flex: 1 },
  categories: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 14,
    borderRadius: 10,
  },
  categoryLabel: { fontSize: 16, fontWeight: '500' },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
  },
  pinnedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 12,
  },
  pinnedLabel: { fontSize: 15, fontWeight: '600', flex: 1 },
  recentItem: { paddingHorizontal: 20, paddingVertical: 14 },
  recentLabel: { fontSize: 15 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 20 },
  emptyHint: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  remoteNote: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  remoteNoteText: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
