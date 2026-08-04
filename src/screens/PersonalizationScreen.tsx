import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, radius, spacing } from '../theme/tokens';
import { SettingsPageHeader } from '../components/settings/SettingsPageHeader';
import { SettingsChoiceModal, type SettingsChoice } from '../components/settings/SettingsChoiceModal';

type Tone = 'friendly' | 'professional' | 'concise';

const toneOptions: readonly SettingsChoice<Tone>[] = [
  { value: 'friendly', label: '亲和友善' },
  { value: 'professional', label: '专业严谨' },
  { value: 'concise', label: '简洁直接' },
];

export function PersonalizationScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [tone, setTone] = useState<Tone>('friendly');
  const [toneOpen, setToneOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState(true);
  const [instructions, setInstructions] = useState('');
  const toneLabel = toneOptions.find((option) => option.value === tone)?.label ?? '';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg.canvas }]} edges={['top', 'bottom']}>
      <SettingsPageHeader title="个性化" onConfirm={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable style={[styles.surface, { backgroundColor: colors.bg.card }]} onPress={() => setToneOpen(true)}>
          <View style={styles.flex}>
            <Text style={[styles.title, { color: colors.text.ink }]}>基本风格和语调</Text>
            <Text style={[styles.subtitle, { color: colors.text.muted }]}>{toneLabel}</Text>
          </View>
          <ChevronDown size={20} color={colors.text.muted} />
        </Pressable>
        <Text style={[styles.help, { color: colors.text.muted }]}>设置 Mira 在对话中使用的主要语气，不会改变功能行为。</Text>

        <Text style={[styles.sectionLabel, { color: colors.text.soft }]}>特征</Text>
        <View style={[styles.surface, { backgroundColor: colors.bg.card }]}>
          <Text style={[styles.title, { color: colors.text.ink }]}>提高亲和度</Text>
          <Text style={[styles.subtitle, { color: colors.text.muted }]}>更友好、更亲近</Text>
        </View>
        <Pressable style={[styles.surface, { backgroundColor: colors.bg.card }]}>
          <Text style={[styles.title, { color: colors.text.ink }]}>添加特征</Text>
        </Pressable>

        <View style={[styles.surface, { backgroundColor: colors.bg.card }]}>
          <Text style={[styles.title, styles.flex, { color: colors.text.ink }]}>快速回答</Text>
          <Switch
            value={quickReplies}
            onValueChange={setQuickReplies}
            trackColor={{ false: colors.border.default, true: colors.primary }}
            thumbColor={colors.bg.elevated}
          />
        </View>
        <Text style={[styles.help, { color: colors.text.muted }]}>优先生成简洁答案；需要时仍会提供完整说明。</Text>

        <Text style={[styles.sectionLabel, { color: colors.text.soft }]}>自定义指令</Text>
        <TextInput
          value={instructions}
          onChangeText={setInstructions}
          multiline
          maxLength={2000}
          placeholder="讲话风格、体现风骚幽默、引人联想"
          placeholderTextColor={colors.text.placeholder}
          style={[styles.instructions, { color: colors.text.ink, backgroundColor: colors.bg.card }]}
          textAlignVertical="top"
        />
      </ScrollView>
      <SettingsChoiceModal visible={toneOpen} value={tone} options={toneOptions} onChange={setTone} onClose={() => setToneOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.section, gap: spacing.md },
  surface: {
    minHeight: 62,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flex: { flex: 1 },
  title: { fontSize: fontSize.bodyMd, fontWeight: '500' },
  subtitle: { fontSize: fontSize.button, marginTop: spacing.xs },
  help: { fontSize: fontSize.button, lineHeight: 20 },
  sectionLabel: { fontSize: fontSize.button, marginTop: spacing.sm },
  instructions: {
    minHeight: 110,
    borderRadius: radius.lg,
    padding: spacing.lg,
    fontSize: fontSize.bodyMd,
  },
});
