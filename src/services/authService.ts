/**
 * Microsoft Authentication (MSAL) service using react-native-app-auth.
 *
 * Client ID and redirect URIs match the existing Xamarin app so the same
 * Azure AD app registration is reused without any changes.
 */
import { authorize, refresh, revoke } from 'react-native-app-auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CLIENT_ID = '3639c730-2334-44d6-9350-1cb2748da8d8';
const TENANT_ID = 'common'; // multi-tenant / personal accounts

const ANDROID_REDIRECT =
  'msauth://com.fivedegrees.falcon.android/zWGXAZw9GT48zs%2Bu2V1%2BioBSM0o%3D';
const IOS_REDIRECT = 'msauth.FDS.FD-CommunicatorUITests://auth';

const SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'User.Read',
  'User.Read.All',
  'Presence.Read',
  'Presence.Read.All',
  'ChatMessage.Send',
  'Chat.ReadWrite',
];

const AUTH_CONFIG = {
  issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
  clientId: CLIENT_ID,
  redirectUrl: Platform.OS === 'ios' ? IOS_REDIRECT : ANDROID_REDIRECT,
  scopes: SCOPES,
  additionalParameters: {},
  serviceConfiguration: {
    authorizationEndpoint: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    revocationEndpoint: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/logout`,
  },
};

const STORAGE_KEYS = {
  ACCESS_TOKEN: '@falcon/accessToken',
  REFRESH_TOKEN: '@falcon/refreshToken',
  TOKEN_EXPIRY: '@falcon/tokenExpiry',
};

// ── Public API ────────────────────────────────────────────────────────────────

export async function signIn(): Promise<string> {
  const result = await authorize(AUTH_CONFIG);
  await storeTokens(result.accessToken, result.refreshToken, result.accessTokenExpirationDate);
  return result.accessToken;
}

export async function signOut(): Promise<void> {
  const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  if (refreshToken) {
    try {
      await revoke(AUTH_CONFIG, { tokenToRevoke: refreshToken });
    } catch {
      // ignore revocation errors
    }
  }
  await Promise.all(Object.values(STORAGE_KEYS).map(k => AsyncStorage.removeItem(k)));
}

export async function getAccessToken(): Promise<string> {
  const [token, expiry, refreshToken] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN),
    AsyncStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY),
    AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
  ]);

  if (!token) throw new Error('Not authenticated');

  // Refresh if within 5 minutes of expiry
  if (expiry && Date.now() > new Date(expiry).getTime() - 5 * 60 * 1000) {
    if (!refreshToken) throw new Error('Refresh token unavailable');
    const result = await refresh(AUTH_CONFIG, { refreshToken });
    await storeTokens(
      result.accessToken,
      result.refreshToken ?? refreshToken,
      result.accessTokenExpirationDate,
    );
    return result.accessToken;
  }

  return token;
}

export async function isSignedIn(): Promise<boolean> {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  return !!token;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function storeTokens(
  accessToken: string,
  refreshToken: string,
  expiryDate: string,
): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken),
    AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken),
    AsyncStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiryDate),
  ]);
}
