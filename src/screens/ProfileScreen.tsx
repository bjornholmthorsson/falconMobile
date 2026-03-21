/**
 * ProfileScreen — current user's profile, editable mobile number, sign out.
 */
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
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe, updateUser } from '../services/graphService';
import { getUserData, registerUserData } from '../services/api';
import { signOut } from '../services/authService';
import { useAppStore } from '../store/appStore';

export default function ProfileScreen() {
  const { currentUser, setCurrentUser } = useAppStore(s => ({
    currentUser: s.currentUser,
    setCurrentUser: s.setCurrentUser,
  }));
  const qc = useQueryClient();

  const { data: userData } = useQuery({
    queryKey: ['userData', currentUser?.id],
    queryFn: () => getUserData([currentUser!.id]),
    enabled: !!currentUser,
  });

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
        },
      },
    ]);
  }

  const ud = userData?.[0];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>My Profile</Text>

      <View style={styles.card}>
        <Text style={styles.displayName}>{currentUser?.displayName}</Text>
        <Text style={styles.upn}>{currentUser?.userPrincipalName}</Text>
        {currentUser?.jobTitle && (
          <Text style={styles.jobTitle}>{currentUser.jobTitle}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mobile Number</Text>
        <TextInput
          style={styles.input}
          value={mobile}
          onChangeText={setMobile}
          placeholder="+354 xxx xxxx"
          keyboardType="phone-pad"
        />
        {saving ? (
          <ActivityIndicator color="#0078D4" />
        ) : (
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveMobile}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        )}
      </View>

      {ud && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Employee Data</Text>
          {ud.role && <InfoRow label="Role" value={ud.role} />}
          {ud.startDate && <InfoRow label="Start date" value={ud.startDate} />}
          {ud.city && <InfoRow label="City" value={ud.city} />}
          {ud.education && <InfoRow label="Education" value={ud.education} />}
        </View>
      )}

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#111' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  displayName: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 4 },
  upn: { fontSize: 13, color: '#666', marginBottom: 4 },
  jobTitle: { fontSize: 14, color: '#0078D4' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#111' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  saveBtn: {
    backgroundColor: '#0078D4',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  infoRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  infoLabel: { width: 100, fontSize: 14, color: '#888' },
  infoValue: { flex: 1, fontSize: 14, color: '#111' },
  signOutBtn: {
    margin: 16,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
    alignItems: 'center',
  },
  signOutText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
});
