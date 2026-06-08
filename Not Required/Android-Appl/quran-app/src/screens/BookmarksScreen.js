import React, { useState, useCallback, useContext } from 'react';
import {
  View, Text, FlatList, ActivityIndicator,
  StyleSheet, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import COLORS from '../constants/colors';
import { AppContext } from '../../App';
import { getAyahsBatch } from '../utils/dataManager';
import { loadBookmarks, toggleBookmark } from '../utils/storage';
import { sortAyahIds } from '../utils/arabic';
import AyahCard from '../components/AyahCard';

export default function BookmarksScreen({ navigation }) {
  const { arabicFontSize, englishFontSize, bookmarks, setBookmarks } = useContext(AppContext);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Reload whenever screen is focused
  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [bookmarks])
  );

  async function loadItems() {
    if (bookmarks.size === 0) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const ids = sortAyahIds([...bookmarks]);
      const data = await getAyahsBatch(ids);
      const result = ids.map(id => ({ id, ...data[id] })).filter(a => a.arabic || a.english);
      setItems(result);
    } catch (e) {
      console.warn('Bookmarks load error:', e);
    } finally {
      setLoading(false);
    }
  }

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
      isBookmarked={true}
      onPress={(id) => navigation.navigate('AyahDetail', { ayahId: id })}
      onBookmark={onBookmark}
    />
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (bookmarks.size === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🔖</Text>
        <Text style={styles.emptyTitle}>No bookmarks yet</Text>
        <Text style={styles.emptyText}>
          Tap the bookmark icon on any ayah to save it here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {bookmarks.size} saved ayah{bookmarks.size !== 1 ? 's' : ''}
        </Text>
        <TouchableOpacity
          onPress={async () => {
            const { loadBookmarks: lb, saveBookmarks: sb } = await import('../utils/storage');
            // Actually just clear all
            const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
            const { STORAGE_KEYS } = await import('../constants/config');
            await AsyncStorage.removeItem(STORAGE_KEYS.BOOKMARKS);
            setBookmarks(new Set());
          }}
        >
          <Text style={styles.clearAll}>Clear all</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
    paddingHorizontal: 30,
  },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  countText: { color: COLORS.textSecondary, fontSize: 13 },
  clearAll: { color: COLORS.danger, fontSize: 13 },
  list: { padding: 12, paddingBottom: 30 },
});
