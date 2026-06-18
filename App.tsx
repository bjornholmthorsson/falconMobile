import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import AppNavigator from './src/navigation';
import KeyboardAccessory from './src/components/KeyboardAccessory';
import { queryClient } from './src/services/queryClient';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <QueryClientProvider client={queryClient}>
        <AppNavigator />
      </QueryClientProvider>
      <KeyboardAccessory />
    </SafeAreaProvider>
  );
}
