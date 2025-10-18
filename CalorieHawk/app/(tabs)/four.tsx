/**
 * ===============================================
 * Calorie Hawk - Goal Setup (four.tsx)
 * -----------------------------------------------
 * Allows users to set or schedule calorie goals
 * for specific days or weeks in advance.
 *
 * Integrates:
 *   - Firebase Firestore for goal storage
 *   - Dynamic linking from Dashboard (FAB)
 * ===============================================
 */

import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
} from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../FireBaseConfig';
import dayjs from 'dayjs';
import { router } from 'expo-router';

export default function GoalSetupScreen() {
  const [goal, setGoal] = useState('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));

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
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>📅 Set Calorie Goal</Text>

      <Text style={styles.label}>Target Date</Text>
      <TextInput
        style={styles.input}
        placeholder="YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
      />

      <Text style={styles.label}>Calorie Goal (kcal)</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder="e.g. 2200"
        value={goal}
        onChangeText={setGoal}
      />

      <Pressable style={styles.saveBtn} onPress={saveGoal}>
        <Text style={styles.saveText}>Save Goal</Text>
      </Pressable>

      <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 24, textAlign: 'center' },
  label: { fontSize: 16, marginTop: 14, color: '#444' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    fontSize: 16,
  },
  saveBtn: {
    backgroundColor: '#5B21B6',
    padding: 14,
    borderRadius: 10,
    marginTop: 24,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelBtn: {
    alignItems: 'center',
    marginTop: 16,
  },
  cancelText: { color: '#6B6A75', fontSize: 15 },
});
