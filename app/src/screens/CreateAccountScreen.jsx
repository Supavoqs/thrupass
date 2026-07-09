import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import { api } from '../api.js';
import { getStoredAccountId, setStoredAccountId } from '../session.js';

export default function CreateAccountScreen({ navigation }) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [mode]);
  const hasExistingSession = !!getStoredAccountId();
  const [holder, setHolder] = useState('');
  const [email, setEmail] = useState('');
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState(null);
  const [tier, setTier] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listEvents().then((list) => {
      if (Array.isArray(list)) setEvents(list);
    });
  }, []);

  const selectedEvent = events.find((e) => e.id === eventId) || null;

  const onSubmit = async () => {
    if (!holder.trim()) {
      setError('Enter your name to continue.');
      return;
    }
    if (eventId && !tier) {
      setError('Pick a ticket tier for the selected event.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const account = await api.createAccount(holder.trim(), email.trim() || undefined, eventId || undefined, tier || undefined);
      if (account.error) {
        setError('Something went wrong. Try again.');
        return;
      }
      setStoredAccountId(account.id);
      navigation.replace('Wallet', { accountId: account.id });
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>{hasExistingSession ? 'Create account' : 'Welcome to Thru Pass'}</Text>
          <Text style={styles.subtitle}>
            {hasExistingSession
              ? 'Set up another Thru Pass wallet to get started.'
              : 'Register to set up your cashless wallet and pick an event to attend.'}
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            value={holder}
            onChangeText={setHolder}
            placeholder="Jane Dlamini"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Email (optional)</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="jane@example.com"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {events.length > 0 && (
            <>
              <Text style={styles.label}>Event (optional — issues a ticket)</Text>
              <View style={styles.chipRow}>
                {events.map((ev) => (
                  <Pressable
                    key={ev.id}
                    onPress={() => { setEventId(eventId === ev.id ? null : ev.id); setTier(null); }}
                    style={[styles.chip, eventId === ev.id && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, eventId === ev.id && styles.chipTextActive]}>{ev.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {selectedEvent && (
            <>
              <Text style={styles.label}>Ticket tier</Text>
              <View style={styles.chipRow}>
                {selectedEvent.tiers.map((t) => (
                  <Pressable key={t} onPress={() => setTier(t)} style={[styles.chip, tier === t && styles.chipActive]}>
                    <Text style={[styles.chipText, tier === t && styles.chipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={{ flex: 1, minHeight: 24 }} />

        <Pressable style={styles.cta} onPress={onSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.ctaText}>Create account →</Text>}
        </Pressable>

        {hasExistingSession && (
          <Pressable style={styles.backLink} onPress={() => navigation.navigate('Wallet')}>
            <Text style={styles.backLinkText}>Back to wallet</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  header: { paddingTop: 24, paddingBottom: 8 },
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
  error: { color: colors.redLight, fontSize: 13, marginTop: 14, fontFamily: FONT.body },
  cta: { padding: 17, borderRadius: 16, backgroundColor: colors.lime, alignItems: 'center', marginTop: 16 },
  ctaText: { color: colors.ink, fontFamily: FONT.displayBold, fontSize: 16 },
  backLink: { alignItems: 'center', paddingVertical: 20 },
  backLinkText: { color: colors.textSecondary, fontSize: 13, fontFamily: FONT.body, textDecorationLine: 'underline' },
  });
}
