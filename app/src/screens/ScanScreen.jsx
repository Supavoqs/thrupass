import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../ThemeContext.jsx';
import { FONT } from '../fonts.js';
import BrandMark from '../components/BrandMark.jsx';

export default function ScanScreen({ navigation }) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [mode]);
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  function onBarcodeScanned({ data }) {
    if (scannedRef.current || !data) return;
    scannedRef.current = true;
    navigation.replace('TapToEnter', { tagUid: data });
  }

  if (!permission) {
    return <SafeAreaView style={styles.screen} edges={['top', 'bottom']} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.brandCorner}>
          <BrandMark colors={colors} size={30} />
        </View>
        <View style={styles.centerBlock}>
          <Text style={styles.title}>Camera access needed</Text>
          <Text style={styles.subtitle}>Thru Pass needs your camera to scan a QR code at the gate.</Text>
          <Pressable style={styles.cta} onPress={requestPermission}>
            <Text style={styles.ctaText}>Grant camera access</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.brandCorner}>
        <BrandMark colors={colors} size={30} />
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Scan to enter</Text>
        <Text style={styles.subtitle}>Point your camera at the gate's QR code</Text>
      </View>
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onBarcodeScanned}
        />
        <View style={styles.frame} pointerEvents="none" />
      </View>
      <Pressable style={styles.backLink} onPress={() => navigation.navigate('MyThruBalance')}>
        <Text style={styles.backLinkText}>Back to wallet</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
    brandCorner: { position: 'absolute', top: 16, right: 20, zIndex: 10 },
    centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
    header: { paddingTop: 24, paddingBottom: 16, alignItems: 'center' },
    title: { fontFamily: FONT.displayBold, fontSize: 22, color: colors.textPrimary, textAlign: 'center' },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center', fontFamily: FONT.body },
    cameraWrap: { flex: 1, borderRadius: 22, overflow: 'hidden', backgroundColor: '#000', marginBottom: 16 },
    frame: { position: 'absolute', top: '20%', left: '12%', right: '12%', bottom: '20%', borderWidth: 2, borderColor: colors.lime, borderRadius: 16 },
    cta: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 16, backgroundColor: colors.lime },
    ctaText: { color: colors.ink, fontFamily: FONT.displayBold, fontSize: 15 },
    backLink: { alignItems: 'center', paddingVertical: 20 },
    backLinkText: { color: colors.textSecondary, fontSize: 13, fontFamily: FONT.body, textDecorationLine: 'underline' },
  });
}
