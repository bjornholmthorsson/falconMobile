/**
 * Microsoft Authentication (MSAL) service using react-native-app-auth.
 *
 * Client ID and redirect URIs match the existing Xamarin app so the same
 * Azure AD app registration is reused without any changes.
 *
 * Token strategy:
 *   - After signIn(), the token is held in memory — no AsyncStorage read needed
 *     for subsequent getAccessToken() calls within the same app session.
 *   - AsyncStorage is used only for cold-start restoration (isSignedIn) and
 *     persistence (storeTokens), both wrapped with a 5 s timeout so a broken
 *     storage layer can't freeze the app.
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

// ── In-memory token cache ─────────────────────────────────────────────────────
// Avoids AsyncStorage reads on every API call within the same app session.

interface MemToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms since epoch
}

let memToken: MemToken | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

function storageGet(key: string): Promise<string | null> {
  return withTimeout(AsyncStorage.getItem(key), 5_000, 'storage_timeout');
}

function storageSet(key: string, value: string): Promise<void> {
  return withTimeout(AsyncStorage.setItem(key, value), 5_000, 'storage_timeout');
}

function storageRemove(key: string): Promise<void> {
  return withTimeout(AsyncStorage.removeItem(key), 5_000, 'storage_timeout');
}

async function clearStoredTokens(): Promise<void> {
  memToken = null;
  await Promise.allSettled(Object.values(STORAGE_KEYS).map(k => storageRemove(k)));
}

async function storeTokens(
  accessToken: string,
  refreshToken: string,
  expiryDate: string,
): Promise<void> {
  const expiresAt = new Date(expiryDate).getTime();
  memToken = { accessToken, refreshToken, expiresAt };
  // Persist in background — don't block the caller if storage is slow
  Promise.allSettled([
    storageSet(STORAGE_KEYS.ACCESS_TOKEN, accessToken),
    storageSet(STORAGE_KEYS.REFRESH_TOKEN, refreshToken),
    storageSet(STORAGE_KEYS.TOKEN_EXPIRY, expiryDate),
  ]);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function signIn(): Promise<string> {
  const result = await authorize(AUTH_CONFIG);
  await storeTokens(result.accessToken, result.refreshToken, result.accessTokenExpirationDate);
  return result.accessToken;
}

export async function signOut(): Promise<void> {
  const rt = memToken?.refreshToken;
  if (rt) {
    try { await revoke(AUTH_CONFIG, { tokenToRevoke: rt }); } catch { /* ignore */ }
  }
  await clearStoredTokens();
}

export async function getAccessToken(): Promise<string> {
  const BUFFER = 5 * 60 * 1000; // refresh 5 min before expiry

  // ── 1. Use in-memory token if still fresh ──────────────────────────────────
  if (memToken && Date.now() < memToken.expiresAt - BUFFER) {
    return memToken.accessToken;
  }

  // ── 2. Refresh if we have a refresh token in memory ───────────────────────
  if (memToken?.refreshToken) {
    try {
      const result = await withTimeout(
        refresh(AUTH_CONFIG, { refreshToken: memToken.refreshToken }),
        10_000,
        'Not authenticated',
      );
      await storeTokens(
        result.accessToken,
        result.refreshToken ?? memToken.refreshToken,
        result.accessTokenExpirationDate,
      );
      return memToken!.accessToken;
    } catch {
      await clearStoredTokens();
      throw new Error('Not authenticated');
    }
  }

  // ── 3. Cold start: read from AsyncStorage (with timeout) ──────────────────
  let token: string | null = null;
  let expiry: string | null = null;
  let refreshToken: string | null = null;
  try {
    [token, expiry, refreshToken] = await Promise.all([
      storageGet(STORAGE_KEYS.ACCESS_TOKEN),
      storageGet(STORAGE_KEYS.TOKEN_EXPIRY),
      storageGet(STORAGE_KEYS.REFRESH_TOKEN),
    ]);
  } catch {
    throw new Error('Not authenticated');
  }

  if (!token) throw new Error('Not authenticated');

  const expiresAt = expiry ? new Date(expiry).getTime() : Date.now() + 60_000;
  memToken = { accessToken: token, refreshToken: refreshToken ?? '', expiresAt };

  if (Date.now() < expiresAt - BUFFER) {
    return token;
  }

  // Token is near/past expiry — refresh
  if (!refreshToken) {
    await clearStoredTokens();
    throw new Error('Not authenticated');
  }
  try {
    const result = await withTimeout(
      refresh(AUTH_CONFIG, { refreshToken }),
      10_000,
      'Not authenticated',
    );
    await storeTokens(
      result.accessToken,
      result.refreshToken ?? refreshToken,
      result.accessTokenExpirationDate,
    );
    return memToken!.accessToken;
  } catch {
    await clearStoredTokens();
    throw new Error('Not authenticated');
  }
}

export async function isSignedIn(): Promise<boolean> {
  if (memToken) return true;
  try {
    const token = await storageGet(STORAGE_KEYS.ACCESS_TOKEN);
    return !!token;
  } catch {
    return false;
  }
}
