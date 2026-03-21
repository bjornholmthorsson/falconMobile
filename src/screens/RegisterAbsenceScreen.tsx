/**
 * RegisterAbsenceScreen — lets the current user register an absence.
 * Sends a Teams notification to the supervisor after registration.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getAbsenceTypes, registerAbsence } from '../services/api';
import { sendAbsenceNotification } from '../services/graphService';
import { useAppStore } from '../store/appStore';
import type { Absence } from '../models';

export default function RegisterAbsenceScreen() {
  const currentUser = useAppStore(s => s.currentUser);
  const { data: absenceTypes = [] } = useQuery<Absence[]>({
    queryKey: ['absenceTypes'],
    queryFn: () => getAbsenceTypes(),
    staleTime: Infinity,
  });

  const [selectedType, setSelectedType] = useState<Absence | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!currentUser) {
      Alert.alert('Error', 'Not signed in');
      return;
    }
    if (!selectedType) {
      Alert.alert('Validation', 'Please select an absence type');
      return;
    }
    if (!fromDate || !toDate) {
      Alert.alert('Validation', 'Please enter start and end date/time (YYYY-MM-DDTHH:mm)');
      return;
    }

    setLoading(true);
    try {
      const from = new Date(fromDate);
      const to = new Date(toDate);

      await registerAbsence(currentUser.userPrincipalName, {
        sourceKey: currentUser.id,
        absenceKey: selectedType.absenceKey,
        absenceStartTime: from.toISOString(),
        absenceEndTime: to.toISOString(),
        userId: currentUser.id,
        userName: currentUser.displayName,
        comment,
      });

      await sendAbsenceNotification(selectedType.absenceKey, from, to, comment);

      Alert.alert('Registered', 'Absence has been registered and supervisor notified.');
      setSelectedType(null);
      setFromDate('');
      setToDate('');
      setComment('');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.header}>Register Absence</Text>

      <Text style={styles.sectionLabel}>Type</Text>
      <View style={styles.typeList}>
        {(absenceTypes as Absence[]).map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.typeChip, selectedType?.id === t.id && styles.typeChipSelected]}
            onPress={() => setSelectedType(t)}
          >
            <Text style={[styles.typeChipText, selectedType?.id === t.id && styles.typeChipTextSelected]}>
              {t.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>From (YYYY-MM-DDTHH:mm)</Text>
      <TextInput
        style={styles.input}
        value={fromDate}
        onChangeText={setFromDate}
        placeholder="2025-03-21T09:00"
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
      />

      <Text style={styles.sectionLabel}>To (YYYY-MM-DDTHH:mm)</Text>
      <TextInput
        style={styles.input}
        value={toDate}
        onChangeText={setToDate}
        placeholder="2025-03-21T17:00"
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
      />

      <Text style={styles.sectionLabel}>Comment (optional)</Text>
      <TextInput
        style={[styles.input, styles.commentInput]}
        value={comment}
        onChangeText={setComment}
        placeholder="Add a note…"
        multiline
        numberOfLines={3}
      />

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#10493C" />
      ) : (
        <TouchableOpacity style={styles.submitBtn} onPress={handleRegister}>
          <Text style={styles.submitBtnText}>Register Absence</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 20, color: '#111' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6, textTransform: 'uppercase' },
  typeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  typeChipSelected: { backgroundColor: '#10493C', borderColor: '#10493C' },
  typeChipText: { fontSize: 14, color: '#374151' },
  typeChipTextSelected: { color: '#fff', fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  commentInput: { height: 80, textAlignVertical: 'top' },
  loader: { marginTop: 20 },
  submitBtn: {
    backgroundColor: '#10493C',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
