import { useVerticalBarEdgeIOS } from "expo-status-bar";
import {
  createContext,
  useContext,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Modal as RNModal,
  Platform,
  View,
  type ModalProps,
  useWindowDimensions as useRNWindowDimensions,
  type ScaledSize,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";

/**
 * iPhone Duo support.
 *
 * Folded:   iOS draws a vertical control rail (~84pt) on one side and exposes it as a
 *           left/right safe-area inset. `useVerticalBarEdgeIOS()` is non-null only then.
 * Unfolded: the window is wide and portrait (regular width).
 *
 * Everything here is a no-op on a regular iPhone (rail = 0, not "open"), so the
 * existing layouts are untouched there.
 */

type Rail = { left: number; right: number };
const NO_RAIL: Rail = { left: 0, right: 0 };

const RailContext = createContext<Rail>(NO_RAIL);

/** Reference phone width the grid/cover sizes were designed for. */
const REFERENCE_WIDTH = 393;
/**
 * Unfolded Duo: both window sides are at least this long. The largest regular iPhone is
 * 440 x 956 in portrait and 956 x 440 in landscape, so its short side never reaches it.
 */
const OPEN_MIN_SHORT_SIDE = 500;
/** Webtoon column width on the unfolded Duo: an iPhone Pro Max screen. */
export const OPEN_READER_MAX_WIDTH = 440;

/**
 * Wraps the content of a navigation screen. In folded mode it keeps the content clear of
 * the rail by padding the (system-provided) safe-area edge. Rendered for every screen so the
 * tree shape never changes when the device is folded/unfolded (keeps state and scroll).
 */
/** Rail reserved by the system right now (zero unless the folded Duo draws its vertical bar). */
export function useSystemRail(): Rail {
  const edge = Platform.OS === "ios" ? useVerticalBarEdgeIOS() : null;
  const insets = useSafeAreaInsets();
  // The unfolded display has no rail; ignore any stale inset while the window is wide.
  const open = useIsOpenDuo();
  return useMemo<Rail>(
    () => (edge && !open ? { left: insets.left, right: insets.right } : NO_RAIL),
    [edge, open, insets.left, insets.right],
  );
}

export function DuoScreenLayout({
  children,
  background,
}: {
  children: ReactNode;
  background?: string;
}) {
  const rail = useSystemRail();
  const { colors } = useTheme();
  const folded = rail.left > 0 || rail.right > 0;

  return (
    <RailContext.Provider value={rail}>
      <View
        style={
          folded
            ? {
                flex: 1,
                paddingLeft: rail.left,
                paddingRight: rail.right,
                backgroundColor: background ?? colors.systemBackground,
              }
            : { flex: 1 }
        }
      >
        {children}
      </View>
    </RailContext.Provider>
  );
}

export function duoScreenLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <DuoScreenLayout>{children}</DuoScreenLayout>;
}

/** Reader variant: black strip next to the rail. */
export function duoReaderScreenLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <DuoScreenLayout background="#000">{children}</DuoScreenLayout>;
}

/** Space the system reserved for its controls inside the current screen. */
export function useRailInsets(): Rail {
  return useContext(RailContext);
}

/**
 * Drop-in replacement for react-native's `useWindowDimensions`: identical on a regular
 * iPhone, but the width excludes the folded Duo's control rail.
 */
export function useWindowDimensions(): ScaledSize {
  const dims = useRNWindowDimensions();
  const rail = useContext(RailContext);
  return useMemo(() => {
    const reserved = rail.left + rail.right;
    return reserved > 0 ? { ...dims, width: dims.width - reserved } : dims;
  }, [dims, rail.left, rail.right]);
}

/** True on the unfolded Duo display (wide portrait window). Never true on a regular iPhone. */
export function useIsOpenDuo(): boolean {
  const { width, height } = useRNWindowDimensions();
  return Platform.OS === "ios" && Math.min(width, height) >= OPEN_MIN_SHORT_SIDE;
}

/**
 * Keeps covers at the same physical size on the wide display by adding columns
 * instead of stretching them. Returns `columns` unchanged everywhere else.
 */
export function useAdaptiveColumns(columns: number): number {
  const { width } = useWindowDimensions();
  const open = useIsOpenDuo();
  return open
    ? Math.max(columns, Math.round((columns * width) / REFERENCE_WIDTH))
    : columns;
}

/** Cover width for a grid of `columns` (adaptive on the unfolded Duo), inside `padding` on both sides. */
export function useGridItemWidth(
  columns: number,
  gap: number,
  padding: number,
): number {
  const { width } = useWindowDimensions();
  const cols = useAdaptiveColumns(columns);
  return Math.floor((width - padding * 2 - gap * (cols - 1)) / cols);
}

/** Full-width carousel card; kept at a phone-like width on the unfolded Duo. */
export function useFeaturedCardWidth(padding: number): number {
  const { width } = useWindowDimensions();
  const open = useIsOpenDuo();
  const full = width - padding * 2;
  return open ? Math.min(full, REFERENCE_WIDTH - padding * 2) : full;
}

/**
 * Centers its children in a narrower reading column on the unfolded Duo (webtoon strips are
 * unreadable at full width). Descendants see the reduced width through `useWindowDimensions`.
 * On any other device the padding is zero, so the layout is identical.
 */
export function ReadingColumn({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const open = useIsOpenDuo();
  const outer = useContext(RailContext);
  const side = open ? Math.max(0, Math.floor((width - OPEN_READER_MAX_WIDTH) / 2)) : 0;
  const rail = useMemo<Rail>(
    () => (side > 0 ? { left: outer.left + side, right: outer.right + side } : outer),
    [side, outer],
  );
  return (
    <RailContext.Provider value={rail}>
      <View style={{ flex: 1, paddingHorizontal: side }}>{children}</View>
    </RailContext.Provider>
  );
}

/** Horizontal scroller cover width; smaller on the unfolded Duo where 180pt looks oversized. */
export function useScrollerCoverWidth(base: number): number {
  return useIsOpenDuo() ? Math.round(base * 0.88) : base;
}

/**
 * Drop-in for react-native's Modal that keeps sheet content clear of the folded Duo's rail.
 * Native modals live in their own window, so the screen-level padding does not reach them.
 * Only for sheets/dialogs laid out from the window edges, not for menus placed by window coordinates.
 */
export function Modal({ children, ...props }: ModalProps) {
  const rail = useSystemRail();
  const { colors } = useTheme();
  const folded = rail.left > 0 || rail.right > 0;
  return (
    <RNModal {...props}>
      <RailContext.Provider value={rail}>
        <View
          style={
            folded
              ? {
                  flex: 1,
                  paddingLeft: rail.left,
                  paddingRight: rail.right,
                  backgroundColor: colors.systemBackground,
                }
              : { flex: 1 }
          }
        >
          {children}
        </View>
      </RailContext.Provider>
    </RNModal>
  );
}

/**
 * Lets a horizontal scroller run edge to edge through the Duo's rail inset: the ScrollView is
 * widened by the rail on both sides and the content gets the same extra padding, so the first
 * and last items still line up with the rest of the screen. Empty styles on a regular iPhone.
 */
export function useRailBleed(): {
  scrollStyle: { marginLeft: number; marginRight: number } | undefined;
  contentStyle: { paddingLeft?: number; paddingRight?: number } | undefined;
  leftPad: number;
  rightPad: number;
} {
  const rail = useContext(RailContext);
  return useMemo(
    () =>
      rail.left > 0 || rail.right > 0
        ? {
            scrollStyle: { marginLeft: -rail.left, marginRight: -rail.right },
            contentStyle: undefined,
            leftPad: rail.left,
            rightPad: rail.right,
          }
        : {
            scrollStyle: undefined,
            contentStyle: undefined,
            leftPad: 0,
            rightPad: 0,
          },
    [rail.left, rail.right],
  );
}
