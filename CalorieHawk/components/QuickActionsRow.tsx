// components/QuickActionsRow.tsx

import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

type QuickActionsRowProps = {
  onScan?: () => void;
  onSearch?: () => void;
  onRecent?: () => void;
};

export default function QuickActionsRow({
  onScan,
  onSearch,
  onRecent,
}: QuickActionsRowProps) {
  const hasScan = typeof onScan === 'function';
  const hasSearch = typeof onSearch === 'function';
  const hasRecent = typeof onRecent === 'function';

  // If somehow nothing is passed, render nothing to avoid a weird empty bar
  if (!hasScan && !hasSearch && !hasRecent) {
    return null;
  }

  return (
    <View style={styles.row}>
      {hasScan && (
        <Pressable style={styles.actionBtn} onPress={onScan}>
          <Ionicons name="scan-outline" size={18} color="#111827" />
          <Text style={styles.actionText}>Scan</Text>
        </Pressable>
      )}

      {hasSearch && (
        <Pressable style={styles.actionBtn} onPress={onSearch}>
          <Ionicons name="search-outline" size={18} color="#111827" />
          <Text style={styles.actionText}>Search</Text>
        </Pressable>
      )}

      {hasRecent && (
        <Pressable style={styles.actionBtn} onPress={onRecent}>
          <Ionicons name="time-outline" size={18} color="#111827" />
          <Text style={styles.actionText}>Recent</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  actionText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
});

