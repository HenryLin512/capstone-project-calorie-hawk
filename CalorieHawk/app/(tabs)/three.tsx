// app/(tabs)/three.tsx
/**
 * History (real-time)
 * - Live updates via onSnapshot on /calories and /photos
 * - Day totals = signed sum of entries[].kcal (so Subtract works)
 * - Aggregations: Day / ISO Week / Month / Year
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, Text, View, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
dayjs.extend(isoWeek);

import { auth, db } from '../../FireBaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';

type ViewType = 'day' | 'week' | 'month' | 'year';

const monthNames = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const parseYMD = (s: string) => {
  const [y,m,d] = s.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, d);
};

type DayRow = { date: string; calories: number; photos: string[] };

export default function HistoryTab() {
  const [viewType, setViewType] = useState<ViewType>('day');
  const [loading, setLoading] = useState(true);

  // authoritative day map we keep in sync in real time
  const [dayMap, setDayMap] = useState<Record<string, DayRow>>({});

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
    const photosCol = collection(db, 'users', user.uid, 'photos');

    // helper to safely update dayMap
    const updateDay = (date: string, patch: Partial<DayRow>) => {
      setDayMap(prev => {
        const prevRow = prev[date] ?? { date, calories: 0, photos: [] };
        const nextRow: DayRow = {
          date,
          calories: patch.calories != null ? patch.calories : prevRow.calories,
          photos: patch.photos != null ? patch.photos : prevRow.photos,
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
          // signed sum of entries[].kcal (falls back to 0)
          const entries = Array.isArray(data?.entries) ? data.entries : [];
          const sum = entries.reduce((acc: number, e: any) => acc + Number(e?.kcal || 0), 0);

          if (chg.type === 'removed') {
            setDayMap(prev => {
              const copy = { ...prev };
              delete copy[date];
              return copy;
            });
          } else {
            updateDay(date, { calories: sum });
          }
        });
        setLoading(false);
      },
      (err) => {
        console.log('calories onSnapshot error:', err);
        setLoading(false);
      }
    );

    const unsubPhotos = onSnapshot(
      photosCol,
      (snap) => {
        snap.docChanges().forEach((chg) => {
          const date = chg.doc.id; // YYYY-MM-DD
          if (chg.type === 'removed') {
            // If photo doc deleted, remove photos array for that date (keep calories if any)
            updateDay(date, { photos: [] });
          } else {
            const data = chg.doc.data() as any;
            const photos: string[] = (Array.isArray(data?.photos) ? data.photos : [])
              .map((p: any) => p?.url)
              .filter(Boolean);
            updateDay(date, { photos });
          }
        });
      },
      (err) => console.log('photos onSnapshot error:', err)
    );

    return () => {
      unsubCal();
      unsubPhotos();
    };
  }, []);

  // convert map -> sorted array (DESC by date)
  const allDays: DayRow[] = useMemo(() => {
    const rows = Object.values(dayMap);
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return rows;
  }, [dayMap]);

  // compute display data for selected view
  const displayData = useMemo(() => {
    if (viewType === 'day') {
      return allDays.map(d => ({ label: d.date, calories: d.calories, photos: d.photos }));
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
        .map(([label, calories]) => ({ label, calories, photos: [] }));
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
        .map(([label, calories]) => ({ label, calories, photos: [] }));
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
      .map(([label, calories]) => ({ label, calories, photos: [] }));
  }, [viewType, allDays]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 6 }}>Loading history…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>History</Text>

      {/* Toggle buttons */}
      <View style={styles.buttonsContainer}>
        {(['day', 'week', 'month', 'year'] as const).map(type => {
          const active = viewType === type;
          return (
            <TouchableOpacity
              key={type}
              style={[styles.button, active && styles.activeButton]}
              onPress={() => setViewType(type)}
            >
              <Text style={[styles.buttonText, { color: active ? '#fff' : '#111' }]}>
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
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.date}>{item.label}</Text>
              <Text style={[styles.calories, { color: item.calories >= 0 ? '#16A34A' : '#DC2626' }]}>
                {item.calories >= 0 ? '+' : '–'}
                {Math.abs(item.calories)} cal
              </Text>

              {item.photos?.length ? (
                <View style={styles.photoRow}>
                  {item.photos.slice(0, 6).map((url: string, idx: number) => (
                    <Image key={`${url}-${idx}`} source={{ uri: url }} style={styles.thumb} />
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No data available</Text>}
        contentContainerStyle={{ padding: 16, paddingTop: 6 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },

  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '800', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },

  buttonsContainer: {
    flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10,
    paddingHorizontal: 12,
  },
  button: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#eee' },
  activeButton: { backgroundColor: '#5B21B6' },
  buttonText: { fontWeight: '700' },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, marginHorizontal: 16,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  date: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  calories: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  thumb: { width: 60, height: 60, borderRadius: 8 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 16, color: '#888' },
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