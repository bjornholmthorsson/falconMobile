import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, ActivityIndicator } from 'react-native';
import { useAppStore } from '../store/appStore';

import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import EmployeesScreen from '../screens/EmployeesScreen';
import EmployeeDetailScreen from '../screens/EmployeeDetailScreen';
import RegisterAbsenceScreen from '../screens/RegisterAbsenceScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MyLocationScreen from '../screens/MyLocationScreen';
import type { Employee } from '../models';
import { useLocationWatcher } from '../hooks/useLocationWatcher';
import { useLoadCurrentUser } from '../hooks/useLoadCurrentUser';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, string> = {
            Home: '🏠',
            Employees: '👥',
            Absence: '📅',
            Location: '📍',
            Profile: '👤',
          };
          return <Text style={{ fontSize: size - 4 }}>{icons[route.name] ?? '●'}</Text>;
        },
        tabBarActiveTintColor: '#0078D4',
        tabBarInactiveTintColor: '#9ca3af',
        headerShown: true,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Employees">
        {() => (
          <>
            <EmployeesScreen onSelectEmployee={setSelectedEmployee} />
            <EmployeeDetailScreen
              employee={selectedEmployee}
              visible={!!selectedEmployee}
              onClose={() => setSelectedEmployee(null)}
            />
          </>
        )}
      </Tab.Screen>
      <Tab.Screen name="Absence" component={RegisterAbsenceScreen} />
      <Tab.Screen name="Location" component={MyLocationScreen} />
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
        <ActivityIndicator size="large" color="#0078D4" />
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
