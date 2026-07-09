import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FONT } from '../fonts.js';

function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function ProfileHeader({ colors, mode, toggle, holder, onLogout }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.header}>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.welcomeLabel}>Welcome back</Text>
        <Text style={styles.name} numberOfLines={1}>{holder}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={toggle} style={styles.themeToggle}>
          <Text style={styles.themeToggleText}>{mode === 'dark' ? '☀️' : '🌙'}</Text>
        </Pressable>
        <LinearGradient colors={[colors.lime, colors.cyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(holder)}</Text>
        </LinearGradient>
        <Pressable onPress={onLogout}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, gap: 12 },
    welcomeLabel: { fontSize: 12, color: colors.textSecondary, fontFamily: FONT.body },
    name: { fontFamily: FONT.displaySemiBold, fontSize: 20, color: colors.textPrimary },
    themeToggle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' },
    themeToggleText: { fontSize: 15 },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: FONT.bodyExtraBold, color: colors.ink, fontSize: 15 },
    logoutText: { color: colors.textSecondary, fontSize: 12, fontFamily: FONT.body, textDecorationLine: 'underline' },
  });
}
