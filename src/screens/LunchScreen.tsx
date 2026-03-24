import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

const MENU: {
  day: string;
  date: string;
  holiday?: string;
  options: { label: string; description: string }[];
}[] = [
  {
    day: 'Monday',
    date: 'March 30',
    options: [
      { label: 'Meat', description: 'Meatballs with pre-boiled potatoes, rhubarb jam, green beans, red cabbage and onion sauce' },
      { label: 'Vegan', description: 'Indian kofta balls with pre-boiled potatoes, broccoli, cauliflower and curry sauce' },
      { label: 'Keto', description: 'Beef meatballs with pre-boiled potatoes, red cabbage, green beans and onion sauce' },
      { label: 'Fish', description: 'Overnight-salted cod with butter, crackers and rye bread' },
      { label: 'Salad', description: 'Sweet potato salad' },
      { label: 'Burger', description: 'With cheese, lettuce, burger sauce, fries and cocktail sauce' },
      { label: 'No thanks', description: '' },
    ],
  },
  {
    day: 'Tuesday',
    date: 'March 31',
    options: [
      { label: 'Meat', description: 'BBQ pork ribs with potato wedges, coleslaw and cocktail sauce' },
      { label: 'Vegan', description: 'Chickpea stew with couscous, mint and flatbread' },
      { label: 'Keto', description: 'Pork ribs with grilled vegetables, coleslaw and garlic aioli' },
      { label: 'Salad', description: 'Falafel salad' },
      { label: 'Burger', description: 'With cheese, lettuce, burger sauce, fries and cocktail sauce' },
      { label: 'No thanks', description: '' },
    ],
  },
  {
    day: 'Wednesday',
    date: 'April 1',
    options: [
      { label: 'Meat', description: 'Harissa chicken thighs with sweet potatoes, grilled vegetables and dill yogurt sauce' },
      { label: 'Vegan', description: 'Falafel balls with sweet potatoes, grilled vegetables and harissa sauce' },
      { label: 'Keto', description: 'Harissa chicken thighs with grilled vegetables, avocado salad and dill yogurt sauce' },
      { label: 'Fish', description: 'Ling in harissa oil with sweet potatoes, grilled vegetables and dill yogurt sauce' },
      { label: 'Salad', description: 'Caesar salad' },
      { label: 'Burger', description: 'With cheese, lettuce, burger sauce, fries and cocktail sauce' },
      { label: 'No thanks', description: '' },
    ],
  },
  {
    day: 'Thursday',
    date: 'April 2',
    holiday: 'Maundy Thursday – Public Holiday',
    options: [],
  },
  {
    day: 'Friday',
    date: 'April 3',
    holiday: 'Good Friday – Public Holiday',
    options: [],
  },
];

export default function LunchScreen() {
  const [selections, setSelections] = useState<Record<string, string>>({});

  function select(day: string, option: string) {
    setSelections(prev => ({ ...prev, [day]: option }));
  }

  const selectedCount = Object.values(selections).filter(v => v && v !== 'Nei').length;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Lunch</Text>
      <View style={styles.card}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.menuTitle}>Bragðlaukar — March 30 – April 1</Text>
          <Text style={styles.menuSubtitle}>995 kr. per meal (FDS pays 50%)</Text>

          {MENU.map(day => (
            <View key={day.day} style={styles.daySection}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayName}>{day.day}</Text>
                <Text style={styles.dayDate}>{day.date}</Text>
              </View>

              {day.holiday ? (
                <Text style={styles.holidayText}>{day.holiday}</Text>
              ) : (
                day.options.map(opt => {
                  const selected = selections[day.day] === opt.label;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      style={[styles.option, selected && styles.optionSelected]}
                      onPress={() => select(day.day, opt.label)}
                    >
                      <View style={[styles.radio, selected && styles.radioSelected]}>
                        {selected && <View style={styles.radioDot} />}
                      </View>
                      <View style={styles.optionText}>
                        <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                          {opt.label}
                        </Text>
                        {opt.description ? (
                          <Text style={styles.optionDesc}>{opt.description}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          ))}

          {selectedCount > 0 && (
            <TouchableOpacity style={styles.submitBtn}>
              <Text style={styles.submitText}>
                Order ({selectedCount} {selectedCount === 1 ? 'meal' : 'meals'})
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#10493C', padding: 16 },
  header: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 16 },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  menuTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 4 },
  menuSubtitle: { fontSize: 13, color: '#666', marginBottom: 16 },
  daySection: { marginBottom: 20 },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#10493C',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  dayName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  dayDate: { fontSize: 13, color: '#a7d4c0' },
  holidayText: { fontSize: 14, color: '#999', fontStyle: 'italic', paddingLeft: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    marginBottom: 2,
  },
  optionSelected: { backgroundColor: '#f0f9f5' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    marginRight: 10,
  },
  radioSelected: { borderColor: '#10493C' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10493C' },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 14, fontWeight: '600', color: '#111' },
  optionLabelSelected: { color: '#10493C' },
  optionDesc: { fontSize: 12, color: '#666', marginTop: 2, lineHeight: 17 },
  submitBtn: {
    backgroundColor: '#10493C',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  submitText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
