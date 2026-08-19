import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';

import { Card, CardSeparator } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassSurface } from '@/components/ui/glass-surface';
import { ScreenContent } from '@/components/ui/screen-content';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useSources } from '@/context/sources-context';
import { useTheme } from '@/hooks/use-theme';
import {
  loadSourceSettingFields,
  setSourceSettingValue,
  type SourceSettingField,
} from '@/services/source-settings';
import { findInstalledSource } from '@/services/sources';

const PRESS_SPRING = { damping: 14, stiffness: 320, mass: 0.6 };

type InstalledSourceSettingsProps = {
  sourceRouteId: string;
};

type SettingSection = {
  title?: string;
  footer?: string;
  fields: Exclude<SourceSettingField, { type: 'section' }>[];
};

function groupSettingFields(fields: SourceSettingField[]): SettingSection[] {
  const sections: SettingSection[] = [];
  let current: SettingSection = { fields: [] };

  for (const field of fields) {
    if (field.type === 'section') {
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

export function InstalledSourceSettings({ sourceRouteId: routeId }: InstalledSourceSettingsProps) {
  const router = useRouter();
  const { installed, uninstall } = useSources();
  const { colors, radius, isDark } = useTheme();
  const source = findInstalledSource(installed, routeId);
  const [fields, setFields] = useState<SourceSettingField[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const sections = useMemo(() => groupSettingFields(fields), [fields]);

  const refreshFields = useCallback(async () => {
    if (!source) return;
    setIsLoading(true);
    try {
      setFields(await loadSourceSettingFields(source));
    } finally {
      setIsLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void refreshFields();
  }, [refreshFields]);

  const updateField = async (
    field: Exclude<SourceSettingField, { type: 'section' }>,
    nextValue: boolean | string | string[],
  ) => {
    if (!source) return;
    await setSourceSettingValue(source.id, field.id, nextValue);
    setFields((current) =>
      current.map((item) => (item.id === field.id ? ({ ...item, value: nextValue } as SourceSettingField) : item)),
    );
  };

  const confirmDelete = () => {
    if (!source) return;
    Alert.alert(
      t('sources_uninstall_title'),
      t('sources_uninstall_confirm', { name: source.manifest.info.name }),
      [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('sources_uninstall_action'),
        style: 'destructive',
        onPress: async () => {
          await uninstall(source);
          router.back();
        },
      },
    ]);
  };

  if (!source) {
    return (
      <>
        <Stack.Screen options={{ title: t('source_settings_title') }} />
        <ScreenContent centerContent>
          <EmptyState icon='alert-circle-outline' title={t('sources_not_found')} />
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
            <EmptyState icon='options-outline' title={t('source_settings_empty_title')} description={t('source_settings_empty_desc')} />
          </View>
        ) : (
          sections.map((section, sectionIndex) => (
            <View key={section.title ?? section.footer ?? `section-${sectionIndex}`}>
              {section.title ? (
                <SectionLabel isFirst={sectionIndex === 0}>{section.title}</SectionLabel>
              ) : sectionIndex === 0 ? (
                <SectionLabel isFirst>{t('source_settings_section')}</SectionLabel>
              ) : null}
              <Card style={styles.sectionCard}>
                {section.fields.map((field, fieldIndex) => {
                  const isLast = fieldIndex === section.fields.length - 1;

                  if (field.type === 'link') {
                    return (
                      <View key={field.id}>
                        <Pressable
                          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.quaternaryFill }]}
                          onPress={() => void WebBrowser.openBrowserAsync(field.url)}
                          accessibilityRole='button'>
                          <ThemedText variant='body' style={styles.rowLabel}>
                            {field.title}
                          </ThemedText>
                          <Ionicons name='open-outline' size={18} color={colors.tint} />
                        </Pressable>
                        {!isLast ? <CardSeparator /> : null}
                      </View>
                    );
                  }

                  if (field.type === 'switch') {
                    return (
                      <View key={field.id}>
                        <View style={styles.row}>
                          <View style={styles.rowText}>
                            <ThemedText variant='body' style={styles.rowLabel}>
                              {field.title}
                            </ThemedText>
                            {field.subtitle ? (
                              <ThemedText variant='footnote' color='secondaryLabel'>
                                {field.subtitle}
                              </ThemedText>
                            ) : null}
                          </View>
                          <Switch value={field.value} onValueChange={(value) => void updateField(field, value)} />
                        </View>
                        {!isLast ? <CardSeparator /> : null}
                      </View>
                    );
                  }

                  if (field.type === 'multi-select') {
                    return (
                      <View key={field.id} style={styles.fieldBlock}>
                        <ThemedText variant='subheadline' color='secondaryLabel' style={styles.fieldTitle}>
                          {field.title}
                        </ThemedText>
                        <View style={styles.pillGrid}>
                          {field.options.map((option) => {
                            const selected = field.value.includes(option.id);
                            if (selected) {
                              return (
                                <Pressable
                                  key={option.id}
                                  style={[styles.pillActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}
                                  onPress={() =>
                                    void updateField(
                                      field,
                                      field.value.filter((value) => value !== option.id),
                                    )
                                  }>
                                  <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
                                    {option.label}
                                  </ThemedText>
                                </Pressable>
                              );
                            }

                            return (
                              <GlassSurface key={option.id} borderRadius={radius.pill} interactive>
                                <Pressable
                                  style={styles.pill}
                                  onPress={() => void updateField(field, [...field.value, option.id])}>
                                  <ThemedText variant='subheadline' numberOfLines={1}>
                                    {option.label}
                                  </ThemedText>
                                </Pressable>
                              </GlassSurface>
                            );
                          })}
                        </View>
                        {!isLast ? <View style={styles.fieldSeparator} /> : null}
                      </View>
                    );
                  }

                  if (field.type === 'list') {
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

                  if (field.type === 'select') {
                    return (
                      <View key={field.id} style={styles.fieldBlock}>
                        <ThemedText variant='subheadline' color='secondaryLabel' style={styles.fieldTitle}>
                          {field.title}
                        </ThemedText>
                        <View style={styles.pillGrid}>
                          {field.options.map((option) => {
                            const selected = field.value === option.id;
                            if (selected) {
                              return (
                                <Pressable
                                  key={option.id}
                                  style={[styles.pillActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}
                                  onPress={() => void updateField(field, option.id)}>
                                  <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
                                    {option.label}
                                  </ThemedText>
                                </Pressable>
                              );
                            }

                            return (
                              <GlassSurface key={option.id} borderRadius={radius.pill} interactive>
                                <Pressable style={styles.pill} onPress={() => void updateField(field, option.id)}>
                                  <ThemedText variant='subheadline' numberOfLines={1}>
                                    {option.label}
                                  </ThemedText>
                                </Pressable>
                              </GlassSurface>
                            );
                          })}
                        </View>
                        {!isLast ? <View style={styles.fieldSeparator} /> : null}
                      </View>
                    );
                  }

                  return (
                    <View key={field.id} style={styles.fieldBlock}>
                      <ThemedText variant='subheadline' color='secondaryLabel' style={styles.fieldTitle}>
                        {field.title}
                      </ThemedText>
                      <GlassSurface borderRadius={radius.sm} style={styles.inputWrap} interactive>
                        <TextInput
                          value={field.value}
                          onChangeText={(value) => void updateField(field, value)}
                          placeholder={field.placeholder ?? field.title}
                          placeholderTextColor={colors.tertiaryLabel}
                          keyboardAppearance={isDark ? 'dark' : 'light'}
                          secureTextEntry={field.secure}
                          autoCapitalize={field.secure ? 'none' : 'sentences'}
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
                <ThemedText variant='footnote' color='secondaryLabel' style={styles.sectionFooter}>
                  {section.footer}
                </ThemedText>
              ) : null}
            </View>
          ))
        )}

        <GlassSurface borderRadius={radius.pill} style={styles.deleteButton} interactive glassStyle='clear'>
          <Pressable
            style={({ pressed }) => [styles.deleteButtonPressable, pressed && { opacity: 0.82 }]}
            onPress={confirmDelete}
            accessibilityRole='button'>
            <ThemedText variant='headline' color='destructive'>
              {t('sources_uninstall_action')}
            </ThemedText>
          </Pressable>
        </GlassSurface>
      </ScreenContent>
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
    justifyContent: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    justifyContent: 'center',
  },
  textInput: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
    minHeight: 44,
  },
  deleteButton: {
    width: '100%',
    backgroundColor: 'rgba(255, 59, 48, 0.14)',
  },
  deleteButtonPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  listValue: {
    flex: 1,
  },
  listAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  listAddInput: {
    flex: 1,
  },
  listAddButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});

type EditableListFieldProps = {
  field: Extract<SourceSettingField, { type: 'list' }>;
  colors: { label: string; tertiaryLabel: string; tint: string; quaternaryFill: string };
  radius: { sm: number; pill: number };
  isDark: boolean;
  isLast: boolean;
  onChange: (value: string[]) => void;
};

function EditableListField({ field, colors, radius, isDark, isLast, onChange }: EditableListFieldProps) {
  const [draft, setDraft] = useState('');
  const scale = useSharedValue(1);
  const addButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const addItem = () => {
    const trimmed = draft.trim();
    if (!trimmed || field.value.includes(trimmed)) return;
    onChange([...field.value, trimmed]);
    setDraft('');
  };

  const removeItem = (index: number) => {
    onChange(field.value.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <View style={styles.fieldBlock}>
      <ThemedText variant='subheadline' color='secondaryLabel' style={styles.fieldTitle}>
        {field.title}
      </ThemedText>
      {field.value.length === 0 ? (
        <ThemedText variant='footnote' color='tertiaryLabel'>
          {t('source_settings_list_empty')}
        </ThemedText>
      ) : (
        field.value.map((item, index) => (
          <View key={`${item}-${index}`} style={styles.listRow}>
            <ThemedText variant='body' style={styles.listValue}>
              {item}
            </ThemedText>
            <Pressable onPress={() => removeItem(index)} hitSlop={8} accessibilityRole='button'>
              <Ionicons name='trash-outline' size={18} color={colors.tint} />
            </Pressable>
          </View>
        ))
      )}
      <View style={styles.listAddRow}>
        <GlassSurface borderRadius={radius.sm} style={[styles.inputWrap, styles.listAddInput]} interactive>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={field.placeholder ?? t('source_settings_add_item')}
            placeholderTextColor={colors.tertiaryLabel}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            returnKeyType='done'
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
          accessibilityRole='button'>
          <Reanimated.View
            style={[
              styles.listAddButton,
              { borderRadius: radius.pill, backgroundColor: colors.tint },
              addButtonStyle,
            ]}>
            <ThemedText variant='subheadline' color='onTint'>
              {t('add')}
            </ThemedText>
          </Reanimated.View>
        </Pressable>
      </View>
      {!isLast ? <View style={styles.fieldSeparator} /> : null}
    </View>
  );
}
