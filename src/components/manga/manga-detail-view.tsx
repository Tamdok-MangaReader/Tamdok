import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItem,
  type View as ViewType,
} from 'react-native';

import { StarRating } from '@/components/manga/star-rating';
import { IncognitoModeBanner } from '@/components/settings/incognito-mode-banner';
import { LibraryCategoryDropdown, type CategoryDropdownAnchor } from '@/components/library/library-category-dropdown';
import { SourceHomeAlertBanner } from '@/components/sources/source-home-alert-banner';
import { SwipeableRow, SwipeableRowsProvider, type SwipeAction } from '@/components/sources/swipeable-row';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassSurface } from '@/components/ui/glass-surface';
import { LiquidGlassScrollComponent } from '@/components/ui/liquid-glass-scroll-root';
import { ProgressRing } from '@/components/ui/progress-ring';
import { SFSymbolIcon } from '@/components/ui/sf-symbol-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useSourceCoverHeaders } from '@/context/source-cover-context';
import { useTheme } from '@/hooks/use-theme';
import type { Chapter, Manga } from '@/parsers/shared/types';
import { ALL_CATEGORY_ID, type LibraryCategory } from '@/services/library';
import type { DownloadEntry } from '@/services/downloads';
import { chapterTitleForDisplay, formatChapterLabel, formatChapterNumberValue } from '@/utils/chapter-label';
import { coverImageSource } from '@/utils/cover-image-source';
import { parseMangaDescription, parseRatingText } from '@/utils/manga-description';

const DESCRIPTION_PREVIEW_LINES = 4;
const TAG_PREVIEW_COUNT = 6;
const DOWNLOADED_COLOR = '#007AFF';
const COVER_WIDTH = 132;
const COVER_HEIGHT = Math.round(COVER_WIDTH * 1.45);

function ChapterDownloadIndicator({ entry }: { entry?: DownloadEntry }) {
  if (!entry) return null;

  if (entry.status === 'downloading' || entry.status === 'pending') {
    return <ProgressRing progress={entry.progress} size={18} color={DOWNLOADED_COLOR} />;
  }

  if (entry.status === 'completed') {
    return <Ionicons name='download' size={14} color={DOWNLOADED_COLOR} />;
  }

  if (entry.status === 'failed') {
    return <Ionicons name='alert-circle' size={14} color='#FF3B30' />;
  }

  return null;
}

type MangaDetailViewProps = {
  manga: Manga;
  sourceName?: string;
  sourceKind?: 'aidoku' | 'tamdok';
  chapters: Chapter[];
  readChapterKeys: Set<string>;
  chapterDownloads: Record<string, DownloadEntry>;
  downloadedChapterKeys: Set<string>;
  inLibrary: boolean;
  libraryCategories: LibraryCategory[];
  selectedCategoryIds: string[];
  libraryPickerOpen: boolean;
  canOpenInBrowser: boolean;
  continueLabel: string;
  chapterSelectMode?: boolean;
  contentBottomInset?: number;
  selectedChapterKeys?: Set<string>;
  inlineError?: string | null;
  onDismissInlineError?: () => void;
  isLoading: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onOpenChapter: (chapter: Chapter) => void;
  onContinueReading: () => void;
  onToggleLibraryPicker: () => void;
  onToggleCategory: (categoryId: string) => void;
  onOpenInBrowser: () => void;
  onMarkChapterRead: (chapter: Chapter) => void;
  onMarkChapterUnread: (chapter: Chapter) => void;
  onToggleChapterSelected?: (chapter: Chapter) => void;
  onSelectAllChapters?: () => void;
  onDeselectAllChapters?: () => void;
};

export function MangaDetailView({
  manga,
  sourceName,
  sourceKind,
  chapters,
  readChapterKeys,
  chapterDownloads,
  downloadedChapterKeys,
  inLibrary,
  libraryCategories,
  selectedCategoryIds,
  libraryPickerOpen,
  canOpenInBrowser,
  continueLabel,
  chapterSelectMode = false,
  contentBottomInset = 0,
  selectedChapterKeys,
  inlineError,
  onDismissInlineError,
  isLoading,
  isRefreshing = false,
  onRefresh,
  onOpenChapter,
  onContinueReading,
  onToggleLibraryPicker,
  onToggleCategory,
  onOpenInBrowser,
  onMarkChapterRead,
  onMarkChapterUnread,
  onToggleChapterSelected,
  onSelectAllChapters,
  onDeselectAllChapters,
}: MangaDetailViewProps) {
  const { colors, radius } = useTheme();
  const coverHeaders = useSourceCoverHeaders();
  const parsed = parseMangaDescription(manga.description);
  const rating = parseRatingText(parsed.ratingLine);
  const authors = manga.authors?.filter(Boolean).join(', ');
  const artists = manga.artists?.filter(Boolean).join(', ');
  const altTitles = (parsed.altTitles ?? []).filter((name) => name !== manga.title);
  const tags = manga.tags ?? [];
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const visibleTags = tagsExpanded || tags.length <= TAG_PREVIEW_COUNT ? tags : tags.slice(0, TAG_PREVIEW_COUNT);
  const canExpandTags = tags.length > TAG_PREVIEW_COUNT;
  const libraryButtonRef = useRef<ViewType>(null);
  const [dropdownAnchor, setDropdownAnchor] = useState<CategoryDropdownAnchor | null>(null);
  const descriptionText = parsed.summary ?? manga.description ?? '';
  const canExpandDescription = descriptionText.length > 180;
  const unreadCount = useMemo(
    () => chapters.reduce((count, chapter) => (readChapterKeys.has(chapter.key) ? count : count + 1), 0),
    [chapters, readChapterKeys],
  );
  const downloadedCount = downloadedChapterKeys.size;

  const closeLibraryPicker = useCallback(() => {
    setDropdownAnchor(null);
    if (libraryPickerOpen) onToggleLibraryPicker();
  }, [libraryPickerOpen, onToggleLibraryPicker]);

  const hasCustomCategories = libraryCategories.some((category) => category.id !== ALL_CATEGORY_ID);

  const handleLibraryPickerPress = useCallback(() => {
    if (!hasCustomCategories) {
      onToggleCategory(ALL_CATEGORY_ID);
      return;
    }
    if (libraryPickerOpen) {
      closeLibraryPicker();
      return;
    }
    libraryButtonRef.current?.measureInWindow((x, y, width, height) => {
      setDropdownAnchor({ x, y, width, height });
      onToggleLibraryPicker();
    });
  }, [closeLibraryPicker, hasCustomCategories, libraryPickerOpen, onToggleCategory, onToggleLibraryPicker]);

  const renderChapter: ListRenderItem<Chapter> = useCallback(
    ({ item, index }) => {
      const downloadEntry = chapterDownloads[item.key];
      return (
        <ChapterRow
          chapter={item}
          index={index}
          total={chapters.length}
          selectMode={chapterSelectMode}
          isSelected={selectedChapterKeys?.has(item.key) ?? false}
          isRead={readChapterKeys.has(item.key)}
          isDownloaded={downloadedChapterKeys.has(item.key)}
          downloadEntry={downloadEntry}
          isLast={index === chapters.length - 1}
          onOpen={onOpenChapter}
          onToggleSelected={onToggleChapterSelected}
          onMarkRead={onMarkChapterRead}
          onMarkUnread={onMarkChapterUnread}
        />
      );
    },
    [
      chapterDownloads,
      chapterSelectMode,
      chapters.length,
      downloadedChapterKeys,
      onMarkChapterRead,
      onMarkChapterUnread,
      onOpenChapter,
      onToggleChapterSelected,
      readChapterKeys,
      selectedChapterKeys,
    ],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.header}>
        {inlineError ? (
          <SourceHomeAlertBanner message={inlineError} onDismiss={onDismissInlineError} />
        ) : null}
        <IncognitoModeBanner />

        <View style={styles.hero}>
          <View
            style={[
              styles.cover,
              { width: COVER_WIDTH, height: COVER_HEIGHT, borderRadius: radius.md, backgroundColor: colors.secondaryFill },
            ]}>
            {manga.cover ? (
              <Image
                source={coverImageSource(manga.cover, coverHeaders)}
                style={StyleSheet.absoluteFill}
                contentFit='cover'
                recyclingKey={manga.cover}
                transition={200}
              />
            ) : (
              <ThemedText variant='title1' color='tertiaryLabel'>
                {manga.title.slice(0, 1)}
              </ThemedText>
            )}
            {inLibrary ? (
              <View style={[styles.coverBookmark, { backgroundColor: colors.tint }]}>
                <SFSymbolIcon name='bookmark.fill' size={11} color={colors.onTint} fallback='bookmark' />
              </View>
            ) : null}
            {inLibrary && (unreadCount > 0 || downloadedCount > 0) ? (
              <View style={styles.coverCountRow}>
                {unreadCount > 0 ? (
                  <View style={[styles.coverCountBadge, styles.coverUnreadBadge]}>
                    <ThemedText variant='caption2' style={styles.coverCountText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </ThemedText>
                  </View>
                ) : null}
                {downloadedCount > 0 ? (
                  <View style={[styles.coverCountBadge, styles.coverDownloadedBadge]}>
                    <ThemedText variant='caption2' style={styles.coverCountText}>
                      {downloadedCount > 99 ? '99+' : downloadedCount}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={styles.heroMeta}>
            <ThemedText variant='title2'>{manga.title}</ThemedText>
            {sourceName ? (
              <View style={styles.sourceRow}>
                <ThemedText variant='footnote' color='tint'>
                  {sourceName}
                </ThemedText>
                {sourceKind ? (
                  <GlassSurface borderRadius={radius.pill}>
                    <ThemedText variant='caption2' color='secondaryLabel' style={styles.kindBadge}>
                      {sourceKind === 'aidoku' ? 'Aidoku' : 'Tamdok'}
                    </ThemedText>
                  </GlassSurface>
                ) : null}
              </View>
            ) : null}
            {altTitles.length > 0 ? (
              <ThemedText variant='subheadline' color='tertiaryLabel'>
                {altTitles.join(', ')}
              </ThemedText>
            ) : null}
            {authors ? (
              <ThemedText variant='subheadline' color='secondaryLabel'>
                {authors}
              </ThemedText>
            ) : null}
            {artists && artists !== authors ? (
              <ThemedText variant='footnote' color='secondaryLabel'>
                {artists}
              </ThemedText>
            ) : null}
            {rating ? <StarRating rating={rating} /> : null}
            {manga.status && manga.status !== 'unknown' ? (
              <GlassSurface borderRadius={radius.pill} style={styles.statusPill}>
                <ThemedText variant='caption1' color='secondaryLabel' style={styles.statusText}>
                  {formatStatus(manga.status)}
                </ThemedText>
              </GlassSurface>
            ) : null}
            {!chapterSelectMode ? (
              <View style={styles.librarySection}>
                <View style={styles.libraryRow}>
                  <Pressable
                    ref={libraryButtonRef}
                    onPress={handleLibraryPickerPress}
                    hitSlop={8}
                    style={({ pressed }) => [styles.libraryButtonPressable, pressed && { opacity: 0.85 }]}>
                    <View
                      style={[
                        styles.libraryButton,
                        {
                          borderRadius: radius.pill,
                          backgroundColor: inLibrary ? colors.secondaryFill : colors.tint,
                        },
                      ]}>
                      <Ionicons
                        name={inLibrary ? 'bookmark' : 'bookmark-outline'}
                        size={14}
                        color={inLibrary ? colors.tint : colors.onTint}
                      />
                      <ThemedText variant='footnote' color={inLibrary ? 'tint' : 'onTint'}>
                        {inLibrary ? t('manga_in_library') : t('manga_add_to_library')}
                      </ThemedText>
                      {libraryCategories.some((category) => category.id !== ALL_CATEGORY_ID) ? (
                        <Ionicons
                          name={libraryPickerOpen ? 'chevron-up' : 'chevron-down'}
                          size={13}
                          color={inLibrary ? colors.tint : colors.onTint}
                        />
                      ) : null}
                    </View>
                  </Pressable>
                  {canOpenInBrowser ? (
                    <Pressable onPress={onOpenInBrowser} hitSlop={8} accessibilityRole='button'>
                      <GlassSurface borderRadius={radius.pill} style={styles.safariButton} interactive>
                        <SFSymbolIcon name='safari' size={16} color={colors.tint} fallback='globe-outline' />
                      </GlassSurface>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {descriptionText ? (
          <View style={styles.block}>
            <ThemedText variant='headline' style={styles.blockTitle}>
              {t('manga_description')}
            </ThemedText>
            <ThemedText
              variant='body'
              color='secondaryLabel'
              style={styles.description}
              numberOfLines={descriptionExpanded ? undefined : DESCRIPTION_PREVIEW_LINES}>
              {descriptionText}
            </ThemedText>
            {canExpandDescription ? (
              <Pressable onPress={() => setDescriptionExpanded((value) => !value)} hitSlop={8}>
                <ThemedText variant='footnote' color='tint' style={styles.expandButton}>
                  {descriptionExpanded ? t('manga_show_less') : t('manga_show_more')}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {tags.length > 0 ? (
          <View style={styles.block}>
            <ThemedText variant='headline' style={styles.blockTitle}>
              {t('manga_tags')}
            </ThemedText>
            <View style={styles.tagsWrap}>
              {visibleTags.map((tag) => (
                <GlassSurface key={tag} borderRadius={radius.pill}>
                  <View style={styles.tagPill}>
                    <ThemedText variant='caption1' color='secondaryLabel' numberOfLines={1}>
                      {tag}
                    </ThemedText>
                  </View>
                </GlassSurface>
              ))}
            </View>
            {canExpandTags ? (
              <Pressable onPress={() => setTagsExpanded((value) => !value)} hitSlop={8}>
                <ThemedText variant='footnote' color='tint' style={styles.expandButton}>
                  {tagsExpanded ? t('manga_show_less') : t('manga_show_more')}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!chapterSelectMode && !isLoading && chapters.length > 0 ? (
          <Pressable onPress={onContinueReading}>
            <View style={[styles.continueButton, { backgroundColor: colors.tint, borderRadius: radius.md }]}>
              <ThemedText variant='headline' color='onTint' style={styles.continueButtonText}>
                {continueLabel}
              </ThemedText>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.chapterHeader}>
          <View style={styles.chapterTitleRow}>
            <ThemedText variant='headline' style={styles.blockTitle}>
              {chapterSelectMode ? t('manga_select_chapters') : t('manga_chapters')}
            </ThemedText>
            {isRefreshing ? <ActivityIndicator size='small' /> : null}
          </View>
          {chapterSelectMode ? (
            <View style={styles.selectActions}>
              <Pressable onPress={onSelectAllChapters} hitSlop={8}>
                <ThemedText variant='footnote' color='tint'>
                  {t('manga_select_all')}
                </ThemedText>
              </Pressable>
              <Pressable onPress={onDeselectAllChapters} hitSlop={8}>
                <ThemedText variant='footnote' color='tint'>
                  {t('manga_deselect_all')}
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    ),
    [
      altTitles,
      artists,
      authors,
      canExpandDescription,
      canOpenInBrowser,
      chapterSelectMode,
      handleLibraryPickerPress,
      chapters.length,
      colors.onTint,
      colors.secondaryFill,
      colors.tint,
      continueLabel,
      coverHeaders,
      descriptionExpanded,
      descriptionText,
      downloadedCount,
      inLibrary,
      inlineError,
      isLoading,
      isRefreshing,
      libraryCategories,
      libraryPickerOpen,
      manga.cover,
      manga.status,
      manga.title,
      onContinueReading,
      onDismissInlineError,
      onOpenInBrowser,
      onSelectAllChapters,
      onDeselectAllChapters,
      radius.md,
      radius.pill,
      rating,
      sourceKind,
      sourceName,
      canExpandTags,
      tagsExpanded,
      visibleTags,
      unreadCount,
    ],
  );

  const listEmpty = useMemo(() => {
    if (isLoading) {
      return <ActivityIndicator style={styles.loading} />;
    }
    return <EmptyState icon='book-outline' title={t('manga_no_chapters')} />;
  }, [isLoading]);

  const listExtraData = useMemo(
    () => ({
      chapterSelectMode,
      selectedChapterKeys,
      readChapterKeys,
      downloadedChapterKeys,
      chapterDownloads,
      tagsExpanded,
      descriptionExpanded,
    }),
    [
      chapterSelectMode,
      selectedChapterKeys,
      readChapterKeys,
      downloadedChapterKeys,
      chapterDownloads,
      tagsExpanded,
      descriptionExpanded,
    ],
  );

  return (
    <View style={styles.root}>
      <SwipeableRowsProvider>
        <FlatList
          style={styles.root}
          data={isLoading ? [] : chapters}
          keyExtractor={chapterKeyExtractor}
          renderItem={renderChapter}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={[styles.content, contentBottomInset > 0 && { paddingBottom: contentBottomInset }]}
          contentInsetAdjustmentBehavior='automatic'
          automaticallyAdjustsScrollIndicatorInsets
          scrollsToTop={false}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={5}
          updateCellsBatchingPeriod={16}
          removeClippedSubviews
          extraData={listExtraData}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.tint} />
            ) : undefined
          }
          renderScrollComponent={(props) => <LiquidGlassScrollComponent {...props} scrollsToTop={false} />}
        />
      </SwipeableRowsProvider>
      <LibraryCategoryDropdown
        visible={libraryPickerOpen}
        anchor={dropdownAnchor}
        categories={libraryCategories}
        selectedIds={selectedCategoryIds}
        inLibrary={inLibrary}
        onToggleCategory={onToggleCategory}
        onClose={closeLibraryPicker}
      />
    </View>
  );
}

function chapterKeyExtractor(chapter: Chapter): string {
  return chapter.key;
}

type ChapterRowProps = {
  chapter: Chapter;
  index: number;
  total: number;
  selectMode: boolean;
  isSelected: boolean;
  isRead: boolean;
  isDownloaded: boolean;
  downloadEntry?: DownloadEntry;
  isLast: boolean;
  onOpen: (chapter: Chapter) => void;
  onToggleSelected?: (chapter: Chapter) => void;
  onMarkRead: (chapter: Chapter) => void;
  onMarkUnread: (chapter: Chapter) => void;
};

const ChapterRow = memo(function ChapterRow({
  chapter,
  index,
  total,
  selectMode,
  isSelected,
  isRead,
  isDownloaded,
  downloadEntry,
  isLast,
  onOpen,
  onToggleSelected,
  onMarkRead,
  onMarkUnread,
}: ChapterRowProps) {
  const { colors, radius } = useTheme();
  const isLocked = chapter.locked === true;
  const isDownloading = downloadEntry?.status === 'downloading' || downloadEntry?.status === 'pending';
  const chapterNumberLabel = formatChapterNumber(chapter, index, total);

  const markReadAction = useMemo<SwipeAction>(
    () => ({
      key: 'read',
      label: t('manga_mark_read'),
      icon: 'checkmark-circle',
      sfSymbol: 'checkmark.circle.fill',
      color: '#34C759',
      onPress: () => onMarkRead(chapter),
    }),
    [chapter, onMarkRead],
  );

  const markUnreadAction = useMemo<SwipeAction>(
    () => ({
      key: 'unread',
      label: t('manga_mark_unread'),
      icon: 'eye-off',
      sfSymbol: 'eye.slash.fill',
      color: '#FF9F0A',
      onPress: () => onMarkUnread(chapter),
    }),
    [chapter, onMarkUnread],
  );

  const row = (
    <Pressable
      style={({ pressed }) => [styles.chapterRow, pressed && { opacity: 0.72 }]}
      onPress={() => {
        if (selectMode) {
          onToggleSelected?.(chapter);
          return;
        }
        if (isLocked) return;
        onOpen(chapter);
      }}
      accessibilityRole='button'>
      {selectMode ? (
        <Ionicons
          name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={isSelected ? colors.tint : colors.tertiaryLabel}
        />
      ) : (
        <ThemedText variant='footnote' color='secondaryLabel' style={styles.chapterNumber}>
          {chapterNumberLabel}
        </ThemedText>
      )}
      <View style={styles.chapterMeta}>
        <View style={styles.chapterTitleRow}>
          <ThemedText
            variant='body'
            numberOfLines={1}
            color={isRead ? 'tertiaryLabel' : 'label'}
            style={[styles.chapterTitle, isRead ? styles.readChapter : undefined]}>
            {chapterTitleForDisplay(chapter) ?? formatChapterLabel(chapter)}
          </ThemedText>
          <View style={styles.chapterIcons}>
            {isRead ? (
              <SFSymbolIcon name='eye.fill' fallback='eye-outline' size={14} color={colors.tertiaryLabel} />
            ) : null}
            {isLocked ? (
              <SFSymbolIcon name='lock.fill' fallback='lock-closed-outline' size={14} color={colors.tertiaryLabel} />
            ) : null}
            {!isDownloading && isDownloaded ? <Ionicons name='download' size={14} color={DOWNLOADED_COLOR} /> : null}
            {downloadEntry?.status === 'failed' ? <Ionicons name='alert-circle' size={14} color='#FF3B30' /> : null}
          </View>
        </View>
        {chapter.scanlators?.length ? (
          <ThemedText variant='caption1' color='tertiaryLabel' numberOfLines={1}>
            {chapter.scanlators.join(', ')}
          </ThemedText>
        ) : null}
        {downloadEntry?.status === 'failed' && downloadEntry.error ? (
          <ThemedText variant='caption1' color='destructive' numberOfLines={1}>
            {downloadEntry.error}
          </ThemedText>
        ) : null}
      </View>
      {!selectMode && !isLocked ? (
        isDownloading ? (
          <ChapterDownloadIndicator entry={downloadEntry} />
        ) : (
          <Ionicons name='chevron-forward' size={18} color={colors.tertiaryLabel} />
        )
      ) : null}
    </Pressable>
  );

  return (
    <View
      style={[
        styles.chapterCard,
        {
          backgroundColor: colors.secondarySystemBackground,
          borderBottomLeftRadius: isLast ? radius.md : 0,
          borderBottomRightRadius: isLast ? radius.md : 0,
          borderTopLeftRadius: index === 0 ? radius.md : 0,
          borderTopRightRadius: index === 0 ? radius.md : 0,
        },
      ]}>
      <SwipeableRow
        rowId={chapter.key}
        enabled={!selectMode}
        actions={[isRead ? markUnreadAction : markReadAction]}
        fullSwipeActionKey={isRead ? 'unread' : 'read'}
        onFullSwipe={() => (isRead ? onMarkUnread(chapter) : onMarkRead(chapter))}>
        {row}
      </SwipeableRow>
      {!isLast ? <View style={[styles.separator, { backgroundColor: colors.separator }]} /> : null}
    </View>
  );
});

function formatStatus(status: NonNullable<Manga['status']>): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatChapterNumber(chapter: Chapter, index: number, total: number): string {
  if (chapter.chapterNumber != null) {
    return `${formatChapterNumberValue(chapter.chapterNumber)}.`;
  }
  return `${total - index}.`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  header: {
    gap: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  hero: {
    flexDirection: 'row',
    gap: Spacing.lg,
    alignItems: 'flex-start',
  },
  cover: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  coverBookmark: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  coverCountRow: {
    position: 'absolute',
    top: Spacing.xs,
    left: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    zIndex: 2,
  },
  coverCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverUnreadBadge: {
    backgroundColor: '#FF3B30',
  },
  coverDownloadedBadge: {
    backgroundColor: '#007AFF',
  },
  coverCountText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  heroMeta: {
    flex: 1,
    gap: Spacing.xs,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  kindBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  statusPill: {
    alignSelf: 'flex-start',
  },
  statusText: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  librarySection: {
    gap: Spacing.sm,
    alignSelf: 'stretch',
  },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
  },
  libraryButtonPressable: {
    flexShrink: 1,
  },
  libraryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  safariButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  continueButtonText: {
    textAlign: 'center',
  },
  block: {
    gap: Spacing.sm,
  },
  blockTitle: {
    paddingHorizontal: Spacing.xs,
  },
  chapterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  chapterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  selectActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  description: {
    lineHeight: 22,
    paddingHorizontal: Spacing.xs,
  },
  expandButton: {
    paddingHorizontal: Spacing.xs,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  tagPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  chapterCard: {
    overflow: 'hidden',
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: 'transparent',
  },
  chapterNumber: {
    width: 28,
    textAlign: 'right',
  },
  chapterMeta: {
    flex: 1,
    gap: 2,
  },
  chapterIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chapterTitle: {
    flex: 1,
  },
  readChapter: {
    textDecorationLine: 'line-through',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.lg,
  },
  loading: {
    paddingVertical: Spacing.xl,
  },
});
