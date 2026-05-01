import { useState, useEffect, useCallback } from 'react';
import { API_CONFIG } from '../config/constants';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

const urlBase64ToUint8Array = (base64String: string): ArrayBuffer => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) buffer[i] = rawData.charCodeAt(i);
  return buffer.buffer;
};

/**
 * Hook for managing web push notification subscriptions.
 *
 * Usage:
 *   const { permission, requestPermission, isSubscribed } = usePushNotifications();
 */
export const usePushNotifications = () => {
  const [permission, setPermission] = useState<PermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isSupported =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  useEffect(() => {
    if (!isSupported) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission as PermissionState);

    // Register service worker and check if already subscribed
    registerSW().then(async (reg) => {
      if (!reg) return;
      const existing = await reg.pushManager.getSubscription();
      setIsSubscribed(!!existing);
    });
  }, [isSupported]);

  const registerSW = async (): Promise<ServiceWorkerRegistration | null> => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      return reg;
    } catch (err) {
      console.error('SW registration failed:', err);
      return null;
    }
  };

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setIsLoading(true);
    try {
      // 1. Get VAPID public key from server
      const keyRes = await fetch(`${API_CONFIG.API_URL}/push/vapid-public-key`);
      const keyData = await keyRes.json();
      if (!keyData.success || !keyData.publicKey) {
        console.warn('No VAPID public key from server');
        return false;
      }

      // 2. Get or create push subscription in the browser
      const reg = await registerSW();
      if (!reg) return false;

      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
        });
      }

      // 3. Send subscription to backend
      const token = localStorage.getItem('authToken');
      const subRes = await fetch(`${API_CONFIG.API_URL}/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (subRes.ok) {
        setIsSubscribed(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Push subscribe error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    if (Notification.permission === 'denied') {
      setPermission('denied');
      return false;
    }
    const result = await Notification.requestPermission();
    setPermission(result as PermissionState);
    if (result === 'granted') {
      return subscribe();
    }
    return false;
  }, [isSupported, subscribe]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isSupported) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) return;

      const token = localStorage.getItem('authToken');
      await fetch(`${API_CONFIG.API_URL}/push/unsubscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      await subscription.unsubscribe();
      setIsSubscribed(false);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  return {
    permission,
    isSubscribed,
    isLoading,
    isSupported,
    requestPermission,
    unsubscribe,
  };
};
