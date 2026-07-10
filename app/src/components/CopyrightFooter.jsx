import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { FONT } from '../fonts.js';

export default function CopyrightFooter({ colors }) {
  const styles = createStyles(colors);
  return <Text style={styles.text}>Copyright 2026 ThrusPass Pty Ltd. All rights reserved.</Text>;
}

function createStyles(colors) {
  return StyleSheet.create({
    text: { fontSize: 11, color: colors.textSecondary, textAlign: 'center', paddingTop: 16, paddingBottom: 8, fontFamily: FONT.body },
  });
}
