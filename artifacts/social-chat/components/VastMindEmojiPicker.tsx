import React from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { VASTMIND_EMOJIS } from "./vastmind-emoji-data";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (token: string) => void;
};

/** Compact, offline-ready sticker grid shared by mobile chat conversations. */
export function VastMindEmojiPicker({ visible, onClose, onSelect }: Props) {
  const colors = useColors();
  if (!visible) return null;

  return (
    <View style={{ marginBottom: 8, maxHeight: 256, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.card }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 13 }}>VastMind originals</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, marginTop: 2 }}>35 stickers · tap to send</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close VastMind emoji pack" onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 19, lineHeight: 20 }}>×</Text>
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 6, paddingHorizontal: 10, paddingBottom: 10 }}>
        {VASTMIND_EMOJIS.map((emoji) => (
          <Pressable key={emoji.token} accessibilityRole="button" accessibilityLabel={`Send ${emoji.label} sticker`} onPress={() => onSelect(emoji.token)}
            style={{ width: "18%", height: 62, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.background }}>
            <Image source={emoji.source} accessibilityLabel={emoji.label} resizeMode="contain" style={{ width: 40, height: 40 }} />
            <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 8, marginTop: 1 }}>{emoji.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
