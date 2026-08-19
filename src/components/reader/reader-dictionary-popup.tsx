import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import type { DictionaryDisplayMode } from '@/services/app-settings';
import type { DictionaryEntry } from '@/services/dictionary-lookup';
import { useTheme } from '@/hooks/use-theme';

type ReaderDictionaryPopupProps = {
  visible: boolean;
  entry: DictionaryEntry | null;
  loading: boolean;
  displayMode: DictionaryDisplayMode;
  popupWidth: number;
  popupHeight: number;
  onClose: () => void;
};

export function ReaderDictionaryPopup({
  visible,
  entry,
  loading,
  displayMode,
  popupWidth,
  popupHeight,
  onClose,
}: ReaderDictionaryPopupProps) {
  const insets = useSafeAreaInsets();
  const { colors, radius } = useTheme();
  const fullWidth = displayMode === 'fullWidth';

  return (
    <Modal visible={visible} transparent animationType='fade' onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.panel,
            fullWidth
              ? { left: Spacing.lg, right: Spacing.lg, bottom: insets.bottom + Spacing.lg }
              : {
                  width: popupWidth,
                  maxHeight: popupHeight,
                  alignSelf: 'center',
                  marginTop: '30%',
                },
            { backgroundColor: colors.secondarySystemBackground, borderRadius: radius.lg },
          ]}
          onPress={(event) => event.stopPropagation()}>
          {loading ? (
            <ThemedText variant='body' style={styles.content}>
              {t('dictionary_loading')}
            </ThemedText>
          ) : entry ? (
            <ScrollView contentContainerStyle={styles.content}>
              <ThemedText variant='headline' style={{ fontWeight: '700' }}>
                {entry.word}
              </ThemedText>
              {entry.phonetic ? (
                <ThemedText variant='footnote' color='secondaryLabel'>
                  {entry.phonetic}
                </ThemedText>
              ) : null}
              {entry.meanings.map((meaning, index) => (
                <View key={`${meaning.partOfSpeech}-${index}`} style={styles.meaning}>
                  {meaning.partOfSpeech ? (
                    <ThemedText variant='caption1' color='tint'>
                      {meaning.partOfSpeech}
                    </ThemedText>
                  ) : null}
                  {meaning.definitions.slice(0, 3).map((definition, definitionIndex) => (
                    <ThemedText key={definitionIndex} variant='body' style={styles.definition}>
                      {definition.definition}
                    </ThemedText>
                  ))}
                </View>
              ))}
            </ScrollView>
          ) : (
            <ThemedText variant='body' style={styles.content}>
              {t('dictionary_not_found')}
            </ThemedText>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: Spacing.lg,
  },
  panel: {
    overflow: 'hidden',
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  meaning: {
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  definition: {
    lineHeight: 22,
  },
});
