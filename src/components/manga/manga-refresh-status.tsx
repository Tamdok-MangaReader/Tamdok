import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useMemo, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { GlassSurface } from "@/components/ui/glass-surface";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { useTheme } from "@/hooks/use-theme";

type Result = { ok: true } | { ok: false; message: string };

export type RefreshStatusState = {
  busy: boolean;
  result: Result | null;
  expanded: boolean;
  visible: boolean;
  toggle: () => void;
};

const ICON_HIDE_MS = 8000;
const TEXT_COLLAPSE_MS = 5000;
const MAX_MESSAGE_LENGTH = 60;
const MORPH = LinearTransition.springify().damping(18).stiffness(220);

function shortError(message: string): string {
  const firstLine = message.split("\n")[0]?.trim() ?? "";
  const clean = firstLine.replace(/^Error:\s*/i, "");
  if (clean.length <= MAX_MESSAGE_LENGTH) return clean;
  return `${clean.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
}

export function useRefreshStatus(
  busy: boolean,
  error: string | null,
): RefreshStatusState {
  const [result, setResult] = useState<Result | null>(null);
  const [expanded, setExpanded] = useState(false);
  const wasBusyRef = useRef(false);
  const errorRef = useRef(error);
  errorRef.current = error;

  useEffect(() => {
    if (busy) {
      wasBusyRef.current = true;
      setResult(null);
      setExpanded(false);
      return;
    }
    if (!wasBusyRef.current) return;
    wasBusyRef.current = false;
    const message = errorRef.current;
    setResult(message ? { ok: false, message: shortError(message) } : { ok: true });
  }, [busy]);

  useEffect(() => {
    if (!result) return;
    const hide = setTimeout(() => {
      setResult(null);
      setExpanded(false);
    }, ICON_HIDE_MS);
    return () => clearTimeout(hide);
  }, [result]);

  useEffect(() => {
    if (!expanded) return;
    const collapse = setTimeout(() => setExpanded(false), TEXT_COLLAPSE_MS);
    return () => clearTimeout(collapse);
  }, [expanded]);

  const toggle = useCallback(() => {
    void Haptics.selectionAsync();
    setExpanded((value) => !value);
  }, []);

  return useMemo(
    () => ({ busy, result, expanded, visible: busy || result != null, toggle }),
    [busy, result, expanded, toggle],
  );
}

function MangaRefreshStatusImpl({ status }: { status: RefreshStatusState }) {
  const { colors } = useTheme();
  const { busy, result, expanded, toggle } = status;

  if (busy) {
    return (
      <View style={styles.icon}>
        <ActivityIndicator size="small" color={colors.label} />
      </View>
    );
  }

  if (!result) return null;

  const color = result.ok ? "#34C759" : colors.destructive;
  const label = result.ok
    ? t("manga_refresh_success")
    : t("manga_refresh_failed", { error: result.message });

  return (
    <Animated.View
      layout={MORPH}
      entering={ZoomIn.duration(220)}
      exiting={ZoomOut.duration(180)}
    >
      <Pressable onPress={toggle} hitSlop={8}>
        <GlassSurface
          borderRadius={14}
          style={expanded ? styles.pill : styles.iconSurface}
        >
          <View style={styles.content}>
            <Ionicons
              name={result.ok ? "checkmark-circle" : "alert-circle"}
              size={20}
              color={color}
            />
            {expanded ? (
              <Animated.View
                entering={FadeIn.delay(80).duration(180)}
                exiting={FadeOut.duration(100)}
              >
                <ThemedText variant="footnote" numberOfLines={1} style={styles.text}>
                  {label}
                </ThemedText>
              </Animated.View>
            ) : null}
          </View>
        </GlassSurface>
      </Pressable>
    </Animated.View>
  );
}

export const MangaRefreshStatus = memo(MangaRefreshStatusImpl);

const styles = StyleSheet.create({
  icon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  iconSurface: {
    height: 28,
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    height: 28,
    maxWidth: 240,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  text: {
    flexShrink: 1,
    maxWidth: 200,
  },
});
