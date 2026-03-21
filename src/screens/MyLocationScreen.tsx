/**
 * MyLocationScreen — shows the user's location history for a chosen date,
 * and lets them set a permanent known/home location.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getUserHistory,
  postKnownLocation,
  deleteKnownLocation,
  getKnownUserLocations,
} from '../services/api';
import {
  getCurrentPosition,
  requestLocationPermission,
} from '../services/locationService';
import { useAppStore } from '../store/appStore';
import type { HistoricalLocation, KnownLocation } from '../models';

export default function MyLocationScreen() {
  const currentUser = useAppStore(s => s.currentUser);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loadingKnown, setLoadingKnown] = useState(false);
  const qc = useQueryClient();

  const dateLabel = selectedDate.toLocaleDateString();

  const { data: history = [], isFetching: histFetching } = useQuery<HistoricalLocation[]>({
    queryKey: ['history', currentUser?.id, selectedDate.toDateString()],
    queryFn: () => getUserHistory(currentUser!.id, selectedDate),
    enabled: !!currentUser,
  });

  const { data: knownLocations = [] } = useQuery<KnownLocation[]>({
    queryKey: ['knownUserLocations', currentUser?.id],
    queryFn: () => getKnownUserLocations(currentUser!.id),
    enabled: !!currentUser,
  });

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

  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Location</Text>

      {knownLocations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Known location</Text>
          <Text style={styles.cardValue}>{knownLocations[0].clientName}</Text>
          <TouchableOpacity onPress={handleDeleteKnownLocation}>
            <Text style={styles.deleteLink}>Remove</Text>
          </TouchableOpacity>
        </View>
      )}

      {loadingKnown ? (
        <ActivityIndicator color="#0078D4" style={{ marginBottom: 16 }} />
      ) : (
        <TouchableOpacity style={styles.setBtn} onPress={handleSetKnownLocation}>
          <Text style={styles.setBtnText}>Set Current Position as Known Location</Text>
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

      {histFetching ? (
        <ActivityIndicator color="#0078D4" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <View style={styles.historyRow}>
              <Text style={styles.historyTime}>
                {new Date(item.timestamp).toLocaleTimeString()}
              </Text>
              <Text style={styles.historyLocation}>{item.location}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No location data for this day.</Text>
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#111' },
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
  setBtn: {
    backgroundColor: '#0078D4',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  setBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
  },
  navBtn: { padding: 8 },
  navBtnText: { fontSize: 28, color: '#0078D4' },
  dateLabel: { fontSize: 16, fontWeight: '600', color: '#111', minWidth: 120, textAlign: 'center' },
  historyRow: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  historyTime: { fontSize: 13, color: '#888', width: 80 },
  historyLocation: { flex: 1, fontSize: 14, color: '#111' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 15 },
  listContent: { paddingBottom: 32 },
});
