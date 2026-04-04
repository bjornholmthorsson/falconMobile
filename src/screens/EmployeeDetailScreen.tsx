/**
 * EmployeeDetailScreen — modal/sheet with employee details, Teams presence,
 * call / SMS / Teams-chat actions.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Image,
  ScrollView,
  Modal,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getUserPhoto } from '../services/graphService';
import { getUserInformation } from '../services/api';
import type { Employee, UserData } from '../models';

type Props = {
  employee: Employee | null;
  visible: boolean;
  onClose: () => void;
};

export default function EmployeeDetailScreen({ employee, visible, onClose }: Props) {
  const { data: photo } = useQuery({
    queryKey: ['photo', employee?.userId],
    queryFn: () => getUserPhoto(employee!.userId),
    enabled: !!employee && visible,
    staleTime: 5 * 60 * 1000,
  });

  const { data: userData } = useQuery<UserData | null>({
    queryKey: ['userData', employee?.userId],
    queryFn: async () => {
      const results = await getUserInformation(employee!.userId);
      return results[0] ?? null;
    },
    enabled: !!employee && visible,
    staleTime: 5 * 60 * 1000,
  });

  if (!employee) return null;

  function openPhone() {
    if (employee!.mobilePhone) Linking.openURL(`tel:${employee!.mobilePhone}`);
  }

  function openSms() {
    if (employee!.mobilePhone) Linking.openURL(`sms:${employee!.mobilePhone}`);
  }

  function openTeams() {
    Linking.openURL(`msteams://l/chat/0/0?users=${employee!.userId}`);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={styles.container}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitials}>
                {employee.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.name}>{employee.name}</Text>
            {employee.title && <Text style={styles.title}>{employee.title}</Text>}
            <View style={styles.statusRow}>
              <PresenceDot availability={employee.teamsAvailability} />
              <Text style={styles.statusText}>{employee.teamsAvailability}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <DetailRow
            label="Location"
            value={
              employee.lastKnownLocation
                ? formatLocationSince(employee.lastKnownLocation, employee.locationChanged)
                : employee.location
            }
          />
          {employee.mobilePhone && (
            <DetailRow label="Mobile" value={employee.mobilePhone} />
          )}
          {userData?.role && (
            <DetailRow label="Role" value={userData.role} />
          )}
          {(userData?.street || userData?.postalCode) && (
            <DetailRow label="Home Address" value={[userData.street, userData.postalCode].filter(Boolean).join(' ')} />
          )}
          {userData?.city && (
            <DetailRow label="City" value={userData.city} />
          )}
          {employee.absence && (
            <DetailRow label="Absence" value={employee.absence} />
          )}
          {employee.absenceComment && (
            <DetailRow label="Note" value={employee.absenceComment} />
          )}
        </View>

        <View style={styles.actions}>
          {employee.mobilePhone && (
            <>
              <ActionButton label="Call" color="#22c55e" onPress={openPhone} />
              <ActionButton label="SMS" color="#006559" onPress={openSms} />
            </>
          )}
          <ActionButton label="Teams" color="#6264A7" onPress={openTeams} />
        </View>
      </ScrollView>
    </Modal>
  );
}

function formatLocationSince(location: string, since: Date | null): string {
  if (!since) return location;
  const now = new Date();
  const isToday =
    since.getFullYear() === now.getFullYear() &&
    since.getMonth() === now.getMonth() &&
    since.getDate() === now.getDate();
  const time = since.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `${location}, Checked in: ${time}`;
  const date = since.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${location}, Checked in: ${date} ${time}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: color }]} onPress={onPress}>
      <Text style={styles.actionBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function PresenceDot({ availability }: { availability: string }) {
  const color = presenceColor(availability);
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

function presenceColor(availability: string): string {
  switch (availability) {
    case 'Available':
    case 'AvailableIdle': return '#22c55e';
    case 'Away':
    case 'BeRightBack': return '#eab308';
    case 'Busy':
    case 'BusyIdle':
    case 'DoNotDisturb': return '#ef4444';
    default: return '#9ca3af';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  closeBtn: { padding: 16, alignItems: 'flex-end' },
  closeBtnText: { fontSize: 16, color: '#006559', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#fff',
    gap: 16,
    alignItems: 'center',
  },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: { backgroundColor: '#006559', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#fff', fontWeight: '700', fontSize: 26 },
  headerText: { flex: 1 },
  name: { fontSize: 20, fontWeight: '700', color: '#111' },
  title: { fontSize: 14, color: '#555', marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 13, color: '#555' },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    paddingVertical: 4,
  },
  detailRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: { width: 90, fontSize: 14, color: '#888' },
  detailValue: { flex: 1, fontSize: 14, color: '#111' },
  actions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    justifyContent: 'center',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
