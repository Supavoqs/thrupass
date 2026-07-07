import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../../shared/tokens.js';
import { FONT } from '../fonts.js';
import { api, DEMO_ACCOUNT_ID } from '../api.js';

function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function WalletScreen({ navigation }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toppingUp, setToppingUp] = useState(false);

  const load = useCallback(async () => {
    const data = await api.getAccount(DEMO_ACCOUNT_ID);
    setAccount(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onTopUp = async () => {
    setToppingUp(true);
    try {
      await api.topup(DEMO_ACCOUNT_ID, 10000);
      await load();
    } finally {
      setToppingUp(false);
    }
  };

  if (loading || !account) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={colors.lime} />
      </SafeAreaView>
    );
  }

  const rand = (account.balanceCents / 100).toFixed(2);
  const [whole, cents] = rand.split('.');

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeLabel}>Welcome back</Text>
          <Text style={styles.name}>{account.holder.split(' ')[0]} {account.holder.split(' ')[1]?.[0]}.</Text>
        </View>
        <LinearGradient colors={[colors.lime, colors.cyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(account.holder)}</Text>
        </LinearGradient>
      </View>

      {/* balance */}
      <LinearGradient colors={['#1A1D22', '#141619']} style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Thru balance · cashless</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceAmount}>
            R {whole}
            <Text style={styles.balanceCents}>.{cents}</Text>
          </Text>
          <Pressable style={styles.topUpBtn} onPress={onTopUp} disabled={toppingUp}>
            {toppingUp ? <ActivityIndicator size="small" color={colors.ink} /> : <Text style={styles.topUpText}>Top up</Text>}
          </Pressable>
        </View>
      </LinearGradient>

      <Text style={styles.sectionLabel}>Your pass</Text>

      {account.ticket ? (
        <View style={styles.passCard}>
          <LinearGradient colors={['#20242a', '#191c21']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.artwork}>
            <Text style={styles.artworkLabel}>event_key_art.jpg</Text>
          </LinearGradient>
          <View style={styles.passBody}>
            <Text style={styles.eventName}>{account.ticket.eventName}</Text>
            <Text style={styles.eventMeta}>6–8 Mar · Franschhoek</Text>
            <View style={styles.chipRow}>
              <View style={styles.tierChip}>
                <Text style={styles.tierChipText}>{account.ticket.tier}</Text>
              </View>
              <View style={styles.linkedChip}>
                <View style={styles.linkedDot} />
                <Text style={styles.linkedChipText}>Wristband linked</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <View style={{ flex: 1 }} />

      <Pressable style={styles.cta} onPress={() => navigation.navigate('TapToEnter', { tagUid: account.tag?.uid })}>
        <Text style={styles.ctaText}>Tap to enter →</Text>
      </Pressable>

      <View style={styles.bottomNav}>
        <Text style={[styles.navItem, styles.navItemActive]}>Wallet</Text>
        <Text style={styles.navItem}>Scan</Text>
        <Text style={styles.navItem}>Tickets</Text>
        <Text style={styles.navItem}>Profile</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  welcomeLabel: { fontSize: 12, color: colors.textSecondary, fontFamily: FONT.body },
  name: { fontFamily: FONT.displaySemiBold, fontSize: 20, color: colors.textPrimary },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FONT.bodyExtraBold, color: colors.ink, fontSize: 15 },
  balanceCard: { borderRadius: 20, padding: 18, marginBottom: 18, borderWidth: 1, borderColor: colors.borderSoft },
  balanceLabel: { fontSize: 11, letterSpacing: 1.4, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 8, fontFamily: FONT.body },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  balanceAmount: { fontFamily: FONT.displayBold, fontSize: 34, color: colors.textPrimary },
  balanceCents: { fontSize: 20, color: colors.textSecondary, fontFamily: FONT.displaySemiBold },
  topUpBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.lime, minWidth: 74, alignItems: 'center' },
  topUpText: { color: colors.ink, fontFamily: FONT.bodyBold, fontSize: 13 },
  sectionLabel: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textSecondary, marginBottom: 12, fontFamily: FONT.body },
  passCard: { borderRadius: 22, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(200,255,61,0.25)' },
  artwork: { height: 88, justifyContent: 'flex-end', padding: 14 },
  artworkLabel: { fontFamily: FONT.mono, fontSize: 10, color: '#5a616a' },
  passBody: { padding: 18 },
  eventName: { fontFamily: FONT.displayBold, fontSize: 22, color: colors.textPrimary },
  eventMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 5, fontFamily: FONT.body },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  tierChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.limeSoft },
  tierChipText: { color: colors.lime, fontSize: 12, fontFamily: FONT.bodyBold },
  linkedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  linkedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  linkedChipText: { color: colors.textMid, fontSize: 12, fontFamily: FONT.bodySemiBold },
  cta: { padding: 17, borderRadius: 16, backgroundColor: colors.lime, alignItems: 'center', marginBottom: 8 },
  ctaText: { color: colors.ink, fontFamily: FONT.displayBold, fontSize: 16 },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  navItem: { fontSize: 11, color: '#5a616a', fontFamily: FONT.bodyBold },
  navItemActive: { color: colors.lime },
});
