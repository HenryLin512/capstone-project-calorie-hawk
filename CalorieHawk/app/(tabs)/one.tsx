/**
 * ===============================================
 * Calorie Hawk - Dashboard (Main Tab)
 * ===============================================
 */

import React, { useRef, useMemo, useState, useEffect } from 'react';
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
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
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

// New components
import MacroPebble from '@/components/MacroPebble';
import QuickActionsRow from '@/components/QuickActionsRow';

/** Local types */
type Concept = { id?: string; name: string; value?: number };
type ScanResultLocal = { concepts?: Concept[] } | null;

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

// Step size for +/- buttons
const KCAL_STEP = 50;

const initialMeals: Meal[] = [
  { label: 'Breakfast', target: 635, entries: [] },
  { label: 'Lunch', target: 847, entries: [] },
  { label: 'Dinner', target: 529, entries: [] },
  { label: 'Snacks', target: 106, entries: [] },
  { label: 'Other', target: 300, entries: [] },
];

export default function Dashboard() {
  // Totals and day state
  const [meals, setMeals] = useState<Meal[]>(initialMeals);

  // 👉 No default 2400 anymore; start at 0 and only load from Firestore if present
  const [dailyGoal, setDailyGoal] = useState<number>(0);

  const [burned] = useState<number>(0);

  const eatenCalories = useMemo(
    () => meals.reduce((sum, m) => sum + m.entries.reduce((a, e) => a + e.kcal, 0), 0),
    [meals]
  );
  const remaining = Math.max(0, dailyGoal > 0 ? dailyGoal - eatenCalories : 0);
  const remainingPct = dailyGoal > 0 ? remaining / dailyGoal : 0;

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [activeMeal, setActiveMeal] = useState<MealLabel>('Dinner');
  const [entryKcal, setEntryKcal] = useState<string>('500');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);

  // Upload / AI state
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [aiResult, setAiResult] = useState<ScanResultLocal>(null);

  // Web file input
  const webFileRef = useRef<HTMLInputElement | null>(null);

  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

  /** Load goal (if exists) */
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const goalRef = doc(db, 'users', user.uid, 'calorieGoals', todayKey);
    const unsubGoal = onSnapshot(goalRef, (snap) => {
      const data = snap.data();
      // Only set if a goal exists; otherwise leave 0 so UI shows "Set goal"
      if (typeof data?.goal === 'number' && data.goal > 0) {
        setDailyGoal(data.goal);
      } else {
        setDailyGoal(0);
      }
    });

    return () => unsubGoal();
  }, [todayKey]);

  /** Load entries for the day */
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

  /** Open Add modal */
  const openAdd = (meal?: MealLabel) => {
    setActiveMeal(meal ?? 'Dinner');
    setEntryKcal('500');
    setPhotoUri(undefined);
    setAiResult(null);
    setPct(0);
    setBusy(false);
    setModalVisible(true);
  };

  /** Native flow: pick → upload (util returns string URL) → Clarifai(URL) */
  const handleAddPhotoNative = async () => {
    try {
      setBusy(true);
      setPct(0);
      setAiResult(null);

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

      const top3 = concepts.slice(0, 3);
      const msg = top3.map((c: Concept) => `${c.name} — ${Math.round((c.value ?? 0) * 100)}%`).join('\n');
      const top = top3[0];
      const CONF_THRESHOLD = 0.45;

      if ((top.value ?? 0) >= CONF_THRESHOLD) {
        Alert.alert('Food detected', msg, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Use "${top.name}"`,
            onPress: () => setActiveMeal(top.name.charAt(0).toUpperCase() + top.name.slice(1)),
          },
        ]);
      } else {
        Alert.alert('Low confidence', `Top guesses:\n${msg}`);
      }
    } catch (err) {
      console.error('Native upload+AI error:', err);
      Alert.alert('Error', 'Upload or recognition failed.');
    } finally {
      setBusy(false);
    }
  };

  /** Button handler: web opens file input; native runs native flow */
  const handleAddPhoto = async () => {
    if (Platform.OS === 'web') {
      setAiResult(null);
      setPct(0);
      webFileRef.current?.click();
      return;
    }
    await handleAddPhotoNative();
  };

  /** Web: file → Storage (with progress) → Clarifai(URL) */
  const onWebFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setBusy(true);
      setPct(0);
      setAiResult(null);

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
        customMetadata: { meal: activeMeal || 'Unknown', uploadedBy: user.uid },
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
      if (!concepts.length) {
        Alert.alert('No suggestion', 'Could not identify food from the photo.');
        return;
      }

      const top3 = concepts.slice(0, 3);
      const msg = top3.map((c: Concept) => `${c.name} — ${Math.round((c.value ?? 0) * 100)}%`).join('\n');
      const top = top3[0];
      const CONF_THRESHOLD = 0.45;

      if ((top.value ?? 0) >= CONF_THRESHOLD) {
        Alert.alert('Food detected', msg, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Use "${top.name}"`,
            onPress: () => setActiveMeal(top.name.charAt(0).toUpperCase() + top.name.slice(1)),
          },
        ]);
      } else {
        Alert.alert('Low confidence', `Top guesses:\n${msg}`);
      }
    } catch (err) {
      console.error('Web upload+AI error:', err);
      Alert.alert('Error', 'Upload or recognition failed.');
    } finally {
      setBusy(false);
      if (webFileRef.current) webFileRef.current.value = '';
    }
  };

  /** Stepper handlers */
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

  /** Save entry to Firestore */
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
      meal: activeMeal || 'Unknown',
    };

    // Optimistic UI
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

  const todayStr = dayjs().format('MMMM D, YYYY');

  // Macro goals (0 if no goal set yet)
  const carbsGoal   = dailyGoal > 0 ? (dailyGoal * 0.50) / 4 : 0;
  const proteinGoal = dailyGoal > 0 ? (dailyGoal * 0.25) / 4 : 0;
  const fatGoal     = dailyGoal > 0 ? (dailyGoal * 0.25) / 9 : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      {/* Hidden web file input */}
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

          {/* Donut with center action */}
          <Donut
            size={168}
            strokeWidth={12}
            progress={remainingPct}
            trackColor={COLORS.purpleLight}
            progressColor={COLORS.purple}
          >
            {/* Center content becomes a button to set/edit goal */}
            <Pressable
              onPress={() => router.push('/four')}
              style={styles.donutCenter}
              accessibilityRole="button"
              accessibilityLabel={dailyGoal > 0 ? 'Edit goal' : 'Set goal'}
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

      {/* MACRO PEBBLES */}
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
        keyExtractor={(m) => m.label}
        renderItem={({ item }) => {
          const consumed = item.entries.reduce((a, e) => a + e.kcal, 0);
          const pct = Math.min(1, item.target ? consumed / item.target : 0);

          const onScan = () => {
            openAdd(item.label);
            setTimeout(() => handleAddPhoto(), 0);
          };
          const onSearch = () => {
            Alert.alert('Search', 'Open a search sheet or screen here.');
          };
          const onRecent = () => {
            Alert.alert('Recent', 'Show a recent-items sheet here.');
          };

          return (
            <View style={styles.mealCard}>
              <View style={{ flex: 1, paddingRight: 12 }}>
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
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.mealTitle}>{item.label}</Text>
                    <Text style={styles.mealSub}>
                      {consumed} {item.target ? ` / ${item.target}` : ''} Cal
                    </Text>

                    {/* Quick actions under the title */}
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

      {/* 🔻 Removed the floating FAB — now the plus is inside the donut */}
      {/* <Pressable style={styles.fab} onPress={() => router.push('/four')}>
        <Text style={styles.fabPlus}>＋</Text>
      </Pressable> */}

      {/* Modal */}
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

            {/* Editable kcal input + stepper */}
            <View style={styles.kcalWrap}>
              <View style={styles.kcalInputRow}>
                <Pressable
                  onPress={() => adjustKcal(-KCAL_STEP)}
                  style={[styles.stepperBtn, { backgroundColor: COLORS.mutedBg }]}
                >
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

                <Pressable
                  onPress={() => adjustKcal(+KCAL_STEP)}
                  style={[styles.stepperBtn, { backgroundColor: COLORS.mutedBg }]}
                >
                  <Text style={styles.stepperText}>＋</Text>
                </Pressable>
              </View>
              <Text style={styles.kcalUnit}>kcal</Text>
              <Text style={styles.stepperHint}>Step: {KCAL_STEP}</Text>
            </View>

            {/* Photo button */}
            <View style={[styles.suggestionsRow, { justifyContent: 'flex-start' }]}>
              <Pressable style={styles.photoBtn} onPress={handleAddPhoto}>
                <Ionicons name="image-outline" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            {/* Progress */}
            {busy && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 4 }}>
                <ActivityIndicator />
                <Text>Uploading… {Math.round(pct * 100)}%</Text>
              </View>
            )}

            {/* Preview */}
            {photoUri ? (
              <View style={{ marginTop: 12, alignItems: 'center' }}>
                <Image source={{ uri: photoUri }} style={{ width: 120, height: 120, borderRadius: 10 }} />
              </View>
            ) : null}

            {/* AI Concepts */}
            {!busy && aiResult?.concepts?.length ? (
              <View style={{ marginTop: 12, paddingHorizontal: 16 }}>
                <Text style={{ fontWeight: '700', color: COLORS.text, marginBottom: 6 }}>Top concepts</Text>
                <Text selectable style={{ color: COLORS.subtext }}>
                  {aiResult.concepts.slice(0, 5).map((c: Concept) =>
                    `${c.name} — ${Math.round((c.value ?? 0) * 100)}%`
                  ).join('\n')}
                </Text>
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

  // ---- Donut center button styles ----
  donutCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  remaining: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  remainingLabel: { fontSize: 12, color: COLORS.subtext },

  centerPlus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlusText: { color: '#fff', fontSize: 28, lineHeight: 28, marginTop: -2 },

  centerEditPill: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.purple,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  centerEditText: { color: '#fff', fontSize: 12, fontWeight: '700' },

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

  // (Removed FAB styles are left here in case you revert later)
  // fab: {
  //   position: 'absolute',
  //   right: 20,
  //   bottom: 24,
  //   width: 60,
  //   height: 60,
  //   borderRadius: 30,
  //   backgroundColor: COLORS.purple,
  //   alignItems: 'center',
  //   justifyContent: 'center',
  //   shadowColor: '#000',
  //   shadowOpacity: 0.18,
  //   shadowRadius: 10,
  //   shadowOffset: { width: 0, height: 6 },
  //   elevation: 4,
  // },
  // fabPlus: { color: '#fff', fontSize: 32, marginTop: -4 },

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
  kcalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kcalInput: {
    fontSize: 44,
    fontWeight: '800',
    color: COLORS.text,
    minWidth: 110,
    textAlign: 'center',
    paddingVertical: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  kcalUnit: { fontSize: 14, color: COLORS.subtext, marginTop: 2 },
  stepperBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginTop: -2 },
  stepperHint: { fontSize: 11, color: COLORS.subtext, marginTop: 4 },
  suggestionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  photoBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.mutedBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
