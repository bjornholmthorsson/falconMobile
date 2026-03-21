import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
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

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  const currentUser = useAppStore(s => s.currentUser);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  useLocationWatcher();

  if (!currentUser) {
    return (
      <NavigationContainer>
        <LoginScreen />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
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
    </NavigationContainer>
  );
}
