import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, TextInput, Linking, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import { api } from '../api.js';
import { getStoredAccountId, clearStoredAccountId, getLinkedEntry } from '../session.js';
import ProfileHeader from '../components/ProfileHeader.jsx';
import ProfileTabBar from '../components/ProfileTabBar.jsx';

export default function MyThruBalanceScreen({ navigation, route }) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [mode]);
  const accountId = route?.params?.accountId || getStoredAccountId();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cashAction, setCashAction] = useState(null); // null | 'load' | 'payout'
  const [amountInput, setAmountInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [cashError, setCashError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [pendingTopup, setPendingTopup] = useState(null); // { topupId } while waiting on Peach
  const pollTimer = useRef(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    try {
      const data = await api.getAccount(accountId);
      if (data.error) {
        setLoadError('Could not find that account.');
        return;
      }
      setAccount(data);
      setLoadError(null);
    } catch {
      setLoadError('Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (!accountId) {
      navigation.replace('CreateAccount');
      return;
    }
    load();
  }, [accountId, load, navigation]);

  function switchAccount() {
    clearStoredAccountId();
    navigation.replace('CreateAccount');
  }

  if (!accountId) {
    return <SafeAreaView style={styles.loadingScreen} />;
  }

  function openCashAction(type) {
    setCashAction(type);
    setAmountInput('');
    setCashError(null);
    setPendingTopup(null);
  }

  function stopPolling() {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }

  const pollTopupStatus = useCallback(
    async (topupId) => {
      try {
        const result = await api.getTopupStatus(topupId);
        if (result.status === 'completed') {
          stopPolling();
          await load();
          setPendingTopup(null);
          setCashAction(null);
          return;
        }
        if (result.status === 'failed') {
          stopPolling();
          setPendingTopup(null);
          setCashError('Payment failed — your card was not charged. Try again.');
          return;
        }
      } catch {
        // transient network hiccup — keep polling, the return page and
        // webhook are the sources of truth, not this one request.
      }
      pollTimer.current = setTimeout(() => pollTopupStatus(topupId), 3000);
    },
    [load]
  );

  useEffect(() => stopPolling, []);

  // If the shopper switches back to the app after paying in the external
  // browser, check immediately rather than waiting for the next tick.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pendingTopup) {
        pollTopupStatus(pendingTopup.topupId);
      }
    });
    return () => sub.remove();
  }, [pendingTopup, pollTopupStatus]);

  async function confirmCashAction() {
    const cents = Math.round(parseFloat(amountInput) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setCashError('Enter a valid amount.');
      return;
    }
    if (cashAction === 'payout' && cents > account.balanceCents) {
      setCashError('That’s more than your current balance.');
      return;
    }
    setProcessing(true);
    setCashError(null);
    try {
      if (cashAction === 'load') {
        const checkout = await api.createTopupCheckout(accountId, cents);
        if (checkout.error || !checkout.redirectUrl) {
          setCashError('Could not start payment. Try again.');
          return;
        }
        setPendingTopup({ topupId: checkout.topupId });
        await Linking.openURL(checkout.redirectUrl);
        pollTimer.current = setTimeout(() => pollTopupStatus(checkout.topupId), 3000);
      } else {
        await api.cashout(accountId, cents);
        await load();
        setCashAction(null);
      }
    } catch {
      setCashError('Could not reach the server. Try again.');
    } finally {
      setProcessing(false);
    }
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <Text style={[styles.error, { textAlign: 'center', marginBottom: 16 }]}>{loadError}</Text>
        <Pressable style={[styles.cta, { marginBottom: 12 }]} onPress={() => { setLoading(true); load(); }}>
          <Text style={styles.ctaText}>Try again</Text>
        </Pressable>
        <Pressable onPress={switchAccount}>
          <Text style={styles.backLinkText}>Log out</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading || !account) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={colors.lime} />
      </SafeAreaView>
    );
  }

  const rand = (account.balanceCents / 100).toFixed(2);
  const [whole, cents] = rand.split('.');

  const linkedEntry = getLinkedEntry();
  function goToLinkedEvent() {
    if (!linkedEntry) return;
    if (linkedEntry.type === 'barTabEvent') {
      navigation.navigate('BarTabMenu', { barTabEventId: linkedEntry.id });
    } else {
      navigation.navigate('Tickets', { accountId });
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ProfileHeader colors={colors} holder={account.holder} onLogout={switchAccount} />
      <ProfileTabBar active="balance" navigation={navigation} accountId={accountId} colors={colors} />

      <Text style={styles.pageTitle}>My Thru Balance Wallet</Text>

      <LinearGradient colors={mode === 'dark' ? ['#1A1D22', '#141619'] : ['#FFFFFF', '#F0F1F3']} style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Thru balance · cashless</Text>
        <Text style={styles.balanceAmount}>
          R {whole}
          <Text style={styles.balanceCents}>.{cents}</Text>
        </Text>
        <View style={styles.balanceActions}>
          <Pressable style={styles.topUpBtn} onPress={() => openCashAction('load')}>
            <Text style={styles.topUpText}>Top up</Text>
          </Pressable>
          <Pressable style={styles.cashOutBtn} onPress={() => openCashAction('payout')}>
            <Text style={styles.cashOutText}>Cash out</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <Modal
        visible={cashAction !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { stopPolling(); setPendingTopup(null); setCashAction(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {cashAction === 'load' && pendingTopup ? (
              <>
                <Text style={styles.modalTitle}>Waiting for payment</Text>
                <Text style={styles.modalSubtitle}>
                  Complete your card payment in the browser tab that just opened, then come back here.
                </Text>
                <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 20 }}>
                  <ActivityIndicator color={colors.lime} />
                </View>
                {cashError ? <Text style={styles.error}>{cashError}</Text> : null}
                <Pressable style={styles.cta} onPress={() => pollTopupStatus(pendingTopup.topupId)}>
                  <Text style={styles.ctaText}>I've paid — check now</Text>
                </Pressable>
                <Pressable
                  style={styles.modalCancel}
                  onPress={() => { stopPolling(); setPendingTopup(null); setCashAction(null); }}
                >
                  <Text style={styles.backLinkText}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>{cashAction === 'load' ? 'Top up wallet' : 'Cash out'}</Text>
                <Text style={styles.modalSubtitle}>
                  {cashAction === 'load'
                    ? 'Pay by card via Peach Payments to add funds to your Thru balance.'
                    : 'Reimburse cash from your remaining Thru balance.'}
                </Text>
                <TextInput
                  value={amountInput}
                  onChangeText={setAmountInput}
                  placeholder="100.00"
                  placeholderTextColor={colors.textDim}
                  keyboardType="decimal-pad"
                  style={styles.modalInput}
                  autoFocus
                />
                {cashError ? <Text style={styles.error}>{cashError}</Text> : null}
                <Pressable style={styles.cta} onPress={confirmCashAction} disabled={processing}>
                  {processing ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : (
                    <Text style={styles.ctaText}>{cashAction === 'load' ? 'Pay by card' : 'Confirm cash out'}</Text>
                  )}
                </Pressable>
                <Pressable style={styles.modalCancel} onPress={() => setCashAction(null)}>
                  <Text style={styles.backLinkText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      <View style={{ flex: 1 }} />

      {linkedEntry && (
        <Pressable style={styles.linkedEventBtn} onPress={goToLinkedEvent}>
          <Text style={styles.linkedEventBtnText}>Go to linked event →</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
    loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    pageTitle: { fontFamily: FONT.displayBold, fontSize: 20, color: colors.textPrimary, paddingTop: 8, paddingBottom: 16 },
    balanceCard: { borderRadius: 20, padding: 18, marginBottom: 18, borderWidth: 1, borderColor: colors.borderSoft },
    balanceLabel: { fontSize: 11, letterSpacing: 1.4, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 8, fontFamily: FONT.body },
    balanceAmount: { fontFamily: FONT.displayBold, fontSize: 34, color: colors.textPrimary },
    balanceCents: { fontSize: 20, color: colors.textSecondary, fontFamily: FONT.displaySemiBold },
    balanceActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    topUpBtn: { flex: 1, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.lime, alignItems: 'center' },
    topUpText: { color: colors.ink, fontFamily: FONT.bodyBold, fontSize: 13 },
    cashOutBtn: { flex: 1, paddingVertical: 10, borderRadius: 999, backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center' },
    cashOutText: { color: colors.textMid, fontFamily: FONT.bodyBold, fontSize: 13 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    modalCard: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.borderSoft, padding: 22 },
    modalTitle: { fontFamily: FONT.displayBold, fontSize: 19, color: colors.textPrimary },
    modalSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 6, fontFamily: FONT.body },
    modalInput: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: FONT.body,
      marginTop: 16,
    },
    modalCancel: { alignItems: 'center', paddingVertical: 14 },
    error: { color: colors.redLight, fontSize: 13, marginTop: 10, fontFamily: FONT.body },
    cta: { padding: 17, borderRadius: 16, backgroundColor: colors.lime, alignItems: 'center', marginBottom: 8 },
    ctaText: { color: colors.ink, fontFamily: FONT.displayBold, fontSize: 16 },
    backLinkText: { color: colors.textSecondary, fontSize: 13, fontFamily: FONT.body, textDecorationLine: 'underline' },
    linkedEventBtn: { padding: 15, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center', marginBottom: 8 },
    linkedEventBtnText: { color: colors.textMid, fontFamily: FONT.bodyBold, fontSize: 14 },
  });
}
