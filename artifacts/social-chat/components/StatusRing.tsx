import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useListStatuses, getListStatusesQueryKey, type Status } from '@workspace/api-client-react';

/** Drops statuses whose expiry already passed, even if the cache is stale. */
export function activeStatuses(list: Status[] | undefined, now = Date.now()) {
  return (list ?? []).filter(s => new Date(s.expiresAt).getTime() > now);
}


/** Re-renders exactly when the nearest status expires, so stale/offline cache data still drops expired entries. */
export function useExpiryNow(list: Status[] | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = Date.now();
    if ((list ?? []).some((s) => { const e = new Date(s.expiresAt).getTime(); return e > now && e <= t; })) { setNow(t); return; }
    const next = Math.min(...(list ?? []).map((s) => new Date(s.expiresAt).getTime()).filter((e) => e > t));
    if (!Number.isFinite(next)) return;
    const id = setTimeout(() => setNow(Date.now()), Math.min(next - t + 50, 2147000000));
    return () => clearTimeout(id);
  }, [list, now]);
  return now;
}

/** Same query key as Stories, refetched every 30s. */
export function useActiveStatuses() {
  const q = useListStatuses({ query: { queryKey: getListStatusesQueryKey(), refetchInterval: 30000 } });
  const now = useExpiryNow(q.data);
  const active = useMemo(() => activeStatuses(q.data, now), [q.data, now]);
  return { ...q, active };
}

export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduce(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}

/** Rotating cyan → blue → violet ring. Inactive = quiet grey ring, no animation. */
export function StatusRing({ size, active, stroke = 2.5, children, style }: { size: number; active: boolean; stroke?: number; children?: React.ReactNode; style?: ViewStyle }) {
  const reduce = useReduceMotion();
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduce) { spin.stopAnimation(); spin.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, reduce, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const r = (size - stroke) / 2;
  const id = useRef(`sr${Math.random().toString(36).slice(2, 8)}`).current;
  return <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
    <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, transform: [{ rotate }] }}>
      <Svg width={size} height={size}>
        <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1ED3EA" /><Stop offset="0.5" stopColor="#3B82F6" /><Stop offset="1" stopColor="#8B5CF6" />
        </LinearGradient></Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={active ? `url(#${id})` : 'rgba(150,160,170,0.5)'} strokeWidth={stroke} fill="none" />
      </Svg>
    </Animated.View>
    {children}
  </View>;
}
