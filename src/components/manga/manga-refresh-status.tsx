import { memo, useCallback, useMemo, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
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
  const { busy, result } = status;

  if (busy) {
    return (
      <View style={styles.icon}>
        <ActivityIndicator size="small" color={colors.label} />
      </View>
    );
  }

  if (!result) return null;

  return (
    <Animated.View
      entering={ZoomIn.duration(220)}
      exiting={ZoomOut.duration(180)}
      style={styles.icon}
      accessibilityRole="image"
      accessibilityLabel={
        result.ok
          ? t("manga_refresh_success")
          : t("manga_refresh_failed", { error: result.message })
      }
    >
      <SFSymbolIcon
        name={result.ok ? "checkmark.icloud" : "xmark.icloud"}
        fallback={result.ok ? "cloud-done-outline" : "cloud-offline-outline"}
        size={22}
        color={result.ok ? colors.label : colors.destructive}
      />
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
});
