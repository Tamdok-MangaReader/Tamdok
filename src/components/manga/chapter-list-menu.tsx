import { Host, Menu, Picker, RNHostView, Text } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  menuIndicator,
  menuStyle,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { t } from "@/constants/locales";
import { useTheme } from "@/hooks/use-theme";

export type ChapterListFilter = "all" | "unread" | "downloaded" | "bookmarked";

const FILTERS: ChapterListFilter[] = ["all", "unread", "downloaded", "bookmarked"];

/** Pull-down next to the chapter list title: sort order and a "show only" filter, each as a checkmark section. */
export const ChapterListMenu = memo(function ChapterListMenu({
  ascending,
  filter,
  onChangeSort,
  onChangeFilter,
}: {
  ascending: boolean;
  filter: ChapterListFilter;
  onChangeSort: (ascending: boolean) => void;
  onChangeFilter: (filter: ChapterListFilter) => void;
}) {
  const { colors, isDark } = useTheme();
  const filtered = filter !== "all";

  return (
    <Host
      matchContents
      seedColor={colors.tint}
      colorScheme={isDark ? "dark" : "light"}
    >
      <Menu
        label={
          <RNHostView matchContents>
            <View
              style={styles.face}
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("manga_chapters_menu")}
            >
              <SFSymbolIcon
                name={
                  filtered
                    ? "line.3.horizontal.decrease.circle.fill"
                    : "line.3.horizontal.decrease.circle"
                }
                fallback="filter-circle-outline"
                size={22}
                color={colors.tint}
              />
            </View>
          </RNHostView>
        }
        modifiers={[
          menuStyle("button"),
          buttonStyle("plain"),
          menuIndicator("hidden"),
        ]}
      >
        <Picker
          label={t("manga_chapters_sort")}
          selection={ascending ? "asc" : "desc"}
          onSelectionChange={(value: string) => onChangeSort(value === "asc")}
          modifiers={[pickerStyle("inline")]}
        >
          <Text modifiers={[tag("desc")]}>{t("manga_chapters_newest")}</Text>
          <Text modifiers={[tag("asc")]}>{t("manga_chapters_oldest")}</Text>
        </Picker>
        <Picker
          label={t("manga_chapters_show")}
          selection={filter}
          onSelectionChange={(value: string) =>
            onChangeFilter(value as ChapterListFilter)
          }
          modifiers={[pickerStyle("inline")]}
        >
          {FILTERS.map((id) => (
            <Text key={id} modifiers={[tag(id)]}>
              {t(`manga_chapters_filter_${id}`)}
            </Text>
          ))}
        </Picker>
      </Menu>
    </Host>
  );
});

const styles = StyleSheet.create({
  face: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
