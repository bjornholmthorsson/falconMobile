import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { signIn } from '../services/authService';
import { useAppStore } from '../store/appStore';
import AkkuroLogo from '../components/AkkuroLogo';

export default function LoginScreen() {
  const setIsAuthenticated = useAppStore(s => s.setIsAuthenticated);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    try {
      await signIn();
      setIsAuthenticated(true);
    } catch (err: any) {
      // User cancelled — don't show an error
      if (err?.message?.includes('cancel') || err?.message?.includes('dismiss')) {
        return;
      }
      Alert.alert('Sign in failed', err?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.logoWrapper}>
        <AkkuroLogo width={206} height={36} />
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#10493C" />
      ) : (
        <TouchableOpacity style={styles.button} onPress={handleSignIn}>
          <Text style={styles.buttonText}>Sign in with Microsoft</Text>
        </TouchableOpacity>
      )}
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
  logoWrapper: { alignItems: 'center', marginBottom: 8 },
  button: {
    backgroundColor: '#10493C',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
