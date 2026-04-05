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
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getUsersByOffice, getPresenceForUsers, OFFICES } from '../services/graphService';
import { getUserAbsences } from '../services/api';
import { signOut } from '../services/authService';
import { useAppStore } from '../store/appStore';
import type { OfficeSummary } from '../models';

const REFRESH_INTERVAL_MS = 60_000;

export default function HomeScreen() {
  const setIsAuthenticated = useAppStore(s => s.setIsAuthenticated);
  const setCurrentUser = useAppStore(s => s.setCurrentUser);

  const { data, refetch, isRefetching, isLoading, isError, error } = useQuery<OfficeSummary[]>({
    queryKey: ['officeSummaries'],
    queryFn: fetchAllOfficeSummaries,
    staleTime: 30_000,
  });

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(refetch, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  async function handleSignOut() {
    await signOut().catch(() => {});
    setCurrentUser(null);
    setIsAuthenticated(false);
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#006559" />
      </View>
    );
  }

  if (isError) {
    const isAuthError = (error as any)?.message === 'Not authenticated';
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {isAuthError ? 'Session expired.' : 'Could not load office data.'}
        </Text>
        {isAuthError ? (
          <TouchableOpacity style={styles.retryBtn} onPress={handleSignOut}>
            <Text style={styles.retryBtnText}>Sign in again</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerRow}>
        {isRefetching && <ActivityIndicator size="small" color="#1e1b14" />}
      </View>
      {(data ?? []).map(summary => (
        <OfficeSummaryCard key={summary.office} summary={summary} />
      ))}
    </ScrollView>
  );
}

function OfficeSummaryCard({ summary }: { summary: OfficeSummary }) {
  const total = summary.available + summary.away + summary.busy + summary.offline;
  const segments = [
    { color: '#22c55e', count: summary.available },
    { color: '#eab308', count: summary.away },
    { color: '#ef4444', count: summary.busy },
    { color: '#9ca3af', count: summary.offline },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{summary.office}</Text>
        <Text style={styles.cardTotal}>{total} people</Text>
      </View>
      <View style={styles.statusRow}>
        {segments.map((s, i) => (
          <View key={i} style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: s.color }]} />
            <Text style={styles.statusCount}>{s.count}</Text>
          </View>
        ))}
      </View>
      <View style={styles.segmentBar}>
        {segments.map((s, i) =>
          s.count > 0 ? (
            <View
              key={i}
              style={[
                styles.segmentFill,
                { flex: s.count / total, backgroundColor: s.color },
                i === 0 && styles.segmentFirst,
                i === segments.length - 1 && styles.segmentLast,
              ]}
            />
          ) : null,
        )}
      </View>
    </View>
  );
}

async function fetchAllOfficeSummaries(): Promise<OfficeSummary[]> {
  return Promise.race([doFetch(), hardTimeout(12_000)]);
}

function hardTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), ms),
  );
}

async function doFetch(): Promise<OfficeSummary[]> {
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
  const errors: unknown[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') summaries.push(r.value);
    else errors.push(r.reason);
  }

  // If every office failed, surface the first error so useQuery shows the error state
  if (summaries.length === 0 && errors.length > 0) {
    throw errors[0];
  }

  return summaries;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#C7D3D3', padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { fontSize: 15, color: '#555' },
  retryBtn: { backgroundColor: '#006559', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  retryBtnText: { color: '#fff', fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  header: { fontSize: 32, fontWeight: '800', color: '#1e1b14', letterSpacing: -0.5 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  cardTotal: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  statusRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusCount: { fontSize: 14, fontWeight: '700', color: '#111' },
  segmentBar: { height: 8, flexDirection: 'row', borderRadius: 4, overflow: 'hidden', backgroundColor: '#e5e7eb' },
  segmentFill: {},
  segmentFirst: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  segmentLast: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
});
