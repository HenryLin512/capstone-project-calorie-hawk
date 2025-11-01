import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';

export type QuickActionsRowProps = {
  onScan: () => void;
  onSearch: () => void;
  onRecent: () => void;
  /** Disable all actions (e.g., while uploading) */
  disabled?: boolean;
  /** Smaller paddings */
  compact?: boolean;
  /** Optional: container style overrides */
  style?: ViewStyle;
};

const QuickActionsRow: React.FC<QuickActionsRowProps> = ({
  onScan,
  onSearch,
  onRecent,
  disabled,
  compact,
  style,
}) => {
  return (
    <View style={[styles.wrap, style]}>
      <ActionChip
        label="📷 Scan"
        onPress={onScan}
        disabled={disabled}
        compact={compact}
        testID="qa-scan"
      />
      <ActionChip
        label="🔍 Search"
        onPress={onSearch}
        disabled={disabled}
        compact={compact}
        testID="qa-search"
      />
      <ActionChip
        label="⏱ Recent"
        onPress={onRecent}
        disabled={disabled}
        compact={compact}
        testID="qa-recent"
      />
    </View>
  );
};

export default QuickActionsRow;

function ActionChip({
  label,
  onPress,
  disabled,
  compact,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.chipCompact,
        disabled && styles.chipDisabled,
        pressed && !disabled && styles.chipPressed,
      ]}
      testID={testID}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
  },
  chipCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontWeight: '600',
    color: '#0F172A',
  },
});
