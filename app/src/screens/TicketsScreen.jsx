import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import { api } from '../api.js';
import { getStoredAccountId } from '../session.js';

const ADD_ON_LABELS = { COOLER: 'Add cooler', PARKING: 'Add parking' };

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

export default function TicketsScreen({ navigation, route }) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [mode]);
  const accountId = route?.params?.accountId || getStoredAccountId();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    api.getAccount(accountId)
      .then((data) => { if (!data.error) setAccount(data); })
      .finally(() => setLoading(false));
  }, [accountId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={colors.lime} />
      </SafeAreaView>
    );
  }

  const ticket = account?.ticket;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Your tickets</Text>
      </View>

      {ticket ? (
        <View style={styles.passCard}>
          <LinearGradient colors={mode === 'dark' ? ['#20242a', '#191c21'] : ['#E9EBEE', '#F0F1F3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.artwork}>
            <Text style={styles.artworkLabel}>event_key_art.jpg</Text>
          </LinearGradient>
          <View style={styles.passBody}>
            <Text style={styles.eventName}>{ticket.event?.name}</Text>
            <Text style={styles.eventMeta}>
              {fmtDate(ticket.event?.startDate)}–{fmtDate(ticket.event?.endDate)}
              {ticket.event?.location ? ` · ${ticket.event.location}` : ''}
            </Text>
            <View style={styles.chipRow}>
              <View style={styles.tierChip}>
                <Text style={styles.tierChipText}>{ticket.tier}</Text>
              </View>
              <View style={styles.linkedChip}>
                <View style={[styles.linkedDot, !account.tag && styles.linkedDotOff]} />
                <Text style={styles.linkedChipText}>{account.tag ? 'Wristband linked' : 'No wristband yet'}</Text>
              </View>
            </View>

            {ticket.addOns?.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Add-ons</Text>
                <View style={styles.chipRow}>
                  {ticket.addOns.map((a) => (
                    <View key={a} style={styles.addOnChip}>
                      <Text style={styles.addOnChipText}>{ADD_ON_LABELS[a] || a}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.sectionLabel}>Access zones</Text>
            <View style={styles.chipRow}>
              {ticket.zones?.map((z) => (
                <View key={z} style={styles.zoneChip}>
                  <Text style={styles.zoneChipText}>{z}</Text>
                </View>
              ))}
            </View>

            {typeof ticket.priceCents === 'number' && (
              <Text style={styles.priceText}>Paid R{(ticket.priceCents / 100).toFixed(2)}</Text>
            )}

            <Text style={styles.ticketId}>{ticket.id}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No ticket yet</Text>
          <Text style={styles.emptySubtitle}>Pick an event next time you sign up, or ask the event host to link one to your account.</Text>
        </View>
      )}

      <View style={{ flex: 1 }} />

      <Pressable style={styles.backLink} onPress={() => navigation.navigate('Wallet')}>
        <Text style={styles.backLinkText}>Back to wallet</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
    loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    header: { paddingTop: 24, paddingBottom: 16 },
    title: { fontFamily: FONT.displayBold, fontSize: 26, color: colors.textPrimary },
    passCard: { borderRadius: 22, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.limeSoft },
    artwork: { height: 88, justifyContent: 'flex-end', padding: 14 },
    artworkLabel: { fontFamily: FONT.mono, fontSize: 10, color: colors.textDim },
    passBody: { padding: 18 },
    eventName: { fontFamily: FONT.displayBold, fontSize: 22, color: colors.textPrimary },
    eventMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 5, fontFamily: FONT.body },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    tierChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.limeSoft },
    tierChipText: { color: colors.lime, fontSize: 12, fontFamily: FONT.bodyBold },
    linkedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.borderSoft },
    linkedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
    linkedDotOff: { backgroundColor: colors.textDim },
    linkedChipText: { color: colors.textMid, fontSize: 12, fontFamily: FONT.bodySemiBold },
    sectionLabel: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textSecondary, marginTop: 18, fontFamily: FONT.body },
    addOnChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.borderSoft },
    addOnChipText: { color: colors.cyan, fontSize: 12, fontFamily: FONT.bodySemiBold },
    zoneChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.borderSoft },
    zoneChipText: { color: colors.textMid, fontSize: 12, fontFamily: FONT.bodySemiBold },
    priceText: { fontSize: 14, color: colors.lime, fontFamily: FONT.bodyBold, marginTop: 16 },
    ticketId: { fontFamily: FONT.mono, fontSize: 11, color: colors.textDim, marginTop: 6 },
    emptyState: { borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, padding: 24, alignItems: 'center' },
    emptyTitle: { fontFamily: FONT.displaySemiBold, fontSize: 18, color: colors.textPrimary },
    emptySubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 8, textAlign: 'center', fontFamily: FONT.body },
    backLink: { alignItems: 'center', paddingVertical: 20 },
    backLinkText: { color: colors.textSecondary, fontSize: 13, fontFamily: FONT.body, textDecorationLine: 'underline' },
  });
}
