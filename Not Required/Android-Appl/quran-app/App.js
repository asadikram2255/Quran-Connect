import React, { useState, useEffect, createContext } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useFonts, Amiri_400Regular, Amiri_700Bold } from '@expo-google-fonts/amiri';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';

import COLORS from './src/constants/colors';
import { DEFAULT_ARABIC_SIZE, DEFAULT_ENGLISH_SIZE } from './src/constants/config';
import { loadManifest, loadShardMaps, loadSearchIndexes } from './src/utils/dataManager';
import { loadBookmarks, loadFontSizes, loadNotifEnabled } from './src/utils/storage';
import { setupChannel, requestPermissions } from './src/utils/notifications';
import AppNavigator from './src/navigation/AppNavigator';

// Keep the splash screen visible while loading
SplashScreen.preventAutoHideAsync();

// ─── Global app context ───────────────────────────────────────────────────────
export const AppContext = createContext({
  arabicFontSize: DEFAULT_ARABIC_SIZE,
  setArabicFontSize: () => {},
  englishFontSize: DEFAULT_ENGLISH_SIZE,
  setEnglishFontSize: () => {},
  bookmarks: new Set(),
  setBookmarks: () => {},
  notifEnabled: false,
  setNotifEnabled: () => {},
});

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [fontsLoaded] = useFonts({ Amiri_400Regular, Amiri_700Bold });

  const [appReady, setAppReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [loadStep, setLoadStep] = useState('Starting…');

  // Context state
  const [arabicFontSize, setArabicFontSize] = useState(DEFAULT_ARABIC_SIZE);
  const [englishFontSize, setEnglishFontSize] = useState(DEFAULT_ENGLISH_SIZE);
  const [bookmarks, setBookmarks] = useState(new Set());
  const [notifEnabled, setNotifEnabled] = useState(false);

  // ── Initialise app data ──────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        // 1. Load persisted user settings
        setLoadStep('Loading preferences…');
        const [fonts, bmarks, notif] = await Promise.all([
          loadFontSizes({ arabic: DEFAULT_ARABIC_SIZE, english: DEFAULT_ENGLISH_SIZE }),
          loadBookmarks(),
          loadNotifEnabled(),
        ]);
        setArabicFontSize(fonts.arabic);
        setEnglishFontSize(fonts.english);
        setBookmarks(bmarks);
        setNotifEnabled(notif);

        // 2. Load manifest
        setLoadStep('Fetching manifest…');
        await loadManifest();

        // 3. Load shard maps (small JSON files)
        setLoadStep('Loading shard maps…');
        await loadShardMaps();

        // 4. Load search indexes (these are the big ones)
        setLoadStep('Loading search indexes…');
        await loadSearchIndexes();

        // 5. Set up notifications (don't block on this)
        setupChannel().catch(() => {});

        setAppReady(true);
      } catch (err) {
        console.error('Init error:', err);
        setLoadError(err.message || 'Failed to load data. Check your connection.');
      }
    }
    init();
  }, []);

  // ── Handle notification deep-link ─────────────────────────────────────────
  // When user taps a notification, deep-link to that ayah
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const { ayahId } = response.notification.request.content.data || {};
      // Navigation happens via ref — handled in navigator if needed
      console.log('Notification tapped, ayahId:', ayahId);
    });
    return () => sub.remove();
  }, []);

  // ── Hide splash once fonts + data are ready ───────────────────────────────
  useEffect(() => {
    if (fontsLoaded && (appReady || loadError)) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, appReady, loadError]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (!fontsLoaded || !appReady) {
    return (
      <View style={styles.loading}>
        {loadError ? (
          <>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Failed to Load</Text>
            <Text style={styles.errorText}>{loadError}</Text>
            <Text style={styles.errorHint}>Check your internet connection and restart the app.</Text>
          </>
        ) : (
          <>
            <Text style={styles.loadingIcon}>📖</Text>
            <Text style={styles.loadingTitle}>Quran Better For Me</Text>
            <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 24 }} />
            <Text style={styles.loadingStep}>{loadStep}</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <AppContext.Provider
      value={{
        arabicFontSize, setArabicFontSize,
        englishFontSize, setEnglishFontSize,
        bookmarks, setBookmarks,
        notifEnabled, setNotifEnabled,
      }}
    >
      <AppNavigator />
    </AppContext.Provider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  loadingIcon: { fontSize: 56, marginBottom: 16 },
  loadingTitle: {
    color: COLORS.accent,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  loadingStep: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 14,
    textAlign: 'center',
  },
  errorIcon: { fontSize: 48, marginBottom: 12 },
  errorTitle: {
    color: COLORS.danger,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  errorHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
