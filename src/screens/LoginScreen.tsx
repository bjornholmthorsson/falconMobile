import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
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
      {/* Content sits above the vertical centre */}
      <View style={styles.content}>
        <Image
          source={require('../assets/images/login-hero.webp')}
          style={styles.heroImage}
          resizeMode="contain"
        />
        <Text style={styles.appName}>Akkuro Mobile</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#10493C" />
        ) : (
          <TouchableOpacity style={styles.button} onPress={handleSignIn}>
            <Text style={styles.buttonText}>Sign in</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Logo pinned to the bottom */}
      <View style={styles.logoContainer}>
        <AkkuroLogo width={150} height={27} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 20,
    marginBottom: 80,
  },
  heroImage: {
    width: 280,
    height: 280,
  },
  appName: {
    fontSize: 34,
    fontWeight: '700',
    color: '#10493C',
    letterSpacing: 0.5,
  },
  button: {
    backgroundColor: '#10493C',
    paddingHorizontal: 40,
    paddingVertical: 11,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  logoContainer: {
    position: 'absolute',
    bottom: 48,
    alignItems: 'center',
  },
});
