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
  Modal,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useQuery } from '@tanstack/react-query';
import { getAbsenceTypes, registerAbsence } from '../services/api';
import { sendAbsenceNotification } from '../services/graphService';
import { useAppStore } from '../store/appStore';
import type { Absence } from '../models';

// ── DateTimeField ─────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}  ·  ${hh}:${mm}`;
}

function DateTimeField({
  label,
  value,
  onChange,
  minimumDate,
}: {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  // Android needs two steps: pick date then pick time
  const [androidStep, setAndroidStep] = useState<'date' | 'time'>('date');
  const [tempDate, setTempDate] = useState(value);

  function handleAndroid(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'dismissed') {
      setOpen(false);
      return;
    }
    const picked = selected ?? tempDate;
    if (androidStep === 'date') {
      setTempDate(picked);
      setAndroidStep('time');
    } else {
      setOpen(false);
      setAndroidStep('date');
      onChange(picked);
    }
  }

  function handleIOS(event: DateTimePickerEvent, selected?: Date) {
    if (selected) setTempDate(selected);
  }

  function confirmIOS() {
    setOpen(false);
    onChange(tempDate);
  }

  function openPicker() {
    setTempDate(value);
    setAndroidStep('date');
    setOpen(true);
  }

  return (
    <View style={df.wrapper}>
      <Text style={df.label}>{label}</Text>
      <TouchableOpacity style={df.field} onPress={openPicker}>
        <Text style={df.dateText}>{formatDate(value)}</Text>
        <Text style={df.chevron}>›</Text>
      </TouchableOpacity>

      {/* Android: native dialog (date then time) */}
      {Platform.OS === 'android' && open && (
        <DateTimePicker
          value={tempDate}
          mode={androidStep}
          display="default"
          minimumDate={androidStep === 'date' ? minimumDate : undefined}
          onChange={handleAndroid}
        />
      )}

      {/* iOS: inline picker inside a modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide">
          <View style={df.modalOverlay}>
            <View style={df.modalSheet}>
              <View style={df.modalHeader}>
                <TouchableOpacity onPress={() => setOpen(false)}>
                  <Text style={df.cancelBtn}>Cancel</Text>
                </TouchableOpacity>
                <Text style={df.modalTitle}>{label}</Text>
                <TouchableOpacity onPress={confirmIOS}>
                  <Text style={df.doneBtn}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="datetime"
                display="inline"
                minimumDate={minimumDate}
                onChange={handleIOS}
                themeVariant="light"
                accentColor="#10493C"
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const df = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6, textTransform: 'uppercase' },
  field: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: { fontSize: 15, color: '#111' },
  chevron: { fontSize: 20, color: '#9ca3af', marginTop: -1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  cancelBtn: { fontSize: 16, color: '#9ca3af' },
  doneBtn: { fontSize: 16, color: '#10493C', fontWeight: '700' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

function defaultFrom(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d;
}

function defaultTo(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 8, 0, 0, 0);
  return d;
}

export default function RegisterAbsenceScreen() {
  const currentUser = useAppStore(s => s.currentUser);
  const { data: absenceTypes = [] } = useQuery<Absence[]>({
    queryKey: ['absenceTypes'],
    queryFn: () => getAbsenceTypes(),
    staleTime: Infinity,
  });

  const [selectedType, setSelectedType] = useState<Absence | null>(null);
  const [fromDate, setFromDate] = useState<Date>(defaultFrom);
  const [toDate, setToDate] = useState<Date>(defaultTo);
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
    if (toDate <= fromDate) {
      Alert.alert('Validation', 'End time must be after start time');
      return;
    }

    setLoading(true);
    try {
      await registerAbsence(currentUser.userPrincipalName, {
        sourceKey: currentUser.id,
        absenceKey: selectedType.absenceKey,
        absenceStartTime: fromDate.toISOString(),
        absenceEndTime: toDate.toISOString(),
        userId: currentUser.id,
        userName: currentUser.displayName,
        comment,
      });

      await sendAbsenceNotification(selectedType.absenceKey, fromDate, toDate, comment);

      Alert.alert('Registered', 'Absence has been registered and supervisor notified.');
      setSelectedType(null);
      setFromDate(defaultFrom());
      setToDate(defaultTo());
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

      <DateTimeField
        label="From"
        value={fromDate}
        onChange={date => {
          setFromDate(date);
          if (date >= toDate) {
            const newTo = new Date(date);
            newTo.setHours(newTo.getHours() + 8);
            setToDate(newTo);
          }
        }}
      />

      <DateTimeField
        label="To"
        value={toDate}
        onChange={setToDate}
        minimumDate={fromDate}
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
