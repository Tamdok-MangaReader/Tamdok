import { Host, Menu, Picker, RNHostView, Text, Toggle } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  menuActionDismissBehavior,
  menuIndicator,
  menuStyle,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { FilterDefinition, FilterValue } from '@/parsers/shared/types';

const MAX_MENU_OPTIONS = 25;

type MultiSelectDefinition = Extract<FilterDefinition, { type: 'multiSelect' }>;

/** Filters with a short, flat set of choices open as a native pull-down menu; the rest keep the floating panel. */
export function isNativeMenuFilter(definition: FilterDefinition): boolean {
  if (definition.type === 'sort' || definition.type === 'select') return true;
  if (definition.type === 'multiSelect') {
    return definition.id !== 'genres' && definition.id !== 'tags' && definition.options.length <= MAX_MENU_OPTIONS;
  }
  return false;
}

function ChipFace({ label }: { label: string }) {
  const { colors, radius } = useTheme();
  return (
    <GlassSurface borderRadius={radius.pill} style={styles.chip} glassStyle='regular'>
      <View style={styles.face}>
        <ThemedText variant='callout' numberOfLines={1}>
          {label}
        </ThemedText>
        <Ionicons name='chevron-down' size={15} color={colors.tertiaryLabel} />
      </View>
    </GlassSurface>
  );
}

export function NativeFilterMenu({
  definition,
  values,
  label,
  onApply,
}: {
  definition: FilterDefinition;
  values: FilterValue[];
  label: string;
  onApply: (next: FilterValue) => void;
}) {
  const { colors, isDark } = useTheme();

  let items: React.ReactNode = null;

  if (definition.type === 'sort') {
    const current = values.find((value) => value.id === definition.id);
    const selectedIndex = current?.type === 'sort' ? current.index : (definition.default ?? 0);
    const defaultAscending = definition.defaultAscending ?? true;
    items = (
      <Picker
        label={definition.title}
        selection={String(selectedIndex)}
        onSelectionChange={(value: string) => {
          const index = Number(value);
          onApply({
            type: 'sort',
            id: definition.id,
            index,
            ascending:
              current?.type === 'sort' && selectedIndex === index
                ? current.ascending
                : index === (definition.default ?? 0)
                  ? defaultAscending
                  : false,
          });
        }}
        modifiers={[pickerStyle('inline')]}>
        {definition.options.map((option, index) => (
          <Text key={index} modifiers={[tag(String(index))]}>
            {option}
          </Text>
        ))}
      </Picker>
    );
  } else if (definition.type === 'select') {
    const current = values.find(
      (value): value is Extract<FilterValue, { type: 'select' }> =>
        value.id === definition.id && value.type === 'select',
    );
    const selected = current?.value ?? definition.default ?? definition.options[0]?.id ?? '';
    items = (
      <Picker
        label={definition.title}
        selection={selected}
        onSelectionChange={(value: string) => onApply({ type: 'select', id: definition.id, value })}
        modifiers={[pickerStyle('inline')]}>
        {definition.options.map((option) => (
          <Text key={option.id} modifiers={[tag(option.id)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    );
  } else if (definition.type === 'multiSelect') {
    const multi = definition as MultiSelectDefinition;
    const current = values.find(
      (value): value is Extract<FilterValue, { type: 'multiSelect' }> =>
        value.id === multi.id && value.type === 'multiSelect',
    );
    const included = current?.included ?? [];
    const excluded = current?.excluded ?? [];
    items = multi.options.map((option) => (
      <Toggle
        key={option.id}
        label={option.label}
        isOn={included.includes(option.id)}
        // Keep the menu open so several options can be ticked in a row.
        modifiers={[menuActionDismissBehavior('disabled')]}
        onIsOnChange={(isOn) =>
          onApply({
            type: 'multiSelect',
            id: multi.id,
            included: isOn ? [option.id, ...included] : included.filter((id) => id !== option.id),
            excluded: excluded.filter((id) => id !== option.id),
            ...(current?.matchAll != null ? { matchAll: current.matchAll } : {}),
          })
        }
      />
    ));
  }

  return (
    <Host matchContents seedColor={colors.tint} colorScheme={isDark ? 'dark' : 'light'}>
      <Menu
        label={
          <RNHostView matchContents>
            <ChipFace label={label} />
          </RNHostView>
        }
        modifiers={[menuStyle('button'), buttonStyle('plain'), menuIndicator('hidden')]}>
        {items}
      </Menu>
    </Host>
  );
}

const styles = StyleSheet.create({
  chip: {
    maxWidth: 220,
  },
  face: {
    height: 40,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
});

/** Generic chip with a native pull-down menu: a checkmark list for one choice, ticks that keep the menu open for several. */
export function NativeChipMenu({
  label,
  options,
  multiple,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  multiple: boolean;
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const { colors, isDark } = useTheme();

  const items = multiple ? (
    options.map((option) => (
      <Toggle
        key={option.id}
        label={option.label}
        isOn={selected.includes(option.id)}
        modifiers={[menuActionDismissBehavior('disabled')]}
        onIsOnChange={(isOn) =>
          onChange(isOn ? [...selected, option.id] : selected.filter((id) => id !== option.id))
        }
      />
    ))
  ) : (
    <Picker
      label={label}
      selection={selected[0] ?? ''}
      onSelectionChange={(value: string) => onChange([value])}
      modifiers={[pickerStyle('inline')]}>
      {options.map((option) => (
        <Text key={option.id} modifiers={[tag(option.id)]}>
          {option.label}
        </Text>
      ))}
    </Picker>
  );

  return (
    <Host matchContents seedColor={colors.tint} colorScheme={isDark ? 'dark' : 'light'}>
      <Menu
        label={
          <RNHostView matchContents>
            <ChipFace label={label} />
          </RNHostView>
        }
        modifiers={[menuStyle('button'), buttonStyle('plain'), menuIndicator('hidden')]}>
        {items}
      </Menu>
    </Host>
  );
}

export const NATIVE_MENU_MAX_OPTIONS = MAX_MENU_OPTIONS;
