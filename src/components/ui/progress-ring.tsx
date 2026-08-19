import { StyleSheet, View } from 'react-native';

type ProgressRingProps = {
  progress: number;
  size?: number;
  color: string;
  trackColor?: string;
};

export function ProgressRing({ progress, size = 18, color, trackColor = 'rgba(142,142,147,0.35)' }: ProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const stroke = Math.max(2, Math.round(size * 0.12));
  const segment = Math.ceil(clamped * 4);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View
        style={[
          styles.track,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: trackColor,
          },
        ]}
      />
      <View
        style={[
          styles.progress,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: color,
            borderTopColor: segment >= 1 ? color : 'transparent',
            borderRightColor: segment >= 2 ? color : 'transparent',
            borderBottomColor: segment >= 3 ? color : 'transparent',
            borderLeftColor: segment >= 4 ? color : 'transparent',
            transform: [{ rotate: '-90deg' }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
  },
  progress: {
    position: 'absolute',
  },
});
