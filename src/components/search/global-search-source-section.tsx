import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, View } from 'react-native';

import { LibraryMangaCover } from '@/components/manga/library-manga-cover';
import { GlassIconButton } from '@/components/ui/glass-icon-button';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { SourceCoverHeadersProvider } from '@/context/source-cover-context';
import { useTheme } from '@/hooks/use-theme';
import type { InstalledSource, Manga } from '@/parsers/shared/types';

const PREVIEW_LIMIT = 6;

export type SourceSearchGroup = {
  source: InstalledSource;
  entries: Manga[];
  status: 'loading' | 'done' | 'error';
  error?: string;
};

type GlobalSearchSourceSectionProps = {
  group: SourceSearchGroup;
  resetKey?: string;
  columns?: number;
  onPressSource: (source: InstalledSource) => void;
  onPressManga: (source: InstalledSource, manga: Manga) => void;
  onRetry?: (source: InstalledSource) => void;
};

export function GlobalSearchSourceSection({
  group,
  resetKey,
  columns = 3,
  onPressSource,
  onPressManga,
  onRetry,
}: GlobalSearchSourceSectionProps) {
  const { colors, radius } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const width = Dimensions.get('window').width;
  const itemWidth = Math.floor((width - Spacing.lg * 2 - Spacing.sm * (columns - 1)) / columns);
  const coverHeight = Math.round(itemWidth * 1.45);

  useEffect(() => {
    setExpanded(false);
  }, [resetKey, group.source.id]);

  const isLoading = group.status === 'loading';
  const isError = group.status === 'error';
  const hiddenCount = Math.max(0, group.entries.length - PREVIEW_LIMIT);
  const visibleEntries = expanded ? group.entries : group.entries.slice(0, PREVIEW_LIMIT);

  if (!isLoading && !isError && group.entries.length === 0) return null;

  const kindLabel = group.source.kind === 'aidoku' ? 'Aidoku' : 'Tamdok';

  return (
    <SourceCoverHeadersProvider source={group.source}>
      <View style={styles.section}>
        <Pressable
          style={({ pressed }) => [styles.header, pressed && { opacity: 0.72 }]}
          onPress={() => onPressSource(group.source)}
          accessibilityRole='button'>
          <View style={[styles.iconWrap, { borderRadius: radius.sm, backgroundColor: colors.quaternaryFill }]}>
            {group.source.iconUri ? (
              <Image
                source={{ uri: normalizeIconUri(group.source.iconUri) }}
                style={[styles.icon, { borderRadius: radius.sm }]}
                contentFit='cover'
                transition={150}
              />
            ) : (
              <ThemedText variant='caption1'>{group.source.manifest.info.name.slice(0, 1)}</ThemedText>
            )}
          </View>
          <View style={styles.headerText}>
            <ThemedText variant='title3'>{group.source.manifest.info.name}</ThemedText>
            <View style={styles.metaRow}>
              <View style={[styles.kindBadge, { backgroundColor: colors.secondaryFill, borderRadius: radius.xs }]}>
                <ThemedText variant='caption2' color='secondaryLabel'>
                  {kindLabel}
                </ThemedText>
              </View>
              <ThemedText variant='footnote' color='secondaryLabel'>
                {isLoading
                  ? t('search_source_loading')
                  : isError
                    ? t('search_source_failed')
                    : t('search_source_results', { count: String(group.entries.length) })}
              </ThemedText>
            </View>
          </View>
          {isError && onRetry ? (
            <GlassIconButton
              icon='refresh'
              onPress={() => onRetry(group.source)}
              size={36}
              iconSize={18}
              accessibilityLabel={t('search_source_retry')}
            />
          ) : null}
        </Pressable>

        {isLoading ? (
          <View style={[styles.loadingWrap, { minHeight: coverHeight }]}>
            <ActivityIndicator />
          </View>
        ) : isError ? (
          <View style={[styles.errorWrap, { borderRadius: radius.md, backgroundColor: colors.secondaryFill }]}>
            <ThemedText variant='footnote' color='destructive'>
              {group.error ?? t('search_source_failed_desc')}
            </ThemedText>
          </View>
        ) : (
          <>
            <View style={styles.grid}>
              {visibleEntries.map((manga) => (
                <LibraryMangaCover
                  key={manga.key}
                  sourceId={group.source.id}
                  manga={manga}
                  width={itemWidth}
                  onPress={() => onPressManga(group.source, manga)}
                />
              ))}
            </View>
            {!expanded && hiddenCount > 0 ? (
              <Pressable
                style={({ pressed }) => [styles.moreButton, pressed && { opacity: 0.72 }]}
                onPress={() => setExpanded(true)}
                accessibilityRole='button'>
                <ThemedText variant='callout' color='tint'>
                  {t('search_show_more', { count: String(hiddenCount) })}
                </ThemedText>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </SourceCoverHeadersProvider>
  );
}

function normalizeIconUri(uri: string): string {
  if (/^https?:\/\//i.test(uri)) return uri;
  if (uri.startsWith('file://')) return uri;
  if (uri.startsWith('/')) return `file://${uri}`;
  return uri;
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  icon: {
    width: 40,
    height: 40,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  kindBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  errorWrap: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  moreButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
  },
});
