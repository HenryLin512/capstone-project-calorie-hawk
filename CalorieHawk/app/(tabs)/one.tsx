// app/(tabs)/one.tsx
/**
 * Dashboard (Main)
 * - Add/Subtract + Clear input
 * - KeyboardAvoidingView keeps input visible
 * - Firestore: entries array (no undefined fields) + totals.<meal> increment
 * - Donut center is properly centered
 */

import React, { useRef, useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Image, Pressable, Modal, FlatList, Platform, Alert,
  ActivityIndicator, TextInput, KeyboardAvoidingView, ScrollView, Keyboard, Button,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import dayjs from 'dayjs';

// Firebase
import { auth, db, storage } from '../../FireBaseConfig';
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  arrayUnion,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

// Utils
import { pickUploadAndSaveMeta } from '../../utils/imageUploader';
import { scanFood } from '../../utils/foodRecognition';

// UI helpers
import MacroPebble from '@/components/MacroPebble';
import QuickActionsRow from '@/components/QuickActionsRow';
import Donut from '../../components/Donut';

//Notification
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from '../../utils/pushNotifications';

type Concept = { id?: string; name: string; value?: number };
type ScanResultLocal = { concepts?: Concept[] } | null;

type MealLabel = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks' | 'Other';

type Entry = {
  id: string;
  kcal: number;        // positive for Add, negative for Subtract
  timestamp: number;
  meal: MealLabel;
  photoUri?: string;
  foodName?: string;
};

type Meal = { label: MealLabel; target: number; entries: Entry[] };

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
  border: '#E5E7EB',
};

const BUILT_INS: MealLabel[] = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Other'];

const initialMeals: Meal[] = [
  { label: 'Breakfast', target: 635, entries: [] },
  { label: 'Lunch',     target: 847, entries: [] },
  { label: 'Dinner',    target: 529, entries: [] },
  { label: 'Snacks',    target: 106, entries: [] },
  { label: 'Other',     target: 300, entries: [] },
];

const KCAL_STEP = 50;
const DONUT_SIZE = 168;
const DONUT_STROKE = 12;
const DONUT_INNER = DONUT_SIZE - DONUT_STROKE * 2;

export default function Dashboard() {
  const insets = useSafeAreaInsets();

  const [meals, setMeals] = useState<Meal[]>(initialMeals);
  const [dailyGoal, setDailyGoal] = useState<number>(0);
  const [burned] = useState<number>(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [activeMeal, setActiveMeal] = useState<MealLabel>('Breakfast');

  const [entryKcal, setEntryKcal] = useState<string>('500'); // magnitude-only text
  const [mode, setMode] = useState<'add' | 'sub'>('add');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [suggestedFoodName, setSuggestedFoodName] = useState<string | undefined>(undefined);

  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);

  const webFileRef = useRef<HTMLInputElement | null>(null);
  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

  const eatenCalories = useMemo(
    () => meals.reduce((sum, m) => sum + m.entries.reduce((a, e) => a + e.kcal, 0), 0),
    [meals]
  );
  const remaining = Math.max(0, dailyGoal > 0 ? dailyGoal - eatenCalories : 0);
  const remainingPct = dailyGoal > 0 ? remaining / dailyGoal : 0;

  // Goal listener
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const goalRef = doc(db, 'users', user.uid, 'calorieGoals', todayKey);
    const unsub = onSnapshot(goalRef, (snap) => {
      const data = snap.data();
      setDailyGoal(typeof data?.goal === 'number' && data.goal > 0 ? data.goal : 0);
    });
    return () => unsub();
  }, [todayKey]);

  // Entries listener
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const dayDocRef = doc(db, 'users', user.uid, 'calories', todayKey);
    const unsub = onSnapshot(dayDocRef, (snap) => {
      const data = snap.data() as any | undefined;
      const entries: Entry[] = Array.isArray(data?.entries) ? data.entries : [];

      const nextMeals: Meal[] = initialMeals.map(m => ({ ...m, entries: [] }));
      const byMeal = new Map(nextMeals.map(m => [m.label, m]));

      for (const raw of entries) {
        const mealLabel = (BUILT_INS.includes(raw?.meal) ? raw.meal : 'Other') as MealLabel;
        const bucket = byMeal.get(mealLabel)!;
        const e: Entry = {
          id: String(raw?.id ?? Math.random().toString(36).slice(2)),
          kcal: Number(raw?.kcal || 0),
          timestamp: Number(raw?.timestamp || Date.now()),
          meal: mealLabel,
          ...(raw?.photoUri ? { photoUri: String(raw.photoUri) } : {}),
          ...(typeof raw?.foodName === 'string' ? { foodName: raw.foodName } : {}),
        };
        bucket.entries.push(e);
      }
      setMeals(nextMeals);
    });
    return () => unsub();
  }, [todayKey]);

  const openAdd = (meal?: MealLabel) => {
    setActiveMeal(meal ?? 'Breakfast');
    setEntryKcal('500');
    setMode('add');
    setPhotoUri(undefined);
    setSuggestedFoodName(undefined);
    setBusy(false);
    setPct(0);
    setModalVisible(true);
  };

  const setKcalFromText = (t: string) => {
    // magnitude-only 0..999999
    if (/^\d{0,6}$/.test(t) || t === '') setEntryKcal(t);
  };

  const signedValue = () => {
    const base = Number(entryKcal || 0);
    return (mode === 'sub' ? -1 : 1) * base;
  };

  const adjustKcal = (delta: number) => {
    const next = signedValue() + delta;
    const nextMode: 'add' | 'sub' = next < 0 ? 'sub' : 'add';
    setMode(nextMode);
    setEntryKcal(String(Math.max(0, Math.abs(next))));
  };

  const clearKcal = () => setEntryKcal('');

  const handleAddPhotoNative = async () => {
    try {
      setBusy(true);
      const url = await pickUploadAndSaveMeta(activeMeal);
      if (!url) return;
      setPhotoUri(url);
      const result = await scanFood({ imageUrl: url });
      const top = result?.concepts?.[0];
      if (top) setSuggestedFoodName(top.name);
    } catch (e) {
      console.error('Native upload+AI error:', e);
      Alert.alert('Error', 'Upload or recognition failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddPhoto = async () => {
    if (Platform.OS === 'web') {
      webFileRef.current?.click();
      return;
    }
    await handleAddPhotoNative();
  };

  const onWebFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in');
      const safeName = (file.name || `${Date.now()}.jpg`).replace(/[^\w.\-]/g, '_');
      const storagePath = `images/${user.uid}/${dayjs().format('YYYYMMDD_HHmmss')}_${safeName}`;
      const storageRefObj = ref(storage, storagePath);
      const task = uploadBytesResumable(storageRefObj, file, {
        contentType: file.type || 'image/jpeg',
        customMetadata: { meal: activeMeal, uploadedBy: user.uid },
      });
      const downloadURL: string = await new Promise<string>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => {
            if (snap.totalBytes > 0) setPct(snap.bytesTransferred / snap.totalBytes);
          },
          (err) => reject(err),
          async () => resolve(await getDownloadURL(task.snapshot.ref))
        );
      });
      setPhotoUri(downloadURL);
      const result = await scanFood({ imageUrl: downloadURL });
      const top = result?.concepts?.[0];
      if (top) setSuggestedFoodName(top.name);
    } catch (e) {
      console.error('Web upload+AI error:', e);
      Alert.alert('Error', 'Upload or recognition failed.');
    } finally {
      setBusy(false);
      if (webFileRef.current) webFileRef.current.value = '';
    }
  };

  const saveEntry = async () => {
    const val = signedValue();
    if (!Number.isFinite(val) || val === 0) {
      Alert.alert('Enter an amount', 'Type a number, then choose Add or Subtract.');
      return;
    }

    const id = Math.random().toString(36).slice(2);
    const timestamp = Date.now();

    // Optimistic UI object (can keep undefined locally)
    const optimistic: Entry = {
      id,
      kcal: val,
      timestamp,
      meal: activeMeal,
      ...(photoUri ? { photoUri } : {}),
      ...(suggestedFoodName ? { foodName: suggestedFoodName } : {}),
    };

    // Firestore object: strip undefined
    const entryForDb: any = {
      id,
      kcal: val,
      timestamp,
      meal: activeMeal,
    };
    if (photoUri) entryForDb.photoUri = photoUri;
    if (suggestedFoodName) entryForDb.foodName = suggestedFoodName;

    // Optimistic UI
    setMeals(prev =>
      prev.map(m => (m.label === activeMeal ? { ...m, entries: [optimistic, ...m.entries] } : m))
    );
    setModalVisible(false);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in');

      const dayDocRef = doc(db, 'users', user.uid, 'calories', todayKey);

      // 1) ensure doc + append entry
      await setDoc(
        dayDocRef,
        {
          date: todayKey,
          lastUpdated: serverTimestamp(),
          entries: arrayUnion(entryForDb),
        },
        { merge: true }
      );

      // 2) per-meal running total (so History can show day/meal totals fast)
      await updateDoc(dayDocRef, {
        [`totals.${activeMeal}`]: increment(val),
        lastUpdated: serverTimestamp(),
      });
    } catch (err) {
      console.log('Error saving entry:', err);
      Alert.alert('Save failed', 'Could not save entry to database.');
    }
  };

  const todayStr = dayjs().format('MMMM D, YYYY');

  const carbsGoal   = dailyGoal > 0 ? (dailyGoal * 0.50) / 4 : 0;
  const proteinGoal = dailyGoal > 0 ? (dailyGoal * 0.25) / 4 : 0;
  const fatGoal     = dailyGoal > 0 ? (dailyGoal * 0.25) / 9 : 0;

  

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      {Platform.OS === 'web' && (
        <input
          ref={webFileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onWebFileChange}
        />
      )}


      {/* Header */}
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

      {/* Summary */}
      <View style={styles.card}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{eatenCalories.toLocaleString()}</Text>
            <Text style={styles.summaryLabel}>Eaten</Text>
          </View>

          <Donut
            size={DONUT_SIZE}
            strokeWidth={DONUT_STROKE}
            progress={remainingPct}
            trackColor={COLORS.purpleLight}
            progressColor={COLORS.purple}
          >
            <Pressable
              onPress={() => router.push('/four')}
              style={{ width: DONUT_INNER, height: DONUT_INNER, alignItems: 'center', justifyContent: 'center' }}
            >
              {dailyGoal > 0 ? (
                <>
                  <Text style={styles.remaining}>{remaining.toLocaleString()}</Text>
                  <Text style={styles.remainingLabel}>Remaining</Text>
                </>
              ) : (
                <>
                  <View style={styles.centerPlus}>
                    <Ionicons name="add" size={24} color="#fff" />
                  </View>
                  <Text style={[styles.remainingLabel, { marginTop: 6 }]}>Set goal</Text>
                </>
              )}
            </Pressable>
          </Donut>

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{burned.toLocaleString()}</Text>
            <Text style={styles.summaryLabel}>Burned</Text>
          </View>
        </View>
      </View>

      {/* Macros (placeholder) */}
      <View style={{ paddingHorizontal: 16, marginTop: -4, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <MacroPebble label="Carbs"   value={0} goal={0} fill="#60A5FA" />
          <MacroPebble label="Protein" value={0} goal={0} fill="#22C55E" />
          <MacroPebble label="Fat"     value={0} goal={0} fill="#F59E0B" />
        </View>
      </View>

      {/* Meals */}
      <FlatList
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 40 + insets.bottom }}
        data={meals}
        keyExtractor={(m, i) => `${m.label}-${i}`}
        renderItem={({ item }) => {
          const consumed = item.entries.reduce((a, e) => a + e.kcal, 0);
          const pct = Math.min(1, item.target ? Math.max(consumed, 0) / item.target : 0);

          const onScan = () => {
            openAdd(item.label);
            setTimeout(() => handleAddPhoto(), 0);
          };

          return (
            <View style={styles.mealCard}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <View style={styles.mealLeft}>
                  <Donut size={44} strokeWidth={6} progress={pct} trackColor={COLORS.goldLight} progressColor={COLORS.purple}>
                    <View />
                  </Donut>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.mealTitle}>{item.label}</Text>
                    <Text style={styles.mealSub}>
                      {Math.max(consumed, 0)} {item.target ? ` / ${item.target}` : ''} Cal
                    </Text>
                    <QuickActionsRow
                      onScan={onScan}
                      onSearch={() => Alert.alert('Search', 'Open search here.')}
                      onRecent={() => Alert.alert('Recent', 'Open recent items here.')}
                    />
                  </View>
                </View>
              </View>

              <Pressable style={styles.addBtn} onPress={() => openAdd(item.label)}>
                <Text style={styles.addBtnPlus}>＋</Text>
              </Pressable>
            </View>
          );
        }}
      />

      {/* Add entry modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 120 : 0}
        >
          <View style={[styles.sheet, { paddingBottom: 8 + insets.bottom }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {/* Header */}
              <View style={styles.sheetHeader}>
                <Pressable onPress={() => setModalVisible(false)}><Text style={styles.sheetCancel}>Cancel</Text></Pressable>
                <Text style={styles.sheetTitle}>{activeMeal}</Text>
                <Pressable onPress={saveEntry}><Text style={styles.sheetSave}>Save</Text></Pressable>
              </View>

              {/* Add/Subtract + Clear */}
              <View style={styles.segmentRow}>
                <Pressable onPress={() => setMode('add')} style={[styles.segmentBtn, mode === 'add' && styles.segmentBtnActive]}>
                  <Text style={[styles.segmentText, mode === 'add' && styles.segmentTextActive]}>Add</Text>
                </Pressable>
                <Pressable onPress={() => setMode('sub')} style={[styles.segmentBtn, mode === 'sub' && styles.segmentBtnActive]}>
                  <Text style={[styles.segmentText, mode === 'sub' && styles.segmentTextActive]}>Subtract</Text>
                </Pressable>
                <Pressable onPress={clearKcal} style={styles.clearBtn}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.text} />
                  <Text style={{ marginLeft: 6, color: COLORS.text, fontWeight: '600' }}>Clear</Text>
                </Pressable>
              </View>

              {/* kcal input + +/- steppers */}
              <View style={styles.kcalWrap}>
                <View style={styles.kcalInputRow}>
                  <Pressable onPress={() => adjustKcal(-KCAL_STEP)} style={[styles.stepperBtn, { backgroundColor: COLORS.mutedBg }]}>
                    <Text style={styles.stepperText}>–</Text>
                  </Pressable>

                  <TextInput
                    style={styles.kcalInput}
                    value={entryKcal}
                    onChangeText={setKcalFromText}
                    placeholder="0"
                    inputMode="numeric"
                    keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                    returnKeyType="done"
                    maxLength={6}
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  <Pressable onPress={() => adjustKcal(+KCAL_STEP)} style={[styles.stepperBtn, { backgroundColor: COLORS.mutedBg }]}>
                    <Text style={styles.stepperText}>＋</Text>
                  </Pressable>
                </View>

                <Text style={styles.kcalUnit}>kcal</Text>

                {suggestedFoodName ? (
                  <Text style={{ marginTop: 6, color: COLORS.subtext }}>
                    AI suggestion: <Text style={{ fontWeight: '700', color: COLORS.text }}>{suggestedFoodName}</Text>
                  </Text>
                ) : null}
              </View>

              {/* Photo row */}
              <View style={[styles.suggestionsRow, { justifyContent: 'flex-start' }]}>
                <Pressable style={styles.photoBtn} onPress={handleAddPhoto}>
                  <Ionicons name="image-outline" size={22} color={COLORS.text} />
                </Pressable>
                {busy && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
                    <ActivityIndicator />
                    <Text style={{ marginLeft: 8 }}>{Math.round(pct * 100)}%</Text>
                  </View>
                )}
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={{ width: 48, height: 48, borderRadius: 8, marginLeft: 12 }} />
                ) : null}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },

  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 8, resizeMode: 'contain' },
  h1: { fontSize: 34, fontWeight: '800', color: COLORS.text },
  subtle: { color: COLORS.subtext, marginTop: 2 },

  card: {
    margin: 16, backgroundColor: COLORS.paper, borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryItem: { alignItems: 'center', width: 78 },
  summaryNumber: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  summaryLabel: { fontSize: 12, color: COLORS.subtext },

  remaining: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  remainingLabel: { fontSize: 12, color: COLORS.subtext },
  centerPlus: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.purple, alignItems: 'center', justifyContent: 'center' },

  mealCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.paper, borderRadius: 16, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  mealLeft: { flexDirection: 'row', alignItems: 'center' },
  mealTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  mealSub: { fontSize: 12, color: COLORS.subtext, marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  addBtnPlus: { fontSize: 22, color: COLORS.purple, marginTop: -2 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%' },

  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  sheetCancel: { color: COLORS.subtext, fontSize: 16 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  sheetSave: { color: COLORS.purple, fontSize: 16, fontWeight: '700' },

  segmentRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 6, marginBottom: 6 },
  segmentBtn: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  segmentBtnActive: { backgroundColor: COLORS.mutedBg, borderColor: COLORS.purpleLight },
  segmentText: { color: COLORS.text, fontWeight: '600' },
  segmentTextActive: { color: COLORS.purple, fontWeight: '800' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F3F4F6' },

  kcalWrap: { alignItems: 'center', marginTop: 6, marginBottom: 10, paddingHorizontal: 16 },
  kcalInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kcalInput: {
    fontSize: 44, fontWeight: '800', color: COLORS.text, minWidth: 120, textAlign: 'center',
    paddingVertical: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  kcalUnit: { fontSize: 14, color: COLORS.subtext, marginTop: 6 },

  stepperBtn: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepperText: { fontSize: 28, fontWeight: '700', color: COLORS.text, marginTop: -2 },

  suggestionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  photoBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.mutedBg, alignItems: 'center', justifyContent: 'center' },
});




