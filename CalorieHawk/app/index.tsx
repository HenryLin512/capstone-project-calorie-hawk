import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../FireBaseConfig";
import { router } from "expo-router";
import { useTheme } from "../utils/ThemeContext"; // ✅ Global theme context
import { createUserProfile } from "../utils/createUserProfile"; //Create a user profile for new user

export default function Login() {
  // --- Global Theme Context
  const { theme, mode, toggleTheme } = useTheme();

  // --- States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signUpVisible, setSignUpVisible] = useState(false);
  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  // --- Password validation ---
  const validatePassword = (password: string) => {
    const errors = [];

    if (password.length < 8 || password.length > 16)
      errors.push("Password must be 8–16 characters long.");
    if (!/[A-Z]/.test(password)) errors.push("At least one uppercase letter required.");
    if (!/[a-z]/.test(password)) errors.push("At least one lowercase letter required.");
    if (!/[0-9]/.test(password)) errors.push("At least one number required.");
    if (!/[!@#$%^&*(),.?\":{}|<>]/.test(password))
      errors.push("At least one special symbol required (!@#$...).");

    return errors;
  };

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
    if (!forgotEmail) {
      Alert.alert("Email required", "Please enter your email address.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, forgotEmail);
      Alert.alert("Password reset email sent", "Please check your inbox 📩");
      setForgotPasswordVisible(false);
      setForgotEmail("");
    } catch (error: any) {
      if (error.code === "auth/user-not-found") {
        Alert.alert("Email not found", "No account exists with this email address.");
      } else if (error.code === "auth/invalid-email") {
        Alert.alert("Invalid email", "Please enter a valid email address.");
      } else {
        Alert.alert("Error", error.message);
      }
    }
  };

  // --- Sign Up
  const handleSignUp = async (signupEmail: string, signupPassword: string) => {
    const validationErrors = validatePassword(signupPassword);
    if (validationErrors.length > 0) {
      Alert.alert("Weak password", validationErrors.join("\n"));
      return;
    }

    try {
      const user = await createUserWithEmailAndPassword(
        auth,
        signupEmail,
        signupPassword
      );
      if (user) {
        await createUserProfile(user.user); // create Firestore user profile
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
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Pressable
          onPress={toggleTheme}
          style={{ alignSelf: "center", marginBottom: 20 }}
        >
          <Text style={{ color: theme.tint }}>
            Switch to {mode === "dark" ? "Light" : "Dark"} Mode
          </Text>
        </Pressable>

        <Text style={[styles.title, { color: theme.text }]}>CalorieHawk</Text>

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

        <Pressable onPress={() => setForgotPasswordVisible(true)}>
          <Text style={[styles.link, { color: theme.tint }]}>
            Forgot Password?
          </Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable onPress={() => setSignUpVisible(true)}>
          <Text style={[styles.link, { color: theme.tint }]}>
            Don't have an account? Sign up
          </Text>
        </Pressable>

        {/* Forgot Password Modal */} 
        <Modal
          animationType="slide"
          transparent
          visible={forgotPasswordVisible}
          onRequestClose={() => setForgotPasswordVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalBackdrop}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={[
                styles.modalCard,
                {
                  backgroundColor: theme.inputBackground,
                  marginTop: 120, // Changed from 50 to 120 to move it lower
                }
              ]}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Reset Password
                </Text>

                <Text style={[styles.modalDescription, { color: theme.text }]}>
                  Enter your email address and we'll send you a link to reset your password.
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
                  placeholder="Email address"
                  placeholderTextColor={mode === "dark" ? "#aaa" : "#666"}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  autoFocus
                />

                <Pressable
                  style={[styles.button, { backgroundColor: theme.button }]}
                  onPress={handleForgotPassword}
                >
                  <Text style={styles.buttonText}>Send Reset Email</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setForgotPasswordVisible(false);
                    setForgotEmail("");
                  }}
                  style={{ marginTop: 16 }}
                >
                  <Text style={[styles.link, { color: theme.tint }]}>Cancel</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>

        {/* Sign Up Modal - Also adjusted to match the same position */}
        <Modal
          animationType="slide"
          transparent
          visible={signUpVisible}
          onRequestClose={() => setSignUpVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalBackdrop}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={[
                styles.modalCard,
                {
                  backgroundColor: theme.inputBackground,
                  marginTop: 120, // Changed from 50 to 120 to match the forgot password modal
                }
              ]}>
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

                <View style={{ marginVertical: 8 }}>
                  <Text style={{ fontWeight: "600", color: theme.text }}>
                    Password must include:
                  </Text>
                  {[
                    { label: "8–16 characters", valid: signupPassword.length >= 8 && signupPassword.length <= 16 },
                    { label: "At least 1 uppercase letter", valid: /[A-Z]/.test(signupPassword) },
                    { label: "At least 1 lowercase letter", valid: /[a-z]/.test(signupPassword) },
                    { label: "At least 1 number", valid: /[0-9]/.test(signupPassword) },
                    { label: "At least 1 symbol (!@#$%)", valid: /[!@#$%^&*(),.?\":{}|<>]/.test(signupPassword) },
                  ].map((rule, index) => (
                    <View key={index} style={{ flexDirection: "row", alignItems: "center", marginVertical: 2 }}>
                      <Text style={{ color: rule.valid ? "green" : mode === "dark" ? "#aaa" : "#666" }}>
                        {rule.valid ? "✅" : "•"} {rule.label}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={{ height: 30 }} />

                <Pressable
                  style={[styles.button, { backgroundColor: theme.button }]}
                  onPress={() => handleSignUp(signupEmail, signupPassword)}
                >
                  <Text style={styles.buttonText}>Sign Up</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setSignUpVisible(false);
                  }}
                  style={{ marginTop: 16 }}
                >
                  <Text style={[styles.link, { color: theme.tint }]}>Cancel</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20
  },
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
  button: {
    padding: 14,
    borderRadius: 8,
    marginTop: 10
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    textAlign: "center"
  },
  link: {
    textAlign: "center",
    marginTop: 16
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    width: "85%",
    padding: 20,
    borderRadius: 12,
    marginTop: 50,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  modalDescription: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    opacity: 0.8,
  },
  divider: {
    height: 1,
    backgroundColor: "#ccc",
    marginVertical: 18,
    opacity: 0.4,
  },
});