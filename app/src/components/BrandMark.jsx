import React from 'react';
import { View, Pressable, StyleSheet, Linking } from 'react-native';
import { SITE_URL } from '../api.js';

// The Thru Pass mark — a lime rounded-square with a tap/NFC arc — mirrors
// the same shape used on the landing page and the Client kiosk. Tapping it
// anywhere in the app goes back to the landing page, like a home button.
export default function BrandMark({ colors, size = 32 }) {
  const styles = createStyles(colors, size);
  return (
    <Pressable onPress={() => Linking.openURL(`${SITE_URL}/`)} hitSlop={8}>
      <View style={styles.mark}>
        <View style={styles.arc} />
      </View>
    </Pressable>
  );
}

function createStyles(colors, size) {
  return StyleSheet.create({
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
