/**
 * EmployeesScreen — employee list with search, pull-to-refresh, presence, absence.
 * Auto-refreshes every 60 seconds (matching Xamarin timer).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  getUsersByOffice,
  getPresenceForUsers,
  getUserPhoto,
} from '../services/graphService';
import { getUserAbsences, getUserLocations } from '../services/api';
import { useAppStore } from '../store/appStore';
import type { Employee, User, TeamsPresence, UserAbsence, UserLocation } from '../models';

const REFRESH_INTERVAL_MS = 60_000;

type Props = {
  onSelectEmployee: (employee: Employee) => void;
};

export default function EmployeesScreen({ onSelectEmployee }: Props) {
  const selectedOffice = useAppStore(s => s.selectedOffice);
  const [search, setSearch] = useState('');

  const { data: employees, refetch, isRefetching } = useQuery<Employee[]>({
    queryKey: ['employees', selectedOffice],
    queryFn: () => fetchEmployees(selectedOffice),
    staleTime: 30_000,
  });

  useEffect(() => {
    const id = setInterval(refetch, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees ?? [];
    return (employees ?? []).filter(
      e =>
        e.name.toLowerCase().includes(q) ||
        (e.title ?? '').toLowerCase().includes(q),
    );
  }, [employees, search]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search employees…"
        value={search}
        onChangeText={setSearch}
        clearButtonMode="while-editing"
      />
      <FlatList
        data={filtered}
        keyExtractor={item => item.userId}
        renderItem={({ item }) => (
          <EmployeeRow employee={item} onPress={() => onSelectEmployee(item)} />
        )}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

function EmployeeRow({
  employee,
  onPress,
}: {
  employee: Employee;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <PresenceDot status={employee.teamsAvailability} />
      {employee.photo ? (
        <Image source={{ uri: employee.photo }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitials}>
            {employee.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.name}>{employee.name}</Text>
        {employee.title && <Text style={styles.title}>{employee.title}</Text>}
        <Text style={styles.location}>{employee.lastKnownLocation || employee.location}</Text>
      </View>
      {employee.absence && (
        <Text style={styles.absenceBadge}>{employee.absence}</Text>
      )}
    </TouchableOpacity>
  );
}

function PresenceDot({ status }: { status: string }) {
  const color = presenceColor(status);
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

function presenceColor(availability: string): string {
  switch (availability) {
    case 'Available':
    case 'AvailableIdle':
      return '#22c55e';
    case 'Away':
    case 'BeRightBack':
      return '#eab308';
    case 'Busy':
    case 'BusyIdle':
    case 'DoNotDisturb':
      return '#ef4444';
    default:
      return '#9ca3af';
  }
}

async function fetchEmployees(office: string): Promise<Employee[]> {
  const [users, absences, locations] = await Promise.all([
    getUsersByOffice(office),
    getUserAbsences(),
    getUserLocations(),
  ]);

  const activeUsers = users.filter(u => u.accountEnabled);
  const ids = activeUsers.map(u => u.id);
  const presences = ids.length ? await getPresenceForUsers(ids) : [];
  const presenceMap = new Map<string, TeamsPresence>(presences.map(p => [p.id, p]));
  const absenceMap = new Map<string, UserAbsence>();
  for (const a of absences) absenceMap.set(a.userId, a);
  const locationMap = new Map<string, UserLocation>();
  for (const l of locations) locationMap.set(l.username, l);

  return activeUsers.map(u => {
    const presence = presenceMap.get(u.id);
    const absence = absenceMap.get(u.id);
    const loc = locationMap.get(u.userPrincipalName);
    return {
      userId: u.id,
      name: u.displayName,
      title: u.jobTitle,
      mobilePhone: u.mobilePhone,
      location: u.officeLocation ?? office,
      lastKnownLocation: loc?.location ?? '',
      locationChanged: loc ? new Date(loc.lastUpdated) : null,
      teamsAvailability: presence?.availability ?? 'Offline',
      teamsActivity: presence?.activity ?? '',
      statusImage: mapTeamsStatus(presence?.availability),
      absence: absence?.absenceKey ?? null,
      absenceKey: absence?.absenceKey ?? null,
      absenceComment: absence?.comment ?? null,
      absenceImage: null,
      photo: null,
    };
  });
}

function mapTeamsStatus(availability?: string) {
  switch (availability) {
    case 'Available':
    case 'AvailableIdle':
      return 'available' as const;
    case 'Away':
    case 'BeRightBack':
      return 'away' as const;
    case 'Busy':
    case 'BusyIdle':
      return 'busy' as const;
    case 'DoNotDisturb':
      return 'do_not_disturb' as const;
    case 'Offline':
    case 'PresenceUnknown':
      return 'offline' as const;
    default:
      return 'unknown' as const;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  search: {
    margin: 12,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  list: { paddingHorizontal: 12, paddingBottom: 16 },
  separator: { height: 1, backgroundColor: '#e5e7eb' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    gap: 10,
    borderRadius: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { backgroundColor: '#0078D4', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#fff', fontWeight: '600', fontSize: 16 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  title: { fontSize: 13, color: '#666', marginTop: 1 },
  location: { fontSize: 12, color: '#999', marginTop: 1 },
  absenceBadge: {
    fontSize: 11,
    color: '#fff',
    backgroundColor: '#f59e0b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
