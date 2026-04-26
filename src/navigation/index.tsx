import React, { useCallback, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, ImageBackground, StyleSheet } from 'react-native';
import { useAppStore } from '../store/appStore';
import { HomeIcon, EmployeesIcon, LocationIcon, ProfileIcon, LunchIcon, TimeIcon, OtherIcon } from '../components/TabIcons';

const HEADER_IMAGE = require('../assets/images/header-clouds.png');

function HeaderBackground() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <ImageBackground
        source={HEADER_IMAGE}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      {/* Glossy highlight at the bottom edge — sells the "image is behind" depth cue */}
      <View style={headerStyles.glossLine} />
      <View style={headerStyles.glossSoft} />
    </View>
  );
}

const headerStyles = StyleSheet.create({
  glossLine: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  glossSoft: {
    position: 'absolute',
    left: 0, right: 0, bottom: 1.5,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});

import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import EmployeesScreen from '../screens/EmployeesScreen';
import EmployeeDetailScreen from '../screens/EmployeeDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LunchScreen from '../screens/LunchScreen';
import TimeScreen from '../screens/TimeScreen';
import OtherScreen from '../screens/OtherScreen';
import MyLocationScreen from '../screens/MyLocationScreen';
import type { Employee } from '../models';
import { useLocationWatcher } from '../hooks/useLocationWatcher';
import { useLoadCurrentUser } from '../hooks/useLoadCurrentUser';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const EmployeesTab = useCallback(() => (
    <>
      <EmployeesScreen onSelectEmployee={setSelectedEmployee} />
      <EmployeeDetailScreen
        employee={selectedEmployee}
        visible={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
      />
    </>
  ), [selectedEmployee]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'Home') return <HomeIcon color={color} size={size} />;
          if (route.name === 'Team') return <EmployeesIcon color={color} size={size} />;
          if (route.name === 'Pulse') return <LocationIcon color={color} size={size} />;
          if (route.name === 'Lunch') return <LunchIcon color={color} size={size} />;
          if (route.name === 'Time') return <TimeIcon color={color} size={size} />;
          if (route.name === 'Other') return <OtherIcon color={color} size={size} />;
          if (route.name === 'Profile') return <ProfileIcon color={color} size={size} />;
          return null;
        },
        tabBarActiveTintColor: '#006559',
        tabBarInactiveTintColor: '#9ca3af',
        headerShown: true,
        headerBackground: () => <HeaderBackground />,
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: true,
        headerStyle: {
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 5,
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Team" component={EmployeesTab} />
      <Tab.Screen name="Pulse" component={MyLocationScreen} />
      <Tab.Screen name="Lunch" component={LunchScreen} />
      <Tab.Screen name="Time" component={TimeScreen} />
      <Tab.Screen name="Other" component={OtherScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const authRestored = useAppStore(s => s.authRestored);
  useLocationWatcher();
  useLoadCurrentUser();

  if (!authRestored) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }}>
        <ActivityIndicator size="large" color="#006559" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
