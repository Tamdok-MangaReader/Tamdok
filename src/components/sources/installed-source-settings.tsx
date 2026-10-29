import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import CookieManager from "@react-native-cookies/cookies";
import { WebView } from "react-native-webview";

import { Card, CardSeparator } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassSurface } from "@/components/ui/glass-surface";
import { ScreenContent } from "@/components/ui/screen-content";
import { SectionLabel } from "@/components/ui/section-label";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useSources } from "@/context/sources-context";
import { useTheme } from "@/hooks/use-theme";

import {
  loadSourceSettingFields,
  setSourceSettingValue,
  type SourceSettingField,
} from "@/services/source-settings";
import {
  clearInstalledSourceCache,
  resetInstalledSourceSettings,
  sourceHosts,
} from "@/services/source-maintenance";
import { findInstalledSource } from "@/services/sources";
import { DEFAULT_FETCH_USER_AGENT } from "@/parsers/shared/fetch-headers";
import {
  findHostClearance,
  hostFromUrl,
  removeHostClearance,
  saveHostClearance,
  subscribeClearance,
} from "@/parsers/shared/host-clearance";
import {
  clearHostChallenge,
  clearResponseCache,
  isHostChallenged,
  resetHostThrottle,
  subscribeChallenges,
} from "@/parsers/shared/net-policy";

const PRESS_SPRING = {
  damping: 14,
  stiffness: 320,
  mass: 0.6,
};

type InstalledSourceSettingsProps = {
  sourceRouteId: string;
};

type SettingSection = {
  title?: string;
  footer?: string;
  fields: Exclude<SourceSettingField, { type: "section" }>[];
};

function groupSettingFields(fields: SourceSettingField[]): SettingSection[] {
  const sections: SettingSection[] = [];
  let current: SettingSection = { fields: [] };

  for (const field of fields) {
    if (field.type === "section") {
      if (current.title || current.footer || current.fields.length > 0) {
        sections.push(current);
      }

      current = {
        title: field.title.trim() || undefined,
        footer: field.footer,
        fields: [],
      };

      continue;
    }

    current.fields.push(field);
  }

  if (current.title || current.footer || current.fields.length > 0) {
    sections.push(current);
  }

  return sections.filter((section) => section.fields.length > 0);
}

export function InstalledSourceSettings({
  sourceRouteId: routeId,
}: InstalledSourceSettingsProps) {
  const router = useRouter();
  const { installed, uninstall } = useSources();
  const { colors, radius, isDark } = useTheme();

  const source = findInstalledSource(installed, routeId);

  const [fields, setFields] = useState<SourceSettingField[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [isSavingCookies, setIsSavingCookies] = useState(false);
  const [isWebViewLoading, setIsWebViewLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "cloudflare">("login");
  const [busyAction, setBusyAction] = useState<"reset" | "cache" | null>(null);
  const [networkTick, setNetworkTick] = useState(0);

  useEffect(() => {
    const bump = () => setNetworkTick((value) => value + 1);
    const offClearance = subscribeClearance(bump);
    const offChallenges = subscribeChallenges(bump);
    return () => {
      offClearance();
      offChallenges();
    };
  }, []);

  const primaryHost = source ? (sourceHosts(source)[0] ?? "") : "";
  const hasClearance = useMemo(
    () => (primaryHost ? findHostClearance(primaryHost) != null : false),
    [primaryHost, networkTick],
  );
  const challenged = useMemo(
    () => (primaryHost ? isHostChallenged(primaryHost) : false),
    [primaryHost, networkTick],
  );

  const sections = useMemo(() => groupSettingFields(fields), [fields]);

  const refreshFields = useCallback(async () => {
    if (!source) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      setFields(await loadSourceSettingFields(source));
    } catch {
      Alert.alert("Error", "Can't load source settings.");
    } finally {
      setIsLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void refreshFields();
  }, [refreshFields]);

  const updateField = async (
    field: Exclude<SourceSettingField, { type: "section" }>,
    nextValue: boolean | string | string[],
  ) => {
    if (!source) return;

    try {
      await setSourceSettingValue(source.id, field.id, nextValue);

      setFields((current) =>
        current.map((item) =>
          item.id === field.id
            ? ({
                ...item,
                value: nextValue,
              } as SourceSettingField)
            : item,
        ),
      );
    } catch {
      Alert.alert("Error", "Can't safe settings.");
    }
  };

  const confirmDelete = () => {
    if (!source) return;

    Alert.alert(
      t("sources_uninstall_title"),
      t("sources_uninstall_confirm", {
        name: source.manifest.info.name,
      }),
      [
        {
          text: t("cancel"),
          style: "cancel",
        },
        {
          text: t("sources_uninstall_action"),
          style: "destructive",
          onPress: async () => {
            await uninstall(source);
            router.back();
          },
        },
      ],
    );
  };

  const openLogin = (url: string) => {
    setLoginMode("login");
    setIsWebViewLoading(true);
    setLoginUrl(url);
  };

  const openCloudflare = () => {
    if (!source) return;
    const baseUrl = source.manifest.info.url ?? source.manifest.info.urls?.[0];
    if (!baseUrl) {
      Alert.alert(t("source_cloudflare_title"), t("source_cloudflare_no_url"));
      return;
    }
    setLoginMode("cloudflare");
    setIsWebViewLoading(true);
    setLoginUrl(baseUrl);
  };

  const saveClearance = async (url: string) => {
    if (!source || isSavingCookies) return;
    setIsSavingCookies(true);

    try {
      const cookies = await CookieManager.get(url, Platform.OS === "ios");
      const picked: Record<string, string> = {};
      for (const [name, cookie] of Object.entries(cookies)) {
        if (
          cookie.value !== undefined &&
          /^(cf_clearance|__cf_bm|__cflb|_cfuvid|cf_chl.*)$/i.test(name)
        ) {
          picked[name] = cookie.value;
        }
      }

      if (!picked.cf_clearance) {
        Alert.alert(
          t("source_cloudflare_title"),
          t("source_cloudflare_not_found"),
        );
        return;
      }

      const host = hostFromUrl(url);
      await saveHostClearance(host, {
        cookies: picked,
        userAgent: DEFAULT_FETCH_USER_AGENT,
        savedAt: Date.now(),
      });
      clearHostChallenge(host);
      clearResponseCache([host]);
      resetHostThrottle([host]);

      Alert.alert(
        t("source_cloudflare_title"),
        t("source_cloudflare_saved"),
        [{ text: "OK", onPress: closeLogin }],
      );
    } catch {
      Alert.alert(
        t("source_cookies_save_error_title"),
        t("source_cookies_save_error_message"),
      );
    } finally {
      setIsSavingCookies(false);
    }
  };

  const forgetClearance = () => {
    if (!primaryHost) return;
    void removeHostClearance(primaryHost);
  };

  const confirmResetSettings = () => {
    if (!source || busyAction) return;
    Alert.alert(
      t("source_reset_settings_title"),
      t("source_reset_settings_confirm", { name: source.manifest.info.name }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("source_reset_settings_action"),
          style: "destructive",
          onPress: async () => {
            setBusyAction("reset");
            try {
              await resetInstalledSourceSettings(source);
              await refreshFields();
            } catch {
              Alert.alert("Error", t("source_maintenance_error"));
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
    );
  };

  const runClearCache = async () => {
    if (!source || busyAction) return;
    setBusyAction("cache");
    try {
      await clearInstalledSourceCache(source);
      Alert.alert(
        t("source_clear_cache_title"),
        t("source_clear_cache_done"),
      );
    } catch {
      Alert.alert("Error", t("source_maintenance_error"));
    } finally {
      setBusyAction(null);
    }
  };

  const closeLogin = () => {
    setLoginUrl(null);
    setIsWebViewLoading(false);
  };

  const saveCookies = async (url: string) => {
    if (!source || isSavingCookies) return;

    setIsSavingCookies(true);

    try {
      const cookies = await CookieManager.get(url, Platform.OS === "ios");

      const cookieValues: Record<string, string> = {};

      for (const [name, cookie] of Object.entries(cookies)) {
        if (cookie.value !== undefined) {
          cookieValues[name] = cookie.value;
        }
      }

      if (Object.keys(cookieValues).length === 0) {
        Alert.alert(
          t("source_cookies_not_found_title"),
          t("source_cookies_not_found_message"),
        );
        return;
      }

      await SecureStore.setItemAsync(
        `source_cookies_${source.id}`,
        JSON.stringify(cookieValues),
      );

      Alert.alert(
        t("web_session_save"),
        `${t("web_cookies_saved")}: ${Object.keys(cookieValues).length}.`,
        [
          {
            text: "OK",
            onPress: closeLogin,
          },
        ],
      );
    } catch {
      Alert.alert(
        t("source_cookies_save_error_title"),
        t("source_cookies_save_error_message"),
      );
    } finally {
      setIsSavingCookies(false);
    }
  };

  if (!source) {
    return (
      <>
        <Stack.Screen options={{ title: t("source_settings_title") }} />
        <ScreenContent centerContent>
          <EmptyState
            icon="alert-circle-outline"
            title={t("sources_not_found")}
          />
        </ScreenContent>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: source.manifest.info.name }} />

      <ScreenContent contentContainerStyle={styles.content}>
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        ) : fields.length === 0 ? (
          <View style={styles.centered}>
            <EmptyState
              icon="options-outline"
              title={t("source_settings_empty_title")}
              description={t("source_settings_empty_desc")}
            />
          </View>
        ) : (
          sections.map((section, sectionIndex) => (
            <View
              key={section.title ?? section.footer ?? `section-${sectionIndex}`}
            >
              {section.title ? (
                <SectionLabel isFirst={sectionIndex === 0}>
                  {section.title}
                </SectionLabel>
              ) : sectionIndex === 0 ? (
                <SectionLabel isFirst>
                  {t("source_settings_section")}
                </SectionLabel>
              ) : null}

              <Card style={styles.sectionCard}>
                {section.fields.map((field, fieldIndex) => {
                  const isLast = fieldIndex === section.fields.length - 1;

                  if (field.type === "login") {
                    return (
                      <View key={field.id}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.row,
                            pressed && {
                              backgroundColor: colors.quaternaryFill,
                            },
                          ]}
                          onPress={() => openLogin(field.url)}
                          accessibilityRole="button"
                        >
                          <ThemedText variant="body" style={styles.rowLabel}>
                            {field.title}
                          </ThemedText>

                          <Ionicons
                            name="log-in-outline"
                            size={20}
                            color={colors.tint}
                          />
                        </Pressable>

                        {!isLast ? <CardSeparator /> : null}
                      </View>
                    );
                  }

                  if (field.type === "link") {
                    return (
                      <View key={field.id}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.row,
                            pressed && {
                              backgroundColor: colors.quaternaryFill,
                            },
                          ]}
                          onPress={() =>
                            void WebBrowser.openBrowserAsync(field.url)
                          }
                          accessibilityRole="button"
                        >
                          <ThemedText variant="body" style={styles.rowLabel}>
                            {field.title}
                          </ThemedText>

                          <Ionicons
                            name="open-outline"
                            size={18}
                            color={colors.tint}
                          />
                        </Pressable>

                        {!isLast ? <CardSeparator /> : null}
                      </View>
                    );
                  }

                  if (field.type === "switch") {
                    return (
                      <View key={field.id}>
                        <View style={styles.row}>
                          <View style={styles.rowText}>
                            <ThemedText variant="body" style={styles.rowLabel}>
                              {field.title}
                            </ThemedText>

                            {field.subtitle ? (
                              <ThemedText
                                variant="footnote"
                                color="secondaryLabel"
                              >
                                {field.subtitle}
                              </ThemedText>
                            ) : null}
                          </View>

                          <Switch
                            value={field.value}
                            onValueChange={(value) =>
                              void updateField(field, value)
                            }
                          />
                        </View>

                        {!isLast ? <CardSeparator /> : null}
                      </View>
                    );
                  }

                  if (field.type === "multi-select") {
                    return (
                      <View key={field.id} style={styles.fieldBlock}>
                        <ThemedText
                          variant="subheadline"
                          color="secondaryLabel"
                          style={styles.fieldTitle}
                        >
                          {field.title}
                        </ThemedText>

                        <View style={styles.pillGrid}>
                          {field.options.map((option) => {
                            const selected = field.value.includes(option.id);

                            if (selected) {
                              return (
                                <Pressable
                                  key={option.id}
                                  style={[
                                    styles.pillActive,
                                    {
                                      borderRadius: radius.pill,
                                      backgroundColor: colors.tint,
                                    },
                                  ]}
                                  onPress={() =>
                                    void updateField(
                                      field,
                                      field.value.filter(
                                        (value) => value !== option.id,
                                      ),
                                    )
                                  }
                                >
                                  <ThemedText
                                    variant="subheadline"
                                    color="onTint"
                                    numberOfLines={1}
                                  >
                                    {option.label}
                                  </ThemedText>
                                </Pressable>
                              );
                            }

                            return (
                              <GlassSurface
                                key={option.id}
                                borderRadius={radius.pill}
                                interactive
                              >
                                <Pressable
                                  style={styles.pill}
                                  onPress={() =>
                                    void updateField(field, [
                                      ...field.value,
                                      option.id,
                                    ])
                                  }
                                >
                                  <ThemedText
                                    variant="subheadline"
                                    numberOfLines={1}
                                  >
                                    {option.label}
                                  </ThemedText>
                                </Pressable>
                              </GlassSurface>
                            );
                          })}
                        </View>

                        {!isLast ? (
                          <View style={styles.fieldSeparator} />
                        ) : null}
                      </View>
                    );
                  }

                  if (field.type === "list") {
                    return (
                      <EditableListField
                        key={field.id}
                        field={field}
                        colors={colors}
                        radius={radius}
                        isDark={isDark}
                        isLast={isLast}
                        onChange={(value) => void updateField(field, value)}
                      />
                    );
                  }

                  if (field.type === "select") {
                    return (
                      <View key={field.id} style={styles.fieldBlock}>
                        <ThemedText
                          variant="subheadline"
                          color="secondaryLabel"
                          style={styles.fieldTitle}
                        >
                          {field.title}
                        </ThemedText>

                        <View style={styles.pillGrid}>
                          {field.options.map((option) => {
                            const selected = field.value === option.id;

                            if (selected) {
                              return (
                                <Pressable
                                  key={option.id}
                                  style={[
                                    styles.pillActive,
                                    {
                                      borderRadius: radius.pill,
                                      backgroundColor: colors.tint,
                                    },
                                  ]}
                                  onPress={() =>
                                    void updateField(field, option.id)
                                  }
                                >
                                  <ThemedText
                                    variant="subheadline"
                                    color="onTint"
                                    numberOfLines={1}
                                  >
                                    {option.label}
                                  </ThemedText>
                                </Pressable>
                              );
                            }

                            return (
                              <GlassSurface
                                key={option.id}
                                borderRadius={radius.pill}
                                interactive
                              >
                                <Pressable
                                  style={styles.pill}
                                  onPress={() =>
                                    void updateField(field, option.id)
                                  }
                                >
                                  <ThemedText
                                    variant="subheadline"
                                    numberOfLines={1}
                                  >
                                    {option.label}
                                  </ThemedText>
                                </Pressable>
                              </GlassSurface>
                            );
                          })}
                        </View>

                        {!isLast ? (
                          <View style={styles.fieldSeparator} />
                        ) : null}
                      </View>
                    );
                  }

                  return (
                    <View key={field.id} style={styles.fieldBlock}>
                      <ThemedText
                        variant="subheadline"
                        color="secondaryLabel"
                        style={styles.fieldTitle}
                      >
                        {field.title}
                      </ThemedText>

                      <GlassSurface
                        borderRadius={radius.sm}
                        style={styles.inputWrap}
                        interactive
                      >
                        <TextInput
                          value={field.value}
                          onChangeText={(value) =>
                            void updateField(field, value)
                          }
                          placeholder={field.placeholder ?? field.title}
                          placeholderTextColor={colors.tertiaryLabel}
                          keyboardAppearance={isDark ? "dark" : "light"}
                          secureTextEntry={field.secure}
                          autoCapitalize={field.secure ? "none" : "sentences"}
                          autoCorrect={!field.secure}
                          style={[styles.textInput, { color: colors.label }]}
                        />
                      </GlassSurface>

                      {!isLast ? <View style={styles.fieldSeparator} /> : null}
                    </View>
                  );
                })}
              </Card>

              {section.footer ? (
                <ThemedText
                  variant="footnote"
                  color="secondaryLabel"
                  style={styles.sectionFooter}
                >
                  {section.footer}
                </ThemedText>
              ) : null}
            </View>
          ))
        )}

        <SectionLabel>{t("source_maintenance_section")}</SectionLabel>
        <Card style={styles.sectionCard}>
          {primaryHost ? (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.quaternaryFill },
                ]}
                onPress={openCloudflare}
                accessibilityRole="button"
              >
                <View style={styles.rowText}>
                  <ThemedText variant="body">
                    {t("source_cloudflare_title")}
                  </ThemedText>
                  <ThemedText
                    variant="footnote"
                    color={challenged && !hasClearance ? "destructive" : "secondaryLabel"}
                  >
                    {hasClearance
                      ? t("source_cloudflare_status_saved")
                      : challenged
                        ? t("source_cloudflare_status_blocked")
                        : t("source_cloudflare_hint")}
                  </ThemedText>
                </View>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.tint} />
              </Pressable>
              {hasClearance ? (
                <>
                  <CardSeparator />
                  <Pressable
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { backgroundColor: colors.quaternaryFill },
                    ]}
                    onPress={forgetClearance}
                    accessibilityRole="button"
                  >
                    <ThemedText variant="body" style={styles.rowLabel}>
                      {t("source_cloudflare_forget")}
                    </ThemedText>
                    <Ionicons name="close-circle-outline" size={20} color={colors.tint} />
                  </Pressable>
                </>
              ) : null}
              <CardSeparator />
            </>
          ) : null}
          <Pressable
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.quaternaryFill },
            ]}
            onPress={() => void runClearCache()}
            disabled={busyAction != null}
            accessibilityRole="button"
          >
            <View style={styles.rowText}>
              <ThemedText variant="body">{t("source_clear_cache_action")}</ThemedText>
              <ThemedText variant="footnote" color="secondaryLabel">
                {t("source_clear_cache_hint")}
              </ThemedText>
            </View>
            {busyAction === "cache" ? (
              <ActivityIndicator />
            ) : (
              <Ionicons name="trash-bin-outline" size={20} color={colors.tint} />
            )}
          </Pressable>
          <CardSeparator />
          <Pressable
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.quaternaryFill },
            ]}
            onPress={confirmResetSettings}
            disabled={busyAction != null}
            accessibilityRole="button"
          >
            <View style={styles.rowText}>
              <ThemedText variant="body" color="destructive">
                {t("source_reset_settings_action")}
              </ThemedText>
              <ThemedText variant="footnote" color="secondaryLabel">
                {t("source_reset_settings_hint")}
              </ThemedText>
            </View>
            {busyAction === "reset" ? (
              <ActivityIndicator />
            ) : (
              <Ionicons name="refresh-outline" size={20} color={colors.tint} />
            )}
          </Pressable>
        </Card>

        <GlassSurface
          borderRadius={radius.pill}
          style={styles.deleteButton}
          interactive
          glassStyle="clear"
        >
          <Pressable
            style={({ pressed }) => [
              styles.deleteButtonPressable,
              pressed && { opacity: 0.82 },
            ]}
            onPress={confirmDelete}
            accessibilityRole="button"
          >
            <ThemedText variant="headline" color="destructive">
              {t("sources_uninstall_action")}
            </ThemedText>
          </Pressable>
        </GlassSurface>
      </ScreenContent>

      <Modal
        visible={loginUrl !== null}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={closeLogin}
      >
        <View
          style={[
            styles.loginModal,
            { backgroundColor: colors.secondarySystemBackground },
          ]}
        >
          <View
            style={[
              styles.loginHeader,
              {
                borderBottomColor: colors.quaternaryFill,
              },
            ]}
          >
            <GlassSurface interactive style={styles.headerAction}>
              <Pressable
                onPress={closeLogin}
                style={{ flex: 1 }}
                accessibilityRole="button"
              >
                <ThemedText variant="body">{t("source_web_close")}</ThemedText>
              </Pressable>
            </GlassSurface>

            <GlassSurface interactive style={styles.headerAction}>
              <Pressable
                onPress={() =>
                  void (loginMode === "cloudflare"
                    ? saveClearance(loginUrl || "")
                    : saveCookies(loginUrl || ""))
                }
                style={{ flex: 1 }}
                disabled={isSavingCookies}
                accessibilityRole="button"
              >
                {isSavingCookies ? (
                  <ActivityIndicator />
                ) : (
                  <ThemedText variant="body" style={{ color: colors.tint }}>
                    {t("source_web_save")}
                  </ThemedText>
                )}
              </Pressable>
            </GlassSurface>
          </View>

          {isWebViewLoading ? (
            <View style={styles.webViewLoading}>
              <ActivityIndicator />
            </View>
          ) : null}

          {loginUrl !== null ? (
            <WebView
              source={{ uri: loginUrl }}
              userAgent={loginMode === "cloudflare" ? DEFAULT_FETCH_USER_AGENT : undefined}
              style={styles.webView}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              javaScriptCanOpenWindowsAutomatically
              setSupportMultipleWindows={false}
              startInLoadingState
              onLoadStart={() => setIsWebViewLoading(true)}
              onLoadEnd={() => setIsWebViewLoading(false)}
              onOpenWindow={({ nativeEvent }) => {
                const targetUrl = nativeEvent.targetUrl;

                if (
                  targetUrl.startsWith("https://") ||
                  targetUrl.startsWith("http://")
                ) {
                  setLoginUrl(targetUrl);
                }
              }}
              onError={({ nativeEvent }) => {
                console.warn("WebView error:", nativeEvent.description);
              }}
            />
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: Spacing.xxxl,
    gap: Spacing.sm,
  },
  centered: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: Spacing.xxxl,
  },
  sectionCard: {
    paddingVertical: Spacing.xs,
  },
  sectionFooter: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 48,
  },
  rowLabel: {
    flex: 1,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  fieldBlock: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  fieldTitle: {
    paddingHorizontal: 2,
  },
  fieldSeparator: {
    height: Spacing.md,
  },
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pillActive: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  inputWrap: {
    minHeight: 44,
    justifyContent: "center",
  },
  textInput: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
    minHeight: 44,
  },
  deleteButton: {
    width: "100%",
    backgroundColor: "rgba(255, 59, 48, 0.14)",
  },
  deleteButtonPressable: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  listValue: {
    flex: 1,
  },
  listAddRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  listAddInput: {
    flex: 1,
  },
  listAddButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  loginModal: {
    flex: 1,
  },
  loginHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerAction: {
    minWidth: 72,
    maxHeight: 40,
    padding: Spacing.sm,
    alignContent: "center",
    alignItems: "center",
  },
  loginHeaderTitle: {
    flex: 1,
    textAlign: "center",
  },
  webView: {
    flex: 1,
  },
  webViewLoading: {
    position: "absolute",
    top: 70,
    alignSelf: "center",
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
});

type EditableListFieldProps = {
  field: Extract<SourceSettingField, { type: "list" }>;
  colors: {
    label: string;
    tertiaryLabel: string;
    tint: string;
    quaternaryFill: string;
  };
  radius: { sm: number; pill: number };
  isDark: boolean;
  isLast: boolean;
  onChange: (value: string[]) => void;
};

function EditableListField({
  field,
  colors,
  radius,
  isDark,
  isLast,
  onChange,
}: EditableListFieldProps) {
  const [draft, setDraft] = useState("");
  const scale = useSharedValue(1);

  const addButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const addItem = () => {
    const trimmed = draft.trim();

    if (!trimmed || field.value.includes(trimmed)) return;

    onChange([...field.value, trimmed]);
    setDraft("");
  };

  const removeItem = (index: number) => {
    onChange(field.value.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <View style={styles.fieldBlock}>
      <ThemedText
        variant="subheadline"
        color="secondaryLabel"
        style={styles.fieldTitle}
      >
        {field.title}
      </ThemedText>

      {field.value.length === 0 ? (
        <ThemedText variant="footnote" color="tertiaryLabel">
          {t("source_settings_list_empty")}
        </ThemedText>
      ) : (
        field.value.map((item, index) => (
          <View key={`${item}-${index}`} style={styles.listRow}>
            <ThemedText variant="body" style={styles.listValue}>
              {item}
            </ThemedText>

            <Pressable
              onPress={() => removeItem(index)}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={18} color={colors.tint} />
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.listAddRow}>
        <GlassSurface
          borderRadius={radius.sm}
          style={[styles.inputWrap, styles.listAddInput]}
          interactive
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={field.placeholder ?? t("source_settings_add_item")}
            placeholderTextColor={colors.tertiaryLabel}
            keyboardAppearance={isDark ? "dark" : "light"}
            returnKeyType="done"
            onSubmitEditing={addItem}
            style={[styles.textInput, { color: colors.label }]}
          />
        </GlassSurface>

        <Pressable
          onPress={addItem}
          onPressIn={() => {
            scale.value = withSpring(0.96, PRESS_SPRING);
          }}
          onPressOut={() => {
            scale.value = withSpring(1, PRESS_SPRING);
          }}
          accessibilityRole="button"
        >
          <Reanimated.View
            style={[
              styles.listAddButton,
              {
                borderRadius: radius.pill,
                backgroundColor: colors.tint,
              },
              addButtonStyle,
            ]}
          >
            <ThemedText variant="subheadline" color="onTint">
              {t("add")}
            </ThemedText>
          </Reanimated.View>
        </Pressable>
      </View>

      {!isLast ? <View style={styles.fieldSeparator} /> : null}
    </View>
  );
}
