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
import React, { useCallback, useMemo, useState } from 'react';
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
import LocationDetailsScreen from './LocationDetailsScreen';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
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
  const [detailsOpen, setDetailsOpen]               = useState(false);
  const [selectedLocation, setSelectedLocation]     = useState<string | null>(null);

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

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Today's check-ins</Text>
        <TouchableOpacity style={styles.detailsBtn} onPress={() => setDetailsOpen(true)} activeOpacity={0.75}>
          <Text style={styles.detailsBtnText}>Details</Text>
        </TouchableOpacity>
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
          {items.map((item, i) => (
            <TouchableOpacity
              key={`${item.userId}-${item.recordedAt}-${i}`}
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
                <Text style={styles.cardTime}>{fmtTime(item.recordedAt)}</Text>
                {item.locationPhotoUrl ? (
                  <Image source={{ uri: item.locationPhotoUrl }} style={styles.cardPhoto} />
                ) : (
                  <View style={[styles.cardPhoto, styles.cardPhotoPlaceholder]}>
                    <Text style={styles.cardPhotoEmoji}>📍</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
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
              <MapView
                style={styles.modalMap}
                initialRegion={{
                  latitude:       selectedFirst.locationLatitude,
                  longitude:      selectedFirst.locationLongitude,
                  latitudeDelta:  0.005,
                  longitudeDelta: 0.005,
                } as Region}
                pointerEvents="none"
              >
                <Marker
                  coordinate={{
                    latitude:  selectedFirst.locationLatitude,
                    longitude: selectedFirst.locationLongitude,
                  }}
                  pinColor="#006559"
                />
              </MapView>
            )}
            {selectedFirst?.locationPhotoUrl && (
              <Image source={{ uri: selectedFirst.locationPhotoUrl }} style={styles.modalPhoto} resizeMode="cover" />
            )}
            <Text style={styles.modalSectionLabel}>
              Today's check-ins here ({selectedItems.length})
            </Text>
            {selectedItems.map((it, i) => (
              <View key={`${it.userId}-${it.recordedAt}-${i}`} style={styles.modalRow}>
                <Avatar userId={it.userId} name={it.displayName} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.modalRowName}>{it.displayName ?? it.userId}</Text>
                  {!!it.department && <Text style={styles.modalRowDept}>{it.department}</Text>}
                </View>
                <Text style={styles.modalRowTime}>{fmtTime(it.recordedAt)}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Details modal (the old map-centric view) ── */}
      <Modal
        visible={detailsOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailsOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Location details</Text>
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
  cardTime:    { fontSize: 13, color: '#006559', fontWeight: '700' },
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
  modalMap:     { height: 220, marginHorizontal: 16, marginTop: 14, borderRadius: 12, overflow: 'hidden' },
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
