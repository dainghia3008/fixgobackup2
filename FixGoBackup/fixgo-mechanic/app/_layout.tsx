import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/shared/mobile/auth';
import { ToastHost, useNoticeToast } from '@/shared/mobile/ui';
import { useMechanicRuntime } from '@/runtime';
import { useMechanic } from '@/store';

function Runtime() {
  useMechanicRuntime();
  useNoticeToast(useMechanic((s) => s.notice));
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
