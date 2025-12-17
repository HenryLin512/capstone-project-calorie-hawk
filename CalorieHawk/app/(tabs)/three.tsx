// app/(tabs)/three.tsx
/**
 * History (real-time)
 * - Live updates via onSnapshot on /calories
 * - Day totals = signed sum of entries[].kcal (so Subtract works)
 * - Aggregations: Day / ISO Week / Month / Year
 * - Day view:
 *    - macro totals (P/C/F)
 *    - per-meal kcal
 *    - per-meal photos, each photo linked to its kcal + macros
 *    - tap a photo to see overlay with details
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Text,
  View,
  Image,
  ActivityIndicator,
  Pressable,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
dayjs.extend(isoWeek);

import { auth, db } from '../../FireBaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';
import { ZERO_MACROS, type MacroTotals } from '../../utils/macroMath';
import { useTheme } from '../../utils/ThemeContext';

type ViewType = 'day' | 'week' | 'month' | 'year';

const monthNames = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const parseYMD = (s: string) => {
  const [y, m, d] = s.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, d);
};

// keep meal labels in sync with Dashboard
type MealLabel = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks' | 'Other';

// snapshot of macros saved on an entry
type MacroSnap = {
  kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
};

type MealPhotoDetail = {
  url: string;
  kcal: number;          // signed kcal of that entry
  foodName?: string;
  macros?: MacroSnap;    // optional macros saved with that entry
};

type DayRow = {
  date: string;
  calories: number; // signed sum of entries[].kcal
  macros: MacroTotals; // signed macro sums for the day (based on entries[].macros)
  perMeal: Partial<Record<MealLabel, number>>; // signed per-meal kcal sums
  mealPhotos: Partial<Record<MealLabel, MealPhotoDetail[]>>; // per-meal photo entries
};

const mealOrder: MealLabel[] = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Other'];

export default function HistoryTab() {
  const [viewType, setViewType] = useState<ViewType>('day');
  const [loading, setLoading] = useState(true);

  // authoritative day map we keep in sync in real time
  const [dayMap, setDayMap] = useState<Record<string, DayRow>>({});

  // photo overlay state
  const [selectedPhoto, setSelectedPhoto] = useState<{
    url: string;
    date: string;
    meal: MealLabel;
    kcal: number;
    foodName?: string;
    macros?: MacroSnap;
  } | null>(null);
  const { theme, mode: themeMode } = useTheme();

  // subscribe once, then keep state fresh
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setDayMap({});
      setLoading(false);
      return;
    }

    setLoading(true);

    const calCol = collection(db, 'users', user.uid, 'calories');

    // helper to safely update dayMap
    const updateDay = (date: string, patch: Partial<DayRow>) => {
      setDayMap(prev => {
        const prevRow: DayRow = prev[date] ?? {
          date,
          calories: 0,
          macros: { ...ZERO_MACROS },
          perMeal: {},
          mealPhotos: {},
        };
        const nextRow: DayRow = {
          date,
          calories: patch.calories != null ? patch.calories : prevRow.calories,
          macros: patch.macros != null ? patch.macros : prevRow.macros,
          perMeal: patch.perMeal != null ? patch.perMeal : prevRow.perMeal,
          mealPhotos: patch.mealPhotos != null ? patch.mealPhotos : prevRow.mealPhotos,
        };
        return { ...prev, [date]: nextRow };
      });
    };

    const unsubCal = onSnapshot(
      calCol,
      (snap) => {
        snap.docChanges().forEach((chg) => {
          const date = chg.doc.id; // YYYY-MM-DD
          const data = chg.doc.data() as any;

          // entries for that day (may be empty)
          const entries: any[] = Array.isArray(data?.entries) ? data.entries : [];

          // signed sum of entries[].kcal (falls back to 0)
          const calories = entries.reduce(
            (acc: number, e: any) => acc + Number(e?.kcal || 0),
            0
          );

          // per-meal signed kcal sums
          const perMeal: Partial<Record<MealLabel, number>> = {};
          // per-meal photos with details, only for entries that actually exist
          const mealPhotos: Partial<Record<MealLabel, MealPhotoDetail[]>> = {};

          // signed macro sums for the day (based on entries[].macros)
          const macros: MacroTotals = entries.reduce(
            (acc: MacroTotals, e: any) => {
              const rawMeal = e?.meal;
              const meal: MealLabel =
                rawMeal === 'Breakfast' ||
                rawMeal === 'Lunch' ||
                rawMeal === 'Dinner' ||
                rawMeal === 'Snacks'
                  ? rawMeal
                  : 'Other';

              const kcal = Number(e?.kcal || 0);
              perMeal[meal] = (perMeal[meal] ?? 0) + kcal;

              // collect photo info from the entry itself (only if entry is saved)
              if (e?.photoUri) {
                if (!mealPhotos[meal]) mealPhotos[meal] = [];
                mealPhotos[meal]!.push({
                  url: String(e.photoUri),
                  kcal,
                  foodName: typeof e.foodName === 'string' ? e.foodName : undefined,
                  macros: e.macros
                    ? {
                        kcal: e.macros.kcal ?? null,
                        protein_g: e.macros.protein_g ?? null,
                        fat_g: e.macros.fat_g ?? null,
                        carbs_g: e.macros.carbs_g ?? null,
                      }
                    : undefined,
                });
              }

              const m = e?.macros;
              if (!m) return acc;

              const sign = kcal >= 0 ? 1 : -1;
              const safe = (x: any) =>
                typeof x === 'number' && Number.isFinite(x) ? x : 0;

              return {
                kcal:      acc.kcal      + safe(m.kcal)      * sign,
                protein_g: acc.protein_g + safe(m.protein_g) * sign,
                fat_g:     acc.fat_g     + safe(m.fat_g)     * sign,
                carbs_g:   acc.carbs_g   + safe(m.carbs_g)   * sign,
              };
            },
            { ...ZERO_MACROS }
          );

          if (chg.type === 'removed') {
            setDayMap(prev => {
              const copy = { ...prev };
              delete copy[date];
              return copy;
            });
          } else {
            updateDay(date, { calories, perMeal, macros, mealPhotos });
          }
        });
        setLoading(false);
      },
      (err) => {
        console.log('calories onSnapshot error:', err);
        setLoading(false);
      }
    );

    return () => {
      unsubCal();
    };
  }, []);

  // convert map -> sorted array (DESC by date)
  const allDays: DayRow[] = useMemo(() => {
    const rows = Object.values(dayMap);

    // OPTIONAL: if you wanted to hide days with *only* zero data and no entries,
    // you could filter here. With the new logic, "photo-only" days no longer appear.
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return rows;
  }, [dayMap]);

  // compute display data for selected view
  const displayData = useMemo(() => {
    if (viewType === 'day') {
      // keep macros + perMeal + mealPhotos for this view
      return allDays.map(d => ({
        label: d.date,
        calories: d.calories,
        macros: d.macros,
        perMeal: d.perMeal,
        mealPhotos: d.mealPhotos,
      }));
    }

    if (viewType === 'week') {
      const acc: Record<string, number> = {};
      allDays.forEach(item => {
        const d = dayjs(item.date);
        const key = `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, '0')}`;
        acc[key] = (acc[key] || 0) + item.calories;
      });
      return Object.entries(acc)
        .sort(([a],[b]) => (a < b ? 1 : -1))
        .map(([label, calories]) => ({ label, calories }));
    }

    if (viewType === 'month') {
      const acc: Record<string, number> = {};
      allDays.forEach(item => {
        const d = parseYMD(item.date);
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        acc[key] = (acc[key] || 0) + item.calories;
      });
      return Object.entries(acc)
        .sort(([a],[b]) => (a < b ? 1 : -1))
        .map(([label, calories]) => ({ label, calories }));
    }

    // year
    const acc: Record<string, number> = {};
    allDays.forEach(item => {
      const d = parseYMD(item.date);
      const key = String(d.getFullYear());
      acc[key] = (acc[key] || 0) + item.calories;
    });
    return Object.entries(acc)
      .sort(([a],[b]) => (a < b ? 1 : -1))
      .map(([label, calories]) => ({ label, calories }));
  }, [viewType, allDays]);

  if (loading) {
    return (
    <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={theme.text} />
      <Text style={{ marginTop: 6, color: theme.text }}>Loading history…</Text>
    </SafeAreaView>
  );
}

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>History</Text>

      {/* Toggle buttons */}
      <View style={styles.buttonsContainer}>
        {(['day', 'week', 'month', 'year'] as const).map(type => {
          const active = viewType === type;
          return (
            <TouchableOpacity
              key={type}
              style={[styles.button, active && { backgroundColor: theme.tint }]}
              onPress={() => setViewType(type)}
            >
              <Text style={[styles.buttonText, { color: active ? '#fff' : theme.text }]}>
                {type.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      <FlatList
        data={displayData}
        keyExtractor={(it, idx) => `${it.label}-${idx}`}
        renderItem={({ item }) => {
          if (viewType !== 'day') {
            // Week / Month / Year: simple cards with totals
            return (
              <View style={[styles.card, { backgroundColor: themeMode === 'dark' ? theme.card : '#fff' }]}>
                <Text style={[styles.date, { color: theme.text }]}>{item.label}</Text>
                <Text
                  style={[
                    styles.calories,
                    { color: item.calories >= 0 ? '#16A34A' : '#DC2626' },
                  ]}
                >
                  {item.calories >= 0 ? '+' : '–'}
                  {Math.abs(item.calories)} cal
                </Text>
              </View>
            );
          }

          const perMeal = (item as any).perMeal as Partial<
            Record<MealLabel, number>
          > | undefined;
          const macros = (item as any).macros as MacroTotals | undefined;
          const mealPhotos = (item as any).mealPhotos as
            | Partial<Record<MealLabel, MealPhotoDetail[]>>
            | undefined;

          const hasMealBreakdown =
            perMeal && mealOrder.some(m => (perMeal[m] ?? 0) !== 0);

          const hasMacros =
            macros &&
            (macros.protein_g !== 0 ||
              macros.carbs_g !== 0 ||
              macros.fat_g !== 0);

          const hasMealPhotos =
            mealPhotos &&
            mealOrder.some(m => (mealPhotos[m]?.length ?? 0) > 0);

          return (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.date}>{item.label}</Text>
                <Text
                  style={[
                    styles.calories,
                    { color: item.calories >= 0 ? '#16A34A' : '#DC2626' },
                  ]}
                >
                  {item.calories >= 0 ? '+' : '–'}
                  {Math.abs(item.calories)} cal
                </Text>

                {/* Day-level macros line */}
                {hasMacros && macros && (
                  <Text style={styles.macrosLine}>
                    P {Math.round(macros.protein_g)}g · C {Math.round(macros.carbs_g)}g · F{' '}
                    {Math.round(macros.fat_g)}g
                  </Text>
                )}

                {/* Per-meal kcal breakdown */}
                {hasMealBreakdown && (
                  <View style={styles.mealBreakdown}>
                    {mealOrder.map(meal => {
                      const val = perMeal?.[meal] ?? 0;
                      if (!val) return null;
                      return (
                        <View key={meal} style={styles.mealRow}>
                          <Text style={styles.mealLabel}>{meal}</Text>
                          <Text
                            style={[
                              styles.mealCalories,
                              { color: val >= 0 ? '#16A34A' : '#DC2626' },
                            ]}
                          >
                            {val >= 0 ? '+' : '–'}
                            {Math.abs(val)} cal
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Per-meal photos, same row as label */}
                {hasMealPhotos && (
                  <View style={styles.mealPhotosBlock}>
                    {mealOrder.map(meal => {
                      const photosForMeal = mealPhotos?.[meal] ?? [];
                      if (!photosForMeal.length) return null;

                      return (
                        <View key={meal} style={styles.mealPhotoRowBlock}>
                          <View style={styles.mealPhotoHeaderRow}>
                            <Text style={styles.mealPhotoLabel}>{meal}</Text>
                            <View style={styles.photoRow}>
                              {photosForMeal.map((p, idx) => (
                                <Pressable
                                  key={`${meal}-${p.url}-${idx}`}
                                  onPress={() =>
                                    setSelectedPhoto({
                                      url: p.url,
                                      date: item.label,
                                      meal,
                                      kcal: p.kcal,
                                      foodName: p.foodName,
                                      macros: p.macros,
                                    })
                                  }
                                >
                                  <Image source={{ uri: p.url }} style={styles.thumb} />
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={[styles.empty, { color: theme.text }]}>No data available</Text>}
        contentContainerStyle={{ padding: 16, paddingTop: 6 }}
      />

      {/* Photo details overlay */}
      <Modal
        visible={!!selectedPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSelectedPhoto(null)}
        >
          <View style={[styles.modalCard,{ backgroundColor: themeMode === 'dark' ? theme.card : '#fff' }]}>
            {selectedPhoto && (
              <>
                <Image
                  source={{ uri: selectedPhoto.url }}
                  style={styles.modalImage}
                />
                <Text style={[styles.modalTitle,{ color: theme.text }]}>
                  {selectedPhoto.foodName || selectedPhoto.meal}
                </Text>
                <Text style={[styles.modalSubtitle, { color: theme.text }]}>
                  {selectedPhoto.date} • {selectedPhoto.meal}
                </Text>
                <Text style={styles.modalKcal}>
                  {selectedPhoto.kcal >= 0 ? '+' : '–'}
                  {Math.abs(selectedPhoto.kcal)} cal
                </Text>

                {selectedPhoto.macros && (
                  <Text style={[styles.modalMacros, { color: theme.text }]}>
                    P {selectedPhoto.macros.protein_g ?? '—'}g · C{' '}
                    {selectedPhoto.macros.carbs_g ?? '—'}g · F{' '}
                    {selectedPhoto.macros.fat_g ?? '—'}g
                  </Text>
                )}
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },

  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '800', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },

  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  button: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#eee' },
  activeButton: { backgroundColor: '#5B21B6' },
  buttonText: { fontWeight: '700' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  date: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  calories: { fontSize: 16, fontWeight: '800', marginBottom: 2 },

  // macros line
  macrosLine: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },

  // Per-meal kcal breakdown
  mealBreakdown: { marginTop: 2, marginBottom: 4 },
  mealRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  mealLabel: { fontSize: 13, color: '#374151', fontWeight: '500' },
  mealCalories: { fontSize: 13, fontWeight: '700' },

  // Per-meal photo groups
  mealPhotosBlock: { marginTop: 4 },
  mealPhotoRowBlock: { marginTop: 4 },
  mealPhotoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // label on left, photos on right (same line)
  },
  mealPhotoLabel: { fontSize: 12, color: '#4B5563', fontWeight: '600' },

  photoRow: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  thumb: { width: 36, height: 36, borderRadius: 8 },

  empty: { textAlign: 'center', marginTop: 40, fontSize: 16, color: '#888' },

  // photo overlay
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  modalImage: { width: 120, height: 120, borderRadius: 12, marginBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  modalSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 6 },
  modalKcal: { fontSize: 16, fontWeight: '800', color: '#16A34A', marginBottom: 4 },
  modalMacros: { fontSize: 14, color: '#4B5563', textAlign: 'center' },
});




// DO NOT DELETE THIS since I can reuse some of it later
//fetch from Firestore
  // useEffect(() => {
  //   const fetchData = async () => {
  //     if (!user) 
  //       return;
  //     try {
  //       const userID = auth.currentUser.uid;
  //       const q = collection(db, "users", user?.uid, "calories");
  //       const snapshot = await getDocs(q);

  //       //const data = snapshot.docs.map(doc => doc.data());
  //       //let data: any[] = []; // an array can hold anything (object, strings, numbers, etc.)
  //       // Map date -> total calories for that day
  //       const dataMap: { [date: string]: number } = {};

  //       snapshot.docs.forEach(docSnap => 
  //         {
  //         const entries = docSnap.data().entries || [];
  //         const totalKcal = entries.reduce((sum: number, entry: any) => sum + entry.kcal, 0)
  //         // entries.forEach((entry: any) => 
  //         //   {
  //         //   data.push({
  //         //     date: docSnap.id,
  //         //     calories: entry.kcal,
  //         //   });
  //         // });
  //         dataMap[docSnap.id] = totalKcal;
  //       });

  //       const data = Object.entries(dataMap).map(([date, calories]) => ({ date, calories}));
  //       setAllData(data); // save all raw entries
  //     } catch (error) {
  //       console.error("Error fetching calories:", error);
  //     }
  //   };

  //   fetchData();
  // }, [user]);