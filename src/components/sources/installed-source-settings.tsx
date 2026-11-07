import { Modal } from "@/hooks/use-duo-layout";
import { MODAL_HEADER_HEIGHT, ModalHeader } from "@/components/ui/modal-header";
import { SourceNotFound } from "@/components/sources/source-not-found";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import CookieManager from "@react-native-cookies/cookies";
import { WebView } from "react-native-webview";

import { Card, CardSeparator } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MenuPickerRow } from "@/components/ui/menu-picker-row";
import { SectionFooter } from "@/components/ui/section-footer";
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
  const { colors, isDark } = useTheme();

  const source = findInstalledSource(installed, routeId);

  const [fields, setFields] = useState<SourceSettingField[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [isSavingCookies, setIsSavingCookies] = useState(false);
  const [isWebViewLoading, setIsWebViewLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "cloudflare">("login");
  const [loginCapture, setLoginCapture] = useState<{ key: string; setting: string } | null>(null);
  const webViewRef = useRef<WebView>(null);
  const captureResolve = useRef<((value: string | null) => void) | null>(null);
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
      Alert.alert(t("error"), t("source_settings_load_error"));
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
      Alert.alert(t("error"), t("source_settings_save_error"));
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

  const openLogin = (
    url: string,
    capture?: { key: string; setting: string },
  ) => {
    setLoginCapture(capture ?? null);
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
    // Challenge cookies left by earlier attempts (made with another user agent) are bound to that
    // agent, so the check keeps failing against them. Drop them and start the check from scratch;
    // other cookies of the site (a login, for example) are kept.
    void clearChallengeCookies(baseUrl).finally(() => setLoginUrl(baseUrl));
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
        userAgent: CHROME_IOS_USER_AGENT,
        savedAt: Date.now(),
      });
      clearHostChallenge(host);
      clearResponseCache([host]);
      resetHostThrottle([host]);

      Alert.alert(
        t("source_cloudflare_title"),
        t("source_cloudflare_saved"),
        [{ text: t("ok"), onPress: closeLogin }],
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
              Alert.alert(t("error"), t("source_maintenance_error"));
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
      Alert.alert(t("error"), t("source_maintenance_error"));
    } finally {
      setBusyAction(null);
    }
  };

  // Reads one localStorage key of the page currently shown in the WebView (the answer comes back via onMessage).
  const readLocalStorage = (key: string) =>
    new Promise<string | null>((resolve) => {
      captureResolve.current = resolve;
      setTimeout(() => {
        captureResolve.current?.(null);
        captureResolve.current = null;
      }, 3000);
      const quoted = JSON.stringify(key);
      webViewRef.current?.injectJavaScript(
        `(function(){var v=null;try{v=window.localStorage.getItem(${quoted})}catch(e){}` +
          `window.ReactNativeWebView.postMessage(JSON.stringify({tamdokLocalStorage:${quoted},value:v}));})();true;`,
      );
    });

  const saveLocalStorageToken = async (
    capture: { key: string; setting: string },
  ) => {
    if (!source || isSavingCookies) return;
    setIsSavingCookies(true);
    try {
      const value = (await readLocalStorage(capture.key))?.trim();
      if (!value) {
        Alert.alert(t("source_token_title"), t("source_token_not_found"));
        return;
      }
      await setSourceSettingValue(source.id, capture.setting, value);
      await refreshFields();
      Alert.alert(t("source_token_title"), t("source_token_saved"), [
        { text: t("ok"), onPress: closeLogin },
      ]);
    } catch {
      Alert.alert(
        t("source_cookies_save_error_title"),
        t("source_cookies_save_error_message"),
      );
    } finally {
      setIsSavingCookies(false);
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
            text: t("ok"),
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
        <SourceNotFound />
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
          <View style={styles.emptyWrap}>
            <EmptyState
              compact
              icon="options-outline"
              title={t("source_settings_empty_title")}
              description={t("source_settings_empty_desc")}
            />
          </View>
        ) : (
          sections.map((section, sectionIndex) => (
            <View
              key={section.title ?? section.footer ?? `section-${sectionIndex}`}
              style={styles.sectionWrap}
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
                          onPress={() => openLogin(field.url, field.captureLocalStorage)}
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
                            accessibilityLabel={field.title}
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
                      <View key={field.id}>
                        <View style={styles.groupHeader}>
                          <ThemedText variant="subheadline" color="secondaryLabel">
                            {field.title}
                          </ThemedText>
                        </View>
                        {field.options.map((option) => {
                          const selected = field.value.includes(option.id);
                          return (
                            <View key={option.id}>
                              <CardSeparator />
                              <Pressable
                                style={({ pressed }) => [
                                  styles.row,
                                  pressed && { backgroundColor: colors.quaternaryFill },
                                ]}
                                onPress={() =>
                                  void updateField(
                                    field,
                                    selected
                                      ? field.value.filter((value) => value !== option.id)
                                      : [...field.value, option.id],
                                  )
                                }
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: selected }}
                              >
                                <ThemedText variant="body" style={styles.rowLabel}>
                                  {option.label}
                                </ThemedText>
                                {selected ? (
                                  <Ionicons name="checkmark" size={20} color={colors.tint} />
                                ) : null}
                              </Pressable>
                            </View>
                          );
                        })}
                        {!isLast ? <CardSeparator /> : null}
                      </View>
                    );
                  }

                  if (field.type === "list") {
                    return (
                      <EditableListField
                        key={field.id}
                        field={field}
                        colors={colors}
                        isDark={isDark}
                        isLast={isLast}
                        onChange={(value) => void updateField(field, value)}
                      />
                    );
                  }

                  if (field.type === "select") {
                    return (
                      <View key={field.id}>
                        <MenuPickerRow
                          label={field.title}
                          options={field.options}
                          selectedId={field.value}
                          onSelect={(id) => void updateField(field, id)}
                        />
                        {!isLast ? <CardSeparator /> : null}
                      </View>
                    );
                  }

                  return (
                    <View key={field.id}>
                      <View style={styles.row}>
                        <ThemedText variant="body" style={styles.inputLabel}>
                          {field.title}
                        </ThemedText>
                        <TextInput
                          clearButtonMode="while-editing"
                          value={field.value}
                          onChangeText={(value) => void updateField(field, value)}
                          placeholder={field.placeholder ?? field.title}
                          placeholderTextColor={colors.tertiaryLabel}
                          keyboardAppearance={isDark ? "dark" : "light"}
                          secureTextEntry={field.secure}
                          autoCapitalize={field.secure ? "none" : "sentences"}
                          autoCorrect={!field.secure}
                          accessibilityLabel={field.title}
                          style={[styles.inlineInput, { color: colors.label }]}
                        />
                      </View>
                      {!isLast ? <CardSeparator /> : null}
                    </View>
                  );
                })}
              </Card>

              {section.footer ? <SectionFooter>{section.footer}</SectionFooter> : null}
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

        <View style={styles.deleteWrap}>
          <Card style={styles.sectionCard}>
            <Pressable
              style={({ pressed }) => [
                styles.row,
                styles.centeredRow,
                pressed && { backgroundColor: colors.quaternaryFill },
              ]}
              onPress={confirmDelete}
              accessibilityRole="button"
            >
              <ThemedText variant="body" color="destructive">
                {t("sources_uninstall_action")}
              </ThemedText>
            </Pressable>
          </Card>
        </View>
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
                    <ModalHeader
            title={loginHost(loginUrl)}
            closeLabel={t("source_web_close")}
            onClose={closeLogin}
            actionLabel={t("source_web_save")}
            actionLoading={isSavingCookies}
            onAction={() =>
              void (loginMode === "cloudflare"
                ? saveClearance(loginUrl || "")
                : loginCapture
                  ? saveLocalStorageToken(loginCapture)
                  : saveCookies(loginUrl || ""))
            }
          />

          {isWebViewLoading ? (
            <View style={styles.webViewLoading}>
              <ActivityIndicator />
            </View>
          ) : null}

          {loginUrl !== null ? (
            <TypedWebView
              ref={webViewRef}
              onMessage={(event: { nativeEvent: { data: string } }) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data && typeof data.tamdokLocalStorage === "string") {
                    captureResolve.current?.(data.value ?? null);
                    captureResolve.current = null;
                  }
                } catch {
                  // Not our message.
                }
              }}
              source={{
                uri: loginUrl,
                // Looks like a visitor arriving from a search result.
                ...(loginMode === "cloudflare" ? { headers: { Referer: "https://www.google.com/" } } : null),
              }}
              // Chrome for iOS is itself a WKWebView, so a CriOS user agent matches this engine and Cloudflare does
              // not compare it against Safari's version. Plain Safari-looking strings made the check loop forever.
              userAgent={loginMode === "cloudflare" ? CHROME_IOS_USER_AGENT : undefined}
              // The app-to-page bridge (window.ReactNativeWebView / window.webkit) is a tell for embedded browsers,
              // and the Cloudflare check also runs inside sub-frames. In Cloudflare mode nothing needs the bridge
              // (the user agent is the fixed string above), so it is removed from every frame before the page runs.
              injectedJavaScriptBeforeContentLoaded={
                loginMode === "cloudflare"
                  ? "try{delete window.ReactNativeWebView}catch(e){};try{delete window.webkit}catch(e){};true;"
                  : undefined
              }
              injectedJavaScriptBeforeContentLoadedForMainFrameOnly={loginMode !== "cloudflare"}
              style={styles.webView}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              javaScriptCanOpenWindowsAutomatically={loginMode !== "cloudflare"}
              setSupportMultipleWindows={false}
              startInLoadingState={loginMode !== "cloudflare"}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              onLoadStart={() => setIsWebViewLoading(true)}
              onLoadEnd={() => setIsWebViewLoading(false)}
              onOpenWindow={({ nativeEvent }: { nativeEvent: { targetUrl: string } }) => {
                const targetUrl = nativeEvent.targetUrl;

                if (
                  targetUrl.startsWith("https://") ||
                  targetUrl.startsWith("http://")
                ) {
                  setLoginUrl(targetUrl);
                }
              }}
              onError={({ nativeEvent }: { nativeEvent: { description: string } }) => {
                console.warn("WebView error:", nativeEvent.description);
              }}
            />
          ) : null}
        </View>
      </Modal>
    </>
  );
}

// The package typings do not satisfy the current JSX types; the runtime component is unchanged.
const TypedWebView = WebView as unknown as ComponentType<any>;

const IOS_MAJOR = parseInt(String(Platform.Version), 10) || 18;
// Same OS token Safari reports (the minor part is frozen), Chrome for iOS product token.
const CHROME_IOS_USER_AGENT = `Mozilla/5.0 (iPhone; CPU iPhone OS ${IOS_MAJOR}_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1`;

async function clearChallengeCookies(url: string): Promise<void> {
  try {
    const cookies = await CookieManager.get(url, Platform.OS === "ios");
    await Promise.all(
      Object.keys(cookies)
        .filter((name) => /^(cf_clearance|__cf_bm|__cflb|_cfuvid|cf_chl.*)$/i.test(name))
        .map((name) => CookieManager.clearByName(url, name, Platform.OS === "ios")),
    );
  } catch {
    // Starting without clearing is still better than not opening the check at all.
  }
}

function loginHost(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
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
  emptyWrap: {
    paddingVertical: Spacing.lg,
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
  sectionWrap: {
    gap: Spacing.sm,
  },
  groupHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  inputLabel: {
    flexShrink: 0,
    maxWidth: "45%",
  },
  inlineInput: {
    flex: 1,
    fontSize: 17,
    textAlign: "right",
    paddingVertical: Spacing.xs,
  },
  listInput: {
    flex: 1,
    fontSize: 17,
    paddingVertical: Spacing.xs,
  },
  centeredRow: {
    justifyContent: "center",
  },
  deleteWrap: {
    marginTop: Spacing.lg,
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
    fontSize: 17,
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
    marginTop: MODAL_HEADER_HEIGHT,
  },
  webViewLoading: {
    position: "absolute",
    top: MODAL_HEADER_HEIGHT + 10,
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
  isDark: boolean;
  isLast: boolean;
  onChange: (value: string[]) => void;
};

function EditableListField({ field, colors, isDark, isLast, onChange }: EditableListFieldProps) {
  const [draft, setDraft] = useState("");

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
    <View>
      <View style={styles.groupHeader}>
        <ThemedText variant="subheadline" color="secondaryLabel">
          {field.title}
        </ThemedText>
      </View>

      {field.value.length === 0 ? (
        <>
          <CardSeparator />
          <View style={styles.row}>
            <ThemedText variant="body" color="tertiaryLabel">
              {t("source_settings_list_empty")}
            </ThemedText>
          </View>
        </>
      ) : (
        field.value.map((item, index) => (
          <View key={`${item}-${index}`}>
            <CardSeparator />
            <View style={styles.row}>
              <ThemedText variant="body" style={styles.rowLabel}>
                {item}
              </ThemedText>
              <Pressable
                onPress={() => removeItem(index)}
                hitSlop={13}
                accessibilityRole="button"
                accessibilityLabel={t("remove")}
              >
                <Ionicons name="trash-outline" size={20} color={colors.tint} />
              </Pressable>
            </View>
          </View>
        ))
      )}

      <CardSeparator />
      <View style={styles.row}>
        <TextInput
          clearButtonMode="while-editing"
          value={draft}
          onChangeText={setDraft}
          placeholder={field.placeholder ?? t("source_settings_add_item")}
          placeholderTextColor={colors.tertiaryLabel}
          keyboardAppearance={isDark ? "dark" : "light"}
          returnKeyType="done"
          onSubmitEditing={addItem}
          style={[styles.listInput, { color: colors.label }]}
        />
        <Pressable
          onPress={addItem}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("add")}
        >
          <Ionicons name="add-circle" size={26} color={colors.tint} />
        </Pressable>
      </View>

      {!isLast ? <CardSeparator /> : null}
    </View>
  );
}
