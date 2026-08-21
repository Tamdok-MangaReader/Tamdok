import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';

type MangaBackgroundProps = {
  source: {
    isAnimated?: true | undefined;
    headers?: Record<string, string> | undefined;
    uri: string;
  };
};

export function MangaBackground({ source }: MangaBackgroundProps) {
  return (
    <>
      <View style={styles.root}>
        <Image source={source} style={styles.image} contentFit='cover' recyclingKey={`background-${source.uri}`} transition={200} />
      </View>
      <BlurView intensity={40} style={styles.blur} />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    display: 'flex',
    position: 'absolute',
    top: -140,
    left: -20,
    zIndex: -3,
    width: '120%',
    height: 350,
  },
  blur: {
    display: 'flex',
    position: 'absolute',
    top: -140,
    left: -20,
    zIndex: -2,
    width: '120%',
    height: 400,
  },
  image: {
    display: 'flex',
    height: '100%',
    backgroundColor: 'red',
  },
});
