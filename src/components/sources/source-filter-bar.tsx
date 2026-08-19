import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t, getLocale } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';

export type SourceKindFilter = 'tamdok' | 'aidoku';

type SourceFilterBarProps = {
  languages: string[];
  languageSelected: string | null;
  onLanguageChange: (language: string | null) => void;
  showKindFilter?: boolean;
  kindSelected: SourceKindFilter | null;
  onKindChange: (kind: SourceKindFilter | null) => void;
};

export function SourceFilterBar({
  languages,
  languageSelected,
  onLanguageChange,
  showKindFilter = false,
  kindSelected,
  onKindChange,
}: SourceFilterBarProps) {
  const { colors, radius } = useTheme();

  if (languages.length === 0 && !showKindFilter) return null;

  return (
    <View style={styles.wrapper}>
      {showKindFilter && (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.row}>
          <FilterChip
            label={t('source_filter_all')}
            active={kindSelected === null}
            onPress={() => onKindChange(null)}
            colors={colors}
            radius={radius.sm}
          />
          <FilterChip
            label={t('sources_tab_tamdok')}
            active={kindSelected === 'tamdok'}
            onPress={() => onKindChange('tamdok')}
            colors={colors}
            radius={radius.sm}
          />
          <FilterChip
            label={t('sources_tab_aidoku')}
            active={kindSelected === 'aidoku'}
            onPress={() => onKindChange('aidoku')}
            colors={colors}
            radius={radius.sm}
          />
        </ScrollView>
      )}

      {languages.length > 0 && (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.row}>
          <FilterChip
            label={t('source_filter_all')}
            active={languageSelected === null}
            onPress={() => onLanguageChange(null)}
            colors={colors}
            radius={radius.sm}
          />
          {languages.map((language) => (
            <FilterChip
              key={language}
              label={formatLanguage(language)}
              active={languageSelected === language}
              onPress={() => onLanguageChange(language)}
              colors={colors}
              radius={radius.sm}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  colors,
  radius,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: { tint: string; secondaryFill: string; label: string; onTint: string };
  radius: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderRadius: radius,
          backgroundColor: active ? colors.tint : colors.secondaryFill,
        },
      ]}>
      <ThemedText variant='caption1' color={active ? 'onTint' : 'label'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function formatLanguage(code: string): string {
  try {
    const label = new Intl.DisplayNames([getLocale()], { type: 'language' }).of(code);
    return label ? `${label} (${code})` : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

const styles = StyleSheet.create({
  wrapper: {
    flexGrow: 0,
    flexShrink: 0,
    gap: Spacing.sm,
  },
  scroll: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});
