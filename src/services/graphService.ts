/**
 * Microsoft Graph API service.
 *
 * Uses the native fetch API (not axios) — axios uses XMLHttpRequest which
 * blocks the JS thread on iOS New Architecture (Bridgeless/Fabric).
 * fetch is implemented natively and runs fully off-thread.
 */
import type { User, TeamsPresence } from '../models';
import { getAccessToken } from './authService';

const GRAPH = 'https://graph.microsoft.com/v1.0';

// Offices to filter users by (value matches Graph user.city field)
export const OFFICES = ['Amsterdam', 'Reykjavik', 'Akureyri', 'Lisbon'] as const;
export type Office = (typeof OFFICES)[number];

const GRAPH_USER_FIELDS =
  'id,displayName,mobilePhone,mail,jobTitle,accountEnabled,userPrincipalName,officeLocation';

async function graphGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) throw new Error(`Graph ${res.status}`);
  return res.json() as Promise<T>;
}

async function graphPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Graph ${res.status}`);
  return res.json() as Promise<T>;
}

async function graphPatch(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Graph ${res.status}`);
}

// ── Current user ─────────────────────────────────────────────────────────────

export async function getMe(signal?: AbortSignal): Promise<User> {
  const data = await graphGet<any>(
    `/me?$select=${GRAPH_USER_FIELDS}`,
    signal,
  );
  return mapUser(data);
}

// ── User directory ────────────────────────────────────────────────────────────

export async function getUsersByOffice(
  office: string,
  signal?: AbortSignal,
): Promise<User[]> {
  const filter = encodeURIComponent(`city eq '${office}'`);
  const data = await graphGet<{ value: any[] }>(
    `/users?$filter=${filter}&$select=${GRAPH_USER_FIELDS}`,
    signal,
  );
  return (data.value ?? []).map(mapUser);
}

export async function getUser(
  userId: string,
  signal?: AbortSignal,
): Promise<User> {
  const data = await graphGet<any>(
    `/users/${userId}?$select=${GRAPH_USER_FIELDS}`,
    signal,
  );
  return mapUser(data);
}

export async function updateUser(
  userId: string,
  mobilePhone: string,
  signal?: AbortSignal,
): Promise<void> {
  await graphPatch(`/users/${userId}`, { mobilePhone }, signal);
}

// ── Presence ──────────────────────────────────────────────────────────────────

export async function getPresenceForUsers(
  userIds: string[],
  signal?: AbortSignal,
): Promise<TeamsPresence[]> {
  if (!userIds.length) return [];
  const data = await graphPost<{ value: any[] }>(
    '/communications/getPresencesByUserId',
    { ids: userIds },
    signal,
  );
  return (data.value ?? []).map(p => ({
    id: p.id,
    availability: p.availability ?? '',
    activity: p.activity ?? '',
  }));
}

export async function getPresenceForUser(
  userId: string,
  signal?: AbortSignal,
): Promise<TeamsPresence> {
  const data = await graphGet<any>(`/users/${userId}/presence`, signal);
  return { id: data.id, availability: data.availability ?? '', activity: data.activity ?? '' };
}

// ── Photos ────────────────────────────────────────────────────────────────────

export async function getUserPhoto(
  userPrincipalName: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const token = await getAccessToken();
    const res = await fetch(
      `${GRAPH}/users/${userPrincipalName}/photo/$value`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
    );
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── Teams messaging ───────────────────────────────────────────────────────────

const SUPERVISOR_UPN = 'bjorn.holmthorsson@fivedegrees.com';

export async function sendAbsenceNotification(
  absenceKey: string,
  from: Date,
  to: Date,
  comment: string,
  signal?: AbortSignal,
): Promise<void> {
  const chat = await graphPost<{ id: string }>(
    `/users/${SUPERVISOR_UPN}/chats`,
    { chatType: 'oneOnOne', topic: 'Absence Registered' },
    signal,
  );
  const body =
    `[Absence Registration]: ${absenceKey} -> ` +
    `${from.toLocaleString()} - ${to.toLocaleString()}` +
    (comment ? ` <br /> ${comment}` : '');

  await graphPost(
    `/users/${SUPERVISOR_UPN}/chats/${chat.id}/messages`,
    { body: { contentType: 'html', content: body } },
    signal,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapUser(d: any): User {
  return {
    id: d.id,
    displayName: d.displayName ?? '',
    jobTitle: d.jobTitle ?? null,
    userPrincipalName: d.userPrincipalName ?? '',
    mobilePhone: d.mobilePhone ?? null,
    officeLocation: d.officeLocation ?? null,
    emailAddress: d.mail ?? null,
    managerId: null,
    accountEnabled: d.accountEnabled ?? true,
  };
}
