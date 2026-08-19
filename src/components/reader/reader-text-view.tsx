import { useCallback, useEffect, useRef } from 'react';
import { FlatList, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useReader } from '@/components/reader/reader-context';
import { ThemedText } from '@/components/ui/themed-text';

type ReaderTextViewProps = {
  onPageChange: (index: number) => void;
  currentPage: number;
  setPageRef: (goToPage: (index: number, animated?: boolean) => void) => void;
};

export function ReaderTextView({ onPageChange, currentPage, setPageRef }: ReaderTextViewProps) {
  const { pages, settings, backgroundColor, foregroundColor } = useReader();
  const listRef = useRef<FlatList<(typeof pages)[number]>>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();

  const goToPage = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(pages.length - 1, index));
      if (settings.textReaderStyle === 'paged') {
        listRef.current?.scrollToIndex({ index: clamped, animated: settings.animatePageTransitions });
      }
      onPageChange(clamped);
    },
    [onPageChange, pages.length, settings.animatePageTransitions, settings.textReaderStyle],
  );

  useEffect(() => {
    setPageRef(goToPage);
  }, [goToPage, setPageRef]);

  const textStyle = {
    color: foregroundColor,
    fontSize: settings.textFontSize,
    lineHeight: settings.textFontSize + settings.textLineSpacing,
    paddingHorizontal: settings.textHorizontalPadding,
    fontFamily: settings.textFontFamily === 'System' ? undefined : settings.textFontFamily,
  };

  if (settings.textReaderStyle === 'scroll') {
    return (
      <ScrollView ref={scrollRef} style={[styles.root, { backgroundColor }]} contentContainerStyle={styles.scrollContent}>
        {pages.map((page, index) => (
          <ThemedText key={page.id} variant='body' style={textStyle} onLayout={() => onPageChange(index)}>
            {page.text}
          </ThemedText>
        ))}
      </ScrollView>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={pages}
      keyExtractor={(item) => item.id}
      horizontal
      pagingEnabled
      style={[styles.root, { backgroundColor }]}
      initialScrollIndex={currentPage > 0 ? currentPage : undefined}
      onMomentumScrollEnd={(event) => {
        const index = Math.round(event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width);
        onPageChange(index);
      }}
      getItemLayout={(_, index) => ({
        length: width,
        offset: width * index,
        index,
      })}
      renderItem={({ item }) => (
        <View style={[styles.pagedPage, { width }]}>
          <ThemedText variant='body' style={textStyle}>
            {item.text}
          </ThemedText>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 24,
    gap: 16,
  },
  pagedPage: {
    flex: 1,
    paddingVertical: 24,
  },
});
