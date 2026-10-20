import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';

export type Colors = ReturnType<typeof useColors>;
export type IconName = React.ComponentProps<typeof Feather>['name'];

/* ---------- money: currency-aware minor units ---------- */
export function digits(currency: string) {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2; }
  catch { return 2; }
}
export function money(minor: number, currency: string) {
  const d = digits(currency);
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: d, maximumFractionDigits: d }).format(minor / 10 ** d); }
  catch { return `${currency} ${(minor / 10 ** d).toFixed(d)}`; }
}
export function toMinor(value: string, currency: string) {
  const n = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10 ** digits(currency)) : NaN;
}
export function fromMinor(minor: number, currency: string) {
  const d = digits(currency);
  return (minor / 10 ** d).toFixed(d).replace(/\.0+$/, '');
}
export function validCurrency(code: string) {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try { new Intl.NumberFormat('en', { style: 'currency', currency: code }).format(0); return true; } catch { return false; }
}
export function errText(e: unknown) {
  if (e && typeof e === 'object') {
    const anyE = e as { data?: { error?: string; message?: string }; message?: string };
    if (anyE.data?.error) return anyE.data.error;
    if (anyE.data?.message) return anyE.data.message;
    if (anyE.message) return anyE.message;
  }
  return 'Something went wrong. Please try again.';
}
export function newKey() {
  return `vm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`;
}
export function shortDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function useInvalidateCommerce() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/commerce') });
}

/* ---------- primitives ---------- */
type BtnVariant = 'primary' | 'soft' | 'ghost' | 'danger' | 'ink';
export function Btn({ label, icon, onPress, variant = 'primary', disabled, busy, small, flex, a11y }: {
  label?: string; icon?: IconName; onPress: () => void; variant?: BtnVariant; disabled?: boolean; busy?: boolean; small?: boolean; flex?: boolean; a11y?: string;
}) {
  const c = useColors();
  const bg = { primary: c.primary, soft: c.secondary, ghost: 'transparent', danger: 'transparent', ink: c.forest }[variant];
  const fg = { primary: c.primaryForeground, soft: c.secondaryForeground, ghost: c.foreground, danger: c.destructive, ink: c.cream }[variant];
  const off = disabled || busy;
  return <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ disabled: !!off, busy: !!busy }} disabled={off} onPress={onPress}
    style={({ pressed }) => [s.btn, small && s.btnSmall, flex && { flex: 1 }, { backgroundColor: bg, opacity: off ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
      (variant === 'ghost' || variant === 'danger') && { borderWidth: 1, borderColor: variant === 'danger' ? c.destructive : c.border }]}>
    {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Feather name={icon} size={small ? 14 : 16} color={fg} /> : null}
    {label ? <Text style={[s.btnText, small && { fontSize: 12 }, { color: fg }]} numberOfLines={1}>{label}</Text> : null}
  </Pressable>;
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  const c = useColors();
  return <Pressable accessibilityRole={onPress ? 'button' : 'text'} accessibilityState={{ selected: !!active }} disabled={!onPress} onPress={onPress}
    style={({ pressed }) => [s.chip, { backgroundColor: active ? c.forest : c.card, borderColor: active ? c.forest : c.border, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
    {icon ? <Feather name={icon} size={12} color={active ? c.lime : c.mutedForeground} /> : null}
    <Text style={{ color: active ? c.cream : c.foreground, fontSize: 12, fontWeight: '700' }}>{label}</Text>
  </Pressable>;
}

export function Tag({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'cyan' | 'violet' | 'magenta' | 'danger' | 'blue' }) {
  const c = useColors();
  const color = { muted: c.mutedForeground, cyan: c.lime, violet: c.gold, magenta: c.coral, danger: c.destructive, blue: c.blue }[tone];
  return <View style={[s.tag, { borderColor: color }]}><Text style={{ color, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text></View>;
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = useColors();
  return <View style={{ marginBottom: 12, flex: (props.style as { flex?: number } | undefined)?.flex }}>
    <Text style={[s.label, { color: c.mutedForeground }]}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={c.mutedForeground} {...props}
      style={[s.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background }, props.multiline && { minHeight: 84, textAlignVertical: 'top' }]} />
    {hint ? <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 4 }}>{hint}</Text> : null}
  </View>;
}

export function Toggle({ label, value, onChange, detail }: { label: string; value: boolean; onChange: (v: boolean) => void; detail?: string }) {
  const c = useColors();
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={[s.toggle, { borderColor: value ? c.primary : c.border }]}>
    <View style={[s.box, { borderColor: value ? c.primary : c.input, backgroundColor: value ? c.primary : 'transparent' }]}>{value ? <Feather name="check" size={13} color={c.primaryForeground} /> : null}</View>
    <View style={{ flex: 1 }}><Text style={{ color: c.foreground, fontWeight: '600' }}>{label}</Text>{detail ? <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2, lineHeight: 17 }}>{detail}</Text> : null}</View>
  </Pressable>;
}

export function Card({ children, style, accent }: { children: React.ReactNode; style?: object; accent?: string }) {
  const c = useColors();
  return <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }, accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null, style]}>{children}</View>;
}

export function Kicker({ children, color }: { children: React.ReactNode; color?: string }) {
  const c = useColors();
  return <Text style={{ color: color ?? c.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase' }}>{children}</Text>;
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: React.ReactNode }) {
  const c = useColors();
  return <View style={s.empty} accessibilityRole="summary">
    <View style={[s.emptyRing, { borderColor: c.border, backgroundColor: c.muted }]}><Feather name={icon} size={22} color={c.gold} /></View>
    <Text style={{ color: c.foreground, fontWeight: '800', fontSize: 16, textAlign: 'center' }}>{title}</Text>
    {body ? <Text style={{ color: c.mutedForeground, textAlign: 'center', lineHeight: 19, maxWidth: 290 }}>{body}</Text> : null}
    {action}
  </View>;
}

export function ErrorRetry({ message, onRetry }: { message?: string; onRetry: () => void }) {
  const c = useColors();
  return <Pressable accessibilityRole="button" accessibilityLabel="Retry loading" onPress={onRetry} style={[s.err, { borderColor: c.destructive }]}>
    <Feather name="refresh-cw" size={15} color={c.destructive} />
    <Text style={{ color: c.destructive, flex: 1, fontWeight: '600' }}>{message ?? "Couldn't load this."} Tap to retry.</Text>
  </Pressable>;
}

function Bone({ h, w }: { h: number; w: number | `${number}%` }) {
  const c = useColors();
  const o = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(o, { toValue: 0.45, duration: 700, useNativeDriver: true })]));
    loop.start(); return () => loop.stop();
  }, [o]);
  return <Animated.View style={{ height: h, width: w, borderRadius: 10, backgroundColor: c.muted, opacity: o }} />;
}
export function Skeleton({ rows = 3 }: { rows?: number }) {
  const c = useColors();
  return <View accessibilityLabel="Loading" style={{ gap: 12 }}>
    {Array.from({ length: rows }).map((_, i) => <View key={i} style={[s.card, { borderColor: c.border, backgroundColor: c.card, gap: 8 }]}><Bone h={14} w="40%" /><Bone h={18} w="85%" /><Bone h={12} w="60%" /></View>)}
  </View>;
}

export function Notice({ text, tone = 'info', icon = 'info' }: { text: string; tone?: 'info' | 'warn' | 'ok'; icon?: IconName }) {
  const c = useColors();
  const color = tone === 'warn' ? c.coral : tone === 'ok' ? c.lime : c.gold;
  return <View accessibilityRole="text" style={[s.notice, { borderColor: color, backgroundColor: c.muted }]}>
    <Feather name={icon} size={14} color={color} /><Text style={{ color: c.foreground, flex: 1, fontSize: 12, lineHeight: 17 }}>{text}</Text>
  </View>;
}

export function Segments<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  const c = useColors();
  return <View style={[s.seg, { backgroundColor: c.muted }]} accessibilityRole="tablist">
    {options.map(([k, l]) => <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: value === k }} onPress={() => onChange(k)}
      style={[s.segItem, value === k && { backgroundColor: c.card, borderColor: c.border, borderWidth: 1 }]}>
      <Text numberOfLines={1} style={{ color: value === k ? c.foreground : c.mutedForeground, fontWeight: '700', fontSize: 12 }}>{l}</Text>
    </Pressable>)}
  </View>;
}

export function Stepper({ value, min = 1, max, onChange, label }: { value: number; min?: number; max: number; onChange: (n: number) => void; label: string }) {
  const c = useColors();
  return <View style={[s.stepper, { borderColor: c.border }]}>
    <Pressable accessibilityLabel={`Decrease ${label}`} disabled={value <= min} onPress={() => onChange(value - 1)} style={s.stepBtn}><Feather name="minus" size={15} color={value <= min ? c.border : c.foreground} /></Pressable>
    <Text accessibilityLabel={`${label} ${value}`} style={{ color: c.foreground, fontWeight: '800', minWidth: 22, textAlign: 'center' }}>{value}</Text>
    <Pressable accessibilityLabel={`Increase ${label}`} disabled={value >= max} onPress={() => onChange(value + 1)} style={s.stepBtn}><Feather name="plus" size={15} color={value >= max ? c.border : c.foreground} /></Pressable>
  </View>;
}

export function Pager({ hasPrev, next, onPrev, onNext }: { hasPrev: boolean; next?: string; onPrev: () => void; onNext: () => void }) {
  if (!hasPrev && !next) return null;
  return <View style={{ flexDirection: 'row', gap: 8, marginVertical: 10 }}>
    <Btn small flex variant="ghost" icon="chevron-left" label="Previous" disabled={!hasPrev} onPress={onPrev} />
    <Btn small flex variant="ghost" icon="chevron-right" label="More" disabled={!next} onPress={onNext} />
  </View>;
}
/** Cursor stack pagination helper. */
export function useCursor() {
  const [stack, setStack] = React.useState<string[]>([]);
  const cursor = stack[stack.length - 1];
  return { cursor, hasPrev: stack.length > 0, next: (c?: string) => c && setStack(st => [...st, c]), prev: () => setStack(st => st.slice(0, -1)), reset: () => setStack([]) };
}

export const s = StyleSheet.create({
  btn: { minHeight: 46, paddingHorizontal: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  btnSmall: { minHeight: 36, paddingHorizontal: 12, borderRadius: 11 },
  btnText: { fontWeight: '800', fontSize: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 34, justifyContent: 'center' },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 20, padding: 14, marginBottom: 12 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 16 },
  emptyRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  err: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, padding: 12, marginVertical: 8 },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderRadius: 14, padding: 11, marginVertical: 8 },
  seg: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4, marginBottom: 14 },
  segItem: { flex: 1, minHeight: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12 },
  stepBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
});
