import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { rpc } from './supabase';

// Khi app đang mở, sự kiện đã đến qua real-time nên không hiện banner trùng lặp.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
});

// Đăng ký Expo Push Token để nhận thông báo khi app ở chế độ nền. Lỗi (emulator, thiếu FCM) không làm hỏng app.
export async function registerForPush(role: 'customer' | 'mechanic'): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'FixGo', importance: Notifications.AndroidImportance.HIGH });
    }
    const cur = await Notifications.getPermissionsAsync();
    const perm = cur.granted ? cur : await Notifications.requestPermissionsAsync();
    if (!perm.granted) return null;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await rpc('register_push_token', { p_role: role, p_token: token });
    return token;
  } catch (e) {
    console.log('Không đăng ký được push:', e);
    return null;
  }
}
