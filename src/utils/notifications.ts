import { InventoryItem } from '../types/inventory';
import { formatReadableDate, getDaysRemaining, getExpiryUrgency, getTodayDateString } from './expiry';

const REMINDER_ENABLED_KEY = 'shelfline_reminders_enabled_v1';
const LAST_NOTIFIED_DATE_KEY = 'shelfline_last_9am_notify_v1';
const NOTIFIED_ITEMS_KEY_PREFIX = 'shelfline_notified_items_';

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg)
      .catch(() => null);
  }
  return swRegistrationPromise;
}

export function isRemindersEnabled(): boolean {
  try {
    return window.localStorage.getItem(REMINDER_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setRemindersEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(REMINDER_ENABLED_KEY, String(enabled));
  } catch {
    // Ignore storage errors
  }
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestReminderPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  await registerNotificationServiceWorker();
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function isItemEarlyReminderDue(item: InventoryItem): boolean {
  if (typeof item.earlyReminderDays !== 'number' || item.earlyReminderDays < 1) {
    return false;
  }
  return getDaysRemaining(item.expiryDate) <= item.earlyReminderDays;
}

export function getExpiringWithin3Days(items: InventoryItem[]): InventoryItem[] {
  return items
    .filter((item) => getDaysRemaining(item.expiryDate) <= 3)
    .sort((a, b) => getDaysRemaining(a.expiryDate) - getDaysRemaining(b.expiryDate));
}

export function getEarlyReminderDueItems(items: InventoryItem[]): InventoryItem[] {
  return items
    .filter((item) => isItemEarlyReminderDue(item))
    .sort((a, b) => getDaysRemaining(a.expiryDate) - getDaysRemaining(b.expiryDate));
}

export function getAllNotificationDueItems(items: InventoryItem[]): InventoryItem[] {
  return items
    .filter(
      (item) => getDaysRemaining(item.expiryDate) <= 3 || isItemEarlyReminderDue(item)
    )
    .sort((a, b) => getDaysRemaining(a.expiryDate) - getDaysRemaining(b.expiryDate));
}

function describeDaysLeft(days: number): string {
  if (days < 0) {
    const ago = Math.abs(days);
    return ago === 1 ? 'expired 1 day ago' : `expired ${ago} days ago`;
  }
  if (days === 0) return 'expires today';
  if (days === 1) return 'expires tomorrow';
  return `expires in ${days} days`;
}

export function formatThreeDayAlert(urgentItems: InventoryItem[]): {
  title: string;
  body: string;
} {
  if (urgentItems.length === 0) {
    return {
      title: 'Shelfline Expiry Check',
      body: 'No items are within 3 days of expiring or due for early refill right now.',
    };
  }

  if (urgentItems.length === 1) {
    const item = urgentItems[0];
    const days = getDaysRemaining(item.expiryDate);
    const memberSuffix = item.assignedMemberName ? ` (for ${item.assignedMemberName})` : '';
    const isEarlyWindow =
      typeof item.earlyReminderDays === 'number' &&
      days > 3 &&
      days <= item.earlyReminderDays;

    if (isEarlyWindow) {
      return {
        title: `Get Early: ${item.name}${memberSuffix}`,
        body: `${
          item.assignedMemberName ? `${item.assignedMemberName}'s ` : ''
        }${item.name} (${item.category}) ${describeDaysLeft(days)} (${formatReadableDate(
          item.expiryDate
        )}) — ${item.earlyReminderDays}-day early reminder.`,
      };
    }

    return {
      title: `Expiring Soon: ${item.name}${memberSuffix}`,
      body: `${
        item.assignedMemberName ? `${item.assignedMemberName}'s ` : ''
      }${item.name} (${item.category}) ${describeDaysLeft(days)} (${formatReadableDate(
        item.expiryDate
      )}).`,
    };
  }

  const previewList = urgentItems
    .slice(0, 3)
    .map((item) => {
      const d = getDaysRemaining(item.expiryDate);
      const tag = d < 0 ? 'expired' : d === 0 ? 'today' : `${d}d`;
      const who = item.assignedMemberName ? ` · ${item.assignedMemberName}` : '';
      return `${item.name}${who} (${tag})`;
    })
    .join(', ');
  const extra = urgentItems.length > 3 ? ` +${urgentItems.length - 3} more` : '';

  return {
    title: `${urgentItems.length} pantry & medicine reminders due`,
    body: `${previewList}${extra}. Open Shelfline to use or refill early.`,
  };
}

export function buildExpiryAlertSummary(items: InventoryItem[]): {
  redItems: InventoryItem[];
  yellowItems: InventoryItem[];
  earlyItems: InventoryItem[];
  title: string;
  body: string;
} {
  const redItems: InventoryItem[] = [];
  const yellowItems: InventoryItem[] = [];
  const earlyItems: InventoryItem[] = [];

  for (const item of items) {
    const days = getDaysRemaining(item.expiryDate);
    const urgency = getExpiryUrgency(days);
    if (urgency === 'critical') redItems.push(item);
    else if (urgency === 'warning') yellowItems.push(item);

    if (isItemEarlyReminderDue(item)) {
      earlyItems.push(item);
    }
  }

  redItems.sort((a, b) => getDaysRemaining(a.expiryDate) - getDaysRemaining(b.expiryDate));
  yellowItems.sort((a, b) => getDaysRemaining(a.expiryDate) - getDaysRemaining(b.expiryDate));
  earlyItems.sort((a, b) => getDaysRemaining(a.expiryDate) - getDaysRemaining(b.expiryDate));

  const dueNow = getAllNotificationDueItems(items);
  if (dueNow.length > 0) {
    const alert = formatThreeDayAlert(dueNow);
    const remainingYellow = yellowItems.filter(
      (y) => !dueNow.some((d) => d.id === y.id)
    );
    const bodyWithYellow =
      remainingYellow.length > 0
        ? `${alert.body} Plus ${remainingYellow.length} more under a week.`
        : alert.body;
    return {
      redItems,
      yellowItems,
      earlyItems,
      title: alert.title,
      body: bodyWithYellow,
    };
  }

  if (yellowItems.length > 0) {
    const names = yellowItems
      .slice(0, 2)
      .map((i) => i.name)
      .join(', ');
    return {
      redItems,
      yellowItems,
      earlyItems,
      title: `Shelfline Check · ${yellowItems.length} item${yellowItems.length === 1 ? '' : 's'} under a week`,
      body: `${names}${yellowItems.length > 2 ? '…' : ''} — plan to use soon.`,
    };
  }

  return {
    redItems,
    yellowItems,
    earlyItems,
    title: 'Shelfline Morning Check',
    body: 'Everything on your shelf is fresh — nothing expiring soon.',
  };
}

export async function dispatchSystemNotification(
  title: string,
  body: string,
  tag = 'shelfline-expiry-alert'
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  try {
    const reg = await registerNotificationServiceWorker();
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(title, {
        body,
        tag,
        renotify: true,
      } as NotificationOptions);
      return true;
    }
  } catch {
    // Fall through to window.Notification
  }

  try {
    new Notification(title, { body, tag });
    return true;
  } catch {
    return false;
  }
}

export async function sendLocalExpiryNotification(items: InventoryItem[]): Promise<{
  sentBrowserNotification: boolean;
  summary: ReturnType<typeof buildExpiryAlertSummary>;
}> {
  const summary = buildExpiryAlertSummary(items);
  const sentBrowserNotification = await dispatchSystemNotification(
    summary.title,
    summary.body,
    'shelfline-daily-expiry'
  );
  return { sentBrowserNotification, summary };
}

function getNotifiedIdsForToday(todayIso: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(`${NOTIFIED_ITEMS_KEY_PREFIX}${todayIso}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveNotifiedIdsForToday(todayIso: string, ids: Set<string>): void {
  try {
    window.localStorage.setItem(
      `${NOTIFIED_ITEMS_KEY_PREFIX}${todayIso}`,
      JSON.stringify(Array.from(ids))
    );
  } catch {
    // Ignore storage errors
  }
}

/**
 * Checks if any items are within 3 days of expiring OR within their custom early reminder window.
 * Sends a notification explicitly naming the item and assigned family member.
 */
export async function checkAndNotifyWithin3Days(
  items: InventoryItem[],
  options: { force?: boolean } = {}
): Promise<{
  triggered: boolean;
  sentBrowserNotification: boolean;
  urgentItems: InventoryItem[];
  title: string;
  body: string;
}> {
  const urgentItems = getAllNotificationDueItems(items);
  if (urgentItems.length === 0) {
    const emptyAlert = formatThreeDayAlert([]);
    return {
      triggered: false,
      sentBrowserNotification: false,
      urgentItems: [],
      ...emptyAlert,
    };
  }

  const todayIso = getTodayDateString();
  const alreadyNotified = getNotifiedIdsForToday(todayIso);
  const newlyUrgent = options.force
    ? urgentItems
    : urgentItems.filter((item) => !alreadyNotified.has(item.id));

  if (newlyUrgent.length === 0) {
    const alert = formatThreeDayAlert(urgentItems);
    return {
      triggered: false,
      sentBrowserNotification: false,
      urgentItems,
      ...alert,
    };
  }

  const alert = formatThreeDayAlert(newlyUrgent);
  const sentBrowserNotification = await dispatchSystemNotification(
    alert.title,
    alert.body,
    `shelfline-3day-${todayIso}`
  );

  for (const item of newlyUrgent) {
    alreadyNotified.add(item.id);
  }
  saveNotifiedIdsForToday(todayIso, alreadyNotified);

  return {
    triggered: true,
    sentBrowserNotification,
    urgentItems: newlyUrgent,
    ...alert,
  };
}

/**
 * Returns milliseconds until the next 09:00 AM local time.
 */
export function msUntilNext9Am(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
  if (now.getTime() >= next.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

export function markTodayNotified(todayIso: string): void {
  try {
    window.localStorage.setItem(LAST_NOTIFIED_DATE_KEY, todayIso);
  } catch {
    // Ignore
  }
}

export function wasTodayNotified(todayIso: string): boolean {
  try {
    return window.localStorage.getItem(LAST_NOTIFIED_DATE_KEY) === todayIso;
  } catch {
    return false;
  }
}
