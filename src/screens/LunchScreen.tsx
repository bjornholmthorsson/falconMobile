import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getLunchMenu, getLunchOrders, submitLunchOrders } from '../services/api';
import { useAppStore } from '../store/appStore';
import type { LunchWeek, LunchDay, LunchOption } from '../models';

// ── ISO week helpers ──────────────────────────────────────────────────────────

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function isoWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  return d.getUTCFullYear();
}

const DAY_SHORT: Record<string, string> = {
  Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THU', Friday: 'FRI',
};

// ── Food tile helpers ─────────────────────────────────────────────────────────

type FoodTile = { icon: string; bg: string; color: string };

function getFoodTile(category: string): FoodTile {
  const lower = category.toLowerCase();
  if (/burger/.test(lower))                                                    return { icon: 'hamburger',       bg: '#fff3e0', color: '#f97316' };
  if (/fish|salmon|cod|trout|tuna|halibut|seafood|prawn|shrimp/.test(lower))  return { icon: 'fish',             bg: '#e0f2fe', color: '#0ea5e9' };
  if (/keto/.test(lower))                                                      return { icon: 'food-drumstick',   bg: '#fef3c7', color: '#b45309' };
  if (/vegan|plant/.test(lower))                                               return { icon: 'leaf',             bg: '#dcfce7', color: '#16a34a' };
  if (/salad/.test(lower))                                                     return { icon: 'food-variant',     bg: '#f0fdf4', color: '#22c55e' };
  if (/soup|stew|chowder/.test(lower))                                         return { icon: 'pot-steam',        bg: '#fef9c3', color: '#ca8a04' };
  if (/pasta|noodle|spaghetti|penne/.test(lower))                              return { icon: 'pasta',            bg: '#fef3c7', color: '#d97706' };
  if (/chicken|poultry|hen/.test(lower))                                       return { icon: 'food-drumstick',   bg: '#fff7ed', color: '#ea580c' };
  if (/lamb|beef|pork|meat|steak|ribs|mince|minced/.test(lower))               return { icon: 'food-steak',       bg: '#fee2e2', color: '#dc2626' };
  return { icon: 'silverware-fork-knife', bg: '#f3f4f6', color: '#6b7280' };
}

// Returns today's date, but bumps to next Monday on Saturday (6) or Sunday (0)
function relevantWeekDate(): Date {
  const d = new Date();
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() + 2); // Sat → Mon
  if (dow === 0) d.setDate(d.getDate() + 1); // Sun → Mon
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LunchScreen() {
  const currentUser = useAppStore(s => s.currentUser);
  const userId = currentUser?.id ?? '';

  const now = relevantWeekDate();
  const [year, setYear]           = useState(isoWeekYear(now));
  const [week, setWeek]           = useState(isoWeekNumber(now));
  const [activeDayId, setActiveDayId] = useState<number | null>(null);
  const [selections, setSelections]   = useState<Record<number, string>>({});
  const [submitting, setSubmitting]   = useState(false);
  const qc = useQueryClient();

  // Reset to the relevant week every time the screen comes into focus
  useFocusEffect(useCallback(() => {
    const d = relevantWeekDate();
    setYear(isoWeekYear(d));
    setWeek(isoWeekNumber(d));
  }, []));

  const { data, isFetching, isError } = useQuery<LunchWeek>({
    queryKey: ['lunchMenu', year, week],
    queryFn: () => getLunchMenu(year, week),
    staleTime: 10 * 60 * 1000,
  });

  const { data: savedOrders } = useQuery<Record<number, string>>({
    queryKey: ['lunchOrders', userId, year, week],
    queryFn: () => getLunchOrders(userId, year, week),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  // Sync saved orders → local selections
  useEffect(() => {
    setSelections(savedOrders ?? {});
  }, [savedOrders, year, week]);

  // Whenever the displayed week changes, clear the active day so it gets re-derived below
  useEffect(() => {
    setActiveDayId(null);
  }, [year, week]);

  // Default to first non-holiday day when week data loads or active day is reset
  useEffect(() => {
    if (data?.days?.length && activeDayId === null) {
      const first = data.days.find(d => !d.holiday);
      setActiveDayId(first?.id ?? data.days[0].id);
    }
  }, [data, activeDayId]);

  function shiftWeek(delta: number) {
    const d = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    d.setUTCDate(d.getUTCDate() + delta * 7);
    setYear(isoWeekYear(d));
    setWeek(isoWeekNumber(d));
    setSelections({});
    setActiveDayId(null);
  }

  function toggleSelection(dayId: number, category: string) {
    setSelections(prev => {
      // Tapping the already-selected item de-selects it
      if (prev[dayId] === category) {
        const next = { ...prev };
        delete next[dayId];
        return next;
      }
      return { ...prev, [dayId]: category };
    });
  }

  async function handleSubmit() {
    if (!data || !userId) return;
    const orders = Object.entries(selections).map(([dayId, category]) => ({
      dayId: Number(dayId),
      category,
    }));
    if (orders.length === 0) return;

    setSubmitting(true);
    try {
      const ok = await submitLunchOrders(userId, data.id, orders);
      if (ok) {
        qc.setQueryData(['lunchOrders', userId, year, week], { ...selections });
        Alert.alert('Order placed', 'Your lunch selections have been saved.');
      } else {
        Alert.alert('Error', 'Could not save your order. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not save your order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Build current order items from selections + menu data
  const orderItems: { day: LunchDay; option: LunchOption }[] = [];
  if (data) {
    for (const day of data.days) {
      const category = selections[day.id];
      if (category && category !== 'No thanks') {
        const option = day.options.find(o => o.category === category);
        if (option) orderItems.push({ day, option });
      }
    }
  }


  const activeDay = data?.days.find(d => d.id === activeDayId) ?? null;

  return (
    <View style={styles.container}>
      {/* ── Week navigator ── */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => shiftWeek(-1)} style={styles.navBtn}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.weekLabelContainer}>
          <Text style={styles.restaurantLabel}>{data?.restaurant ?? '…'}</Text>
          <Text style={styles.weekLabel}>{data?.dateLabel ?? `Week ${week}, ${year}`}</Text>
          <Text style={styles.weekNumber}>Week {week}</Text>
        </View>
        <TouchableOpacity onPress={() => shiftWeek(1)} style={styles.navBtn}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {isFetching ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : isError || !data ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No menu for this week!</Text>
        </View>
      ) : (
        <>
          {/* ── Day selector (sticky) ── */}
          <View style={styles.daySelectorWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daySelectorContent}>
              {data.days.map(day => {
                const isActive  = day.id === activeDayId;
                const dayDate   = new Date(day.date);
                const dateNum   = dayDate.getUTCDate();
                return (
                  <TouchableOpacity
                    key={day.id}
                    style={[styles.dayPill, isActive && styles.dayPillActive, day.holiday && styles.dayPillHoliday]}
                    onPress={() => setActiveDayId(day.id)}
                  >
                    <Text style={[styles.dayPillShort, isActive && styles.dayPillTextActive]}>
                      {DAY_SHORT[day.dayOfWeek] ?? day.dayOfWeek.slice(0, 3).toUpperCase()}
                    </Text>
                    <Text style={[styles.dayPillDate, isActive && styles.dayPillTextActive]}>
                      {dateNum}
                    </Text>
                    {selections[day.id] && (
                      <View style={styles.dayPillDot} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* ── Active day menu items ── */}
          {activeDay ? (
            activeDay.holiday ? (
              <View style={styles.holidayCard}>
                <Icon name="calendar-remove-outline" size={28} color="#9ca3af" />
                <Text style={styles.holidayCardText}>{activeDay.holiday}</Text>
              </View>
            ) : (
              <View style={styles.menuCard}>
                <Text style={styles.menuCardTitle}>{activeDay.dayOfWeek}'s Menu</Text>
                {activeDay.options.map((opt, index) => {
                  const selected = selections[activeDay.id] === opt.category;
                  const isFirst  = index === 0;
                  return (
                    <TouchableOpacity
                      key={opt.category}
                      style={[styles.menuItem, selected && styles.menuItemSelected]}
                      onPress={() => toggleSelection(activeDay.id, opt.category)}
                      activeOpacity={0.7}
                    >
                      {(() => {
                        const tile = getFoodTile(opt.category);
                        return (
                          <View style={[styles.foodTile, { backgroundColor: tile.bg }]}>
                            <Icon name={tile.icon} size={26} color={tile.color} />
                          </View>
                        );
                      })()}
                      <View style={styles.menuItemLeft}>

                        <Text style={[styles.menuItemName, selected && styles.menuItemNameSelected]}>
                          {opt.category}
                        </Text>
                        {opt.description ? (
                          <Text style={styles.menuItemDesc}>{opt.description}</Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={[styles.addBtn, selected && styles.addBtnSelected]}
                        onPress={() => toggleSelection(activeDay.id, opt.category)}
                      >
                        <Icon
                          name={selected ? 'check' : 'plus'}
                          size={18}
                          color={selected ? '#fff' : '#006559'}
                        />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
          ) : null}

          {/* ── Current Order ── */}
          {orderItems.length > 0 && (
            <View style={styles.orderCard}>
              <View style={styles.orderCardHeader}>
                <Icon name="cart-outline" size={18} color="#006559" />
                <Text style={styles.orderCardTitle}>Current Order</Text>
              </View>

              {orderItems.map(({ day, option }) => {
                const tile = getFoodTile(option.category);
                return (
                  <View key={day.id} style={styles.orderRow}>
                    <View style={[styles.orderFoodTile, { backgroundColor: tile.bg }]}>
                      <Icon name={tile.icon} size={18} color={tile.color} />
                    </View>
                    <View style={styles.orderRowLeft}>
                      <Text style={styles.orderRowName}>
                      {day.date ? `${new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ` : ''}{day.dayOfWeek}
                    </Text>
                      <Text style={styles.orderRowDay}>{option.category}</Text>
                    </View>
                  </View>
                );
              })}


              <TouchableOpacity
                style={styles.placeOrderBtn}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.placeOrderText}>
                    Place Order · {orderItems.length} {orderItems.length === 1 ? 'meal' : 'meals'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          </ScrollView>
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#C7D3D3' },
  scroll:    { padding: 16, paddingBottom: 32 },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 15, color: '#9ca3af', textAlign: 'center' },

  // Week nav
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 12,
  },
  navBtn:    { padding: 8 },
  navArrow:  { fontSize: 28, color: '#fff', fontWeight: '600' },
  weekLabelContainer: { flex: 1, alignItems: 'center' },
  restaurantLabel:    { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  weekLabel:          { fontSize: 17, fontWeight: '800', color: '#fff', textAlign: 'center' },
  weekNumber:         { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  // Day selector
  daySelectorWrapper: { height: 84, justifyContent: 'center', marginBottom: 4 },
  daySelectorContent: { paddingHorizontal: 16, flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  dayPill: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 12,
    marginRight: 8,
    width: 54,
    height: 68,
    gap: 2,
  },
  dayPillActive:   { backgroundColor: '#006559' },
  dayPillHoliday:  { opacity: 0.5 },
  dayPillShort:    { fontSize: 11, fontWeight: '700', color: '#4b5563', letterSpacing: 0.5 },
  dayPillDate:     { fontSize: 18, fontWeight: '800', color: '#4b5563' },
  dayPillTextActive: { color: '#fff' },
  dayPillDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: '#a7d4c0',
    marginTop: 2,
  },

  // Holiday card
  holidayCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  holidayCardText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', fontStyle: 'italic' },

  // Menu card
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  menuCardTitle: { fontSize: 16, fontWeight: '700', color: '#1e1b14', marginBottom: 12 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  menuItemSelected: { backgroundColor: '#f0faf7', borderRadius: 10, paddingHorizontal: 8, marginHorizontal: -8 },
  menuItemLeft:     { flex: 1, gap: 3 },
  foodTile: {
    width: 52, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 4,
  },
  chefBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#006559',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  chefBadgeText:         { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.8 },
  menuItemName:          { fontSize: 15, fontWeight: '700', color: '#1e1b14' },
  menuItemNameSelected:  { color: '#006559' },
  menuItemDesc:          { fontSize: 12, color: '#6b7280', lineHeight: 17 },
  menuItemPrice:         { fontSize: 13, fontWeight: '600', color: '#006559', marginTop: 4 },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5, borderColor: '#006559',
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnSelected: { backgroundColor: '#006559', borderColor: '#006559' },

  // Order card
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  orderCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  orderCardTitle:  { fontSize: 16, fontWeight: '700', color: '#1e1b14' },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  orderFoodTile: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  orderRowLeft:  { gap: 2, flex: 1 },
  orderRowName:  { fontSize: 14, fontWeight: '600', color: '#1e1b14' },
  orderRowDay:   { fontSize: 12, color: '#9ca3af' },
  orderRowPrice: { fontSize: 14, fontWeight: '600', color: '#1e1b14' },

  orderSummary:    { gap: 6, marginTop: 4 },
  orderDivider:    { height: 1, backgroundColor: '#f3f4f6', marginVertical: 4 },
  orderSummaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  orderSummaryLabel: { fontSize: 13, color: '#6b7280' },
  orderSummaryValue: { fontSize: 13, color: '#1e1b14', fontWeight: '500' },
  orderSubsidy:      { color: '#006559' },
  orderTotalLabel:   { fontSize: 15, fontWeight: '700', color: '#1e1b14' },
  orderTotalValue:   { fontSize: 15, fontWeight: '800', color: '#1e1b14' },

  placeOrderBtn: {
    backgroundColor: '#006559',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#006559',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  placeOrderText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
