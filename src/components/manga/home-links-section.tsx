import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useSourceCoverHeaders } from '@/context/source-cover-context';
import { useTheme } from '@/hooks/use-theme';
import type { HomeNavigationLink, Listing, Manga } from '@/parsers/shared/types';
import { coverImageSource } from '@/utils/cover-image-source';

type HomeLinksSectionProps = {
  title?: string;
  subtitle?: string;
  links: HomeNavigationLink[];
  onPressManga: (manga: Manga) => void;
  onPressListing: (listing: Listing) => void;
};

export function HomeLinksSection({
  title,
  subtitle,
  links,
  onPressManga,
  onPressListing,
}: HomeLinksSectionProps) {
  const { colors, radius } = useTheme();
  const coverHeaders = useSourceCoverHeaders();

  if (links.length === 0) return null;

  const handlePress = (link: HomeNavigationLink) => {
    if (link.manga) {
      onPressManga(link.manga);
      return;
    }
    if (link.listing) {
      onPressListing(link.listing);
      return;
    }
    if (link.url) {
      void Linking.openURL(link.url);
    }
  };

  return (
    <View style={styles.section}>
      {(title || subtitle) && (
        <View style={styles.header}>
          {title ? <ThemedText variant='title3'>{title}</ThemedText> : null}
          {subtitle ? (
            <ThemedText variant='footnote' color='secondaryLabel'>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      )}
      <View style={styles.list}>
        {links.map((link, index) => (
          <Pressable
            key={`${link.title}-${index}`}
            style={[styles.row, { borderBottomColor: colors.separator }]}
            onPress={() => handlePress(link)}>
            {link.imageUrl ? (
              <View style={[styles.thumb, { borderRadius: radius.sm, backgroundColor: colors.secondaryFill }]}>
                <Image source={coverImageSource(link.imageUrl, coverHeaders)} style={StyleSheet.absoluteFill} contentFit='cover' />
              </View>
            ) : null}
            <View style={styles.text}>
              <ThemedText variant='body' numberOfLines={2}>
                {link.title}
              </ThemedText>
              {link.subtitle ? (
                <ThemedText variant='footnote' color='secondaryLabel' numberOfLines={1}>
                  {link.subtitle}
                </ThemedText>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    gap: 2,
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 44,
    height: 44,
    overflow: 'hidden',
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
