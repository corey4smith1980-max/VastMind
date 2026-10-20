import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, type ImageSourcePropType, Pressable, ScrollView, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { VASTMIND_EMOJIS } from "./vastmind-emoji-data";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (token: string) => void;
  onSelectEmoji: (symbol: string) => void;
};

const FREE_EMOJI = [
  "😀","😃","😄","😁","😆","😅","😂","🤣","😊","🙂","😉","😍","🥰","😘","😋","😜",
  "🤗","🤭","🤫","🤔","🫡","😐","🙄","😮","🥹","🥺","😢","😭","😤","😎","🤓","🥳",
  "😴","🤯","🤖","👻","👋","✋","👌","✌️","🤞","🤟","👍","👎","👏","🙌","🫶","🙏",
  "💪","❤️","🧡","💛","💚","💙","💜","🖤","🤍","💕","💖","💔","✨","🔥","💯","✅",
  "🎉","🎊","🎁","🎂","🏆","🎯","🎮","🎵","☕","🍕","🍔","🍓","🐶","🐱","🦋","🌻",
  "🌈","☀️","🌙","⭐","🌍","🚀","✈️","🏠","📱","💡","💼","📦","🇳🇬","🇬🇧","🇺🇸","🇨🇦",
];

/** Native-driver motion keeps premium artwork small; reduced-motion preferences are respected. */
export function AnimatedVastMindEmoji({ source, token, label, size = 40 }: { source: ImageSourcePropType; token: string; label: string; size?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(false);
  const motion = (Number(token.match(/^vm_(\d+)_/)?.[1] ?? 1) - 1) % 5;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (active) setReducedMotion(value); })
      .catch(() => { if (active) setReducedMotion(true); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    progress.setValue(0);
    if (reducedMotion) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 700 + motion * 100, useNativeDriver: true, isInteraction: false }),
      Animated.timing(progress, { toValue: 0, duration: 700 + motion * 100, useNativeDriver: true, isInteraction: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [progress, reducedMotion, motion]);
  return <Animated.Image source={source} accessibilityLabel={label} resizeMode="contain" style={{
    width: size, height: size,
    transform: reducedMotion ? [] : [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: motion === 0 ? [0, -6] : motion === 3 ? [3, -3] : [0, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: motion === 1 || motion === 4 ? [0.95, 1.08] : [1, 1.02] }) },
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: motion === 2 ? ["-5deg", "5deg"] : motion === 4 ? ["-3deg", "4deg"] : ["0deg", "0deg"] }) },
    ],
  }} />;
}

/** Free Unicode stays static; VastMind's original pack has separate premium-preview access. */
export function VastMindEmojiPicker({ visible, onClose, onSelect, onSelectEmoji }: Props) {
  const colors = useColors();
  const [tab, setTab] = useState<"emoji" | "premium">("emoji");
  if (!visible) return null;

  return (
    <View style={{ marginBottom: 8, maxHeight: 256, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.card }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 13 }}>Emoji library</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, marginTop: 2 }}>{tab === "emoji" ? "Free Unicode · static · tap to insert" : "35 animated VastMind originals · tap to send"}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close VastMind emoji pack" onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 19, lineHeight: 20 }}>×</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", paddingHorizontal: 12, gap: 16, marginBottom: 8 }}>
        {(["emoji", "premium"] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)}>
          <Text style={{ color: tab === value ? colors.primary : colors.mutedForeground, fontWeight: "700", paddingVertical: 5 }}>{value === "emoji" ? "Free emoji" : "VastMind Premium"}</Text>
        </Pressable>)}
      </View>
      {tab === "premium" && <Text style={{ color: colors.mutedForeground, fontSize: 10, paddingHorizontal: 12, marginBottom: 8 }}>Preview unlocked while billing is prepared. No purchase or payment is active.</Text>}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 6, paddingHorizontal: 10, paddingBottom: 10 }}>
        {tab === "emoji" ? FREE_EMOJI.map(symbol => <Pressable key={symbol} accessibilityRole="button" accessibilityLabel={`Insert ${symbol}`} onPress={() => onSelectEmoji(symbol)}
          style={{ width: "13%", height: 40, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 27 }}>{symbol}</Text></Pressable>) : VASTMIND_EMOJIS.map((emoji) => (
          <Pressable key={emoji.token} accessibilityRole="button" accessibilityLabel={`Send ${emoji.label} sticker`} onPress={() => onSelect(emoji.token)}
            style={{ width: "18%", height: 62, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.background }}>
            <AnimatedVastMindEmoji source={emoji.source} token={emoji.token} label={emoji.label} />
            <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 8, marginTop: 1 }}>{emoji.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
