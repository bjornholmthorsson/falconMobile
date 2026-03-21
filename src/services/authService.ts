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

const CLIENT_ID = '3639c730-2334-44d6-9350-1cb2748da8d8';
const TENANT_ID = 'common';
const REDIRECT_URL = 'com.falconmobile://auth/';

const SCOPES = [
  'openid', 'profile', 'offline_access',
  'User.Read', 'User.Read.All',
  'Presence.Read', 'Presence.Read.All',
  'ChatMessage.Send', 'Chat.ReadWrite',
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

// ── In-memory token store ─────────────────────────────────────────────────────

interface MemToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch
}

let memToken: MemToken | null = null;

// ── Sign in ───────────────────────────────────────────────────────────────────

/** Opens the native browser sign-in flow and stores the resulting tokens. */
export async function signIn(): Promise<void> {
  const result = await authorize(AUTH_CONFIG);
  memToken = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? '',
    expiresAt: new Date(result.accessTokenExpirationDate).getTime(),
  };
}

// ── Sign out ──────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  memToken = null;
}

// ── Token access ──────────────────────────────────────────────────────────────

const BUFFER_MS = 5 * 60 * 1000;

export async function getAccessToken(): Promise<string> {
  if (!memToken) throw new Error('Not authenticated');

  if (Date.now() < memToken.expiresAt - BUFFER_MS) {
    return memToken.accessToken;
  }

  // Refresh silently
  if (!memToken.refreshToken) {
    memToken = null;
    throw new Error('Not authenticated');
  }

  try {
    const result = await refresh(AUTH_CONFIG, { refreshToken: memToken.refreshToken });
    memToken = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken ?? memToken.refreshToken,
      expiresAt: new Date(result.accessTokenExpirationDate).getTime(),
    };
    return memToken.accessToken;
  } catch {
    memToken = null;
    throw new Error('Not authenticated');
  }
}

export async function isSignedIn(): Promise<boolean> {
  return memToken !== null;
}
