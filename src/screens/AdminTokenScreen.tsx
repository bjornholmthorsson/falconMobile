import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { searchGraphUsers } from '../services/graphService';
import { getUserTokens, grantUserToken, revokeUserToken } from '../services/api';
import type { UserToken } from '../services/api';
import type { User } from '../models';
import { useAppStore } from '../store/appStore';

const AVAILABLE_TOKENS = ['Admin', 'AddAnnouncement', 'LunchOrders', 'KnownLocationAdmin'];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AdminTokenScreen({ visible, onClose }: Props) {
  const currentUser = useAppStore(s => s.currentUser);
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced user search
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchGraphUsers(search.trim())
        .then(users => setResults(users.filter(u => u.accountEnabled)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  function handleSelectUser(user: User) {
    setSelectedUser(user);
    setSearch('');
    setResults([]);
  }

  function handleClose() {
    setSelectedUser(null);
    setSearch('');
    setResults([]);
    onClose();
  }

  // Fetch tokens for selected user
  const { data: tokens = [], isFetching: tokensFetching } = useQuery<UserToken[]>({
    queryKey: ['adminUserTokens', selectedUser?.id],
    queryFn: () => getUserTokens(selectedUser!.id),
    enabled: !!selectedUser,
  });

  const tokenNames = tokens.map(t => t.tokenName);
  const grantable = AVAILABLE_TOKENS.filter(t => !tokenNames.includes(t));

  const { mutate: grant, isPending: granting } = useMutation({
    mutationFn: (tokenName: string) =>
      grantUserToken(selectedUser!.id, tokenName, currentUser?.displayName ?? ''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminUserTokens', selectedUser?.id] }),
    onError: (err: any) => Alert.alert('Error', err?.message ?? 'Failed to grant token'),
  });

  const { mutate: revoke } = useMutation({
    mutationFn: (tokenId: number) => revokeUserToken(selectedUser!.id, tokenId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminUserTokens', selectedUser?.id] }),
    onError: (err: any) => Alert.alert('Error', err?.message ?? 'Failed to revoke token'),
  });

  function confirmRevoke(token: UserToken) {
    Alert.alert('Revoke token', `Remove "${token.tokenName}" from ${selectedUser?.displayName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => revoke(token.id) },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Icon name="arrow-left" size={24} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Tokens</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
          {/* User search */}
          <Text style={styles.label}>Search user</Text>
          <View style={styles.searchBox}>
            <Icon name="magnify" size={20} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Type a name..."
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searching && <ActivityIndicator size="small" color="#006559" />}
          </View>

          {/* Search results */}
          {results.length > 0 && (
            <View style={styles.resultsList}>
              {results.map(user => (
                <TouchableOpacity
                  key={user.id}
                  style={styles.resultRow}
                  onPress={() => handleSelectUser(user)}
                >
                  <View style={styles.resultAvatar}>
                    <Text style={styles.resultInitials}>
                      {user.displayName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultName}>{user.displayName}</Text>
                    <Text style={styles.resultEmail}>{user.userPrincipalName}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Selected user */}
          {selectedUser && (
            <View style={styles.selectedCard}>
              <View style={styles.selectedHeader}>
                <View style={styles.selectedAvatar}>
                  <Text style={styles.selectedInitials}>
                    {selectedUser.displayName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedName}>{selectedUser.displayName}</Text>
                  <Text style={styles.selectedEmail}>{selectedUser.userPrincipalName}</Text>
                  {selectedUser.officeLocation && (
                    <Text style={styles.selectedOffice}>{selectedUser.officeLocation}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setSelectedUser(null)}>
                  <Icon name="close" size={20} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              {/* Current tokens */}
              <Text style={styles.subLabel}>Current tokens</Text>
              {tokensFetching ? (
                <ActivityIndicator color="#006559" style={{ marginVertical: 12 }} />
              ) : tokens.length === 0 ? (
                <Text style={styles.emptyText}>No tokens assigned</Text>
              ) : (
                tokens.map(token => (
                  <View key={token.id} style={styles.tokenRow}>
                    <View style={styles.tokenBadge}>
                      <Icon name="key-variant" size={16} color="#006559" />
                      <Text style={styles.tokenName}>{token.tokenName}</Text>
                    </View>
                    <Text style={styles.tokenGranted}>by {token.grantedBy || 'system'}</Text>
                    <TouchableOpacity onPress={() => confirmRevoke(token)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Icon name="trash-can-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {/* Grant new token */}
              {grantable.length > 0 && (
                <>
                  <Text style={[styles.subLabel, { marginTop: 16 }]}>Grant token</Text>
                  <View style={styles.grantRow}>
                    {grantable.map(tokenName => (
                      <TouchableOpacity
                        key={tokenName}
                        style={styles.grantChip}
                        onPress={() => grant(tokenName)}
                        disabled={granting}
                      >
                        <Icon name="plus" size={16} color="#006559" />
                        <Text style={styles.grantChipText}>{tokenName}</Text>
                      </TouchableOpacity>
                    ))}
                    {granting && <ActivityIndicator size="small" color="#006559" />}
                  </View>
                </>
              )}
            </View>
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
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40 },

  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111', padding: 0 },

  resultsList: {
    backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden', marginBottom: 16,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  resultAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#9ca3af',
    alignItems: 'center', justifyContent: 'center',
  },
  resultInitials: { color: '#fff', fontSize: 13, fontWeight: '700' },
  resultName: { fontSize: 14, fontWeight: '600', color: '#111' },
  resultEmail: { fontSize: 12, color: '#9ca3af' },

  selectedCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 8,
  },
  selectedHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16,
  },
  selectedAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#006559',
    alignItems: 'center', justifyContent: 'center',
  },
  selectedInitials: { color: '#fff', fontSize: 17, fontWeight: '700' },
  selectedName: { fontSize: 16, fontWeight: '700', color: '#111' },
  selectedEmail: { fontSize: 12, color: '#9ca3af' },
  selectedOffice: { fontSize: 12, color: '#006559', fontWeight: '600', marginTop: 2 },

  subLabel: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyText: { fontSize: 14, color: '#9ca3af', marginBottom: 8 },

  tokenRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  tokenBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  tokenName: { fontSize: 15, fontWeight: '600', color: '#111' },
  tokenGranted: { fontSize: 12, color: '#9ca3af', marginRight: 8 },

  grantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grantChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: '#006559', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  grantChipText: { fontSize: 14, fontWeight: '600', color: '#006559' },
});
