/**
 * ===============================================
 * Calorie Hawk - Dashboard (Main Tab)
 * -----------------------------------------------
 * Displays daily calorie summary, meals, and entries.
 * 
 * Integrates:
 *  - Firestore (meal entries + daily goals)
 *  - Firebase Storage (image uploads)
 *  - Dynamic calorie goal loading
 * 
 * Controls:
 *  - Yellow ➕ = Add meal entry
 *  - Purple ➕ = Open Goal Setup (four.tsx)
 * ===============================================
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Modal,
  FlatList,
  Platform,
  TextInput,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Donut from '../../components/Donut';
import dayjs from 'dayjs';

// Firebase imports
import { auth, db } from '../../FireBaseConfig';
import { doc, onSnapshot, serverTimestamp, setDoc, arrayUnion } from 'firebase/firestore';

// Utils for photo picking and upload
import { pickUploadAndSaveMeta } from '../../utils/imageUploader';
import { scanFood } from '../../utils/foodRecognition';

/**
 * -------------------------------
 * Type Definitions
 * -------------------------------
 */
type MealLabel = string;

type Entry = {
  id: string;
  kcal: number;
  photoUri?: string;
  timestamp: number;
  meal: MealLabel;
};

type Meal = {
  label: MealLabel;
  target: number;
  entries: Entry[];
};

/**
 * -------------------------------
 * UI Color Palette
 * -------------------------------
 */
const COLORS = {
  bg: '#FFFFFF',
  paper: '#FFFFFF',
  mutedBg: '#F7F4FF',
  text: '#1E1B2E',
  subtext: '#6B6A75',
  purple: '#5B21B6',
  purpleLight: '#EDE7FF',
  gold: '#F7C948',
  goldLight: '#FFF5D6',
  orange: '#FF8A00',
  blueTrack: '#E9EEF3',
};

/**
 * -------------------------------
 * Default Meal Categories
 * -------------------------------
 */
const initialMeals: Meal[] = [
  { label: 'Breakfast', target: 635, entries: [] },
  { label: 'Lunch', target: 847, entries: [] },
  { label: 'Dinner', target: 529, entries: [] },
  { label: 'Snacks', target: 106, entries: [] },
  { label: 'Other', target: 300, entries: [] },
];

/**
 * ======================================================
 * Dashboard Component
 * ======================================================
 */
export default function Dashboard() {
  // -------------------------------
  //  UI & App State
  // -------------------------------
  const [meals, setMeals] = useState<Meal[]>(initialMeals);
  const [dailyGoal, setDailyGoal] = useState<number>(2400);
  const [burned] = useState<number>(0); // future fitness API placeholder

  // Derived totals
  const eatenCalories = useMemo(
    () => meals.reduce((sum, m) => sum + m.entries.reduce((a, e) => a + e.kcal, 0), 0),
    [meals]
  );
  const remaining = Math.max(0, dailyGoal - eatenCalories);
  const remainingPct = dailyGoal === 0 ? 0 : remaining / dailyGoal;

  // Modals and states
  const [modalVisible, setModalVisible] = useState(false);
  const [activeMeal, setActiveMeal] = useState<MealLabel>('Dinner');
  const [entryKcal, setEntryKcal] = useState<string>('500');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [labelModal, setLabelModal] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const chipLabels: MealLabel[] = useMemo(() => {
    const builtIns = ['Breakfast', 'Lunch', 'Snacks', 'Dinner', 'Other'];
    const dynamic = meals.map(m => m.label);
    return Array.from(new Set([...builtIns, ...dynamic]));
  }, [meals]);

  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

  // -------------------------------
  // Firestore Subscriptions
  // -------------------------------

  // 🔹 Fetch today's calorie goal
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const goalRef = doc(db, 'users', user.uid, 'calorieGoals', todayKey);
    const unsubGoal = onSnapshot(goalRef, (snap) => {
      const data = snap.data();
      if (data?.goal) setDailyGoal(data.goal);
    });

    return () => unsubGoal();
  }, [todayKey]);

  // 🔹 Subscribe to meal entries for today
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const dayDocRef = doc(db, 'users', user.uid, 'calories', todayKey);
    const unsub = onSnapshot(dayDocRef, (snap) => {
      const data = snap.data() as any | undefined;
      const entries: Entry[] = Array.isArray(data?.entries) ? data.entries : [];

      const nextMeals: Meal[] = initialMeals.map(m => ({ ...m, entries: [] }));
      const byMeal = new Map(nextMeals.map(m => [m.label.toLowerCase(), m]));

      for (const e of entries) {
        const label = String(e.meal || 'Other');
        const key = label.toLowerCase();
        const bucket = byMeal.get(key);
        const entryData: Entry = {
          id: String(e.id),
          kcal: Number(e.kcal || 0),
          photoUri: e.photoUri || undefined,
          timestamp: Number(e.timestamp || Date.now()),
          meal: label,
        };

        if (bucket) bucket.entries.push(entryData);
        else nextMeals.push({ label, target: 300, entries: [entryData] });
      }

      setMeals(nextMeals);
    });

    return () => unsub();
  }, [todayKey]);

  // -------------------------------
  // UI Actions
  // -------------------------------

  const openAdd = (meal?: MealLabel) => {
    setActiveMeal(meal ?? 'Dinner');
    setEntryKcal('500');
    setPhotoUri(undefined);
    setModalVisible(true);
  };

  const handleAddPhoto = async () => {
    // Upload photo first (this uses the camera once), then ask Clarifai to analyze the uploaded image URL.
    const url = await pickUploadAndSaveMeta(activeMeal);
    if (!url) return;
    setPhotoUri(url);

    const result = await scanFood({ imageUrl: url });
    const concepts = result?.concepts ?? [];
    if (!concepts.length) {
      Alert.alert('No suggestion', 'Could not identify food from the photo.');
      return;
    }

    const top3 = concepts.slice(0, 3);
    const msg = top3.map(c => `${c.name} — ${Math.round((c.value ?? 0) * 100)}%`).join('\n');
    const top = top3[0];
    const CONF_THRESHOLD = 0.45; // only show confident "use" action above this

    if (top.value >= CONF_THRESHOLD) {
      Alert.alert('Food detected', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: `Use "${top.name}"`, onPress: () => {
            setActiveMeal(top.name.charAt(0).toUpperCase() + top.name.slice(1));
          }
        }
      ]);
    } else {
      Alert.alert('Low confidence', `Top guesses:\n${msg}`);
    }
  };

  const saveEntry = async () => {
    const kcal = Number(entryKcal || 0);
    if (!kcal) {
      setModalVisible(false);
      return;
    }

    const id = Math.random().toString(36).slice(2);
    const newEntry: Entry = {
      id,
      kcal,
      photoUri: photoUri || '',
      timestamp: Date.now(),
      meal: activeMeal || 'Unknown',
    };

    setMeals(prev =>
      prev.map(m =>
        m.label.toLowerCase() === (activeMeal || 'Other').toLowerCase()
          ? { ...m, entries: [newEntry, ...m.entries] }
          : m
      )
    );
    setModalVisible(false);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in');

      const dayDocRef = doc(db, 'users', user.uid, 'calories', todayKey);
      await setDoc(
        dayDocRef,
        {
          date: todayKey,
          lastUpdated: serverTimestamp(),
          entries: arrayUnion(newEntry),
        },
        { merge: true }
      );
    } catch (err) {
      console.log('Error saving entry:', err);
      Alert.alert('Save failed', 'Could not save entry to database.');
    }
  };

  const deleteEntry = async (mealLabel: string, entryId: string) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in');

      const dayDocRef = doc(db, 'users', user.uid, 'calories', todayKey);

      const current = meals.find(m => m.label === mealLabel)?.entries ?? [];
      const updated = current.filter(e => e.id !== entryId);

      const updatedMeals = meals.map(m =>
        m.label === mealLabel ? { ...m, entries: updated } : m
      );
      setMeals(updatedMeals);

      await setDoc(
        dayDocRef,
        {
          entries: updatedMeals.flatMap(m => m.entries),
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.log('Delete error:', err);
      Alert.alert('Error', 'Could not delete entry.');
    }
  };

  const todayStr = dayjs().format('MMMM D, YYYY');

  // -------------------------------
  // UI Rendering
  // -------------------------------
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      {/* ---------- HEADER ---------- */}
      <View style={styles.headerRow}>
        <Image
          source={require('../../assets/images/main_logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Today</Text>
          <Text style={styles.subtle}>{todayStr}</Text>
        </View>
        <Pressable onPress={() => router.push('/two')}>
          <Ionicons name="settings-outline" size={22} color={COLORS.subtext} />
        </Pressable>
      </View>

      {/* ---------- SUMMARY CARD ---------- */}
      <View style={styles.card}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{eatenCalories.toLocaleString()}</Text>
            <Text style={styles.summaryLabel}>Eaten</Text>
          </View>

          <Donut
            size={168}
            strokeWidth={12}
            progress={remainingPct}
            trackColor={COLORS.purpleLight}
            progressColor={COLORS.purple}
          >
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.remaining}>{remaining.toLocaleString()}</Text>
              <Text style={styles.remainingLabel}>Remaining</Text>
            </View>
          </Donut>

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{burned.toLocaleString()}</Text>
            <Text style={styles.summaryLabel}>Burned</Text>
          </View>
        </View>
      </View>

      {/* ---------- MEAL LIST ---------- */}
      <FlatList
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 40 }}
        data={meals}
        keyExtractor={(m) => m.label}
        renderItem={({ item }) => {
          const consumed = item.entries.reduce((a, e) => a + e.kcal, 0);
          const pct = Math.min(1, item.target ? consumed / item.target : 0);

          return (
            <View style={styles.mealCard}>
              <View style={styles.mealLeft}>
                <Donut
                  size={44}
                  strokeWidth={6}
                  progress={pct}
                  trackColor={COLORS.goldLight}
                  progressColor={COLORS.purple}
                >
                  <View />
                </Donut>
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.mealTitle}>{item.label}</Text>
                  <Text style={styles.mealSub}>
                    {consumed} {item.target ? ` / ${item.target}` : ''} Cal
                  </Text>
                </View>
              </View>

              <Pressable style={styles.addBtn} onPress={() => openAdd(item.label)}>
                <Text style={styles.addBtnPlus}>＋</Text>
              </Pressable>
            </View>
          );
        }}
      />

      {/* ---------- PURPLE FAB (Set Goal) ---------- */}
      <Pressable style={styles.fab} onPress={() => router.push('/four')}>
        <Text style={styles.fabPlus}>＋</Text>
      </Pressable>

      {/* ---------- ADD ENTRY MODAL ---------- */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Pressable onPress={() => setModalVisible(false)}>
                <Text style={styles.sheetCancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.sheetTitle}>{activeMeal}</Text>
              <Pressable onPress={saveEntry}>
                <Text style={styles.sheetSave}>Save</Text>
              </Pressable>
            </View>

            {/* Quick Calorie Input */}
            <View style={styles.kcalWrap}>
              <Text style={styles.kcalText}>{entryKcal || 0}</Text>
              <Text style={styles.kcalUnit}>kcal</Text>
            </View>

            <View style={styles.suggestionsRow}>
              {[300, 500, 700].map(v => (
                <Pressable key={v} style={styles.suggestion} onPress={() => setEntryKcal(String(v))}>
                  <Text style={styles.suggestionText}>{v}</Text>
                  <Text style={styles.suggestionUnit}>kcal</Text>
                </Pressable>
              ))}
              <Pressable style={styles.photoBtn} onPress={handleAddPhoto}>
                <Ionicons name="image-outline" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            {photoUri ? (
              <View style={{ marginTop: 12, alignItems: 'center' }}>
                <Image source={{ uri: photoUri }} style={{ width: 120, height: 120, borderRadius: 10 }} />
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * ===============================================
 * Styles
 * ===============================================
 */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 12,
  },
  logo: { width: 34, height: 34, borderRadius: 6 },
  h1: { fontSize: 30, fontWeight: '800', color: COLORS.text },
  subtle: { color: COLORS.subtext, marginTop: 2 },
  card: {
    margin: 16,
    backgroundColor: COLORS.paper,
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryItem: { alignItems: 'center', width: 78 },
  summaryNumber: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  summaryLabel: { fontSize: 12, color: COLORS.subtext, marginTop: 2 },
  remaining: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  remainingLabel: { fontSize: 12, color: COLORS.subtext },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.paper,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  mealLeft: { flexDirection: 'row', alignItems: 'center' },
  mealTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  mealSub: { fontSize: 12, color: COLORS.subtext, marginTop: 2 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnPlus: { fontSize: 22, color: COLORS.purple, marginTop: -2 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.purple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  fabPlus: { color: '#fff', fontSize: 32, marginTop: -4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: Platform.OS === 'ios' ? 22 : 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sheetCancel: { color: COLORS.subtext, fontSize: 16 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  sheetSave: { color: COLORS.purple, fontSize: 16, fontWeight: '700' },
  kcalWrap: { alignItems: 'center', marginTop: 8, marginBottom: 10 },
  kcalText: { fontSize: 44, fontWeight: '800', color: COLORS.text },
  kcalUnit: { fontSize: 14, color: COLORS.subtext },
  suggestionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  suggestion: {
    backgroundColor: COLORS.goldLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  suggestionText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  suggestionUnit: { fontSize: 11, color: COLORS.subtext },
  photoBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.mutedBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
