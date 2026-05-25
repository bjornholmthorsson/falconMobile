/**
 * AddLunchMenuScreen — admin flow to upload a screenshot of a weekly lunch
 * menu, let Claude extract a structured preview, review/edit it, and commit
 * it as a new lunch_weeks + lunch_days + lunch_options set in Postgres.
 *
 * Opened from LunchOrdersScreen via the "+" icon in the header.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import {
  parseLunchMenuImage,
  commitLunchMenu,
  type LunchMenuPreview,
  type LunchMenuDay,
  type LunchMenuOption,
} from '../services/api';
import { useAppStore } from '../store/appStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Stage = 'pick' | 'parsing' | 'preview' | 'committing';

const UI: Record<string, Record<string, string>> = {
  en: {
    title:          'Add lunch menu',
    intro:          'Upload a screenshot of the weekly menu form. We will extract it into a structured preview that you can review before saving.',
    pickLibrary:    'Choose from library',
    pickCamera:     'Take photo',
    parsing:        'Reading the menu…',
    week:           'Week',
    year:           'Year',
    restaurant:     'Restaurant',
    priceIsk:       'Price (ISK)',
    subsidyPct:     'Subsidy %',
    dateLabel:      'Date label',
    holiday:        'Holiday',
    isLabel:        'Icelandic',
    enLabel:        'English',
    save:           'Save menu',
    reject:         'Discard',
    saving:         'Saving…',
    parseFailed:    'Could not read the menu',
    saveFailed:     'Could not save the menu',
    confirmDiscard: 'Discard this preview?',
    saved:          'Menu saved',
  },
  is: {
    title:          'Bæta við hádegismatseðli',
    intro:          'Hladdu upp skjáskoti af matseðlinum. Við lesum hann í forskoðun sem þú getur lagfært áður en þú vistar.',
    pickLibrary:    'Velja úr myndasafni',
    pickCamera:     'Taka mynd',
    parsing:        'Les matseðilinn…',
    week:           'Vika',
    year:           'Ár',
    restaurant:     'Veitingastaður',
    priceIsk:       'Verð (kr)',
    subsidyPct:     'Niðurgreiðsla %',
    dateLabel:      'Dagsetning',
    holiday:        'Frídagur',
    isLabel:        'Íslenska',
    enLabel:        'Enska',
    save:           'Vista matseðil',
    reject:         'Henda',
    saving:         'Vista…',
    parseFailed:    'Tókst ekki að lesa matseðilinn',
    saveFailed:     'Tókst ekki að vista matseðilinn',
    confirmDiscard: 'Henda þessari forskoðun?',
    saved:          'Matseðill vistaður',
  },
};

export default function AddLunchMenuScreen({ visible, onClose }: Props) {
  const lang = useAppStore(s => s.lunchLang);
  const strings = UI[lang] ?? UI.en;
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>('pick');
  const [preview, setPreview] = useState<LunchMenuPreview | null>(null);

  function reset() {
    setStage('pick');
    setPreview(null);
  }

  function handleClose() {
    if (stage === 'preview') {
      Alert.alert(
        strings.confirmDiscard,
        undefined,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: strings.reject, style: 'destructive', onPress: () => { reset(); onClose(); } },
        ],
      );
      return;
    }
    reset();
    onClose();
  }

  async function pickAndParse(source: 'library' | 'camera') {
    const opts = {
      mediaType: 'photo' as const,
      maxWidth: 1600,
      maxHeight: 2400,
      quality: 0.9 as const,
      includeBase64: true,
    };
    try {
      const result = source === 'camera' ? await launchCamera(opts) : await launchImageLibrary(opts);
      if (result.didCancel) return;
      const asset = result.assets?.[0];
      if (!asset?.base64) return;

      // Normalize to one of the three mime types the backend accepts.
      const mediaType: 'image/png' | 'image/jpeg' | 'image/webp' =
        asset.type === 'image/png'  ? 'image/png'  :
        asset.type === 'image/webp' ? 'image/webp' :
        'image/jpeg';

      setStage('parsing');
      const parsed = await parseLunchMenuImage(asset.base64, mediaType);
      setPreview(parsed);
      setStage('preview');
    } catch (err: any) {
      setStage('pick');
      Alert.alert(strings.parseFailed, err?.message ?? 'Try again');
    }
  }

  async function handleCommit() {
    if (!preview) return;
    setStage('committing');
    try {
      const res = await commitLunchMenu(preview);
      // Refresh any cached views of this week so the new menu appears immediately.
      queryClient.invalidateQueries({ queryKey: ['lunch-menu', res.year, res.weekNumber] });
      queryClient.invalidateQueries({ queryKey: ['lunchOrdersSummary', res.year, res.weekNumber] });
      Alert.alert(strings.saved, `${res.year} · Week ${res.weekNumber}`);
      reset();
      onClose();
    } catch (err: any) {
      setStage('preview');
      Alert.alert(strings.saveFailed, err?.message ?? 'Try again');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Icon name="arrow-left" size={24} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{strings.title}</Text>
          <View style={{ width: 24 }} />
        </View>

        {stage === 'pick' && (
          <ScrollView contentContainerStyle={styles.pickBody}>
            <Icon name="image-plus" size={64} color="#006559" style={{ alignSelf: 'center' }} />
            <Text style={styles.introText}>{strings.intro}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => pickAndParse('library')}>
              <Icon name="image-multiple-outline" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>{strings.pickLibrary}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => pickAndParse('camera')}>
              <Icon name="camera-outline" size={20} color="#006559" />
              <Text style={styles.secondaryBtnText}>{strings.pickCamera}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {stage === 'parsing' && (
          <View style={styles.centerBody}>
            <ActivityIndicator color="#006559" size="large" />
            <Text style={styles.centerText}>{strings.parsing}</Text>
          </View>
        )}

        {stage === 'preview' && preview && (
          <PreviewEditor
            preview={preview}
            onChange={setPreview}
            strings={strings}
          />
        )}

        {stage === 'committing' && (
          <View style={styles.centerBody}>
            <ActivityIndicator color="#006559" size="large" />
            <Text style={styles.centerText}>{strings.saving}</Text>
          </View>
        )}

        {stage === 'preview' && (
          <View style={styles.footerBar}>
            <TouchableOpacity style={styles.rejectBtn} onPress={handleClose}>
              <Text style={styles.rejectBtnText}>{strings.reject}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={handleCommit}>
              <Icon name="check" size={18} color="#fff" />
              <Text style={styles.acceptBtnText}>{strings.save}</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Preview editor ─────────────────────────────────────────────────────────

interface PreviewEditorProps {
  preview: LunchMenuPreview;
  onChange: (next: LunchMenuPreview) => void;
  strings: Record<string, string>;
}

function PreviewEditor({ preview, onChange, strings }: PreviewEditorProps) {
  function updateWeek<K extends keyof LunchMenuPreview>(key: K, value: LunchMenuPreview[K]) {
    onChange({ ...preview, [key]: value });
  }

  function updateDay(index: number, next: LunchMenuDay) {
    const days = [...preview.days];
    days[index] = next;
    onChange({ ...preview, days });
  }

  return (
    <ScrollView style={styles.previewBody} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      {/* Week metadata */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{preview.restaurant ?? 'Lunch menu'}</Text>

        <View style={styles.row}>
          <FieldNumber label={strings.year}      value={preview.year}       onChange={v => updateWeek('year', v)} />
          <FieldNumber label={strings.week}      value={preview.weekNumber} onChange={v => updateWeek('weekNumber', v)} />
        </View>
        <View style={styles.row}>
          <FieldNumber label={strings.priceIsk}  value={preview.priceIsk ?? 0}  onChange={v => updateWeek('priceIsk', v)} />
          <FieldNumber label={strings.subsidyPct} value={preview.subsidyPct}    onChange={v => updateWeek('subsidyPct', v)} />
        </View>
        <FieldText label={strings.restaurant} value={preview.restaurant ?? ''} onChange={v => updateWeek('restaurant', v)} />
        <FieldText label={strings.dateLabel}  value={preview.dateLabel ?? ''}  onChange={v => updateWeek('dateLabel', v)} />
      </View>

      {/* Days */}
      {preview.days.map((day, dayIdx) => (
        <DayCard
          key={`${day.dayOfWeek}-${day.menuDate}`}
          day={day}
          strings={strings}
          onChange={next => updateDay(dayIdx, next)}
        />
      ))}
    </ScrollView>
  );
}

interface DayCardProps {
  day: LunchMenuDay;
  strings: Record<string, string>;
  onChange: (next: LunchMenuDay) => void;
}

function DayCard({ day, strings, onChange }: DayCardProps) {
  function updateOption(index: number, next: LunchMenuOption) {
    const options = [...day.options];
    options[index] = next;
    onChange({ ...day, options });
  }

  return (
    <View style={styles.card}>
      <View style={styles.dayHeader}>
        <Text style={styles.cardTitle}>{day.dayOfWeek}</Text>
        <Text style={styles.dayDate}>{day.menuDate}</Text>
      </View>

      {day.holiday ? (
        <View style={styles.holidayPill}>
          <Icon name="calendar-star" size={14} color="#b45309" />
          <Text style={styles.holidayText}>{day.holiday}</Text>
        </View>
      ) : null}

      {day.options.length === 0 && !day.holiday ? (
        <Text style={styles.emptyDay}>(no options)</Text>
      ) : null}

      {day.options.map((opt, optIdx) => {
        const isLine = opt.translations.find(t => t.lang === 'is');
        const enLine = opt.translations.find(t => t.lang === 'en');
        return (
          <View key={`${day.dayOfWeek}-${opt.category}-${opt.sortOrder}`} style={styles.optionBlock}>
            <View style={styles.optionHeader}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{opt.category}</Text>
              </View>
              <Text style={styles.sortHint}>#{opt.sortOrder}</Text>
            </View>

            <FieldText
              label={strings.isLabel}
              value={isLine?.description ?? ''}
              onChange={v => {
                const translations = opt.translations.map(t =>
                  t.lang === 'is' ? { ...t, description: v } : t,
                );
                updateOption(optIdx, { ...opt, translations });
              }}
              multiline
            />
            <FieldText
              label={strings.enLabel}
              value={enLine?.description ?? ''}
              onChange={v => {
                const translations = opt.translations.map(t =>
                  t.lang === 'en' ? { ...t, description: v } : t,
                );
                updateOption(optIdx, { ...opt, translations });
              }}
              multiline
            />
          </View>
        );
      })}
    </View>
  );
}

interface FieldTextProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
}

function FieldText({ label, value, onChange, multiline }: FieldTextProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
      />
    </View>
  );
}

interface FieldNumberProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
}

function FieldNumber({ label, value, onChange }: FieldNumberProps) {
  return (
    <View style={[styles.field, { flex: 1 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={String(value)}
        keyboardType="number-pad"
        onChangeText={t => {
          const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#C7D3D3' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111' },

  // Pick stage
  pickBody: { padding: 24, gap: 18 },
  introText: { fontSize: 14, lineHeight: 20, color: '#374151', textAlign: 'center', marginVertical: 12 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#006559', borderRadius: 12, paddingVertical: 14,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: '#006559',
  },
  secondaryBtnText: { color: '#006559', fontWeight: '700', fontSize: 15 },

  // Loading / saving
  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  centerText: { color: '#374151', fontSize: 15 },

  // Preview editor
  previewBody: { flex: 1, padding: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  dayDate: { fontSize: 13, color: '#6b7280' },

  holidayPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
    alignSelf: 'flex-start', marginBottom: 8,
  },
  holidayText: { fontSize: 13, color: '#b45309', fontWeight: '600' },

  emptyDay: { color: '#9ca3af', fontStyle: 'italic', fontSize: 13 },

  optionBlock: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 10, marginTop: 6 },
  optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  categoryBadge: {
    backgroundColor: '#e6f4f1', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  categoryBadgeText: { color: '#006559', fontWeight: '700', fontSize: 12 },
  sortHint: { color: '#9ca3af', fontSize: 11 },

  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600', marginBottom: 4 },
  fieldInput: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#111',
    backgroundColor: '#fafafa',
  },
  fieldInputMulti: { minHeight: 60, textAlignVertical: 'top' },

  // Footer
  footerBar: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  rejectBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, paddingVertical: 13, borderWidth: 1, borderColor: '#dc2626',
  },
  rejectBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 15 },
  acceptBtn: {
    flex: 2, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#006559', borderRadius: 10, paddingVertical: 13,
  },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
