import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { useTheme } from "@/hooks/use-theme";

type TextPromptModalProps = {
  visible: boolean;
  title: string;
  message?: string;
  initialValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

/** Material text-field dialog; replaces iOS-only Alert.prompt (used on Android). */
export function TextPromptModal({
  visible,
  title,
  message,
  initialValue = "",
  onSubmit,
  onCancel,
}: TextPromptModalProps) {
  const { colors } = useTheme();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={[styles.dialog, { backgroundColor: colors.tertiarySystemBackground }]}>
          <ThemedText variant="title3" style={styles.title}>
            {title}
          </ThemedText>
          {message ? (
            <ThemedText variant="footnote" color="secondaryLabel">
              {message}
            </ThemedText>
          ) : null}
          <TextInput
 clearButtonMode="while-editing"
            value={value}
            onChangeText={setValue}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            selectionColor={colors.tint}
            placeholderTextColor={colors.tertiaryLabel}
            style={[styles.input, { color: colors.label, borderColor: colors.tint }]}
          />
          <View style={styles.actions}>
            <Pressable style={styles.button} android_ripple={{ color: colors.quaternaryFill }} onPress={onCancel}>
              <ThemedText variant="callout" style={{ color: colors.tint }}>
                {t("cancel")}
              </ThemedText>
            </Pressable>
            <Pressable style={styles.button} android_ripple={{ color: colors.quaternaryFill }} onPress={submit}>
              <ThemedText variant="callout" style={[styles.ok, { color: colors.tint }]}>
                OK
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", paddingHorizontal: 24 },
  dialog: { borderRadius: 0, padding: 24, gap: 12 },
  title: { fontWeight: "600" },
  input: { borderBottomWidth: 2, fontSize: 17, paddingVertical: 8, paddingHorizontal: 4 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, overflow: "hidden" },
  ok: { fontWeight: "600" },
});
