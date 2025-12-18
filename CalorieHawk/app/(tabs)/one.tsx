// app/(tabs)/one.tsx
/**
 * Dashboard (Main)
 * - Add/Subtract + Clear input
 * - KeyboardAvoidingView keeps input visible
 * - Firestore: entries array (no undefined fields) + totals.<meal> increment
 * - Donut center is properly centered
 * - Macro estimate via utils/macros (FastAPI) — optional and persisted
 * - Per-meal macro display with compact bars + (est.) preview
 * - Inline grams prompt before estimating macros
 * - Auto-fill kcal from estimated macros (but allow manual override)
 * - Daily macro pebbles reflect summed macros from all meals
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
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
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
import { getMacros, type MacroServiceResponse } from '../../utils/macros';
import {
  ESTIMATE_PORTION_GRAMS,
  normalizeFoodQuery,
  pickMacroSnapshot,
  type MacroSnap as HelperMacroSnap,
} from '../../utils/macroHelpers';
import { sumEntriesMacros, perMealGoals, round1 } from '../../utils/mealMacros';
import { useTheme } from '../../utils/ThemeContext'; 

// UI helpers
import MacroPebble from '@/components/MacroPebble';
import QuickActionsRow from '@/components/QuickActionsRow';
import Donut from '../../components/Donut';

// Notification
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from '../../utils/pushNotifications';
import { demoWelcomeNotification } from '../../utils/pushNotifications';

type MealLabel = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks' | 'Other';

// Reuse the shared MacroSnap type from macroHelpers
type MacroSnap = HelperMacroSnap;

type Entry = {
  id: string;
  kcal: number; // positive for Add, negative for Subtract
  timestamp: number;
  meal: MealLabel;
  photoUri?: string;
  foodName?: string;
  macros?: MacroSnap & { basis?: 'per_100g' | 'scaled_per_grams' };
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
  { label: 'Breakfast', target: 0, entries: [] },
  { label: 'Lunch', target: 0, entries: [] },
  { label: 'Dinner', target: 0, entries: [] },
  { label: 'Snacks', target: 0, entries: [] },
  { label: 'Other', target: 0, entries: [] },
];

const KCAL_STEP = 50;
const DONUT_SIZE = 168;
const DONUT_STROKE = 12;
const DONUT_INNER = DONUT_SIZE - DONUT_STROKE * 2;

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { theme, mode: themeMode } = useTheme(); // ✅ renombrado
  const [meals, setMeals] = useState<Meal[]>(initialMeals);
  const [dailyGoal, setDailyGoal] = useState<number>(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [activeMeal, setActiveMeal] = useState<MealLabel>('Breakfast');

  // kcal input is manual but can be auto-filled from macro estimate
  const [entryKcal, setEntryKcal] = useState<string>('500');
  const [mode, setMode] = useState<'add' | 'sub'>('add');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [suggestedFoodName, setSuggestedFoodName] = useState<string | undefined>(undefined);

  // upload/AI
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);

  // macro estimate (sheet)
  const [macroBusy, setMacroBusy] = useState(false);
  const [macroSnapshot, setMacroSnapshot] = useState<MacroSnap | null>(null);

  // ✅ NEW: only lock kcal if user changes it AFTER an estimate exists
  const [kcalOverrideAfterEstimate, setKcalOverrideAfterEstimate] = useState(false);

  // per-meal pending preview of estimated macros (not yet saved)
  const [pendingByMeal, setPendingByMeal] =
    useState<Partial<Record<MealLabel, MacroSnap>>>({});

  // inline grams prompt for macro estimation
  const [showGramsRow, setShowGramsRow] = useState(false);
  const [gramsInput, setGramsInput] = useState<string>(
    ESTIMATE_PORTION_GRAMS.toString()
  );

  const webFileRef = useRef<HTMLInputElement | null>(null);
  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), []);



  // calories eaten from all meals
  const eatenCalories = useMemo(
    () => meals.reduce((sum, m) => sum + m.entries.reduce((a, e) => a + e.kcal, 0), 0),
    [meals]
  );
  const remaining = Math.max(0, dailyGoal > 0 ? dailyGoal - eatenCalories : 0);
  const remainingPct = dailyGoal > 0 ? remaining / dailyGoal : 0;

  //make sure the welcome notification only appear one when using app 
  const demoShown = useRef(false);

   //Welcome notification when start up.
  useEffect(() => {
    (async () => {
      if (demoShown.current) return;
      demoShown.current = true;

      const { status } = await Notifications.requestPermissionsAsync();
      console.log('Notification permission:', status);

      if (status !== 'granted') return;

      // ⏳ Delay is CRITICAL in production
      setTimeout(() => {
        demoWelcomeNotification();
      }, 5000);
    })();
  }, []);

  // DAILY MACROS (for the top Carbs/Protein/Fat row)
  const dailyMacros = useMemo(
    () => sumEntriesMacros(meals.flatMap((m) => m.entries)),
    [meals]
  );

  // distribute the dailyGoal into macro gram goals (50/25/25)
  const carbsGoal = dailyGoal > 0 ? (dailyGoal * 0.5) / 4 : 0;
  const proteinGoal = dailyGoal > 0 ? (dailyGoal * 0.25) / 4 : 0;
  const fatGoal = dailyGoal > 0 ? (dailyGoal * 0.25) / 9 : 0;

  // Goal listener
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const goalRef = doc(db, 'users', user.uid, 'calorieGoals', todayKey);
    const unsub = onSnapshot(goalRef, (snap) => {
      const data = snap.data();
      const g = typeof data?.goal === 'number' && data.goal > 0 ? data.goal : 0;
      setDailyGoal(g);

      // Re-split per-meal targets evenly whenever the goal changes
      if (g > 0) {
        const perMeal = Math.round(g / initialMeals.length);
        setMeals((prev) =>
          prev.map((m) => ({
            ...m,
            target: perMeal,
          }))
        );
      } else {
        setMeals((prev) => prev.map((m) => ({ ...m, target: 0 })));
      }
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

      const nextMeals: Meal[] = initialMeals.map((m) => ({
        ...m,
        target: dailyGoal > 0 ? Math.round(dailyGoal / initialMeals.length) : 0,
        entries: [],
      }));
      const byMeal = new Map(nextMeals.map((m) => [m.label, m]));

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
          ...(raw?.macros
            ? {
                macros: {
                  kcal: raw.macros.kcal ?? null,
                  protein_g: raw.macros.protein_g ?? null,
                  fat_g: raw.macros.fat_g ?? null,
                  carbs_g: raw.macros.carbs_g ?? null,
                  basis:
                    raw.macros.basis === 'per_100g'
                      ? 'per_100g'
                      : raw.macros.basis === 'scaled_per_grams'
                      ? 'scaled_per_grams'
                      : undefined,
                },
              }
            : {}),
        };
        bucket.entries.push(e);
      }
      setMeals(nextMeals);
    });
    return () => unsub();
  }, [todayKey, dailyGoal]);

  // Notifications: register once on mount
  useEffect(() => {
    registerForPushNotificationsAsync().catch((e) =>
      console.log('Notifications registration failed:', e)
    );
  }, []);

  async function notifyEntrySaved(
    meal: MealLabel,
    kcal: number,
    name?: string,
    macros?: Entry['macros']
  ) {
    const parts: string[] = [];
    parts.push(`${Math.abs(kcal)} kcal`);
    if (name) parts.push(name);
    if (macros) {
      const p = macros.protein_g ?? null;
      const c = macros.carbs_g ?? null;
      const f = macros.fat_g ?? null;
      const macroStr = [
        p != null ? `P ${Math.round(p)}g` : null,
        c != null ? `C ${Math.round(c)}g` : null,
        f != null ? `F ${Math.round(f)}g` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      if (macroStr) parts.push(macroStr);
    }

    await Notifications.scheduleNotificationAsync({
      content: { title: 'Entry saved', body: `${meal}: ${parts.join(' • ')}` },
      trigger: null,
    });
  }

  async function scheduleFollowUpReminder(remainingKcal: number) {
    if (remainingKcal <= 0) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Keep going!',
        body: `You still have about ${Math.round(remainingKcal)} kcal left today.`,
      },
      trigger: {
        seconds: 90 * 60, // ~90 minutes later
        repeats: false,
      } as Notifications.TimeIntervalTriggerInput,
    });
  }

  const openAdd = (meal?: MealLabel) => {
    setActiveMeal(meal ?? 'Breakfast');
    setEntryKcal('500');
    setMode('add');
    setPhotoUri(undefined);
    setSuggestedFoodName(undefined);
    setMacroSnapshot(null);
    setKcalOverrideAfterEstimate(false); // ✅ reset
    setBusy(false);
    setPct(0);
    setMacroBusy(false);
    setShowGramsRow(false);
    setGramsInput(ESTIMATE_PORTION_GRAMS.toString());
    setModalVisible(true);
  };

  const cancelSheet = () => {
    // Clear only the pending preview for this active meal
    setPendingByMeal((prev) => {
      const next = { ...prev };
      delete next[activeMeal];
      return next;
    });
    setMacroSnapshot(null);
    setKcalOverrideAfterEstimate(false); // ✅ reset
    setShowGramsRow(false);
    setModalVisible(false);
  };

  // ✅ Updated: only “locks” kcal if edited AFTER we already have an estimate
  const setKcalFromText = (t: string) => {
    if (/^\d{0,6}$/.test(t) || t === '') {
      setEntryKcal(t);

      if (macroSnapshot) {
        // if they clear it, allow autofill again
        setKcalOverrideAfterEstimate(t !== '');
      }
    }
  };

  const signedValue = () => {
    const base = Number(entryKcal || 0);
    return (mode === 'sub' ? -1 : 1) * base;
  };

  // ✅ Updated: stepper only locks kcal if used AFTER estimate exists
  const adjustKcal = (delta: number) => {
    const next = signedValue() + delta;
    const nextMode: 'add' | 'sub' = next < 0 ? 'sub' : 'add';
    setMode(nextMode);
    setEntryKcal(String(Math.max(0, Math.abs(next))));

    //if (macroSnapshot) setKcalOverrideAfterEstimate(true);
  };

  // ✅ Updated: clear unlocks autofill
  const clearKcal = () => {
    setEntryKcal('');
    setKcalOverrideAfterEstimate(false);
  };

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
      (webFileRef.current as any)?.click?.();
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
      const storagePath = `images/${user.uid}/${dayjs().format(
        'YYYYMMDD_HHmmss'
      )}_${safeName}`;
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
      if (webFileRef.current) (webFileRef.current as any).value = '';
    }
  };

  /* ---------- grams prompt + macro estimation ---------- */

  const setGramsFromText = (t: string) => {
    const cleaned = t.replace(/[^\d]/g, '');
    setGramsInput(cleaned);
  };

  const openGramsPrompt = () => {
    const raw = (suggestedFoodName || '').trim();
    if (!raw) {
      Alert.alert('No food name', 'Add a photo or type a name first.');
      return;
    }
    setGramsInput((prev) => (prev && Number(prev) > 0 ? prev : ESTIMATE_PORTION_GRAMS.toString()));
    setShowGramsRow(true);
  };

  const estimateMacrosForGrams = async (grams: number) => {
    const raw = (suggestedFoodName || '').trim();
    if (!raw) {
      Alert.alert('No food name', 'Add a photo or type a name first.');
      return;
    }

    // Use helper to force things like "mango" → "mango, raw"
    const q = normalizeFoodQuery(raw);

    try {
      setMacroBusy(true);
      const res: MacroServiceResponse = await getMacros(q, {
        grams,
        includeSurvey: false,
      });

      // Safely pick a macro snapshot from server shape
      const snap = pickMacroSnapshot(res) as MacroSnap | null;

      if (!snap) {
        setMacroSnapshot(null);
        Alert.alert('No macros', 'Could not estimate macros for this item.');
        return;
      }

      setMacroSnapshot(snap);

      // ✅ Updated: auto-fill kcal unless user overrode AFTER an estimate existed
      if (snap.kcal != null && !kcalOverrideAfterEstimate) {
        const estKcal = Math.round(Math.abs(snap.kcal));
        setEntryKcal(String(estKcal));
      }

      // preview on meal card
      setPendingByMeal((prev) => ({ ...prev, [activeMeal]: snap }));

      Alert.alert(
        'Estimated macros',
        `For ~${grams} g\n\nkcal: ${snap.kcal ?? '—'}\nProtein: ${snap.protein_g ?? '—'} g\nFat: ${
          snap.fat_g ?? '—'
        } g\nCarbs: ${snap.carbs_g ?? '—'} g`
      );
    } catch (e: any) {
      console.log('macro fetch error', e?.message || e);
      Alert.alert('Macro service error', 'Check FastAPI server or network.');
    } finally {
      setMacroBusy(false);
    }
  };

  const onConfirmGrams = async () => {
    const grams = Number(gramsInput || '0');
    if (!Number.isFinite(grams) || grams <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive number of grams.');
      return;
    }
    setShowGramsRow(false);
    await estimateMacrosForGrams(grams);
  };

  /* ---------- save entry ---------- */

  const saveEntry = async () => {
    const val = signedValue();
    if (!Number.isFinite(val) || val === 0) {
      Alert.alert('Enter an amount', 'Type a number, then choose Add or Subtract.');
      return;
    }

    const id = Math.random().toString(36).slice(2);
    const timestamp = Date.now();

    const macrosForDb = macroSnapshot
      ? {
          kcal: macroSnapshot.kcal ?? null,
          protein_g: macroSnapshot.protein_g ?? null,
          fat_g: macroSnapshot.fat_g ?? null,
          carbs_g: macroSnapshot.carbs_g ?? null,
          basis: 'scaled_per_grams' as const,
        }
      : undefined;

    const optimistic: Entry = {
      id,
      kcal: val,
      timestamp,
      meal: activeMeal,
      ...(photoUri ? { photoUri } : {}),
      ...(suggestedFoodName ? { foodName: suggestedFoodName } : {}),
      ...(macrosForDb ? { macros: { ...macrosForDb } } : {}),
    };

    const entryForDb: any = {
      id,
      kcal: val,
      timestamp,
      meal: activeMeal,
    };
    if (photoUri) entryForDb.photoUri = photoUri;
    if (suggestedFoodName) entryForDb.foodName = suggestedFoodName;
    if (macrosForDb) entryForDb.macros = macrosForDb;

    setMeals((prev) =>
      prev.map((m) => (m.label === activeMeal ? { ...m, entries: [optimistic, ...m.entries] } : m))
    );

    // clear pending preview & close sheet
    setPendingByMeal((prev) => {
      const next = { ...prev };
      delete next[activeMeal];
      return next;
    });
    setMacroSnapshot(null);
    setKcalOverrideAfterEstimate(false); // ✅ reset for next time
    setShowGramsRow(false);
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
          entries: arrayUnion(entryForDb),
        },
        { merge: true }
      );

      await updateDoc(dayDocRef, {
        [`totals.${activeMeal}`]: increment(val),
        lastUpdated: serverTimestamp(),
      });

      // Notifications
      try {
        await notifyEntrySaved(activeMeal, val, suggestedFoodName, macrosForDb);
        const newRemaining = Math.max(0, dailyGoal > 0 ? dailyGoal - (eatenCalories + val) : 0);
        await scheduleFollowUpReminder(newRemaining);
      } catch (e) {
        console.log('Notification scheduling error:', e);
      }
    } catch (err) {
      console.log('Error saving entry:', err);
      Alert.alert('Save failed', 'Could not save entry to database.');
    }
  };

  const todayStr = dayjs().format('MMMM D, YYYY');

  return (
    //<SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />

      {Platform.OS === 'web' && (
        <input
          ref={webFileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onWebFileChange as any}
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
          <Text style={[styles.h1, { color: theme.text }]}>Today</Text>
          {/*<Text style={[styles.subtle,  { color: themeMode === 'dark' ? '#aaa' : COLORS.subtext }]}>{todayStr}</Text>*/}
          <Text style={[styles.subtle, { color: theme.subtext }]}>{todayStr}</Text>
        </View>
        <Pressable onPress={() => router.push('/two')}>
          {/*<Ionicons name="settings-outline" size={22} color={COLORS.subtext} /> */}
          <Ionicons name="settings-outline" size={22} color={theme.subtext} />
        </Pressable>
      </View>

      {/* Summary card with donut + Eaten/Goal */}
      {/* <View style={[styles.card, { backgroundColor: themeMode === 'dark' ? theme.card : COLORS.paper }] }> */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <View style={styles.donutWrapper}>
          <Donut
            size={DONUT_SIZE}
            strokeWidth={DONUT_STROKE}
            progress={remainingPct}
            trackColor={COLORS.purpleLight}
            progressColor={COLORS.purple}
          >
            <Pressable
              onPress={() => router.push('/four')}
              style={{
                width: DONUT_INNER,
                height: DONUT_INNER,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {dailyGoal > 0 ? (
                <>
                  {/* <Text style={styles.remaining}> */}
                  <Text style={[styles.remaining, { color: theme.text }]}>
                    {remaining.toLocaleString()}
                  </Text>
                  {/* <Text style={styles.remainingLabel}>Remaining</Text> */}
                  <Text style={[styles.remainingLabel, { color: theme.subtext }]}>Remaining</Text>

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
        </View>

        <View style={styles.goalRow}>
          <View style={[styles.goalItem, { backgroundColor: theme.card }]}>
            <Text style={[styles.goalLabel, { color: theme.subtext }]}>
              Eaten
            </Text>
            <Text style={[styles.goalNumber, { color: theme.text }]}>
              {eatenCalories.toLocaleString()} kcal
            </Text>
          </View>
          
          <View style={[styles.goalItem, { backgroundColor: theme.card }]}>
            <Text style={[styles.goalLabel, { color: theme.subtext }]}>
              Goal
            </Text>
            <Text style={[styles.goalNumber, { color: theme.text }]}>
              {dailyGoal.toLocaleString()} kcal
            </Text>
          </View>
        </View>
      </View>

      {/* Daily macro pebbles (now use REAL totals) */}
      <View style={{ paddingHorizontal: 16, marginTop: -4, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <MacroPebble label="Carbs" value={dailyMacros.carbs_g} goal={carbsGoal} fill="#60A5FA" />
          <MacroPebble label="Protein" value={dailyMacros.protein_g} goal={proteinGoal} fill="#22C55E" />
          <MacroPebble label="Fat" value={dailyMacros.fat_g} goal={fatGoal} fill="#F59E0B" />
        </View>
      </View>

      {/* Meals */}
      <FlatList
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 40 + insets.bottom,
        }}
        data={meals}
        keyExtractor={(m, i) => `${m.label}-${i}`}
        renderItem={({ item }) => {
          const consumed = item.entries.reduce((a, e) => a + e.kcal, 0);
          const pct = Math.min(1, item.target ? Math.max(consumed, 0) / item.target : 0);

          // live totals from saved entries
          const liveTotals = sumEntriesMacros(item.entries as any);
          // add pending preview (if any)
          const pending = pendingByMeal[item.label];
          const display = {
            carbs_g: (liveTotals.carbs_g ?? 0) + (pending?.carbs_g ?? 0),
            protein_g: (liveTotals.protein_g ?? 0) + (pending?.protein_g ?? 0),
            fat_g: (liveTotals.fat_g ?? 0) + (pending?.fat_g ?? 0),
          };
          const goals = perMealGoals(item.target || 0);

          const onScan = () => {
            openAdd(item.label);
            setTimeout(() => handleAddPhoto(), 0);
          };

          return (
            // <View style={styles.mealCard}>
            <View style={[styles.mealCard, { backgroundColor: theme.card }]}>
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
                    {/* <Text style={styles.mealTitle}>{item.label}</Text> */}
                    <Text style={[styles.mealTitle, { color: theme.text }]}>{item.label}</Text>
                    {/* <Text style={styles.mealSub}> */}
                    <Text style={[styles.mealSub, { color: theme.subtext }]}>
                      {Math.max(consumed, 0)} {item.target ? ` / ${item.target}` : ''} Cal
                    </Text>

                    {/* compact macro numbers + tiny bars */}
                    <View style={{ marginTop: 6 }}>
                      <Text style={[styles.mealSub, { marginBottom: 4, color: theme.text }]}>
                        C {round1(display.carbs_g)}g • P {round1(display.protein_g)}g • F {round1(display.fat_g)}g
                        {pending ? '  (est.)' : ''}
                      </Text>
                      <MiniMacroBars
                        carbs={display.carbs_g}
                        protein={display.protein_g}
                        fat={display.fat_g}
                        goals={goals}
                      />
                    </View>

                    {/* Scan only (Search/Recent removed from UI) */}
                    <QuickActionsRow onScan={onScan} />
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

      {/* Add entry bottom sheet */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={cancelSheet}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 120 : 0}
        >
          {/* <View style={[styles.sheet, { paddingBottom: 8 + insets.bottom }]}> */}
          <View style={[styles.sheet,{ backgroundColor: theme.card, paddingBottom: 8 + insets.bottom }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {/* Header */}
              <View style={styles.sheetHeader}>
                <Pressable onPress={cancelSheet}>
                  {/* <Text style={styles.sheetCancel}>Cancel</Text> */}
                  <Text style={[styles.sheetCancel, { color: theme.subtext }]}>Cancel</Text>
                </Pressable>
                {/* <Text style={styles.sheetTitle}>{activeMeal}</Text> */}
                <Text style={[styles.sheetTitle, { color: theme.text }]}>{activeMeal}</Text>
                <Pressable onPress={saveEntry}>
                  {/* <Text style={styles.sheetSave}>Save</Text> */}
                  <Text style={[styles.sheetSave, { color: theme.tint }]}>Save</Text>
                </Pressable>
              </View>

              {/* Add/Subtract + Clear */}
              <View style={styles.segmentRow}>
                <Pressable
                  onPress={() => setMode('add')}
                  style={[
                    styles.segmentBtn,
                    // mode === 'add' && styles.segmentBtnActive,
                    { backgroundColor: theme.card, borderColor: theme.border }, 
                    mode === 'add' && { backgroundColor: theme.muted },          
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: theme.text }, // normal text color
                      // mode === 'add' && styles.segmentTextActive,
                      mode === 'add' && { color: theme.tint } // active = purple
                    ]}
                  >
                    Add
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode('sub')}
                  style={[
                    styles.segmentBtn,
                    //mode === 'sub' && styles.segmentBtnActive,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    mode === 'sub' && { backgroundColor: theme.muted }
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      // mode === 'sub' && styles.segmentTextActive,
                        { color: theme.text },
                        mode === 'sub' && { color: theme.tint },
                    ]}
                  >
                    Subtract
                  </Text>
                </Pressable>
                {/* <Pressable onPress={clearKcal} style={styles.clearBtn}> */}
                <Pressable onPress={clearKcal} style={[styles.clearBtn,{ backgroundColor: theme.muted }]}>
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    // color={COLORS.text}
                    color={theme.text}
                  />
                  <Text
                    style={{
                      marginLeft: 6,
                      //color: COLORS.text,
                      color: theme.text,
                      fontWeight: '600',
                    }}
                  >
                    Clear
                  </Text>
                </Pressable>
              </View>

              {/* kcal input + +/- steppers */}
              <View style={styles.kcalWrap}>
                <View style={styles.kcalInputRow}>
                  <Pressable
                    onPress={() => adjustKcal(-KCAL_STEP)}
                    style={[
                      styles.stepperBtn,
                      // { backgroundColor: COLORS.mutedBg },
                      { backgroundColor: theme.muted },
                    ]}
                  >
                    {/* <Text style={styles.stepperText}>–</Text> */}
                    <Text style={[styles.stepperText, { color: theme.text }]}>–</Text>
                  </Pressable>

                  <TextInput
                    //style={styles.kcalInput}
                    style={[styles.kcalInput, { color: theme.text, borderBottomColor: theme.border }]}
                    value={entryKcal}
                    onChangeText={setKcalFromText}
                    placeholder="0"
                    inputMode="numeric"
                    keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                    returnKeyType="done"
                    maxLength={6}
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  <Pressable
                    onPress={() => adjustKcal(+KCAL_STEP)}
                    style={[
                      styles.stepperBtn,
                      // { backgroundColor: COLORS.mutedBg },
                      { backgroundColor: theme.muted },
                    ]}
                  >
                    {/* <Text style={styles.stepperText}>＋</Text> */}
                    {/* <Text style={[styles.stepperText, { color: theme.text }]}>＋</Text> */}
                    <Text style={[styles.stepperText, { color: theme.text }]}>＋</Text>
                  </Pressable>
                </View>

                <Text style={styles.kcalUnit}>kcal</Text>

                {suggestedFoodName ? (
                  // <Text style={{ marginTop: 6, color: COLORS.subtext }}>
                  <Text style={{ marginTop: 6, color: theme.subtext }}>
                    AI suggestion:{' '}
                    {/* <Text style={{ fontWeight: '700', color: COLORS.text }}> */}
                    <Text style={{ fontWeight: '700', color: theme.text }}>
                      {suggestedFoodName}
                    </Text>
                  </Text>
                ) : null}
              </View>

              {/* Photo & Macro buttons */}
              <View
                style={[
                  styles.suggestionsRow,
                  { justifyContent: 'flex-start', gap: 12 },
                ]}
              >
                {/* <Pressable style={styles.photoBtn} onPress={handleAddPhoto}> */}
                <Pressable style={[styles.photoBtn, { backgroundColor: theme.muted }]} onPress={handleAddPhoto}>
                  <Ionicons
                    name="image-outline"
                    size={22}
                    //color={COLORS.text}
                    color={theme.text}
                  />
                </Pressable>

                <Pressable
                  style={[styles.photoBtn, { paddingHorizontal: 14, backgroundColor: theme.muted }]}
                  onPress={openGramsPrompt}
                  disabled={macroBusy}
                >
                  {macroBusy ? (
                    <ActivityIndicator />
                  ) : (
                    // <Text style={{ fontWeight: '700', color: COLORS.text }}>
                    <Text style={{ fontWeight: '700', color: theme.text }}>
                      Estimate macros
                    </Text>
                  )}
                </Pressable>

                {busy && (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <ActivityIndicator />
                    <Text style={{ marginLeft: 8 }}>{Math.round(pct * 100)}%</Text>
                  </View>
                )}

                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={{ width: 48, height: 48, borderRadius: 8 }} />
                ) : null}
              </View>

              {/* Inline grams row */}
              {showGramsRow && (
                <View style={styles.gramsInlineCard}>
                  <Text style={styles.gramsInlineTitle}>How many grams?</Text>
                  <View style={styles.gramsInlineRow}>
                    <TextInput
                      style={styles.gramsInlineInput}
                      value={gramsInput}
                      onChangeText={setGramsFromText}
                      keyboardType="numeric"
                      inputMode="numeric"
                      placeholder={ESTIMATE_PORTION_GRAMS.toString()}
                      maxLength={5}
                    />
                    <Text style={styles.gramsInlineSuffix}>g</Text>
                  </View>
                  <View style={styles.gramsInlineButtonsRow}>
                    <Pressable
                      style={[styles.gramsInlineBtn, { backgroundColor: '#E5E7EB' }]}
                      onPress={() => setShowGramsRow(false)}
                    >
                      <Text style={[styles.gramsInlineBtnText, { color: '#111827' }]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.gramsInlineBtn, { backgroundColor: COLORS.purple }]}
                      onPress={onConfirmGrams}
                    >
                      <Text style={[styles.gramsInlineBtnText, { color: '#FFFFFF' }]}>Use</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {macroSnapshot ? (
                <View style={{ marginTop: 8, paddingHorizontal: 16 }}>
                  <Text style={{ fontWeight: '700', marginBottom: 4 }}>
                    Estimated macros (scaled):
                  </Text>
                  {/* <Text style={{ color: COLORS.subtext }}> */}
                  <Text style={{ color: theme.subtext }}>
                    kcal: {macroSnapshot.kcal ?? '—'} | P:{' '}
                    {macroSnapshot.protein_g ?? '—'} g | F:{' '}
                    {macroSnapshot.fat_g ?? '—'} g | C:{' '}
                    {macroSnapshot.carbs_g ?? '—'} g
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- tiny UI for the three mini macro bars ---------- */
function MiniMacroBars({
  carbs,
  protein,
  fat,
  goals,
}: {
  carbs: number;
  protein: number;
  fat: number;
  goals: { carbs_g: number; protein_g: number; fat_g: number };
}) {
  const { theme } = useTheme();
  const Row = ({
    label,
    value,
    goal,
  }: {
    label: string;
    value: number;
    goal: number;
  }) => {
    const pct = goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0;
    return (
      <View style={{ marginBottom: 4 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 2,
          }}
        >
          {/* <Text style={{ fontSize: 11, color: '#6B6A75' }}>{label}</Text>
          <Text style={{ fontSize: 11, color: '#6B6A75' }}>
            {round1(value)}g {goal ? `/ ${round1(goal)}g` : ''}
          </Text> */}
        <Text style={{ fontSize: 11, color: theme.text }}>
          {label}
        </Text>

        <Text style={{ fontSize: 11, color: theme.text }}>
          {round1(value)}g {goal ? `/ ${round1(goal)}g` : ''}
        </Text>
        </View>
        <View
          style={{
            height: 5,
            //backgroundColor: '#EEE',
            backgroundColor: theme.border,
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${pct * 100}%`,
              height: 5,
              //backgroundColor: '#5B21B6',
              backgroundColor: theme.tint
            }}
          />
        </View>
      </View>
    );
  };

  return (
    <View>
      <Row label="Carbs" value={carbs || 0} goal={goals.carbs_g} />
      <Row label="Protein" value={protein || 0} goal={goals.protein_g} />
      <Row label="Fat" value={fat || 0} goal={goals.fat_g} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, 
          //backgroundColor: COLORS.bg 
        },
  

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 12,
  },
  logo: { width: 44, height: 44, borderRadius: 8, resizeMode: 'contain' },

  h1: { 
    fontSize: 34, 
    fontWeight: '800', 
    //color: COLORS.text 
  },

  subtle: { //color: COLORS.subtext, 
            marginTop: 2 },

  card: {
    margin: 16,
    backgroundColor: COLORS.paper,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  donutWrapper: {
    alignItems: 'center',
    marginBottom: 12,
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  goalItem: {
    flex: 1,
    backgroundColor: COLORS.mutedBg,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  goalLabel: { 
    fontSize: 13, 
    //color: COLORS.subtext 
  },

  goalNumber: { 
    fontSize: 16, 
    fontWeight: '700', 
    //color: COLORS.text 
  },

  remaining: { 
    fontSize: 22, 
    fontWeight: '800', 
    //color: COLORS.text 
  },
  remainingLabel: { 
    fontSize: 12, 
    //color: COLORS.subtext 
  },
  centerPlus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },

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
  mealTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    //color: COLORS.text 
  },

  mealSub: { 
    fontSize: 12, 
    //color: COLORS.subtext, 
    marginTop: 2 },

  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnPlus: { fontSize: 22, color: COLORS.purple, marginTop: -2 },

  // bottom sheet backdrop
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '92%',
  },

  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },

  sheetCancel: { 
    //color: COLORS.subtext, 
    fontSize: 16 
  },

  sheetTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    //color: COLORS.text 
  },
  sheetSave: { color: COLORS.purple, fontSize: 16, fontWeight: '700' },

  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 6,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  segmentBtnActive: {
    backgroundColor: COLORS.mutedBg,
    borderColor: COLORS.purpleLight,
  },
  segmentText: { 
    //color: COLORS.text, 
    fontWeight: '600' 
  },
  segmentTextActive: { color: COLORS.purple, fontWeight: '800' },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },

  kcalWrap: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  kcalInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kcalInput: {
    fontSize: 44,
    fontWeight: '800',
    //color: theme.text,
    minWidth: 120,
    textAlign: 'center',
    paddingVertical: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  kcalUnit: { 
    fontSize: 14, 
    //color: COLORS.subtext, 
    marginTop: 6 },

  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    fontSize: 28,
    fontWeight: '700',
    //color: COLORS.text,
    marginTop: -2,
  },

  suggestionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  photoBtn: {
    minWidth: 48,
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.mutedBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // inline grams card
  gramsInlineCard: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  gramsInlineTitle: {
    fontSize: 14,
    fontWeight: '700',
    //color: COLORS.text,
    marginBottom: 6,
  },
  gramsInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  gramsInlineInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    //color: COLORS.text,
    backgroundColor: '#FFFFFF',
  },
  gramsInlineSuffix: {
    marginLeft: 8,
    fontSize: 14,
    //color: COLORS.subtext,
    fontWeight: '600',
  },
  gramsInlineButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  gramsInlineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  gramsInlineBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

