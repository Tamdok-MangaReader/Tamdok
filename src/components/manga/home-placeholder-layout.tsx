import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const GRID_COLUMNS = 3;
const SCROLLER_COVER_WIDTH = 180;
const SCROLLER_ROWS = 3;
const GRID_ITEMS = 6;

function coverHeight(width: number): number {
  return Math.round(width * 1.45);
}

function gridItemWidth(): number {
  const width = Dimensions.get('window').width;
  return Math.floor((width - Spacing.lg * 2 - Spacing.sm * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
}

function PlaceholderBlock({ width, height, radius }: { width: number | string; height: number; radius: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: colors.secondaryFill,
      }}
    />
  );
}

function SectionTitle() {
  const { radius } = useTheme();
  return <PlaceholderBlock width={148} height={22} radius={radius.sm} />;
}

function CoverColumn({ width }: { width: number }) {
  const { radius } = useTheme();
  return (
    <View style={[styles.tile, { width }]}>
      <PlaceholderBlock width={width} height={coverHeight(width)} radius={radius.sm} />
      <PlaceholderBlock width="78%" height={12} radius={radius.sm} />
      <PlaceholderBlock width="52%" height={10} radius={radius.sm} />
    </View>
  );
}

function FeaturedRow() {
  const { radius } = useTheme();
  const cardWidth = Dimensions.get('window').width - Spacing.lg * 2;
  const coverWidth = Math.round(cardWidth * 0.38);
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <SectionTitle />
      </View>
      <View style={[styles.featured, { width: cardWidth }]}>
        <PlaceholderBlock width={coverWidth} height={coverHeight(coverWidth)} radius={radius.md} />
        <View style={styles.featuredInfo}>
          <PlaceholderBlock width="88%" height={18} radius={radius.sm} />
          <PlaceholderBlock width="64%" height={12} radius={radius.sm} />
          <PlaceholderBlock width="100%" height={10} radius={radius.sm} />
          <PlaceholderBlock width="92%" height={10} radius={radius.sm} />
          <PlaceholderBlock width="70%" height={10} radius={radius.sm} />
        </View>
      </View>
    </View>
  );
}

function ScrollerRow() {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <SectionTitle />
      </View>
      <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroller}>
        {Array.from({ length: 6 }, (_, index) => (
          <CoverColumn key={index} width={SCROLLER_COVER_WIDTH} />
        ))}
      </ScrollView>
    </View>
  );
}

function GridRow() {
  const itemWidth = gridItemWidth();
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <SectionTitle />
      </View>
      <View style={styles.grid}>
        {Array.from({ length: GRID_ITEMS }, (_, index) => (
          <CoverColumn key={index} width={itemWidth} />
        ))}
      </View>
    </View>
  );
}

export function HomePlaceholderLayout() {
  return (
    <View style={styles.root}>
      <FeaturedRow />
      {Array.from({ length: SCROLLER_ROWS }, (_, index) => (
        <ScrollerRow key={index} />
      ))}
      <GridRow />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.lg,
  },
  section: {
    gap: Spacing.sm,
  },
  header: {
    paddingHorizontal: Spacing.lg,
  },
  scroller: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  tile: {
    gap: Spacing.xs,
  },
  featured: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
  },
  featuredInfo: {
    flex: 1,
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
});
