// app/(tabs)/four.tsx
/**
 * Calorie Hawk - Goal Setup
 * - Keyboard-safe (KeyboardAvoidingView + safe-area insets)
 * - Scrollable content so fields never get covered
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../FireBaseConfig';
import dayjs from 'dayjs';
import { router } from 'expo-router';
import { useTheme } from '../../utils/ThemeContext'; // 👈 añadido para dark mode

export default function GoalSetupScreen() {
  const [goal, setGoal] = useState('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const insets = useSafeAreaInsets();
  const { theme, mode } = useTheme(); // 👈 obtiene colores globales

  const saveGoal = async () => {
    const kcal = Number(goal);
    if (!kcal || kcal < 100) {
      Alert.alert('Invalid Input', 'Please enter a valid calorie number.');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      Alert.alert('Not Logged In', 'Please sign in to save your goal.');
      return;
    }

    try {
      const ref = doc(db, 'users', user.uid, 'calorieGoals', date);
      await setDoc(ref, {
        goal: kcal,
        date,
        type: 'daily',
        createdAt: serverTimestamp(),
      });

      Alert.alert('Goal Saved ✅', `Your goal for ${date} is set to ${kcal} kcal.`);
      router.back();
    } catch (err) {
      console.error('Error saving goal:', err);
      Alert.alert('Save Failed', 'Could not save goal to database.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 16}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: (Platform.OS === 'ios' ? insets.bottom : 16) + 24 },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>📅 Set Calorie Goal</Text>

          <Text style={[styles.label, { color: theme.text }]}>Target Date</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: mode === 'dark' ? theme.card : '#fff',
                color: theme.text,
                borderColor: mode === 'dark' ? '#555' : '#ccc',
              },
            ]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={mode === 'dark' ? '#aaa' : '#666'}
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={[styles.label, { color: theme.text }]}>Calorie Goal (kcal)</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: mode === 'dark' ? theme.card : '#fff',
                color: theme.text,
                borderColor: mode === 'dark' ? '#555' : '#ccc',
              },
            ]}
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            placeholder="e.g. 2200"
            placeholderTextColor={mode === 'dark' ? '#aaa' : '#666'}
            value={goal}
            onChangeText={setGoal}
            returnKeyType="done"
            blurOnSubmit
          />

          <Pressable
            style={[styles.saveBtn, { backgroundColor: theme.button }]}
            onPress={saveGoal}
          >
            <Text style={styles.saveText}>Save Goal</Text>
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
            <Text
              style={[
                styles.cancelText,
                { color: mode === 'dark' ? '#aaa' : '#6B6A75' },
              ]}
            >
              Cancel
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 24, paddingTop: 12 },
  title: { fontSize: 28, fontWeight: '800', marginVertical: 16, textAlign: 'center' },
  label: { fontSize: 16, marginTop: 14, color: '#444' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  saveBtn: {
    backgroundColor: '#5B21B6',
    padding: 14,
    borderRadius: 10,
    marginTop: 24,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelBtn: { alignItems: 'center', marginTop: 16 },
  cancelText: { color: '#6B6A75', fontSize: 15 },
});
