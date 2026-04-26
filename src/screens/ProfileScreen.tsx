import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  Linking,
  Switch,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getMe, updateUser, getUserPhoto } from '../services/graphService';
import {
  getUserData, registerUserData, updateUserSettings, getUserSettings,
  getWorklogKeywordRules, addWorklogKeywordRule, deleteWorklogKeywordRule,
  type WorklogKeywordRule,
} from '../services/api';
import AdminTokenScreen from './AdminTokenScreen';
import { signOut, signInSecondAccount, signOutSecondAccount, getSecondAccountEmail } from '../services/authService';
import { useAppStore } from '../store/appStore';
import { clearBadge } from '../services/notificationService';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: APP_VERSION } = require('../../package.json') as { version: string };

export default function ProfileScreen() {
  const currentUser        = useAppStore(s => s.currentUser);
  const setCurrentUser     = useAppStore(s => s.setCurrentUser);
  const setIsAuthenticated = useAppStore(s => s.setIsAuthenticated);
  const checkinEnabled     = useAppStore(s => s.checkinEnabled);
  const setCheckinEnabled  = useAppStore(s => s.setCheckinEnabled);
  const userTokens         = useAppStore(s => s.userTokens);
  const notifications      = useAppStore(s => s.notifications);
  const clearAllNotifications = useAppStore(s => s.clearAllNotifications);
  const [adminOpen, setAdminOpen] = useState(false);
  const qc = useQueryClient();

  const { data: photo, isFetching: photoFetching } = useQuery({
    queryKey: ['photo', currentUser?.userPrincipalName],
    queryFn: () => getUserPhoto(currentUser!.userPrincipalName),
    enabled: !!currentUser,
    staleTime: 5 * 60 * 1000,
  });

  const { data: userData, isFetching: userDataFetching } = useQuery({
    queryKey: ['userData', currentUser?.id],
    queryFn: () => getUserData([currentUser!.id]),
    enabled: !!currentUser,
  });

  const [savingCheckin, setSavingCheckin] = useState(false);

  async function handleToggleCheckin(value: boolean) {
    if (!currentUser) return;
    setCheckinEnabled(value);
    setSavingCheckin(true);
    try {
      await updateUserSettings(currentUser.id, { checkinEnabled: value });
    } catch {
      // API not yet available — setting is kept locally until backend is deployed
    } finally {
      setSavingCheckin(false);
    }
  }

  const [editMobileOpen, setEditMobileOpen] = useState(false);
  const [mobile, setMobile] = useState(currentUser?.mobilePhone ?? '');
  const [editSlackOpen, setEditSlackOpen] = useState(false);
  const [slackId, setSlackId] = useState('');
  const [editJiraOpen, setEditJiraOpen] = useState(false);
  const [jiraUsername, setJiraUsername] = useState('');
  const [cal2Email, setCal2Email]       = useState<string | null>(null);
  const [cal2Loading, setCal2Loading]   = useState(false);

  React.useEffect(() => {
    getSecondAccountEmail().then(setCal2Email);
  }, []);
  const [saving, setSaving] = useState(false);

  // ── Keyword rules ────────────────────────────────────────────────────────
  const { data: keywordRules = [], isFetching: rulesFetching } = useQuery<WorklogKeywordRule[]>({
    queryKey: ['keywordRules', currentUser?.id],
    queryFn:  () => getWorklogKeywordRules(currentUser!.id),
    enabled:  !!currentUser,
  });

  const [addRuleOpen, setAddRuleOpen]     = useState(false);
  const [ruleKeyword, setRuleKeyword]     = useState('');
  const [ruleJiraKey, setRuleJiraKey]     = useState('');

  const { mutate: addRule, isPending: addingRule } = useMutation({
    mutationFn: () => addWorklogKeywordRule(currentUser!.id, ruleKeyword.trim(), ruleJiraKey.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keywordRules'] });
      setAddRuleOpen(false);
      setRuleKeyword('');
      setRuleJiraKey('');
    },
    onError: (err: any) => Alert.alert('Error', err?.message ?? 'Could not add rule'),
  });

  const { mutate: deleteRule } = useMutation({
    mutationFn: (ruleId: number) => deleteWorklogKeywordRule(currentUser!.id, ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keywordRules'] }),
    onError: (err: any) => Alert.alert('Error', err?.message ?? 'Could not delete rule'),
  });

  function confirmDeleteRule(rule: WorklogKeywordRule) {
    Alert.alert('Delete rule', `Remove "${rule.keyword}" → ${rule.jiraKey}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRule(rule.id) },
    ]);
  }

  async function handleConnectCal2() {
    setCal2Loading(true);
    try {
      const email = await signInSecondAccount();
      setCal2Email(email);
      qc.invalidateQueries({ queryKey: ['calendar'] });
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Sign-in failed');
    } finally {
      setCal2Loading(false);
    }
  }

  async function handleDisconnectCal2() {
    Alert.alert('Disconnect', 'Remove the second calendar account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive', onPress: async () => {
          await signOutSecondAccount();
          setCal2Email(null);
          qc.invalidateQueries({ queryKey: ['calendar'] });
        },
      },
    ]);
  }

  async function handleSaveJira() {
    if (!currentUser) return;
    setSaving(true);
    try {
      await registerUserData(currentUser.id, { jiraUsername: jiraUsername.trim() || null });
      qc.invalidateQueries({ queryKey: ['userData'] });
      setEditJiraOpen(false);
      Alert.alert('Saved', 'Jira username updated.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSlack() {
    if (!currentUser) return;
    setSaving(true);
    try {
      await registerUserData(currentUser.id, { slackMemberId: slackId.trim() || null });
      qc.invalidateQueries({ queryKey: ['userData'] });
      setEditSlackOpen(false);
      Alert.alert('Saved', 'Slack Member ID updated.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMobile() {
    if (!currentUser) return;
    setSaving(true);
    try {
      await updateUser(currentUser.id, mobile);
      await registerUserData(currentUser.id, { mobile });
      const updated = await getMe();
      setCurrentUser(updated);
      qc.invalidateQueries({ queryKey: ['userData'] });
      setEditMobileOpen(false);
      Alert.alert('Saved', 'Mobile number updated.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          setCurrentUser(null);
          setIsAuthenticated(false);
        },
      },
    ]);
  }

  const profileLoading = photoFetching || userDataFetching || rulesFetching;

  const teamsHandle = currentUser?.userPrincipalName
    ? '@' + currentUser.userPrincipalName.split('@')[0]
    : null;

  const phone = currentUser?.mobilePhone ?? currentUser?.businessPhone ?? null;
  const ud = userData?.[0];

  if (profileLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#006559" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      {/* ── Profile card ── */}
      <View style={styles.profileCard}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitials}>
              {currentUser?.displayName?.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.displayName}>{currentUser?.displayName}</Text>
        {currentUser?.jobTitle && (
          <Text style={styles.jobTitle}>{currentUser.jobTitle}</Text>
        )}
        {currentUser?.officeLocation && (
          <View style={styles.locationBadge}>
            <Text style={styles.locationBadgeText}>{currentUser.officeLocation.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {/* ── Contact card ── */}
      <View style={styles.contactCard}>
        <Text style={styles.contactTitle}>Contact</Text>
        {currentUser?.userPrincipalName && (
          <View style={styles.contactRow}>
            <Icon name="email-outline" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.contactText}>{currentUser.userPrincipalName}</Text>
          </View>
        )}
        {phone && (
          <View style={styles.contactRow}>
            <Icon name="phone-outline" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.contactText}>{phone}</Text>
          </View>
        )}
        {teamsHandle && (
          <View style={styles.contactRow}>
            <Icon name="microsoft-teams" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.contactText}>{teamsHandle}</Text>
          </View>
        )}
      </View>

      {/* ── Account Settings ── */}
      <Text style={styles.sectionHeader}>Account Settings</Text>
      <View style={styles.settingsCard}>
        <TouchableOpacity style={styles.settingsRow} onPress={() => setEditMobileOpen(true)} activeOpacity={0.7}>
          <View style={styles.settingsRowLeft}>
            <View style={styles.settingsIcon}>
              <Icon name="account-outline" size={20} color="#006559" />
            </View>
            <View>
              <Text style={styles.settingsRowTitle}>Personal Information</Text>
              <Text style={styles.settingsRowSub}>Update your mobile number</Text>
            </View>
          </View>
          <Icon name="chevron-right" size={20} color="#9ca3af" />
        </TouchableOpacity>
        <View style={styles.settingsDivider} />
        <TouchableOpacity style={styles.settingsRow} onPress={() => { setSlackId(ud?.slackMemberId ?? ''); setEditSlackOpen(true); }} activeOpacity={0.7}>
          <View style={styles.settingsRowLeft}>
            <View style={styles.settingsIcon}>
              <Icon name="slack" size={20} color="#4A154B" />
            </View>
            <View>
              <Text style={styles.settingsRowTitle}>Slack Member ID</Text>
              <Text style={styles.settingsRowSub}>{ud?.slackMemberId ? ud.slackMemberId : 'Not set'}</Text>
            </View>
          </View>
          <Icon name="chevron-right" size={20} color="#9ca3af" />
        </TouchableOpacity>
        <View style={styles.settingsDivider} />
        <TouchableOpacity style={styles.settingsRow} onPress={() => { setJiraUsername(ud?.jiraUsername ?? ''); setEditJiraOpen(true); }} activeOpacity={0.7}>
          <View style={styles.settingsRowLeft}>
            <View style={styles.settingsIcon}>
              <Icon name="jira" size={20} color="#0052CC" />
            </View>
            <View>
              <Text style={styles.settingsRowTitle}>Jira Username</Text>
              <Text style={styles.settingsRowSub}>{ud?.jiraUsername ? ud.jiraUsername : 'Not set — required for time logging'}</Text>
            </View>
          </View>
          <Icon name="chevron-right" size={20} color="#9ca3af" />
        </TouchableOpacity>
        <View style={styles.settingsDivider} />
        <View style={styles.settingsRow}>
          <View style={styles.settingsRowLeft}>
            <View style={[styles.settingsIcon, { backgroundColor: '#f5f3ff' }]}>
              <Icon name="calendar-account-outline" size={20} color="#7c3aed" />
            </View>
            <View>
              <Text style={styles.settingsRowTitle}>Second Calendar</Text>
              <Text style={styles.settingsRowSub}>{cal2Email ?? 'Not connected'}</Text>
            </View>
          </View>
          {cal2Loading ? (
            <ActivityIndicator size="small" color="#7c3aed" />
          ) : cal2Email ? (
            <TouchableOpacity onPress={handleDisconnectCal2} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600' }}>Disconnect</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleConnectCal2} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 13, color: '#7c3aed', fontWeight: '600' }}>Connect</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.settingsDivider} />
        <View style={styles.settingsRow}>
          <View style={styles.settingsRowLeft}>
            <View style={styles.settingsIcon}>
              <Icon name="map-marker-check-outline" size={20} color="#006559" />
            </View>
            <View>
              <Text style={styles.settingsRowTitle}>Check-in to known locations</Text>
              <Text style={styles.settingsRowSub}>Record your check-ins</Text>
            </View>
          </View>
          {savingCheckin
            ? <ActivityIndicator size="small" color="#006559" />
            : <Switch
                value={checkinEnabled}
                onValueChange={handleToggleCheckin}
                trackColor={{ false: '#d1d5db', true: '#006559' }}
                thumbColor="#fff"
              />
          }
        </View>
      </View>

      {/* ── Member Details ── */}
      <Text style={styles.sectionHeader}>Member Details</Text>
      <View style={styles.memberCard}>
        {[
          { label: 'Department', value: currentUser?.department ?? null },
          { label: 'Role',       value: ud?.role ?? null },
          { label: 'Start Date', value: ud?.startDate ?? null },
          { label: 'Education',  value: ud?.education ?? null },
        ]
          .filter(row => !!row.value)
          .map((row, i, arr) => (
            <React.Fragment key={row.label}>
              <View style={styles.memberRow}>
                <Text style={styles.memberLabel}>{row.label}</Text>
                <Text style={styles.memberValue}>{row.value}</Text>
              </View>
              {i < arr.length - 1 && <View style={styles.memberDivider} />}
            </React.Fragment>
          ))}
      </View>

      {/* ── Keyword Rules ── */}
      <Text style={styles.sectionHeader}>Worklog Keyword Rules</Text>
      <View style={styles.settingsCard}>
        {keywordRules.map((rule, i) => (
          <React.Fragment key={rule.id}>
            {i > 0 && <View style={styles.settingsDivider} />}
            <View style={styles.settingsRow}>
              <View style={styles.settingsRowLeft}>
                <View style={[styles.settingsIcon, { backgroundColor: '#eff6ff' }]}>
                  <Icon name="tag-outline" size={20} color="#2563eb" />
                </View>
                <View>
                  <Text style={styles.settingsRowTitle}>{rule.keyword}</Text>
                  <Text style={[styles.settingsRowSub, { color: '#0052CC', fontWeight: '600' }]}>{rule.jiraKey}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => confirmDeleteRule(rule)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="trash-can-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </React.Fragment>
        ))}
        {keywordRules.length > 0 && <View style={styles.settingsDivider} />}
        <TouchableOpacity style={styles.settingsRow} onPress={() => setAddRuleOpen(true)} activeOpacity={0.7}>
          <View style={styles.settingsRowLeft}>
            <View style={[styles.settingsIcon, { backgroundColor: '#e6f4f1' }]}>
              <Icon name="plus" size={20} color="#006559" />
            </View>
            <Text style={styles.settingsRowTitle}>Add keyword rule</Text>
          </View>
          <Icon name="chevron-right" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      {/* ── Administration (Admin token holders only) ── */}
      {userTokens.includes('Admin') && (
        <>
          <Text style={styles.sectionHeader}>Administration</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingsRow} onPress={() => setAdminOpen(true)} activeOpacity={0.7}>
              <View style={styles.settingsRowLeft}>
                <View style={[styles.settingsIcon, { backgroundColor: '#fef3c7' }]}>
                  <Icon name="shield-account" size={20} color="#b45309" />
                </View>
                <View>
                  <Text style={styles.settingsRowTitle}>Manage User Tokens</Text>
                  <Text style={styles.settingsRowSub}>Grant or revoke access tokens</Text>
                </View>
              </View>
              <Icon name="chevron-right" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Notifications ── */}
      {notifications.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Notifications</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => { clearAllNotifications(); clearBadge(); }}
              activeOpacity={0.7}
            >
              <View style={styles.settingsRowLeft}>
                <View style={[styles.settingsIcon, { backgroundColor: '#fee2e2' }]}>
                  <Icon name="bell-off-outline" size={20} color="#dc2626" />
                </View>
                <View>
                  <Text style={styles.settingsRowTitle}>Clear All Notifications</Text>
                  <Text style={styles.settingsRowSub}>{notifications.length} notification{notifications.length !== 1 ? 's' : ''} pending</Text>
                </View>
              </View>
              <Icon name="chevron-right" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── App Info ── */}
      <Text style={styles.sectionHeader}>App Info</Text>
      <View style={styles.appInfoCard}>
        <View style={styles.appInfoRow}>
          <Text style={styles.appInfoLabel}>VERSION</Text>
          <Text style={styles.appInfoValue}>{APP_VERSION}</Text>
        </View>
      </View>

      {/* ── Actions ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.7}>
        <Icon name="logout" size={18} color="#ef4444" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.helpBtn}
        onPress={() => Linking.openURL('tel:+31370767300')}
        activeOpacity={0.7}
      >
        <Icon name="help-circle-outline" size={18} color="#6b7280" />
        <Text style={styles.helpText}>Help Desk</Text>
      </TouchableOpacity>

      {/* ── Edit Slack Modal ── */}
      <Modal visible={editSlackOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditSlackOpen(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Slack Member ID</Text>
              <TouchableOpacity onPress={handleSaveSlack}>
                {saving
                  ? <ActivityIndicator color="#006559" />
                  : <Text style={styles.modalDone}>Save</Text>}
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.mobileInput}
              value={slackId}
              onChangeText={setSlackId}
              placeholder="e.g. U090LDTS30B"
              autoCapitalize="characters"
              autoFocus
            />
          </View>
        </View>
      </Modal>

      {/* ── Edit Jira Modal ── */}
      <Modal visible={editJiraOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditJiraOpen(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Jira Username</Text>
              <TouchableOpacity onPress={handleSaveJira}>
                {saving
                  ? <ActivityIndicator color="#006559" />
                  : <Text style={styles.modalDone}>Save</Text>}
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.mobileInput}
              value={jiraUsername}
              onChangeText={setJiraUsername}
              placeholder="e.g. bjornh"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
          </View>
        </View>
      </Modal>

      {/* ── Add Keyword Rule Modal ── */}
      <Modal visible={addRuleOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setAddRuleOpen(false); setRuleKeyword(''); setRuleJiraKey(''); }}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Add Keyword Rule</Text>
              <TouchableOpacity
                onPress={() => addRule()}
                disabled={!ruleKeyword.trim() || !ruleJiraKey.trim() || addingRule}
              >
                {addingRule
                  ? <ActivityIndicator color="#006559" />
                  : <Text style={[styles.modalDone, (!ruleKeyword.trim() || !ruleJiraKey.trim()) && { color: '#9ca3af' }]}>Add</Text>}
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.mobileInput}
              value={ruleKeyword}
              onChangeText={setRuleKeyword}
              placeholder="Keyword (e.g. sales)"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <TextInput
              style={[styles.mobileInput, { marginTop: 0 }]}
              value={ruleJiraKey}
              onChangeText={setRuleJiraKey}
              placeholder="Jira ticket (e.g. SALESMKT-248)"
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
        </View>
      </Modal>

      {/* ── Edit Mobile Modal ── */}
      <Modal visible={editMobileOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditMobileOpen(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Mobile Number</Text>
              <TouchableOpacity onPress={handleSaveMobile}>
                {saving
                  ? <ActivityIndicator color="#006559" />
                  : <Text style={styles.modalDone}>Save</Text>}
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.mobileInput}
              value={mobile}
              onChangeText={setMobile}
              placeholder="+354 xxx xxxx"
              keyboardType="phone-pad"
              autoFocus
            />
          </View>
        </View>
      </Modal>

      <AdminTokenScreen visible={adminOpen} onClose={() => setAdminOpen(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#C7D3D3' },
  loadingContainer: { flex: 1, backgroundColor: '#C7D3D3', alignItems: 'center', justifyContent: 'center' },
  scroll:    { padding: 16, paddingBottom: 48 },

  // Profile card
  profileCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 16,
  },
  avatar: { width: 88, height: 88, borderRadius: 14, marginBottom: 14 },
  avatarPlaceholder: { backgroundColor: '#9ca3af', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#fff', fontSize: 30, fontWeight: '700' },
  displayName: { fontSize: 24, fontWeight: '800', color: '#111', marginBottom: 4 },
  jobTitle:    { fontSize: 14, color: '#6b7280', marginBottom: 10 },
  locationBadge: {
    backgroundColor: '#e6f4f1', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  locationBadgeText: { fontSize: 11, fontWeight: '700', color: '#006559', letterSpacing: 0.8 },

  // Contact card
  contactCard: {
    backgroundColor: '#006559', borderRadius: 16, padding: 20, marginBottom: 24,
  },
  contactTitle: { fontSize: 17, fontWeight: '700', color: '#fff', marginBottom: 14 },
  contactRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  contactText:  { fontSize: 14, color: '#fff', flex: 1 },

  // Section header
  sectionHeader: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 12 },

  // Settings card
  settingsCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 24, overflow: 'hidden' },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16,
  },
  settingsRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  settingsIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#e6f4f1', alignItems: 'center', justifyContent: 'center',
  },
  settingsRowTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  settingsRowSub:   { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  settingsDivider:  { height: 1, backgroundColor: '#f3f4f6', marginHorizontal: 16 },

  // Member details card
  memberCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  memberRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14 },
  memberLabel: { width: 100, fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  memberValue: { flex: 1, fontSize: 14, color: '#111', fontWeight: '500' },
  memberDivider: { height: 1, backgroundColor: '#f3f4f6', marginHorizontal: 16 },

  // App info card
  appInfoCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  appInfoRow: { padding: 16, alignItems: 'center' },
  appInfoLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  appInfoValue: { fontSize: 18, fontWeight: '700', color: '#111' },
  appInfoDivider: { height: 1, backgroundColor: '#f3f4f6' },

  // Actions
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
  helpBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  helpText:   { fontSize: 15, color: '#6b7280' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 40 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  modalTitle:  { fontSize: 16, fontWeight: '600', color: '#111' },
  modalCancel: { fontSize: 16, color: '#9ca3af' },
  modalDone:   { fontSize: 16, color: '#006559', fontWeight: '700' },
  mobileInput: {
    margin: 20, borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 10, padding: 14, fontSize: 16,
  },
});
