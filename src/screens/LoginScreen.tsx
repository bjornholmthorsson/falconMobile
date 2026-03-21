import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Clipboard,
  Linking,
} from 'react-native';
import { requestDeviceCode, pollForToken } from '../services/authService';
import { useAppStore } from '../store/appStore';

type Stage =
  | { kind: 'idle' }
  | { kind: 'waiting'; userCode: string; verificationUri: string; deviceCode: string; interval: number }
  | { kind: 'polling' };

export default function LoginScreen() {
  const setIsAuthenticated = useAppStore(s => s.setIsAuthenticated);
  const setAuthRestored = useAppStore(s => s.setAuthRestored);

  const [stage, setStage] = useState<Stage>({ kind: 'idle' });

  async function handleSignIn() {
    setStage({ kind: 'polling' }); // show spinner while requesting device code
    try {
      const info = await requestDeviceCode();
      setStage({
        kind: 'waiting',
        userCode: info.userCode,
        verificationUri: info.verificationUri,
        deviceCode: info.deviceCode,
        interval: info.interval,
      });

      await pollForToken(info.deviceCode, info.interval);

      setAuthRestored(true);
      setIsAuthenticated(true);
    } catch (err: any) {
      Alert.alert('Sign in failed', err?.message ?? 'Unknown error', [
        { text: 'OK', onPress: () => setStage({ kind: 'idle' }) },
      ]);
    }
  }

  if (stage.kind === 'polling') {
    return (
      <View style={styles.container}>
        <Logo />
        <ActivityIndicator size="large" color="#0078D4" />
        <Text style={styles.hint}>Requesting sign-in code…</Text>
      </View>
    );
  }

  if (stage.kind === 'waiting') {
    return (
      <View style={styles.container}>
        <Logo />
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>1. Copy this code:</Text>
          <TouchableOpacity onPress={() => Clipboard.setString(stage.userCode)}>
            <Text style={styles.userCode}>{stage.userCode}</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>Tap the code to copy it</Text>
        </View>
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>2. Open the browser and sign in:</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => Linking.openURL(stage.verificationUri)}>
            <Text style={styles.buttonText}>Open microsoft.com/devicelogin</Text>
          </TouchableOpacity>
        </View>
        <ActivityIndicator size="small" color="#0078D4" />
        <Text style={styles.hint}>Waiting for you to sign in…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Logo />
      <TouchableOpacity style={styles.button} onPress={handleSignIn}>
        <Text style={styles.buttonText}>Sign in with Microsoft</Text>
      </TouchableOpacity>
    </View>
  );
}

function Logo() {
  return (
    <View style={styles.logoWrapper}>
      <Text style={styles.logoText}>Falcon</Text>
      <Text style={styles.subtitle}>Five Degrees</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    padding: 32,
  },
  logoWrapper: { alignItems: 'center' },
  logoText: { fontSize: 48, fontWeight: '700', color: '#0078D4' },
  subtitle: { fontSize: 16, color: '#555', marginTop: 4 },
  button: {
    backgroundColor: '#0078D4',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  codeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  codeLabel: { fontSize: 14, color: '#666' },
  codeUrl: { fontSize: 14, color: '#0078D4', fontWeight: '600' },
  userCode: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111',
    letterSpacing: 4,
    marginVertical: 8,
  },
  hint: { fontSize: 13, color: '#888', textAlign: 'center' },
});
