import React, { useMemo, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import Donut from '../../components/Donut';

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

type MealLabel = string; // allow custom labels

type Entry = {
  id: string;
  kcal: number;
  photoUri?: string;
  timestamp: number;
  meal: MealLabel;
};

type Meal = {
  label: MealLabel;
  target: number;   // optional per-meal target
  entries: Entry[];
};

const initialMeals: Meal[] = [
  { label: 'Breakfast', target: 635, entries: [] },
  { label: 'Lunch',     target: 847, entries: [] },
  { label: 'Dinner',    target: 529, entries: [] },
  { label: 'Snacks',    target: 106, entries: [] },
  { label: 'Other',     target: 0,   entries: [] }, // new default bucket
];

export default function Dashboard() {
  // ---- State
  const [meals, setMeals] = useState<Meal[]>(initialMeals);
  const [dailyGoal, setDailyGoal] = useState<number>(2427);
  const [burned, setBurned] = useState<number>(244); // placeholder UI value

  const eatenCalories = useMemo(
    () => meals.reduce((sum, m) => sum + m.entries.reduce((a, e) => a + e.kcal, 0), 0),
    [meals]
  );
  const remaining = Math.max(0, dailyGoal - eatenCalories);
  const remainingPct = dailyGoal === 0 ? 0 : remaining / dailyGoal;

  // ---- Add Entry Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [activeMeal, setActiveMeal] = useState<MealLabel>('Dinner');
  const [entryKcal, setEntryKcal] = useState<string>('500');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);

  // ---- Add Label Modal
  const [labelModal, setLabelModal] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  // derive the list of chips = built-ins + any custom labels user added
  const chipLabels: MealLabel[] = useMemo(() => {
    const builtIns = ['Breakfast', 'Lunch', 'Snacks', 'Dinner', 'Other'];
    const dynamic = meals.map(m => m.label);
    return Array.from(new Set([...builtIns, ...dynamic]));
  }, [meals]);

  const openAdd = (meal?: MealLabel) => {
    setActiveMeal(meal ?? 'Dinner');
    setEntryKcal('500');
    setPhotoUri(undefined);
    setModalVisible(true);
  };

  const saveEntry = () => {
    const kcal = Number(entryKcal || 0);
    if (!kcal) {
      setModalVisible(false);
      return;
    }
    const id = Math.random().toString(36).slice(2);
    const newEntry: Entry = { id, kcal, photoUri, timestamp: Date.now(), meal: activeMeal };

    // if the meal label doesn't exist yet, create it with a small default target
    setMeals(prev => {
      const exists = prev.some(m => m.label.toLowerCase() === activeMeal.toLowerCase());
      const updated = exists
        ? prev.map(m => (m.label.toLowerCase() === activeMeal.toLowerCase()
            ? { ...m, entries: [newEntry, ...m.entries] }
            : m))
        : [{ label: activeMeal, target: 300, entries: [newEntry] }, ...prev];
      return updated;
    });

    setModalVisible(false);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  // Add a new label from the "Add label" modal
  const addNewLabel = () => {
    const name = newLabel.trim();
    if (!name) return;
    const exists = meals.some(m => m.label.toLowerCase() === name.toLowerCase());
    if (exists) {
      Alert.alert('Label exists', `"${name}" already exists.`);
      return;
    }
    setMeals(prev => [{ label: name, target: 300, entries: [] }, ...prev]);
    setActiveMeal(name);
    setNewLabel('');
    setLabelModal(false);
  };

  // Macro bars (UI only for now)
  const macros = [
    { key: 'Carbs',   value: 206, goal: 258 },
    { key: 'Protein', value: 35,  goal: 103 },
    { key: 'Fat',     value: 32,  goal: 68  },
  ];

  const todayStr = new Date().toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      {/* Header with Hawk logo + Today + Settings */}
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
        <Pressable onPress={() => router.push('/setting')}>
          <Ionicons name="settings-outline" size={22} color={COLORS.subtext} />
        </Pressable>
      </View>

      {/* Summary Card */}
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

        {/* Macro bars */}
        <View style={styles.macrosRow}>
          {macros.map((m) => {
            const pct = Math.min(1, m.value / m.goal);
            return (
              <View key={m.key} style={styles.macroCol}>
                <Text style={styles.macroKey}>{m.key}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${pct * 100}%`, backgroundColor: m.key === 'Protein' ? COLORS.orange : COLORS.gold },
                    ]}
                  />
                </View>
                <Text style={styles.macroNums}>{m.value} / {m.goal} g</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Meals list */}
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

      {/* Floating add button */}
      <Pressable style={styles.fab} onPress={() => openAdd('Dinner')}>
        <Text style={styles.fabPlus}>＋</Text>
      </Pressable>

      {/* Add Entry Modal (bottom sheet style) */}
      {modalVisible && (
        <Modal
          visible
          animationType="slide"
          transparent
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setModalVisible(false)}
          onDismiss={() => setPhotoUri(undefined)}
        >
          <View style={styles.modalBackdrop}>
            {/* Tap outside to close (prevents stuck overlay) */}
            <Pressable style={{ flex: 1 }} onPress={() => setModalVisible(false)} />

            {/* Bottom sheet */}
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

              {/* Meal selector chips + add label */}
              <View style={styles.chipsRow}>
                {chipLabels.map(lbl => {
                  const active = activeMeal.toLowerCase() === lbl.toLowerCase();
                  return (
                    <Pressable
                      key={lbl}
                      onPress={() => setActiveMeal(lbl)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{lbl}</Text>
                    </Pressable>
                  );
                })}
                <Pressable style={[styles.chip, styles.chipAdd]} onPress={() => setLabelModal(true)}>
                  <Ionicons name="add" size={16} color={COLORS.purple} />
                  <Text style={[styles.chipText, { color: COLORS.purple, marginLeft: 4 }]}>Add label</Text>
                </Pressable>
              </View>

              {/* Big calorie display */}
              <View style={styles.kcalWrap}>
                <Text style={styles.kcalText}>{entryKcal || 0}</Text>
                <Text style={styles.kcalUnit}>kcal</Text>
              </View>

              {/* Quick suggestions + photo */}
              <View style={styles.suggestionsRow}>
                {[300, 500, 700].map(v => (
                  <Pressable key={v} style={styles.suggestion} onPress={() => setEntryKcal(String(v))}>
                    <Text style={styles.suggestionText}>{v}</Text>
                    <Text style={styles.suggestionUnit}>kcal</Text>
                  </Pressable>
                ))}
                <Pressable style={styles.photoBtn} onPress={pickImage}>
                  <Ionicons name="image-outline" size={22} color={COLORS.text} />
                </Pressable>
              </View>

              {/* Keypad */}
              <View style={styles.keypad}>
                {['1','2','3','4','5','6','7','8','9','←','0','✓'].map(key => (
                  <Pressable
                    key={key}
                    style={[styles.key, key==='✓' && styles.keyConfirm]}
                    onPress={() => {
                      if (key === '←') setEntryKcal(prev => prev.slice(0, -1));
                      else if (key === '✓') saveEntry();
                      else setEntryKcal(prev => (prev + key).replace(/^0+(?!$)/, ''));
                    }}
                  >
                    <Text style={[styles.keyText, key==='✓' && styles.keyTextConfirm]}>{key}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Photo preview */}
              {photoUri ? (
                <View style={{ marginTop: 12, alignItems: 'center' }}>
                  <Image source={{ uri: photoUri }} style={{ width: 120, height: 120, borderRadius: 10 }} />
                </View>
              ) : null}
            </View>
          </View>
        </Modal>
      )}


      {/* Add Label Modal */}
      <Modal visible={labelModal} transparent animationType="fade" onRequestClose={() => setLabelModal(false)}>
        <View style={styles.centerModalBackdrop}>
          <View style={styles.centerCard}>
            <Text style={styles.centerTitle}>New meal label</Text>
            <TextInput
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="e.g., Pre-workout"
              placeholderTextColor={COLORS.subtext}
              style={styles.centerInput}
            />
            <View style={styles.centerRow}>
              <Pressable style={[styles.centerBtn, { backgroundColor: '#EEE' }]} onPress={() => setLabelModal(false)}>
                <Text style={[styles.centerBtnText, { color: COLORS.text }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.centerBtn, { backgroundColor: COLORS.purple }]} onPress={addNewLabel}>
                <Text style={[styles.centerBtnText, { color: '#FFF' }]}>Add</Text>
              </Pressable>
            </View>
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
  remaining: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  remainingLabel: { fontSize: 12, color: COLORS.subtext },

  macrosRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  macroCol: { flex: 1, marginHorizontal: 6 },
  macroKey: { fontSize: 12, color: COLORS.text, marginBottom: 6 },
  barTrack: { width: '100%', height: 6, backgroundColor: COLORS.blueTrack, borderRadius: 9999 },
  barFill: { height: 6, borderRadius: 9999, width: '50%' },
  macroNums: { fontSize: 11, color: COLORS.subtext, marginTop: 6, textAlign: 'right' },

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
  sheet: { backgroundColor: COLORS.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: Platform.OS === 'ios' ? 22 : 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  sheetCancel: { color: COLORS.subtext, fontSize: 16 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  sheetSave: { color: COLORS.purple, fontSize: 16, fontWeight: '700' },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: COLORS.purpleLight },
  chipActive: { backgroundColor: COLORS.purple },
  chipText: { color: COLORS.text, fontSize: 13 },
  chipTextActive: { color: '#fff' },
  chipAdd: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2EFFF' },

  kcalWrap: { alignItems: 'center', marginTop: 8, marginBottom: 10 },
  kcalText: { fontSize: 44, fontWeight: '800', color: COLORS.text },
  kcalUnit: { fontSize: 14, color: COLORS.subtext },

  suggestionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  suggestion: { backgroundColor: COLORS.goldLight, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  suggestionText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  suggestionUnit: { fontSize: 11, color: COLORS.subtext },
  photoBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.mutedBg, alignItems: 'center', justifyContent: 'center' },

  keypad: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 10, gap: 8, justifyContent: 'center' },
  key: { width: '30%', maxWidth: 120, aspectRatio: 1.5, borderRadius: 12, backgroundColor: '#F2F5FA', alignItems: 'center', justifyContent: 'center' },
  keyConfirm: { backgroundColor: COLORS.orange },
  keyText: { fontSize: 22, color: COLORS.text },
  keyTextConfirm: { color: '#fff', fontWeight: '800' },

  // center modal (add label)
  centerModalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  centerCard: { width: '86%', maxWidth: 420, backgroundColor: COLORS.paper, borderRadius: 16, padding: 16 },
  centerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  centerInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text },
  centerRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  centerBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  centerBtnText: { fontSize: 14, fontWeight: '700' },
});
