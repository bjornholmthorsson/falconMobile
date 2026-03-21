/**
 * Microsoft Authentication — Device Authorization Grant (RFC 8628).
 *
 * Uses pure fetch with no native OAuth library. This sidesteps all
 * react-native-app-auth / ASWebAuthenticationSession / URL-scheme issues
 * on iOS New Architecture (Bridgeless/Fabric).
 *
 * Flow:
 *   1. POST /devicecode  → get user_code + device_code
 *   2. Open browser to verification_uri (Linking.openURL — core RN, no native module)
 *   3. Poll /token every ~5 s until the user completes login in the browser
 *   4. Store tokens in memory; refresh automatically before expiry
 */

const CLIENT_ID = '3639c730-2334-44d6-9350-1cb2748da8d8';
const TENANT_ID = 'common';
const SCOPES = [
  'openid', 'profile', 'offline_access',
  'User.Read', 'User.Read.All',
  'Presence.Read', 'Presence.Read.All',
  'ChatMessage.Send', 'Chat.ReadWrite',
].join(' ');

const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const DEVICE_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/devicecode`;

// ── In-memory token store ─────────────────────────────────────────────────────

interface MemToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let memToken: MemToken | null = null;

function parseExpiry(expiresIn: number): number {
  return Date.now() + expiresIn * 1000;
}

// ── Device code flow ──────────────────────────────────────────────────────────

export interface DeviceCodeInfo {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  interval: number;   // seconds between polls
  expiresIn: number;  // seconds until device code expires
}

/** Step 1: request a device code and return display info to the caller. */
export async function requestDeviceCode(): Promise<DeviceCodeInfo> {
  const res = await fetch(DEVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${CLIENT_ID}&scope=${encodeURIComponent(SCOPES)}`,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? 'Device code request failed');

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    deviceCode: data.device_code,
    interval: data.interval ?? 5,
    expiresIn: data.expires_in ?? 900,
  };
}

/** Step 2: poll until the user completes authentication or the code expires. */
export async function pollForToken(
  deviceCode: string,
  intervalSecs: number,
  onTick?: () => void,      // called each poll so UI can cancel
): Promise<void> {
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  while (true) {
    await wait(intervalSecs * 1000);
    onTick?.();

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: [
        `grant_type=urn:ietf:params:oauth:grant-type:device_code`,
        `client_id=${CLIENT_ID}`,
        `device_code=${deviceCode}`,
      ].join('&'),
    });

    const data = await res.json();

    if (data.access_token) {
      memToken = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? '',
        expiresAt: parseExpiry(data.expires_in ?? 3600),
      };
      return;
    }

    if (data.error === 'authorization_pending' || data.error === 'slow_down') {
      continue; // user hasn't authenticated yet
    }

    throw new Error(data.error_description ?? data.error ?? 'Authentication failed');
  }
}

// ── Standard helpers ──────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  memToken = null;
}

export async function getAccessToken(): Promise<string> {
  if (!memToken) throw new Error('Not authenticated');

  const BUFFER = 5 * 60 * 1000;
  if (Date.now() < memToken.expiresAt - BUFFER) {
    return memToken.accessToken;
  }

  // Refresh silently
  if (!memToken.refreshToken) {
    memToken = null;
    throw new Error('Not authenticated');
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: [
        `grant_type=refresh_token`,
        `client_id=${CLIENT_ID}`,
        `refresh_token=${encodeURIComponent(memToken.refreshToken)}`,
        `scope=${encodeURIComponent(SCOPES)}`,
      ].join('&'),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('Refresh failed');
    memToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? memToken.refreshToken,
      expiresAt: parseExpiry(data.expires_in ?? 3600),
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
