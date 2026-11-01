import { requireNativeView, requireOptionalNativeModule } from "expo";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
  Children,
  createElement,
  type ReactNode,
} from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type NativeProps = {
  style?: StyleProp<ViewStyle>;
  targetIndex: number;
  animated: boolean;
  commandNonce: number;
  rtl: boolean;
  scrollEnabled: boolean;
  pageBackgroundColor: string;
  onPageSelected: (event: { nativeEvent: { position: number } }) => void;
  children?: ReactNode;
};

// iOS only; null when the native module is not part of the build (the reader then falls back to PagerView).
const NativeView: React.ComponentType<NativeProps> | null =
  Platform.OS === "ios" && requireOptionalNativeModule("TamdokPageCurl")
    ? requireNativeView<NativeProps>("TamdokPageCurl")
    : null;

export const pageCurlAvailable = NativeView != null;

export type PageCurlPagerHandle = {
  setPage: (position: number) => void;
  setPageWithoutAnimation: (position: number) => void;
};

type PageCurlPagerProps = {
  style?: StyleProp<ViewStyle>;
  initialPage: number;
  rtl: boolean;
  /** false pauses page turning (e.g. while a page is zoomed). */
  scrollEnabled?: boolean;
  backgroundColor: string;
  onPageSelected: (event: { nativeEvent: { position: number } }) => void;
  children?: ReactNode;
};

/** Page-curl pager. Each child is one page; same imperative API as react-native-pager-view. */
export const PageCurlPager = forwardRef<PageCurlPagerHandle, PageCurlPagerProps>(
  function PageCurlPager(
    { style, initialPage, rtl, scrollEnabled = true, backgroundColor, onPageSelected, children },
    ref,
  ) {
    const [command, setCommand] = useState({ index: initialPage, animated: false, nonce: 0 });

    const go = useCallback((index: number, animated: boolean) => {
      setCommand((previous) => ({ index, animated, nonce: previous.nonce + 1 }));
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        setPage: (position) => go(position, true),
        setPageWithoutAnimation: (position) => go(position, false),
      }),
      [go],
    );

    if (!NativeView) return null;
    return createElement(
      NativeView,
      {
        style,
        targetIndex: command.index,
        animated: command.animated,
        commandNonce: command.nonce,
        rtl,
        scrollEnabled,
        pageBackgroundColor: backgroundColor,
        onPageSelected,
      },
      // Every page must have the full pager size: without this Yoga would stack the children and give
      // each only a slice of the height.
      Children.map(children, (child) =>
        createElement(View, { style: StyleSheet.absoluteFill, collapsable: false }, child),
      ),
    );
  },
);
