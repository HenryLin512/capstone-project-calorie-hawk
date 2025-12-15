import React, { useEffect } from "react";
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/FireBaseConfig";
import { router } from "expo-router";
import { useTheme } from "../ThemeContext"; // 👈 usa tu contexto global

export default function SettingScreen() {
  const { theme, mode, setThemeMode } = useTheme(); // 👈 accedemos al tema global
  const [notification, setNotification] = React.useState(false);

  // 🔐 Detecta cambios de autenticación
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.replace("/"); // si se desloguea, vuelve al login
    });
    return () => unsub();
  }, []);

  // 🔓 Cerrar sesión
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error: any) {
      console.error("Logout failed:", error.message);
    }
  };

  // 🌙 Cambiar Dark/Light mode globalmente
  const toggleDarkMode = (value: boolean) => {
    setThemeMode(value ? "dark" : "light");
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Settings</Text>

      {/* --- Account --- */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.item}>
          <Text style={[styles.text, { color: theme.text }]}>Edit Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.item}>
          <Text style={[styles.text, { color: theme.text }]}>Change Password</Text>
        </TouchableOpacity>
      </View>

      {/* --- Preferences --- */}
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={[styles.text, { color: theme.text }]}>Dark Mode</Text>
          <Switch
            value={mode === "dark"}
            onValueChange={toggleDarkMode}
            thumbColor={mode === "dark" ? theme.tint : "#ccc"}
          />
        </View>
        <View style={styles.row}>
          <Text style={[styles.text, { color: theme.text }]}>Notification</Text>
          <Switch
            value={notification}
            onValueChange={setNotification}
            thumbColor={notification ? theme.tint : "#ccc"}
          />
        </View>
      </View>

      {/* --- Logout --- */}
      <View style={styles.section}>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={[styles.text, { color: "red" }]}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- Estilos ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  section: {
    marginBottom: 25,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 10,
  },
  text: {
    fontSize: 16,
  },
});
