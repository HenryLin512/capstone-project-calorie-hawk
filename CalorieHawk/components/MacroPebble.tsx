import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';

export type MacroPebbleProps = {
  /** Display name (e.g., "Carbs", "Protein", "Fat") */
  label: 'Carbs' | 'Protein' | 'Fat' | string;
  /** Current macro amount (grams) */
  value: number;
  /** Target macro amount (grams); 0 means “no target” */
  goal: number;
  /** Progress fill color (e.g., "#22C55E") */
  fill: string;
  /** Optional: show a tiny subtitle under the label (e.g., "g") */
  subtitle?: string;
  /** Optional: compact layout */
  compact?: boolean;
  /** Optional: style overrides */
  style?: ViewStyle;
  labelStyle?: TextStyle;
  valueStyle?: TextStyle;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const MacroPebble: React.FC<MacroPebbleProps> = ({
  label,
  value,
  goal,
  fill,
  subtitle,
  compact,
  style,
  labelStyle,
  valueStyle,
}) => {
  return (
    <View style={[styles.pebble, compact && styles.pebbleCompact, style]}>
      <Text style={[styles.label, labelStyle]}>
        {label}{subtitle ? <Text style={styles.subtitle}> {subtitle}</Text> : null}
      </Text>

      <Text style={[styles.value, valueStyle]}>
        {Math.round(value)} g
      </Text>
    </View>
  );
};

export default MacroPebble;

const styles = StyleSheet.create({
  pebble: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 10,
    marginHorizontal: 4,
  },
  pebbleCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 12,
    color: '#475569',
  },
  subtitle: {
    color: '#94A3B8',
  },
  rail: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    marginTop: 6,
    overflow: 'hidden',
  },
  railCompact: {
    height: 5,
    marginTop: 6,
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  value: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
});
