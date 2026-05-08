import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView,
} from 'react-native';
import COLORS from '../constants/colors';
import SURAH_NAMES from '../constants/surahNames';
import { AppContext } from '../../App';
import { getAyah, getPairs, getHadith } from '../utils/dataManager';
import { toggleBookmark } from '../utils/storage';
import PairCard from '../components/PairCard';
import RootModal from '../components/RootModal';

export default function AyahDetailScreen({ route, navigation }) {
  const { ayahId } = route.params;
  const { arabicFontSize, englishFontSize, bookmarks, setBookmarks } = useContext(AppContext);

  const [ayah, setAyah] = useState(null);
  const [pairs, setPairs] = useState(null);
  const [hadiths, setHadiths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pairsLoading, setPairsLoading] = useState(false);
  const [showWordsPanel, setShowWordsPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('quran'); // 'quran' | 'hadith'

  // Root/word modal
  const [modalVisible, setModalVisible] = useState(false);
  const [modalWord, setModalWord] = useState('');
  const [modalKind, setModalKind] = useState('root');

  const [surahNum] = ayahId.split(':').map(Number);
  const surahInfo = SURAH_NAMES[surahNum];

  useEffect(() => {
    navigation.setOptions({
      title: surahInfo ? `${surahInfo.en} · ${ayahId}` : ayahId,
    });
    loadAyah();
  }, [ayahId]);

  async function loadAyah() {
    setLoading(true);
    try {
      const data = await getAyah(ayahId);
      setAyah(data);

      // Load pairs in background
      setPairsLoading(true);
      const pairData = await getPairs(ayahId);
      setPairs(pairData);

      // Load hadith details in parallel
      if (pairData.hadith_pairs && pairData.hadith_pairs.length > 0) {
        const hadithResults = await Promise.all(
          pairData.hadith_pairs.slice(0, 5).map(async (hp) => {
            const hdata = await getHadith(hp.id);
            return hdata ? { ...hdata, score: hp.score } : null;
          })
        );
        setHadiths(hadithResults.filter(Boolean));
      }
    } catch (e) {
      console.warn('Detail load error:', e);
    } finally {
      setLoading(false);
      setPairsLoading(false);
    }
  }

  const onBookmark = async () => {
    const updated = await toggleBookmark(ayahId);
    setBookmarks(new Set(updated));
  };

  const openWordModal = (word, kind) => {
    setModalWord(word);
    setModalKind(kind);
    setModalVisible(true);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (!ayah) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Ayah not found: {ayahId}</Text>
      </View>
    );
  }

  const roots = ayah.roots || [];
  const tokens = ayah.tokens || [];
  const isBookmarked = bookmarks.has(ayahId);
  const quranPairs = pairs?.quran_pairs || [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Anchor Card ── */}
        <View style={styles.anchorCard}>
          <View style={styles.anchorHeader}>
            <View>
              <Text style={styles.ayahId}>{ayahId}</Text>
              {surahInfo && (
                <Text style={styles.surahName}>
                  {surahInfo.ar} · {surahInfo.en}
                </Text>
              )}
            </View>
            <View style={styles.anchorActions}>
              <TouchableOpacity
                style={[styles.actionBtn, isBookmarked && styles.actionBtnActive]}
                onPress={onBookmark}
              >
                <Text style={styles.actionBtnText}>
                  {isBookmarked ? '🔖' : '🏷️'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, showWordsPanel && styles.actionBtnActive]}
                onPress={() => setShowWordsPanel(!showWordsPanel)}
              >
                <Text style={styles.actionBtnLabel}>Words</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Arabic */}
          <Text style={[styles.arabic, { fontSize: arabicFontSize }]}>
            {ayah.arabic}
          </Text>

          {/* English */}
          <Text style={[styles.english, { fontSize: englishFontSize }]}>
            {ayah.english}
          </Text>

          {/* Words & Roots panel */}
          {showWordsPanel && (
            <View style={styles.wordsPanel}>
              {roots.length > 0 && (
                <View style={styles.wordsSection}>
                  <Text style={styles.wordsSectionLabel}>Root Words</Text>
                  <View style={styles.chipGroup}>
                    {roots.map((root, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.chip}
                        onPress={() => openWordModal(root, 'root')}
                      >
                        <Text style={styles.chipText}>{root}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              {tokens.length > 0 && (
                <View style={styles.wordsSection}>
                  <Text style={styles.wordsSectionLabel}>Arabic Words</Text>
                  <View style={styles.chipGroup}>
                    {tokens.map((tok, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[styles.chip, styles.chipToken]}
                        onPress={() => openWordModal(tok, 'token')}
                      >
                        <Text style={styles.chipText}>{tok}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Pairs section ── */}
        <View style={styles.pairsSection}>
          <Text style={styles.sectionTitle}>Related Content</Text>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'quran' && styles.tabActive]}
              onPress={() => setActiveTab('quran')}
            >
              <Text style={[styles.tabText, activeTab === 'quran' && styles.tabTextActive]}>
                Quran ({quranPairs.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'hadith' && styles.tabActive]}
              onPress={() => setActiveTab('hadith')}
            >
              <Text style={[styles.tabText, activeTab === 'hadith' && styles.tabTextActive]}>
                Hadith ({hadiths.length})
              </Text>
            </TouchableOpacity>
          </View>

          {pairsLoading && (
            <ActivityIndicator size="small" color={COLORS.accent} style={{ marginTop: 16 }} />
          )}

          {!pairsLoading && activeTab === 'quran' && quranPairs.map((pair, i) => (
            <PairCard
              key={i}
              pair={pair}
              type="quran"
              arabicFontSize={arabicFontSize - 2}
              englishFontSize={englishFontSize - 1}
              onPress={(id) => navigation.push('AyahDetail', { ayahId: id })}
            />
          ))}

          {!pairsLoading && activeTab === 'hadith' && hadiths.map((h, i) => (
            <PairCard
              key={i}
              pair={h}
              type="hadith"
              arabicFontSize={arabicFontSize - 2}
              englishFontSize={englishFontSize - 1}
            />
          ))}

          {!pairsLoading && activeTab === 'quran' && quranPairs.length === 0 && (
            <Text style={styles.emptyPairs}>No related Quran pairs found.</Text>
          )}
          {!pairsLoading && activeTab === 'hadith' && hadiths.length === 0 && (
            <Text style={styles.emptyPairs}>No related Hadith found.</Text>
          )}
        </View>
      </ScrollView>

      {/* Root/word modal */}
      <RootModal
        visible={modalVisible}
        word={modalWord}
        kind={modalKind}
        arabicFontSize={arabicFontSize}
        englishFontSize={englishFontSize}
        onClose={() => setModalVisible(false)}
        onAyahPress={(id) => navigation.push('AyahDetail', { ayahId: id })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  content: { padding: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  errorText: { color: COLORS.textSecondary, fontSize: 14 },

  // Anchor card
  anchorCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accentBorder,
    padding: 16,
    marginBottom: 16,
  },
  anchorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  ayahId: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  surahName: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  anchorActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    backgroundColor: COLORS.bgCardAlt,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  actionBtnText: { fontSize: 16 },
  actionBtnLabel: { color: COLORS.textSecondary, fontSize: 12 },

  arabic: {
    color: COLORS.textArabic,
    fontFamily: 'Amiri_400Regular',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 50,
    marginBottom: 10,
  },
  english: {
    color: COLORS.textSecondary,
    lineHeight: 22,
  },

  // Words & roots panel
  wordsPanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  wordsSection: { gap: 6 },
  wordsSectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: COLORS.bgCardAlt,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipToken: {
    borderColor: COLORS.borderLight,
  },
  chipText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontFamily: 'Amiri_400Regular',
  },

  // Pairs
  pairsSection: { gap: 8 },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: COLORS.accentDim,
    borderWidth: 1,
    borderColor: COLORS.accentBorder,
  },
  tabText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: COLORS.accent,
  },
  emptyPairs: {
    color: COLORS.textMuted,
    textAlign: 'center',
    fontSize: 13,
    marginTop: 20,
  },
});
