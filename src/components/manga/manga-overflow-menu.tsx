import { Button, Host, Menu, RNHostView } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  menuIndicator,
  menuStyle,
} from "@expo/ui/swift-ui/modifiers";
import * as Haptics from "expo-haptics";
import { Fragment, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { FullWindowOverlay } from "react-native-screens";

import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { GlassSurface } from "@/components/ui/glass-surface";
import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useTheme } from "@/hooks/use-theme";

type MenuItem = {
  key: string;
  label: string;
  sfSymbol: string;
  fallbackIcon:
    | "share-outline"
    | "folder-outline"
    | "list-outline"
    | "refresh-outline"
    | "download-outline"
    | "trash-outline"
    | "checkmark-circle-outline"
    | "ellipse-outline"
    | "checkbox-outline"
    | "square-outline"
    | "globe-outline"
    | "checkmark-done-outline";
  destructive?: boolean;
  onPress: () => void;
};

type MangaOverflowMenuProps = {
  chapterSelectMode: boolean;
  hasDownloads: boolean;
  canShare: boolean;
  canDownload: boolean;
  onShare: () => void;
  onOpenInBrowser: () => void;
  onSelectChapters: () => void;
  onMarkAllRead: () => void;
  onMarkAllUnread: () => void;
  onMarkSelectedRead: () => void;
  onMarkSelectedUnread: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRefresh: () => void;
  onDownloadAll: () => void;
  onDownloadUnread: () => void;
  onDownloadSelected: () => void;
  onRemoveDownloads: () => void;
};

function MenuRow({
  item,
  showDivider,
  trailingSymbol,
  onPress,
}: {
  item: MenuItem;
  showDivider: boolean;
  trailingSymbol?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuRow,
        showDivider && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.separator,
        },
        pressed && { backgroundColor: colors.quaternaryFill },
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <SFSymbolIcon
        name={item.sfSymbol}
        fallback={item.fallbackIcon}
        size={18}
        color={item.destructive ? colors.destructive : colors.label}
      />
      <ThemedText
        variant="body"
        color={item.destructive ? "destructive" : "label"}
        style={styles.menuLabel}
      >
        {item.label}
      </ThemedText>
      {trailingSymbol ? (
        <SFSymbolIcon
          name={trailingSymbol}
          fallback="chevron-down"
          size={16}
          color={colors.tertiaryLabel}
        />
      ) : null}
    </Pressable>
  );
}

function MangaOverflowMenuFallback({
  chapterSelectMode,
  hasDownloads,
  canShare,
  canDownload,
  onShare,
  onOpenInBrowser,
  onSelectChapters,
  onMarkAllRead,
  onMarkAllUnread,
  onMarkSelectedRead,
  onMarkSelectedUnread,
  onSelectAll,
  onDeselectAll,
  onRefresh,
  onDownloadAll,
  onDownloadUnread,
  onDownloadSelected,
  onRemoveDownloads,
}: MangaOverflowMenuProps) {
  const { radius } = useTheme();
  const [open, setOpen] = useState(false);
  const [markAllExpanded, setMarkAllExpanded] = useState(false);
  const [downloadExpanded, setDownloadExpanded] = useState(false);
  const [markSelectedExpanded, setMarkSelectedExpanded] = useState(false);
  const [selectExpanded, setSelectExpanded] = useState(false);

  const close = () => {
    setOpen(false);
    setMarkAllExpanded(false);
    setDownloadExpanded(false);
    setMarkSelectedExpanded(false);
    setSelectExpanded(false);
  };

  const run = (action: () => void) => {
    void Haptics.selectionAsync();
    close();
    action();
  };

  const refreshItem: MenuItem = {
    key: "refresh",
    label: t("manga_refresh"),
    sfSymbol: "arrow.clockwise",
    fallbackIcon: "refresh-outline",
    onPress: onRefresh,
  };

  const normalModeItems: MenuItem[] = [
    ...(canDownload
      ? [
          {
            key: "download",
            label: t("manga_download_chapters"),
            sfSymbol: "arrow.down.circle",
            fallbackIcon: "download-outline" as const,
            onPress: () => setDownloadExpanded((value) => !value),
          },
        ]
      : []),
    ...(hasDownloads
      ? [
          {
            key: "remove-downloads",
            label: t("manga_remove_downloads"),
            sfSymbol: "trash",
            fallbackIcon: "trash-outline" as const,
            destructive: true,
            onPress: onRemoveDownloads,
          },
        ]
      : []),
    {
      key: "select",
      label: t("manga_select_chapters"),
      sfSymbol: "checklist",
      fallbackIcon: "list-outline",
      onPress: onSelectChapters,
    },
  ];

  const shareItem: MenuItem | null = canShare
    ? {
        key: "share",
        label: t("manga_share"),
        sfSymbol: "square.and.arrow.up",
        fallbackIcon: "share-outline",
        onPress: onShare,
      }
    : null;

  const browserItem: MenuItem | null = canShare
    ? {
        key: "browser",
        label: t("manga_open_in_browser"),
        sfSymbol: "safari",
        fallbackIcon: "globe-outline",
        onPress: onOpenInBrowser,
      }
    : null;

  const menu = !open ? null : (
    <Pressable style={styles.backdrop} onPress={close}>
      <View style={styles.menuAnchor}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <GlassSurface
            borderRadius={radius.md}
            style={styles.menuCard}
            glassStyle="regular"
          >
            {!chapterSelectMode ? (
              <>
                <MenuRow
                  item={refreshItem}
                  showDivider={false}
                  onPress={() => run(refreshItem.onPress)}
                />
                {shareItem ? (
                  <MenuRow
                    item={shareItem}
                    showDivider
                    onPress={() => run(shareItem.onPress)}
                  />
                ) : null}
                {browserItem ? (
                  <MenuRow
                    item={browserItem}
                    showDivider
                    onPress={() => run(browserItem.onPress)}
                  />
                ) : null}
                <MenuRow
                  item={{
                    key: "mark-all",
                    label: t("manga_mark_all"),
                    sfSymbol: "checkmark.rectangle.stack",
                    fallbackIcon: "checkmark-done-outline",
                    onPress: () => setMarkAllExpanded((value) => !value),
                  }}
                  showDivider
                  trailingSymbol={
                    markAllExpanded ? "chevron.up" : "chevron.down"
                  }
                  onPress={() => setMarkAllExpanded((value) => !value)}
                />
                {markAllExpanded ? (
                  <>
                    <MenuRow
                      item={{
                        key: "mark-all-read",
                        label: t("manga_read"),
                        sfSymbol: "checkmark.circle",
                        fallbackIcon: "checkmark-circle-outline",
                        onPress: onMarkAllRead,
                      }}
                      showDivider
                      onPress={() => run(onMarkAllRead)}
                    />
                    <MenuRow
                      item={{
                        key: "mark-all-unread",
                        label: t("manga_unread"),
                        sfSymbol: "circle",
                        fallbackIcon: "ellipse-outline",
                        onPress: onMarkAllUnread,
                      }}
                      showDivider
                      onPress={() => run(onMarkAllUnread)}
                    />
                  </>
                ) : null}
                {normalModeItems.map((item) =>
                  item.key === "download" ? (
                    <Fragment key={item.key}>
                      <MenuRow
                        item={item}
                        showDivider
                        trailingSymbol={
                          downloadExpanded ? "chevron.up" : "chevron.down"
                        }
                        onPress={item.onPress}
                      />
                      {downloadExpanded ? (
                        <>
                          <MenuRow
                            item={{
                              key: "download-all-chapters",
                              label: t("manga_download_all_chapters"),
                              sfSymbol: "square.stack",
                              fallbackIcon: "download-outline",
                              onPress: onDownloadAll,
                            }}
                            showDivider
                            onPress={() => run(onDownloadAll)}
                          />
                          <MenuRow
                            item={{
                              key: "download-unread-chapters",
                              label: t("manga_download_unread_chapters"),
                              sfSymbol: "circle",
                              fallbackIcon: "ellipse-outline",
                              onPress: onDownloadUnread,
                            }}
                            showDivider
                            onPress={() => run(onDownloadUnread)}
                          />
                        </>
                      ) : null}
                    </Fragment>
                  ) : (
                    <MenuRow
                      key={item.key}
                      item={item}
                      showDivider
                      onPress={() => run(item.onPress)}
                    />
                  ),
                )}
              </>
            ) : (
              <>
                <MenuRow
                  item={{
                    key: "mark-selected",
                    label: t("manga_mark_selected"),
                    sfSymbol: "checkmark.rectangle.stack",
                    fallbackIcon: "checkmark-done-outline",
                    onPress: () => setMarkSelectedExpanded((value) => !value),
                  }}
                  showDivider={false}
                  trailingSymbol={
                    markSelectedExpanded ? "chevron.up" : "chevron.down"
                  }
                  onPress={() => setMarkSelectedExpanded((value) => !value)}
                />
                {markSelectedExpanded ? (
                  <>
                    <MenuRow
                      item={{
                        key: "read",
                        label: t("manga_read"),
                        sfSymbol: "checkmark.circle",
                        fallbackIcon: "checkmark-circle-outline",
                        onPress: onMarkSelectedRead,
                      }}
                      showDivider
                      onPress={() => run(onMarkSelectedRead)}
                    />
                    <MenuRow
                      item={{
                        key: "unread",
                        label: t("manga_unread"),
                        sfSymbol: "circle",
                        fallbackIcon: "ellipse-outline",
                        onPress: onMarkSelectedUnread,
                      }}
                      showDivider
                      onPress={() => run(onMarkSelectedUnread)}
                    />
                  </>
                ) : null}
                <MenuRow
                  item={{
                    key: "select-group",
                    label: t("manga_selection"),
                    sfSymbol: "checklist",
                    fallbackIcon: "list-outline",
                    onPress: () => setSelectExpanded((value) => !value),
                  }}
                  showDivider
                  trailingSymbol={
                    selectExpanded ? "chevron.up" : "chevron.down"
                  }
                  onPress={() => setSelectExpanded((value) => !value)}
                />
                {selectExpanded ? (
                  <>
                    <MenuRow
                      item={{
                        key: "select-all",
                        label: t("manga_select_all"),
                        sfSymbol: "checkmark.circle.fill",
                        fallbackIcon: "checkbox-outline",
                        onPress: onSelectAll,
                      }}
                      showDivider
                      onPress={() => run(onSelectAll)}
                    />
                    <MenuRow
                      item={{
                        key: "deselect-all",
                        label: t("manga_deselect_all"),
                        sfSymbol: "circle",
                        fallbackIcon: "square-outline",
                        onPress: onDeselectAll,
                      }}
                      showDivider
                      onPress={() => run(onDeselectAll)}
                    />
                  </>
                ) : null}
                {canDownload ? (
                  <MenuRow
                    item={{
                      key: "download-selected",
                      label: t("manga_download_selected"),
                      sfSymbol: "arrow.down.circle",
                      fallbackIcon: "download-outline",
                      onPress: onDownloadSelected,
                    }}
                    showDivider
                    onPress={() => run(onDownloadSelected)}
                  />
                ) : null}
              </>
            )}
          </GlassSurface>
        </Pressable>
      </View>
    </Pressable>
  );

  return (
    <>
      <HeaderIconButton
        icon="ellipsis-horizontal"
        accessibilityLabel={t("manga")}
        onPress={() => {
          void Haptics.selectionAsync();
          setOpen((value) => !value);
          setMarkAllExpanded(false);
          setMarkSelectedExpanded(false);
          setSelectExpanded(false);
        }}
      />
      {open ? (
        Platform.OS === "ios" ? (
          <FullWindowOverlay>
            <View style={styles.overlayRoot} collapsable={false}>
              {menu}
            </View>
          </FullWindowOverlay>
        ) : (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={close}
          >
            {menu}
          </Modal>
        )
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  nativeHost: {
    width: 28,
    height: 28,
  },
  overlayRoot: {
    ...StyleSheet.absoluteFill,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  menuAnchor: {
    position: "absolute",
    top: 96,
    right: Spacing.lg,
    minWidth: 240,
    maxWidth: 320,
  },
  menuCard: {
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  menuLabel: {
    flex: 1,
  },
});

function MangaOverflowMenuNative(props: MangaOverflowMenuProps) {
  const { colors, isDark } = useTheme();
  const {
    chapterSelectMode,
    hasDownloads,
    canShare,
    canDownload,
    onShare,
    onOpenInBrowser,
    onSelectChapters,
    onMarkAllRead,
    onMarkAllUnread,
    onMarkSelectedRead,
    onMarkSelectedUnread,
    onSelectAll,
    onDeselectAll,
    onRefresh,
    onDownloadAll,
    onDownloadUnread,
    onDownloadSelected,
    onRemoveDownloads,
  } = props;

  return (
    <Host
      matchContents
      seedColor={colors.tint}
      colorScheme={isDark ? "dark" : "light"}
      style={styles.nativeHost}
    >
      <Menu
        label={
          <RNHostView matchContents>
            <HeaderIconButton
              icon="ellipsis-horizontal"
              accessibilityLabel={t("manga")}
            />
          </RNHostView>
        }
        modifiers={[
          menuStyle("button"),
          buttonStyle("plain"),
          menuIndicator("hidden"),
        ]}
      >
        {!chapterSelectMode ? (
          <>
            <Button
              label={t("manga_refresh")}
              systemImage="arrow.clockwise"
              onPress={onRefresh}
            />
            {canShare ? (
              <Button
                label={t("manga_share")}
                systemImage="square.and.arrow.up"
                onPress={onShare}
              />
            ) : null}
            {canShare ? (
              <Button
                label={t("manga_open_in_browser")}
                systemImage="safari"
                onPress={onOpenInBrowser}
              />
            ) : null}
            <Menu
              label={t("manga_mark_all")}
              systemImage="checkmark.rectangle.stack"
            >
              <Button
                label={t("manga_read")}
                systemImage="checkmark.circle"
                onPress={onMarkAllRead}
              />
              <Button
                label={t("manga_unread")}
                systemImage="circle"
                onPress={onMarkAllUnread}
              />
            </Menu>
            {canDownload ? (
              <Menu
                label={t("manga_download_chapters")}
                systemImage="arrow.down.circle"
              >
                <Button
                  label={t("manga_download_all_chapters")}
                  systemImage="square.stack"
                  onPress={onDownloadAll}
                />
                <Button
                  label={t("manga_download_unread_chapters")}
                  systemImage="circle"
                  onPress={onDownloadUnread}
                />
              </Menu>
            ) : null}
            {hasDownloads ? (
              <Button
                label={t("manga_remove_downloads")}
                systemImage="trash"
                role="destructive"
                onPress={onRemoveDownloads}
              />
            ) : null}
            <Button
              label={t("manga_select_chapters")}
              systemImage="checklist"
              onPress={onSelectChapters}
            />
          </>
        ) : (
          <>
            <Menu
              label={t("manga_mark_selected")}
              systemImage="checkmark.rectangle.stack"
            >
              <Button
                label={t("manga_read")}
                systemImage="checkmark.circle"
                onPress={onMarkSelectedRead}
              />
              <Button
                label={t("manga_unread")}
                systemImage="circle"
                onPress={onMarkSelectedUnread}
              />
            </Menu>
            <Menu label={t("manga_selection")} systemImage="checklist">
              <Button
                label={t("manga_select_all")}
                systemImage="checkmark.circle.fill"
                onPress={onSelectAll}
              />
              <Button
                label={t("manga_deselect_all")}
                systemImage="circle"
                onPress={onDeselectAll}
              />
            </Menu>
            {canDownload ? (
              <Button
                label={t("manga_download_selected")}
                systemImage="arrow.down.circle"
                onPress={onDownloadSelected}
              />
            ) : null}
          </>
        )}
      </Menu>
    </Host>
  );
}

export function MangaOverflowMenu(props: MangaOverflowMenuProps) {
  if (Platform.OS === "ios") return <MangaOverflowMenuNative {...props} />;
  return <MangaOverflowMenuFallback {...props} />;
}
