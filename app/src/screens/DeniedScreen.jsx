import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme.js';
import { FONT } from '../fonts.js';

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
  const { result } = route.params;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0C0E', paddingHorizontal: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  xCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', width: 56, height: 6, backgroundColor: colors.ink, borderRadius: 3 },
  title: { fontFamily: FONT.displayBold, fontSize: 34, color: colors.textPrimary, marginTop: 30 },
  subtitle: { fontSize: 15, color: colors.textMid, marginTop: 8, fontFamily: FONT.body, textAlign: 'center', paddingHorizontal: 32 },
  backBtn: { alignItems: 'center', paddingBottom: 24 },
  backText: { fontFamily: FONT.mono, fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
});
