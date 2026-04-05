/**
 * TimeScreen — combined time & absence registration screen.
 * Fetches worklogs from Tempo, lets users log worklogs or absences via the + FAB.
 * Absences are submitted directly to Tempo using the configured Jira issue key.
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
  PanResponder,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getCalendarEvents, type CalendarEvent } from '../services/graphService';
import {
  getTempoWorklogs,
  postTempoWorklog,
  deleteTempoWorklog,
  searchJiraIssues,
  getTempoAbsenceTypes,
  getWorklogKeywordRules,
  type TempoWorklogEntry,
  type JiraIssue,
  type TempoAbsenceType,
  type WorklogKeywordRule,
} from '../services/api';
import { useAppStore } from '../store/appStore';

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function fmtTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function diffSeconds(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
}

function defaultFrom(): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d;
}

function defaultTo(): Date {
  const d = new Date();
  d.setHours(17, 0, 0, 0);
  return d;
}

// ── SwipeableCard ─────────────────────────────────────────────────────────────

const DELETE_WIDTH = 80;

function SwipeableCard({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const open       = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const x = Math.max(-DELETE_WIDTH, Math.min(0, g.dx + (open.current ? -DELETE_WIDTH : 0)));
        translateX.setValue(x);
      },
      onPanResponderRelease: (_, g) => {
        const shouldOpen = g.dx < -DELETE_WIDTH / 2 || (open.current && g.dx < DELETE_WIDTH / 2);
        open.current = shouldOpen;
        Animated.spring(translateX, {
          toValue: shouldOpen ? -DELETE_WIDTH : 0,
          useNativeDriver: true,
          bounciness: 4,
        }).start();
      },
    }),
  ).current;

  function handleDelete() {
    Animated.timing(translateX, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      open.current = false;
    });
    onDelete();
  }

  return (
    <View style={swipeStyles.container}>
      <View style={swipeStyles.deleteBtn}>
        <TouchableOpacity style={swipeStyles.deleteBtnInner} onPress={handleDelete} activeOpacity={0.8}>
          <Icon name="trash-can-outline" size={22} color="#fff" />
          <Text style={swipeStyles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  container:      { overflow: 'hidden', marginHorizontal: 16, marginTop: 12 },
  deleteBtn:      { position: 'absolute', right: 0, top: 0, bottom: 0, width: DELETE_WIDTH, backgroundColor: '#ef4444', borderRadius: 12, overflow: 'hidden' },
  deleteBtnInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  deleteBtnText:  { color: '#fff', fontSize: 12, fontWeight: '600' },
});

// ── component ─────────────────────────────────────────────────────────────────

type ModalType = 'worklog' | 'absence' | null;

export default function TimeScreen() {
  const currentUser = useAppStore(s => s.currentUser);
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [fabOpen,      setFabOpen]      = useState(false);
  const [activeModal,  setActiveModal]  = useState<ModalType>(null);

  // ── shared form state ──
  const [fromTime,  setFromTime]  = useState<Date>(defaultFrom());
  const [toTime,    setToTime]    = useState<Date>(defaultTo());
  const [comment,   setComment]   = useState('');
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker,   setShowToPicker]   = useState(false);

  // ── worklog form state ──
  const [issueKey,     setIssueKey]     = useState('');
  const [issueSummary, setIssueSummary] = useState('');
  const [searching,    setSearching]    = useState(false);
  const [suggestions,  setSuggestions]  = useState<JiraIssue[]>([]);
  const searchTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── absence form state ──
  const [selectedAbsenceType, setSelectedAbsenceType] = useState<TempoAbsenceType | null>(null);
  const [absenceDropdownOpen, setAbsenceDropdownOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['tempo', currentUser?.id, selectedDate] });
    }, [queryClient, currentUser?.id, selectedDate]),
  );

  const { data: worklogs = [], isLoading, isError, error } = useQuery<TempoWorklogEntry[]>({
    queryKey: ['tempo', currentUser?.id, selectedDate],
    queryFn: () => getTempoWorklogs(currentUser!.id, selectedDate, selectedDate),
    enabled: !!currentUser,
    staleTime: 60 * 1000,
    retry: false,
  });

  const FALLBACK_ABSENCE_TYPES: TempoAbsenceType[] = [
    { id: 1,  name: 'Holiday',              jiraKey: 'ABSENCE-1',  sortOrder: 1 },
    { id: 2,  name: 'Sick Leave',           jiraKey: 'ABSENCE-2',  sortOrder: 2 },
    { id: 3,  name: 'Sick Child',           jiraKey: 'ABSENCE-3',  sortOrder: 3 },
    { id: 4,  name: 'Special Leave',        jiraKey: 'ABSENCE-4',  sortOrder: 4 },
    { id: 5,  name: 'Doctors Appointment',  jiraKey: 'ABSENCE-5',  sortOrder: 5 },
    { id: 6,  name: 'Unpaid Leave',         jiraKey: 'ABSENCE-8',  sortOrder: 6 },
    { id: 7,  name: 'Maternity Leave',      jiraKey: 'ABSENCE-12', sortOrder: 7 },
    { id: 8,  name: 'Marriage',             jiraKey: 'ABSENCE-13', sortOrder: 8 },
  ];

  const { data: calendarEvents = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar', selectedDate],
    queryFn:  () => getCalendarEvents(selectedDate),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: keywordRules = [] } = useQuery<WorklogKeywordRule[]>({
    queryKey: ['keywordRules', currentUser?.id],
    queryFn:  () => getWorklogKeywordRules(currentUser!.id),
    enabled:  !!currentUser,
    staleTime: 60 * 1000,
  });

  const { data: absenceTypes, isLoading: absenceTypesLoading } = useQuery<TempoAbsenceType[]>({
    queryKey: ['tempo-absence-types'],
    queryFn:  getTempoAbsenceTypes,
    staleTime: 10 * 60 * 1000,
  });

  const displayedAbsenceTypes = absenceTypes ?? FALLBACK_ABSENCE_TYPES;

  const totalSeconds = worklogs.reduce((s, w) => s + w.timeSpentSeconds, 0);

  const { mutate: deleteWorklog } = useMutation({
    mutationFn: (worklogId: number) => deleteTempoWorklog(currentUser!.id, worklogId),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['tempo', currentUser?.id, selectedDate] }),
    onError:    (err: Error) => Alert.alert('Could not delete', err.message),
  });

  function confirmDelete(w: TempoWorklogEntry) {
    Alert.alert(
      'Delete entry',
      `Delete "${w.issueKey ?? '—'} ${w.comment ? '— ' + w.comment : ''}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteWorklog(w.id) },
      ],
    );
  }
  const formSeconds  = diffSeconds(fromTime, toTime);

  function resetForm() {
    setIssueKey('');
    setIssueSummary('');
    setFromTime(defaultFrom());
    setToTime(defaultTo());
    setComment('');
    setSuggestions([]);
    setSelectedAbsenceType(null);
    setAbsenceDropdownOpen(false);
    setShowFromPicker(false);
    setShowToPicker(false);
  }

  function openModal(type: ModalType) {
    resetForm();
    setFabOpen(false);
    if (type === 'worklog') {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    }
    setActiveModal(type);
  }

  const saveAndNewRef = useRef(false);

  // ── worklog submit ──
  const { mutate: submitWorklog, isPending: submittingWorklog } = useMutation({
    mutationFn: () => {
      if (!issueKey.trim()) throw new Error('Issue key is required');
      if (formSeconds <= 0)  throw new Error('End time must be after start time');
      return postTempoWorklog(currentUser!.id, {
        date: selectedDate,
        startTime: hhmm(fromTime),
        endTime:   hhmm(toTime),
        timeSpentSeconds: formSeconds,
        issueKey:  issueKey.trim().toUpperCase(),
        comment:   comment.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tempo', currentUser?.id, selectedDate] });
      if (saveAndNewRef.current) {
        resetForm();
        saveAndNewRef.current = false;
      } else {
        setActiveModal(null);
        resetForm();
      }
    },
    onError: (err: Error) => Alert.alert('Could not save worklog', err.message),
  });

  // ── absence submit ──
  const { mutate: submitAbsence, isPending: submittingAbsence } = useMutation({
    mutationFn: () => {
      if (!selectedAbsenceType)          throw new Error('Please select an absence type');
      if (!selectedAbsenceType.jiraKey)  throw new Error('This absence type has no Jira issue configured');
      if (formSeconds <= 0)              throw new Error('End time must be after start time');
      return postTempoWorklog(currentUser!.id, {
        date: selectedDate,
        startTime: hhmm(fromTime),
        endTime:   hhmm(toTime),
        timeSpentSeconds: formSeconds,
        issueKey:  selectedAbsenceType.jiraKey,
        comment:   comment.trim() || selectedAbsenceType.name,
      });
    },
    onSuccess: () => {
      setActiveModal(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['tempo', currentUser?.id, selectedDate] });
    },
    onError: (err: Error) => Alert.alert('Could not save absence', err.message),
  });

  function applyCalendarEvent(event: CalendarEvent) {
    setFromTime(event.start);
    setToTime(event.end);
    setComment(event.subject);
    const subjectLower = event.subject.toLowerCase();
    const match = keywordRules.find(r => subjectLower.includes(r.keyword.toLowerCase()));
    if (match) {
      setIssueKey(match.jiraKey);
      setIssueSummary('');
      setSuggestions([]);
    }
  }

  function onIssueQueryChange(text: string) {
    setIssueKey(text);
    setIssueSummary('');
    setSuggestions([]);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (text.length < 2) return;
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try { setSuggestions((await searchJiraIssues(text)).slice(0, 8)); }
      catch { /* ignore */ }
      finally { setSearching(false); }
    }, 400);
  }

  function changeDate(delta: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  // ── time picker shared block ──
  function renderTimePickers() {
    return (
      <>
        <Text style={styles.fieldLabel}>Time *</Text>
        <View style={styles.timeRow}>
          <View style={styles.timeBlock}>
            <Text style={styles.timeBlockLabel}>From</Text>
            <TouchableOpacity style={styles.timeBtn} onPress={() => { setShowToPicker(false); setShowFromPicker(true); }}>
              <Icon name="clock-outline" size={16} color="#006559" />
              <Text style={styles.timeBtnText}>{fmtTime(fromTime)}</Text>
            </TouchableOpacity>
          </View>
          <Icon name="arrow-right" size={20} color="#9ca3af" style={{ marginTop: 22 }} />
          <View style={styles.timeBlock}>
            <Text style={styles.timeBlockLabel}>To</Text>
            <TouchableOpacity style={styles.timeBtn} onPress={() => { setShowFromPicker(false); setShowToPicker(true); }}>
              <Icon name="clock-outline" size={16} color="#006559" />
              <Text style={styles.timeBtnText}>{fmtTime(toTime)}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.timeBlock}>
            <Text style={styles.timeBlockLabel}>Duration</Text>
            <View style={[styles.timeBtn, { backgroundColor: '#f0f0f0' }]}>
              <Text style={[styles.timeBtnText, { color: formSeconds > 0 ? '#006559' : '#ef4444', fontWeight: '700' }]}>
                {formSeconds > 0 ? fmtDuration(formSeconds) : '—'}
              </Text>
            </View>
          </View>
        </View>

        {showFromPicker && (
          <DateTimePicker value={fromTime} mode="time" is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => { if (Platform.OS === 'android') setShowFromPicker(false); if (d) setFromTime(d); }} />
        )}
        {Platform.OS === 'ios' && showFromPicker && (
          <TouchableOpacity style={styles.pickerDone} onPress={() => setShowFromPicker(false)}>
            <Text style={styles.pickerDoneText}>Done</Text>
          </TouchableOpacity>
        )}
        {showToPicker && (
          <DateTimePicker value={toTime} mode="time" is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => { if (Platform.OS === 'android') setShowToPicker(false); if (d) setToTime(d); }} />
        )}
        {Platform.OS === 'ios' && showToPicker && (
          <TouchableOpacity style={styles.pickerDone} onPress={() => setShowToPicker(false)}>
            <Text style={styles.pickerDoneText}>Done</Text>
          </TouchableOpacity>
        )}
      </>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── date nav ── */}
      <View style={styles.dateBar}>
        <TouchableOpacity onPress={() => changeDate(-1)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Icon name="chevron-left" size={28} color="#006559" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSelectedDate(todayStr())}>
          <Text style={styles.dateLabel}>{selectedDate === todayStr() ? 'Today' : fmtDate(selectedDate)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => changeDate(1)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Icon name="chevron-right" size={28} color="#006559" />
        </TouchableOpacity>
      </View>

      {/* ── total ── */}
      <View style={styles.totalBar}>
        <Text style={styles.totalLabel}>Total logged</Text>
        <Text style={styles.totalValue}>{fmtDuration(totalSeconds)}</Text>
      </View>

      {/* ── list ── */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#006559" />
      ) : isError ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          {(error as Error)?.message?.includes('404') ? (
            <>
              <Text style={styles.emptyText}>Jira username not set.</Text>
              <Text style={[styles.emptyText, { fontSize: 13, marginTop: 8 }]}>Go to Profile → Jira Username.</Text>
            </>
          ) : (
            <>
              <Text style={styles.emptyText}>Could not load worklogs.</Text>
              <Text style={[styles.emptyText, { fontSize: 13, marginTop: 8, color: '#ef4444' }]}>{(error as Error)?.message}</Text>
            </>
          )}
        </View>
      ) : worklogs.length === 0 ? (
        <Text style={styles.emptyText}>No time logged for this day.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {worklogs.map(w => (
            <SwipeableCard key={w.id} onDelete={() => confirmDelete(w)}>
              <View style={styles.card}>
                <View style={styles.cardLeft}>
                  <Text style={styles.cardKey}>{w.issueKey ?? '—'}</Text>
                  {!!w.issueSummary && <Text style={styles.cardSummary} numberOfLines={2}>{w.issueSummary}</Text>}
                  {!!w.comment && <Text style={styles.cardComment} numberOfLines={1}>{w.comment}</Text>}
                </View>
                <Text style={styles.cardDuration}>{fmtDuration(w.timeSpentSeconds)}</Text>
              </View>
            </SwipeableCard>
          ))}
        </ScrollView>
      )}

      {/* ── FAB action sheet ── */}
      {fabOpen && (
        <TouchableOpacity style={styles.fabBackdrop} activeOpacity={1} onPress={() => setFabOpen(false)}>
          <View style={styles.fabSheet}>
            <TouchableOpacity style={styles.fabOption} onPress={() => openModal('absence')}>
              <View style={[styles.fabOptionIcon, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                <Icon name="calendar-remove-outline" size={22} color="#ef4444" />
              </View>
              <Text style={styles.fabOptionText}>Log Absence</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fabOption} onPress={() => openModal('worklog')}>
              <View style={[styles.fabOptionIcon, { backgroundColor: 'rgba(0,101,89,0.1)' }]}>
                <Icon name="clock-plus-outline" size={22} color="#006559" />
              </View>
              <Text style={styles.fabOptionText}>Log Worklog</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.fab, fabOpen && styles.fabActive]} onPress={() => setFabOpen(v => !v)} activeOpacity={0.85}>
        <Icon name={fabOpen ? 'close' : 'plus'} size={28} color="#fff" />
      </TouchableOpacity>

      {/* ══ Worklog modal ══ */}
      <Modal visible={activeModal === 'worklog'} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActiveModal(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Worklog</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.absenceDateBadge}>
              <Icon name="calendar-today" size={15} color="#006559" />
              <Text style={styles.absenceDateText}>
                {new Date(selectedDate).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>Jira Issue *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. INT-5 or search by name"
              placeholderTextColor="#aaa"
              value={issueKey}
              onChangeText={onIssueQueryChange}
              autoCapitalize="characters"
            />
            {searching && <ActivityIndicator size="small" color="#006559" style={{ marginBottom: 4 }} />}
            {suggestions.length > 0 && (
              <View style={styles.suggestionBox}>
                {suggestions.map(s => (
                  <TouchableOpacity key={s.key} style={styles.suggestionRow} onPress={() => { setIssueKey(s.key); setIssueSummary(s.summary); setSuggestions([]); }}>
                    <Text style={styles.suggestionKey}>{s.key}</Text>
                    <Text style={styles.suggestionSummary} numberOfLines={1}>{s.summary}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {!!issueSummary && <Text style={styles.selectedSummary}>{issueSummary}</Text>}

            {renderTimePickers()}

            <Text style={styles.fieldLabel}>Comment</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} placeholder="Optional description" placeholderTextColor="#aaa"
              value={comment} onChangeText={setComment} multiline numberOfLines={3} />

            <View style={styles.submitRow}>
              <TouchableOpacity style={[styles.submitBtn, styles.submitBtnHalf, submittingWorklog && { opacity: 0.6 }]}
                onPress={() => { saveAndNewRef.current = false; submitWorklog(); }} disabled={submittingWorklog} activeOpacity={0.85}>
                {submittingWorklog && !saveAndNewRef.current ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, styles.submitBtnHalf, { backgroundColor: '#1e7a6e' }, submittingWorklog && { opacity: 0.6 }]}
                onPress={() => { saveAndNewRef.current = true; submitWorklog(); }} disabled={submittingWorklog} activeOpacity={0.85}>
                {submittingWorklog && saveAndNewRef.current ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Save & New</Text>}
              </TouchableOpacity>
            </View>

            {calendarEvents.length > 0 && (
              <>
                <Text style={styles.fieldLabel}>Calendar suggestions</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.calendarScroll} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
                  {calendarEvents.map(ev => {
                    const evStart = hhmm(ev.start);
                    const already = worklogs.some(w => w.startTime === evStart);
                    return (
                      <TouchableOpacity
                        key={ev.id}
                        style={[styles.calendarCard, already && styles.calendarCardDisabled]}
                        onPress={() => !already && applyCalendarEvent(ev)}
                        activeOpacity={already ? 1 : 0.75}
                      >
                        <Text style={[styles.calendarCardTitle, already && styles.calendarCardTextDisabled]} numberOfLines={2}>{ev.subject}</Text>
                        <Text style={[styles.calendarCardTime, already && styles.calendarCardTextDisabled]}>
                          {fmtTime(ev.start)} – {fmtTime(ev.end)}
                        </Text>
                        <View style={[styles.calendarCardDurationBadge, already && styles.calendarCardBadgeDisabled]}>
                          <Text style={[styles.calendarCardDurationText, already && styles.calendarCardDurationTextDisabled]}>{fmtDuration(ev.durationSeconds)}</Text>
                        </View>
                        {already && <Text style={styles.calendarCardLoggedLabel}>Logged</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══ Absence modal ══ */}
      <Modal visible={activeModal === 'absence'} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActiveModal(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Absence</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.absenceDateBadge}>
              <Icon name="calendar-today" size={15} color="#006559" />
              <Text style={styles.absenceDateText}>
                {new Date(selectedDate).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>Absence Type *</Text>
            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => setAbsenceDropdownOpen(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={selectedAbsenceType ? styles.dropdownValueText : styles.dropdownPlaceholder}>
                {selectedAbsenceType ? selectedAbsenceType.name : 'Select absence type…'}
              </Text>
              <Icon name={absenceDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#9ca3af" />
            </TouchableOpacity>
            {absenceDropdownOpen && (
              <View style={styles.dropdownList}>
                {displayedAbsenceTypes.map((t, i) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.dropdownItem,
                      i < displayedAbsenceTypes.length - 1 && styles.dropdownItemBorder,
                      selectedAbsenceType?.id === t.id && styles.dropdownItemSelected,
                    ]}
                    onPress={() => { setSelectedAbsenceType(t); setAbsenceDropdownOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dropdownItemText, selectedAbsenceType?.id === t.id && styles.dropdownItemTextSelected]}>
                        {t.name}
                      </Text>
                      {t.jiraKey && <Text style={styles.dropdownItemKey}>{t.jiraKey}</Text>}
                    </View>
                    {selectedAbsenceType?.id === t.id && <Icon name="check" size={16} color="#006559" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {renderTimePickers()}

            <Text style={styles.fieldLabel}>Comment</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} placeholder="Optional note" placeholderTextColor="#aaa"
              value={comment} onChangeText={setComment} multiline numberOfLines={3} />

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: '#ef4444', marginTop: 32, marginBottom: 32 }, submittingAbsence && { opacity: 0.6 }]}
              onPress={() => submitAbsence()} disabled={submittingAbsence} activeOpacity={0.85}>
              {submittingAbsence ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Save Absence</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  dateBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e5e5e5',
  },
  dateLabel:  { fontSize: 17, fontWeight: '600', color: '#111' },
  totalBar:   { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#006559', paddingHorizontal: 20, paddingVertical: 10 },
  totalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  totalValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  emptyText:  { textAlign: 'center', marginTop: 48, color: '#9ca3af', fontSize: 15 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardLeft:     { flex: 1, marginRight: 12 },
  cardKey:      { fontSize: 13, fontWeight: '700', color: '#006559' },
  cardSummary:  { fontSize: 13, color: '#333', marginTop: 2 },
  cardComment:  { fontSize: 12, color: '#888', marginTop: 2 },
  cardDuration: { fontSize: 16, fontWeight: '700', color: '#111' },

  // FAB
  fab: {
    position: 'absolute', bottom: 28, right: 24,
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#006559',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  fabActive:   { backgroundColor: '#444' },
  fabBackdrop: { position: 'absolute', inset: 0, justifyContent: 'flex-end', alignItems: 'flex-end' } as any,
  fabSheet:    { marginRight: 16, marginBottom: 96, gap: 8 },
  fabOption:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  fabOptionIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fabOptionText: { fontSize: 15, fontWeight: '600', color: '#111' },

  // modal
  modal:        { flex: 1, backgroundColor: '#f5f5f5', padding: 20 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle:   { fontSize: 20, fontWeight: '700', color: '#111' },
  modalClose:   { fontSize: 16, color: '#006559', fontWeight: '600' },
  fieldLabel:   { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111', borderWidth: 1, borderColor: '#e5e5e5',
  },
  inputMultiline:   { minHeight: 80, textAlignVertical: 'top' },
  suggestionBox:    { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e5e5', marginTop: 4, overflow: 'hidden' },
  suggestionRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 10 },
  suggestionKey:    { fontSize: 13, fontWeight: '700', color: '#006559', width: 60 },
  suggestionSummary:{ flex: 1, fontSize: 13, color: '#333' },
  selectedSummary:  { fontSize: 13, color: '#555', marginTop: 6, marginLeft: 2 },
  // time row
  timeRow:        { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  timeBlock:      { flex: 1 },
  timeBlockLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  timeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e5e5',
    paddingHorizontal: 12, paddingVertical: 11,
  },
  timeBtnText:    { fontSize: 15, color: '#111' },
  pickerDone:     { alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  pickerDoneText: { fontSize: 16, color: '#006559', fontWeight: '700' },
  // dropdown
  dropdownTrigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e5e5',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  dropdownPlaceholder: { fontSize: 15, color: '#aaa', flex: 1 },
  dropdownValueText:   { fontSize: 15, color: '#111', flex: 1 },
  dropdownList: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e5e5',
    marginTop: 4, overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  dropdownItemBorder:        { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  dropdownItemSelected:      { backgroundColor: 'rgba(0,101,89,0.05)' },
  dropdownItemText:          { fontSize: 15, color: '#111' },
  dropdownItemTextSelected:  { fontWeight: '600', color: '#006559' },
  dropdownItemKey:           { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  absenceDateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#e6f4f1', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4,
  },
  absenceDateText: { fontSize: 14, fontWeight: '600', color: '#006559' },
  submitRow:      { flexDirection: 'row', gap: 10, marginTop: 32, marginBottom: 16 },
  submitBtn:      { backgroundColor: '#006559', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 0, marginBottom: 0 },
  submitBtnHalf:  { flex: 1 },
  submitBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  // calendar suggestions
  calendarScroll: { marginTop: 4, marginBottom: 32 },
  calendarCard: {
    width: 160, backgroundColor: '#fff', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#e5e5e5',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  calendarCardTitle: { fontSize: 13, fontWeight: '600', color: '#111', marginBottom: 6 },
  calendarCardTime:  { fontSize: 12, color: '#555' },
  calendarCardDurationBadge: {
    marginTop: 8, alignSelf: 'flex-start',
    backgroundColor: '#e6f4f1', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  calendarCardDurationText: { fontSize: 12, fontWeight: '700', color: '#006559' },
  calendarCardDisabled:     { backgroundColor: '#f3f4f6', borderColor: '#e5e5e5', opacity: 0.6 },
  calendarCardTextDisabled: { color: '#9ca3af' },
  calendarCardBadgeDisabled:{ backgroundColor: '#e5e7eb' },
  calendarCardDurationTextDisabled: { color: '#9ca3af' },
  calendarCardLoggedLabel:  { fontSize: 11, fontWeight: '600', color: '#9ca3af', marginTop: 6 },
});
