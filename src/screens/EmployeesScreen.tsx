/**
 * EmployeesScreen — Company Directory with card-based layout.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  Linking,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery } from '@tanstack/react-query';
import {
  getUsersByOffice,
  getPresenceForUsers,
  getUserPhoto,
  OFFICES,
} from '../services/graphService';
import { getUserAbsences, getUserLocations } from '../services/api';
import type { Employee, User, TeamsPresence, UserAbsence, UserLocation } from '../models';

const REFRESH_INTERVAL_MS = 60_000;

type Props = {
  onSelectEmployee: (employee: Employee) => void;
};

export default function EmployeesScreen({ onSelectEmployee }: Props) {
  const [search, setSearch] = useState('');

  const { data: employees, refetch, isRefetching } = useQuery<Employee[]>({
    queryKey: ['employees', 'all'],
    queryFn: fetchAllEmployees,
    staleTime: 30_000,
  });

  useEffect(() => {
    const id = setInterval(refetch, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = employees ?? [];
    const sorted = base.slice().sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter(
      e =>
        e.name.toLowerCase().includes(q) ||
        (e.title ?? '').toLowerCase().includes(q),
    );
  }, [employees, search]);

  const totalCount = employees?.length ?? 0;

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.userId}
        renderItem={({ item }) => (
          <EmployeeCard employee={item} onPress={() => onSelectEmployee(item)} />
        )}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headingRow}>
              {isRefetching && <ActivityIndicator size="small" color="#1e1b14" />}
            </View>
            <Text style={styles.subheading}>
              Connecting {totalCount} team members, synchronized in real-time with Teams.
            </Text>
            <View style={styles.searchWrapper}>
              <Icon name="magnify" size={20} color="#9ca3af" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name, role, or skill..."
                placeholderTextColor="#9ca3af"
                value={search}
                onChangeText={setSearch}
                clearButtonMode="while-editing"
              />
            </View>
          </View>
        }
      />
    </View>
  );
}

function EmployeeCard({
  employee,
  onPress,
}: {
  employee: Employee;
  onPress: () => void;
}) {
  const { data: photo } = useQuery({
    queryKey: ['photo', employee.userId],
    queryFn: () => getUserPhoto(employee.userId),
    staleTime: 5 * 60 * 1000,
  });

  const isAvailable =
    employee.teamsAvailability === 'Available' ||
    employee.teamsAvailability === 'AvailableIdle';

  const { label, dot, badge } = statusStyle(employee.teamsAvailability);

  return (
    <View style={styles.card}>
      {/* Badge row: location left, status right */}
      <View style={styles.badgeRow}>
        {employee.lastKnownLocation ? (
          <View style={[
            styles.locationBadge,
            employee.locationChanged && (Date.now() - employee.locationChanged.getTime() > 24 * 60 * 60 * 1000)
              ? styles.locationBadgeStale
              : null,
          ]}>
            <Text style={styles.locationBadgeText}>{employee.lastKnownLocation.toUpperCase()}</Text>
          </View>
        ) : <View />}
        <View style={[styles.statusBadge, { backgroundColor: badge }]}>
          <View style={[styles.statusDot, { backgroundColor: dot }]} />
          <Text style={styles.statusLabel}>{label}</Text>
        </View>
      </View>

      {/* Top row: photo + info */}
      <View style={styles.cardTop}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={styles.photoInitials}>
              {employee.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{employee.name}</Text>
          {employee.title ? (
            <Text style={styles.cardTitle}>{employee.title}</Text>
          ) : null}
          <Text style={styles.cardLocation}>
            {employee.lastKnownLocation || employee.location}
          </Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.cardActions}>
        {employee.mobilePhone ? (
          <TouchableOpacity
            style={styles.btnWhatsApp}
            activeOpacity={0.8}
            onPress={() => {
              const digits = employee.mobilePhone!.replace(/\D/g, '');
              Linking.openURL(`whatsapp://send?phone=${digits}`);
            }}
          >
            <Icon name="whatsapp" size={22} color="#25D366" />
          </TouchableOpacity>
        ) : null}
        {employee.userPrincipalName ? (
          <TouchableOpacity
            style={styles.btnTeams}
            activeOpacity={0.8}
            onPress={() => {
              Linking.openURL(`msteams://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(employee.userPrincipalName!)}`);
            }}
          >
            <Icon name="microsoft-teams" size={22} color="#6264A7" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.btnIcon} onPress={onPress} activeOpacity={0.8}>
          <Icon
            name={isAvailable ? 'calendar-outline' : 'dots-horizontal'}
            size={20}
            color="#006559"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function statusStyle(availability: string): {
  label: string;
  dot: string;
  badge: string;
} {
  switch (availability) {
    case 'Available':
    case 'AvailableIdle':
      return { label: 'AVAILABLE', dot: '#22c55e', badge: 'rgba(34,197,94,0.12)' };
    case 'Away':
    case 'BeRightBack':
      return { label: 'AWAY', dot: '#f97316', badge: 'rgba(249,115,22,0.12)' };
    case 'Busy':
    case 'BusyIdle':
      return { label: 'IN A MEETING', dot: '#ef4444', badge: 'rgba(239,68,68,0.12)' };
    case 'DoNotDisturb':
      return { label: 'DO NOT DISTURB', dot: '#ef4444', badge: 'rgba(239,68,68,0.12)' };
    default:
      return { label: 'OFFLINE', dot: '#9ca3af', badge: 'rgba(156,163,175,0.12)' };
  }
}

async function fetchAllEmployees(): Promise<Employee[]> {
  const [officeResults, absences, locations] = await Promise.all([
    Promise.allSettled(OFFICES.map(office => getUsersByOffice(office).then(users => ({ office, users })))),
    getUserAbsences().catch(() => [] as UserAbsence[]),
    getUserLocations().catch(() => [] as UserLocation[]),
  ]);

  const userMap = new Map<string, { user: User; office: string }>();
  for (const result of officeResults) {
    if (result.status === 'fulfilled') {
      for (const user of result.value.users) {
        if (!userMap.has(user.id)) {
          userMap.set(user.id, { user, office: result.value.office });
        }
      }
    }
  }

  const EXCLUDED_NAME_PATTERNS = /meeting room|phone booth|admin/i;
  const activeUsers = [...userMap.values()].filter(
    ({ user }) => user.accountEnabled && !EXCLUDED_NAME_PATTERNS.test(user.displayName),
  );
  const ids = activeUsers.map(({ user }) => user.id);
  const presences = ids.length ? await getPresenceForUsers(ids) : [];

  const presenceMap = new Map<string, TeamsPresence>(presences.map(p => [p.id, p]));
  const absenceMap = new Map<string, UserAbsence>();
  for (const a of absences) absenceMap.set(a.userId, a);
  const locationMap = new Map<string, UserLocation>();
  for (const l of locations) locationMap.set(l.id, l);

  return activeUsers.map(({ user: u, office }) => {
    const presence = presenceMap.get(u.id);
    const absence = absenceMap.get(u.id);
    const loc = locationMap.get(u.id);
    return {
      userId: u.id,
      name: u.displayName,
      title: u.jobTitle,
      mobilePhone: u.mobilePhone,
      userPrincipalName: u.userPrincipalName ?? null,
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
    case 'AvailableIdle':    return 'available' as const;
    case 'Away':
    case 'BeRightBack':      return 'away' as const;
    case 'Busy':
    case 'BusyIdle':         return 'busy' as const;
    case 'DoNotDisturb':     return 'do_not_disturb' as const;
    case 'Offline':
    case 'PresenceUnknown':  return 'offline' as const;
    default:                 return 'unknown' as const;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#C7D3D3',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },

  // Header
  header: {
    paddingTop: 24,
    paddingBottom: 8,
    gap: 8,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1e1b14',
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {},
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1e1b14',
    padding: 0,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(249,115,22,0.15)',
  },
  locationBadgeStale: {
    backgroundColor: 'rgba(156,163,175,0.2)',
  },
  locationBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#374151',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#374151',
  },
  cardTop: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
  },
  photo: {
    width: 76,
    height: 76,
    borderRadius: 10,
  },
  photoPlaceholder: {
    backgroundColor: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitials: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 22,
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  cardName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e1b14',
    letterSpacing: -0.2,
  },
  cardTitle: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '400',
  },
  cardLocation: {
    fontSize: 13,
    color: '#006559',
    fontWeight: '500',
  },

  // Buttons
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  btnOutline: {
    width: 110,
    borderWidth: 1.5,
    borderColor: '#006559',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnOutlineText: {
    color: '#006559',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  btnWhatsApp: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(37,211,102,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTeams: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(98,100,167,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(0,101,89,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
