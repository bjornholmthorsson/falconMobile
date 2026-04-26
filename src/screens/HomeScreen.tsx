/**
 * HomeScreen — office summary bars (Available / Away / Busy / Offline counts).
 * Refreshes every 60 seconds while visible, matching the Xamarin polling timer.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  ImageBackground,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getUsersByDepartment, getPresenceForUsers, DEPARTMENTS, getDepartmentLabel, getDepartmentOffices, loadDepartmentLabels } from '../services/graphService';
import { getUserAbsences, getLunchMenu, getLunchOrders } from '../services/api';
import { signOut } from '../services/authService';
import { useAppStore, type InAppNotification } from '../store/appStore';
import { decrementBadge, removeDeliveredNotification } from '../services/notificationService';
import type { OfficeSummary, LunchWeek } from '../models';

const CARD_SIZE = (Dimensions.get('window').width - 48) / 2;

const CITY_IMAGES: Record<string, any> = {
  'Amsterdam':   require('../assets/images/cities/amsterdam.jpg'),
  'Reykjavik':   require('../assets/images/cities/reykjavik.jpg'),
  'Ho Chi Minh': require('../assets/images/cities/hochiminh.jpg'),
  'Lisbon':      require('../assets/images/cities/lisbon.jpg'),
  'Deventer':    require('../assets/images/cities/deventer.jpg'),
  'Gouda':       require('../assets/images/cities/gouda.jpg'),
};

const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  'Amsterdam':   { lat: 52.3676, lon: 4.9041 },
  'Reykjavik':   { lat: 64.1355, lon: -21.8954 },
  'Ho Chi Minh': { lat: 10.8231, lon: 106.6297 },
  'Lisbon':      { lat: 38.7223, lon: -9.1393 },
  'Deventer':    { lat: 52.2554, lon: 6.1600 },
  'Gouda':       { lat: 52.0115, lon: 4.7104 },
};

type WeatherInfo = { temp: number; icon: string };

function weatherIcon(code: number, isDay: boolean): string {
  if (code === 0)                         return isDay ? 'weather-sunny'            : 'weather-night';
  if (code <= 2)                          return isDay ? 'weather-partly-cloudy'    : 'weather-night-partly-cloudy';
  if (code === 3)                         return 'weather-cloudy';
  if (code <= 48)                         return 'weather-fog';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'weather-rainy';
  if (code <= 77 || (code >= 85 && code <= 86)) return 'weather-snowy';
  return 'weather-lightning-rainy';
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherInfo> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API ${res.status}`);
  const json = await res.json();
  const cw = json.current_weather;
  if (!cw || cw.temperature == null || cw.weathercode == null) throw new Error('Bad weather data');
  return {
    temp: Math.round(cw.temperature),
    icon: weatherIcon(cw.weathercode, cw.is_day === 1),
  };
}

// ── Lunch helpers (shared with LunchScreen) ───────────────────────────────────
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
function relevantWeekDate(): Date {
  const d = new Date();
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() + 2);
  if (dow === 0) d.setDate(d.getDate() + 1);
  return d;
}
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
const DAY_SHORT: Record<string, string> = {
  Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THU', Friday: 'FRI',
};

const REFRESH_INTERVAL_MS = 60_000;

export default function HomeScreen() {
  const setIsAuthenticated = useAppStore(s => s.setIsAuthenticated);
  const setCurrentUser = useAppStore(s => s.setCurrentUser);
  const currentUser = useAppStore(s => s.currentUser);
  const setTeamOfficeFilter = useAppStore(s => s.setTeamOfficeFilter);
  const checkinEnabled = useAppStore(s => s.checkinEnabled);
  const notifications = useAppStore(s => s.notifications);
  const dismissNotification = useAppStore(s => s.dismissNotification);
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [cycle, setCycle] = useState(0);

  useFocusEffect(useCallback(() => {
    setCycle(c => c + 1);
  }, []));

  function handleDeptCardPress(department: string) {
    setTeamOfficeFilter([department]);
    navigation.navigate('Team');
  }

  const now = relevantWeekDate();
  const lunchYear = isoWeekYear(now);
  const lunchWeek = isoWeekNumber(now);

  const { data: lunchMenu, refetch: refetchMenu } = useQuery<LunchWeek>({
    queryKey: ['lunchMenu', lunchYear, lunchWeek],
    queryFn: () => getLunchMenu(lunchYear, lunchWeek),
    staleTime: 10 * 60 * 1000,
  });

  const { data: lunchOrders, refetch: refetchOrders } = useQuery<Record<number, string>>({
    queryKey: ['lunchOrders', currentUser?.id, lunchYear, lunchWeek],
    queryFn: () => getLunchOrders(currentUser!.id, lunchYear, lunchWeek),
    enabled: !!currentUser,
    staleTime: 5 * 60 * 1000,
  });

  const [isLunchRefreshing, setIsLunchRefreshing] = useState(false);

  async function handlePullRefresh() {
    setIsLunchRefreshing(true);
    setCycle(c => c + 1);
    await Promise.all([
      refetch(),
      refetchMenu(),
      refetchOrders(),
      queryClient.invalidateQueries({ queryKey: ['weather'] }),
    ]);
    setIsLunchRefreshing(false);
  }

  const { data, refetch, isRefetching, isLoading, isError, error } = useQuery<OfficeSummary[]>({
    queryKey: ['officeSummaries'],
    queryFn: fetchAllOfficeSummaries,
    staleTime: 30_000,
  });

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(refetch, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  async function handleSignOut() {
    await signOut().catch(() => {});
    setCurrentUser(null);
    setIsAuthenticated(false);
  }

  const isAuthError = isError && (error as any)?.message === 'Not authenticated';

  useEffect(() => {
    if (isAuthError) handleSignOut();
  }, [isAuthError]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#006559" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {isAuthError ? 'Session expired — signing you out…' : 'Could not load office data.'}
        </Text>
        {!isAuthError && (
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={isLunchRefreshing}
          onRefresh={handlePullRefresh}
          tintColor="#006559"
          colors={['#006559']}
        />
      }
    >
      {notifications.length > 0 && (
        <View style={styles.notifList}>
          {notifications.map(n => (
            <NotificationBanner
              key={n.id}
              notification={n}
              onDismiss={() => { removeDeliveredNotification(n.apnsIdentifier); dismissNotification(n.id); decrementBadge(); }}
            />
          ))}
        </View>
      )}
      <View style={styles.headerRow}>
        {!checkinEnabled && (
          <View style={styles.checkinBadge}>
            <Icon name="map-marker-off-outline" size={13} color="#b45309" />
            <Text style={styles.checkinBadgeText}>No location check-ins</Text>
          </View>
        )}
      </View>
      <View style={styles.grid}>
        {(data ?? []).map(summary => (
          <DepartmentCard key={summary.office} summary={summary} cycle={cycle} onPress={() => handleDeptCardPress(summary.office)} />
        ))}
      </View>
      {lunchMenu && (
        <LunchWeekCard
          menu={lunchMenu}
          orders={lunchOrders ?? {}}
          onPress={() => navigation.navigate('Lunch')}
        />
      )}
    </ScrollView>
  );
}

function DepartmentCard({ summary, cycle, onPress }: { summary: OfficeSummary; cycle: number; onPress: () => void }) {
  const total = summary.available + summary.away + summary.busy + summary.offline;
  const label = getDepartmentLabel(summary.office);
  const offices = getDepartmentOffices(summary.office);

  const currentCity = offices.length > 0
    ? offices[cycle % offices.length]
    : '';
  const image = CITY_IMAGES[currentCity];
  const coords = CITY_COORDS[currentCity];

  const { data: weather } = useQuery<WeatherInfo>({
    queryKey: ['weather', currentCity],
    queryFn: () => fetchWeather(coords!.lat, coords!.lon),
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    enabled: !!coords,
  });

  const dots = [
    { color: '#22c55e', count: summary.available },
    { color: '#f97316', count: summary.away },
    { color: '#ef4444', count: summary.busy },
    { color: '#9ca3af', count: summary.offline },
  ];

  const content = (
    <>
      <View style={styles.cityCardTop}>
        <View style={styles.cityCountRow}>
          <Text style={styles.cityCount}>{String(total).padStart(2, '0')}</Text>
          <Icon name="account-group" size={18} color="rgba(255,255,255,0.75)" style={styles.cityCountIcon} />
        </View>
        {weather && (
          <View style={styles.weatherBadge}>
            <Icon name={weather.icon} size={18} color="#fff" />
            <Text style={styles.weatherTemp}>{weather.temp}°</Text>
          </View>
        )}
      </View>
      <View>
        <Text style={styles.cityName} numberOfLines={2}>{label.toUpperCase()}</Text>
        {currentCity ? (
          <Text style={styles.citySubtitle}>{currentCity}{offices.length > 1 ? ` +${offices.length - 1}` : ''}</Text>
        ) : null}
      </View>
      <View>
        <View style={styles.cityDots}>
          {dots.filter(d => d.count > 0).map((d, i) => (
            <View key={i} style={[styles.cityDot, { backgroundColor: d.color }]} />
          ))}
        </View>
        <View style={styles.citySegmentBar}>
          {dots.map((d, i) =>
            d.count > 0 ? (
              <View
                key={i}
                style={[
                  styles.citySegmentFill,
                  { flex: d.count / total, backgroundColor: d.color },
                  i === 0 && styles.segmentFirst,
                  i === dots.length - 1 && styles.segmentLast,
                ]}
              />
            ) : null,
          )}
        </View>
      </View>
    </>
  );

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.cityCard}>
      {image ? (
        <ImageBackground source={image} style={StyleSheet.absoluteFill} imageStyle={styles.cityCardImage}>
          <View style={styles.cityCardOverlay}>{content}</View>
        </ImageBackground>
      ) : (
        <View style={styles.cityCardFallback}>{content}</View>
      )}
    </TouchableOpacity>
  );
}

function LunchWeekCard({
  menu,
  orders,
  onPress,
}: {
  menu: LunchWeek;
  orders: Record<number, string>;
  onPress: () => void;
}) {
  const days = (menu.days ?? []).filter(d => !d.holiday);

  return (
    <TouchableOpacity style={styles.lunchCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.lunchCardHeader}>
        <View style={styles.lunchCardTitleRow}>
          <Icon name="silverware-fork-knife" size={16} color="#006559" />
          <Text style={styles.lunchCardTitle}>This Week's Lunch</Text>
        </View>
        <Text style={styles.lunchCardWeek}>{menu.dateLabel ?? `Week ${menu.id}`}</Text>
      </View>
      <View style={styles.lunchDayRow}>
        {days.map(day => {
          const ordered = orders[day.id];
          const tile = ordered ? getFoodTile(ordered) : null;
          const dateNum = day.date ? new Date(day.date).getUTCDate() : '';
          const shortDay = DAY_SHORT[day.dayOfWeek] ?? day.dayOfWeek.slice(0, 3).toUpperCase();
          return (
            <View key={day.id} style={styles.lunchDayCol}>
              <Text style={styles.lunchDayName}>{shortDay}</Text>
              <Text style={styles.lunchDayDate}>{dateNum}</Text>
              {tile ? (
                <View style={[styles.lunchFoodTile, { backgroundColor: tile.bg }]}>
                  <Icon name={tile.icon} size={18} color={tile.color} />
                </View>
              ) : (
                <View style={styles.lunchEmptyTile} />
              )}
              {ordered && ordered !== 'No thanks' ? (
                <Text style={styles.lunchFoodLabel} numberOfLines={1}>{ordered}</Text>
              ) : (
                <Text style={styles.lunchEmptyLabel}>—</Text>
              )}
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
}

function NotificationBanner({ notification, onDismiss }: { notification: InAppNotification; onDismiss: () => void }) {
  return (
    <View style={styles.notifBanner}>
      <Icon name="bell" size={22} color="#006559" style={styles.notifIcon} />
      <Text style={styles.notifText}>
        {!!notification.title && <Text style={styles.notifTitle}>{notification.title}: </Text>}
        {notification.body}
      </Text>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Icon name="close" size={20} color="#006559" />
      </TouchableOpacity>
    </View>
  );
}

async function fetchAllOfficeSummaries(): Promise<OfficeSummary[]> {
  await loadDepartmentLabels();
  return Promise.race([doFetch(), hardTimeout(12_000)]);
}

function hardTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), ms),
  );
}

async function doFetch(): Promise<OfficeSummary[]> {
  const results = await Promise.allSettled(
    DEPARTMENTS.map(async department => {
      const EXCLUDED = /meeting room|phone booth|admin|migration|service account|bot|test user|noreply|conference room|room\b/i;
      const users = await getUsersByDepartment(department);
      const activeIds = users.filter(u => u.accountEnabled && !EXCLUDED.test(u.displayName)).map(u => u.id);
      const presences = activeIds.length
        ? await getPresenceForUsers(activeIds)
        : [];

      let available = 0, away = 0, busy = 0, offline = 0;
      for (const p of presences) {
        switch (p.availability) {
          case 'Available':
          case 'AvailableIdle':
            available++;
            break;
          case 'Away':
          case 'BeRightBack':
            away++;
            break;
          case 'Busy':
          case 'BusyIdle':
          case 'DoNotDisturb':
            busy++;
            break;
          default:
            offline++;
        }
      }
      const summary: OfficeSummary = { office: department, available, away, busy, offline };
      return summary;
    }),
  );

  const summaries: OfficeSummary[] = [];
  const errors: unknown[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') summaries.push(r.value);
    else errors.push(r.reason);
  }

  // If every office failed, surface the first error so useQuery shows the error state
  if (summaries.length === 0 && errors.length > 0) {
    throw errors[0];
  }

  return summaries;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#C7D3D3' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { fontSize: 15, color: '#555' },
  retryBtn: { backgroundColor: '#006559', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  retryBtnText: { color: '#fff', fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, height: 24 },
  checkinBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#fef3c7', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    marginLeft: 'auto',
  },
  checkinBadgeText: { fontSize: 11, fontWeight: '600', color: '#b45309' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  cityCard: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cityCardImage: { borderRadius: 16 },
  cityCardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    padding: 14,
    justifyContent: 'space-between',
  },
  cityCardFallback: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#475569',
    padding: 14,
    justifyContent: 'space-between',
  },
  cityCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cityCountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  cityCount: { fontSize: 38, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  cityCountIcon: { marginBottom: 6 },
  cityName: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 1.2 },
  citySubtitle: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  weatherBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4,
  },
  weatherTemp: { fontSize: 13, fontWeight: '700', color: '#fff' },
  cityDots: { flexDirection: 'row', gap: 5, marginBottom: 6 },
  cityDot: { width: 8, height: 8, borderRadius: 4 },
  citySegmentBar: { height: 5, flexDirection: 'row', borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.2)' },
  citySegmentFill: {},
  segmentFirst: { borderTopLeftRadius: 3, borderBottomLeftRadius: 3 },
  segmentLast: { borderTopRightRadius: 3, borderBottomRightRadius: 3 },

  // Lunch card
  lunchCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  lunchCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  lunchCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lunchCardTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  lunchCardWeek: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  lunchDayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  lunchDayCol: { flex: 1, alignItems: 'center', gap: 4 },
  lunchDayName: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5 },
  lunchDayDate: { fontSize: 13, fontWeight: '700', color: '#374151' },
  lunchFoodTile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  lunchEmptyTile: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb', borderStyle: 'dashed' },
  lunchFoodLabel: { fontSize: 9, color: '#374151', fontWeight: '600', textAlign: 'center', maxWidth: 52 },
  lunchEmptyLabel: { fontSize: 11, color: '#d1d5db', fontWeight: '500' },

  // Notification banners
  notifList: { gap: 8, marginBottom: 12 },
  notifBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1ede8',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  notifIcon: { marginRight: 12 },
  notifText: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20, marginRight: 10 },
  notifTitle: { fontWeight: '700', color: '#111' },
});
