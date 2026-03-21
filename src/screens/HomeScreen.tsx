/**
 * HomeScreen — office summary bars (Available / Away / Busy / Offline counts).
 * Refreshes every 60 seconds while visible, matching the Xamarin polling timer.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getUsersByOffice, getPresenceForUsers, OFFICES } from '../services/graphService';
import { getUserAbsences } from '../services/api';
import type { OfficeSummary } from '../models';

const REFRESH_INTERVAL_MS = 60_000;

export default function HomeScreen() {
  const { data, refetch, isRefetching, isLoading, isError } = useQuery<OfficeSummary[]>({
    queryKey: ['officeSummaries'],
    queryFn: fetchAllOfficeSummaries,
    staleTime: 30_000,
  });

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(refetch, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0078D4" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load office data.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      <Text style={styles.header}>Office Overview</Text>
      {(data ?? []).map(summary => (
        <OfficeSummaryCard key={summary.office} summary={summary} />
      ))}
    </ScrollView>
  );
}

function OfficeSummaryCard({ summary }: { summary: OfficeSummary }) {
  const total = summary.available + summary.away + summary.busy + summary.offline;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{summary.office}</Text>
      <View style={styles.bars}>
        <Bar label="Available" count={summary.available} total={total} color="#22c55e" />
        <Bar label="Away" count={summary.away} total={total} color="#eab308" />
        <Bar label="Busy" count={summary.busy} total={total} color="#ef4444" />
        <Bar label="Offline" count={summary.offline} total={total} color="#9ca3af" />
      </View>
    </View>
  );
}

function Bar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? count / total : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { flex: pct, backgroundColor: color }]} />
        <View style={{ flex: 1 - pct }} />
      </View>
      <Text style={styles.barCount}>{count}</Text>
    </View>
  );
}

async function fetchAllOfficeSummaries(): Promise<OfficeSummary[]> {
  const results = await Promise.allSettled(
    OFFICES.map(async office => {
      const users = await getUsersByOffice(office);
      const activeIds = users.filter(u => u.accountEnabled).map(u => u.id);
      const presences = activeIds.length
        ? await getPresenceForUsers(activeIds)
        : [];

      let available = 0, away = 0, busy = 0, offline = 0;
      for (const p of presences) {
        switch (p.availability) {
          case 'Available':
          case 'AvailableIdle':
            available++;
            break;
          case 'Away':
          case 'BeRightBack':
            away++;
            break;
          case 'Busy':
          case 'BusyIdle':
          case 'DoNotDisturb':
            busy++;
            break;
          default:
            offline++;
        }
      }
      const summary: OfficeSummary = { office, available, away, busy, offline };
      return summary;
    }),
  );

  const summaries: OfficeSummary[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') summaries.push(r.value);
  }
  return summaries;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { fontSize: 15, color: '#555' },
  retryBtn: { backgroundColor: '#0078D4', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  retryBtnText: { color: '#fff', fontWeight: '600' },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#111' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12, color: '#111' },
  bars: { gap: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 70, fontSize: 13, color: '#555' },
  barTrack: { flex: 1, height: 12, flexDirection: 'row', borderRadius: 6, overflow: 'hidden', backgroundColor: '#e5e7eb' },
  barFill: { borderRadius: 6 },
  barCount: { width: 28, textAlign: 'right', fontSize: 13, color: '#555' },
});
