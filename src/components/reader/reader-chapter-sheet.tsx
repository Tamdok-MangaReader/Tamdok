import { MODAL_HEADER_HEIGHT, ModalHeader } from '@/components/ui/modal-header';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReader } from '@/components/reader/reader-context';
import { ThemedText } from '@/components/ui/themed-text';
import { t } from '@/constants/locales';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { chapterTitleForDisplay, formatChapterLabel } from '@/utils/chapter-label';

type ReaderChapterSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function ReaderChapterSheet({ visible, onClose }: ReaderChapterSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { chapters, chapter, actions } = useReader();

  return (
    <Modal visible={visible} animationType='slide' transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.secondarySystemBackground }]}>
        <ModalHeader title={t('manga_chapters')} closeLabel={t('done')} onClose={onClose} />
        <ScrollView
          contentContainerStyle={[styles.list, { paddingTop: MODAL_HEADER_HEIGHT + Spacing.sm, paddingBottom: insets.bottom + Spacing.lg }]}
          scrollIndicatorInsets={{ top: MODAL_HEADER_HEIGHT }}>
          {chapters.map((item) => {
            const selected = item.key === chapter.key;
            return (
              <Pressable
                key={item.key}
                style={[styles.row, selected ? { backgroundColor: colors.tertiaryFill } : null]}
                onPress={() => {
                  actions.selectChapter(item);
                  onClose();
                }}>
                <ThemedText variant='body' color={selected ? 'tint' : 'label'} numberOfLines={1}>
                  {`${item.chapterNumber ? `${item.chapterNumber}. ` : ''}${chapterTitleForDisplay(item) || formatChapterLabel(item)}`}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    maxHeight: '75%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  list: {
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  row: {
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});
