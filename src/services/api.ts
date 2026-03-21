import axios from 'axios';
import type {
  UserLocation,
  KnownLocation,
  UserAbsence,
  UserAbsenceRegistration,
  Absence,
  UserData,
  HistoricalLocation,
} from '../models';

const BASE_URL = 'https://fd-falcon.azurewebsites.net';
const CODE = 'OahMqpTnWi6VHfSDH9bU442hVozo4Qksjl36mPsrcVKodK5NaHfFVQ==';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 25000,
});

// ── Location ────────────────────────────────────────────────────────────────

export async function postLocation(
  userId: string,
  longitude: number,
  latitude: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await api.post(
    `/api/user/${userId}/location?long=${longitude}&lat=${latitude}&code=${CODE}`,
    null,
    { signal },
  );
  return res.status >= 200 && res.status < 300;
}

export async function postKnownLocation(
  userId: string,
  longitude: number,
  latitude: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await api.post(
    `/api/user/${userId}/known-location?code=${CODE}`,
    { Longitude: longitude, Latitude: latitude },
    { signal },
  );
  return res.status >= 200 && res.status < 300;
}

export async function deleteKnownLocation(
  userId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await api.delete(
    `/api/user/${userId}/known-location?code=${CODE}`,
    { signal },
  );
  return res.status >= 200 && res.status < 300;
}

export async function getUserLocations(
  signal?: AbortSignal,
): Promise<UserLocation[]> {
  const res = await api.get<UserLocation[]>(
    `/api/user-locations?code=${CODE}`,
    { signal },
  );
  return res.data;
}

export async function getKnownLocations(
  signal?: AbortSignal,
): Promise<KnownLocation[]> {
  const res = await api.get<KnownLocation[]>(
    `/api/known-locations?code=${CODE}`,
    { signal },
  );
  return res.data;
}

export async function getKnownUserLocations(
  userId: string,
  signal?: AbortSignal,
): Promise<KnownLocation[]> {
  const res = await api.get<KnownLocation[]>(
    `/api/user/${userId}/known-locations?code=${CODE}`,
    { signal },
  );
  return res.data;
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
  const res = await api.get<{ locations: HistoricalLocation[] }>(
    `/api/user/${userId}/history?date=${formatted}&code=${CODE}`,
    { signal },
  );
  return res.data?.locations ?? [];
}

// ── Absences ────────────────────────────────────────────────────────────────

export async function registerAbsence(
  username: string,
  payload: UserAbsenceRegistration,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await api.post(
    `/api/user/${username}/absence?code=${CODE}`,
    payload,
    { signal },
  );
  return res.status >= 200 && res.status < 300;
}

export async function getUserAbsences(
  opts: { allDay?: boolean; userIds?: string[] } = {},
  signal?: AbortSignal,
): Promise<UserAbsence[]> {
  let query = `?code=${CODE}`;
  if (opts.allDay) query += '&allDay=true';
  if (opts.userIds?.length) query += `&userids=${opts.userIds.join(',')}`;
  const res = await api.get<UserAbsence[]>(`/api/user-absences${query}`, { signal });
  return res.data;
}

export async function getAbsenceTypes(
  signal?: AbortSignal,
): Promise<Absence[]> {
  const res = await api.get<Absence[]>(`/api/absences?code=${CODE}`, { signal });
  return res.data;
}

// ── User Data ────────────────────────────────────────────────────────────────

export async function getUserData(
  userIds?: string[],
  signal?: AbortSignal,
): Promise<UserData[]> {
  let query = `?code=${CODE}`;
  if (userIds?.length) query += `&userids=${userIds.join(',')}`;
  const res = await api.get<UserData[]>(`/api/user-data${query}`, { signal });
  return res.data;
}

export async function getUserInformation(
  userId: string,
  signal?: AbortSignal,
): Promise<UserData[]> {
  const query = `?ids=${encodeURIComponent(userId)}&code=${CODE}`;
  const res = await api.get<UserData[]>(`/api/user-information${query}`, { signal });
  return res.data;
}

export async function registerUserData(
  userId: string,
  data: Partial<UserData>,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await api.patch(
    `/api/user/${userId}/information?code=${CODE}`,
    data,
    { signal },
  );
  return res.status >= 200 && res.status < 300;
}
