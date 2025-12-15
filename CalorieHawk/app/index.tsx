import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  Image,
} from "react-native";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import { auth } from "../FireBaseConfig";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { useTheme } from "./ThemeContext"; // 👈 usamos tu nuevo context global

WebBrowser.maybeCompleteAuthSession();

// --- Redirect URIs for Google Sign-In
const redirectUri = AuthSession.makeRedirectUri({
  scheme: "caloriehawk",
});

const finalRedirectUri =
  Constants.appOwnership === "expo"
    ? `https://auth.expo.dev/@koo24444/CalorieHawk`
    : redirectUri;

console.log("REDIRECT URI:", finalRedirectUri);

export default function Login() {
  // --- Global Theme Context
  const { theme, mode, toggleTheme } = useTheme();

  // --- States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signUpVisible, setSignUpVisible] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  // --- Firebase Google Auth
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId:
      "872994424947-ro4btdk72viqgoh5h4nqr3bluh1ctlvr.apps.googleusercontent.com",
    iosClientId:
      "872994424947-l4hp1g84blq35emc8krc3i03ae8ich30.apps.googleusercontent.com",
    androidClientId:
      "872994424947-7mvtrcc7h1np74d6vouk8qjft25cgl5q.apps.googleusercontent.com",
    redirectUri: finalRedirectUri,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential)
        .then(() => router.replace("/(tabs)/one"))
        .catch((error) =>
          Alert.alert("Google Sign-In failed", error.message)
        );
    }
  }, [response]);

  // --- Login
  const handleLogin = async () => {
    try {
      const user = await signInWithEmailAndPassword(auth, email, password);
      if (user) router.replace("/(tabs)/one");
    } catch (error: any) {
      Alert.alert("Login failed", error.message);
    }
  };

  // --- Forgot Password
  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert("Enter your email", "Please type your email to reset it.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert("Password reset", "Check your email inbox 📩");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  // --- Sign Up
  const handleSignUp = async (signupEmail: string, signupPassword: string) => {
    try {
      const user = await createUserWithEmailAndPassword(
        auth,
        signupEmail,
        signupPassword
      );
      if (user) {
        Alert.alert("Success", "Account created!");
        setSignUpVisible(false);
        router.replace("/(tabs)/one");
      }
    } catch (error: any) {
      if (error.code === "auth/email-already-in-use") {
        Alert.alert(
          "Sign Up failed",
          "This email is already registered. Try logging in."
        );
      } else {
        Alert.alert("Sign Up failed", error.message);
      }
    }
  };

  // --- UI ---
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Dark/Light Mode Button */}
      <Pressable
        onPress={toggleTheme}
        style={{ alignSelf: "center", marginBottom: 20 }}
      >
        <Text style={{ color: theme.tint }}>
          Switch to {mode === "dark" ? "Light" : "Dark"} Mode
        </Text>
      </Pressable>

      <Text style={[styles.title, { color: theme.text }]}>CalorieHawk</Text>

      {/* --- Login form --- */}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.inputBackground,
            color: theme.text,
            borderColor: mode === "dark" ? "#333" : "#ccc",
          },
        ]}
        placeholder="Email"
        placeholderTextColor={mode === "dark" ? "#aaa" : "#666"}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
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
        placeholder="Password"
        placeholderTextColor={mode === "dark" ? "#aaa" : "#666"}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable
        style={[styles.button, { backgroundColor: theme.button }]}
        onPress={handleLogin}
      >
        <Text style={styles.buttonText}>Login</Text>
      </Pressable>

      <Pressable onPress={handleForgotPassword}>
        <Text style={[styles.link, { color: theme.tint }]}>
          Forgot Password?
        </Text>
      </Pressable>

      <View style={styles.divider} />

      {/* --- Google Sign In --- */}
      <Pressable
        disabled={!request}
        onPress={() => promptAsync()}
        style={styles.googleButton}
      >
        <View style={styles.googleContent}>
          <Image
            source={require("../assets/images/google-icon.png")}
            style={styles.googleIcon}
          />
          <Text style={styles.googleText}>Sign in with Google</Text>
        </View>
      </Pressable>

      <Pressable onPress={() => setSignUpVisible(true)}>
        <Text style={[styles.link, { color: theme.tint }]}>
          Don’t have an account? Sign up
        </Text>
      </Pressable>

      {/* --- Sign Up Modal --- */}
      <Modal
        animationType="slide"
        transparent
        visible={signUpVisible}
        onRequestClose={() => setSignUpVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.inputBackground },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Create Account
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  color: theme.text,
                  borderColor: mode === "dark" ? "#333" : "#ccc",
                },
              ]}
              placeholder="Email"
              placeholderTextColor={mode === "dark" ? "#aaa" : "#666"}
              autoCapitalize="none"
              keyboardType="email-address"
              value={signupEmail}
              onChangeText={setSignupEmail}
            />
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  color: theme.text,
                  borderColor: mode === "dark" ? "#333" : "#ccc",
                },
              ]}
              placeholder="Password"
              placeholderTextColor={mode === "dark" ? "#aaa" : "#666"}
              secureTextEntry
              value={signupPassword}
              onChangeText={setSignupPassword}
            />

            <Pressable
              style={[styles.button, { backgroundColor: theme.button }]}
              onPress={() => handleSignUp(signupEmail, signupPassword)}
            >
              <Text style={styles.buttonText}>Sign Up</Text>
            </Pressable>

            <Pressable onPress={() => setSignUpVisible(false)}>
              <Text style={[styles.link, { color: theme.tint }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20 },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  button: { padding: 14, borderRadius: 8, marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "600", textAlign: "center" },
  link: { textAlign: "center", marginTop: 16 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: { width: "85%", padding: 20, borderRadius: 12 },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  googleButton: {
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  googleContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  googleIcon: { width: 20, height: 20, marginRight: 10 },
  googleText: { color: "#000", fontWeight: "600", fontSize: 15 },
  divider: {
    height: 1,
    backgroundColor: "#ccc",
    marginVertical: 18,
    opacity: 0.4,
  },
});
