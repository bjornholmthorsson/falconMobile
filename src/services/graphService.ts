/**
 * Microsoft Graph API service.
 *
 * Uses the native fetch API (not axios) — axios uses XMLHttpRequest which
 * blocks the JS thread on iOS New Architecture (Bridgeless/Fabric).
 * fetch is implemented natively and runs fully off-thread.
 */
import type { User, TeamsPresence } from '../models';
import { getAccessToken, getSecondAccountToken } from './authService';
import { getDepartments as fetchDeptMappings } from './api';

const GRAPH = 'https://graph.microsoft.com/v1.0';

const COMPANY = 'Finance';

export const DEPARTMENTS = [
  'Five Degrees',
  'Hypotheken',
  'Pension & Wealth',
  'Business Lending',
  '.Finance Staf, Experts, Services & Ondersteuning',
  'MoneyView',
  'Connected Finance',
  'Topicus Vietnam',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

let _deptLabels: Record<string, string> | null = null;
let _deptOffices: Record<string, string[]> | null = null;

export async function loadDepartmentLabels(): Promise<Record<string, string>> {
  if (_deptLabels) return _deptLabels;
  try {
    const mappings = await fetchDeptMappings();
    _deptLabels = {};
    _deptOffices = {};
    for (const m of mappings) {
      _deptLabels[m.department] = m.displayName;
      _deptOffices[m.department] = m.offices ?? [];
    }
  } catch {
    _deptLabels = {};
    _deptOffices = {};
  }
  return _deptLabels;
}

export function getDepartmentLabel(department: string): string {
  return _deptLabels?.[department] ?? department;
}

export function getDepartmentOffices(department: string): string[] {
  return _deptOffices?.[department] ?? [];
}

const GRAPH_USER_FIELDS =
  'id,displayName,mobilePhone,businessPhones,mail,jobTitle,department,accountEnabled,userPrincipalName,officeLocation';

function handleAuthFailure(): never {
  throw new Error('Not authenticated');
}

async function graphGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (res.status === 401 || res.status === 403) return handleAuthFailure();
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
  if (res.status === 401 || res.status === 403) return handleAuthFailure();
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
  if (res.status === 401 || res.status === 403) return handleAuthFailure();
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

let _companyUsersCache: { users: User[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getCompanyUsers(signal?: AbortSignal): Promise<User[]> {
  if (_companyUsersCache && Date.now() - _companyUsersCache.ts < CACHE_TTL) {
    return _companyUsersCache.users;
  }

  const filter = encodeURIComponent(`companyName eq '${COMPANY}'`);
  let url: string | null =
    `${GRAPH}/users?$filter=${filter}&$select=${GRAPH_USER_FIELDS}&$count=true&$top=999`;
  const all: any[] = [];

  while (url) {
    const token = await getAccessToken();
    const pageRes: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: 'eventual',
      },
      signal,
    });
    if (pageRes.status === 401 || pageRes.status === 403) return handleAuthFailure();
    if (!pageRes.ok) {
      const detail = await pageRes.json().catch(() => ({}));
      throw new Error(`Graph ${pageRes.status}: ${detail?.error?.message ?? detail?.error?.code ?? JSON.stringify(detail)}`);
    }
    const pageData: any = await pageRes.json();
    all.push(...(pageData.value ?? []));
    url = pageData['@odata.nextLink'] ?? null;
  }

  const users = all.map(mapUser);
  _companyUsersCache = { users, ts: Date.now() };
  return users;
}

export function invalidateCompanyUsersCache(): void {
  _companyUsersCache = null;
}

export async function getUsersByDepartment(
  department: string,
  signal?: AbortSignal,
): Promise<User[]> {
  const all = await getCompanyUsers(signal);
  return all.filter(u => u.department === department);
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

// ── Calendar ──────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  subject: string;
  start: Date;
  end: Date;
  durationSeconds: number;
  isAllDay: boolean;
}

export async function getCalendarEvents(
  dateStr: string, // YYYY-MM-DD
  signal?: AbortSignal,
): Promise<CalendarEvent[]> {
  const start = `${dateStr}T00:00:00`;
  const end   = `${dateStr}T23:59:59`;
  const params =
    `startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}` +
    `&$select=id,subject,start,end,isAllDay,showAs&$orderby=start/dateTime&$top=20`;

  function parseEvents(value: any[]): CalendarEvent[] {
    return value
      .filter((e: any) => !e.isAllDay && e.showAs !== 'free' && e.showAs !== 'workingElsewhere')
      .map((e: any) => {
        const s = new Date(e.start.dateTime);
        const n = new Date(e.end.dateTime);
        return {
          id:              e.id,
          subject:         e.subject ?? '(No title)',
          start:           s,
          end:             n,
          durationSeconds: Math.max(0, Math.round((n.getTime() - s.getTime()) / 1000)),
          isAllDay:        false,
        };
      })
      .filter(e => e.durationSeconds < 86400);
  }

  const primary = await graphGet<{ value: any[] }>(`/me/calendarView?${params}`, signal);
  const events  = parseEvents(primary.value ?? []);

  // Second account — uses its own OAuth token fetched directly
  try {
    const secondToken = await getSecondAccountToken();
    if (secondToken) {
      const res = await fetch(
        `${GRAPH}/me/calendarView?${params}`,
        { headers: { Authorization: `Bearer ${secondToken}` }, signal },
      );
      if (res.ok) {
        const data = await res.json();
        const secondEvents = parseEvents(data.value ?? []);
        const ids = new Set(events.map(e => e.id));
        for (const ev of secondEvents) {
          if (!ids.has(ev.id)) events.push(ev);
        }
        events.sort((a, b) => a.start.getTime() - b.start.getTime());
      }
    }
  } catch {
    // Second account inaccessible — silently skip
  }

  return events;
}

// ── User search ──────────────────────────────────────────────────────────────

export async function searchGraphUsers(
  query: string,
  signal?: AbortSignal,
): Promise<User[]> {
  if (!query.trim()) return [];
  const safe = query.replace(/'/g, "''");
  const filter = encodeURIComponent(`startswith(displayName,'${safe}') or startswith(userPrincipalName,'${safe}')`);
  const data = await graphGet<{ value: any[] }>(
    `/users?$filter=${filter}&$select=${GRAPH_USER_FIELDS}&$top=10`,
    signal,
  );
  return (data.value ?? []).map(mapUser);
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
