import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery } from '@tanstack/react-query';
import { getLunchOrdersSummary } from '../services/api';
import type { LunchOrdersSummary } from '../services/api';
import { useAppStore } from '../store/appStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function getISOWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

const CATEGORY_ICONS: Record<string, { icon: string; color: string }> = {
  burger:  { icon: 'hamburger',     color: '#b45309' },
  fish:    { icon: 'fish',          color: '#0284c7' },
  vegan:   { icon: 'leaf',          color: '#15803d' },
  salad:   { icon: 'food-apple',    color: '#16a34a' },
  soup:    { icon: 'bowl-mix',      color: '#d97706' },
  pasta:   { icon: 'pasta',         color: '#dc2626' },
  chicken: { icon: 'food-drumstick', color: '#ea580c' },
  meat:    { icon: 'food-steak',    color: '#9f1239' },
};

function categoryMeta(cat: string) {
  const key = cat.toLowerCase();
  return CATEGORY_ICONS[key] ?? { icon: 'silverware-fork-knife', color: '#6b7280' };
}

export default function LunchOrdersScreen({ visible, onClose }: Props) {
  const currentUser = useAppStore(s => s.currentUser);
  const now = getISOWeek(new Date());
  const [year, setYear] = useState(now.year);
  const [week, setWeek] = useState(now.week);

  const { data, isFetching, error } = useQuery<LunchOrdersSummary>({
    queryKey: ['lunchOrdersSummary', year, week],
    queryFn: () => getLunchOrdersSummary(year, week),
    enabled: visible,
  });

  function shiftWeek(delta: number) {
    const d = new Date(year, 0, 1 + (week + delta - 1) * 7);
    const iw = getISOWeek(d);
    setYear(iw.year);
    setWeek(iw.week);
  }

  // Monday–Friday date range for the current week
  const weekRange = useMemo(() => {
    // ISO week: Jan 4 is always in week 1
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7; // Mon=1 .. Sun=7
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
    const friday = new Date(monday);
    friday.setUTCDate(monday.getUTCDate() + 4);
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `${fmt(monday)} – ${fmt(friday)}`;
  }, [year, week]);

  // Build email body with summary + per-day breakdown
  const emailBody = useMemo(() => {
    if (!data?.days?.length) return '';
    const uniquePeople = new Set(data.days.flatMap(d => d.orders.map(o => o.userId))).size;

    let body = `Lunch Orders – Week ${data.week}, ${data.year}\n`;
    body += `${weekRange}\n\n`;
    body += `Total orders: ${data.totalOrders}  |  Days: ${data.days.length}  |  People: ${uniquePeople}\n`;
    body += '═'.repeat(50) + '\n\n';

    for (const day of data.days) {
      const dateStr = new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long',
      });

      // Category counts
      const categoryCounts: Record<string, number> = {};
      for (const o of day.orders) {
        categoryCounts[o.category] = (categoryCounts[o.category] ?? 0) + 1;
      }
      const summaryParts = Object.entries(categoryCounts).map(([cat, count]) => `${cat}: ${count}`);

      body += `${dateStr} — ${day.orders.length} orders\n`;
      body += `  ${summaryParts.join('  ·  ')}\n`;
      body += '─'.repeat(50) + '\n';

      // Pad names to align categories
      const maxName = Math.max(...day.orders.map(o => o.displayName.length));
      for (const order of day.orders) {
        body += `  ${order.displayName.padEnd(maxName + 2)}${order.category}\n`;
      }
      body += '\n';
    }
    return body;
  }, [data, weekRange]);

  function handleEmail() {
    if (!currentUser?.userPrincipalName) return;
    const subject = encodeURIComponent(`Lunch Orders - Week ${week}, ${year}`);
    const body = encodeURIComponent(emailBody);
    Linking.openURL(`mailto:${currentUser.userPrincipalName}?subject=${subject}&body=${body}`);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Icon name="arrow-left" size={24} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Lunch Orders</Text>
          <TouchableOpacity onPress={handleEmail} disabled={!data?.days?.length}>
            <Icon name="email-outline" size={24} color={data?.days?.length ? '#006559' : '#d1d5db'} />
          </TouchableOpacity>
        </View>

        {/* Week navigator */}
        <View style={styles.weekNav}>
          <TouchableOpacity onPress={() => shiftWeek(-1)} style={styles.navBtn}>
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.weekLabel}>
            <Text style={styles.weekText}>Week {week}</Text>
            <Text style={styles.yearText}>{year}</Text>
            <Text style={styles.yearText}>{weekRange}</Text>
          </View>
          <TouchableOpacity onPress={() => shiftWeek(1)} style={styles.navBtn}>
            <Text style={styles.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          {isFetching ? (
            <ActivityIndicator color="#006559" size="large" style={{ marginTop: 40 }} />
          ) : error ? (
            <View style={styles.emptyState}>
              <Icon name="alert-circle-outline" size={48} color="#ef4444" />
              <Text style={styles.emptyText}>Failed to load orders</Text>
            </View>
          ) : !data?.days?.length ? (
            <View style={styles.emptyState}>
              <Icon name="food-off" size={48} color="#9ca3af" />
              <Text style={styles.emptyText}>No orders for this week</Text>
            </View>
          ) : (
            <>
              {/* Summary bar */}
              <View style={styles.summaryBar}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryNumber}>{data.totalOrders}</Text>
                  <Text style={styles.summaryLabel}>Total Orders</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryNumber}>{data.days.length}</Text>
                  <Text style={styles.summaryLabel}>Days</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryNumber}>
                    {new Set(data.days.flatMap(d => d.orders.map(o => o.userId))).size}
                  </Text>
                  <Text style={styles.summaryLabel}>People</Text>
                </View>
              </View>

              {/* Day cards */}
              {data.days.map(day => {
                const dateStr = new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long',
                });
                // Group by category for count badges
                const categoryCounts: Record<string, number> = {};
                for (const o of day.orders) {
                  categoryCounts[o.category] = (categoryCounts[o.category] ?? 0) + 1;
                }

                return (
                  <View key={day.date} style={styles.dayCard}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayName}>{dateStr}</Text>
                      <Text style={styles.dayCount}>{day.orders.length} orders</Text>
                    </View>

                    {/* Category summary chips */}
                    <View style={styles.chipRow}>
                      {Object.entries(categoryCounts).map(([cat, count]) => {
                        const meta = categoryMeta(cat);
                        return (
                          <View key={cat} style={styles.chip}>
                            <Icon name={meta.icon} size={14} color={meta.color} />
                            <Text style={[styles.chipText, { color: meta.color }]}>
                              {cat} ({count})
                            </Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* Individual orders */}
                    {day.orders.map((order, i) => {
                      const meta = categoryMeta(order.category);
                      return (
                        <View
                          key={`${order.userId}-${day.date}`}
                          style={[styles.orderRow, i === day.orders.length - 1 && { borderBottomWidth: 0 }]}
                        >
                          <View style={[styles.catDot, { backgroundColor: meta.color + '20' }]}>
                            <Icon name={meta.icon} size={16} color={meta.color} />
                          </View>
                          <Text style={styles.orderName}>{order.displayName}</Text>
                          <Text style={[styles.orderCategory, { color: meta.color }]}>{order.category}</Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
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

  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  navBtn: { paddingHorizontal: 20, paddingVertical: 4 },
  navBtnText: { fontSize: 28, color: '#006559', fontWeight: '300' },
  weekLabel: { alignItems: 'center', minWidth: 100 },
  weekText: { fontSize: 18, fontWeight: '700', color: '#111' },
  yearText: { fontSize: 13, color: '#9ca3af' },

  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40 },

  summaryBar: {
    flexDirection: 'row', backgroundColor: '#006559', borderRadius: 12,
    padding: 16, marginBottom: 16, justifyContent: 'space-around',
  },
  summaryItem: { alignItems: 'center' },
  summaryNumber: { fontSize: 22, fontWeight: '800', color: '#fff' },
  summaryLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 2 },

  dayCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 16,
    overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  dayName: { fontSize: 15, fontWeight: '700', color: '#111' },
  dayCount: { fontSize: 13, color: '#006559', fontWeight: '600' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f9fafb', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  chipText: { fontSize: 12, fontWeight: '600' },

  orderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  catDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  orderName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#111' },
  orderCategory: { fontSize: 13, fontWeight: '600' },

  emptyState: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: '#9ca3af', fontWeight: '500' },
});
