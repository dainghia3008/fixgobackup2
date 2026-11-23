import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/shared/mobile/auth';
import { ToastHost, useNoticeToast } from '@/shared/mobile/ui';
import { useCustomerRuntime } from '@/runtime';
import { useCustomer } from '@/store';

function Runtime() {
  useCustomerRuntime();
  useNoticeToast(useCustomer((s) => s.notice));
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
      <ToastHost />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Runtime />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
