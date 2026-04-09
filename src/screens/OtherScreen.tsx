import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import TravelRequestScreen from './TravelRequestScreen';

const CARD_SIZE = (Dimensions.get('window').width - 48) / 2;

const ITEMS: { label: string; icon: string; color: string; bg: string; action?: string }[] = [
  { label: 'Travel Request',  icon: 'airplane',          color: '#0369a1', bg: '#e0f2fe', action: 'travel' },
  { label: 'Sport Grant',     icon: 'run-fast',           color: '#15803d', bg: '#dcfce7' },
  { label: 'Non Car Grant',   icon: 'bus',                color: '#b45309', bg: '#fef3c7' },
  { label: 'IT Request',      icon: 'laptop',             color: '#7c3aed', bg: '#ede9fe' },
  { label: 'Add Announcement', icon: 'bullhorn',          color: '#dc2626', bg: '#fee2e2' },
];

export default function OtherScreen() {
  const [travelOpen, setTravelOpen] = useState(false);

  function handlePress(action?: string) {
    if (action === 'travel') setTravelOpen(true);
    else Alert.alert('Coming Soon', 'Not implemented yet, coming soon!');
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.grid}>
          {ITEMS.map(item => (
            <TouchableOpacity
              key={item.label}
              style={[styles.card, { backgroundColor: item.bg }]}
              activeOpacity={0.8}
              onPress={() => handlePress(item.action)}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.color + '20' }]}>
                <Icon name={item.icon} size={32} color={item.color} />
              </View>
              <Text style={[styles.cardLabel, { color: item.color }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <TravelRequestScreen visible={travelOpen} onClose={() => setTravelOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#C7D3D3' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
