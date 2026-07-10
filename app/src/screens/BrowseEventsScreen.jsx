import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import { api } from '../api.js';
import { getStoredAccountId, clearStoredAccountId } from '../session.js';
import ProfileHeader from '../components/ProfileHeader.jsx';
import ProfileTabBar from '../components/ProfileTabBar.jsx';

// Fixed platform-wide pricing — keep in sync with server/src/index.js and
// gate-reader/src/panels/CreateEventPanel.jsx.
const TIER_PRICES_CENTS = { GA: 25000, VIP: 40000, VVIP: 80000 };
const ADD_ON_PRICES_CENTS = { COOLER: 10000, PARKING: 5000 };
const ADD_ON_LABELS = { COOLER: 'Add cooler', PARKING: 'Add parking' };

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
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState(null);

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

  async function onGetTicket(ev) {
    if (!tier) return;
    setBuying(true);
    setBuyError(null);
    try {
      const updated = await api.buyTicket(accountId, ev.id, tier, addOns);
      if (updated.error) {
        setBuyError('Could not get that ticket. Try again.');
        return;
      }
      navigation.navigate('Tickets', { accountId });
    } catch {
      setBuyError('Could not reach the server. Try again.');
    } finally {
      setBuying(false);
    }
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
              const totalCents = tier
                ? (TIER_PRICES_CENTS[tier] || 0) + addOns.reduce((sum, a) => sum + (ADD_ON_PRICES_CENTS[a] || 0), 0)
                : 0;
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
                            <Text style={styles.tierChipText}>{t} — {fmtPrice(TIER_PRICES_CENTS[t] || 0)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </Pressable>

                  {expanded && (
                    <View style={styles.expandedBlock}>
                      <Text style={styles.sectionLabel}>Choose a tier</Text>
                      <View style={styles.chipRow}>
                        {ev.tiers.map((t) => (
                          <Pressable key={t} onPress={() => setTier(t)} style={[styles.pickChip, tier === t && styles.pickChipActive]}>
                            <Text style={[styles.pickChipText, tier === t && styles.pickChipTextActive]}>
                              {t} — {fmtPrice(TIER_PRICES_CENTS[t] || 0)}
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
                                  {ADD_ON_LABELS[a] || a} — {fmtPrice(ADD_ON_PRICES_CENTS[a] || 0)}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </>
                      )}

                      {tier && <Text style={styles.totalText}>Total: {fmtPrice(totalCents)}</Text>}
                      {buyError && <Text style={styles.error}>{buyError}</Text>}

                      <Pressable
                        onPress={() => onGetTicket(ev)}
                        disabled={!tier || buying}
                        style={[styles.getTicketBtn, (!tier || buying) && styles.getTicketBtnDisabled]}
                      >
                        {buying ? (
                          <ActivityIndicator color={colors.ink} />
                        ) : (
                          <Text style={styles.getTicketBtnText}>Get ticket</Text>
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
  });
}
