import { StyleSheet, View } from "react-native";

type CircularProgressProps = {
  size: number;
  thickness: number;
  progress: number;
  color: string;
  trackColor: string;
};

export function CircularProgress({
  size,
  thickness,
  progress,
  color,
  trackColor,
}: CircularProgressProps) {
  const value = Math.min(1, Math.max(0, progress));
  const half = size / 2;
  const rightRotation = -135 + 360 * Math.min(value, 0.5);
  const leftRotation = -135 + 360 * Math.max(value - 0.5, 0);
  const ring = {
    width: size,
    height: size,
    borderRadius: half,
    borderWidth: thickness,
    borderColor: "transparent",
  } as const;

  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.fill, ring, { borderColor: trackColor }]} />
      <View style={[styles.half, { left: half, width: half, height: size }]}>
        <View
          style={[
            styles.fill,
            ring,
            {
              left: -half,
              borderTopColor: color,
              borderRightColor: color,
              transform: [{ rotate: `${rightRotation}deg` }],
            },
          ]}
        />
      </View>
      <View style={[styles.half, { left: 0, width: half, height: size }]}>
        <View
          style={[
            styles.fill,
            ring,
            {
              left: 0,
              borderBottomColor: color,
              borderLeftColor: color,
              transform: [{ rotate: `${leftRotation}deg` }],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  half: {
    position: "absolute",
    top: 0,
    overflow: "hidden",
  },
});
