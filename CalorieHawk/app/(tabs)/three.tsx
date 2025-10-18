import { StyleSheet, FlatList, TouchableOpacity, Text, View, Image, ActivityIndicator } from 'react-native';
import React, { useState, useEffect } from 'react';
import { auth, db } from '../../FireBaseConfig';
import { collection, getDocs } from 'firebase/firestore';

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const parseDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
  return new Date(y, (m - 1), d);
};

export default function HistoryTab() {
  const [viewType, setViewType] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [displayData, setDisplayData] = useState<any[]>([]);
  const [allData, setAllData] = useState<{ date: string; calories: number; photos: string[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      const user = auth.currentUser;
      if (!user) {
        setAllData([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // --- Fetch calories ---
        const calCol = collection(db, 'users', user.uid, 'calories');
        const calSnap = await getDocs(calCol);
        const calorieMap: Record<string, number> = {};
        calSnap.docs.forEach(d => {
          const entries: any[] = Array.isArray(d.data()?.entries) ? d.data().entries : [];
          const total = entries.reduce((acc, e) => acc + Number(e?.kcal || 0), 0);
          calorieMap[d.id] = total;
        });

        // --- Fetch photos ---
        const photoCol = collection(db, 'users', user.uid, 'photos');
        const photoSnap = await getDocs(photoCol);
        const photoMap: Record<string, string[]> = {};
        photoSnap.docs.forEach(d => {
          const photos: any[] = Array.isArray(d.data()?.photos) ? d.data().photos : [];
          photoMap[d.id] = photos.map(p => p.url);
        });

        // --- Combine data by date ---
        const allDates = new Set([...Object.keys(calorieMap), ...Object.keys(photoMap)]);
        const combined = Array.from(allDates).map(date => ({
          date,
          calories: calorieMap[date] || 0,
          photos: photoMap[date] || [],
        }));

        combined.sort((a, b) => a.date.localeCompare(b.date));
        setAllData(combined);
      } catch (e) {
        console.log('Error fetching history:', e);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  // Filter/aggregate display
  useEffect(() => {
    if (!allData.length) {
      setDisplayData([]);
      return;
    }

    if (viewType === 'day') {
      setDisplayData(allData.map(item => ({
        label: item.date,
        calories: item.calories,
        photos: item.photos,
      })));
      return;
    }

    if (viewType === 'week') {
      const weeks: { week: number; calories: number }[] = [];
      allData.forEach((item, index) => {
        const weekIndex = Math.floor(index / 7);
        if (!weeks[weekIndex]) weeks[weekIndex] = { week: weekIndex + 1, calories: 0 };
        weeks[weekIndex].calories += item.calories;
      });
      setDisplayData(weeks.map(w => ({ label: `Week ${w.week}`, calories: w.calories, photos: [] })));
      return;
    }

    if (viewType === 'month') {
      const months: Record<string, number> = {};
      allData.forEach(item => {
        const d = parseDate(item.date);
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        months[key] = (months[key] || 0) + item.calories;
      });
      setDisplayData(Object.entries(months).map(([label, calories]) => ({ label, calories, photos: [] })));
      return;
    }

    if (viewType === 'year') {
      const years: Record<string, number> = {};
      allData.forEach(item => {
        const d = parseDate(item.date);
        const key = String(d.getFullYear());
        years[key] = (years[key] || 0) + item.calories;
      });
      setDisplayData(Object.entries(years).map(([label, calories]) => ({ label, calories, photos: [] })));
      return;
    }
  }, [viewType, allData]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 6 }}>Loading history…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>History</Text>

      {/* Toggle buttons */}
      <View style={styles.buttonsContainer}>
        {(['day', 'week', 'month', 'year'] as const).map(type => (
          <TouchableOpacity
            key={type}
            style={[styles.button, viewType === type && styles.activeButton]}
            onPress={() => setViewType(type)}
          >
            <Text style={styles.buttonText}>{type.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List of entries */}
      <FlatList
        data={displayData}
        keyExtractor={(_, idx) => String(idx)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.date}>{item.label}</Text>
              <Text style={styles.calories}>{item.calories} cal</Text>

              {/* Thumbnails */}
              {item.photos?.length ? (
                <View style={styles.photoRow}>
                  {item.photos.slice(0, 4).map((url: string, idx: number) => (
                    <Image key={idx} source={{ uri: url }} style={styles.thumb} />
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No data available</Text>}
        contentContainerStyle={{ padding: 16, paddingTop: 6 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, alignItems: 'center', paddingTop: 12, backgroundColor: '#fff' },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    paddingHorizontal: 20,
    paddingBottom: 8,
    alignSelf: 'stretch',
  },
  buttonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16, alignSelf: 'stretch', paddingHorizontal: 16 },
  button: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#eee' },
  activeButton: { backgroundColor: '#5B21B6' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    alignSelf: 'stretch',
    // shadow
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  date: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  calories: { fontSize: 16, color: '#4CAF50', marginBottom: 6 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  thumb: { width: 60, height: 60, borderRadius: 8 },
  empty: { textAlign: 'center', marginTop: 50, fontSize: 16, color: '#888' },
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