import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { SITE_URL } from '../api.js';
import { FONT } from '../fonts.js';

// The Thru Pass brand — the THRUPASS wordmark plus the lime rounded-square
// tap/NFC mark, mirroring the landing page's hero brand. Tapping it anywhere
// in the app goes back to the landing page, like a home button.
export default function BrandMark({ colors, size = 32 }) {
  const styles = createStyles(colors, size);
  return (
    <Pressable onPress={() => Linking.openURL(`${SITE_URL}/`)} hitSlop={8} style={styles.row}>
      <Text style={styles.wordmark}>THRUPASS</Text>
      <View style={styles.mark}>
        <View style={styles.arc} />
      </View>
    </Pressable>
  );
}

function createStyles(colors, size) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    wordmark: { fontFamily: FONT.displayBold, fontSize: size * 0.42, letterSpacing: 1.5, color: colors.textPrimary },
    mark: {
      width: size,
      height: size,
      borderRadius: size * 0.27,
      backgroundColor: colors.lime,
      alignItems: 'center',
      justifyContent: 'center',
    },
    arc: {
      width: size * 0.4,
      height: size * 0.4,
      borderRadius: size * 0.4,
      borderWidth: size * 0.1,
      borderColor: colors.ink,
      borderRightColor: 'transparent',
      transform: [{ rotate: '-45deg' }],
    },
  });
}
