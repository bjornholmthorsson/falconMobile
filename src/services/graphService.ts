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

// Display names shown in the app
export const OFFICES = ['Amsterdam', 'Reykjavik', 'Ho Chi Minh', 'Lisbon'] as const;
export type Office = (typeof OFFICES)[number];

// Maps display name → actual city values used in Azure AD (Graph user.city field)
const OFFICE_CITY_MAP: Record<string, string[]> = {
  Amsterdam: ['Amsterdam'],
  Reykjavik: ['Reykjavik', 'Kopavogur'],
  'Ho Chi Minh': ['Ho Chi Minh'],
  Lisbon: ['Lisbon'],
};

const GRAPH_USER_FIELDS =
  'id,displayName,mobilePhone,businessPhones,mail,jobTitle,department,accountEnabled,userPrincipalName,officeLocation';

async function graphGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`Graph ${res.status}: ${detail?.error?.message ?? detail?.error?.code ?? JSON.stringify(detail)}`);
  }
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
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`Graph ${res.status}: ${detail?.error?.message ?? detail?.error?.code ?? JSON.stringify(detail)}`);
  }
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
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`Graph ${res.status}: ${detail?.error?.message ?? detail?.error?.code ?? JSON.stringify(detail)}`);
  }
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
  const cities = OFFICE_CITY_MAP[office] ?? [office];
  const filterExpr = cities.map(c => `city eq '${c}'`).join(' or ');
  const filter = encodeURIComponent(filterExpr);
  let url: string | null =
    `${GRAPH}/users?$filter=${filter}&$select=${GRAPH_USER_FIELDS}&$top=999`;
  const all: any[] = [];

  while (url) {
    const token = await getAccessToken();
    const pageRes: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!pageRes.ok) {
      const detail = await pageRes.json().catch(() => ({}));
      throw new Error(`Graph ${pageRes.status}: ${detail?.error?.message ?? detail?.error?.code ?? JSON.stringify(detail)}`);
    }
    const pageData: any = await pageRes.json();
    all.push(...(pageData.value ?? []));
    url = pageData['@odata.nextLink'] ?? null;
  }

  return all.map(mapUser);
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

const SUPERVISOR_UPN = 'bjorn@fivedegrees.nl';

export async function sendAbsenceNotification(
  absenceKey: string,
  from: Date,
  to: Date,
  comment: string,
  currentUserId: string,
  signal?: AbortSignal,
): Promise<void> {
  // Create (or reuse) a 1:1 chat between the signed-in user and the supervisor.
  const chat = await graphPost<{ id: string }>(
    `/chats`,
    {
      chatType: 'oneOnOne',
      members: [
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users/${currentUserId}`,
        },
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users/${SUPERVISOR_UPN}`,
        },
      ],
    },
    signal,
  );

  const body =
    `[Absence Registration]: ${absenceKey} → ` +
    `${from.toLocaleString()} – ${to.toLocaleString()}` +
    (comment ? `<br />${comment}` : '');

  await graphPost(
    `/chats/${chat.id}/messages`,
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
    businessPhone: d.businessPhones?.[0] ?? null,
    officeLocation: d.officeLocation ?? null,
    department: d.department ?? null,
    emailAddress: d.mail ?? null,
    managerId: null,
    accountEnabled: d.accountEnabled ?? true,
  };
}
