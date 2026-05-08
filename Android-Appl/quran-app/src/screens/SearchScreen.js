import React, { useState, useCallback, useContext, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, Keyboard,
} from 'react-native';
import COLORS from '../constants/colors';
import { AppContext } from '../../App';
import { searchEnglish, searchArabic, isReady, getAyahsBatch } from '../utils/dataManager';
import { toggleBookmark } from '../utils/storage';
import { sortAyahIds } from '../utils/arabic';
import AyahCard from '../components/AyahCard';
import { MAX_RESULTS } from '../constants/config';

export default function SearchScreen({ navigation }) {
  const { arabicFontSize, englishFontSize, bookmarks, setBookmarks } = useContext(AppContext);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [dataReady, setDataReady] = useState(isReady());
  const searchTimer = useRef(null);

  // Re-check readiness if not ready yet
  React.useEffect(() => {
    if (!dataReady) {
      const interval = setInterval(() => {
        if (isReady()) {
          setDataReady(true);
          clearInterval(interval);
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, [dataReady]);

  const doSearch = useCallback(async (q) => {
    if (!dataReady) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      // Detect Arabic input
      const isArabic = /[؀-ۿ]/.test(trimmed);
      let ids = isArabic
        ? searchArabic(trimmed, MAX_RESULTS)
        : searchEnglish(trimmed, MAX_RESULTS);

      ids = sortAyahIds(ids).slice(0, MAX_RESULTS);

      // Batch load ayah data
      const ayahData = await getAyahsBatch(ids);

      const items = ids
        .map(id => ({ id, ...ayahData[id] }))
        .filter(a => a.arabic || a.english);

      setResults(items);
    } catch (e) {
      console.warn('Search error:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [dataReady]);

  const onChangeText = (text) => {
    setQuery(text);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(text), 350);
  };

  const onBookmark = async (ayahId) => {
    const updated = await toggleBookmark(ayahId);
    setBookmarks(new Set(updated));
  };

  const renderItem = ({ item }) => (
    <AyahCard
      ayahId={item.id}
      arabic={item.arabic}
      english={item.english}
      arabicFontSize={arabicFontSize}
      englishFontSize={englishFontSize}
      isBookmarked={bookmarks.has(item.id)}
      onPress={(id) => {
        Keyboard.dismiss();
        navigation.navigate('AyahDetail', { ayahId: id });
      }}
      onBookmark={onBookmark}
    />
  );

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder={dataReady ? 'Search Quran (English or Arabic)…' : 'Loading indexes…'}
          placeholderTextColor={COLORS.textMuted}
          value={query}
          onChangeText={onChangeText}
          returnKeyType="search"
          onSubmitEditing={() => doSearch(query)}
          clearButtonMode="while-editing"
          editable={dataReady}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => { setQuery(''); setResults([]); setSearched(false); }}
            style={styles.clearBtn}
          >
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Status row */}
      {!dataReady && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.statusText}>Loading search indexes…</Text>
        </View>
      )}

      {loading && (
        <ActivityIndicator
          size="large"
          color={COLORS.accent}
          style={{ marginTop: 30 }}
        />
      )}

      {!loading && searched && results.length === 0 && (
        <Text style={styles.empty}>No results found for "{query}"</Text>
      )}

      {!loading && !searched && dataReady && (
        <View style={styles.welcome}>
          <Text style={styles.welcomeIcon}>📖</Text>
          <Text style={styles.welcomeTitle}>Quran Better For Me</Text>
          <Text style={styles.welcomeText}>
            Search in English or Arabic. Tap any ayah to see related Quran verses and Hadith.
          </Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    backgroundColor: COLORS.bgInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    height: 44,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  statusText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  empty: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
    paddingHorizontal: 20,
  },
  welcome: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 30,
  },
  welcomeIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  welcomeTitle: {
    color: COLORS.accent,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
  },
  welcomeText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
});
