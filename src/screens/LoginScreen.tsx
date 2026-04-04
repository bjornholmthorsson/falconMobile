import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { signIn } from '../services/authService';
const { version: APP_VERSION } = require('../../package.json');
import { useAppStore } from '../store/appStore';
import AkkuroLogo from '../components/AkkuroLogo';

export default function LoginScreen() {
  const setIsAuthenticated = useAppStore(s => s.setIsAuthenticated);
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

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
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff8f1" />

      {/* Top bar — floats over the hero */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <AkkuroLogo width={110} height={20} />
        <TouchableOpacity style={styles.helpBtn} onPress={() => Linking.openURL('tel:+31370767300')}>
          <Text style={styles.helpText}>Help Desk</Text>
        </TouchableOpacity>
      </View>

      {/* Hero section with overlaid badge + heading */}
      <View style={[styles.heroSection, { marginTop: insets.top + 44 }]}>
        <Image
          source={require('../assets/images/signin-hero.jpg')}
          style={styles.heroImage}
          resizeMode="cover"
        />
        {/* Gradient overlay: transparent → surface */}
        <View style={styles.heroGradient} />

        {/* Badge + heading overlaid on hero */}
        <View style={styles.heroOverlay}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>POWER TO CONNECT</Text>
          </View>
          <Text style={styles.heading}>Akkuro{'\n'}Connect</Text>
        </View>
      </View>

      {/* Content card — overlaps hero with rounded top */}
      <View style={styles.contentCard}>
        <View style={styles.dragHandle} />

        <Text style={styles.subtitle}>
          Collaborate with colleagues and be a part of the success!
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color="#006559" style={styles.loader} />
        ) : (
          <TouchableOpacity style={styles.button} onPress={handleSignIn} activeOpacity={0.85}>
            <Icon name="microsoft-teams" size={22} color="#fff" />
            <Text style={styles.buttonText}>Sign in with Teams</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.footerAppName}>Akkuro Connect</Text>
          <Text style={styles.footerCopyright}>© 2024 Akkuro Connect.</Text>
          <Text style={styles.footerVersion}>v{APP_VERSION}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const PRIMARY = '#006559';
const PRIMARY_DARK = '#004d44';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fbf3e7',
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12, // overridden inline with insets.top
    paddingBottom: 12,
    backgroundColor: 'rgba(255, 248, 241, 0.9)',
  },
  helpBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  helpText: {
    fontSize: 14,
    fontWeight: '700',
    color: PRIMARY,
    letterSpacing: -0.2,
  },

  // Hero
  heroSection: {
    height: 420,
    width: '100%',
    marginTop: 0, // overridden inline
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    // Simulated gradient: transparent → surface colour
    backgroundColor: 'transparent',
    // React Native doesn't support gradient natively; use a semi-transparent overlay
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 60,
    left: 28,
    right: 28,
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 16,
    padding: 16,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: `${PRIMARY}e6`,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  heading: {
    fontSize: 42,
    fontWeight: '800',
    color: '#1e1b14',
    lineHeight: 46,
    letterSpacing: -0.5,
  },

  // Content card
  contentCard: {
    backgroundColor: '#fbf3e7',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -40,
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 20,
    gap: 20,
  },
  dragHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#bdc9c5',
    alignSelf: 'center',
    marginBottom: 16,
    opacity: 0.5,
  },
  subtitle: {
    fontSize: 17,
    color: '#3e4946',
    lineHeight: 26,
    fontWeight: '400',
  },
  loader: {
    marginTop: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY,
    borderRadius: 50,
    paddingVertical: 18,
    gap: 10,
    shadowColor: PRIMARY_DARK,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  // Footer
  footer: {
    backgroundColor: '#fbf3e7',
    paddingHorizontal: 28,
    paddingBottom: 24,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  footerAppName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e1b14',
    letterSpacing: -0.2,
  },
  footerCopyright: {
    fontSize: 12,
    color: 'rgba(30,27,20,0.4)',
    marginTop: 2,
    fontWeight: '500',
  },
  footerVersion: {
    fontSize: 11,
    color: 'rgba(30,27,20,0.35)',
    marginTop: 2,
    fontWeight: '400',
  },
  footerLinks: {
    alignItems: 'flex-end',
  },
  footerLinkText: {
    fontSize: 13,
    color: '#3e4946',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
