/**
 * PulseScreen — "Today's check-ins" feed.
 *
 * Default landing for the Pulse tab. Shows a card for every check-in across the
 * org today (most-recent first) with the person's name, time, and the location
 * they checked into. Tap a card to open a detail modal with a map for that
 * location plus everyone else who checked in there today.
 *
 * The "Details" button in the header pushes the previous map-based view
 * (LocationDetailsScreen) — home location, long-press pinning, your own
 * check-in history, etc. — for users who need that level of control.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MapView, { Marker, Region } from 'react-native-maps';
import { getTodaysCheckins, type CheckinItem } from '../services/api';
import { getUserPhoto } from '../services/graphService';
import { useAppStore } from '../store/appStore';
import LocationDetailsScreen from './LocationDetailsScreen';

// Token gating "Pulse Details" — admin-only management view (home location,
// long-press pinning, your check-in history, public/private known-locations).
// Granted in Profile → Admin tokens (requires the Admin token to manage).
const PULSE_DETAILS_TOKEN = 'PulseDetails';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtArrivalOrDeparture(checkedInAt: string, checkedOutAt: string | null): string {
  return checkedOutAt
    ? `Left at ${fmtTime(checkedOutAt)}`
    : `Arrived at ${fmtTime(checkedInAt)}`;
}

function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

// Microsoft Graph user photo. The Pulse feed has the userId only (Azure AD
// object ID); Graph accepts either the id or UPN at this endpoint.
async function fetchPhotoById(userId: string): Promise<string | null> {
  try {
    return await getUserPhoto(userId);
  } catch {
    return null;
  }
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ userId, name }: { userId: string; name: string | null }) {
  const { data: photo } = useQuery({
    queryKey: ['photo', userId],
    queryFn:  () => fetchPhotoById(userId),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  if (photo) {
    return <Image source={{ uri: photo }} style={avatarStyles.img} />;
  }
  return (
    <View style={avatarStyles.fallback}>
      <Text style={avatarStyles.fallbackText}>{initials(name)}</Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  img:      { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e5e7eb' },
  fallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#006559', alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

// ── PulseScreen ──────────────────────────────────────────────────────────────

export default function PulseScreen() {
  const qc = useQueryClient();
  const userTokens = useAppStore(s => s.userTokens);
  const canSeeDetails = userTokens.includes(PULSE_DETAILS_TOKEN);
  const [detailsOpen, setDetailsOpen]               = useState(false);
  const [selectedLocation, setSelectedLocation]     = useState<string | null>(null);

  // Per-location map state (keyed by lat/lng of the selected card so a fresh
  // open of a different location resets to the right spot).
  const detailMapRef = useRef<MapView>(null);
  const [detailRegion, setDetailRegion] = useState<Region | null>(null);

  const { data: items = [], isLoading, isFetching, refetch, error } = useQuery<CheckinItem[]>({
    queryKey: ['todaysCheckins'],
    queryFn:  ({ signal }) => getTodaysCheckins(signal),
    staleTime: 30 * 1000,
  });

  useFocusEffect(useCallback(() => {
    qc.invalidateQueries({ queryKey: ['todaysCheckins'] });
  }, [qc]));

  // Group items by location so we can show "everyone here today" in the modal.
  const itemsByLocation = useMemo(() => {
    const m = new Map<string, CheckinItem[]>();
    for (const it of items) {
      const list = m.get(it.locationName) ?? [];
      list.push(it);
      m.set(it.locationName, list);
    }
    return m;
  }, [items]);

  const selectedItems = selectedLocation ? itemsByLocation.get(selectedLocation) ?? [] : [];
  const selectedFirst = selectedItems[0];

  // Reset the detail map's zoom whenever a new card opens.
  useEffect(() => {
    if (selectedFirst?.locationLatitude != null && selectedFirst?.locationLongitude != null) {
      setDetailRegion({
        latitude:       selectedFirst.locationLatitude,
        longitude:      selectedFirst.locationLongitude,
        latitudeDelta:  0.005,
        longitudeDelta: 0.005,
      });
    } else {
      setDetailRegion(null);
    }
  }, [selectedFirst?.locationLatitude, selectedFirst?.locationLongitude]);

  function detailZoomBy(factor: number) {
    if (!detailRegion) return;
    const next: Region = {
      latitude:       detailRegion.latitude,
      longitude:      detailRegion.longitude,
      latitudeDelta:  Math.max(0.0005, Math.min(80, detailRegion.latitudeDelta  * factor)),
      longitudeDelta: Math.max(0.0005, Math.min(80, detailRegion.longitudeDelta * factor)),
    };
    detailMapRef.current?.animateToRegion(next, 250);
    setDetailRegion(next);
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Today's check-ins</Text>
        {canSeeDetails && (
          <TouchableOpacity
            style={styles.detailsBtn}
            onPress={() => {
              // Force fresh known-locations data each time Details opens —
              // the Modal child stays mounted so its own focus hooks
              // never re-fire on subsequent opens. refetchQueries (vs
              // invalidate) forces the network call regardless of observer
              // active-state.
              qc.refetchQueries({ queryKey: ['knownLocations'] });
              qc.refetchQueries({ queryKey: ['knownUserLocations'] });
              setDetailsOpen(true);
            }}
            activeOpacity={0.75}
          >
            <Text style={styles.detailsBtnText}>Details</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color="#006559" />
      ) : error ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Couldn't load check-ins</Text>
          <Text style={styles.emptySub}>{(error as Error)?.message}</Text>
        </View>
      ) : items.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#006559" />}
        >
          <Text style={styles.emptyTitle}>No check-ins yet today</Text>
          <Text style={styles.emptySub}>People will appear here as they arrive at known locations.</Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#006559" />}
        >
          {items.map((item, i) => {
            const stillHere = !item.checkedOutAt;
            return (
              <TouchableOpacity
                key={`${item.userId}-${item.checkedInAt}-${i}`}
                style={styles.card}
                onPress={() => setSelectedLocation(item.locationName)}
                activeOpacity={0.75}
              >
                <Avatar userId={item.userId} name={item.displayName} />
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={1}>{item.displayName ?? item.userId}</Text>
                  <Text style={styles.cardLocation} numberOfLines={1}>{item.locationName}</Text>
                  {!!item.department && (
                    <Text style={styles.cardDept} numberOfLines={1}>{item.department}</Text>
                  )}
                </View>
                <View style={styles.cardRight}>
                  <Text style={[styles.cardTime, stillHere ? styles.cardTimeActive : styles.cardTimeLeft]}>
                    {fmtArrivalOrDeparture(item.checkedInAt, item.checkedOutAt)}
                  </Text>
                  {item.locationPhotoUrl ? (
                    <Image source={{ uri: item.locationPhotoUrl }} style={styles.cardPhoto} />
                  ) : (
                    <View style={[styles.cardPhoto, styles.cardPhotoPlaceholder]}>
                      <Text style={styles.cardPhotoEmoji}>📍</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Per-location detail modal ── */}
      <Modal
        visible={!!selectedLocation}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedLocation(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>{selectedLocation ?? ''}</Text>
            <TouchableOpacity onPress={() => setSelectedLocation(null)}>
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            {selectedFirst?.locationLatitude != null && selectedFirst?.locationLongitude != null && (
              <View style={styles.modalMapWrap}>
                <MapView
                  ref={detailMapRef}
                  style={styles.modalMap}
                  initialRegion={{
                    latitude:       selectedFirst.locationLatitude,
                    longitude:      selectedFirst.locationLongitude,
                    latitudeDelta:  0.005,
                    longitudeDelta: 0.005,
                  } as Region}
                  onRegionChangeComplete={r => setDetailRegion(r)}
                >
                  <Marker
                    coordinate={{
                      latitude:  selectedFirst.locationLatitude,
                      longitude: selectedFirst.locationLongitude,
                    }}
                    pinColor="#006559"
                  />
                </MapView>
                <View style={styles.detailZoomStack} pointerEvents="box-none">
                  <TouchableOpacity style={styles.detailZoomBtn} onPress={() => detailZoomBy(0.5)} activeOpacity={0.7}>
                    <Text style={styles.detailZoomBtnText}>+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.detailZoomBtn} onPress={() => detailZoomBy(2)} activeOpacity={0.7}>
                    <Text style={styles.detailZoomBtnText}>−</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {selectedFirst?.locationPhotoUrl && (
              <Image source={{ uri: selectedFirst.locationPhotoUrl }} style={styles.modalPhoto} resizeMode="cover" />
            )}
            <Text style={styles.modalSectionLabel}>
              Today's check-ins here ({selectedItems.length})
            </Text>
            {selectedItems.map((it, i) => (
              <View key={`${it.userId}-${it.checkedInAt}-${i}`} style={styles.modalRow}>
                <Avatar userId={it.userId} name={it.displayName} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.modalRowName}>{it.displayName ?? it.userId}</Text>
                  {!!it.department && <Text style={styles.modalRowDept}>{it.department}</Text>}
                </View>
                <Text style={[styles.modalRowTime, !it.checkedOutAt ? styles.cardTimeActive : styles.cardTimeLeft]}>
                  {fmtArrivalOrDeparture(it.checkedInAt, it.checkedOutAt)}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Pulse Details modal (admin-only) ── */}
      <Modal
        visible={detailsOpen && canSeeDetails}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailsOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pulse Details</Text>
            <TouchableOpacity onPress={() => setDetailsOpen(false)}>
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <LocationDetailsScreen />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e5e5',
  },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: '#111' },
  detailsBtn:   { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#e6f4f1', borderRadius: 8 },
  detailsBtnText: { color: '#006559', fontWeight: '600', fontSize: 13 },

  emptyWrap:  { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 6, textAlign: 'center' },
  emptySub:   { fontSize: 13, color: '#6b7280', textAlign: 'center' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardBody:    { flex: 1 },
  cardName:    { fontSize: 15, fontWeight: '700', color: '#111' },
  cardLocation:{ fontSize: 13, color: '#374151', marginTop: 2 },
  cardDept:    { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  cardRight:   { alignItems: 'flex-end', gap: 6 },
  cardTime:    { fontSize: 12, color: '#006559', fontWeight: '700' },
  cardTimeActive: { color: '#15803d' }, // green — still checked in
  cardTimeLeft:   { color: '#b45309' }, // amber — already left
  cardPhoto:   { width: 48, height: 48, borderRadius: 8, backgroundColor: '#e5e7eb' },
  cardPhotoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef0f1' },
  cardPhotoEmoji: { fontSize: 18 },

  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e5e5',
  },
  modalTitle:   { flex: 1, fontSize: 17, fontWeight: '700', color: '#111', marginRight: 12 },
  modalClose:   { fontSize: 15, color: '#006559', fontWeight: '600' },
  modalMapWrap: { marginHorizontal: 16, marginTop: 14, borderRadius: 12, overflow: 'hidden' },
  modalMap:     { height: 220 },
  detailZoomStack: {
    position: 'absolute', right: 8, top: 8, gap: 6,
  },
  detailZoomBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  detailZoomBtnText: { fontSize: 20, fontWeight: '700', color: '#006559', lineHeight: 22 },
  modalPhoto:   { height: 180, marginHorizontal: 16, marginTop: 14, borderRadius: 12, backgroundColor: '#e5e7eb' },
  modalSectionLabel: {
    fontSize: 13, fontWeight: '700', color: '#374151',
    marginTop: 18, marginBottom: 6, paddingHorizontal: 16,
  },
  modalRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
  },
  modalRowName: { fontSize: 14, fontWeight: '600', color: '#111' },
  modalRowDept: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  modalRowTime: { fontSize: 13, color: '#006559', fontWeight: '700' },
});
