import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import COLORS from '../constants/colors';
import SURAH_NAMES from '../constants/surahNames';

export default function AyahCard({
  ayahId,
  arabic,
  english,
  arabicFontSize = 24,
  englishFontSize = 14,
  isBookmarked = false,
  onPress,
  onBookmark,
  scoreLabel,
}) {
  const [surahNum, ayahNum] = ayahId.split(':').map(Number);
  const surahInfo = SURAH_NAMES[surahNum];
  const surahLabel = surahInfo
    ? `${surahNum}. ${surahInfo.en} — Ayah ${ayahNum}`
    : `${ayahId}`;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress && onPress(ayahId)}
      activeOpacity={0.75}
    >
      {/* Header row */}
      <View style={styles.header}>
        <Text style={styles.surahLabel}>{surahLabel}</Text>
        <View style={styles.headerRight}>
          {scoreLabel ? (
            <Text style={styles.score}>{scoreLabel}</Text>
          ) : null}
          {onBookmark && (
            <TouchableOpacity
              onPress={() => onBookmark(ayahId)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.bookmarkIcon, isBookmarked && styles.bookmarkActive]}>
                {isBookmarked ? '🔖' : '🏷️'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Arabic */}
      {arabic ? (
        <Text style={[styles.arabic, { fontSize: arabicFontSize }]} dir="rtl">
          {arabic}
        </Text>
      ) : null}

      {/* English */}
      {english ? (
        <Text style={[styles.english, { fontSize: englishFontSize }]}>
          {english}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  surahLabel: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  score: {
    color: COLORS.textMuted,
    fontSize: 11,
    backgroundColor: COLORS.bgCardAlt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bookmarkIcon: {
    fontSize: 18,
    opacity: 0.5,
  },
  bookmarkActive: {
    opacity: 1,
  },
  arabic: {
    color: COLORS.textArabic,
    fontFamily: 'Amiri_400Regular',
    textAlign: 'right',
    lineHeight: 44,
    marginBottom: 8,
    writingDirection: 'rtl',
  },
  english: {
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
});
