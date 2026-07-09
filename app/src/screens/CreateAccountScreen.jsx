import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme.js';
import { FONT } from '../fonts.js';
import { api } from '../api.js';

export default function CreateAccountScreen({ navigation }) {
  const [holder, setHolder] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async () => {
    if (!holder.trim()) {
      setError('Enter your name to continue.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const account = await api.createAccount(holder.trim(), email.trim() || undefined);
      if (account.error) {
        setError('Something went wrong. Try again.');
        return;
      }
      navigation.replace('Wallet', { accountId: account.id });
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Set up your Thru Pass wallet to get started.</Text>
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

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={{ flex: 1 }} />

      <Pressable style={styles.cta} onPress={onSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.ctaText}>Create account →</Text>}
      </Pressable>

      <Pressable style={styles.backLink} onPress={() => navigation.navigate('Wallet')}>
        <Text style={styles.backLinkText}>Back to wallet</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  error: { color: colors.redLight, fontSize: 13, marginTop: 14, fontFamily: FONT.body },
  cta: { padding: 17, borderRadius: 16, backgroundColor: colors.lime, alignItems: 'center' },
  ctaText: { color: colors.ink, fontFamily: FONT.displayBold, fontSize: 16 },
  backLink: { alignItems: 'center', paddingVertical: 20 },
  backLinkText: { color: colors.textSecondary, fontSize: 13, fontFamily: FONT.body, textDecorationLine: 'underline' },
});
