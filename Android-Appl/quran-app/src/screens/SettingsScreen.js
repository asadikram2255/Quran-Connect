import React, { useState, useContext } from 'react';
import {
  View, Text, TouchableOpacity, Switch, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import COLORS from '../constants/colors';
import { AppContext } from '../../App';
import { saveFontSize, saveNotifEnabled } from '../utils/storage';
import { scheduleDailyNotification, cancelAllNotifications, requestPermissions } from '../utils/notifications';
import { STORAGE_KEYS, DEFAULT_ARABIC_SIZE, DEFAULT_ENGLISH_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE } from '../constants/config';

export default function SettingsScreen() {
  const {
    arabicFontSize, setArabicFontSize,
    englishFontSize, setEnglishFontSize,
    notifEnabled, setNotifEnabled,
  } = useContext(AppContext);

  const changeArabic = (delta) => {
    const next = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, arabicFontSize + delta));
    setArabicFontSize(next);
    saveFontSize(STORAGE_KEYS.ARABIC_FONT, next);
  };

  const changeEnglish = (delta) => {
    const next = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, englishFontSize + delta));
    setEnglishFontSize(next);
    saveFontSize(STORAGE_KEYS.ENGLISH_FONT, next);
  };

  const resetFonts = () => {
    setArabicFontSize(DEFAULT_ARABIC_SIZE);
    setEnglishFontSize(DEFAULT_ENGLISH_SIZE);
    saveFontSize(STORAGE_KEYS.ARABIC_FONT, DEFAULT_ARABIC_SIZE);
    saveFontSize(STORAGE_KEYS.ENGLISH_FONT, DEFAULT_ENGLISH_SIZE);
  };

  const toggleNotif = async (value) => {
    if (value) {
      const granted = await requestPermissions();
      if (!granted) {
        Alert.alert(
          'Permission Needed',
          'Please allow notifications in your device settings to enable Daily Ayah reminders.',
        );
        return;
      }
      // Schedule with a sample — in production pass real random ayahs
      await scheduleDailyNotification([
        { id: '2:255', english: 'Allah — there is no deity except Him, the Ever-Living, the Sustainer of existence.' },
        { id: '1:1', english: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.' },
        { id: '112:1', english: 'Say, "He is Allah, [who is] One."' },
      ]);
      setNotifEnabled(true);
      await saveNotifEnabled(true);
      Alert.alert('✅ Notifications enabled', 'You will receive a daily ayah at 8:00 AM.');
    } else {
      await cancelAllNotifications();
      setNotifEnabled(false);
      await saveNotifEnabled(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Settings</Text>

      {/* Font sizes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Font Sizes</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Arabic Text</Text>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => changeArabic(-1)}>
              <Text style={styles.stepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepValue}>{arabicFontSize}px</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => changeArabic(1)}>
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Arabic preview */}
        <View style={styles.preview}>
          <Text style={[styles.arabicPreview, { fontSize: arabicFontSize }]}>
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>English Text</Text>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => changeEnglish(-1)}>
              <Text style={styles.stepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepValue}>{englishFontSize}px</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => changeEnglish(1)}>
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* English preview */}
        <View style={styles.preview}>
          <Text style={[styles.englishPreview, { fontSize: englishFontSize }]}>
            In the name of Allah, the Entirely Merciful, the Especially Merciful.
          </Text>
        </View>

        <TouchableOpacity style={styles.resetBtn} onPress={resetFonts}>
          <Text style={styles.resetBtnText}>Reset to defaults</Text>
        </TouchableOpacity>
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Daily Ayah</Text>
            <Text style={styles.rowSub}>Receive an ayah every morning at 8:00 AM</Text>
          </View>
          <Switch
            value={notifEnabled}
            onValueChange={toggleNotif}
            trackColor={{ false: COLORS.border, true: COLORS.accentDim }}
            thumbColor={notifEnabled ? COLORS.accent : COLORS.textMuted}
          />
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.aboutText}>
          Quran Better For Me — v1.0{'\n'}
          Data: 6,236 Quran ayat · 43,393 Hadith{'\n'}
          Search indexed · Semantic pairing{'\n\n'}
          Built with Expo · GitHub Pages data
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: {
    color: COLORS.textPrimary,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 20,
  },
  section: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  sectionTitle: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  rowSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCardAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  stepBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  stepBtnText: {
    color: COLORS.accent,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 22,
  },
  stepValue: {
    color: COLORS.textPrimary,
    fontSize: 14,
    minWidth: 44,
    textAlign: 'center',
  },
  preview: {
    backgroundColor: COLORS.bgCardAlt,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  arabicPreview: {
    color: COLORS.textArabic,
    fontFamily: 'Amiri_400Regular',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 50,
  },
  englishPreview: {
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  resetBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.bgCardAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resetBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  aboutText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 22,
  },
});
