import React from 'react';
import { Linking, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BookOpen, FileBadge, Smartphone } from 'lucide-react-native';
import { version } from '../../package.json';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/tokens';
import { SettingsPageHeader } from '../components/settings/SettingsPageHeader';
import { SettingsGroup, SettingsRow } from '../components/settings/SettingsComponents';

export function AboutScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const platformName = Platform.OS === 'android' ? 'Android' : 'iOS';

  const handleAction = (actionId: string) => {
    if (actionId === 'documentation') {
      Linking.openURL('https://tomz.io').catch(() => {});
    } else if (actionId === 'license') {
      navigation.navigate('License');
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg.canvas }]} edges={['top', 'bottom']}>
      <SettingsPageHeader title="关于" />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsGroup onAction={handleAction}>
          <SettingsRow icon={BookOpen} title="文档" actionId="documentation" isFirst isLast={false} />
          <SettingsRow icon={FileBadge} title="许可证" subtitle="MIT" actionId="license" isLast={false} />
          <SettingsRow icon={Smartphone} title={`${platformName} 版 UIChat Mira`} subtitle={version} showChevron={false} isLast />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg },
});
