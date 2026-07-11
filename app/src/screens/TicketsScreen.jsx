import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Linking, AppState, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import { api } from '../api.js';
import { getStoredAccountId, clearStoredAccountId } from '../session.js';
import ProfileHeader from '../components/ProfileHeader.jsx';
import ProfileTabBar from '../components/ProfileTabBar.jsx';
import CopyrightFooter from '../components/CopyrightFooter.jsx';

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
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState(null);
  const [pendingCheckout, setPendingCheckout] = useState(null); // { ticketCheckoutId }
  const pollTimer = useRef(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    const data = await api.getAccount(accountId);
    if (!data.error) setAccount(data);
  }, [accountId]);

  useEffect(() => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    load().finally(() => setLoading(false));
  }, [accountId, load]);

  function switchAccount() {
    clearStoredAccountId();
    navigation.replace('CreateAccount');
  }

  async function onRemoveTicket() {
    setRemoveError(null);
    setRemoving(true);
    try {
      const updated = await api.removeTicket(accountId);
      if (updated.error) {
        setRemoveError('Something went wrong. Try again.');
        return;
      }
      setAccount(updated);
      setConfirmingRemove(false);
    } catch {
      setRemoveError('Could not reach the server. Try again.');
    } finally {
      setRemoving(false);
    }
  }

  function stopPolling() {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }

  const pollCheckoutStatus = useCallback(async (ticketCheckoutId) => {
    try {
      const result = await api.getTicketCheckoutStatus(ticketCheckoutId);
      if (result.status === 'completed') {
        stopPolling();
        await load();
        setPendingCheckout(null);
        return;
      }
      if (result.status === 'failed') {
        stopPolling();
        setPendingCheckout(null);
        setPayError('Payment failed — your card was not charged. Try again.');
        return;
      }
    } catch {
      // transient network hiccup — keep polling, the return page and
      // webhook are the sources of truth, not this one request.
    }
    pollTimer.current = setTimeout(() => pollCheckoutStatus(ticketCheckoutId), 3000);
  }, [load]);

  useEffect(() => stopPolling, []);

  // If the shopper switches back to the app after paying in the external
  // browser, check immediately rather than waiting for the next tick.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pendingCheckout) {
        pollCheckoutStatus(pendingCheckout.ticketCheckoutId);
      }
    });
    return () => sub.remove();
  }, [pendingCheckout, pollCheckoutStatus]);

  async function onPayNow() {
    const ticket = account.ticket;
    setPaying(true);
    setPayError(null);
    try {
      const checkout = await api.createTicketCheckout(accountId, ticket.event.id, ticket.tier, ticket.addOns);
      if (checkout.error || !checkout.redirectUrl) {
        setPayError('Could not start payment. Try again.');
        return;
      }
      setPendingCheckout({ ticketCheckoutId: checkout.ticketCheckoutId });
      await Linking.openURL(checkout.redirectUrl);
      pollTimer.current = setTimeout(() => pollCheckoutStatus(checkout.ticketCheckoutId), 3000);
    } catch {
      setPayError('Could not reach the server. Try again.');
    } finally {
      setPaying(false);
    }
  }

  function cancelPending() {
    stopPolling();
    setPendingCheckout(null);
  }

  if (loading || !account) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={colors.lime} />
      </SafeAreaView>
    );
  }

  const ticket = account.ticket;
  const isReserved = ticket?.status === 'reserved';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ProfileHeader colors={colors} holder={account.holder} onLogout={switchAccount} />
      <ProfileTabBar active="tickets" navigation={navigation} accountId={accountId} colors={colors} />

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>My Tickets</Text>

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
                {isReserved && (
                  <View style={styles.reservedChip}>
                    <Text style={styles.reservedChipText}>Reserved — unpaid</Text>
                  </View>
                )}
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
                <Text style={styles.priceText}>
                  {isReserved ? 'Reserved — ' : 'Paid '}R{(ticket.priceCents / 100).toFixed(2)}
                </Text>
              )}

              <Text style={styles.ticketId}>{ticket.id}</Text>

              {!isReserved && ticket.qrUrl && (
                <View style={styles.qrBox}>
                  <Image source={{ uri: `${ticket.qrUrl}/qr.png` }} style={styles.qrImage} />
                  <Text style={styles.qrHint}>Show this QR code at the gate to enter</Text>
                </View>
              )}

              {isReserved && pendingCheckout ? (
                <View style={styles.payingBox}>
                  <Text style={styles.payingTitle}>Waiting for payment</Text>
                  <Text style={styles.payingText}>
                    Complete your card payment in the browser tab that just opened, then come back here.
                  </Text>
                  <View style={{ alignItems: 'center', marginTop: 14, marginBottom: 4 }}>
                    <ActivityIndicator color={colors.lime} />
                  </View>
                  {payError && <Text style={styles.error}>{payError}</Text>}
                  <Pressable style={styles.payNowBtn} onPress={() => pollCheckoutStatus(pendingCheckout.ticketCheckoutId)}>
                    <Text style={styles.payNowBtnText}>I've paid — check now</Text>
                  </Pressable>
                  <Pressable style={styles.cancelBtn2} onPress={cancelPending}>
                    <Text style={styles.cancelBtn2Text}>Cancel</Text>
                  </Pressable>
                </View>
              ) : isReserved ? (
                <>
                  {payError && <Text style={styles.error}>{payError}</Text>}
                  <Pressable style={styles.payNowBtn} onPress={onPayNow} disabled={paying}>
                    {paying ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.payNowBtnText}>Pay Now</Text>}
                  </Pressable>
                </>
              ) : null}

              {removeError ? <Text style={styles.error}>{removeError}</Text> : null}

              {confirmingRemove ? (
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmText}>Remove this event? You'll lose your ticket and any add-ons.</Text>
                  <View style={styles.confirmButtons}>
                    <Pressable style={styles.confirmBtn} onPress={onRemoveTicket} disabled={removing}>
                      {removing ? <ActivityIndicator color="#0B0C0E" /> : <Text style={styles.confirmBtnText}>Yes, remove</Text>}
                    </Pressable>
                    <Pressable style={styles.cancelBtn} onPress={() => setConfirmingRemove(false)}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={styles.removeBtn} onPress={() => setConfirmingRemove(true)}>
                  <Text style={styles.removeBtnText}>Remove event</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No ticket yet</Text>
            <Text style={styles.emptySubtitle}>Browse other events to pick one, or ask the event host to link a ticket to your account.</Text>
            <Pressable style={styles.browseBtn} onPress={() => navigation.navigate('BrowseEvents', { accountId })}>
              <Text style={styles.browseBtnText}>Browse other events</Text>
            </Pressable>
          </View>
        )}

        <View style={{ flex: 1, minHeight: 24 }} />
        <CopyrightFooter colors={colors} />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
    loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: FONT.displayBold, fontSize: 22, color: colors.textPrimary, paddingTop: 8, paddingBottom: 16 },
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
    reservedChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(232,197,71,0.16)' },
    reservedChipText: { color: '#e8c547', fontSize: 12, fontFamily: FONT.bodySemiBold },
    sectionLabel: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textSecondary, marginTop: 18, fontFamily: FONT.body },
    addOnChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.borderSoft },
    addOnChipText: { color: colors.cyan, fontSize: 12, fontFamily: FONT.bodySemiBold },
    zoneChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.borderSoft },
    zoneChipText: { color: colors.textMid, fontSize: 12, fontFamily: FONT.bodySemiBold },
    priceText: { fontSize: 14, color: colors.lime, fontFamily: FONT.bodyBold, marginTop: 16 },
    ticketId: { fontFamily: FONT.mono, fontSize: 11, color: colors.textDim, marginTop: 6 },
    qrBox: { alignItems: 'center', marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.borderSoft },
    qrImage: { width: 160, height: 160, borderRadius: 12, backgroundColor: '#fff' },
    qrHint: { fontSize: 12, color: colors.textSecondary, marginTop: 10, textAlign: 'center', fontFamily: FONT.body },
    emptyState: { borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, padding: 24, alignItems: 'center' },
    emptyTitle: { fontFamily: FONT.displaySemiBold, fontSize: 18, color: colors.textPrimary },
    emptySubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 8, textAlign: 'center', fontFamily: FONT.body },
    browseBtn: { marginTop: 18, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.lime },
    browseBtnText: { color: '#0B0C0E', fontSize: 13, fontFamily: FONT.bodyBold },
    error: { color: colors.redLight, fontSize: 13, marginTop: 14, fontFamily: FONT.body },
    removeBtn: { marginTop: 18, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.redLight, alignItems: 'center' },
    removeBtnText: { color: colors.redLight, fontSize: 13, fontFamily: FONT.bodyBold },
    confirmRow: { marginTop: 18, borderRadius: 14, backgroundColor: colors.surfaceAlt, padding: 14 },
    confirmText: { fontSize: 13, color: colors.textSecondary, fontFamily: FONT.body, lineHeight: 19 },
    confirmButtons: { flexDirection: 'row', gap: 10, marginTop: 12 },
    confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.redLight, alignItems: 'center' },
    confirmBtnText: { color: '#0B0C0E', fontSize: 13, fontFamily: FONT.bodyBold },
    cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center' },
    cancelBtnText: { color: colors.textMid, fontSize: 13, fontFamily: FONT.bodyBold },
    payNowBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.lime, alignItems: 'center' },
    payNowBtnText: { color: colors.ink, fontFamily: FONT.bodyBold, fontSize: 14 },
    payingBox: { marginTop: 16, borderRadius: 14, backgroundColor: colors.surfaceAlt, padding: 14 },
    payingTitle: { fontFamily: FONT.displaySemiBold, fontSize: 15, color: colors.textPrimary },
    payingText: { fontSize: 13, color: colors.textSecondary, marginTop: 6, fontFamily: FONT.body, lineHeight: 18 },
    cancelBtn2: { alignItems: 'center', paddingVertical: 12 },
    cancelBtn2Text: { color: colors.textSecondary, fontSize: 13, fontFamily: FONT.body, textDecorationLine: 'underline' },
  });
}
