
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

// Set the notification behavior when received
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  console.log('Setting up for local notifications testing');

  // Request permissions
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    alert('Failed to get notification permissions!');
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return "local-notification-enabled";
}

// New function to schedule local notifications
export async function scheduleLocalNotification(
  title: string,
  body: string,
  seconds: number = 5
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title,
        body: body,
        sound: 'default',
      },
      trigger: {
        type: 'timeInterval', // ✅ Required
        seconds: seconds,
        repeats: false,
      } as Notifications.TimeIntervalTriggerInput,
    });
    console.log('Notification scheduled successfully');
  } catch (error) {
    console.error('Error scheduling notification:', error);
  }
}

// New function to schedule daily reminder
export async function scheduleDailyReminder(
  title: string,
  body: string,
  hour: number,
  minute: number = 0
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title,
        body: body,
        sound: 'default',
      },
      trigger: {
        type: 'daily', // ✅ Required
        hour: hour,
        minute: minute,
        repeats: true,
      } as Notifications.DailyTriggerInput,
    });
    console.log('Daily reminder scheduled successfully');
  } catch (error) {
    console.error('Error scheduling daily reminder:', error);
  }
}

// Function to schedule weekly reminder
export async function scheduleWeeklyReminder(
  title: string,
  body: string,
  weekday: number, // 1-7 (Sunday = 1, Monday = 2, etc.)
  hour: number,
  minute: number = 0
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title,
        body: body,
        sound: 'default',
      },
      trigger: {
        type: 'weekly', // ✅ Required
        weekday: weekday,
        hour: hour,
        minute: minute,
        repeats: true,
      } as Notifications.WeeklyTriggerInput,
    });
    console.log('Weekly reminder scheduled successfully');
  } catch (error) {
    console.error('Error scheduling weekly reminder:', error);
  }
}

// Function to schedule exact date notification
export async function scheduleDateNotification(
  title: string,
  body: string,
  date: Date
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title,
        body: body,
        sound: 'default',
      },
      trigger: {
        type: 'date', // ✅ Required
        date: date,
      } as Notifications.DateTriggerInput,
    });
    console.log('Date notification scheduled successfully');
  } catch (error) {
    console.error('Error scheduling date notification:', error);
  }
}

export async function testNotificationNow() {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✅ Test Successful!',
        body: 'Local notifications are working perfectly! 🎉',
        sound: 'default',
      },
      trigger: {
        seconds: 2, // Show after 2 seconds
      } as any,
    });
    console.log('Test notification scheduled');
  } catch (error) {
    console.error('Error scheduling test notification:', error);
  }
}

// Function to cancel all scheduled notifications
export async function cancelAllScheduledNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Function to get all scheduled notifications
export async function getScheduledNotifications() {
  return await Notifications.getAllScheduledNotificationsAsync();
}


export async function demoWelcomeNotification() {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '👋 Welcome!',
      body: "Let's start your day with Calorie Hawk!",
      sound: 'default',
    },
    trigger: {
      type: 'timeInterval',
      seconds: 5,
      repeats: false,
    } as Notifications.TimeIntervalTriggerInput,
  });
}


