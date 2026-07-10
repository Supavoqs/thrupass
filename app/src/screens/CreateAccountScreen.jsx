import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, ScrollView, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import { api, SITE_URL } from '../api.js';
import { getStoredAccountId, setStoredAccountId, setLinkedEntry } from '../session.js';
import BrandMark from '../components/BrandMark.jsx';

// A shared event link looks like https://thrupass.co.za/app/?event=evt_xxx —
// web-only, since that's the only way this app is currently distributed.
function getSharedEventIdFromUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('event');
  } catch {
    return null;
  }
}

const ADD_ON_LABELS = { COOLER: 'Add cooler', PARKING: 'Add parking' };

// Platform default prices — only a fallback for events created before
// per-event pricing existed; the server sends each event's own admin-set
// prices on the event object itself.
const DEFAULT_PRICES_CENTS = { GA: 25000, VIP: 40000, VVIP: 80000, PARKING: 5000, COOLER: 10000 };

function fmtPrice(cents) {
  return `R${(cents / 100).toFixed(0)}`;
}

const ERROR_MESSAGES = {
  holder_required: 'Enter your name to continue.',
  valid_email_required: 'Enter a valid email address.',
  password_too_short: 'Password must be at least 6 characters.',
  email_already_registered: 'That email is already registered — log in instead.',
  email_and_password_required: 'Enter your email and password.',
  invalid_credentials: 'Incorrect email or password.',
};

export default function CreateAccountScreen({ navigation, route }) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [mode]);
  const hasExistingSession = !!getStoredAccountId();
  const [authMode, setAuthMode] = useState('signup'); // signup | login
  const [holder, setHolder] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState(null);
  const [tier, setTier] = useState(null);
  const [addOns, setAddOns] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listEvents()
      .then((list) => {
        if (Array.isArray(list)) {
          setEvents(list);
          const sharedEventId = getSharedEventIdFromUrl();
          if (sharedEventId && list.some((e) => e.id === sharedEventId)) {
            setEventId(sharedEventId);
          }
        }
      })
      .catch(() => {});
  }, []);

  const selectedEvent = events.find((e) => e.id === eventId) || null;
  const prices = { ...DEFAULT_PRICES_CENTS, ...(selectedEvent?.prices || {}) };
  const totalCents = tier
    ? (prices[tier] || 0) + addOns.reduce((sum, a) => sum + (prices[a] || 0), 0)
    : 0;

  function toggleAddOn(value) {
    setAddOns((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  const onSubmit = async () => {
    if (authMode === 'signup' && !holder.trim()) {
      setError('Enter your name to continue.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (authMode === 'signup' && eventId && !tier) {
      setError('Pick a ticket tier for the selected event.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const account =
        authMode === 'signup'
          ? await api.createAccount(holder.trim(), email.trim(), password, eventId || undefined, tier || undefined, addOns)
          : await api.loginAccount(email.trim(), password);
      if (account.error) {
        setError(ERROR_MESSAGES[account.error] || 'Something went wrong. Try again.');
        return;
      }
      setStoredAccountId(account.id);
      const barTabEventId = route?.params?.barTabEventId;
      if (authMode === 'signup') {
        if (barTabEventId) {
          setLinkedEntry({ type: 'barTabEvent', id: barTabEventId });
        } else if (eventId) {
          setLinkedEntry({ type: 'event', id: eventId });
        }
      }
      if (barTabEventId) {
        navigation.replace('BarTabMenu', { barTabEventId });
      } else {
        navigation.replace('Wallet', { accountId: account.id });
      }
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.brandCorner}>
        <BrandMark colors={colors} size={30} />
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>
            {authMode === 'login' ? 'Log in' : hasExistingSession ? 'Create account' : 'Welcome to Thru Pass'}
          </Text>
          <Text style={styles.subtitle}>
            {authMode === 'login'
              ? 'Log in to your Thru Pass wallet.'
              : hasExistingSession
              ? 'Set up another Thru Pass wallet to get started.'
              : 'Register to set up your cashless wallet and pick an event to attend.'}
          </Text>
        </View>

        <View style={styles.form}>
          {authMode === 'signup' && (
            <>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                value={holder}
                onChangeText={setHolder}
                placeholder="Jane Dlamini"
                placeholderTextColor={colors.textDim}
                style={styles.input}
                autoCapitalize="words"
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="jane@example.com"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <View style={{ justifyContent: 'center' }}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textDim}
              style={[styles.input, { paddingRight: 64 }]}
              autoCapitalize="none"
              secureTextEntry={!showPassword}
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.showPasswordBtn}>
              <Text style={styles.showPasswordText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>

          {authMode === 'signup' && events.length > 0 && (
            <>
              <Text style={styles.label}>Featured Events</Text>
              <View style={styles.chipRow}>
                {events.map((ev) => (
                  <Pressable
                    key={ev.id}
                    onPress={() => { setEventId(eventId === ev.id ? null : ev.id); setTier(null); setAddOns([]); }}
                    style={[styles.chip, eventId === ev.id && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, eventId === ev.id && styles.chipTextActive]}>{ev.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {authMode === 'signup' && selectedEvent && (
            <>
              <Text style={styles.label}>Ticket tier</Text>
              <View style={styles.chipRow}>
                {selectedEvent.tiers.map((t) => (
                  <Pressable key={t} onPress={() => setTier(t)} style={[styles.chip, tier === t && styles.chipActive]}>
                    <Text style={[styles.chipText, tier === t && styles.chipTextActive]}>{t} — {fmtPrice(prices[t] || 0)}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {authMode === 'signup' && selectedEvent && selectedEvent.addOns?.length > 0 && (
            <>
              <Text style={styles.label}>Add-ons (optional)</Text>
              <View style={styles.chipRow}>
                {selectedEvent.addOns.map((a) => (
                  <Pressable key={a} onPress={() => toggleAddOn(a)} style={[styles.chip, addOns.includes(a) && styles.chipActive]}>
                    <Text style={[styles.chipText, addOns.includes(a) && styles.chipTextActive]}>
                      {ADD_ON_LABELS[a] || a} — {fmtPrice(prices[a] || 0)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {authMode === 'signup' && tier && (
            <Text style={styles.totalText}>Total: {fmtPrice(totalCents)}</Text>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={{ flex: 1, minHeight: 24 }} />

        <Pressable style={styles.cta} onPress={onSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.ctaText}>{authMode === 'login' ? 'Log in →' : 'Create account →'}</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.backLink}
          onPress={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setError(null); }}
        >
          <Text style={styles.backLinkText}>
            {authMode === 'signup' ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
          </Text>
        </Pressable>

        {hasExistingSession && (
          <Pressable style={styles.backLink} onPress={() => navigation.navigate('Wallet')}>
            <Text style={styles.backLinkText}>Back to wallet</Text>
          </Pressable>
        )}

        <Pressable style={styles.backLink} onPress={() => Linking.openURL(`${SITE_URL}/`)}>
          <Text style={styles.backLinkText}>Return home</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  brandCorner: { position: 'absolute', top: 16, right: 20, zIndex: 10 },
  header: { paddingTop: 24, paddingBottom: 8, paddingRight: 130 },
  title: { fontFamily: FONT.displayBold, fontSize: 26, color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 8, fontFamily: FONT.body },
  form: { marginTop: 28, gap: 8 },
  label: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textSecondary, marginTop: 16, fontFamily: FONT.body },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: FONT.body,
  },
  showPasswordBtn: { position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 12 },
  showPasswordText: { color: colors.textSecondary, fontSize: 12, fontFamily: FONT.bodyBold },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  chipActive: { backgroundColor: colors.lime, borderColor: colors.lime },
  chipText: { color: colors.textMid, fontSize: 13, fontFamily: FONT.bodySemiBold },
  chipTextActive: { color: colors.ink },
  totalText: { fontSize: 15, color: colors.lime, marginTop: 16, fontFamily: FONT.bodyBold },
  error: { color: colors.redLight, fontSize: 13, marginTop: 14, fontFamily: FONT.body },
  cta: { padding: 17, borderRadius: 16, backgroundColor: colors.lime, alignItems: 'center', marginTop: 16 },
  ctaText: { color: colors.ink, fontFamily: FONT.displayBold, fontSize: 16 },
  backLink: { alignItems: 'center', paddingVertical: 20 },
  backLinkText: { color: colors.textSecondary, fontSize: 13, fontFamily: FONT.body, textDecorationLine: 'underline' },
  });
}
