import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { getAppIconOption } from '@/constants/app-icons';
import { useAppearance } from '@/context/appearance-context';

export function AppIcon() {
  const { appIconId } = useAppearance();
  const preview = getAppIconOption(appIconId).preview;

  return (
    <View style={styles.container}>
      <Image style={styles.image} source={preview} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 18,
  },
});
