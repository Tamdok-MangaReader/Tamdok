import { memo } from "react";
import { StyleSheet, View } from "react-native";
import type { Ionicons } from "@expo/vector-icons";

import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useTheme } from "@/hooks/use-theme";
import type { MangaStatus, Viewer } from "@/parsers/shared/types";

type ColorKey =
  | "systemGreen"
  | "systemOrange"
  | "destructive"
  | "secondaryLabel";

type PillSpec = {
  icon: string;
  fallback: keyof typeof Ionicons.glyphMap;
  color: ColorKey;
  labelKey: string;
};

const STATUS_PILLS: Record<Exclude<MangaStatus, "unknown">, PillSpec> = {
  ongoing: {
    icon: "play.circle.fill",
    fallback: "play-circle",
    color: "secondaryLabel",
    labelKey: "manga_status_ongoing",
  },
  completed: {
    icon: "checkmark.circle.fill",
    fallback: "checkmark-circle",
    color: "systemGreen",
    labelKey: "manga_status_completed",
  },
  hiatus: {
    icon: "pause.circle.fill",
    fallback: "pause-circle",
    color: "systemOrange",
    labelKey: "manga_status_hiatus",
  },
  cancelled: {
    icon: "xmark.circle.fill",
    fallback: "close-circle",
    color: "destructive",
    labelKey: "manga_status_cancelled",
  },
};

const MANGA_PILL: PillSpec = {
  icon: "book.fill",
  fallback: "book",
  color: "secondaryLabel",
  labelKey: "manga_viewer_manga",
};
const WEBTOON_PILL: PillSpec = {
  icon: "scroll.fill",
  fallback: "reader",
  color: "secondaryLabel",
  labelKey: "manga_viewer_webtoon",
};

const TINT_ALPHA = "59";

/** Small capsule for the manga meta block: tinted when it has a system color, gray otherwise. */
export const MetaPill = memo(function MetaPill({
  label,
  icon,
  fallback,
  tone = "secondaryLabel",
  shrink = false,
}: {
  label: string;
  icon?: string;
  fallback?: keyof typeof Ionicons.glyphMap;
  tone?: ColorKey;
  /** Let the pill shrink and truncate its label when the row runs out of space. */
  shrink?: boolean;
}) {
  const { colors } = useTheme();
  const color = colors[tone];
  const isNeutral = tone === "secondaryLabel";
  return (
    <View
      style={[
        styles.pill,
        shrink && styles.shrink,
        {
          backgroundColor: isNeutral
            ? colors.tertiaryFill
            : `${color}${TINT_ALPHA}`,
        },
      ]}
    >
      {icon && fallback ? (
        <SFSymbolIcon
          name={icon}
          size={11}
          weight="semibold"
          color={color}
          fallback={fallback}
        />
      ) : null}
      <ThemedText
        variant="caption1"
        numberOfLines={1}
        style={[styles.text, { color }]}
      >
        {label}
      </ThemedText>
    </View>
  );
});

function SpecPill({ spec }: { spec: PillSpec }) {
  return (
    <MetaPill
      label={t(spec.labelKey)}
      icon={spec.icon}
      fallback={spec.fallback}
      tone={spec.color}
      shrink
    />
  );
}

export const MangaMetaPills = memo(function MangaMetaPills({
  status,
  viewer,
}: {
  status?: MangaStatus;
  viewer?: Viewer;
}) {
  const statusSpec =
    status && status !== "unknown" ? STATUS_PILLS[status] : null;
  if (!statusSpec && !viewer) return null;
  return (
    <View style={styles.row}>
      {statusSpec ? <SpecPill spec={statusSpec} /> : null}
      {viewer ? (
        <SpecPill spec={viewer === "webtoon" ? WEBTOON_PILL : MANGA_PILL} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  // One line: when space runs out the pills shrink and truncate instead of wrapping.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 22,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderCurve: "continuous",
  },
  shrink: {
    flexShrink: 1,
  },
  text: {
    flexShrink: 1,
    fontWeight: "600",
  },
});
