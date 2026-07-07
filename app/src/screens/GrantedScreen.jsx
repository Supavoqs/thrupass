import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../../shared/tokens.js';
import { FONT } from '../fonts.js';

function fmtTime(ts) {
  return new Date(ts).toTimeString().slice(0, 8);
}

export default function GrantedScreen({ route, navigation }) {
  const { result } = route.params;
  const zones = result.ticket?.zones?.join(' · ') || '—';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <View style={styles.checkCircle}>
          <View style={styles.check} />
        </View>
        <Text style={styles.title}>You're in</Text>
        <Text style={styles.subtitle}>
          {result.gate ? `${result.gate.gateLabel} · ${result.gate.zoneLabel}` : 'Gate B · Main Arena'}
        </Text>
      </View>

      <View style={styles.card}>
        <Row label="Tier" value={result.ticket?.tier || '—'} />
        <Row label="Entry time" value={fmtTime(result.ts)} mono />
        <Row label="Zones unlocked" value={zones} valueColor={colors.lime} last />
      </View>

      <Text style={styles.footer}>re-entry enabled · anti-passback ok</Text>

      <Pressable style={styles.backBtn} onPress={() => navigation.popToTop()}>
        <Text style={styles.backText}>Back to wallet</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Row({ label, value, mono, valueColor, last }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && { fontFamily: FONT.mono }, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0C0E', paddingHorizontal: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  checkCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.green,
    shadowOpacity: 0.4,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  check: { width: 44, height: 24, borderLeftWidth: 6, borderBottomWidth: 6, borderColor: colors.ink, transform: [{ rotate: '-45deg' }], marginTop: -8 },
  title: { fontFamily: FONT.displayBold, fontSize: 34, color: colors.textPrimary, marginTop: 30 },
  subtitle: { fontSize: 15, color: colors.textMid, marginTop: 8, fontFamily: FONT.body },
  card: { borderRadius: 18, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden', marginBottom: 22 },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  rowLabel: { fontSize: 13, color: colors.textSecondary, fontFamily: FONT.body },
  rowValue: { fontSize: 13, color: colors.textPrimary, fontFamily: FONT.bodySemiBold },
  footer: { textAlign: 'center', fontFamily: FONT.mono, fontSize: 12, color: '#5a616a', marginBottom: 16 },
  backBtn: { alignItems: 'center', paddingBottom: 24 },
  backText: { fontFamily: FONT.mono, fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
});
