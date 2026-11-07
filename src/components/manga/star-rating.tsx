import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { useTheme } from "@/hooks/use-theme";
import type { ParsedRating } from "@/utils/manga-description";

// The badge sits on top of cover art, so it keeps fixed colors in both themes.
const BADGE_STAR = "#FFCC00";

/** Rating on a 0–5 scale: sources send either star glyphs or a 5- or 10-point score. */
export function ratingValue(rating: ParsedRating): number {
  const score = rating.score ? Number.parseFloat(rating.score) : Number.NaN;
  if (Number.isFinite(score)) return Math.min(5, score > 5 ? score / 2 : score);
  return rating.filled + (rating.half ? 0.5 : 0);
}

function formatRating(value: number): string {
  return value.toFixed(1);
}

/** Manga screen: "★★★★⯪ 4.5" with SF Symbol stars, like ratings in the App Store and Books. */
export const StarRating = memo(function StarRating({
  rating,
  large = false,
}: {
  rating: ParsedRating;
  /** Manga screen size; the default suits denser places like the big home scroller. */
  large?: boolean;
}) {
  const { colors } = useTheme();
  const value = ratingValue(rating);
  const label = formatRating(value);
  const stars: ("full" | "half" | "empty")[] = [];
  for (let index = 0; index < rating.filled; index += 1) stars.push("full");
  if (rating.half) stars.push("half");
  for (let index = 0; index < rating.empty; index += 1) stars.push("empty");

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={t("manga_rating_a11y", { value: label })}
    >
      <View style={[styles.stars, large && styles.starsLarge]}>
        {stars.map((kind, index) => (
          <SFSymbolIcon
            key={index}
            name={
              kind === "full"
                ? "star.fill"
                : kind === "half"
                  ? "star.leadinghalf.filled"
                  : "star"
            }
            fallback={
              kind === "full" ? "star" : kind === "half" ? "star-half" : "star-outline"
            }
            size={large ? 15 : 13}
            color={colors.systemOrange}
          />
        ))}
      </View>
      <ThemedText variant="subheadline" color="secondaryLabel" style={styles.score}>
        {label}
      </ThemedText>
    </View>
  );
});

/** Under a cover on the page background: "★ 4.5" in text colors. */
export const InlineRating = memo(function InlineRating({
  rating,
  small = false,
}: {
  rating: ParsedRating;
  small?: boolean;
}) {
  const { colors } = useTheme();
  const label = formatRating(ratingValue(rating));
  return (
    <View
      style={styles.inline}
      accessible
      accessibilityRole="text"
      accessibilityLabel={t("manga_rating_a11y", { value: label })}
    >
      <SFSymbolIcon
        name="star.fill"
        fallback="star"
        size={small ? 10 : 12}
        color={colors.systemOrange}
      />
      <ThemedText
        variant={small ? "caption2" : "footnote"}
        color="secondaryLabel"
        style={styles.score}
      >
        {label}
      </ThemedText>
    </View>
  );
});

/** Cover overlay: one star and the score in a dark capsule. */
export const CoverRatingBadge = memo(function CoverRatingBadge({
  rating,
  height = 20,
  fontSize = 11,
}: {
  rating: ParsedRating;
  height?: number;
  fontSize?: number;
}) {
  const label = formatRating(ratingValue(rating));
  return (
    <View
      style={[
        styles.badge,
        { height, borderRadius: height / 2, paddingHorizontal: Math.round(height * 0.3) },
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={t("manga_rating_a11y", { value: label })}
    >
      <SFSymbolIcon
        name="star.fill"
        fallback="star"
        size={Math.round(fontSize * 0.95)}
        color={BADGE_STAR}
      />
      <Text style={[styles.badgeText, { fontSize }]}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  score: {
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  stars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  starsLarge: {
    gap: 2,
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  badgeText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
