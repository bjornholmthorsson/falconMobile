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
  Switch,
  Modal,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery } from '@tanstack/react-query';
import { getAbsenceTypes, registerAbsence } from '../services/api';
import { sendAbsenceNotification } from '../services/graphService';
import { useAppStore } from '../store/appStore';
import type { Absence } from '../models';

// ── Fallback types ────────────────────────────────────────────────────────────

const FALLBACK_ABSENCE_TYPES: Absence[] = [
  { id: '1', absenceKey: 'HOLIDAY',    name: 'Holiday',      entryDate: '', entryBy: '' },
  { id: '2', absenceKey: 'SICK',       name: 'Sick Leave',   entryDate: '', entryBy: '' },
  { id: '3', absenceKey: 'SICK_CHILD', name: 'Sick Child',   entryDate: '', entryBy: '' },
  { id: '4', absenceKey: 'DOCTOR',     name: 'Doctor',       entryDate: '', entryBy: '' },
  { id: '5', absenceKey: 'OTHER',      name: 'Other',        entryDate: '', entryBy: '' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function getTypeIcon(key: string): string {
  const k = key.toUpperCase();
  if (k.includes('HOLIDAY') || k.includes('VACATION')) return 'beach';
  if (k.includes('SICK_CHILD') || k.includes('CHILD'))  return 'baby-carriage';
  if (k.includes('SICK'))                               return 'medical-bag';
  if (k.includes('DOCTOR'))                             return 'stethoscope';
  if (k.includes('PERSONAL'))                           return 'account-clock';
  return 'calendar-blank';
}

function buildCalendarGrid(year: number, month: number): (number | null)[] {
  const firstDow = new Date(year, month, 1).getDay();
  const offset   = firstDow === 0 ? 6 : firstDow - 1; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function countBusinessDays(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function formatShortDate(d: Date): string {
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ── TimeField ─────────────────────────────────────────────────────────────────

function TimeField({ label, value, onChange }: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(value);

  return (
    <View style={tf.wrapper}>
      <Text style={tf.label}>{label}</Text>
      <TouchableOpacity style={tf.field} onPress={() => { setTemp(value); setOpen(true); }}>
        <Text style={tf.value}>{formatTime(value)}</Text>
        <Icon name="clock-outline" size={20} color="#006559" />
      </TouchableOpacity>
      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide">
          <View style={tf.overlay}>
            <View style={tf.sheet}>
              <View style={tf.header}>
                <TouchableOpacity onPress={() => setOpen(false)}>
                  <Text style={tf.cancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={tf.title}>{label}</Text>
                <TouchableOpacity onPress={() => { onChange(temp); setOpen(false); }}>
                  <Text style={tf.done}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={temp}
                mode="time"
                display="spinner"
                locale="en_GB"
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
          mode="time"
          display="default"
          onValueChange={(_e, d) => { setOpen(false); onChange(d); }}
          onDismiss={() => setOpen(false)}
        />
      )}
    </View>
  );
}

const tf = StyleSheet.create({
  wrapper: { marginBottom: 12 },
  label:   { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  field: {
    backgroundColor: '#fff',
    borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  value:   { fontSize: 15, color: '#111', fontWeight: '500' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  title:  { fontSize: 16, fontWeight: '600', color: '#111' },
  cancel: { fontSize: 16, color: '#9ca3af' },
  done:   { fontSize: 16, color: '#006559', fontWeight: '700' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

const DAY_HEADERS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function defaultStartTime(): Date {
  const d = new Date(); d.setHours(9, 0, 0, 0); return d;
}
function defaultEndTime(): Date {
  const d = new Date(); d.setHours(17, 0, 0, 0); return d;
}

export default function RegisterAbsenceScreen() {
  const currentUser = useAppStore(s => s.currentUser);
  const { data: absenceTypesRaw = [] } = useQuery<Absence[]>({
    queryKey: ['absenceTypes'],
    queryFn: () => getAbsenceTypes().catch(() => []),
    staleTime: Infinity,
  });
  const absenceTypes = absenceTypesRaw.length > 0 ? absenceTypesRaw : FALLBACK_ABSENCE_TYPES;

  const today = new Date();
  const [selectedType, setSelectedType] = useState<Absence | null>(null);
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [dateStart, setDateStart] = useState<Date | null>(null);
  const [dateEnd,   setDateEnd]   = useState<Date | null>(null);
  const [fullDay,   setFullDay]   = useState(true);
  const [startTime, setStartTime] = useState<Date>(defaultStartTime);
  const [endTime,   setEndTime]   = useState<Date>(defaultEndTime);
  const [comment,   setComment]   = useState('');
  const [loading,   setLoading]   = useState(false);

  function shiftMonth(delta: number) {
    let m = calMonth + delta;
    let y = calYear;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setCalMonth(m);
    setCalYear(y);
  }

  function handleDayPress(day: number) {
    const tapped = new Date(calYear, calMonth, day);
    if (!dateStart || (dateStart && dateEnd)) {
      setDateStart(tapped);
      setDateEnd(null);
    } else {
      if (tapped >= dateStart) {
        setDateEnd(tapped);
      } else {
        setDateStart(tapped);
        setDateEnd(null);
      }
    }
  }

  function dayState(day: number): 'start' | 'end' | 'range' | 'today' | 'none' {
    const d = new Date(calYear, calMonth, day);
    if (dateStart && sameDay(d, dateStart)) return 'start';
    if (dateEnd   && sameDay(d, dateEnd))   return 'end';
    if (dateStart && dateEnd && d > dateStart && d < dateEnd) return 'range';
    if (sameDay(d, today)) return 'today';
    return 'none';
  }

  const cells = buildCalendarGrid(calYear, calMonth);
  const effectiveEnd = dateEnd ?? dateStart;
  const bizDays = dateStart && effectiveEnd
    ? countBusinessDays(dateStart, effectiveEnd)
    : 0;

  async function handleSubmit() {
    if (!currentUser) { Alert.alert('Error', 'Not signed in'); return; }
    if (!selectedType) { Alert.alert('Validation', 'Please select an absence type'); return; }
    if (!dateStart)    { Alert.alert('Validation', 'Please select at least one date'); return; }

    const fromDate = new Date(dateStart);
    const toDate   = new Date(effectiveEnd!);
    if (fullDay) {
      fromDate.setHours(0,  0,  0, 0);
      toDate.setHours(23, 59, 0, 0);
    } else {
      fromDate.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
      toDate.setHours(endTime.getHours(),   endTime.getMinutes(),   0, 0);
      if (toDate <= fromDate) {
        Alert.alert('Validation', 'End time must be after start time');
        return;
      }
    }

    setLoading(true);
    try {
      await registerAbsence(currentUser.userPrincipalName, {
        sourceKey:         currentUser.id,
        absenceKey:        selectedType.absenceKey,
        absenceStartTime:  fromDate.toISOString(),
        absenceEndTime:    toDate.toISOString(),
        userId:            currentUser.id,
        userName:          currentUser.displayName,
        comment,
      });

      let notified = true;
      try {
        await sendAbsenceNotification(selectedType.absenceKey, fromDate, toDate, comment, currentUser.id);
      } catch (e: any) {
        console.warn('Teams notification failed:', e?.message);
        notified = false;
      }

      Alert.alert(
        'Submitted',
        notified
          ? 'Absence has been registered and supervisor notified.'
          : 'Absence registered. (Supervisor notification could not be sent.)',
      );
      setSelectedType(null);
      setDateStart(null);
      setDateEnd(null);
      setComment('');
      setFullDay(true);
      setStartTime(defaultStartTime());
      setEndTime(defaultEndTime());
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

      {/* ── Header ── */}
      <Text style={styles.subtitle}>Make sure to register your absence so that your colleagues can be notified.</Text>

      {/* ── Absence Type ── */}
      <Text style={styles.sectionLabel}>Select Absence Type</Text>
      <View style={styles.typeList}>
        {(absenceTypes as Absence[]).map(t => {
          const selected = selectedType?.id === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.typeCard, selected && styles.typeCardSelected]}
              onPress={() => setSelectedType(t)}
              activeOpacity={0.7}
            >
              <Icon
                name={getTypeIcon(t.absenceKey)}
                size={28}
                color={selected ? '#006559' : '#9ca3af'}
              />
              <Text style={[styles.typeCardText, selected && styles.typeCardTextSelected]}>
                {t.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Calendar ── */}
      <View style={styles.card}>
        <View style={styles.calHeader}>
          <View>
            <Text style={styles.calMonthYear}>{MONTHS[calMonth]} {calYear}</Text>
            <Text style={styles.calSubtitle}>Select dates for your absence</Text>
          </View>
          <View style={styles.calNavRow}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.calNavBtn}>
              <Icon name="chevron-left" size={20} color="#374151" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.calNavBtn}>
              <Icon name="chevron-right" size={20} color="#374151" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Day headers */}
        <View style={styles.calDayHeaders}>
          {DAY_HEADERS.map(h => (
            <Text key={h} style={styles.calDayHeader}>{h}</Text>
          ))}
        </View>

        {/* Day grid */}
        <View style={styles.calGrid}>
          {cells.map((day, i) => {
            if (!day) return <View key={`e-${i}`} style={styles.calCell} />;
            const state = dayState(day);
            const isSelected = state === 'start' || state === 'end';
            const inRange    = state === 'range';
            const isToday    = state === 'today';
            return (
              <TouchableOpacity
                key={`d-${day}`}
                style={[styles.calCell, inRange && styles.calCellRange]}
                onPress={() => handleDayPress(day)}
                activeOpacity={0.7}
              >
                <View style={[styles.calDayInner, isSelected && styles.calDaySelected]}>
                  <Text style={[
                    styles.calDayText,
                    isSelected && styles.calDayTextSelected,
                    inRange    && styles.calDayTextRange,
                  ]}>
                    {day}
                  </Text>
                </View>
                {isToday && !isSelected && <View style={styles.todayDot} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Legend */}
        <View style={styles.calLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#006559' }]} />
            <Text style={styles.legendText}>Selected</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#6ee7b7' }]} />
            <Text style={styles.legendText}>Range</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotEmpty]} />
            <Text style={styles.legendText}>Available</Text>
          </View>
        </View>
      </View>

      {/* ── Duration ── */}
      <View style={styles.card}>
        <View style={styles.durationRow}>
          <Text style={styles.sectionLabelInline}>Select Duration</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Full Day</Text>
            <Switch
              value={fullDay}
              onValueChange={setFullDay}
              trackColor={{ false: '#d1d5db', true: '#006559' }}
              thumbColor="#fff"
            />
          </View>
        </View>
        {!fullDay && (
          <>
            <TimeField label="Start Time" value={startTime} onChange={setStartTime} />
            <TimeField label="End Time"   value={endTime}   onChange={setEndTime} />
          </>
        )}
      </View>

      {/* ── Additional Notes ── */}
      <View style={styles.card}>
        <Text style={styles.sectionLabelInline}>Additional Notes</Text>
        <TextInput
          style={styles.notesInput}
          value={comment}
          onChangeText={setComment}
          placeholder="Please provide any relevant details for your absence..."
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      {/* ── Summary ── */}
      {(selectedType || dateStart) && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Requested absence</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Absence Type</Text>
            <Text style={styles.summaryValue}>{selectedType?.name ?? '—'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Dates</Text>
            <Text style={styles.summaryValue}>
              {dateStart
                ? effectiveEnd && !sameDay(dateStart, effectiveEnd)
                  ? `${formatShortDate(dateStart)} - ${formatShortDate(effectiveEnd)}`
                  : formatShortDate(dateStart)
                : '—'}
            </Text>
          </View>
          {bizDays > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Duration</Text>
              <Text style={styles.summaryValue}>{bizDays} Business {bizDays === 1 ? 'Day' : 'Days'}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Submit ── */}
      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#006559" />
      ) : (
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
          <Text style={styles.submitBtnText}>Submit Absence</Text>
          <Icon name="arrow-right" size={20} color="#fff" />
        </TouchableOpacity>
      )}
      <Text style={styles.disclaimer}>
        By submitting, you agree to the company attendance policy. Your manager will be notified immediately.
      </Text>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#C7D3D3' },
  scroll:    { padding: 20, paddingBottom: 48 },

  // Header
  portalLabel: { fontSize: 11, fontWeight: '700', color: '#006559', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  title:       { fontSize: 32, fontWeight: '800', color: '#111', lineHeight: 38, marginBottom: 10 },
  subtitle:    { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 24 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  sectionLabelInline: { fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },

  // Absence type cards
  typeList: { gap: 10, marginBottom: 20 },
  typeCard: {
    backgroundColor: '#fff',
    borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb',
    paddingVertical: 18, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  typeCardSelected: { borderColor: '#006559' },
  typeCardText:         { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  typeCardTextSelected: { color: '#006559' },

  // Card wrapper
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16 },

  // Calendar
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  calMonthYear: { fontSize: 18, fontWeight: '800', color: '#111' },
  calSubtitle:  { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  calNavRow:    { flexDirection: 'row', gap: 4 },
  calNavBtn:    { padding: 6, backgroundColor: '#f3f4f6', borderRadius: 8 },

  calDayHeaders: { flexDirection: 'row', marginBottom: 4 },
  calDayHeader:  { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5 },

  calGrid:      { flexDirection: 'row', flexWrap: 'wrap' },
  calCell:      { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calCellRange: { backgroundColor: '#d1fae5' },
  calDayInner:  { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  calDaySelected: { backgroundColor: '#006559' },
  calDayText:           { fontSize: 13, color: '#374151', fontWeight: '500' },
  calDayTextSelected:   { color: '#fff', fontWeight: '700' },
  calDayTextRange:      { color: '#006559' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#006559', position: 'absolute', bottom: 3 },

  calLegend:    { flexDirection: 'row', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:    { width: 10, height: 10, borderRadius: 5 },
  legendDotEmpty: { borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: 'transparent' },
  legendText:   { fontSize: 12, color: '#6b7280' },

  // Duration
  durationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  toggleRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },

  // Notes
  notesInput: {
    backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 12, fontSize: 14, color: '#111', height: 100,
  },

  // Summary
  summaryCard: {
    backgroundColor: '#f0faf7', borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#6ee7b7',
  },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 12 },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { fontSize: 13, color: '#6b7280' },
  summaryValue: { fontSize: 13, fontWeight: '700', color: '#111' },

  // Submit
  submitBtn: {
    backgroundColor: '#006559', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginBottom: 12,
    shadowColor: '#006559', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disclaimer:    { fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 16 },
  loader:        { marginVertical: 20 },
});
