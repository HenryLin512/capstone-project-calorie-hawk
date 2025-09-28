import { View, Text, Switch, TouchableOpacity, StyleSheet } from "react-native";
import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/FireBaseConfig"; // adjust path if needed
import { router } from "expo-router";

export default function SettingScreen() {
  const [isDarkMode, setDarkmode] = useState(false);
  const [notification, setNotification] = useState(false);

  // watch for auth changes, redirect if user logs out
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/"); // go back to login (index)
      }
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // onAuthStateChanged will handle the redirect
    } catch (error: any) {
      console.error("Logout failed:", error.message);
    }
  };

  return (
    <View style={styles.container}>
      {/*<Text style={[styles.title, ]}>Settings</Text>*/}

      {/* Account */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.item}>
          <Text style={styles.text}>Edit Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.item}>
          <Text style={styles.text}>Change Password</Text>
        </TouchableOpacity>
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={styles.text}>Dark Mode</Text>
        <Switch value={isDarkMode} onValueChange={setDarkmode} />
      </View>
      <View style={styles.section}>
        <Text style={styles.text}>Notification</Text>
        <Switch value={notification} onValueChange={setNotification} />
      </View>

      {/* Log out */}
      <View style={styles.section}>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={[styles.text, { color: "red" }]}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
  },
  section: { marginBottom: 20 },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  text: { fontSize: 16 },
});
