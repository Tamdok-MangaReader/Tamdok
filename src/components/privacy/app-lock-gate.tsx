import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, View } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { authenticateUser } from "@/services/app-lock";
import { getAppSettings } from "@/services/app-settings";
import { subscribeAppSettings } from "@/utils/app-settings-events";

export function AppLockGate() {
  const { colors, radius } = useTheme();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(true);
  const [shielded, setShielded] = useState(false);
  const authenticatingRef = useRef(false);
  const lockedRef = useRef(true);
  const enabledRef = useRef<boolean | null>(null);

  const setLockedState = useCallback((value: boolean) => {
    lockedRef.current = value;
    setLocked(value);
  }, []);

  const unlock = useCallback(async () => {
    if (authenticatingRef.current) return;
    authenticatingRef.current = true;
    try {
      const ok = await authenticateUser(t("app_lock_prompt"), t("cancel"));
      if (ok) {
        setLockedState(false);
        setShielded(false);
      }
    } finally {
      authenticatingRef.current = false;
    }
  }, [setLockedState]);

  useEffect(() => {
    const load = () => {
      void getAppSettings().then((settings) => {
        const next = settings.privacy.requireBiometrics;
        const previous = enabledRef.current;
        enabledRef.current = next;
        setEnabled(next);
        if (previous === null) {
          if (next) {
            setLockedState(true);
            void unlock();
          } else {
            setLockedState(false);
          }
        } else if (!next) {
          setLockedState(false);
        }
      });
    };
    load();
    return subscribeAppSettings(load);
  }, [setLockedState, unlock]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (!enabledRef.current) {
        setShielded(false);
        return;
      }
      if (state === "background") {
        if (authenticatingRef.current) return;
        setLockedState(true);
        setShielded(true);
        return;
      }
      if (state === "inactive") {
        if (!authenticatingRef.current) setShielded(true);
        return;
      }
      setShielded(false);
      if (lockedRef.current) void unlock();
    });
    return () => subscription.remove();
  }, [setLockedState, unlock]);

  if (enabled === null) {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.systemBackground },
        ]}
      />
    );
  }
  if (!enabled || (!locked && !shielded)) return null;

  const content = (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        { backgroundColor: colors.systemBackground },
      ]}
    >
      <Ionicons name="lock-closed" size={44} color={colors.secondaryLabel} />
      <ThemedText variant="headline">{t("app_lock_title")}</ThemedText>
      {locked ? (
        <Pressable
          onPress={() => void unlock()}
          accessibilityRole="button"
          style={[
            styles.button,
            { backgroundColor: colors.tint, borderRadius: radius.md },
          ]}
        >
          <ThemedText variant="headline" color="onTint">
            {t("app_lock_unlock")}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );

  if (Platform.OS === "ios") {
    return <FullWindowOverlay>{content}</FullWindowOverlay>;
  }
  return content;
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
    zIndex: 2000,
  },
  button: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
  },
});
