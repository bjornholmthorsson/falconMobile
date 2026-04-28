import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDepartments, createAnnouncement, type DepartmentMapping } from '../services/api';
import { useAppStore } from '../store/appStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AnnouncementCreateScreen({ visible, onClose }: Props) {
  const currentUser = useAppStore(s => s.currentUser);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [body, setBody]   = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: departments = [] } = useQuery<DepartmentMapping[]>({
    queryKey: ['departments'],
    queryFn:  () => getDepartments(),
    staleTime: 60 * 60 * 1000,
  });

  function toggleDept(dept: string) {
    setSelected(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]);
  }

  function reset() {
    setTitle('');
    setBody('');
    setSelected([]);
  }

  async function handleSubmit() {
    if (!currentUser) { Alert.alert('Error', 'Not signed in'); return; }
    if (!title.trim()) { Alert.alert('Validation', 'Please enter a title'); return; }
    if (!body.trim())  { Alert.alert('Validation', 'Please enter the announcement text'); return; }
    if (selected.length === 0) { Alert.alert('Validation', 'Please pick at least one group'); return; }

    setSubmitting(true);
    try {
      const result = await createAnnouncement({
        title: title.trim(),
        body:  body.trim(),
        targetDepartments: selected,
        createdBy: currentUser.displayName ?? currentUser.id,
      });
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      Alert.alert(
        'Sent',
        result.pushedCount > 0
          ? `Announcement posted. Sent push to ${result.pushedCount} ${result.pushedCount === 1 ? 'person' : 'people'}.`
          : 'Announcement posted. Nobody in those groups has push notifications enabled yet.',
        [{ text: 'OK', onPress: () => { reset(); onClose(); } }],
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to post announcement');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Add Announcement</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={styles.card}>
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="Short headline"
                placeholderTextColor="#aaa"
                value={title}
                onChangeText={setTitle}
                maxLength={120}
              />

              <Text style={[styles.label, { marginTop: 16 }]}>Message *</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="What do you want to announce?"
                placeholderTextColor="#aaa"
                value={body}
                onChangeText={setBody}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Send to *</Text>
              <Text style={styles.help}>Pick one or more groups. Members of those groups will see the announcement on their home screen, and (if they've enabled push) get a notification.</Text>
              <View style={styles.chips}>
                {departments.map(d => {
                  const active = selected.includes(d.department);
                  return (
                    <TouchableOpacity
                      key={d.department}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => toggleDept(d.department)}
                      activeOpacity={0.7}
                    >
                      {active && <Icon name="check" size={14} color="#fff" style={{ marginRight: 4 }} />}
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.displayName}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submit, (submitting || selected.length === 0) && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={submitting || selected.length === 0}
              activeOpacity={0.85}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Post Announcement</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e5e5e5',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  cancel:      { fontSize: 16, color: '#dc2626', fontWeight: '600' },

  scroll: { flex: 1, padding: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  help:  { fontSize: 12, color: '#9ca3af', marginBottom: 10 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111', borderWidth: 1, borderColor: '#e5e5e5',
  },
  multiline: { minHeight: 110 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5',
  },
  chipActive:    { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  chipText:      { fontSize: 13, color: '#374151', fontWeight: '600' },
  chipTextActive:{ color: '#fff' },

  submit: {
    backgroundColor: '#dc2626', borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 8,
  },
  submitDisabled: { backgroundColor: '#fca5a5' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
