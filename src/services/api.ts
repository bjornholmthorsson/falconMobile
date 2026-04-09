import type {
  UserLocation,
  KnownLocation,
  UserAbsence,
  UserAbsenceRegistration,
  Absence,
  UserData,
  HistoricalLocation,
  LunchWeek,
  UserSettings,
  LocationSubscription,
} from '../models';

const BASE_URL = 'https://fd-falcon.azurewebsites.net';
const CODE = 'OahMqpTnWi6VHfSDH9bU442hVozo4Qksjl36mPsrcVKodK5NaHfFVQ==';

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { signal });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}${body ? ': ' + body.slice(0, 120) : ''}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiPatch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiDelete<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE', signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Location ────────────────────────────────────────────────────────────────

export async function postLocation(
  userId: string,
  longitude: number,
  latitude: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(
    `${BASE_URL}/api/user/${userId}/location?long=${longitude}&lat=${latitude}&code=${CODE}`,
    { method: 'POST', signal },
  );
  return res.ok;
}

export async function postKnownLocation(
  userId: string,
  longitude: number,
  latitude: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(
    `${BASE_URL}/api/user/${userId}/known-location?code=${CODE}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Longitude: longitude, Latitude: latitude }),
      signal,
    },
  );
  return res.ok;
}

export async function addKnownLocation(
  userId: string,
  name: string,
  longitude: number,
  latitude: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(
    `${BASE_URL}/api/user/${userId}/known-locations?code=${CODE}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Name: name, Longitude: longitude, Latitude: latitude }),
      signal,
    },
  );
  return res.ok;
}

export async function deleteKnownLocation(
  userId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(
    `${BASE_URL}/api/user/${userId}/known-location?code=${CODE}`,
    { method: 'DELETE', signal },
  );
  return res.ok;
}

export async function getUserLocations(
  signal?: AbortSignal,
): Promise<UserLocation[]> {
  return apiGet<UserLocation[]>(`/api/user-locations?code=${CODE}`, signal);
}

export async function getKnownLocations(
  signal?: AbortSignal,
): Promise<KnownLocation[]> {
  return apiGet<KnownLocation[]>(`/api/known-locations?code=${CODE}`, signal);
}

export async function getKnownUserLocations(
  userId: string,
  signal?: AbortSignal,
): Promise<KnownLocation[]> {
  return apiGet<KnownLocation[]>(`/api/user/${userId}/known-locations?code=${CODE}`, signal);
}

export async function getUserHistory(
  userId: string,
  date: Date,
  signal?: AbortSignal,
): Promise<HistoricalLocation[]> {
  const formatted =
    `${String(date.getDate()).padStart(2, '0')}-` +
    `${String(date.getMonth() + 1).padStart(2, '0')}-` +
    `${date.getFullYear()}`;
  const data = await apiGet<{ locations: HistoricalLocation[] }>(
    `/api/user/${userId}/history?date=${formatted}&code=${CODE}`,
    signal,
  );
  return data?.locations ?? [];
}

// ── Lunch ────────────────────────────────────────────────────────────────────

export async function getLunchMenu(
  year: number,
  week: number,
  signal?: AbortSignal,
): Promise<LunchWeek> {
  return apiGet<LunchWeek>(`/api/lunch-menu?year=${year}&week=${week}&code=${CODE}`, signal);
}

export async function getLunchOrders(
  userId: string,
  year: number,
  week: number,
  signal?: AbortSignal,
): Promise<Record<number, string>> {
  return apiGet<Record<number, string>>(
    `/api/lunch-order?userId=${encodeURIComponent(userId)}&year=${year}&week=${week}&code=${CODE}`,
    signal,
  );
}

export async function submitLunchOrders(
  userId: string,
  weekId: number,
  orders: { dayId: number; category: string }[],
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/lunch-order?code=${CODE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, weekId, orders }),
    signal,
  });
  return res.ok;
}

// ── Absences ────────────────────────────────────────────────────────────────

export async function registerAbsence(
  username: string,
  payload: UserAbsenceRegistration,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(
    `${BASE_URL}/api/user/${username}/absence?code=${CODE}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    },
  );
  return res.ok;
}

export async function getUserAbsences(
  opts: { allDay?: boolean; userIds?: string[] } = {},
  signal?: AbortSignal,
): Promise<UserAbsence[]> {
  let query = `?code=${CODE}`;
  if (opts.allDay) query += '&allDay=true';
  if (opts.userIds?.length) query += `&userids=${opts.userIds.join(',')}`;
  return apiGet<UserAbsence[]>(`/api/user-absences${query}`, signal);
}

export async function getAbsenceTypes(
  signal?: AbortSignal,
): Promise<Absence[]> {
  return apiGet<Absence[]>(`/api/absences?code=${CODE}`, signal);
}

// ── User Settings ────────────────────────────────────────────────────────────

export async function getUserSettings(
  userId: string,
  signal?: AbortSignal,
): Promise<UserSettings> {
  return apiGet<UserSettings>(`/api/user/${userId}/settings?code=${CODE}`, signal);
}

export async function updateUserSettings(
  userId: string,
  settings: Partial<UserSettings>,
  signal?: AbortSignal,
): Promise<UserSettings> {
  const res = await fetch(`${BASE_URL}/api/user/${userId}/settings?code=${CODE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<UserSettings>;
}

// ── User Data ────────────────────────────────────────────────────────────────

export async function getUserData(
  userIds?: string[],
  signal?: AbortSignal,
): Promise<UserData[]> {
  let query = `?code=${CODE}`;
  if (userIds?.length) query += `&userids=${userIds.join(',')}`;
  return apiGet<UserData[]>(`/api/user-data${query}`, signal);
}

export async function getUserInformation(
  userId: string,
  signal?: AbortSignal,
): Promise<UserData[]> {
  const query = `?ids=${encodeURIComponent(userId)}&code=${CODE}`;
  return apiGet<UserData[]>(`/api/user-information${query}`, signal);
}

// ── Tempo / Time Registration ─────────────────────────────────────────────────

export interface TempoWorklogEntry {
  id: number;
  issueKey: string | null;
  issueSummary: string | null;
  date: string | null;
  startTime: string | null;
  timeSpentSeconds: number;
  comment: string | null;
}

export interface JiraIssue {
  key: string;
  summary: string;
}

export interface TempoAbsenceType {
  id: number;
  name: string;
  jiraKey: string | null;
  sortOrder: number;
}

export async function getTempoAbsenceTypes(signal?: AbortSignal): Promise<TempoAbsenceType[]> {
  return apiGet<TempoAbsenceType[]>(`/api/tempo/absence-types?code=${CODE}`, signal);
}

export async function getTempoWorklogs(
  userId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<TempoWorklogEntry[]> {
  return apiGet<TempoWorklogEntry[]>(
    `/api/tempo/worklogs/${userId}?from=${from}&to=${to}&code=${CODE}`,
    signal,
  );
}

export async function postTempoWorklog(
  userId: string,
  entry: { date: string; startTime: string; endTime: string; timeSpentSeconds: number; issueKey: string; comment?: string },
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/tempo/worklogs/${userId}?code=${CODE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body ? body.slice(0, 200) : `API ${res.status}`);
  }
  return true;
}

export async function deleteTempoWorklog(
  userId: string,
  worklogId: number,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/tempo/worklogs/${userId}/${worklogId}?code=${CODE}`,
    { method: 'DELETE', signal },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body ? body.slice(0, 200) : `API ${res.status}`);
  }
}

export async function searchJiraIssues(
  query: string,
  signal?: AbortSignal,
): Promise<JiraIssue[]> {
  return apiGet<JiraIssue[]>(
    `/api/jira/issues?query=${encodeURIComponent(query)}&code=${CODE}`,
    signal,
  );
}

// ── Worklog Keyword Rules ─────────────────────────────────────────────────────

export interface WorklogKeywordRule {
  id: number;
  keyword: string;
  jiraKey: string;
}

export async function getWorklogKeywordRules(
  userId: string,
  signal?: AbortSignal,
): Promise<WorklogKeywordRule[]> {
  return apiGet<WorklogKeywordRule[]>(`/api/user/${userId}/worklog-keyword-rules?code=${CODE}`, signal);
}

export async function addWorklogKeywordRule(
  userId: string,
  keyword: string,
  jiraKey: string,
  signal?: AbortSignal,
): Promise<WorklogKeywordRule> {
  return apiPost<WorklogKeywordRule>(
    `/api/user/${userId}/worklog-keyword-rules?code=${CODE}`,
    { keyword, jiraKey },
    signal,
  );
}

export async function deleteWorklogKeywordRule(
  userId: string,
  ruleId: number,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/user/${userId}/worklog-keyword-rules/${ruleId}?code=${CODE}`,
    { method: 'DELETE', signal },
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
}

export async function registerUserData(
  userId: string,
  data: Partial<UserData>,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(
    `${BASE_URL}/api/user/${userId}/information?code=${CODE}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    },
  );
  return res.ok;
}

// ── Device Tokens ─────────────────────────────────────────────────────────────

export async function registerDeviceToken(
  userId: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/device-tokens?code=${CODE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, token, platform: 'ios' }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
}

// ── Location Subscriptions ────────────────────────────────────────────────────

export async function getLocationSubscriptions(
  subscriberId: string,
  targetId: string,
  signal?: AbortSignal,
): Promise<LocationSubscription[]> {
  return apiGet<LocationSubscription[]>(
    `/api/location-subscriptions?subscriberId=${encodeURIComponent(subscriberId)}&targetId=${encodeURIComponent(targetId)}&code=${CODE}`,
    signal,
  );
}

export async function createLocationSubscription(
  subscriberUserId: string,
  targetUserId: string,
  locationName: string,
  subscriberDisplayName?: string,
): Promise<{ id: number }> {
  const res = await fetch(`${BASE_URL}/api/location-subscriptions?code=${CODE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscriberUserId, targetUserId, locationName, subscriberDisplayName }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<{ id: number }>;
}

// ── Travel Request ───────────────────────────────────────────────────────────

export interface TravelRequestPayload {
  summary: string;
  description?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  departurePreference?: string;
  returnPreference?: string;
  passengers?: string;
  flightInformation?: string;
  hotelNeeded?: string;
  billable?: string;
  costCenter?: string;
  customer?: string;
  account?: string;
  accountKey?: string;
}

export interface JiraUser {
  name: string;
  displayName: string;
}

export async function searchJiraUsers(
  query: string,
  signal?: AbortSignal,
): Promise<JiraUser[]> {
  return apiGet<JiraUser[]>(
    `/api/jira/users?query=${encodeURIComponent(query)}&code=${CODE}`,
    signal,
  );
}

export interface TempoAccount {
  id: number;
  key: string;
  name: string;
}

export async function searchTempoAccounts(
  query: string,
  signal?: AbortSignal,
): Promise<TempoAccount[]> {
  return apiGet<TempoAccount[]>(
    `/api/tempo/accounts?query=${encodeURIComponent(query)}&code=${CODE}`,
    signal,
  );
}

export async function createTravelRequest(
  payload: TravelRequestPayload,
  signal?: AbortSignal,
): Promise<{ key: string; id: string; self: string }> {
  const res = await fetch(`${BASE_URL}/api/travel-request?code=${CODE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body ? body.slice(0, 200) : `API ${res.status}`);
  }
  return res.json() as Promise<{ key: string; id: string; self: string }>;
}

export async function deleteLocationSubscription(id: number): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/location-subscriptions/${id}?code=${CODE}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
}
