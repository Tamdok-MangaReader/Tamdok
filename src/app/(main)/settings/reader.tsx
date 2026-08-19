import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { InlinePillGrid } from '@/components/library/inline-pill-grid';
import { Card, CardSeparator } from '@/components/ui/card';
import { ScreenContent } from '@/components/ui/screen-content';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import {
  getAppSettings,
  updateAppSettings,
  type DictionaryDisplayMode,
  type DictionaryLookupGesture,
  type DictionarySettings,
  type PagedPageLayout,
  type PillarboxOrientation,
  type ReaderBackgroundColor,
  type ReaderOrientation,
  type ReaderSettings,
  type ReadingMode,
  type TapZones,
  type TextReaderStyle,
} from '@/services/app-settings';

const READING_MODES: ReadingMode[] = ['default', 'auto', 'rtl', 'ltr', 'vertical', 'webtoon', 'continuous'];
const BACKGROUND_COLORS: ReaderBackgroundColor[] = ['system', 'white', 'black'];
const ORIENTATIONS: ReaderOrientation[] = ['device', 'portrait', 'landscape'];
const TAP_ZONES: TapZones[] = ['disabled', 'left-right', 'l-shaped', 'kindle', 'edge', 'auto'];
const PAGE_LAYOUTS: PagedPageLayout[] = ['auto', 'single', 'double'];
const PILLARBOX_ORIENTATIONS: PillarboxOrientation[] = ['both', 'horizontal', 'vertical'];
const TEXT_FONT_FAMILIES = ['System', 'serif', 'monospace'] as const;
const TEXT_STYLES: TextReaderStyle[] = ['scroll', 'paged'];
const DICTIONARY_GESTURES: DictionaryLookupGesture[] = ['long-press', 'single-tap'];
const DICTIONARY_DISPLAY_MODES: DictionaryDisplayMode[] = ['popup', 'fullWidth'];

export default function ReaderSettingsScreen() {
  const [settings, setSettings] = useState<ReaderSettings | null>(null);
  const [dictionarySettings, setDictionarySettings] = useState<DictionarySettings | null>(null);

  useEffect(() => {
    void getAppSettings().then((value) => {
      setSettings(value.reader);
      setDictionarySettings(value.dictionary);
    });
  }, []);

  const patch = (reader: Partial<ReaderSettings>) => {
    void updateAppSettings({ reader: { ...settings!, ...reader } }).then((value) => setSettings(value.reader));
  };

  const patchDictionary = (dictionary: Partial<DictionarySettings>) => {
    void updateAppSettings({ dictionary: { ...dictionarySettings!, ...dictionary } }).then((value) =>
      setDictionarySettings(value.dictionary),
    );
  };

  const readingModeOptions = useMemo(
    () => READING_MODES.map((mode) => ({ id: mode, label: t(`reader_mode_${mode}`) })),
    [],
  );
  const backgroundOptions = useMemo(
    () => BACKGROUND_COLORS.map((color) => ({ id: color, label: t(`reader_background_${color}`) })),
    [],
  );
  const orientationOptions = useMemo(
    () => ORIENTATIONS.map((orientation) => ({ id: orientation, label: t(`reader_orientation_${orientation}`) })),
    [],
  );
  const tapZoneOptions = useMemo(
    () => TAP_ZONES.map((zone) => ({ id: zone, label: t(`reader_tap_zones_${zone.replace('-', '_')}`) })),
    [],
  );
  const pageLayoutOptions = useMemo(
    () => PAGE_LAYOUTS.map((layout) => ({ id: layout, label: t(`reader_page_layout_${layout}`) })),
    [],
  );
  const pillarboxOrientationOptions = useMemo(
    () =>
      PILLARBOX_ORIENTATIONS.map((orientation) => ({
        id: orientation,
        label: t(`reader_pillarbox_orientation_${orientation}`),
      })),
    [],
  );
  const textStyleOptions = useMemo(
    () => TEXT_STYLES.map((style) => ({ id: style, label: t(`reader_text_style_${style}`) })),
    [],
  );
  const fontFamilyOptions = useMemo(
    () =>
      TEXT_FONT_FAMILIES.map((family) => ({
        id: family,
        label: t(`reader_text_font_family_${family}` as 'reader_text_font_family_System'),
      })),
    [],
  );
  const dictionaryGestureOptions = useMemo(
    () =>
      DICTIONARY_GESTURES.map((gesture) => ({
        id: gesture,
        label: t(`dictionary_lookup_gesture_${gesture.replace('-', '_')}`),
      })),
    [],
  );
  const dictionaryDisplayOptions = useMemo(
    () =>
      DICTIONARY_DISPLAY_MODES.map((mode) => ({
        id: mode,
        label: t(`dictionary_display_mode_${mode}`),
      })),
    [],
  );

  if (!settings || !dictionarySettings) return null;

  return (
    <>
      <Stack.Screen options={{ title: t('reader_settings_title') }} />
      <ScreenContent>
        <SectionLabel isFirst>{t('reader_general_section')}</SectionLabel>
        <Card style={cardStyle}>
          <ThemedText variant='subheadline'>{t('reader_reading_mode')}</ThemedText>
          <InlinePillGrid
            options={readingModeOptions}
            selectedId={settings.readingMode}
            preserveOrder
            onSelect={(id) => patch({ readingMode: id as ReadingMode })}
          />
        </Card>
        <Card>
          <SettingSwitch
            label={t('reader_skip_duplicate_chapters')}
            value={settings.skipDuplicateChapters}
            onChange={(value) => patch({ skipDuplicateChapters: value })}
            isFirst
          />
          <CardSeparator />
          <SettingSwitch
            label={t('reader_mark_duplicate_chapters')}
            value={settings.markDuplicateChapters}
            onChange={(value) => patch({ markDuplicateChapters: value })}
          />
          <CardSeparator />
          <SettingSwitch
            label={t('reader_downsample_images')}
            value={settings.downsampleImages}
            onChange={(value) => patch({ downsampleImages: value })}
          />
          <CardSeparator />
          <SettingSwitch
            label={t('reader_crop_borders')}
            value={settings.cropBorders}
            onChange={(value) => patch({ cropBorders: value })}
          />
          <CardSeparator />
          <SettingSwitch
            label={t('reader_disable_quick_actions')}
            value={settings.disableQuickActions}
            onChange={(value) => patch({ disableQuickActions: value })}
          />
          <CardSeparator />
          <SettingSwitch
            label={t('reader_disable_double_tap')}
            value={settings.disableDoubleTap}
            onChange={(value) => patch({ disableDoubleTap: value })}
          />
          <CardSeparator />
          <SettingSwitch
            label={t('reader_live_text')}
            value={settings.liveText}
            onChange={(value) => patch({ liveText: value })}
          />
          <CardSeparator />
          <SettingSwitch
            label={t('reader_hide_bars_on_swipe')}
            value={settings.hideBarsOnSwipe}
            onChange={(value) => patch({ hideBarsOnSwipe: value })}
          />
          <CardSeparator />
          <SettingSwitch
            label={t('reader_hide_status_bar_with_menu')}
            value={settings.hideStatusBarWithMenu}
            onChange={(value) => patch({ hideStatusBarWithMenu: value })}
            isLast
          />
        </Card>
        <Card style={cardStyle}>
          <ThemedText variant='subheadline'>{t('reader_background_color')}</ThemedText>
          <InlinePillGrid
            options={backgroundOptions}
            selectedId={settings.backgroundColor}
            preserveOrder
            onSelect={(id) => patch({ backgroundColor: id as ReaderBackgroundColor })}
          />
        </Card>
        <Card style={cardStyle}>
          <ThemedText variant='subheadline'>{t('reader_orientation')}</ThemedText>
          <InlinePillGrid
            options={orientationOptions}
            selectedId={settings.orientation}
            preserveOrder
            onSelect={(id) => patch({ orientation: id as ReaderOrientation })}
          />
        </Card>

        <SectionLabel>{t('reader_tap_zones_section')}</SectionLabel>
        <Card style={cardStyle}>
          <ThemedText variant='subheadline'>{t('reader_tap_zones')}</ThemedText>
          <InlinePillGrid
            options={tapZoneOptions}
            selectedId={settings.tapZones}
            preserveOrder
            onSelect={(id) => patch({ tapZones: id as TapZones })}
          />
        </Card>
        <Card>
          <SettingSwitch
            label={t('reader_invert_tap_zones')}
            value={settings.invertTapZones}
            onChange={(value) => patch({ invertTapZones: value })}
            isFirst
          />
          <CardSeparator />
          <SettingSwitch
            label={t('reader_animate_transitions')}
            value={settings.animatePageTransitions}
            onChange={(value) => patch({ animatePageTransitions: value })}
            isLast
          />
        </Card>

        <SectionLabel>{t('reader_paged_section')}</SectionLabel>
        <Card>
          <StepperRow
            label={t('reader_pages_to_preload')}
            value={settings.pagesToPreload}
            min={0}
            max={5}
            onChange={(value) => patch({ pagesToPreload: value })}
            isFirst
            isLast
          />
        </Card>
        <Card style={cardStyle}>
          <ThemedText variant='subheadline'>{t('reader_page_layout')}</ThemedText>
          <InlinePillGrid
            options={pageLayoutOptions}
            selectedId={settings.pagedPageLayout}
            preserveOrder
            onSelect={(id) => patch({ pagedPageLayout: id as PagedPageLayout })}
          />
        </Card>
        <Card>
          <SettingSwitch
            label={t('reader_page_offset')}
            value={settings.pagedPageOffset}
            onChange={(value) => patch({ pagedPageOffset: value })}
            isFirst
          />
          <CardSeparator />
          <SettingSwitch
            label={t('reader_split_wide_images')}
            value={settings.splitWideImages}
            onChange={(value) => patch({ splitWideImages: value })}
          />
          <CardSeparator />
          <SettingSwitch
            label={t('reader_reverse_split_order')}
            value={settings.reverseSplitOrder}
            onChange={(value) => patch({ reverseSplitOrder: value })}
            isLast
          />
        </Card>

        <SectionLabel>{t('reader_webtoon_section')}</SectionLabel>
        <Card>
          <SettingSwitch
            label={t('reader_vertical_infinite_scroll')}
            value={settings.verticalInfiniteScroll}
            onChange={(value) => patch({ verticalInfiniteScroll: value })}
            isFirst
          />
          <CardSeparator />
          <SettingSwitch
            label={t('reader_pillarbox')}
            value={settings.pillarbox}
            onChange={(value) => patch({ pillarbox: value })}
          />
          <CardSeparator />
          <StepperRow
            label={t('reader_pillarbox_amount')}
            value={settings.pillarboxAmount}
            min={0}
            max={50}
            onChange={(value) => patch({ pillarboxAmount: value })}
            isLast
          />
        </Card>
        <Card style={cardStyle}>
          <ThemedText variant='subheadline'>{t('reader_pillarbox_orientation')}</ThemedText>
          <InlinePillGrid
            options={pillarboxOrientationOptions}
            selectedId={settings.pillarboxOrientation}
            preserveOrder
            onSelect={(id) => patch({ pillarboxOrientation: id as PillarboxOrientation })}
          />
        </Card>

        <SectionLabel>{t('dictionary_section')}</SectionLabel>
        <Card>
          <SettingSwitch
            label={t('dictionary_enable')}
            value={dictionarySettings.enable}
            onChange={(value) => patchDictionary({ enable: value })}
            isFirst
          />
        </Card>
        <Card style={cardStyle}>
          <ThemedText variant='subheadline'>{t('dictionary_lookup_gesture')}</ThemedText>
          <InlinePillGrid
            options={dictionaryGestureOptions}
            selectedId={dictionarySettings.lookupGesture}
            preserveOrder
            onSelect={(id) => patchDictionary({ lookupGesture: id as DictionaryLookupGesture })}
          />
        </Card>
        <Card>
          <SettingSwitch
            label={t('dictionary_text_overlay')}
            value={dictionarySettings.textOverlayMode}
            onChange={(value) => patchDictionary({ textOverlayMode: value })}
            isFirst
          />
          <CardSeparator />
          <StepperRow
            label={t('dictionary_overlay_padding')}
            value={dictionarySettings.overlayPadding}
            min={0}
            max={16}
            onChange={(value) => patchDictionary({ overlayPadding: value })}
          />
          <CardSeparator />
          <StepperRow
            label={t('dictionary_overlay_text_scale')}
            value={Math.round(dictionarySettings.overlayTextScaleMultiplier * 10)}
            min={5}
            max={20}
            onChange={(value) => patchDictionary({ overlayTextScaleMultiplier: value / 10 })}
          />
          <CardSeparator />
          <SettingSwitch
            label={t('dictionary_restrict_ocr_languages')}
            value={dictionarySettings.restrictOCRLanguages}
            onChange={(value) => patchDictionary({ restrictOCRLanguages: value })}
            isLast
          />
        </Card>
        <Card style={cardStyle}>
          <ThemedText variant='subheadline'>{t('dictionary_display_mode')}</ThemedText>
          <InlinePillGrid
            options={dictionaryDisplayOptions}
            selectedId={dictionarySettings.displayMode}
            preserveOrder
            onSelect={(id) => patchDictionary({ displayMode: id as DictionaryDisplayMode })}
          />
        </Card>
        <Card>
          <StepperRow
            label={t('dictionary_popup_width')}
            value={dictionarySettings.popupWidth}
            min={240}
            max={480}
            step={20}
            onChange={(value) => patchDictionary({ popupWidth: value })}
            isFirst
          />
          <CardSeparator />
          <StepperRow
            label={t('dictionary_popup_height')}
            value={dictionarySettings.popupHeight}
            min={160}
            max={480}
            step={20}
            onChange={(value) => patchDictionary({ popupHeight: value })}
            isLast
          />
        </Card>

        <SectionLabel>{t('reader_text_section')}</SectionLabel>
        <Card style={cardStyle}>
          <ThemedText variant='subheadline'>{t('reader_text_style')}</ThemedText>
          <InlinePillGrid
            options={textStyleOptions}
            selectedId={settings.textReaderStyle}
            preserveOrder
            onSelect={(id) => patch({ textReaderStyle: id as TextReaderStyle })}
          />
        </Card>
        <Card style={cardStyle}>
          <ThemedText variant='subheadline'>{t('reader_text_font_family')}</ThemedText>
          <InlinePillGrid
            options={fontFamilyOptions}
            selectedId={settings.textFontFamily}
            preserveOrder
            onSelect={(id) => patch({ textFontFamily: id })}
          />
        </Card>
        <Card>
          <StepperRow
            label={t('reader_text_font_size')}
            value={settings.textFontSize}
            min={12}
            max={32}
            onChange={(value) => patch({ textFontSize: value })}
            isFirst
          />
          <CardSeparator />
          <StepperRow
            label={t('reader_text_line_spacing')}
            value={settings.textLineSpacing}
            min={0}
            max={24}
            onChange={(value) => patch({ textLineSpacing: value })}
          />
          <CardSeparator />
          <StepperRow
            label={t('reader_text_horizontal_padding')}
            value={settings.textHorizontalPadding}
            min={0}
            max={64}
            onChange={(value) => patch({ textHorizontalPadding: value })}
            isLast
          />
        </Card>
      </ScreenContent>
    </>
  );
}

const cardStyle = { padding: Spacing.lg, gap: Spacing.md };

function SettingSwitch({
  label,
  value,
  onChange,
  isFirst,
  isLast,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        paddingTop: isFirst ? Spacing.lg : Spacing.md,
        paddingBottom: isLast ? Spacing.lg : Spacing.md,
        gap: Spacing.md,
      }}>
      <ThemedText variant='body' style={{ flex: 1 }}>
        {label}
      </ThemedText>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function StepperRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  isFirst,
  isLast,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        paddingTop: isFirst ? Spacing.lg : Spacing.md,
        paddingBottom: isLast ? Spacing.lg : Spacing.md,
        gap: Spacing.md,
      }}>
      <ThemedText variant='body' style={{ flex: 1 }}>
        {label}
      </ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - step))}
          hitSlop={8}
          accessibilityRole='button'>
          <ThemedText variant='title3'>−</ThemedText>
        </Pressable>
        <ThemedText variant='body' style={{ minWidth: 28, textAlign: 'center' }}>
          {value}
        </ThemedText>
        <Pressable
          onPress={() => onChange(Math.min(max, value + step))}
          hitSlop={8}
          accessibilityRole='button'>
          <ThemedText variant='title3'>+</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}
