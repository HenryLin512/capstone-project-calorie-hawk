import { StyleSheet, TextInput, FlatList, TouchableOpacity, Text, SafeAreaView, View } from 'react-native';
import React, { useState, useEffect } from 'react';
import { db } from '../../FireBaseConfig';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy, DocumentData } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

//some sample data to test

  //month Name
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  //Make other OS can display "/" instead of "-" in time
  const parseDate = (dateStr: string) =>{
    const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
    const year = parseInt (parts[0], 10);
    const month = parseInt (parts[1], 10) - 1; 
    const day = parseInt (parts[2], 10);
    return new Date(year, month, day);
  }


export default function TabThreeScreen() {
  //const [history, setHistory] = useState([]);
  //const auth = getAuth();

  const [viewType, setViewType] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [displayData, setDisplayData] = useState<any[]>([]);
  const [allData, setAllData] = useState<any[]>([]);

  const auth = getAuth();
  const user = auth.currentUser;
  //const user = auth.currentUser;

  //fetch from Firestore
  useEffect(() => {
    const fetchData = async () => {
      if (!user) 
        return;
      try {
        const userID = auth.currentUser.uid;
        const q = collection(db, "users", user?.uid, "calories");
        const snapshot = await getDocs(q);

        //const data = snapshot.docs.map(doc => doc.data());
        //let data: any[] = []; // an array can hold anything (object, strings, numbers, etc.)
        // Map date -> total calories for that day
        const dataMap: { [date: string]: number } = {};

        snapshot.docs.forEach(docSnap => 
          {
          const entries = docSnap.data().entries || [];
          const totalKcal = entries.reduce((sum: number, entry: any) => sum + entry.kcal, 0)
          // entries.forEach((entry: any) => 
          //   {
          //   data.push({
          //     date: docSnap.id,
          //     calories: entry.kcal,
          //   });
          // });
          dataMap[docSnap.id] = totalKcal;
        });

        const data = Object.entries(dataMap).map(([date, calories]) => ({ date, calories}));
        setAllData(data); // save all raw entries
      } catch (error) {
        console.error("Error fetching calories:", error);
      }
    };

    fetchData();
  }, [user]);

  // recalc display data whenever viewType or allData changes
  useEffect(() => {
    calculateDisplayData();
  }, [viewType, allData]);
  
  const calculateDisplayData = () => {
    if(allData.length === 0)
    {
      setDisplayData([]);
      return;
    }

    //day display
    if (viewType === 'day') 
      {
      setDisplayData(allData.map(item => {
        const dateObj = parseDate(item.date);
        return {
          label: `${dateObj.getDate()} / ${dateObj.getMonth() + 1} / ${dateObj.getFullYear()}`,
          calories: item.calories,
        };
      }));

    //week display
    } else if (viewType === 'week') {
      let weeks: { week: number, calories: number }[] = [];
      allData.forEach((item, index) => {
        const weekIndex = Math.floor(index / 7);
        if (!weeks[weekIndex]) 
          weeks[weekIndex] = { week: weekIndex + 1, calories: 0 };
        weeks[weekIndex].calories += item.calories;
      });

      setDisplayData(weeks.map(w => ({ label: `Week ${w.week}`, calories: w.calories })));

    //month display
    } else if (viewType === 'month') {
      const months: { [key: string]: number } = {};

      allData.forEach(item => {
        const dateObj = parseDate(item.date);
        const monthName = monthNames[dateObj.getMonth()]; // get month name
        const key = `${monthName} ${dateObj.getFullYear()}`; // e.g., "September 2025"

        if (!months[key]) 
          months[key] = 0;
        months[key] += item.calories;
      });

      setDisplayData(Object.entries(months).map(([key, calories]) => ({ label: key, calories })));

    //year display
    } else if (viewType === 'year') {
      const years: { [key: string]: number } = {};
      allData.forEach(item => {
        const dateObj = parseDate(item.date);
        const key = `${dateObj.getFullYear()}`;

        if (!years[key]) 
          years[key] = 0;
        years[key] += item.calories;
      });
      setDisplayData(Object.entries(years).map(([key, calories]) => ({ label: key, calories })));
    }
  };


  return (
     <View style={styles.container}>
      <View style={styles.buttonsContainer}>
        {['day', 'week', 'month', 'year'].map(type => (
          <TouchableOpacity
            key={type}
            style={[styles.button, viewType === type && styles.activeButton]}
            onPress={() => setViewType(type as any)}
          >
            <Text style={styles.buttonText}>{type.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={displayData}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.date}>{item.label}</Text>
            <Text style={styles.calories}>{item.calories} cal</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No data available</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    //justifyContent: 'center',
    padding: 20,
    backgroundColor: "#fff",
  },

  buttonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  button: { padding: 8, borderRadius: 8, backgroundColor: '#eee' },
  activeButton: { backgroundColor: '#4CAF50' },
  buttonText: { color: '#000', fontWeight: 'bold' },
  // row: { flexDirection: 'row', justifyContent: 'space/between', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#ddd' },
  
  card: 
  { backgroundColor: '#fff', 
    borderRadius: 10, 
    padding: 16, 
    marginBottom: 12, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    // Shadow for IOS
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 3 },
    //Elevation for Android
    elevation: 3,
  },

  date: { fontSize: 20 },
  calories: { fontSize: 20, fontWeight: 'bold', color: '#4CAF50', marginLeft: 20 },
  empty: { textAlign: 'center', marginTop: 50, fontSize: 16, color: '#888' },
});


