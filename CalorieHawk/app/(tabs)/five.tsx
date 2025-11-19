
import React, { useEffect } from 'react';
import { View, Button, Text, Alert } from 'react-native';
import { 
  registerForPushNotificationsAsync, 
  scheduleLocalNotification,
  scheduleDailyReminder,
  testNotificationNow 
} from '../../utils/pushNotifications'; // Adjust path as needed

export default function NotificationTest() {
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  const sendLocalNotification = async () => {
    try {
      await scheduleLocalNotification(
        '🍎 Calorie Hawk Reminder',
        "Don't forget to log your meals today!",
        3 // Show after 3 seconds
      );
      Alert.alert('Success', 'Test notification scheduled! It will show in 3 seconds.');
    } catch (error) {
      console.error('Error scheduling notification:', error);
      Alert.alert('Error', 'Failed to schedule notification');
    }
  };

  const setDailyReminder = async () => {
    try {
      await scheduleDailyReminder(
        '🍽️ Daily Calorie Log',
        'Time to log your meals for today!',
        19, // 7 PM
        0
      );
      Alert.alert('Success', 'Daily reminder set for 7:00 PM!');
    } catch (error) {
      console.error('Error setting daily reminder:', error);
      Alert.alert('Error', 'Failed to set daily reminder');
    }
  };

  const testQuickNotification = async () => {
    await testNotificationNow();
    Alert.alert('Test', 'Quick test notification sent!');
  };

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 20,
        gap: 15,
      }}
    >
      <Text style={{ fontSize: 20, marginBottom: 20, fontWeight: 'bold' }}>
        🔔 Notification Test Screen
      </Text>
      
      <Button 
        title="Send Test Notification (3s)" 
        onPress={sendLocalNotification} 
      />
      
      <Button 
        title="Set Daily Reminder (7 PM)" 
        onPress={setDailyReminder} 
      />
      
      <Button 
        title="Quick Test Notification" 
        onPress={testQuickNotification} 
      />

      <Text style={{ marginTop: 20, color: '#666', textAlign: 'center' }}>
        Test different types of local notifications that will work offline without Expo Push Token.
      </Text>
    </View>
  );
}