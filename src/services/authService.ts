/**
 * Microsoft Authentication (MSAL) service using react-native-app-auth.
 *
 * Tokens are held in-memory only. AsyncStorage is not used — it hangs
 * indefinitely on iOS New Architecture (Bridgeless/Fabric), blocking the
 * JS thread and preventing any setTimeout/Promise from resolving.
 *
 * Trade-off: users must sign in again after an app restart. Cold-start
 * token restoration can be re-added once the AsyncStorage compatibility
 * issue with the New Architecture is resolved.
 */
import { authorize, refresh, revoke } from 'react-native-app-auth';
import { Platform } from 'react-native';

const CLIENT_ID = '3639c730-2334-44d6-9350-1cb2748da8d8';
const TENANT_ID = 'common';

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

// ── In-memory token store ─────────────────────────────────────────────────────

interface MemToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let memToken: MemToken | null = null;

function parseExpiry(dateStr: string): number {
  const t = new Date(dateStr).getTime();
  // Fall back to 1 hour from now if the date string can't be parsed
  return isNaN(t) ? Date.now() + 60 * 60 * 1000 : t;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function signIn(): Promise<string> {
  const result = await authorize(AUTH_CONFIG);
  memToken = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: parseExpiry(result.accessTokenExpirationDate),
  };
  return result.accessToken;
}

export async function signOut(): Promise<void> {
  const rt = memToken?.refreshToken;
  memToken = null;
  if (rt) {
    try { await revoke(AUTH_CONFIG, { tokenToRevoke: rt }); } catch { /* ignore */ }
  }
}

export async function getAccessToken(): Promise<string> {
  if (!memToken) throw new Error('Not authenticated');

  const BUFFER = 5 * 60 * 1000;

  // Token is still fresh — return immediately
  if (Date.now() < memToken.expiresAt - BUFFER) {
    return memToken.accessToken;
  }

  // Token near/past expiry — refresh
  try {
    const result = await Promise.race([
      refresh(AUTH_CONFIG, { refreshToken: memToken.refreshToken }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Not authenticated')), 10_000),
      ),
    ]);
    memToken = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken ?? memToken.refreshToken,
      expiresAt: parseExpiry(result.accessTokenExpirationDate),
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
