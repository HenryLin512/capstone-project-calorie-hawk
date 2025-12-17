import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import {
  onAuthStateChanged,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { auth } from "@/FireBaseConfig";
import { router } from "expo-router";
import { useTheme } from "../../utils/ThemeContext";

export default function SettingScreen() {
  const { theme, mode, setThemeMode } = useTheme();
  const [notification, setNotification] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // 🔐 Detecta cambios de autenticación
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.replace("/");
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

  // 🔑 Cambiar contraseña con reautenticación
  const handleChangePassword = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Error", "No user logged in");

    if (newPassword.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(
        user.email!,
        currentPassword
      );

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      Alert.alert("Success", "Your password has been updated ✅");
      setShowPasswordModal(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch (error: any) {
      if (error.code === "auth/wrong-password") {
        Alert.alert("Error", "The current password you entered is incorrect.");
      } else {
        Alert.alert("Error", error.message);
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Settings</Text>

      {/* --- Account --- */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.item}>
          <Text style={[styles.text, { color: theme.text }]}>Edit Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.item}
          onPress={() => setShowPasswordModal(true)}
        >
          <Text style={[styles.text, { color: theme.text }]}>
            Change Password
          </Text>
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
            trackColor={{ false: "#767577", true: theme.tint }}
          />
        </View>

        <View style={styles.row}>
          <Text style={[styles.text, { color: theme.text }]}>Notification</Text>
          <Switch
            value={notification}
            onValueChange={setNotification}
            thumbColor={notification ? theme.tint : "#ccc"}
            trackColor={{ false: "#767577", true: theme.tint }}
          />
        </View>
      </View>

      {/* --- Logout --- */}
      <View style={styles.section}>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={[styles.text, { color: "red", textAlign: "center" }]}>
            Log Out
          </Text>
        </TouchableOpacity>
      </View>

      {/* --- Modal para cambiar contraseña --- */}
      <Modal
        animationType="slide"
        transparent
        visible={showPasswordModal}
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalCard, { backgroundColor: theme.card }]}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Change Password
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBackground,
                  color: theme.text,
                  borderColor: mode === "dark" ? "#333" : "#ccc",
                },
              ]}
              placeholder="Current Password"
              placeholderTextColor={mode === "dark" ? "#888" : "#666"}
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBackground,
                  color: theme.text,
                  borderColor: mode === "dark" ? "#333" : "#ccc",
                },
              ]}
              placeholder="New Password"
              placeholderTextColor={mode === "dark" ? "#888" : "#666"}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />

            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.button }]}
              onPress={handleChangePassword}
            >
              <Text style={styles.buttonText}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
              <Text style={[styles.link, { color: theme.tint }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalCard: {
    width: "85%",
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  button: {
    padding: 14,
    borderRadius: 8,
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    textAlign: "center",
  },
  link: {
    textAlign: "center",
    marginTop: 12,
  },
});
