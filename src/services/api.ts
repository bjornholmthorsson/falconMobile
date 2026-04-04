import type {
  UserLocation,
  KnownLocation,
  UserAbsence,
  UserAbsenceRegistration,
  Absence,
  UserData,
  HistoricalLocation,
  LunchWeek,
} from '../models';

const BASE_URL = 'https://fd-falcon.azurewebsites.net';
const CODE = 'OahMqpTnWi6VHfSDH9bU442hVozo4Qksjl36mPsrcVKodK5NaHfFVQ==';

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
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
