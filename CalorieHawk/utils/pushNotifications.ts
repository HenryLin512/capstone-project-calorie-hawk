
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

// import * as Notifications from "expo-notifications";
// import { Platform } from "react-native";

// // -------------------------------------------
// // REQUIRED: Notification behavior (iOS + Android)
// // -------------------------------------------
// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge: false,

//     // iOS 17+ extra required fields:
//     shouldShowBanner: true,
//     shouldShowList: true,
//   }),
// });

// // -------------------------------
// // 1. SETUP (permissions + channel)
// // -------------------------------
// export async function setupNotifications() {
//   // Ask for permission
//   const { status } = await Notifications.requestPermissionsAsync();

//   if (status !== "granted") {
//     console.warn("Notification permissions not granted");
//     return;
//   }

//   // Android notification channel
//   if (Platform.OS === "android") {
//     await Notifications.setNotificationChannelAsync("default", {
//       name: "Default Notifications",
//       importance: Notifications.AndroidImportance.HIGH,
//     });
//   }

//   console.log("Notifications setup done.");
// }

// // --------------------------------------------------------
// // 2. DAILY REMINDER (e.g., every day at 8 PM)
// // --------------------------------------------------------
// export async function scheduleDailyReminder(hour: number, minute: number) {
//   return await Notifications.scheduleNotificationAsync({
//     content: {
//       title: "Daily Reminder",
//       body: "This is your daily notification!",
//       sound: true,
//     },
//     trigger: {
//       hour,
//       minute,
//       repeats: true,
//     } as Notifications.CalendarTriggerInput,
//   });
// }

// // --------------------------------------------------------
// // 3. ONE-TIME NOTIFICATION (fires once after N seconds)
// // --------------------------------------------------------
// export async function scheduleOneTimeNotification(seconds: number) {
//   return await Notifications.scheduleNotificationAsync({
//     content: {
//       title: "One-Time Alert",
//       body: "This notification fired once!",
//     },
//     trigger: {
//       seconds,
//     },
//   });
// }

// // --------------------------------------------------------
// // 4. CANCEL ALL NOTIFICATIONS
// // --------------------------------------------------------
// export async function cancelAllNotifications() {
//   await Notifications.cancelAllScheduledNotificationsAsync();
//   console.log("All notifications cancelled");
// }
// import * as Notifications from "expo-notifications";
// import * as Device from "expo-device";
// import { Platform } from "react-native";

// //Set the notification behave when received
// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge: false,
//     shouldShowBanner: true, // ✅ iOS 17+ required
//     shouldShowList: true,   // ✅ iOS 17+ required
//   }),
// });

// export async function registerForPushNotificationsAsync() {
//   let token;

//   if (Device.isDevice) {
//     const { status: existingStatus } = await Notifications.getPermissionsAsync();
//     let finalStatus = existingStatus;
//     if (existingStatus !== 'granted') {
//       const { status } = await Notifications.requestPermissionsAsync();
//       finalStatus = status;
//     }
//     if (finalStatus !== 'granted') {
//       alert('Failed to get push token for push notification!');
//       return;
//     }

//     token = (await Notifications.getExpoPushTokenAsync()).data;
//     console.log('Expo Push Token:', token);
//   } else {
//     alert('Must use physical device for Push Notifications');
//   }

//   if (Platform.OS === 'android') {
//     await Notifications.setNotificationChannelAsync('default', {
//       name: 'default',
//       importance: Notifications.AndroidImportance.MAX,
//     });
//   }

//   return token;
// }