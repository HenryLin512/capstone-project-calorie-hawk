import React, { useMemo } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Image, TextInput, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Donut from '../../components/Donut'; // <-- exact path from app/(tabs) to components

export default function Dashboard() {
  // Demo values (wire to your state later)
  const dailyGoal = 2427;
  const eatenCalories = 1820;
  const remaining = Math.max(0, dailyGoal - eatenCalories);
  const remainingPct = remaining / dailyGoal;

  const meals = useMemo(
    () => [
      { label: 'Breakfast', eaten: 627, target: 730 },
      { label: 'Lunch', eaten: 760, target: 880 },
      { label: 'Dinner', eaten: 433, target: 862 },
    ],
    []
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      {/* Top bar: logo + search */}
      <View style={styles.topBar}>
        <View style={styles.logoBox}>
          <Image
            source={require('../../assets/images/main_logo.png')} // <-- keep this relative require
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput placeholder="Search foods" placeholderTextColor="#7A7A7A" style={styles.searchInput} />
        </View>
      </View>

      {/* Grey pill with big donut */}
      <View style={styles.pill}>
        <Donut size={180} strokeWidth={12} progress={remainingPct}>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.remainingTop}>{remaining}</Text>
            <Text style={styles.remainingLabel}>Remaining</Text>
            <View style={{ height: 6 }} />
            <Text style={styles.eatenValue}>{eatenCalories}</Text>
            <Text style={styles.eatenLabel}>Eaten Calories</Text>
          </View>
        </Donut>
      </View>

      {/* Meals row */}
      <View style={styles.mealRow}>
        {meals.map((m) => (
          <View key={m.label} style={styles.mealCol}>
            <Text style={styles.mealLabel}>{m.label}</Text>

            {/* Simple ring to match your outline; switch to <Donut> for progress */}
            <View style={styles.smallRing} />

            <Text style={styles.mealNumbers}>{m.eaten}/{m.target}</Text>

            <Pressable style={styles.addBtn} onPress={() => { /* open add-food flow */ }}>
              <Text style={styles.addBtnPlus}>＋</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={{ flex: 1 }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, marginTop: 4 },
  logoBox: { width: 54, height: 54, borderWidth: 1, borderColor: '#B7A8CE', borderRadius: 4, alignItems: 'center', justifyContent: 'center', padding: 4 },
  logo: { width: '100%', height: '100%' },
  searchWrap: { flex: 1, height: 34, borderWidth: 1, borderColor: '#3B3B3B', borderRadius: 17, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: { flex: 1, height: '100%', fontSize: 14, color: '#1A1A1A' },

  pill: { marginTop: 24, marginHorizontal: 16, paddingVertical: 28, alignItems: 'center', backgroundColor: '#DEDEDE', borderRadius: 200 },
  remainingTop: { fontSize: 20, fontWeight: '600', color: '#1A1A1A' },
  remainingLabel: { fontSize: 12, color: '#1A1A1A' },
  eatenValue: { fontSize: 16, color: '#1A1A1A' },
  eatenLabel: { fontSize: 12, color: '#1A1A1A' },

  mealRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 36, paddingHorizontal: 16 },
  mealCol: { alignItems: 'center', width: '30%', gap: 10 },
  mealLabel: { fontSize: 14, color: '#1A1A1A', marginBottom: 2 },

  smallRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 6, borderColor: '#000', backgroundColor: '#FFF' },
  mealNumbers: { fontSize: 12, color: '#4B4B4B' },

  addBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E0E0', borderWidth: 1, borderColor: '#9B9B9B', alignItems: 'center', justifyContent: 'center' },
  addBtnPlus: { fontSize: 16, lineHeight: 16, color: '#2A2A2A', marginTop: -2 },
});