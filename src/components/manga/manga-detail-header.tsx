import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { MangaOverflowMenu } from '@/components/manga/manga-overflow-menu';
import { HeaderIconButton } from '@/components/ui/header-icon-button';
import { ThemedText } from '@/components/ui/themed-text';
import { t } from '@/constants/locales';

type MangaDetailHeaderLeftProps = {
  chapterSelectMode: boolean;
  onBack: () => void;
  onCancelSelect: () => void;
};

export const MangaDetailHeaderLeft = memo(function MangaDetailHeaderLeft({
  chapterSelectMode,
  onBack,
  onCancelSelect,
}: MangaDetailHeaderLeftProps) {
  if (chapterSelectMode) {
    return (
      <Pressable onPress={onCancelSelect} hitSlop={12}>
        <ThemedText variant='body' color='tint' style={{ paddingHorizontal: 8 }}>
          {t('cancel')}
        </ThemedText>
      </Pressable>
    );
  }

  return <HeaderIconButton icon='chevron-back' accessibilityLabel={t('back')} onPress={onBack} />;
});

type MangaDetailHeaderRightProps = {
  chapterSelectMode: boolean;
  hasDownloads: boolean;
  canShare: boolean;
  canDownload: boolean;
  onApplySelect: () => void;
  onShare: () => void;
  onSelectChapters: () => void;
  onMarkAllRead: () => void;
  onMarkAllUnread: () => void;
  onMarkSelectedRead: () => void;
  onMarkSelectedUnread: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRefresh: () => void;
  onDownloadAll: () => void;
  onDownloadSelected: () => void;
  onRemoveDownloads: () => void;
};

export const MangaDetailHeaderRight = memo(function MangaDetailHeaderRight({
  chapterSelectMode,
  hasDownloads,
  canShare,
  canDownload,
  onApplySelect,
  onShare,
  onSelectChapters,
  onMarkAllRead,
  onMarkAllUnread,
  onMarkSelectedRead,
  onMarkSelectedUnread,
  onSelectAll,
  onDeselectAll,
  onRefresh,
  onDownloadAll,
  onDownloadSelected,
  onRemoveDownloads,
}: MangaDetailHeaderRightProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {chapterSelectMode ? (
        <HeaderIconButton icon='checkmark' accessibilityLabel={t('done')} onPress={onApplySelect} />
      ) : null}
      <MangaOverflowMenu
        chapterSelectMode={chapterSelectMode}
        hasDownloads={hasDownloads}
        canShare={canShare}
        canDownload={canDownload}
        onShare={onShare}
        onSelectChapters={onSelectChapters}
        onMarkAllRead={onMarkAllRead}
        onMarkAllUnread={onMarkAllUnread}
        onMarkSelectedRead={onMarkSelectedRead}
        onMarkSelectedUnread={onMarkSelectedUnread}
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
        onRefresh={onRefresh}
        onDownloadAll={onDownloadAll}
        onDownloadSelected={onDownloadSelected}
        onRemoveDownloads={onRemoveDownloads}
      />
    </View>
  );
});
