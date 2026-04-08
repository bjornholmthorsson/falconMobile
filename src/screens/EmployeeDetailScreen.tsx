/**
 * EmployeeDetailScreen — modal/sheet with employee details, Teams presence,
 * call / SMS / Teams-chat actions.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Image,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserPhoto } from '../services/graphService';
import {
  getUserInformation,
  getUserSettings,
  getKnownLocations,
  getLocationSubscriptions,
  createLocationSubscription,
  deleteLocationSubscription,
} from '../services/api';
import { useAppStore } from '../store/appStore';
import type { Employee, UserData, KnownLocation, LocationSubscription } from '../models';

const SLACK_TEAM_ID = 'TD8GE7QFQ';

type Props = {
  employee: Employee | null;
  visible: boolean;
  onClose: () => void;
};

export default function EmployeeDetailScreen({ employee, visible, onClose }: Props) {
  const currentUser = useAppStore(s => s.currentUser);
  const queryClient = useQueryClient();

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

  const { data: targetSettings } = useQuery({
    queryKey: ['userSettings', employee?.userId],
    queryFn: () => getUserSettings(employee!.userId),
    enabled: !!employee && visible,
    staleTime: 5 * 60 * 1000,
  });

  const { data: knownLocations } = useQuery<KnownLocation[]>({
    queryKey: ['knownLocations'],
    queryFn: () => getKnownLocations(),
    enabled: !!employee && visible && !!targetSettings?.checkinEnabled,
    staleTime: 10 * 60 * 1000,
  });

  const { data: subscriptions, isLoading: subsLoading } = useQuery<LocationSubscription[]>({
    queryKey: ['locationSubscriptions', currentUser?.id, employee?.userId],
    queryFn: () => getLocationSubscriptions(currentUser!.id, employee!.userId),
    enabled: !!currentUser && !!employee && visible && !!targetSettings?.checkinEnabled,
    staleTime: 30 * 1000,
  });

  const subsQueryKey = ['locationSubscriptions', currentUser?.id, employee?.userId];

  const subscribeMutation = useMutation({
    mutationFn: (locationName: string) =>
      createLocationSubscription(currentUser!.id, employee!.userId, locationName),
    onMutate: async (locationName: string) => {
      await queryClient.cancelQueries({ queryKey: subsQueryKey });
      const previous = queryClient.getQueryData<LocationSubscription[]>(subsQueryKey);
      queryClient.setQueryData<LocationSubscription[]>(subsQueryKey, old => [
        ...(old ?? []),
        { id: -Date.now(), subscriberUserId: currentUser!.id, targetUserId: employee!.userId, locationName, createdAt: new Date().toISOString() },
      ]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(subsQueryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: subsQueryKey });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: (id: number) => deleteLocationSubscription(id),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: subsQueryKey });
      const previous = queryClient.getQueryData<LocationSubscription[]>(subsQueryKey);
      queryClient.setQueryData<LocationSubscription[]>(subsQueryKey, old =>
        (old ?? []).filter(s => s.id !== id),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(subsQueryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: subsQueryKey });
    },
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

  function isSubscribed(locationName: string): LocationSubscription | undefined {
    return subscriptions?.find(s => s.locationName === locationName);
  }

  function toggleSubscription(locationName: string) {
    const existing = isSubscribed(locationName);
    if (existing) {
      unsubscribeMutation.mutate(existing.id);
    } else {
      subscribeMutation.mutate(locationName);
    }
  }

  const showNotifySection = targetSettings?.checkinEnabled && !!currentUser && currentUser.id !== employee.userId;

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
            <TouchableOpacity style={styles.btnPhone} onPress={openPhone} activeOpacity={0.8}>
              <Icon name="phone-outline" size={24} color="#006559" />
            </TouchableOpacity>
          )}
          {employee.mobilePhone && (
            <TouchableOpacity style={styles.btnSms} onPress={openSms} activeOpacity={0.8}>
              <Icon name="message-outline" size={24} color="#0ea5e9" />
            </TouchableOpacity>
          )}
          {employee.mobilePhone && (
            <TouchableOpacity
              style={styles.btnWhatsApp}
              onPress={() => {
                const digits = employee!.mobilePhone!.replace(/\D/g, '');
                Linking.openURL(`whatsapp://send?phone=${digits}`);
              }}
              activeOpacity={0.8}
            >
              <Icon name="whatsapp" size={24} color="#25D366" />
            </TouchableOpacity>
          )}
          {employee.userPrincipalName && (
            <TouchableOpacity style={styles.btnTeams} onPress={openTeams} activeOpacity={0.8}>
              <Icon name="microsoft-teams" size={24} color="#6264A7" />
            </TouchableOpacity>
          )}
          {userData?.slackMemberId && (
            <TouchableOpacity
              style={styles.btnSlack}
              onPress={() => Linking.openURL(`slack://user?team=${SLACK_TEAM_ID}&id=${userData!.slackMemberId}`).catch(() => Linking.openURL(`https://app.slack.com/client/${SLACK_TEAM_ID}`))}
              activeOpacity={0.8}
            >
              <Icon name="slack" size={24} color="#4A154B" />
            </TouchableOpacity>
          )}
        </View>

        {showNotifySection && (
          <View style={styles.notifySection}>
            <View style={styles.notifyHeader}>
              <Icon name="bell-ring-outline" size={16} color="#006559" />
              <Text style={styles.notifySectionTitle}>Notify me when arrives at</Text>
            </View>
            {subsLoading ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color="#006559" />
            ) : knownLocations && knownLocations.length > 0 ? (
              <View style={styles.notifyGrid}>
                {knownLocations.map(loc => {
                  const sub = isSubscribed(loc.clientName);
                  const isActive = subscribeMutation.isPending && subscribeMutation.variables === loc.clientName;
                  const isRemoving = unsubscribeMutation.isPending && sub && unsubscribeMutation.variables === sub.id;
                  const loading = isActive || isRemoving;
                  return (
                    <TouchableOpacity
                      key={loc.id}
                      style={[styles.notifyChip, sub && styles.notifyChipActive]}
                      onPress={() => toggleSubscription(loc.clientName)}
                      activeOpacity={0.75}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color={sub ? '#fff' : '#006559'} />
                      ) : (
                        <Icon
                          name={sub ? 'bell-check' : 'bell-plus-outline'}
                          size={15}
                          color={sub ? '#fff' : '#006559'}
                        />
                      )}
                      <Text style={[styles.notifyChipText, sub && styles.notifyChipTextActive]}>
                        {loc.clientName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.notifyEmpty}>No known locations available</Text>
            )}
          </View>
        )}
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
  btnPhone: {
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: 'rgba(0,101,89,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  btnSms: {
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: 'rgba(14,165,233,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  btnWhatsApp: {
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: 'rgba(37,211,102,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  btnTeams: {
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: 'rgba(98,100,167,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  btnSlack: {
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: 'rgba(74,21,75,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  notifySection: {
    marginTop: 16,
    marginBottom: 32,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  notifyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  notifySectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#006559',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  notifyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  notifyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#006559',
    backgroundColor: '#fff',
  },
  notifyChipActive: {
    backgroundColor: '#006559',
    borderColor: '#006559',
  },
  notifyChipText: {
    fontSize: 14,
    color: '#006559',
    fontWeight: '500',
  },
  notifyChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  notifyEmpty: {
    fontSize: 14,
    color: '#aaa',
    paddingVertical: 12,
  },
});
