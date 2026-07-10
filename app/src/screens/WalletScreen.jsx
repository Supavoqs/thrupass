import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import { api } from '../api.js';
import { getStoredAccountId, clearStoredAccountId, getLinkedEntry } from '../session.js';
import ProfileHeader from '../components/ProfileHeader.jsx';
import ProfileTabBar from '../components/ProfileTabBar.jsx';

export default function WalletScreen({ navigation, route }) {
  const { colors, mode, toggle } = useTheme();
  const styles = useMemo(() => createStyles(colors), [mode]);
  const accountId = route?.params?.accountId || getStoredAccountId();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

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
      <ProfileHeader colors={colors} mode={mode} toggle={toggle} holder={account.holder} onLogout={switchAccount} />
      <ProfileTabBar active="wallet" navigation={navigation} accountId={accountId} colors={colors} />

      <View style={{ flex: 1 }} />

      {linkedEntry && (
        <Pressable style={styles.linkedEventBtn} onPress={goToLinkedEvent}>
          <Text style={styles.linkedEventBtnText}>Go to linked event →</Text>
        </Pressable>
      )}

      <Pressable style={styles.cta} onPress={() => navigation.navigate('TapToEnter', { tagUid: account.tag?.uid })}>
        <Text style={styles.ctaText}>Tap to enter →</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
    loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    error: { color: colors.redLight, fontSize: 13, marginTop: 10, fontFamily: FONT.body },
    cta: { padding: 17, borderRadius: 16, backgroundColor: colors.lime, alignItems: 'center', marginBottom: 8 },
    ctaText: { color: colors.ink, fontFamily: FONT.displayBold, fontSize: 16 },
    linkedEventBtn: { padding: 15, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center', marginBottom: 8 },
    linkedEventBtnText: { color: colors.textMid, fontFamily: FONT.bodyBold, fontSize: 14 },
    backLinkText: { color: colors.textSecondary, fontSize: 13, fontFamily: FONT.body, textDecorationLine: 'underline' },
  });
}
