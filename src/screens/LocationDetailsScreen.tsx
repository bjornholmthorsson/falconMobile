/**
 * LocationDetailsScreen — shows the user's location history for a chosen date,
 * a map with known location markers, and lets them set/remove a known location.
 * Reached from PulseScreen via the "Details" button in the header.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import {
  getUserHistory,
  postKnownLocation,
  addKnownLocation,
  deleteKnownLocation,
  getKnownUserLocations,
  getKnownLocations,
} from '../services/api';
import {
  getCurrentPosition,
  requestLocationPermission,
} from '../services/locationService';
import { useAppStore } from '../store/appStore';
import type { HistoricalLocation, KnownLocation } from '../models';

// ── Distance helpers (kept local — no PostGIS, no extra deps) ───────────────

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 9500 ? 1 : 0)} km`;
}

export default function LocationDetailsScreen() {
  const currentUser    = useAppStore(s => s.currentUser);
  const userTokens     = useAppStore(s => s.userTokens);
  const checkinEnabled = useAppStore(s => s.checkinEnabled);
  const isLocationAdmin = userTokens.includes('KnownLocationAdmin');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loadingKnown, setLoadingKnown] = useState(false);
  const [loadingAdd, setLoadingAdd]     = useState(false);
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
  const [pinnedCoordinate, setPinnedCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const mapRef = useRef<MapView>(null);
  const qc = useQueryClient();

  // Refetch BOTH known-locations queries every time the screen comes into
  // focus. Without invalidating the public set too, a stale snapshot can stick
  // around after a backend change and the user sees an empty list until they
  // hard-restart the app.
  useFocusEffect(useCallback(() => {
    qc.invalidateQueries({ queryKey: ['knownUserLocations', currentUser?.id] });
    qc.invalidateQueries({ queryKey: ['knownLocations'] });
  }, [currentUser?.id, qc]));

  // Centre map on user's current GPS position when screen is focused
  useFocusEffect(useCallback(() => {
    requestLocationPermission().then(granted => {
      if (!granted) return;
      getCurrentPosition().then(pos => {
        const region = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        };
        setCurrentRegion(region);
        mapRef.current?.animateToRegion(region, 600);
      }).catch(() => {});
    });
  }, []));

  const dateLabel = selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const { data: rawHistory = [], isFetching: histFetching } = useQuery<HistoricalLocation[]>({
    queryKey: ['history', currentUser?.id, selectedDate.toDateString()],
    queryFn: () => getUserHistory(currentUser!.id, selectedDate),
    enabled: !!currentUser,
  });

  // Deduplicate: keep only the first occurrence of each unique timestamp+location pair
  const history = useMemo(() => {
    const seen = new Set<string>();
    return rawHistory.filter(item => {
      const key = `${item.timestamp.trim()}|${item.location.trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rawHistory]);

  const knownUserLocationsQuery = useQuery<KnownLocation[]>({
    queryKey: ['knownUserLocations', currentUser?.id],
    queryFn: () => getKnownUserLocations(currentUser!.id),
    enabled: !!currentUser,
  });
  const knownUserLocations: KnownLocation[] = knownUserLocationsQuery.data ?? [];

  const knownLocationsQuery = useQuery<KnownLocation[]>({
    queryKey: ['knownLocations'],
    // Wrap the call so TanStack Query's context object (`{signal,queryKey,…}`)
    // doesn't get passed where an AbortSignal is expected — that triggers an
    // "undefined is not a function" inside fetch when it tries to wire abort
    // handlers onto the wrong shape.
    queryFn: ({ signal }) => getKnownLocations(signal),
  });
  const allKnownLocations: KnownLocation[] = knownLocationsQuery.data ?? [];

  // Build a map of location name → coordinates for pinning history entries
  const locationCoordMap = useMemo(() => {
    const map = new Map<string, { latitude: number; longitude: number }>();
    for (const loc of allKnownLocations) {
      if (loc.location?.coordinates) {
        map.set(loc.placeName, {
          latitude: loc.location.coordinates[0],
          longitude: loc.location.coordinates[1],
        });
      }
    }
    return map;
  }, [allKnownLocations]);

  // Unique locations visited today that have known coordinates
  const historyMarkers = useMemo(() => {
    const seen = new Set<string>();
    const markers: { name: string; latitude: number; longitude: number }[] = [];
    for (const entry of history) {
      if (!seen.has(entry.location)) {
        seen.add(entry.location);
        const coords = locationCoordMap.get(entry.location);
        if (coords) markers.push({ name: entry.location, ...coords });
      }
    }
    return markers;
  }, [history, locationCoordMap]);

  // Public locations + user's own private locations, deduplicated
  const visibleLocations = useMemo(() => {
    const publicLocs = allKnownLocations.filter(loc => loc.isPublic);
    const seen = new Set(publicLocs.map(loc => loc.id));
    const merged = [...publicLocs];
    for (const loc of knownUserLocations) {
      if (!seen.has(loc.id)) {
        merged.push(loc);
      }
    }
    return merged.filter(loc => loc.location?.coordinates != null)
      .sort((a, b) => a.placeName.localeCompare(b.placeName));
  }, [allKnownLocations, knownUserLocations]);

  // The logged-in user's own Home entry (client_name = 'Home', user_id = current user)
  const homeLocation = useMemo(
    () => knownUserLocations.find(l => l.placeName === 'Home' && l.id === currentUser?.id),
    [knownUserLocations, currentUser?.id],
  );

  // Initial map region — current GPS position, then home location, then Reykjavik fallback
  const initialRegion: Region = useMemo(() => {
    if (currentRegion) return currentRegion;
    if (homeLocation?.location?.coordinates) {
      return {
        latitude: homeLocation.location.coordinates[0],
        longitude: homeLocation.location.coordinates[1],
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    return { latitude: 64.1355, longitude: -21.8954, latitudeDelta: 0.1, longitudeDelta: 0.1 };
  }, [currentRegion, homeLocation]);

  function focusLocation(loc: KnownLocation) {
    if (!loc.location?.coordinates) return;
    const region = {
      latitude: loc.location.coordinates[0],
      longitude: loc.location.coordinates[1],
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    };
    mapRef.current?.animateToRegion(region, 600);
  }

  function shiftDate(days: number) {
    setSelectedDate(d => {
      const nd = new Date(d);
      nd.setDate(nd.getDate() + days);
      return nd;
    });
  }

  // factor < 1 zooms in (smaller delta = closer); factor > 1 zooms out.
  // Region is tracked via onRegionChangeComplete; falls back to initialRegion.
  function zoomBy(factor: number) {
    const r = currentRegion ?? initialRegion;
    const next: Region = {
      latitude:       r.latitude,
      longitude:      r.longitude,
      latitudeDelta:  Math.max(0.0005, Math.min(80, r.latitudeDelta  * factor)),
      longitudeDelta: Math.max(0.0005, Math.min(80, r.longitudeDelta * factor)),
    };
    mapRef.current?.animateToRegion(next, 250);
    setCurrentRegion(next);
  }

  // ── "Find closest" — drop the user on the map at the nearest known place ──

  const [findingClosest, setFindingClosest] = useState(false);

  async function handleFindClosest() {
    const granted = await requestLocationPermission();
    if (!granted) {
      Alert.alert('Permission denied', 'Location permission is required.');
      return;
    }
    setFindingClosest(true);
    try {
      const pos = await getCurrentPosition();
      const candidates = visibleLocations
        .filter(l => l.location?.coordinates != null)
        .map(l => ({
          loc: l,
          distanceM: haversineMeters(
            pos.coords.latitude, pos.coords.longitude,
            l.location.coordinates[0], l.location.coordinates[1],
          ),
        }))
        .sort((a, b) => a.distanceM - b.distanceM);

      if (candidates.length === 0) {
        Alert.alert('No known locations', 'Add a known location first to use this.');
        return;
      }

      const { loc, distanceM } = candidates[0];
      // Frame both the user and the closest known location so you can see them
      // together. Adds 30% padding around the bounding box.
      mapRef.current?.fitToCoordinates(
        [
          { latitude: pos.coords.latitude,        longitude: pos.coords.longitude },
          { latitude: loc.location.coordinates[0], longitude: loc.location.coordinates[1] },
        ],
        {
          edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
          animated: true,
        },
      );
      Alert.alert('Closest known location', `${loc.placeName}\n${formatDistance(distanceM)} from you.`);
    } catch (err: any) {
      Alert.alert('Could not find location', err?.message ?? 'Try again with location services on.');
    } finally {
      setFindingClosest(false);
    }
  }

  async function handleSetKnownLocation() {
    if (!currentUser) return;
    const granted = await requestLocationPermission();
    if (!granted) {
      Alert.alert('Permission denied', 'Location permission is required.');
      return;
    }
    setLoadingKnown(true);
    try {
      const pos = await getCurrentPosition();
      await postKnownLocation(
        currentUser.id,
        pos.coords.longitude,
        pos.coords.latitude,
      );
      qc.invalidateQueries({ queryKey: ['knownUserLocations'] });
      Alert.alert('Set', 'Known location updated to your current position.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to set location');
    } finally {
      setLoadingKnown(false);
    }
  }

  async function handleDeleteKnownLocation() {
    if (!currentUser) return;
    Alert.alert('Delete', 'Remove your known location?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteKnownLocation(currentUser.id);
          qc.invalidateQueries({ queryKey: ['knownUserLocations'] });
        },
      },
    ]);
  }

  // ── Add-known-location modal state ──
  const [addModalOpen,    setAddModalOpen]    = useState(false);
  const [addName,         setAddName]         = useState('');
  const [addPhotoB64,     setAddPhotoB64]     = useState<string | null>(null);
  const [addIsPublic,     setAddIsPublic]     = useState(false);

  async function saveKnownLocation(name: string, isPublic?: boolean, photoBase64?: string | null) {
    if (!currentUser || !pinnedCoordinate) return;
    setLoadingAdd(true);
    try {
      await addKnownLocation(currentUser.id, name, pinnedCoordinate.longitude, pinnedCoordinate.latitude, isPublic, photoBase64);
      qc.invalidateQueries({ queryKey: ['knownUserLocations'] });
      qc.invalidateQueries({ queryKey: ['knownLocations'] });
      setPinnedCoordinate(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to add location');
    } finally {
      setLoadingAdd(false);
    }
  }

  function handleAddKnownLocation() {
    if (!currentUser || !pinnedCoordinate) return;
    setAddName('');
    setAddPhotoB64(null);
    setAddIsPublic(isLocationAdmin ? false : false); // private by default
    setAddModalOpen(true);
  }

  async function pickPhoto(source: 'library' | 'camera') {
    const opts = {
      mediaType: 'photo' as const,
      maxWidth: 1200,
      maxHeight: 1200,
      quality: 0.7 as const,
      includeBase64: true,
    };
    try {
      const result = source === 'camera' ? await launchCamera(opts) : await launchImageLibrary(opts);
      if (result.didCancel) return;
      const asset = result.assets?.[0];
      if (!asset?.base64) return;
      const mime = asset.type ?? 'image/jpeg';
      setAddPhotoB64(`data:${mime};base64,${asset.base64}`);
    } catch (err: any) {
      Alert.alert('Could not load photo', err?.message ?? 'Try again');
    }
  }

  async function submitAddLocation() {
    const trimmed = addName.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Give the location a name.');
      return;
    }
    setAddModalOpen(false);
    await saveKnownLocation(trimmed, isLocationAdmin ? addIsPublic : undefined, addPhotoB64);
    setAddName('');
    setAddPhotoB64(null);
    setAddIsPublic(false);
  }

  return (
    <View style={styles.container}>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
        onRegionChangeComplete={r => setCurrentRegion(r)}
        onLongPress={e => setPinnedCoordinate(e.nativeEvent.coordinate)}
      >
        {/* Public + user's own known locations */}
        {visibleLocations.map(loc => (
          <Marker
            key={`known-${loc.id}-${loc.placeName}`}
            coordinate={{
              latitude: loc.location.coordinates[0],
              longitude: loc.location.coordinates[1],
            }}
            pinColor={loc.isPublic ? '#006559' : '#f97316'}
          >
            <Callout tooltip>
              <View style={styles.callout}>
                <Text style={styles.calloutText}>{loc.placeName}</Text>
              </View>
            </Callout>
          </Marker>
        ))}
        {/* Locations visited today */}
        {historyMarkers.map(marker => (
          <Marker
            key={`hist-${marker.name}`}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title={marker.name}
            pinColor="#f97316"
          />
        ))}
        {/* Long-press pin */}
        {pinnedCoordinate && (
          <Marker coordinate={pinnedCoordinate} pinColor="#6366f1" />
        )}
      </MapView>

      {/* Zoom controls — overlaid on the right side of the map */}
      <View style={styles.zoomStack} pointerEvents="box-none">
        <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(0.5)} activeOpacity={0.7}>
          <Text style={styles.zoomBtnText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(2)} activeOpacity={0.7}>
          <Text style={styles.zoomBtnText}>−</Text>
        </TouchableOpacity>
      </View>

      {/* Controls */}
      <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={styles.findClosestBtn}
          onPress={handleFindClosest}
          activeOpacity={0.8}
          disabled={findingClosest}
        >
          {findingClosest ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.findClosestBtnText}>📍  Where I am</Text>
          )}
        </TouchableOpacity>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Home location</Text>
          <Text style={styles.cardValue}>{homeLocation?.placeName ?? '—'}</Text>
          <View style={styles.cardActions}>
            {loadingKnown ? (
              <ActivityIndicator size="small" color="#006559" />
            ) : (
              <TouchableOpacity onPress={handleSetKnownLocation}>
                <Text style={styles.setHomeLink}>Set as Home</Text>
              </TouchableOpacity>
            )}
            {homeLocation && (
              <TouchableOpacity onPress={handleDeleteKnownLocation}>
                <Text style={styles.deleteLink}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {loadingAdd ? (
          <ActivityIndicator color="#006559" style={{ marginBottom: 16 }} />
        ) : (
          <TouchableOpacity
            style={[styles.addBtn, !pinnedCoordinate && styles.addBtnDisabled]}
            onPress={handleAddKnownLocation}
            disabled={!pinnedCoordinate}
          >
            <Text style={[styles.addBtnText, !pinnedCoordinate && styles.addBtnTextDisabled]}>
              {pinnedCoordinate ? 'Set Known Location' : 'Long-press map to pin a location'}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.locationsTitle}>Known Locations</Text>
        {visibleLocations.length === 0 ? (
          <Text style={styles.empty}>No known locations.</Text>
        ) : (
          visibleLocations.map(loc => (
            <TouchableOpacity
              key={`list-${loc.id}-${loc.placeName}`}
              style={styles.locationRow}
              onPress={() => focusLocation(loc)}
              activeOpacity={0.7}
            >
              <View style={[styles.locationDot, loc.isPublic ? styles.dotPublic : styles.dotPrivate]} />
              <Text style={styles.locationName} numberOfLines={1}>{loc.placeName}</Text>
              <Text style={styles.locationBadge}>{loc.isPublic ? 'Public' : 'Private'}</Text>
              <Text style={styles.locationArrow}>›</Text>
            </TouchableOpacity>
          ))
        )}

        <View style={styles.dateNav}>
          <TouchableOpacity onPress={() => shiftDate(-1)} style={styles.navBtn}>
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
          <TouchableOpacity
            onPress={() => shiftDate(1)}
            style={styles.navBtn}
            disabled={selectedDate >= new Date()}
          >
            <Text style={styles.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.checkinsTitle}>Check-in's</Text>

        {histFetching ? (
          <ActivityIndicator color="#006559" style={{ marginTop: 8 }} />
        ) : history.length === 0 ? (
          <Text style={styles.empty}>No location data for this day.</Text>
        ) : (
          history.map((item, i) => (
            <View key={`${i}-${item.timestamp}`} style={styles.historyRow}>
              <Text style={styles.historyLocation}>{item.location}</Text>
              <Text style={styles.historyTime}>
                {new Date(item.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Add-known-location modal ── */}
      <Modal
        visible={addModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: '#f5f5f5' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.addModalHeader}>
            <Text style={styles.addModalTitle}>Set known location</Text>
            <TouchableOpacity onPress={() => setAddModalOpen(false)}>
              <Text style={styles.addModalCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={addName}
              onChangeText={setAddName}
              placeholder='e.g. "Gym", "Doctor", "Airport"'
              placeholderTextColor="#9ca3af"
              autoFocus
              returnKeyType="done"
            />

            <Text style={styles.fieldLabel}>Photo (optional)</Text>
            {addPhotoB64 ? (
              <View style={styles.photoPreviewWrap}>
                <Image source={{ uri: addPhotoB64 }} style={styles.photoPreview} resizeMode="cover" />
                <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => setAddPhotoB64(null)}>
                  <Text style={styles.photoRemoveBtnText}>Remove photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.photoButtonRow}>
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto('library')} activeOpacity={0.75}>
                  <Text style={styles.photoBtnText}>Choose from library</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto('camera')} activeOpacity={0.75}>
                  <Text style={styles.photoBtnText}>Take photo</Text>
                </TouchableOpacity>
              </View>
            )}

            {isLocationAdmin && (
              <>
                <Text style={styles.fieldLabel}>Visibility</Text>
                <View style={styles.visibilityRow}>
                  <TouchableOpacity
                    style={[styles.visibilityBtn, !addIsPublic && styles.visibilityBtnActive]}
                    onPress={() => setAddIsPublic(false)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.visibilityBtnText, !addIsPublic && styles.visibilityBtnTextActive]}>Private</Text>
                    <Text style={styles.visibilitySub}>Visible to you only</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.visibilityBtn, addIsPublic && styles.visibilityBtnActive]}
                    onPress={() => setAddIsPublic(true)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.visibilityBtnText, addIsPublic && styles.visibilityBtnTextActive]}>Public</Text>
                    <Text style={styles.visibilitySub}>Anyone in the org</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={submitAddLocation} activeOpacity={0.85}>
              <Text style={styles.saveBtnText}>Save location</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#C7D3D3' },
  map: { height: 280 },
  controls: { flex: 1 },
  controlsContent: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardLabel: { fontSize: 13, color: '#888' },
  cardValue: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111' },
  deleteLink: { fontSize: 13, color: '#ef4444' },
  cardActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  setHomeLink: { fontSize: 13, color: '#006559', fontWeight: '600' },
  addBtn: {
    borderWidth: 1.5,
    borderColor: '#006559',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  addBtnText: { color: '#006559', fontWeight: '600', fontSize: 14 },
  addBtnDisabled: { borderColor: '#d1d5db', backgroundColor: '#f9fafb' },
  addBtnTextDisabled: { color: '#9ca3af' },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 12,
  },
  navBtn: { padding: 8 },
  navBtnText: { fontSize: 28, color: '#006559' },
  dateLabel: { fontSize: 16, fontWeight: '600', color: '#111', minWidth: 120, textAlign: 'center' },
  checkinsTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 4 },
  historyRow: {
    backgroundColor: '#e8ecec',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyTime: { fontSize: 13, color: '#555', fontWeight: '500', textAlign: 'right' },
  historyLocation: { flex: 1, fontSize: 14, color: '#111', fontWeight: '500' },
  empty: { textAlign: 'center', color: '#999', marginTop: 20, fontSize: 15 },
  locationsTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 4 },
  locationRow: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 10,
  },
  locationDot: { width: 10, height: 10, borderRadius: 5 },
  dotPublic: { backgroundColor: '#006559' },
  dotPrivate: { backgroundColor: '#f97316' },
  locationName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#111' },
  locationBadge: { fontSize: 11, color: '#6b7280', fontWeight: '500' },
  locationArrow: { fontSize: 20, color: '#9ca3af', marginLeft: 2 },
  callout: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  calloutText: { fontSize: 13, fontWeight: '600', color: '#1e1b14' },

  // ── add-location modal ──
  addModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e5e5',
  },
  addModalTitle:  { fontSize: 17, fontWeight: '700', color: '#111' },
  addModalCancel: { fontSize: 15, color: '#006559', fontWeight: '600' },

  fieldLabel:  { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 16, marginBottom: 6 },
  fieldInput: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111', borderWidth: 1, borderColor: '#e5e5e5',
  },

  photoButtonRow: { flexDirection: 'row', gap: 10 },
  photoBtn: {
    flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  photoBtnText:    { color: '#006559', fontWeight: '600', fontSize: 13 },
  photoPreviewWrap:{ alignItems: 'flex-start' },
  photoPreview: {
    width: '100%', height: 180, borderRadius: 10, backgroundColor: '#e5e7eb',
  },
  photoRemoveBtn:  { marginTop: 8, paddingVertical: 6 },
  photoRemoveBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },

  visibilityRow:   { flexDirection: 'row', gap: 10 },
  visibilityBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#e5e5e5', alignItems: 'center',
  },
  visibilityBtnActive: { borderColor: '#006559', backgroundColor: '#e6f4f1' },
  visibilityBtnText:   { fontSize: 14, fontWeight: '700', color: '#374151' },
  visibilityBtnTextActive: { color: '#006559' },
  visibilitySub:    { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  saveBtn: {
    marginTop: 28, backgroundColor: '#006559', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  findClosestBtn: {
    backgroundColor: '#006559', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginBottom: 12,
  },
  findClosestBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  zoomStack: {
    position: 'absolute', right: 12, top: 70,
    gap: 8,
  },
  zoomBtn: {
    width: 40, height: 40, borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  zoomBtnText: { fontSize: 22, fontWeight: '700', color: '#006559', lineHeight: 26 },
});
