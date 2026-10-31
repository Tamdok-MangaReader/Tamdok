import type { ReaderPage } from "@/utils/reader-pages";

export type ReaderQuickActionAnchor = {
  x: number;
  y: number;
};

type ReaderQuickActionsProps = {
  visible: boolean;
  page: ReaderPage | null;
  anchor: ReaderQuickActionAnchor | null;
  spreadPageIndex?: number;
  usesDoublePages?: boolean;
  isPageIsolated?: boolean;
  canSetSinglePage?: boolean;
  onClose: () => void;
  onReload: () => void;
  onToggleSinglePage?: (isolated: boolean) => void;
};

/** Android: the long-press page menu is disabled (it interfered with page turns and scrolling). */
export function ReaderQuickActions(_props: ReaderQuickActionsProps) {
  return null;
}
