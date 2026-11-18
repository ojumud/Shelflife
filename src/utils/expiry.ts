import { ExpiryGroup, ExpiryUrgency, InventoryItem } from '../types/inventory';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns today's date as YYYY-MM-DD in local time.
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds a number of days to today in local time and returns YYYY-MM-DD.
 */
export function addDaysToToday(offsetDays: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds months to a YYYY-MM-DD date string safely (clamping end-of-month).
 */
export function addMonthsToDateString(baseDateStr: string, months: number): string {
  const base = parseLocalDate(baseDateStr);
  const targetMonth = base.getMonth() + months;
  const target = new Date(base.getFullYear(), targetMonth, base.getDate());
  // Clamp overflow (e.g., Jan 31 + 1 month -> Feb 28/29)
  if (target.getDate() !== base.getDate()) {
    target.setDate(0);
  }
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes effective expiry date considering an optional printed expiry and PAO (Opened On + months).
 * Whichever comes sooner becomes the effective expiry date.
 */
export function computeEffectiveExpiryDate(params: {
  printedExpiryDate?: string;
  usePao: boolean;
  openedDate?: string;
  paoMonths?: number;
}): string {
  const { printedExpiryDate, usePao, openedDate, paoMonths } = params;
  if (!usePao || !openedDate || !paoMonths) {
    return printedExpiryDate || addDaysToToday(7);
  }
  const paoExpiry = addMonthsToDateString(openedDate, paoMonths);
  if (!printedExpiryDate) {
    return paoExpiry;
  }
  return paoExpiry < printedExpiryDate ? paoExpiry : printedExpiryDate;
}

/**
 * Parses a YYYY-MM-DD string as local midnight to avoid UTC offset issues.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Computes exact whole days remaining from today (local midnight) to expiryDate.
 * Negative means expired, 0 means expires today.
 */
export function getDaysRemaining(expiryDateStr: string): number {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expiryMidnight = parseLocalDate(expiryDateStr);
  return Math.round((expiryMidnight.getTime() - todayMidnight.getTime()) / MS_PER_DAY);
}

/**
 * Maps days remaining to visual strip urgency:
 * - Red ('critical'): 3 days or less (<= 3, including today and expired)
 * - Yellow ('warning'): less than a week left (4 to 6 days)
 * - Green ('safe'): 7 days or more (>= 7)
 */
export function getExpiryUrgency(daysRemaining: number): ExpiryUrgency {
  if (daysRemaining <= 3) return 'critical';
  if (daysRemaining < 7) return 'warning';
  return 'safe';
}

/**
 * Automatically groups items into "Expiring Soon" (< 7 days left) and "Fresh" (>= 7 days left).
 */
export function getExpiryGroup(daysRemaining: number): ExpiryGroup {
  return daysRemaining < 7 ? 'expiring-soon' : 'fresh';
}

export interface CountdownDisplay {
  primary: string;
  secondary: string;
  urgencyText: string;
}

export function formatCountdown(daysRemaining: number): CountdownDisplay {
  if (daysRemaining < 0) {
    const overdue = Math.abs(daysRemaining);
    return {
      primary: overdue === 1 ? '1d ago' : `${overdue}d ago`,
      secondary: 'Expired',
      urgencyText: 'Expired',
    };
  }
  if (daysRemaining === 0) {
    return {
      primary: 'Today',
      secondary: 'Expires today',
      urgencyText: 'Urgent',
    };
  }
  if (daysRemaining === 1) {
    return {
      primary: '1 day',
      secondary: 'Tomorrow',
      urgencyText: 'Urgent',
    };
  }
  if (daysRemaining <= 3) {
    return {
      primary: `${daysRemaining} days`,
      secondary: '3 days or less',
      urgencyText: 'Urgent',
    };
  }
  if (daysRemaining < 7) {
    return {
      primary: `${daysRemaining} days`,
      secondary: 'Under a week',
      urgencyText: 'Use soon',
    };
  }
  if (daysRemaining < 60) {
    return {
      primary: `${daysRemaining} days`,
      secondary: 'Safe',
      urgencyText: 'Fresh',
    };
  }
  const months = Math.round(daysRemaining / 30);
  return {
    primary: `${months} mo`,
    secondary: `${daysRemaining} days`,
    urgencyText: 'Fresh',
  };
}

export function formatReadableDate(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatShortDate(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatHeaderToday(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function createStarterItems(): InventoryItem[] {
  const now = Date.now();
  return [
    {
      id: 'item-spinach',
      name: 'Organic Baby Spinach',
      category: 'Fridge',
      expiryDate: addDaysToToday(1),
      printedExpiryDate: addDaysToToday(1),
      note: 'Half clamshell',
      createdAt: now - 10000,
    },
    {
      id: 'item-oatmilk',
      name: 'Barista Oat Milk',
      category: 'Fridge',
      expiryDate: addDaysToToday(2),
      printedExpiryDate: addDaysToToday(2),
      note: 'Opened carton',
      createdAt: now - 9000,
    },
    {
      id: 'item-vitc',
      name: 'Vitamin C 15% Brightening Serum',
      category: 'Skincare',
      expiryDate: addDaysToToday(3),
      printedExpiryDate: addDaysToToday(320),
      openedDate: addDaysToToday(-87),
      paoMonths: 3,
      note: 'Discard once amber darkens',
      createdAt: now - 8000,
    },
    {
      id: 'item-eyedrops',
      name: 'Preservative-Free Lubricant Eye Drops',
      category: 'Medicine',
      expiryDate: addDaysToToday(4),
      printedExpiryDate: addDaysToToday(240),
      openedDate: addDaysToToday(-26),
      paoMonths: 1,
      note: 'Use within 1M of opening',
      createdAt: now - 7000,
    },
    {
      id: 'item-yogurt',
      name: 'Strained Greek Yogurt 5%',
      category: 'Fridge',
      expiryDate: addDaysToToday(5),
      printedExpiryDate: addDaysToToday(5),
      note: '500g tub',
      createdAt: now - 6000,
    },
    {
      id: 'item-sunscreen',
      name: 'Mineral Daily SPF 50 Fluid',
      category: 'Skincare',
      expiryDate: addDaysToToday(6),
      printedExpiryDate: addDaysToToday(6),
      note: 'Travel tube',
      createdAt: now - 5000,
    },
    {
      id: 'item-cheddar',
      name: 'Aged Farmhouse Sharp Cheddar',
      category: 'Fridge',
      expiryDate: addDaysToToday(14),
      printedExpiryDate: addDaysToToday(14),
      note: 'Sealed block',
      createdAt: now - 4000,
    },
    {
      id: 'item-ceramide',
      name: 'Ceramide Barrier Repair Cream',
      category: 'Skincare',
      expiryDate: addDaysToToday(32),
      printedExpiryDate: addDaysToToday(400),
      openedDate: addDaysToToday(-148),
      paoMonths: 6,
      note: 'Night routine',
      createdAt: now - 3000,
    },
    {
      id: 'item-ibuprofen',
      name: 'Ibuprofen 200mg Coated Caplets',
      category: 'Medicine',
      expiryDate: addDaysToToday(54),
      printedExpiryDate: addDaysToToday(54),
      note: 'Cabinet top shelf',
      createdAt: now - 2000,
    },
    {
      id: 'item-vitd3',
      name: 'Vitamin D3 2000 IU Softgels',
      category: 'Medicine',
      expiryDate: addDaysToToday(115),
      printedExpiryDate: addDaysToToday(115),
      note: '90-count bottle',
      createdAt: now - 1000,
    },
  ];
}
