import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FONT } from '../fonts.js';

const TABS = [
  { key: 'wallet', label: 'Wallet', screen: 'Wallet' },
  { key: 'tickets', label: 'My Tickets', screen: 'Tickets' },
  { key: 'browse', label: 'Browse Other Events', screen: 'BrowseEvents' },
];

export default function ProfileTabBar({ active, navigation, accountId, colors }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.bottomNav}>
      {TABS.map((t) => (
        <Pressable
          key={t.key}
          onPress={() => { if (active !== t.key) navigation.navigate(t.screen, { accountId }); }}
          style={styles.navItemWrap}
        >
          <Text style={[styles.navItem, active === t.key && styles.navItemActive]}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    bottomNav: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-around',
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
      gap: 10,
    },
    navItemWrap: { minWidth: 80, alignItems: 'center' },
    navItem: { fontSize: 11, color: colors.textDim, fontFamily: FONT.bodyBold, textAlign: 'center' },
    navItemActive: { color: colors.lime },
  });
}
