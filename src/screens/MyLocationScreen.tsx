/**
 * MyLocationScreen — shows the user's location history for a chosen date,
 * a map with known location markers, and lets them set/remove a known location.
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
} from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

export default function MyLocationScreen() {
  const currentUser    = useAppStore(s => s.currentUser);
  const checkinEnabled = useAppStore(s => s.checkinEnabled);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loadingKnown, setLoadingKnown] = useState(false);
  const [loadingAdd, setLoadingAdd]     = useState(false);
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
  const [pinnedCoordinate, setPinnedCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const mapRef = useRef<MapView>(null);
  const qc = useQueryClient();

  // Refetch known locations every time screen comes into focus
  useFocusEffect(useCallback(() => {
    qc.invalidateQueries({ queryKey: ['knownUserLocations', currentUser?.id] });
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

  const { data: knownUserLocations = [] } = useQuery<KnownLocation[]>({
    queryKey: ['knownUserLocations', currentUser?.id],
    queryFn: () => getKnownUserLocations(currentUser!.id),
    enabled: !!currentUser,
  });

  const { data: allKnownLocations = [] } = useQuery<KnownLocation[]>({
    queryKey: ['knownLocations'],
    queryFn: getKnownLocations,
  });

  // Build a map of location name → coordinates for pinning history entries
  const locationCoordMap = useMemo(() => {
    const map = new Map<string, { latitude: number; longitude: number }>();
    for (const loc of allKnownLocations) {
      if (loc.location?.coordinates) {
        map.set(loc.clientName, {
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

  // The logged-in user's own Home entry (client_name = 'Home', user_id = current user)
  const homeLocation = useMemo(
    () => knownUserLocations.find(l => l.clientName === 'Home' && l.id === currentUser?.id),
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

  function shiftDate(days: number) {
    setSelectedDate(d => {
      const nd = new Date(d);
      nd.setDate(nd.getDate() + days);
      return nd;
    });
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

  async function handleAddKnownLocation() {
    if (!currentUser || !pinnedCoordinate) return;
    Alert.prompt(
      'Set known location',
      'Enter a name for this location (e.g. "Gym", "Doctor", "Airport")',
      async (name) => {
        if (!name?.trim()) return;
        setLoadingAdd(true);
        try {
          await addKnownLocation(currentUser.id, name.trim(), pinnedCoordinate.longitude, pinnedCoordinate.latitude);
          qc.invalidateQueries({ queryKey: ['knownUserLocations'] });
          setPinnedCoordinate(null);
          Alert.alert('Saved', `"${name.trim()}" has been added as a known location.`);
        } catch (err: any) {
          Alert.alert('Error', err?.message ?? 'Failed to add location');
        } finally {
          setLoadingAdd(false);
        }
      },
      'plain-text',
    );
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
        onLongPress={e => setPinnedCoordinate(e.nativeEvent.coordinate)}
      >
        {/* User's known locations — labelled pins */}
        {knownUserLocations.map(loc =>
          loc.location?.coordinates ? (
            <Marker
              key={`known-${loc.id}-${loc.clientName}`}
              coordinate={{
                latitude: loc.location.coordinates[0],
                longitude: loc.location.coordinates[1],
              }}
              pinColor={loc.clientName === 'Home' ? '#006559' : '#f97316'}
            >
              <Callout tooltip>
                <View style={styles.callout}>
                  <Text style={styles.calloutText}>{loc.clientName}</Text>
                </View>
              </Callout>
            </Marker>
          ) : null
        )}
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

      {/* Controls */}
      <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Home location</Text>
          <Text style={styles.cardValue}>{homeLocation?.clientName ?? '—'}</Text>
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
});
