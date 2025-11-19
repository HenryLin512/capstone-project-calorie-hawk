/**
 * Calorie Hawk - Main Page (Dashboard)
 * - AI suggestions no longer change the meal bucket
 * - Unknown meals are grouped into "Other"
 * - FlatList keys are guaranteed unique
 */

import React, { useRef, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Modal,
  FlatList,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
  Button,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Donut from '../../components/Donut';
import dayjs from 'dayjs';


// Firebase
import { auth, db, storage } from '../../FireBaseConfig';
import { doc, onSnapshot, serverTimestamp, setDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

// Utils
import { pickUploadAndSaveMeta } from '../../utils/imageUploader';
import { scanFood } from '../../utils/foodRecognition';

// UI helpers
import MacroPebble from '@/components/MacroPebble';
import QuickActionsRow from '@/components/QuickActionsRow';

//Notification
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from '../../utils/pushNotifications';

type Concept = { id?: string; name: string; value?: number };
type ScanResultLocal = { concepts?: Concept[] } | null;

type MealLabel = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks' | 'Other';

type Entry = {
  id: string;
  kcal: number;
  photoUri?: string;
  timestamp: number;
  meal: MealLabel;     // <- meal bucket (fixed set)
  foodName?: string;   // <- AI human label like "Apple" (does NOT change meal)
};

type Meal = {
  label: MealLabel;
  target: number;
  entries: Entry[];
};

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
};

const KCAL_STEP = 50;

const BUILT_INS: MealLabel[] = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Other'];

const initialMeals: Meal[] = [
  { label: 'Breakfast', target: 635, entries: [] },
  { label: 'Lunch',     target: 847, entries: [] },
  { label: 'Dinner',    target: 529, entries: [] },
  { label: 'Snacks',    target: 106, entries: [] },
  { label: 'Other',     target: 300, entries: [] },
];

export default function Dashboard() {
  const [meals, setMeals] = useState<Meal[]>(initialMeals);
  const [dailyGoal, setDailyGoal] = useState<number>(0); // no default
  const [burned] = useState<number>(0);

  const eatenCalories = useMemo(
    () => meals.reduce((sum, m) => sum + m.entries.reduce((a, e) => a + e.kcal, 0), 0),
    [meals]
  );
  const remaining = Math.max(0, dailyGoal > 0 ? dailyGoal - eatenCalories : 0);
  const remainingPct = dailyGoal > 0 ? remaining / dailyGoal : 0;

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [activeMeal, setActiveMeal] = useState<MealLabel>('Breakfast');
  const [entryKcal, setEntryKcal] = useState<string>('500');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);

  // AI state
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [aiResult, setAiResult] = useState<ScanResultLocal>(null);
  const [suggestedFoodName, setSuggestedFoodName] = useState<string | undefined>(undefined);

  // Web input
  const webFileRef = useRef<HTMLInputElement | null>(null);

  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

  /** Goal (if exists) */
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const goalRef = doc(db, 'users', user.uid, 'calorieGoals', todayKey);
    const unsubGoal = onSnapshot(goalRef, (snap) => {
      const data = snap.data();
      setDailyGoal(typeof data?.goal === 'number' && data.goal > 0 ? data.goal : 0);
    });
    return () => unsubGoal();
  }, [todayKey]);

  /** Entries */
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
        // Coerce meal to one of the built-ins; unknowns => Other
        const mealLabel = (BUILT_INS.includes(raw.meal) ? raw.meal : 'Other') as MealLabel;
        const bucket = byMeal.get(mealLabel)!;

        bucket.entries.push({
          id: String(raw.id ?? Math.random().toString(36).slice(2)),
          kcal: Number(raw.kcal || 0),
          photoUri: raw.photoUri || undefined,
          timestamp: Number(raw.timestamp || Date.now()),
          meal: mealLabel,
          foodName: typeof raw.foodName === 'string' ? raw.foodName : undefined,
        });
      }

      setMeals(nextMeals);
    });

    return () => unsub();
  }, [todayKey]);

  /** Add modal */
  const openAdd = (meal?: MealLabel) => {
    setActiveMeal(meal ?? 'Breakfast');
    setEntryKcal('500');
    setPhotoUri(undefined);
    setAiResult(null);
    setSuggestedFoodName(undefined);
    setPct(0);
    setBusy(false);
    setModalVisible(true);
  };

  /** Native upload → Clarifai */
  const handleAddPhotoNative = async () => {
    try {
      setBusy(true);
      setPct(0);
      setAiResult(null);
      setSuggestedFoodName(undefined);

      const url = await pickUploadAndSaveMeta(activeMeal);
      if (!url) return;
      setPhotoUri(url);

      const result = await scanFood({ imageUrl: url });
      setAiResult(result);

      const concepts = result?.concepts ?? [];
      if (!concepts.length) {
        Alert.alert('No suggestion', 'Could not identify food from the photo.');
        return;
      }

      const top = concepts[0];
      setSuggestedFoodName(top.name);        // <- store suggestion, do NOT change meal
      // Optional toast-like info:
      Alert.alert('Food detected', `${top.name} (${Math.round((top.value ?? 0) * 100)}% confidence)`);
    } catch (err) {
      console.error('Native upload+AI error:', err);
      Alert.alert('Error', 'Upload or recognition failed.');
    } finally {
      setBusy(false);
    }
  };

  /** Button: web picker vs native */
  const handleAddPhoto = async () => {
    if (Platform.OS === 'web') {
      setAiResult(null);
      setSuggestedFoodName(undefined);
      setPct(0);
      webFileRef.current?.click();
      return;
    }
    await handleAddPhotoNative();
  };

  /** Web upload → Storage → Clarifai */
  const onWebFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setBusy(true);
      setPct(0);
      setAiResult(null);
      setSuggestedFoodName(undefined);

      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Not logged in', 'Please sign in first.');
        return;
      }

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
      setAiResult(result);

      const concepts = result?.concepts ?? [];
      if (concepts.length) {
        const top = concepts[0];
        setSuggestedFoodName(top.name);      // <- store suggestion, do NOT change meal
        Alert.alert('Food detected', `${top.name} (${Math.round((top.value ?? 0) * 100)}% confidence)`);
      } else {
        Alert.alert('No suggestion', 'Could not identify food from the photo.');
      }
    } catch (err) {
      console.error('Web upload+AI error:', err);
      Alert.alert('Error', 'Upload or recognition failed.');
    } finally {
      setBusy(false);
      if (webFileRef.current) webFileRef.current.value = '';
    }
  };

  /** kcal text + stepper */
  const setKcalFromText = (t: string) => {
    const cleaned = t.replace(/[^\d.]/g, '');
    const normalized = cleaned.split('.').slice(0, 2).join('.');
    setEntryKcal(normalized);
  };
  const adjustKcal = (delta: number) => {
    const current = Number(entryKcal || 0);
    const next = Math.max(0, Math.round(current + delta));
    setEntryKcal(String(next));
  };

  /** Save entry */
  const saveEntry = async () => {
    const kcal = Number(entryKcal || 0);
    if (!kcal) {
      Alert.alert('Missing amount', 'Enter a calorie amount before saving.');
      return;
    }

    const id = Math.random().toString(36).slice(2);
    const newEntry: Entry = {
      id,
      kcal,
      photoUri: photoUri || '',
      timestamp: Date.now(),
      meal: activeMeal,           // <- NEVER replaced by AI
      foodName: suggestedFoodName // <- keep the AI label here
    };

    // Optimistic UI into the chosen bucket only
    setMeals(prev =>
      prev.map(m =>
        m.label === activeMeal ? { ...m, entries: [newEntry, ...m.entries] } : m
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
        <Image source={require('../../assets/images/main_logo.png')} style={styles.logo} />
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Today</Text>
          <Text style={styles.subtle}>{todayStr}</Text>
        </View>
        <Pressable onPress={() => router.push('/two')}>
          <Ionicons name="settings-outline" size={22} color={COLORS.subtext} />
        </Pressable>
      </View>

      {/* Summary card */}
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
            <Pressable
              onPress={() => router.push('/four')}
              style={styles.donutCenter}
              accessibilityRole="button"
            >
              {dailyGoal > 0 ? (
                <>
                  <Text style={styles.remaining}>{remaining.toLocaleString()}</Text>
                  <Text style={styles.remainingLabel}>Remaining</Text>
                  <View style={styles.centerEditPill}>
                    <Ionicons name="add" size={14} color="#fff" />
                    <Text style={styles.centerEditText}>Set / Edit goal</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.centerPlus}>
                    <Text style={styles.centerPlusText}>＋</Text>
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

      {/* Macros */}
      <View style={{ paddingHorizontal: 16, marginTop: -4, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <MacroPebble label="Carbs"   value={0} goal={carbsGoal}   fill="#60A5FA" />
          <MacroPebble label="Protein" value={0} goal={proteinGoal} fill="#22C55E" />
          <MacroPebble label="Fat"     value={0} goal={fatGoal}     fill="#F59E0B" />
        </View>
      </View>

      {/* Meals */}
      <FlatList
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 40 }}
        data={meals}
        keyExtractor={(m, i) => `${m.label}-${i}`}  // <- guard against duplicates
        renderItem={({ item }) => {
          const consumed = item.entries.reduce((a, e) => a + e.kcal, 0);
          const pct = Math.min(1, item.target ? consumed / item.target : 0);

          const onScan = () => {
            openAdd(item.label);
            setTimeout(() => handleAddPhoto(), 0);
          };
          const onSearch = () => Alert.alert('Search', 'Open search here.');
          const onRecent = () => Alert.alert('Recent', 'Open recent items here.');

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
                      {consumed} {item.target ? ` / ${item.target}` : ''} Cal
                    </Text>
                    <QuickActionsRow onScan={onScan} onSearch={onSearch} onRecent={onRecent} />
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
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Pressable onPress={() => setModalVisible(false)}><Text style={styles.sheetCancel}>Cancel</Text></Pressable>
              <Text style={styles.sheetTitle}>{activeMeal}</Text>
              <Pressable onPress={saveEntry}><Text style={styles.sheetSave}>Save</Text></Pressable>
            </View>

            {/* editable kcal + stepper */}
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
                  keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                  returnKeyType="done"
                  maxLength={6}
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

            {/* Photo */}
            <View style={[styles.suggestionsRow, { justifyContent: 'flex-start' }]}>
              <Pressable style={styles.photoBtn} onPress={handleAddPhoto}>
                <Ionicons name="image-outline" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            {busy && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 4 }}>
                <ActivityIndicator /><Text>Uploading… {Math.round(pct * 100)}%</Text>
              </View>
            )}

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

  donutCenter: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  remaining: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  remainingLabel: { fontSize: 12, color: COLORS.subtext },
  centerPlus: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.purple,
    alignItems: 'center', justifyContent: 'center',
  },
  centerPlusText: { color: '#fff', fontSize: 28, lineHeight: 28, marginTop: -2 },
  centerEditPill: {
    marginTop: 8, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: COLORS.purple, borderRadius: 999, flexDirection: 'row',
    alignItems: 'center', gap: 6,
  },
  centerEditText: { color: '#fff', fontSize: 12, fontWeight: '700' },

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
  sheet: { backgroundColor: COLORS.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: Platform.OS === 'ios' ? 22 : 16 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  sheetCancel: { color: COLORS.subtext, fontSize: 16 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  sheetSave: { color: COLORS.purple, fontSize: 16, fontWeight: '700' },

  kcalWrap: { alignItems: 'center', marginTop: 8, marginBottom: 10 },
  kcalInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kcalInput: {
    fontSize: 44, fontWeight: '800', color: COLORS.text, minWidth: 110, textAlign: 'center',
    paddingVertical: 0, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  kcalUnit: { fontSize: 14, color: COLORS.subtext, marginTop: 2 },
  stepperBtn: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepperText: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginTop: -2 },
  suggestionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  photoBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.mutedBg, alignItems: 'center', justifyContent: 'center' },
});
