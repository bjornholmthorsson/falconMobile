import React, { useState, useEffect, useRef } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAppStore } from '../store/appStore';
import { createTravelRequest, searchJiraUsers, searchTempoAccounts } from '../services/api';
import type { JiraUser, TempoAccount } from '../services/api';

// ── Option lists (from Jira createmeta) ──────────────────────────────────────

const DEPARTURE_PREFERENCES = ['Morning', 'Afternoon', 'Evening'];
const RETURN_PREFERENCES = ['Morning', 'Afternoon', 'Evening'];
const HOTEL_OPTIONS = ['Yes', 'No'];
const BILLABLE_OPTIONS = ['Yes', 'No'];
const COST_CENTERS = [
  '510 General and Administration',
  '530 Developers',
  '540 Business Services',
  '542 Client Services',
  '550 Sales and Marketing',
  '560 Product Development',
];
const CUSTOMERS = [
  'Argenta', 'BND', 'BNKS', 'CACF', 'Fixit',
  'Indue', 'Internal', 'Landsbankinn', 'Lex', 'MEP',
  'MP', 'Nykredit', 'Origo', 'RB', 'Samtrygging',
  'Sjova', 'TM', 'VIS', 'Vordur',
];
const SUMMARY_SUGGESTIONS = [
  'Trip to Amsterdam',
  'Trip to Iceland',
  'Trip to Portugal',
  'Trip to Vietnam',
  'Trip to Toronto',
];
const DESTINATION_SUGGESTIONS = [
  'Amsterdam',
  'Reykjavik',
  'Lisbon',
  'Ho Chi Minh',
  'Toronto',
  'Barbados',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDisplayDate(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ── DateField ────────────────────────────────────────────────────────────────

function DateField({ label, value, onChange, required }: {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(value ?? new Date());

  return (
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}{required ? ' *' : ''}</Text>
      <TouchableOpacity style={fieldStyles.field} onPress={() => { setTemp(value ?? new Date()); setOpen(true); }}>
        <Text style={[fieldStyles.value, !value && fieldStyles.placeholder]}>
          {value ? formatDisplayDate(value) : 'Select date'}
        </Text>
        <Icon name="calendar" size={20} color="#006559" />
      </TouchableOpacity>
      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide">
          <View style={fieldStyles.overlay}>
            <View style={fieldStyles.sheet}>
              <View style={fieldStyles.header}>
                <TouchableOpacity onPress={() => setOpen(false)}>
                  <Text style={fieldStyles.cancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={fieldStyles.title}>{label}</Text>
                <TouchableOpacity onPress={() => { onChange(temp); setOpen(false); }}>
                  <Text style={fieldStyles.done}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={temp}
                mode="date"
                display="spinner"
                onValueChange={(_e, d) => setTemp(d)}
                themeVariant="light"
              />
            </View>
          </View>

        </Modal>
      )}
      {Platform.OS === 'android' && open && (
        <DateTimePicker
          value={temp}
          mode="date"
          display="default"
          onValueChange={(_e, d) => { setOpen(false); onChange(d); }}
          onDismiss={() => setOpen(false)}
        />
      )}
    </View>
  );
}

// ── PickerField (dropdown-like) ──────────────────────────────────────────────

function PickerField({ label, value, options, onChange, required }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}{required ? ' *' : ''}</Text>
      <TouchableOpacity style={fieldStyles.field} onPress={() => setOpen(true)}>
        <Text style={[fieldStyles.value, !value && fieldStyles.placeholder]}>
          {value || `Select ${label.toLowerCase()}`}
        </Text>
        <Icon name="chevron-down" size={20} color="#006559" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide">
        <View style={fieldStyles.overlay}>
          <View style={fieldStyles.sheet}>
            <View style={fieldStyles.header}>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={fieldStyles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={fieldStyles.title}>{label}</Text>
              <View style={{ width: 50 }} />
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {options.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[fieldStyles.option, value === opt && fieldStyles.optionSelected]}
                  onPress={() => { onChange(value === opt ? '' : opt); setOpen(false); }}
                >
                  <Text style={[fieldStyles.optionText, value === opt && fieldStyles.optionTextSelected]}>
                    {opt}
                  </Text>
                  {value === opt && <Icon name="check" size={18} color="#006559" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── ComboField (dropdown suggestions + free text) ────────────────────────────

function ComboField({ label, value, suggestions, onChange, required, placeholder }: {
  label: string;
  value: string;
  suggestions: string[];
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');

  function pickSuggestion(v: string) {
    onChange(v);
    setOpen(false);
  }

  function confirmCustom() {
    if (custom.trim()) onChange(custom.trim());
    setCustom('');
    setOpen(false);
  }

  return (
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}{required ? ' *' : ''}</Text>
      <TouchableOpacity style={fieldStyles.field} onPress={() => setOpen(true)}>
        <Text style={[fieldStyles.value, !value && fieldStyles.placeholder]}>
          {value || placeholder || `Select or type ${label.toLowerCase()}`}
        </Text>
        <Icon name="chevron-down" size={20} color="#006559" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide">
        <View style={fieldStyles.overlay}>
          <View style={fieldStyles.sheet}>
            <View style={fieldStyles.header}>
              <TouchableOpacity onPress={() => { setCustom(''); setOpen(false); }}>
                <Text style={fieldStyles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={fieldStyles.title}>{label}</Text>
              <View style={{ width: 50 }} />
            </View>
            <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
              {suggestions.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[fieldStyles.option, value === opt && fieldStyles.optionSelected]}
                  onPress={() => pickSuggestion(opt)}
                >
                  <Text style={[fieldStyles.optionText, value === opt && fieldStyles.optionTextSelected]}>
                    {opt}
                  </Text>
                  {value === opt && <Icon name="check" size={18} color="#006559" />}
                </TouchableOpacity>
              ))}
              <View style={comboStyles.customRow}>
                <TextInput
                  style={comboStyles.customInput}
                  value={custom}
                  onChangeText={setCustom}
                  placeholder="Or type your own..."
                  placeholderTextColor="#9ca3af"
                  returnKeyType="done"
                  onSubmitEditing={confirmCustom}
                />
                <TouchableOpacity
                  style={[comboStyles.customBtn, !custom.trim() && { opacity: 0.4 }]}
                  onPress={confirmCustom}
                  disabled={!custom.trim()}
                >
                  <Icon name="check" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const comboStyles = StyleSheet.create({
  customRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  customInput: {
    flex: 1, backgroundColor: '#f9fafb', borderRadius: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111',
  },
  customBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#006559', alignItems: 'center', justifyContent: 'center',
  },
});

// ── UserPickerField (multi-select with Jira user search) ─────────────────────

function UserPickerField({ label, selected, onChange }: {
  label: string;
  selected: JiraUser[];
  onChange: (users: JiraUser[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JiraUser[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (query.length < 2) { setResults([]); return; }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const users = await searchJiraUsers(query);
        setResults(users.filter(u => !selected.some(s => s.name === u.name)));
      } catch { setResults([]); }
      setSearching(false);
    }, 350);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, selected]);

  function addUser(user: JiraUser) {
    onChange([...selected, user]);
    setQuery('');
    setResults([]);
  }

  function removeUser(name: string) {
    onChange(selected.filter(u => u.name !== name));
  }

  return (
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}</Text>

      {/* Selected chips */}
      {selected.length > 0 && (
        <View style={userPickerStyles.chipRow}>
          {selected.map(u => (
            <View key={u.name} style={userPickerStyles.chip}>
              <Text style={userPickerStyles.chipText}>{u.displayName}</Text>
              <TouchableOpacity onPress={() => removeUser(u.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="close-circle" size={16} color="#006559" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={fieldStyles.field} onPress={() => { setQuery(''); setResults([]); setOpen(true); }}>
        <Text style={[fieldStyles.value, fieldStyles.placeholder]}>
          {selected.length ? 'Add another passenger...' : 'Search for passengers...'}
        </Text>
        <Icon name="account-search" size={20} color="#006559" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide">
        <View style={fieldStyles.overlay}>
          <View style={[fieldStyles.sheet, { maxHeight: '70%' }]}>
            <View style={fieldStyles.header}>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={fieldStyles.cancel}>Done</Text>
              </TouchableOpacity>
              <Text style={fieldStyles.title}>Search Passengers</Text>
              <View style={{ width: 50 }} />
            </View>

            {/* Selected in modal */}
            {selected.length > 0 && (
              <View style={userPickerStyles.modalChipRow}>
                {selected.map(u => (
                  <View key={u.name} style={userPickerStyles.chip}>
                    <Text style={userPickerStyles.chipText}>{u.displayName}</Text>
                    <TouchableOpacity onPress={() => removeUser(u.name)}>
                      <Icon name="close-circle" size={16} color="#006559" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Search input */}
            <View style={userPickerStyles.searchRow}>
              <Icon name="magnify" size={20} color="#9ca3af" />
              <TextInput
                style={userPickerStyles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Type a name..."
                placeholderTextColor="#9ca3af"
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color="#006559" />}
            </View>

            {/* Results */}
            <ScrollView style={{ maxHeight: 250 }} keyboardShouldPersistTaps="handled">
              {results.map(u => (
                <TouchableOpacity
                  key={u.name}
                  style={fieldStyles.option}
                  onPress={() => addUser(u)}
                >
                  <View>
                    <Text style={userPickerStyles.resultName}>{u.displayName}</Text>
                    <Text style={userPickerStyles.resultUsername}>{u.name}</Text>
                  </View>
                  <Icon name="plus-circle-outline" size={22} color="#006559" />
                </TouchableOpacity>
              ))}
              {query.length >= 2 && !searching && results.length === 0 && (
                <Text style={userPickerStyles.noResults}>No users found</Text>
              )}
              {query.length < 2 && (
                <Text style={userPickerStyles.hint}>Type at least 2 characters to search</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const userPickerStyles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  modalChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f0faf7', borderRadius: 8, borderWidth: 1, borderColor: '#006559',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: '#006559' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 10,
    backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111', paddingVertical: 4 },
  resultName: { fontSize: 15, fontWeight: '500', color: '#111' },
  resultUsername: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  noResults: { textAlign: 'center', color: '#9ca3af', paddingVertical: 20, fontSize: 14 },
  hint: { textAlign: 'center', color: '#9ca3af', paddingVertical: 20, fontSize: 13 },
});

// ── AccountPickerField (searchable Tempo accounts) ───────────────────────────

function AccountPickerField({ label, value, onChange }: {
  label: string;
  value: TempoAccount | null;
  onChange: (a: TempoAccount | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TempoAccount[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (query.length < 2) { setResults([]); return; }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const accounts = await searchTempoAccounts(query);
        setResults(accounts);
      } catch { setResults([]); }
      setSearching(false);
    }, 350);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open]);

  return (
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}</Text>

      {value ? (
        <View style={[fieldStyles.field, { justifyContent: 'flex-start', gap: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={fieldStyles.value}>{value.name}</Text>
            <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{value.key}</Text>
          </View>
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close-circle" size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={fieldStyles.field} onPress={() => { setQuery(''); setResults([]); setOpen(true); }}>
          <Text style={[fieldStyles.value, fieldStyles.placeholder]}>Search for an account...</Text>
          <Icon name="magnify" size={20} color="#006559" />
        </TouchableOpacity>
      )}

      <Modal visible={open} transparent animationType="slide">
        <View style={fieldStyles.overlay}>
          <View style={[fieldStyles.sheet, { maxHeight: '60%' }]}>
            <View style={fieldStyles.header}>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={fieldStyles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={fieldStyles.title}>Search Accounts</Text>
              <View style={{ width: 50 }} />
            </View>

            <View style={userPickerStyles.searchRow}>
              <Icon name="magnify" size={20} color="#9ca3af" />
              <TextInput
                style={userPickerStyles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Type account name or key..."
                placeholderTextColor="#9ca3af"
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color="#006559" />}
            </View>

            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              {results.map(a => (
                <TouchableOpacity
                  key={a.key}
                  style={[fieldStyles.option, value?.key === a.key && fieldStyles.optionSelected]}
                  onPress={() => { onChange(a); setOpen(false); }}
                >
                  <View>
                    <Text style={[fieldStyles.optionText, value?.key === a.key && fieldStyles.optionTextSelected]}>{a.name}</Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{a.key}</Text>
                  </View>
                  {value?.key === a.key && <Icon name="check" size={18} color="#006559" />}
                </TouchableOpacity>
              ))}
              {query.length >= 2 && !searching && results.length === 0 && (
                <Text style={userPickerStyles.noResults}>No accounts found</Text>
              )}
              {query.length < 2 && (
                <Text style={userPickerStyles.hint}>Type at least 2 characters to search</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── RadioField (inline single-select) ────────────────────────────────────────

function RadioField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={radioStyles.wrapper}>
      <Text style={radioStyles.label}>{label}</Text>
      <View style={radioStyles.row}>
        {options.map(opt => {
          const selected = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[radioStyles.chip, selected && radioStyles.chipSelected]}
              onPress={() => onChange(selected ? '' : opt)}
              activeOpacity={0.7}
            >
              <Text style={[radioStyles.chipText, selected && radioStyles.chipTextSelected]}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const radioStyles = StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff',
    alignItems: 'center',
  },
  chipSelected: { borderColor: '#006559', backgroundColor: '#f0faf7' },
  chipText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  chipTextSelected: { color: '#006559', fontWeight: '700' },
});

const fieldStyles = StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  field: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  value: { fontSize: 15, color: '#111', fontWeight: '500', flex: 1 },
  placeholder: { color: '#9ca3af', fontWeight: '400' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 16, fontWeight: '600', color: '#111' },
  cancel: { fontSize: 16, color: '#9ca3af' },
  done: { fontSize: 16, color: '#006559', fontWeight: '700' },
  option: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  optionSelected: { backgroundColor: '#f0faf7' },
  optionText: { fontSize: 15, color: '#374151' },
  optionTextSelected: { color: '#006559', fontWeight: '600' },
});

// ── Main screen ──────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function TravelRequestScreen({ visible, onClose }: Props) {
  const currentUser = useAppStore(s => s.currentUser);

  const [summary, setSummary] = useState('');
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState<Date | null>(null);
  const [returnDate, setReturnDate] = useState<Date | null>(null);
  const [departurePreference, setDeparturePreference] = useState('');
  const [returnPreference, setReturnPreference] = useState('');
  const [passengers, setPassengers] = useState<JiraUser[]>([]);
  const [flightInformation, setFlightInformation] = useState('');
  const [description, setDescription] = useState('');
  const [hotelNeeded, setHotelNeeded] = useState('');
  const [billable, setBillable] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [customer, setCustomer] = useState('');
  const [account, setAccount] = useState<TempoAccount | null>(null);
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setSummary('');
    setDestination('');
    setDepartureDate(null);
    setReturnDate(null);
    setDeparturePreference('');
    setReturnPreference('');
    setPassengers([]);
    setFlightInformation('');
    setDescription('');
    setHotelNeeded('');
    setBillable('');
    setCostCenter('');
    setCustomer('');
    setAccount(null);
  }

  async function handleSubmit() {
    if (!currentUser) { Alert.alert('Error', 'Not signed in'); return; }
    if (!summary.trim()) { Alert.alert('Validation', 'Please enter a summary'); return; }
    if (!departureDate) { Alert.alert('Validation', 'Please select a departure date'); return; }
    if (!returnDate) { Alert.alert('Validation', 'Please select a return date'); return; }
    if (!account) { Alert.alert('Validation', 'Please select a Tempo account'); return; }

    setLoading(true);
    try {
      await createTravelRequest({
        summary: summary.trim(),
        description: description.trim() || undefined,
        destination: destination.trim() || undefined,
        departureDate: departureDate ? formatDate(departureDate) : undefined,
        returnDate: returnDate ? formatDate(returnDate) : undefined,
        departurePreference: departurePreference || undefined,
        returnPreference: returnPreference || undefined,
        passengers: passengers.length ? passengers.map(u => u.name).join(', ') : undefined,
        flightInformation: flightInformation.trim() || undefined,
        hotelNeeded: hotelNeeded || undefined,
        billable: billable || undefined,
        costCenter: costCenter || undefined,
        customer: customer || undefined,
        account: account ? String(account.id) : undefined,
        accountKey: account?.key || undefined,
      });

      Alert.alert('Submitted', 'Your travel request has been created in Jira.', [
        { text: 'OK', onPress: () => { resetForm(); onClose(); } },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to create travel request');
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Icon name="close" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Travel Request</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>
            Fill in the details below to submit a travel request. Fields marked with * are required.
          </Text>

          {/* Summary */}
          <View style={styles.card}>
            <ComboField
              label="Summary"
              value={summary}
              suggestions={SUMMARY_SUGGESTIONS}
              onChange={setSummary}
              required
              placeholder="e.g. Trip to Amsterdam"
            />
          </View>

          {/* Destination */}
          <View style={styles.card}>
            <ComboField
              label="Destination"
              value={destination}
              suggestions={DESTINATION_SUGGESTIONS}
              onChange={setDestination}
              placeholder="e.g. Reykjavik"
            />
          </View>

          {/* Dates */}
          <View style={styles.card}>
            <DateField
              label="Departure Date"
              value={departureDate}
              onChange={setDepartureDate}
              required
            />
            <RadioField
              label="Departure Preference"
              value={departurePreference}
              options={DEPARTURE_PREFERENCES}
              onChange={setDeparturePreference}
            />
            <DateField
              label="Return Date"
              value={returnDate}
              onChange={setReturnDate}
              required
            />
            <RadioField
              label="Return Preference"
              value={returnPreference}
              options={RETURN_PREFERENCES}
              onChange={setReturnPreference}
            />
          </View>

          {/* Travel details */}
          <View style={styles.card}>
            <UserPickerField
              label="Passengers"
              selected={passengers}
              onChange={setPassengers}
            />
            <View style={{ height: 2 }} />
            <Text style={styles.sectionLabel}>Flight Information</Text>
            <TextInput
              style={[styles.textInput, { height: 80 }]}
              value={flightInformation}
              onChangeText={setFlightInformation}
              placeholder="Flight preferences or booking details"
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Accommodation & billing */}
          <View style={styles.card}>
            <PickerField
              label="Hotel Needed"
              value={hotelNeeded}
              options={HOTEL_OPTIONS}
              onChange={setHotelNeeded}
            />
            <PickerField
              label="Billable"
              value={billable}
              options={BILLABLE_OPTIONS}
              onChange={setBillable}
            />
            <PickerField
              label="Cost Center"
              value={costCenter}
              options={COST_CENTERS}
              onChange={setCostCenter}
            />
            <PickerField
              label="Customer"
              value={customer}
              options={CUSTOMERS}
              onChange={setCustomer}
            />
            <AccountPickerField
              label="Account *"
              value={account}
              onChange={setAccount}
            />
          </View>

          {/* Description */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Description</Text>
            <TextInput
              style={[styles.textInput, { height: 100 }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Additional details about the trip..."
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Submit */}
          {loading ? (
            <ActivityIndicator style={styles.loader} size="large" color="#006559" />
          ) : (
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
              <Icon name="airplane" size={20} color="#fff" />
              <Text style={styles.submitBtnText}>Submit Travel Request</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: '#C7D3D3' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#006E61',
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  container: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 48 },
  subtitle: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 20 },
  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16 },
  textInput: {
    backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 12, fontSize: 14, color: '#111',
  },
  submitBtn: {
    backgroundColor: '#006559', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginBottom: 12,
    shadowColor: '#006559', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loader: { marginVertical: 20 },
});
