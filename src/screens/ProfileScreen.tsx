import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe, updateUser, getUserPhoto } from '../services/graphService';
import { getUserData, registerUserData } from '../services/api';
import { signOut } from '../services/authService';
import { useAppStore } from '../store/appStore';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: APP_VERSION } = require('../../package.json') as { version: string };

export default function ProfileScreen() {
  const currentUser     = useAppStore(s => s.currentUser);
  const setCurrentUser  = useAppStore(s => s.setCurrentUser);
  const setIsAuthenticated = useAppStore(s => s.setIsAuthenticated);
  const qc = useQueryClient();

  const { data: photo } = useQuery({
    queryKey: ['photo', currentUser?.userPrincipalName],
    queryFn: () => getUserPhoto(currentUser!.userPrincipalName),
    enabled: !!currentUser,
    staleTime: 5 * 60 * 1000,
  });

  const { data: userData } = useQuery({
    queryKey: ['userData', currentUser?.id],
    queryFn: () => getUserData([currentUser!.id]),
    enabled: !!currentUser,
  });

  const [editMobileOpen, setEditMobileOpen] = useState(false);
  const [mobile, setMobile] = useState(currentUser?.mobilePhone ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSaveMobile() {
    if (!currentUser) return;
    setSaving(true);
    try {
      await updateUser(currentUser.id, mobile);
      await registerUserData(currentUser.id, { mobile });
      const updated = await getMe();
      setCurrentUser(updated);
      qc.invalidateQueries({ queryKey: ['userData'] });
      setEditMobileOpen(false);
      Alert.alert('Saved', 'Mobile number updated.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          setCurrentUser(null);
          setIsAuthenticated(false);
        },
      },
    ]);
  }

  const teamsHandle = currentUser?.userPrincipalName
    ? '@' + currentUser.userPrincipalName.split('@')[0]
    : null;

  const phone = currentUser?.mobilePhone ?? currentUser?.businessPhone ?? null;
  const ud = userData?.[0];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      {/* ── Profile card ── */}
      <View style={styles.profileCard}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitials}>
              {currentUser?.displayName?.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.displayName}>{currentUser?.displayName}</Text>
        {currentUser?.jobTitle && (
          <Text style={styles.jobTitle}>{currentUser.jobTitle}</Text>
        )}
        {currentUser?.officeLocation && (
          <View style={styles.locationBadge}>
            <Text style={styles.locationBadgeText}>{currentUser.officeLocation.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {/* ── Contact card ── */}
      <View style={styles.contactCard}>
        <Text style={styles.contactTitle}>Contact</Text>
        {currentUser?.userPrincipalName && (
          <View style={styles.contactRow}>
            <Icon name="email-outline" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.contactText}>{currentUser.userPrincipalName}</Text>
          </View>
        )}
        {phone && (
          <View style={styles.contactRow}>
            <Icon name="phone-outline" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.contactText}>{phone}</Text>
          </View>
        )}
        {teamsHandle && (
          <View style={styles.contactRow}>
            <Icon name="microsoft-teams" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.contactText}>{teamsHandle}</Text>
          </View>
        )}
      </View>

      {/* ── Account Settings ── */}
      <Text style={styles.sectionHeader}>Account Settings</Text>
      <View style={styles.settingsCard}>
        <TouchableOpacity style={styles.settingsRow} onPress={() => setEditMobileOpen(true)} activeOpacity={0.7}>
          <View style={styles.settingsRowLeft}>
            <View style={styles.settingsIcon}>
              <Icon name="account-outline" size={20} color="#006559" />
            </View>
            <View>
              <Text style={styles.settingsRowTitle}>Personal Information</Text>
              <Text style={styles.settingsRowSub}>Update your mobile number</Text>
            </View>
          </View>
          <Icon name="chevron-right" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      {/* ── Member Details ── */}
      <Text style={styles.sectionHeader}>Member Details</Text>
      <View style={styles.memberCard}>
        {[
          { label: 'Department', value: currentUser?.department ?? null },
          { label: 'Role',       value: ud?.role ?? null },
          { label: 'Start Date', value: ud?.startDate ?? null },
          { label: 'Education',  value: ud?.education ?? null },
        ]
          .filter(row => !!row.value)
          .map((row, i, arr) => (
            <React.Fragment key={row.label}>
              <View style={styles.memberRow}>
                <Text style={styles.memberLabel}>{row.label}</Text>
                <Text style={styles.memberValue}>{row.value}</Text>
              </View>
              {i < arr.length - 1 && <View style={styles.memberDivider} />}
            </React.Fragment>
          ))}
      </View>

      {/* ── App Info ── */}
      <Text style={styles.sectionHeader}>App Info</Text>
      <View style={styles.appInfoCard}>
        <View style={styles.appInfoRow}>
          <Text style={styles.appInfoLabel}>VERSION</Text>
          <Text style={styles.appInfoValue}>{APP_VERSION}</Text>
        </View>
      </View>

      {/* ── Actions ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.7}>
        <Icon name="logout" size={18} color="#ef4444" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.helpBtn}
        onPress={() => Linking.openURL('tel:+31370767300')}
        activeOpacity={0.7}
      >
        <Icon name="help-circle-outline" size={18} color="#6b7280" />
        <Text style={styles.helpText}>Help Desk</Text>
      </TouchableOpacity>

      {/* ── Edit Mobile Modal ── */}
      <Modal visible={editMobileOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditMobileOpen(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Mobile Number</Text>
              <TouchableOpacity onPress={handleSaveMobile}>
                {saving
                  ? <ActivityIndicator color="#006559" />
                  : <Text style={styles.modalDone}>Save</Text>}
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.mobileInput}
              value={mobile}
              onChangeText={setMobile}
              placeholder="+354 xxx xxxx"
              keyboardType="phone-pad"
              autoFocus
            />
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#C7D3D3' },
  scroll:    { padding: 16, paddingBottom: 48 },

  // Profile card
  profileCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 16,
  },
  avatar: { width: 88, height: 88, borderRadius: 14, marginBottom: 14 },
  avatarPlaceholder: { backgroundColor: '#9ca3af', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#fff', fontSize: 30, fontWeight: '700' },
  displayName: { fontSize: 24, fontWeight: '800', color: '#111', marginBottom: 4 },
  jobTitle:    { fontSize: 14, color: '#6b7280', marginBottom: 10 },
  locationBadge: {
    backgroundColor: '#e6f4f1', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  locationBadgeText: { fontSize: 11, fontWeight: '700', color: '#006559', letterSpacing: 0.8 },

  // Contact card
  contactCard: {
    backgroundColor: '#006559', borderRadius: 16, padding: 20, marginBottom: 24,
  },
  contactTitle: { fontSize: 17, fontWeight: '700', color: '#fff', marginBottom: 14 },
  contactRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  contactText:  { fontSize: 14, color: '#fff', flex: 1 },

  // Section header
  sectionHeader: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 12 },

  // Settings card
  settingsCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 24, overflow: 'hidden' },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16,
  },
  settingsRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  settingsIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#e6f4f1', alignItems: 'center', justifyContent: 'center',
  },
  settingsRowTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  settingsRowSub:   { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  settingsDivider:  { height: 1, backgroundColor: '#f3f4f6', marginHorizontal: 16 },

  // Member details card
  memberCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  memberRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14 },
  memberLabel: { width: 100, fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  memberValue: { flex: 1, fontSize: 14, color: '#111', fontWeight: '500' },
  memberDivider: { height: 1, backgroundColor: '#f3f4f6', marginHorizontal: 16 },

  // App info card
  appInfoCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  appInfoRow: { padding: 16, alignItems: 'center' },
  appInfoLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  appInfoValue: { fontSize: 18, fontWeight: '700', color: '#111' },
  appInfoDivider: { height: 1, backgroundColor: '#f3f4f6' },

  // Actions
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
  helpBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  helpText:   { fontSize: 15, color: '#6b7280' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 40 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  modalTitle:  { fontSize: 16, fontWeight: '600', color: '#111' },
  modalCancel: { fontSize: 16, color: '#9ca3af' },
  modalDone:   { fontSize: 16, color: '#006559', fontWeight: '700' },
  mobileInput: {
    margin: 20, borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 10, padding: 14, fontSize: 16,
  },
});
