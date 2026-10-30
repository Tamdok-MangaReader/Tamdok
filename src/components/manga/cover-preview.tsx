import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { memo, useCallback } from "react";
import {
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";

import { Spacing } from "@/constants/theme";
import { IMAGE_CACHE_POLICY } from "@/utils/image-memory";

type CoverSource = {
  uri: string;
  headers?: Record<string, string>;
};

type CoverPreviewProps = {
  visible: boolean;
  source: CoverSource | undefined;
  onClose: () => void;
};

export const CoverPreview = memo(function CoverPreview({
  visible,
  source,
  onClose,
}: CoverPreviewProps) {
  const { width, height } = useWindowDimensions();
  const maxWidth = width - Spacing.lg * 2;
  const maxHeight = height * 0.82;
  const frameWidth = Math.min(maxWidth, maxHeight * (2 / 3));

  const handleClose = useCallback(() => {
    onClose();
    void Haptics.selectionAsync();
  }, [onClose]);

  if (!source) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      <Animated.View
        entering={FadeIn.duration(180)}
        style={styles.backdrop}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPressIn={handleClose}
          accessibilityRole="button"
        />
        <Animated.View
          entering={ZoomIn.springify().damping(18).stiffness(180)}
          pointerEvents="none"
          style={[styles.frame, { width: frameWidth, height: maxHeight }]}
        >
          <Image
            source={source}
            style={styles.image}
            contentFit="contain"
            cachePolicy={IMAGE_CACHE_POLICY}
            recyclingKey={`preview-${source.uri}`}
          />
        </Animated.View>
        <View pointerEvents="none" />
      </Animated.View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  frame: {
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  image: {
    flex: 1,
    borderRadius: 12,
  },
});
