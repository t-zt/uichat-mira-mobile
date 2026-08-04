import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Search, X } from 'lucide-react-native';
import type { RootStackParamList } from '../types/navigation';
import type { Session } from '../types';
import { miraHostClient } from '../api/mockMiraHost';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, radius, sizing, spacing } from '../theme/tokens';

const tabs = ['全部', '对话', '图片', '文档', '项目'] as const;
type SearchTab = (typeof tabs)[number];

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('全部');
  const [sessions, setSessions] = useState<Session[]>([]);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await miraHostClient.listSessions());
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sessions;
    return sessions.filter((session) => session.title.toLowerCase().includes(normalizedQuery));
  }, [query, sessions]);

  const openSession = (session: Session) => {
    navigation.navigate('Chat', { sessionId: session.id, title: session.title });
  };

  const isImplementedTab = activeTab === '全部' || activeTab === '对话';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg.canvas }]} edges={['top', 'bottom']}>
      <View style={[styles.tabs, { borderBottomColor: colors.border.soft }]}>
        {tabs.map((tab) => {
          const implemented = tab === '全部' || tab === '对话';
          return (
            <Pressable
              key={tab}
              style={[
                styles.tab,
                activeTab === tab && { backgroundColor: colors.bg.soft },
                !implemented && styles.placeholderTab,
              ]}
              onPress={implemented ? () => setActiveTab(tab) : undefined}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab, disabled: !implemented }}
            >
              <Text style={[styles.tabLabel, { color: activeTab === tab ? colors.text.ink : colors.text.muted }]}>{tab}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled">
        {!isImplementedTab ? (
          <Text style={[styles.placeholderText, { color: colors.text.soft }]}>该类型搜索即将支持</Text>
        ) : results.length > 0 ? (
          results.map((session) => (
            <Pressable key={session.id} style={styles.result} onPress={() => openSession(session)}>
              <View style={[styles.resultIcon, { backgroundColor: colors.bg.soft }]} />
              <View style={[styles.resultLine, { backgroundColor: colors.bg.soft }]}>
                <Text style={[styles.resultTitle, { color: colors.text.ink }]} numberOfLines={1}>{session.title}</Text>
              </View>
            </Pressable>
          ))
        ) : (
          [0, 1, 2].map((item) => (
            <View key={item} style={styles.result}>
              <View style={[styles.resultIcon, { backgroundColor: colors.bg.soft }]} />
              <View style={[styles.resultLine, { backgroundColor: colors.bg.soft }]} />
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.composer, { backgroundColor: colors.bg.canvas }]}>
        <View style={[styles.inputWrap, { backgroundColor: colors.bg.soft }]}>
          <Search size={24} color={colors.text.muted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="搜索"
            placeholderTextColor={colors.text.placeholder}
            style={[styles.input, { color: colors.text.ink }]}
            accessibilityLabel="搜索"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} accessibilityLabel="清除搜索">
              <X size={20} color={colors.text.muted} />
            </Pressable>
          )}
        </View>
        <Pressable
          style={[styles.dismiss, { backgroundColor: colors.bg.soft }]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="关闭搜索"
        >
          <X size={30} color={colors.text.ink} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  tab: {
    minHeight: sizing.buttonHeight,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.full,
  },
  placeholderTab: { opacity: 0.55 },
  tabLabel: { fontSize: fontSize.bodyMd },
  results: {
    padding: spacing.lg,
    paddingBottom: sizing.buttonHeight + spacing.xl,
    gap: spacing.md,
  },
  result: {
    minHeight: sizing.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  resultIcon: { width: sizing.touchTarget, height: sizing.touchTarget, borderRadius: radius.md },
  resultLine: {
    height: sizing.buttonHeight,
    borderRadius: radius.md,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  resultTitle: { fontSize: fontSize.bodyMd },
  placeholderText: { textAlign: 'center', marginTop: spacing.xl, fontSize: fontSize.bodyMd },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inputWrap: {
    minHeight: sizing.buttonHeight,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, minHeight: sizing.buttonHeight, paddingVertical: 0, fontSize: fontSize.titleMd },
  dismiss: {
    width: sizing.iconButton,
    height: sizing.iconButton,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
