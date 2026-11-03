import { Stack } from "expo-router";

import {
  MangaRefreshStatus,
  type RefreshStatusState,
} from "@/components/manga/manga-refresh-status";
import { t } from "@/constants/locales";
import { useTheme } from "@/hooks/use-theme";

type MangaDetailToolbarProps = {
  /** Only the back button (error states). */
  leftOnly?: boolean;
  chapterSelectMode: boolean;
  hasDownloads: boolean;
  canShare: boolean;
  canDownload: boolean;
  /** Refresh spinner / result icon shown next to the menu. */
  refreshStatus?: RefreshStatusState;
  onBack: () => void;
  onCancelSelect: () => void;
  onApplySelect: () => void;
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

/**
 * iOS-only native header items for the manga page. Native toolbar items (unlike custom
 * headerLeft/headerRight views) are moved into the iPhone Duo's vertical rail by the system.
 */
export function MangaDetailToolbar(props: MangaDetailToolbarProps) {
  const { colors } = useTheme();
  const { chapterSelectMode, canShare, canDownload, hasDownloads } = props;

  return (
    <>
      <Stack.Toolbar placement="left">
        {chapterSelectMode ? (
          <Stack.Toolbar.Button tintColor={colors.label} onPress={props.onCancelSelect}>
            {t("cancel")}
          </Stack.Toolbar.Button>
        ) : (
          <Stack.Toolbar.Button
            icon="chevron.left"
            accessibilityLabel={t("back")}
            tintColor={colors.label}
            onPress={props.onBack}
          />
        )}
      </Stack.Toolbar>
      {props.leftOnly ? null : (
        <Stack.Toolbar placement="right">
          {chapterSelectMode ? (
            <Stack.Toolbar.Button
              icon="checkmark"
              accessibilityLabel={t("done")}
              separateBackground
              tintColor={colors.label}
              onPress={props.onApplySelect}
            />
          ) : null}
          {props.refreshStatus?.visible && !chapterSelectMode ? (
            <Stack.Toolbar.View separateBackground>
              <MangaRefreshStatus status={props.refreshStatus} />
            </Stack.Toolbar.View>
          ) : null}
          <Stack.Toolbar.Menu
            icon="ellipsis"
            accessibilityLabel={t("manga")}
            tintColor={colors.label}
          >
            {!chapterSelectMode ? (
              <Stack.Toolbar.MenuAction
                icon="arrow.clockwise"
                onPress={props.onRefresh}
              >
                {t("manga_refresh")}
              </Stack.Toolbar.MenuAction>
            ) : null}
            {!chapterSelectMode && canShare ? (
              <Stack.Toolbar.MenuAction
                icon="square.and.arrow.up"
                onPress={props.onShare}
              >
                {t("manga_share")}
              </Stack.Toolbar.MenuAction>
            ) : null}
            {!chapterSelectMode && canShare ? (
              <Stack.Toolbar.MenuAction
                icon="safari"
                onPress={props.onOpenInBrowser}
              >
                {t("manga_open_in_browser")}
              </Stack.Toolbar.MenuAction>
            ) : null}
            {!chapterSelectMode ? (
              <Stack.Toolbar.Menu
                icon="checkmark.rectangle.stack"
                title={t("manga_mark_all")}
              >
                <Stack.Toolbar.MenuAction
                  icon="checkmark.circle"
                  onPress={props.onMarkAllRead}
                >
                  {t("manga_read")}
                </Stack.Toolbar.MenuAction>
                <Stack.Toolbar.MenuAction
                  icon="circle"
                  onPress={props.onMarkAllUnread}
                >
                  {t("manga_unread")}
                </Stack.Toolbar.MenuAction>
              </Stack.Toolbar.Menu>
            ) : null}
            {!chapterSelectMode && canDownload ? (
              <Stack.Toolbar.Menu
                icon="arrow.down.circle"
                title={t("manga_download_chapters")}
              >
                <Stack.Toolbar.MenuAction
                  icon="square.stack"
                  onPress={props.onDownloadAll}
                >
                  {t("manga_download_all_chapters")}
                </Stack.Toolbar.MenuAction>
                <Stack.Toolbar.MenuAction
                  icon="circle"
                  onPress={props.onDownloadUnread}
                >
                  {t("manga_download_unread_chapters")}
                </Stack.Toolbar.MenuAction>
              </Stack.Toolbar.Menu>
            ) : null}
            {!chapterSelectMode && hasDownloads ? (
              <Stack.Toolbar.MenuAction
                icon="trash"
                destructive
                onPress={props.onRemoveDownloads}
              >
                {t("manga_remove_downloads")}
              </Stack.Toolbar.MenuAction>
            ) : null}
            {!chapterSelectMode ? (
              <Stack.Toolbar.MenuAction
                icon="checklist"
                onPress={props.onSelectChapters}
              >
                {t("manga_select_chapters")}
              </Stack.Toolbar.MenuAction>
            ) : null}
            {chapterSelectMode ? (
              <Stack.Toolbar.Menu
                icon="checkmark.rectangle.stack"
                title={t("manga_mark_selected")}
              >
                <Stack.Toolbar.MenuAction
                  icon="checkmark.circle"
                  onPress={props.onMarkSelectedRead}
                >
                  {t("manga_read")}
                </Stack.Toolbar.MenuAction>
                <Stack.Toolbar.MenuAction
                  icon="circle"
                  onPress={props.onMarkSelectedUnread}
                >
                  {t("manga_unread")}
                </Stack.Toolbar.MenuAction>
              </Stack.Toolbar.Menu>
            ) : null}
            {chapterSelectMode ? (
              <Stack.Toolbar.Menu icon="checklist" title={t("manga_selection")}>
                <Stack.Toolbar.MenuAction
                  icon="checkmark.circle.fill"
                  onPress={props.onSelectAll}
                >
                  {t("manga_select_all")}
                </Stack.Toolbar.MenuAction>
                <Stack.Toolbar.MenuAction
                  icon="circle"
                  onPress={props.onDeselectAll}
                >
                  {t("manga_deselect_all")}
                </Stack.Toolbar.MenuAction>
              </Stack.Toolbar.Menu>
            ) : null}
            {chapterSelectMode && canDownload ? (
              <Stack.Toolbar.MenuAction
                icon="arrow.down.circle"
                onPress={props.onDownloadSelected}
              >
                {t("manga_download_selected")}
              </Stack.Toolbar.MenuAction>
            ) : null}
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      )}
    </>
  );
}
