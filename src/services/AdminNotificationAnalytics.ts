import { getCurrentSession } from '../config/supabase';

export type DailyCount = { date: string; count: number };
export type TokenAnalytics = {
  total: number; active: number; inactive: number; unknownStatus: number;
  authenticated: number; guest: number; unknownAuth: number; missingSubscriptionDates: number;
  daily: DailyCount[];
};
export type BroadcastAnalytics = {
  broadcasts: number; withDeliveryData: number; targeted: number; accepted: number;
  failed: number; invalid: number; recordedOpens: number | null; daily: DailyCount[];
};

export async function getAdminNotificationAnalytics<T>(tab: 'tokens' | 'notifications'): Promise<T> {
  const session = await getCurrentSession();
  if (!session?.access_token) throw new Error('Please sign in as an administrator.');
  const response = await fetch('/.netlify/functions/admin-notification-analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ tab }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Unable to load notification analytics.');
  return result.data as T;
}
