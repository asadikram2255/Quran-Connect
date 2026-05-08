import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NOTIF_CHANNEL_ID, NOTIF_HOUR, NOTIF_MINUTE } from '../constants/config';

// Configure how notifications are displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Request notification permissions
 * Returns true if granted
 */
export async function requestPermissions() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Set up Android notification channel
 */
export async function setupChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL_ID, {
      name: 'Daily Ayah',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4fd1c5',
    });
  }
}

/**
 * Schedule a daily notification at NOTIF_HOUR:NOTIF_MINUTE
 * ayahs: array of { id, arabic, english } — one picked randomly
 */
export async function scheduleDailyNotification(ayahs) {
  // Cancel any existing daily notifications
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (!ayahs || ayahs.length === 0) return;

  const pick = ayahs[Math.floor(Math.random() * ayahs.length)];

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '📖 Ayah of the Day',
      body: pick.english
        ? pick.english.slice(0, 120) + (pick.english.length > 120 ? '…' : '')
        : pick.arabic || '',
      data: { ayahId: pick.id },
      channelId: NOTIF_CHANNEL_ID,
    },
    trigger: {
      type: 'daily',
      hour: NOTIF_HOUR,
      minute: NOTIF_MINUTE,
      repeats: true,
    },
  });
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
