/**
 * Microsoft Authentication — Authorization Code Flow with PKCE via react-native-app-auth.
 *
 * Uses the platform's native browser (ASWebAuthenticationSession on iOS,
 * Chrome Custom Tabs on Android) for a proper sign-in experience.
 *
 * Redirect URI: com.falconmobile://auth/
 * Must be registered in Azure AD → Authentication → Mobile/Desktop.
 */
import { authorize, refresh } from 'react-native-app-auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLIENT_ID = '3639c730-2334-44d6-9350-1cb2748da8d8';
const TENANT_ID = 'ffe86e1f-70b6-4c17-b2db-416509cdb0c1';
const REDIRECT_URL = 'com.falconmobile://auth/';

const SCOPES = [
  'openid', 'profile', 'offline_access',
  'User.Read', 'User.Read.All',
  'Presence.Read', 'Presence.Read.All',
  'Calendars.Read',
];

const AUTH_CONFIG = {
  clientId: CLIENT_ID,
  redirectUrl: REDIRECT_URL,
  scopes: SCOPES,
  serviceConfiguration: {
    authorizationEndpoint: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    revocationEndpoint: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/logout`,
  },
  additionalParameters: { prompt: 'select_account' },
} as const;

// Minimal config for the second calendar account — only requests calendar read
// so it won't trigger admin-consent requirements in other company tenants.
const SECOND_ACCOUNT_AUTH_CONFIG = {
  clientId: CLIENT_ID,
  redirectUrl: REDIRECT_URL,
  scopes: ['openid', 'offline_access', 'User.Read', 'Calendars.Read'],
  serviceConfiguration: {
    authorizationEndpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/token`,
    revocationEndpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/logout`,
  },
  additionalParameters: { prompt: 'select_account' },
} as const;

const BUFFER_MS = 5 * 60 * 1000;
const PRIMARY_TOKEN_KEY = 'falcon_primary_token';
const SECOND_ACCOUNT_KEY = 'falcon_second_account';

// ── Token store (primary) — persisted to AsyncStorage ────────────────────────

interface MemToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch
}

let memToken: MemToken | null = null;

async function persistToken(token: MemToken): Promise<void> {
  await AsyncStorage.setItem(PRIMARY_TOKEN_KEY, JSON.stringify(token));
}

async function clearPersistedToken(): Promise<void> {
  await AsyncStorage.removeItem(PRIMARY_TOKEN_KEY);
}

// ── Sign in (primary) ─────────────────────────────────────────────────────────

export async function signIn(): Promise<void> {
  const result = await authorize(AUTH_CONFIG);
  memToken = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? '',
    expiresAt: new Date(result.accessTokenExpirationDate).getTime(),
  };
  await persistToken(memToken);
}

// ── Sign out (primary) ────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  memToken = null;
  await clearPersistedToken();
}

// ── Token access (primary) ────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string> {
  if (!memToken) throw new Error('Not authenticated');

  if (Date.now() < memToken.expiresAt - BUFFER_MS) {
    return memToken.accessToken;
  }

  if (!memToken.refreshToken) {
    memToken = null;
    await clearPersistedToken();
    throw new Error('Not authenticated');
  }

  try {
    const result = await refresh(AUTH_CONFIG, { refreshToken: memToken.refreshToken });
    memToken = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken ?? memToken.refreshToken,
      expiresAt: new Date(result.accessTokenExpirationDate).getTime(),
    };
    await persistToken(memToken);
    return memToken.accessToken;
  } catch {
    memToken = null;
    await clearPersistedToken();
    throw new Error('Not authenticated');
  }
}

/**
 * Check if the user has a cached session. On cold start, tries to restore
 * the persisted refresh token and silently acquire a new access token —
 * no browser, no account picker.
 */
export async function isSignedIn(): Promise<boolean> {
  if (memToken) return true;

  try {
    const raw = await AsyncStorage.getItem(PRIMARY_TOKEN_KEY);
    if (!raw) return false;
    const stored: MemToken = JSON.parse(raw);

    // If access token is still valid, use it directly
    if (Date.now() < stored.expiresAt - BUFFER_MS) {
      memToken = stored;
      return true;
    }

    // Try silent refresh
    if (!stored.refreshToken) return false;
    const result = await refresh(AUTH_CONFIG, { refreshToken: stored.refreshToken });
    memToken = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken ?? stored.refreshToken,
      expiresAt: new Date(result.accessTokenExpirationDate).getTime(),
    };
    await persistToken(memToken);
    return true;
  } catch {
    await clearPersistedToken();
    return false;
  }
}

// ── Second account (persisted in AsyncStorage) ────────────────────────────────

interface PersistedToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
}

/** Opens a fresh browser sign-in for the second account and persists the tokens. */
export async function signInSecondAccount(): Promise<string> {
  const result = await authorize(SECOND_ACCOUNT_AUTH_CONFIG);

  // Fetch email from Graph /me
  const meRes = await fetch(
    'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
    { headers: { Authorization: `Bearer ${result.accessToken}` } },
  );
  const me = await meRes.json();
  const email: string = me.mail ?? me.userPrincipalName ?? 'Unknown';

  const stored: PersistedToken = {
    accessToken:  result.accessToken,
    refreshToken: result.refreshToken ?? '',
    expiresAt:    new Date(result.accessTokenExpirationDate).getTime(),
    email,
  };
  await AsyncStorage.setItem(SECOND_ACCOUNT_KEY, JSON.stringify(stored));
  return email;
}

export async function signOutSecondAccount(): Promise<void> {
  await AsyncStorage.removeItem(SECOND_ACCOUNT_KEY);
}

export async function getSecondAccountEmail(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(SECOND_ACCOUNT_KEY);
  if (!raw) return null;
  return (JSON.parse(raw) as PersistedToken).email;
}

/** Returns a valid access token for the second account, refreshing silently if needed. */
export async function getSecondAccountToken(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(SECOND_ACCOUNT_KEY);
  if (!raw) return null;

  const stored: PersistedToken = JSON.parse(raw);

  if (Date.now() < stored.expiresAt - BUFFER_MS) {
    return stored.accessToken;
  }

  if (!stored.refreshToken) {
    await AsyncStorage.removeItem(SECOND_ACCOUNT_KEY);
    return null;
  }

  try {
    const result = await refresh(SECOND_ACCOUNT_AUTH_CONFIG, { refreshToken: stored.refreshToken });
    const updated: PersistedToken = {
      ...stored,
      accessToken:  result.accessToken,
      refreshToken: result.refreshToken ?? stored.refreshToken,
      expiresAt:    new Date(result.accessTokenExpirationDate).getTime(),
    };
    await AsyncStorage.setItem(SECOND_ACCOUNT_KEY, JSON.stringify(updated));
    return updated.accessToken;
  } catch {
    await AsyncStorage.removeItem(SECOND_ACCOUNT_KEY);
    return null;
  }
}
