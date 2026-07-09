import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import { api } from '../api.js';
import { getStoredAccountId, clearStoredAccountId } from '../session.js';
import ProfileHeader from '../components/ProfileHeader.jsx';
import ProfileTabBar from '../components/ProfileTabBar.jsx';

const TIER_PRICES_CENTS = { GA: 25000, VIP: 40000, VVIP: 80000 };

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

      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Text style={styles.title}>Browse Other Events</Text>
        <Text style={styles.subtitle}>Featured Events — everything coming up that you can attend.</Text>

        {upcomingEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No upcoming events right now</Text>
            <Text style={styles.emptySubtitle}>Check back soon — new events show up here as hosts create them.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {upcomingEvents.map((ev) => (
              <View key={ev.id} style={styles.card}>
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
              </View>
            ))}
          </View>
        )}

        <View style={{ flex: 1, minHeight: 24 }} />
      </ScrollView>

      <ProfileTabBar active="browse" navigation={navigation} accountId={accountId} colors={colors} />
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
  });
}
