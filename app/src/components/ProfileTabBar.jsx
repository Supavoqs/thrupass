import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FONT } from '../fonts.js';

const TABS = [
  { key: 'wallet', label: 'Wallet', screen: 'Wallet' },
  { key: 'balance', label: 'My Thru Balance', screen: 'MyThruBalance' },
  { key: 'tickets', label: 'My Tickets', screen: 'Tickets' },
  { key: 'browse', label: 'Browse Other Events', screen: 'BrowseEvents' },
];

export default function ProfileTabBar({ active, navigation, accountId, colors }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.tabBar}>
      {TABS.map((t) => {
        const isActive = active === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => { if (!isActive) navigation.navigate(t.screen, { accountId }); }}
            style={[styles.tabItem, isActive && styles.tabItemActive]}
          >
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    tabBar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingBottom: 16,
      marginBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    tabItem: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    tabItemActive: { backgroundColor: colors.lime, borderColor: colors.lime },
    tabText: { fontSize: 12, color: colors.textMid, fontFamily: FONT.bodyBold, textAlign: 'center' },
    tabTextActive: { color: colors.ink },
  });
}
