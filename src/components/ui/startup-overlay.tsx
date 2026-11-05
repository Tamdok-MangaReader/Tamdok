import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";

import { AppSplash } from "@/components/ui/app-splash";
import { isStartupReady, subscribeStartupReady } from "@/utils/startup-gate";

const MAX_WAIT_MS = 3500;
const FADE_MS = 220;

/** Keeps the splash over the already mounted navigator until the first screen reports ready (or a timeout). */
export function StartupOverlay() {
  const [visible, setVisible] = useState(!isStartupReady());
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(() => setVisible(false));
    };
    // Two frames so the grid has actually been drawn under the overlay.
    const unsubscribe = subscribeStartupReady(() => {
      requestAnimationFrame(() => requestAnimationFrame(finish));
    });
    if (isStartupReady()) finish();
    const timer = setTimeout(finish, MAX_WAIT_MS);
    return () => {
      done = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [opacity, visible]);

  if (!visible) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      <AppSplash />
    </Animated.View>
  );
}
