import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import { api } from '../api.js';
import { getStoredAccountId } from '../session.js';
import BrandMark from '../components/BrandMark.jsx';

const DRINK_LABELS = { BEERS: 'Beer', CIDERS: 'Cider', SPIRITS: 'Spirits' };
const DRINK_ORDER = ['BEERS', 'CIDERS', 'SPIRITS'];

export default function BarTabMenuScreen({ route, navigation }) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [mode]);
  const barTabEventId = route?.params?.barTabEventId;
  const accountId = getStoredAccountId();
  const [event, setEvent] = useState(null);
  const [tab, setTab] = useState(null);
  const [holder, setHolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!barTabEventId || !accountId) {
      setLoading(false);
      return;
    }
    Promise.all([
      api.getBarTabEvent(barTabEventId),
      api.getDrinkTab(accountId, barTabEventId),
      api.rsvpBarTabEvent(barTabEventId, accountId),
    ])
      .then(([ev, drinkTab, rsvp]) => {
        if (ev.error) {
          setError("This bar tab link isn't valid.");
          return;
        }
        setEvent(ev);
        setTab(drinkTab);
        if (!rsvp.error) setHolder(rsvp.holder);
      })
      .catch(() => setError('Could not reach the server. Try again.'))
      .finally(() => setLoading(false));
  }, [barTabEventId, accountId]);

  if (!barTabEventId) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.brandRow}>
          <BrandMark colors={colors} size={26} />
        </View>
        <View style={styles.center}>
          <Text style={styles.title}>Bar tab link missing</Text>
          <Text style={styles.subtitle}>Scan the QR code at the bar to open a bar tab menu.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!accountId) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.brandRow}>
          <BrandMark colors={colors} size={26} />
        </View>
        <View style={styles.center}>
          <Text style={styles.title}>RSVP TO INVITE</Text>
          <Text style={styles.subtitle}>Sign up or log in to RSVP and see your drinks for this bar.</Text>
          <Pressable style={styles.cta} onPress={() => navigation.navigate('CreateAccount', { barTabEventId })}>
            <Text style={styles.ctaText}>Sign Up / Log In to RSVP</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={colors.lime} />
      </SafeAreaView>
    );
  }

  if (error || !event) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.brandRow}>
          <BrandMark colors={colors} size={26} />
        </View>
        <View style={styles.center}>
          <Text style={styles.title}>{error || 'Bar tab not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.brandRow}>
        <BrandMark colors={colors} size={26} />
      </View>
      <Text style={styles.title}>{event.name}</Text>
      <Text style={styles.subtitle}>Your drinks for this bar</Text>

      {holder && (
        <View style={styles.rsvpBanner}>
          <Text style={styles.rsvpBannerText}>You're on the list, {holder}</Text>
        </View>
      )}

      <View style={styles.list}>
        {DRINK_ORDER.map((type) => {
          const max = event.maxByDrink[type];
          const count = tab?.counts?.[type] ?? 0;
          const remaining = Math.max(0, max - count);
          return (
            <View key={type} style={styles.card}>
              <Text style={styles.drinkName}>{DRINK_LABELS[type]}</Text>
              <Text style={[styles.drinkRemaining, remaining === 0 && styles.drinkRemainingNone]}>
                {remaining === 0 ? 'None left' : `${remaining} of ${max} left`}
              </Text>
            </View>
          );
        })}
      </View>

      <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Wallet')}>
        <Text style={styles.backText}>Back to wallet</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
    loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    brandRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 10 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 12 },
    title: { fontFamily: FONT.displayBold, fontSize: 24, color: colors.textPrimary, paddingTop: 10, textAlign: 'center' },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center', fontFamily: FONT.body },
    rsvpBanner: { marginTop: 18, borderRadius: 14, backgroundColor: 'rgba(87,227,138,0.12)', borderWidth: 1, borderColor: 'rgba(87,227,138,0.3)', padding: 14, alignItems: 'center' },
    rsvpBannerText: { color: colors.green, fontSize: 13, fontFamily: FONT.bodyBold },
    list: { gap: 12, marginTop: 24, flex: 1 },
    card: { borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    drinkName: { fontFamily: FONT.displaySemiBold, fontSize: 17, color: colors.textPrimary },
    drinkRemaining: { fontSize: 14, color: colors.lime, fontFamily: FONT.bodyBold },
    drinkRemainingNone: { color: colors.textDim },
    cta: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 16, backgroundColor: colors.lime },
    ctaText: { color: colors.ink, fontFamily: FONT.displayBold, fontSize: 15 },
    backBtn: { alignItems: 'center', paddingVertical: 20 },
    backText: { fontFamily: FONT.mono, fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
  });
}
