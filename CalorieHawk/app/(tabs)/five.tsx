import React, { useEffect } from "react";
import { View, Button, Text, Alert, StyleSheet } from "react-native";
import {
  registerForPushNotificationsAsync,
  scheduleLocalNotification,
  scheduleDailyReminder,
  testNotificationNow,
} from "../../utils/pushNotifications";
import { useTheme } from "../ThemeContext"; 

export default function NotificationTest() {
  const { theme, mode } = useTheme(); 

  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  const sendLocalNotification = async () => {
    try {
      await scheduleLocalNotification(
        "🍎 Calorie Hawk Reminder",
        "Don't forget to log your meals today!",
        3
      );
      Alert.alert("Success", "Test notification scheduled! It will show in 3 seconds.");
    } catch (error) {
      console.error("Error scheduling notification:", error);
      Alert.alert("Error", "Failed to schedule notification");
    }
  };

  const setDailyReminder = async () => {
    try {
      await scheduleDailyReminder(
        "🍽️ Daily Calorie Log",
        "Time to log your meals for today!",
        19, // 7 PM
        0
      );
      Alert.alert("Success", "Daily reminder set for 7:00 PM!");
    } catch (error) {
      console.error("Error setting daily reminder:", error);
      Alert.alert("Error", "Failed to set daily reminder");
    }
  };

  const testQuickNotification = async () => {
    await testNotificationNow();
    Alert.alert("Test", "Quick test notification sent!");
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.background },
      ]}
    >
      <Text style={[styles.title, { color: theme.text }]}>
        🔔 Notification Test Screen
      </Text>

      <View style={styles.buttonContainer}>
        <Button
          title="Send Test Notification (3s)"
          onPress={sendLocalNotification}
          color={mode === "dark" ? theme.button : "#6c5ce7"}
        />
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title="Set Daily Reminder (7 PM)"
          onPress={setDailyReminder}
          color={mode === "dark" ? theme.button : "#6c5ce7"}
        />
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title="Quick Test Notification"
          onPress={testQuickNotification}
          color={mode === "dark" ? theme.button : "#6c5ce7"}
        />
      </View>

      <Text
        style={[
          styles.info,
          { color: mode === "dark" ? "#aaa" : "#666" },
        ]}
      >
        Test different types of local notifications that work offline without Expo Push Token.
      </Text>
    </View>
  );
}

// --- styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    gap: 15,
  },
  title: {
    fontSize: 20,
    marginBottom: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  buttonContainer: {
    width: "90%",
    marginVertical: 5,
  },
  info: {
    marginTop: 20,
    textAlign: "center",
  },
});
