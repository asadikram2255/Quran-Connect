import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import COLORS from '../constants/colors';
import SURAH_NAMES from '../constants/surahNames';
import { sortAyahIds, groupBySurah } from '../utils/arabic';
import { getAyahsBatch, getRootToAyahIds, getArTokenIndex } from '../utils/dataManager';

export default function RootModal({
  visible,
  word,
  kind, // 'root' | 'token'
  arabicFontSize = 20,
  englishFontSize = 13,
  onClose,
  onAyahPress,
}) {
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  const loadData = useCallback(async () => {
    if (!word) return;
    setLoading(true);
    setSections([]);

    try {
      // Get ayah IDs for this word/root
      let ayahIds = [];
      if (kind === 'root') {
        const rootIdx = getRootToAyahIds();
        ayahIds = rootIdx ? (rootIdx[word] || []) : [];
      } else {
        const arIdx = getArTokenIndex();
        ayahIds = arIdx ? (arIdx[word] || []) : [];
      }

      setTotalCount(ayahIds.length);

      // Load in batches to avoid blocking
      const sorted = sortAyahIds(ayahIds);
      const bysurah = groupBySurah(sorted);

      // Load all ayahs in parallel (batched by shard)
      const ayahData = await getAyahsBatch(sorted);

      // Build sections
      const built = Object.entries(bysurah).map(([surahNum, ids]) => {
        const sInfo = SURAH_NAMES[Number(surahNum)];
        return {
          surahNum: Number(surahNum),
          title: sInfo
            ? `${surahNum}. ${sInfo.en} (${sInfo.ar})`
            : `Surah ${surahNum}`,
          data: ids.map(id => ({
            id,
            arabic: ayahData[id]?.arabic || '',
            english: ayahData[id]?.english || '',
          })),
        };
      });
      setSections(built);
    } catch (e) {
      console.warn('RootModal load error:', e);
    } finally {
      setLoading(false);
    }
  }, [word, kind]);

  useEffect(() => {
    if (visible && word) loadData();
  }, [visible, word, loadData]);

  const kindLabel = kind === 'root' ? 'root' : 'word';

  // Flatten sections for FlatList with section headers
  const flatData = [];
  for (const sec of sections) {
    flatData.push({ type: 'header', key: `h_${sec.surahNum}`, title: sec.title });
    for (const item of sec.data) {
      flatData.push({ type: 'ayah', key: item.id, ...item });
    }
  }

  const renderItem = ({ item }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{item.title}</Text>
        </View>
      );
    }
    return (
      <TouchableOpacity
        style={styles.ayahItem}
        onPress={() => { onClose(); onAyahPress && onAyahPress(item.id); }}
        activeOpacity={0.7}
      >
        <Text style={styles.ayahId}>{item.id}</Text>
        {item.arabic ? (
          <Text style={[styles.ayahArabic, { fontSize: arabicFontSize }]}>
            {item.arabic}
          </Text>
        ) : null}
        {item.english ? (
          <Text style={[styles.ayahEnglish, { fontSize: englishFontSize }]} numberOfLines={3}>
            {item.english}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.wordTitle} numberOfLines={1}>{word}</Text>
            <Text style={styles.wordSub}>
              {loading
                ? `Loading ${kindLabel} occurrences…`
                : `${kindLabel} appears ${totalCount} time${totalCount !== 1 ? 's' : ''} in the Quran`}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {loading ? (
          <ActivityIndicator
            size="large"
            color={COLORS.accent}
            style={{ marginTop: 40 }}
          />
        ) : (
          <FlatList
            data={flatData}
            keyExtractor={item => item.key}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.empty}>No occurrences found.</Text>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  wordTitle: {
    color: COLORS.textArabic,
    fontSize: 22,
    fontFamily: 'Amiri_400Regular',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 2,
  },
  wordSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bgCardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  list: {
    padding: 12,
  },
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  ayahItem: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 8,
  },
  ayahId: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  ayahArabic: {
    color: COLORS.textArabic,
    fontFamily: 'Amiri_400Regular',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 36,
    marginBottom: 4,
  },
  ayahEnglish: {
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  empty: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
});
