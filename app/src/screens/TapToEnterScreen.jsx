import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import { api, GATE_ID } from '../api.js';
import BrandMark from '../components/BrandMark.jsx';

const SCAN_DELAY_MS = 2200;

function Ring({ delay, styles }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 2400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.9] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });

  return <Animated.View style={[styles.ring, { transform: [{ scale }], opacity }]} />;
}

function PulsingCore({ styles }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <Animated.View style={[styles.core, { transform: [{ scale }] }]}>
      <View style={styles.arc} />
      <View style={styles.dot} />
    </Animated.View>
  );
}

function BlinkingDot({ styles }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.25, duration: 500, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return <Animated.View style={[styles.blinkDot, { opacity: anim }]} />;
}

export default function TapToEnterScreen({ route, navigation }) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [mode]);
  const { tagUid } = route.params || {};

  useEffect(() => {
    const t = setTimeout(async () => {
      const result = await api.scan(GATE_ID, tagUid);
      if (result.result === 'granted') {
        navigation.replace('Granted', { result, tagUid });
      } else {
        navigation.replace('Denied', { result, tagUid });
      }
    }, SCAN_DELAY_MS);
    return () => clearTimeout(t);
  }, [tagUid, navigation]);

  const maskedUid = tagUid ? `•••• ${tagUid.slice(-4)}` : '••••';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.brandCorner}>
        <BrandMark colors={colors} size={30} />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title}>Ready to enter</Text>
        <Text style={styles.subtitle}>Hold your wristband or phone{'\n'}near the gate reader</Text>
      </View>

      <View style={styles.pulseArea}>
        <Ring delay={0} styles={styles} />
        <Ring delay={800} styles={styles} />
        <Ring delay={1600} styles={styles} />
        <PulsingCore styles={styles} />
      </View>

      <View style={styles.searchingWrap}>
        <View style={styles.searchingPill}>
          <BlinkingDot styles={styles} />
          <Text style={styles.searchingText}>searching for reader…</Text>
        </View>
      </View>

      <Text style={styles.footer}>GA Weekend · UID {maskedUid}</Text>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    brandCorner: { position: 'absolute', top: 16, right: 20, zIndex: 10 },
    textBlock: { alignItems: 'center', paddingTop: 8, paddingHorizontal: 24 },
    title: { fontFamily: FONT.displaySemiBold, fontSize: 24, color: colors.textPrimary },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 20, fontFamily: FONT.body },
    pulseArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    ring: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 2, borderColor: colors.limeSoft },
    core: {
      width: 132,
      height: 132,
      borderRadius: 66,
      backgroundColor: colors.lime,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.lime,
      shadowOpacity: 0.5,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 0 },
      elevation: 12,
    },
    arc: { width: 44, height: 30, borderWidth: 4, borderColor: colors.ink, borderBottomWidth: 0, borderTopLeftRadius: 44, borderTopRightRadius: 44 },
    dot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.ink, marginTop: -6 },
    searchingWrap: { alignItems: 'center', paddingHorizontal: 24 },
    searchingPill: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 999, backgroundColor: colors.borderSoft, borderWidth: 1, borderColor: colors.border },
    blinkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lime },
    searchingText: { fontFamily: FONT.mono, fontSize: 13, color: colors.textMid },
    footer: { textAlign: 'center', paddingVertical: 24, fontSize: 14, color: colors.textSecondary, fontFamily: FONT.body },
  });
}
