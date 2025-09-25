import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { auth } from "../FireBaseConfig";
import { router } from "expo-router";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);

  // 👇 Auto-redirect if already signed in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/(tabs)/one");
      }
      setChecking(false);
    });
    return () => unsub();
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#5B21B6" />
      </View>
    );
  }

  const Login = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      Alert.alert("Welcome back!");
      router.replace("/(tabs)/one"); // 👈 send to actual tab screen
    } catch (error: any) {
      Alert.alert("Login Unsuccessful", error.message);
    }
  };

  const SignUp = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      Alert.alert("Success", "Account created!");
      router.replace("/(tabs)/one"); // 👈 send here too
    } catch (error: any) {
      Alert.alert("SignUp Unsuccessful", error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CalorieHawk Login</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable style={styles.button} onPress={Login}>
        <Text style={styles.buttonText}>Login</Text>
      </Pressable>

      <Pressable style={[styles.button, { backgroundColor: "#aaa" }]} onPress={SignUp}>
        <Text style={styles.buttonText}>Sign Up</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 20, textAlign: "center" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: "#5B21B6", padding: 14, borderRadius: 8, marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "600", textAlign: "center" },
});