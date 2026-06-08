import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import COLORS from '../constants/colors';
import SURAH_NAMES from '../constants/surahNames';

export default function PairCard({
  pair,
  type, // 'quran' | 'hadith'
  arabicFontSize = 20,
  englishFontSize = 13,
  onPress,
}) {
  const [expanded, setExpanded] = useState(false);

  if (type === 'quran') {
    const [surahNum, ayahNum] = (pair.id || '').split(':').map(Number);
    const surahInfo = SURAH_NAMES[surahNum];
    const label = surahInfo
      ? `${surahNum}. ${surahInfo.en} — Ayah ${ayahNum}`
      : pair.id;
    const score = pair.score != null ? `${Math.round(pair.score)}%` : null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => onPress && onPress(pair.id)}
        activeOpacity={0.75}
      >
        <View style={styles.header}>
          <Text style={styles.pairLabel}>{label}</Text>
          {score && <Text style={styles.score}>{score}</Text>}
        </View>
        {pair.arabic ? (
          <Text style={[styles.arabic, { fontSize: arabicFontSize }]}>
            {pair.arabic}
          </Text>
        ) : null}
        {pair.english ? (
          <Text style={[styles.english, { fontSize: englishFontSize }]}>
            {pair.english}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  // Hadith card
  const score = pair.score != null ? `${Math.round(pair.score)}%` : null;
  const hasMore = (pair.english || '').length > 200;
  const displayEn = expanded || !hasMore
    ? pair.english
    : pair.english?.slice(0, 200) + '…';

  return (
    <View style={[styles.card, styles.hadithCard]}>
      <View style={styles.header}>
        <Text style={styles.hadithSource}>
          {[pair.book, pair.ref].filter(Boolean).join(' · ')}
        </Text>
        {score && <Text style={styles.score}>{score}</Text>}
      </View>
      {pair.arabic ? (
        <Text style={[styles.arabic, { fontSize: arabicFontSize }]}>
          {pair.arabic}
        </Text>
      ) : null}
      {pair.english ? (
        <TouchableOpacity onPress={() => setExpanded(!expanded)}>
          <Text style={[styles.english, { fontSize: englishFontSize }]}>
            {displayEn}
          </Text>
          {hasMore && (
            <Text style={styles.readMore}>{expanded ? 'Show less' : 'Read more'}</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCardAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 8,
  },
  hadithCard: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  pairLabel: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  hadithSource: {
    color: COLORS.textMuted,
    fontSize: 11,
    flex: 1,
  },
  score: {
    color: COLORS.textMuted,
    fontSize: 11,
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  arabic: {
    color: COLORS.textArabic,
    fontFamily: 'Amiri_400Regular',
    textAlign: 'right',
    lineHeight: 38,
    marginBottom: 6,
    writingDirection: 'rtl',
  },
  english: {
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  readMore: {
    color: COLORS.accent,
    fontSize: 12,
    marginTop: 4,
  },
});
