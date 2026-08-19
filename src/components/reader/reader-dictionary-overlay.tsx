import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { isSupported as isTextExtractorSupported, extractTextFromImage } from 'expo-text-extractor';

import { ThemedText } from '@/components/ui/themed-text';
import type { DictionarySettings } from '@/services/app-settings';

type ReaderDictionaryOverlayProps = {
  imageUri: string;
  settings: DictionarySettings;
  enabled: boolean;
};

export function ReaderDictionaryOverlay({ imageUri, settings, enabled }: ReaderDictionaryOverlayProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!enabled || !settings.textOverlayMode || Platform.OS !== 'ios' || !isTextExtractorSupported) {
      setText('');
      return;
    }

    let cancelled = false;
    void extractTextFromImage(imageUri).then((lines) => {
      if (!cancelled) setText(lines.join('\n'));
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, imageUri, settings.restrictOCRLanguages, settings.restrictedOCRLanguages, settings.textOverlayMode]);

  if (!enabled || !settings.textOverlayMode || !text) return null;

  const fontSize = 14 * settings.overlayTextScaleMultiplier;
  const padding = settings.overlayPadding * 4;

  return (
    <View pointerEvents='none' style={[StyleSheet.absoluteFill, { padding }]}>
      <ThemedText
        variant='caption1'
        style={{
          color: 'rgba(255,255,255,0.82)',
          fontSize,
          lineHeight: fontSize * 1.35,
          textShadowColor: 'rgba(0,0,0,0.8)',
          textShadowRadius: 4,
        }}>
        {text}
      </ThemedText>
    </View>
  );
}
