import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';

import COLORS from '../constants/colors';
import SearchScreen from '../screens/SearchScreen';
import BookmarksScreen from '../screens/BookmarksScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AyahDetailScreen from '../screens/AyahDetailScreen';

const Tab = createBottomTabNavigator();
const SearchStack = createNativeStackNavigator();
const BookmarkStack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: COLORS.bgCard },
  headerTintColor: COLORS.textPrimary,
  headerTitleStyle: { color: COLORS.textPrimary, fontWeight: '600' },
  contentStyle: { backgroundColor: COLORS.bg },
};

// ─── Search Stack ─────────────────────────────────────────────────────────────
function SearchStackNav() {
  return (
    <SearchStack.Navigator screenOptions={screenOptions}>
      <SearchStack.Screen
        name="SearchHome"
        component={SearchScreen}
        options={{ title: 'Quran Search' }}
      />
      <SearchStack.Screen
        name="AyahDetail"
        component={AyahDetailScreen}
        options={{ title: 'Ayah Detail' }}
      />
    </SearchStack.Navigator>
  );
}

// ─── Bookmarks Stack ──────────────────────────────────────────────────────────
function BookmarkStackNav() {
  return (
    <BookmarkStack.Navigator screenOptions={screenOptions}>
      <BookmarkStack.Screen
        name="BookmarksHome"
        component={BookmarksScreen}
        options={{ title: 'Bookmarks' }}
      />
      <BookmarkStack.Screen
        name="AyahDetail"
        component={AyahDetailScreen}
        options={{ title: 'Ayah Detail' }}
      />
    </BookmarkStack.Navigator>
  );
}

// ─── Tab Icons (simple text emoji) ───────────────────────────────────────────
function TabIcon({ label, focused }) {
  const icons = { Search: '🔍', Bookmarks: '🔖', Settings: '⚙️' };
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
      {icons[label]}
    </Text>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────
export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORS.tabBarBg,
            borderTopColor: COLORS.tabBarBorder,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: COLORS.tabActive,
          tabBarInactiveTintColor: COLORS.tabInactive,
          tabBarLabelStyle: { fontSize: 11, marginBottom: 2 },
          tabBarIcon: ({ focused }) => (
            <TabIcon label={route.name} focused={focused} />
          ),
        })}
      >
        <Tab.Screen name="Search" component={SearchStackNav} />
        <Tab.Screen name="Bookmarks" component={BookmarkStackNav} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
