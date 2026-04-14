/**
 * Location service — wraps @react-native-community/geolocation and the Falcon
 * backend, replicating the logic from LocationProvider.cs (Android) and
 * LocationManager.cs (iOS):
 *   - 50 m minimum displacement before posting
 *   - Matches position against KnownLocations (< 0.5 km) to get a place name
 *   - Falls back to "unknown"
 */
import Geolocation, { GeoPosition } from '@react-native-community/geolocation';
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getKnownLocations,
  getKnownUserLocations,
  postLocation,
} from './api';
import type { KnownLocation } from '../models';

export type { GeoPosition };

const CACHE_KEY = '@falcon/knownLocations/v3';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const MIN_DISPLACEMENT_M = 50;
const KNOWN_LOCATION_RADIUS_KM = 0.5;

let watchId: number | null = null;
let lastPostedLocation: string | null = null;

// ── Permissions ───────────────────────────────────────────────────────────────

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  // iOS: configure for "always" authorization BEFORE requesting — required by
  // @react-native-community/geolocation for background location updates.
  Geolocation.setRNConfiguration({
    authorizationLevel: 'always',
    skipPermissionRequests: false,
  });
  return new Promise(resolve => {
    Geolocation.requestAuthorization(
      () => resolve(true),
      () => resolve(false),
    );
  });
}

// ── Watching ──────────────────────────────────────────────────────────────────

export function startWatching(userId: string): void {
  if (watchId !== null) return;

  watchId = Geolocation.watchPosition(
    position => handlePositionUpdate(position, userId),
    error => console.warn('[LocationService] watch error', error),
    {
      enableHighAccuracy: true,
      distanceFilter: MIN_DISPLACEMENT_M,
      interval: 5 * 60 * 1000,       // 5 min Android
      fastestInterval: 2 * 60 * 1000, // 2 min Android
    },
  );
}

export function stopWatching(): void {
  if (watchId !== null) {
    Geolocation.clearWatch(watchId);
    watchId = null;
  }
}

// ── One-shot ──────────────────────────────────────────────────────────────────

export function getCurrentPosition(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    });
  });
}

// ── Known location matching ───────────────────────────────────────────────────

export async function resolveLocationName(
  latitude: number,
  longitude: number,
  userId?: string,
): Promise<string> {
  const known = await getCachedKnownLocations(userId);
  if (!known.length) return 'unknown';

  const withDistance = known
    .filter(loc => loc.location?.coordinates != null)
    .map(loc => ({
      ...loc,
      distance: haversineKm(
        latitude,
        longitude,
        loc.location.coordinates[0],
        loc.location.coordinates[1],
      ),
    }))
    .filter(loc => loc.distance < KNOWN_LOCATION_RADIUS_KM)
    .sort((a, b) => a.distance - b.distance);

  return withDistance[0]?.placeName ?? 'unknown';
}

// ── Internals ─────────────────────────────────────────────────────────────────

async function handlePositionUpdate(
  position: GeoPosition,
  userId: string,
): Promise<void> {
  const { latitude, longitude } = position.coords;
  const locationName = await resolveLocationName(latitude, longitude, userId);

  // Don't record positions that don't match a known location
  if (locationName === 'unknown') return;

  // Only post if location name changed (mirrors Xamarin logic)
  if (locationName !== lastPostedLocation) {
    lastPostedLocation = locationName;
    try {
      await postLocation(userId, longitude, latitude);
    } catch (err) {
      console.warn('[LocationService] post failed', err);
    }
  }
}

async function getCachedKnownLocations(
  userId?: string,
): Promise<KnownLocation[]> {
  try {
    const cacheKey = userId ? `${CACHE_KEY}/${userId}` : CACHE_KEY;
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL_MS) return data;
    }

    // Fetch public locations + the current user's own (private) locations,
    // then merge and deduplicate so other users' private locations are excluded.
    const [allLocations, userLocations] = await Promise.all([
      getKnownLocations(),
      userId ? getKnownUserLocations(userId) : Promise.resolve([]),
    ]);
    const publicLocations = allLocations.filter(loc => loc.isPublic);
    const seen = new Set(publicLocations.map(loc => loc.id));
    const merged = [...publicLocations];
    for (const loc of userLocations) {
      if (!seen.has(loc.id)) {
        merged.push(loc);
      }
    }

    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ data: merged, timestamp: Date.now() }),
    );
    return merged;
  } catch {
    return [];
  }
}

// Haversine distance in km
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
