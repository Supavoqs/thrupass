import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Linking, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import { api } from '../api.js';
import { getStoredAccountId, clearStoredAccountId } from '../session.js';
import ProfileHeader from '../components/ProfileHeader.jsx';
import ProfileTabBar from '../components/ProfileTabBar.jsx';

// Platform default prices — only a fallback for events created before
// per-event pricing existed; the server sends each event's own admin-set
// prices on the event object itself.
const DEFAULT_PRICES_CENTS = { GA: 25000, VIP: 40000, VVIP: 80000, PARKING: 5000, COOLER: 10000 };
const ADD_ON_LABELS = { COOLER: 'Add cooler', PARKING: 'Add parking' };

function eventPrices(ev) {
  return { ...DEFAULT_PRICES_CENTS, ...(ev?.prices || {}) };
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

function fmtPrice(cents) {
  return `R${(cents / 100).toFixed(0)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function BrowseEventsScreen({ navigation, route }) {
  const { colors, mode, toggle } = useTheme();
  const styles = useMemo(() => createStyles(colors), [mode]);
  const accountId = route?.params?.accountId || getStoredAccountId();
  const [account, setAccount] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [tier, setTier] = useState(null);
  const [addOns, setAddOns] = useState([]);
  const [paying, setPaying] = useState(false);
  const [buyError, setBuyError] = useState(null);
  const [pendingCheckout, setPendingCheckout] = useState(null); // { ticketCheckoutId, eventId }
  const pollTimer = useRef(null);

  useEffect(() => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    api.getAccount(accountId)
      .then((data) => { if (!data.error) setAccount(data); })
      .finally(() => setLoading(false));
  }, [accountId]);

  useEffect(() => {
    api.listEvents()
      .then((list) => { if (Array.isArray(list)) setEvents(list); })
      .catch(() => {});
  }, []);

  function switchAccount() {
    clearStoredAccountId();
    navigation.replace('CreateAccount');
  }

  function toggleExpanded(ev) {
    if (expandedId === ev.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(ev.id);
    setTier(null);
    setAddOns([]);
    setBuyError(null);
  }

  function toggleAddOn(value) {
    setAddOns((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
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
        setPendingCheckout(null);
        navigation.navigate('Tickets', { accountId });
        return;
      }
      if (result.status === 'failed') {
        stopPolling();
        setPendingCheckout(null);
        setBuyError('Payment failed — your card was not charged. Try again.');
        return;
      }
    } catch {
      // transient network hiccup — keep polling, the return page and
      // webhook are the sources of truth, not this one request.
    }
    pollTimer.current = setTimeout(() => pollCheckoutStatus(ticketCheckoutId), 3000);
  }, [accountId, navigation]);

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

  async function onPayNow(ev) {
    if (!tier) return;
    setPaying(true);
    setBuyError(null);
    try {
      const checkout = await api.createTicketCheckout(accountId, ev.id, tier, addOns);
      if (checkout.error || !checkout.redirectUrl) {
        setBuyError('Could not start payment. Try again.');
        return;
      }
      setPendingCheckout({ ticketCheckoutId: checkout.ticketCheckoutId, eventId: ev.id });
      await Linking.openURL(checkout.redirectUrl);
      pollTimer.current = setTimeout(() => pollCheckoutStatus(checkout.ticketCheckoutId), 3000);
    } catch {
      setBuyError('Could not reach the server. Try again.');
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

  const today = todayIso();
  const upcomingEvents = events
    .filter((e) => e.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ProfileHeader colors={colors} mode={mode} toggle={toggle} holder={account.holder} onLogout={switchAccount} />
      <ProfileTabBar active="browse" navigation={navigation} accountId={accountId} colors={colors} />

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Browse Other Events</Text>
        <Text style={styles.subtitle}>Featured Events — everything coming up that you can attend.</Text>

        {upcomingEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No upcoming events right now</Text>
            <Text style={styles.emptySubtitle}>Check back soon — new events show up here as hosts create them.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {upcomingEvents.map((ev) => {
              const expanded = expandedId === ev.id;
              const prices = eventPrices(ev);
              const totalCents = tier
                ? (prices[tier] || 0) + addOns.reduce((sum, a) => sum + (prices[a] || 0), 0)
                : 0;
              const isPendingThisEvent = pendingCheckout?.eventId === ev.id;
              return (
                <View key={ev.id} style={styles.card}>
                  <Pressable onPress={() => toggleExpanded(ev)}>
                    <Text style={styles.eventName}>{ev.name}</Text>
                    <Text style={styles.eventMeta}>
                      {fmtDate(ev.startDate)}–{fmtDate(ev.endDate)}
                      {ev.location ? ` · ${ev.location}` : ''}
                    </Text>
                    {ev.tiers?.length > 0 && (
                      <View style={styles.chipRow}>
                        {ev.tiers.map((t) => (
                          <View key={t} style={styles.tierChip}>
                            <Text style={styles.tierChipText}>{t} — {fmtPrice(prices[t] || 0)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </Pressable>

                  {expanded && isPendingThisEvent && (
                    <View style={styles.expandedBlock}>
                      <Text style={styles.sectionLabel}>Waiting for payment</Text>
                      <Text style={styles.waitingText}>
                        Complete your card payment in the browser tab that just opened, then come back here.
                      </Text>
                      <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 4 }}>
                        <ActivityIndicator color={colors.lime} />
                      </View>
                      {buyError && <Text style={styles.error}>{buyError}</Text>}
                      <Pressable
                        onPress={() => pollCheckoutStatus(pendingCheckout.ticketCheckoutId)}
                        style={styles.getTicketBtn}
                      >
                        <Text style={styles.getTicketBtnText}>I've paid — check now</Text>
                      </Pressable>
                      <Pressable onPress={cancelPending} style={styles.cancelBtn}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </Pressable>
                    </View>
                  )}

                  {expanded && !isPendingThisEvent && (
                    <View style={styles.expandedBlock}>
                      <Text style={styles.sectionLabel}>Choose a tier</Text>
                      <View style={styles.chipRow}>
                        {ev.tiers.map((t) => (
                          <Pressable key={t} onPress={() => setTier(t)} style={[styles.pickChip, tier === t && styles.pickChipActive]}>
                            <Text style={[styles.pickChipText, tier === t && styles.pickChipTextActive]}>
                              {t} — {fmtPrice(prices[t] || 0)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      {ev.addOns?.length > 0 && (
                        <>
                          <Text style={styles.sectionLabel}>Add-ons (optional)</Text>
                          <View style={styles.chipRow}>
                            {ev.addOns.map((a) => (
                              <Pressable key={a} onPress={() => toggleAddOn(a)} style={[styles.pickChip, addOns.includes(a) && styles.pickChipActive]}>
                                <Text style={[styles.pickChipText, addOns.includes(a) && styles.pickChipTextActive]}>
                                  {ADD_ON_LABELS[a] || a} — {fmtPrice(prices[a] || 0)}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </>
                      )}

                      {tier && <Text style={styles.totalText}>Total: {fmtPrice(totalCents)}</Text>}
                      {buyError && <Text style={styles.error}>{buyError}</Text>}

                      <Pressable
                        onPress={() => onPayNow(ev)}
                        disabled={!tier || paying}
                        style={[styles.getTicketBtn, (!tier || paying) && styles.getTicketBtnDisabled]}
                      >
                        {paying ? (
                          <ActivityIndicator color={colors.ink} />
                        ) : (
                          <Text style={styles.getTicketBtnText}>Pay Now</Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ flex: 1, minHeight: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
    loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: FONT.displayBold, fontSize: 22, color: colors.textPrimary, paddingTop: 8 },
    subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 6, marginBottom: 18, fontFamily: FONT.body },
    list: { gap: 12 },
    card: { borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, padding: 16 },
    eventName: { fontFamily: FONT.displaySemiBold, fontSize: 17, color: colors.textPrimary },
    eventMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 4, fontFamily: FONT.body },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    tierChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.limeSoft },
    tierChipText: { color: colors.lime, fontSize: 12, fontFamily: FONT.bodyBold },
    emptyState: { borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, padding: 24, alignItems: 'center' },
    emptyTitle: { fontFamily: FONT.displaySemiBold, fontSize: 18, color: colors.textPrimary },
    emptySubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 8, textAlign: 'center', fontFamily: FONT.body },
    expandedBlock: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.borderSoft },
    sectionLabel: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textSecondary, marginBottom: 8, fontFamily: FONT.body },
    waitingText: { fontSize: 13, color: colors.textSecondary, fontFamily: FONT.body, lineHeight: 19 },
    pickChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    pickChipActive: { backgroundColor: colors.lime, borderColor: colors.lime },
    pickChipText: { color: colors.textMid, fontSize: 13, fontFamily: FONT.bodySemiBold },
    pickChipTextActive: { color: colors.ink },
    totalText: { fontSize: 15, color: colors.lime, marginTop: 14, fontFamily: FONT.bodyBold },
    error: { color: colors.redLight, fontSize: 13, marginTop: 10, fontFamily: FONT.body },
    getTicketBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.lime, alignItems: 'center' },
    getTicketBtnDisabled: { opacity: 0.5 },
    getTicketBtnText: { color: colors.ink, fontFamily: FONT.bodyBold, fontSize: 14 },
    cancelBtn: { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
    cancelBtnText: { color: colors.textSecondary, fontSize: 13, fontFamily: FONT.body, textDecorationLine: 'underline' },
  });
}
