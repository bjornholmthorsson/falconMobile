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

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const setIsAuthenticated = useAppStore(s => s.setIsAuthenticated);
  const setAuthRestored = useAppStore(s => s.setAuthRestored);

  async function handleSignIn() {
    setLoading(true);
    try {
      await signIn();
      setLoading(false);
      setAuthRestored(true);
      setIsAuthenticated(true);
    } catch (err: any) {
      Alert.alert('Sign in failed', err?.message ?? 'Unknown error');
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.logoWrapper}>
        <Text style={styles.logoText}>Falcon</Text>
        <Text style={styles.subtitle}>Five Degrees</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0078D4" />
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
    gap: 32,
  },
  logoWrapper: {
    alignItems: 'center',
  },
  logoText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#0078D4',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#0078D4',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
