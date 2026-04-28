import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import TravelRequestScreen from './TravelRequestScreen';
import LunchOrdersScreen from './LunchOrdersScreen';
import AnnouncementCreateScreen from './AnnouncementCreateScreen';
import { useAppStore } from '../store/appStore';

const CARD_SIZE = (Dimensions.get('window').width - 48) / 2;

const REYKJAVIK_OFFICES = ['reykjavik', 'kopavogur'];

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const ITEMS: { label: string; icon: string; color: string; bg: string; action?: string; requireOffice?: string[]; requireToken?: string }[] = [
  { label: 'Travel Request',   icon: 'airplane',  color: '#0369a1', bg: '#e0f2fe', action: 'travel' },
  { label: 'Lunch Orders',    icon: 'food-apple',  color: '#059669', bg: '#d1fae5', action: 'lunchOrders', requireToken: 'LunchOrders' },
  { label: 'Sport Grant',      icon: 'run-fast',   color: '#15803d', bg: '#dcfce7', requireOffice: REYKJAVIK_OFFICES },
  { label: 'Non Car Grant',    icon: 'bus',        color: '#b45309', bg: '#fef3c7', requireOffice: REYKJAVIK_OFFICES },
  { label: 'IT Request',       icon: 'laptop',     color: '#7c3aed', bg: '#ede9fe' },
  { label: 'Add Announcement', icon: 'bullhorn',   color: '#dc2626', bg: '#fee2e2', action: 'announcement', requireToken: 'AddAnnouncement' },
];

export default function OtherScreen() {
  const currentUser = useAppStore(s => s.currentUser);
  const userTokens = useAppStore(s => s.userTokens);
  const [travelOpen, setTravelOpen] = useState(false);
  const [lunchOrdersOpen, setLunchOrdersOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);

  const visibleItems = useMemo(() => {
    const office = stripAccents(currentUser?.officeLocation?.toLowerCase() ?? '');
    return ITEMS.filter(item => {
      if (item.requireOffice && !item.requireOffice.some(c => office.includes(c))) return false;
      if (item.requireToken && !userTokens.includes(item.requireToken)) return false;
      return true;
    });
  }, [currentUser?.officeLocation, userTokens]);

  function handlePress(action?: string) {
    if (action === 'travel') setTravelOpen(true);
    else if (action === 'lunchOrders') setLunchOrdersOpen(true);
    else if (action === 'announcement') setAnnouncementOpen(true);
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.grid}>
          {visibleItems.map(item => {
            const comingSoon = !item.action;
            return (
              <TouchableOpacity
                key={item.label}
                style={[styles.card, { backgroundColor: item.bg }, comingSoon && styles.cardDisabled]}
                activeOpacity={comingSoon ? 1 : 0.8}
                onPress={() => handlePress(item.action)}
                disabled={comingSoon}
              >
                {comingSoon && (
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>Coming Soon!</Text>
                  </View>
                )}
                <View style={[styles.iconCircle, { backgroundColor: item.color + '20' }]}>
                  <Icon name={item.icon} size={32} color={comingSoon ? item.color + '60' : item.color} />
                </View>
                <Text style={[styles.cardLabel, { color: comingSoon ? item.color + '60' : item.color }]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <TravelRequestScreen visible={travelOpen} onClose={() => setTravelOpen(false)} />
      <LunchOrdersScreen visible={lunchOrdersOpen} onClose={() => setLunchOrdersOpen(false)} />
      <AnnouncementCreateScreen visible={announcementOpen} onClose={() => setAnnouncementOpen(false)} />
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
  cardDisabled: {
    opacity: 0.55,
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(253, 224, 71, 0.7)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#713f12',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
