import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import BrandMark from '../components/BrandMark.jsx';

const REASON_LABELS = {
  blocklist: 'This tag has been blocklisted',
  unlinked_tag: 'Tag is not linked to an account',
  invalid_ticket: 'Ticket is invalid or already used',
  zone_not_permitted: 'Your pass doesn’t cover this zone',
  re_entry_block: 'Re-entry blocked — try again shortly',
  unknown_tag: 'Unrecognised tag',
  unknown_gate: 'Unknown gate',
};

export default function DeniedScreen({ route, navigation }) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [mode]);
  const { result } = route.params;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.brandCorner}>
        <BrandMark colors={colors} size={30} />
      </View>
      <View style={styles.center}>
        <View style={styles.xCircle}>
          <View style={[styles.bar, { transform: [{ rotate: '45deg' }] }]} />
          <View style={[styles.bar, { transform: [{ rotate: '-45deg' }] }]} />
        </View>
        <Text style={styles.title}>Access denied</Text>
        <Text style={styles.subtitle}>{REASON_LABELS[result.reason] || 'Please see event staff'}</Text>
      </View>

      <Pressable style={styles.backBtn} onPress={() => navigation.popToTop()}>
        <Text style={styles.backText}>Back to wallet</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
    brandCorner: { position: 'absolute', top: 16, right: 20, zIndex: 10 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    xCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
    bar: { position: 'absolute', width: 56, height: 6, backgroundColor: colors.ink, borderRadius: 3 },
    title: { fontFamily: FONT.displayBold, fontSize: 34, color: colors.textPrimary, marginTop: 30 },
    subtitle: { fontSize: 15, color: colors.textMid, marginTop: 8, fontFamily: FONT.body, textAlign: 'center', paddingHorizontal: 32 },
    backBtn: { alignItems: 'center', paddingBottom: 24 },
    backText: { fontFamily: FONT.mono, fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
  });
}
