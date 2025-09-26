import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Modal } from "react-native";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../FireBaseConfig";
import { router } from "expo-router";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signUpVisible, setSignUpVisible] = useState(false);

  // --- Login
  const handleLogin = async () => {
    try {
      const user = await signInWithEmailAndPassword(auth, email, password);
      if (user) {
        router.replace("/(tabs)/one");
      }
    } catch (error: any) {
      Alert.alert("Login failed", error.message);
    }
  };

  // --- Sign Up
  const handleSignUp = async (signupEmail: string, signupPassword: string) => {
    try {
      const user = await createUserWithEmailAndPassword(auth, signupEmail, signupPassword);
      if (user) {
        Alert.alert("Success", "Account created!");
        setSignUpVisible(false);
        router.replace("/(tabs)/one");
      }
    } catch (error: any) {
      if (error.code === "auth/email-already-in-use") {
        Alert.alert("Sign Up failed", "This email is already registered. Try logging in.");
      } else {
        Alert.alert("Sign Up failed", error.message);
      }
    }
  };

  // --- Sign Up form state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CalorieHawk</Text>

      {/* Login form */}
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

      <Pressable style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Login</Text>
      </Pressable>

      <Pressable onPress={() => setSignUpVisible(true)}>
        <Text style={styles.link}>Don’t have an account? Sign up</Text>
      </Pressable>

      {/* Sign Up Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={signUpVisible}
        onRequestClose={() => setSignUpVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Account</Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={signupEmail}
              onChangeText={setSignupEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              secureTextEntry
              value={signupPassword}
              onChangeText={setSignupPassword}
            />

            <Pressable style={styles.button} onPress={() => handleSignUp(signupEmail, signupPassword)}>
              <Text style={styles.buttonText}>Sign Up</Text>
            </Pressable>

            <Pressable onPress={() => setSignUpVisible(false)}>
              <Text style={styles.link}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#fff" },
  title: { fontSize: 32, fontWeight: "bold", textAlign: "center", marginBottom: 20 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: "#5B21B6", padding: 14, borderRadius: 8, marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "600", textAlign: "center" },
  link: { color: "#5B21B6", textAlign: "center", marginTop: 16 },

  modalBackdrop: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  modalCard: { backgroundColor: "#fff", width: "85%", padding: 20, borderRadius: 12 },
  modalTitle: { fontSize: 24, fontWeight: "bold", marginBottom: 16, textAlign: "center" },
});
