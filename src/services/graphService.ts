/**
 * Microsoft Graph API service.
 *
 * Auth tokens are supplied by AuthService via getAccessToken().
 * Every method that talks to Graph takes an optional AbortSignal so callers
 * can cancel in-flight requests when a screen unmounts.
 */
import axios from 'axios';
import type { User, TeamsPresence } from '../models';
import { getAccessToken } from './authService';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const TIMEOUT_MS = 15_000;

// Offices to filter users by (value matches Graph user.city field)
export const OFFICES = ['Amsterdam', 'Reykjavik', 'Akureyri', 'Lisbon'] as const;
export type Office = (typeof OFFICES)[number];

const GRAPH_USER_FIELDS =
  'id,displayName,mobilePhone,mail,jobTitle,accountEnabled,userPrincipalName,officeLocation';

async function graphGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = await getAccessToken();
  const res = await axios.get<T>(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
    timeout: TIMEOUT_MS,
  });
  return res.data;
}

async function graphPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const token = await getAccessToken();
  const res = await axios.post<T>(`${GRAPH}${path}`, body, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
    timeout: TIMEOUT_MS,
  });
  return res.data;
}

async function graphPatch(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<void> {
  const token = await getAccessToken();
  await axios.patch(`${GRAPH}${path}`, body, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
    timeout: TIMEOUT_MS,
  });
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
    const res = await axios.get(
      `${GRAPH}/users/${userPrincipalName}/photo/$value`,
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer' as const,
        signal,
      },
    );
    const bytes = new Uint8Array(res.data as ArrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    return `data:image/jpeg;base64,${base64}`;
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
  // Create a 1:1 chat with the supervisor
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
