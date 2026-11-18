import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  ArrowDownUp,
  Bell,
  BellRing,
  Camera,
  CheckCircle2,
  ChefHat,
  Droplets,
  Layers,
  LogIn,
  Pill,
  Refrigerator,
  RotateCcw,
  Search,
  ShoppingBag,
  Undo2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  CATEGORIES,
  Category,
  CategoryFilter,
  InventoryItem,
  PantryInfo,
  PantryMember,
  ShoppingListItem,
  SortOption,
  ViewTab,
  WasteEvent,
} from './types/inventory';
import {
  addDaysToToday,
  createStarterItems,
  formatHeaderToday,
  getDaysRemaining,
  getExpiryGroup,
  getExpiryUrgency,
  getTodayDateString,
} from './utils/expiry';
import {
  checkAndNotifyWithin3Days,
  getExpiringWithin3Days,
  getNotificationPermissionState,
  isRemindersEnabled,
  markTodayNotified,
  msUntilNext9Am,
  registerNotificationServiceWorker,
  requestReminderPermission,
  sendLocalExpiryNotification,
  setRemindersEnabled,
  wasTodayNotified,
} from './utils/notifications';
import { auth } from './lib/firebase';
import {
  addShoppingListItem,
  addShoppingListItemsBatch,
  bootstrapUserPantry,
  continueWithGoogle,
  deleteShoppingListItem,
  joinPantryByInviteCode,
  leaveSharedPantry,
  logInWithEmail,
  recordWasteOutcome,
  regeneratePantryInviteCode,
  removePantryItem,
  removePantryMember,
  renamePantry,
  savePantryItem,
  signOutAccount,
  signUpWithEmail,
  subscribePantryWorkspace,
  switchActivePantry,
  toggleShoppingListItem,
  tryAnonymousGuestSignIn,
  updateUserNotificationPreference,
} from './services/pantryService';
import { ItemCard } from './components/ItemCard';
import { ItemSheetModal } from './components/ItemSheetModal';
import { FloatingAddButton } from './components/FloatingAddButton';
import { ScannerModal } from './components/ScannerModal';
import { RecipeModal } from './components/RecipeModal';
import { HouseholdSheetModal } from './components/HouseholdSheetModal';
import { ShoppingListView } from './components/ShoppingListView';
import { AuthModal } from './components/AuthModal';

const LOCAL_ITEMS_KEY = 'shelfline_inventory_v1';
const LOCAL_SHOPPING_KEY = 'shelfline_shopping_v1';
const LOCAL_HISTORY_KEY = 'shelfline_history_v1';

interface ActionToastState {
  id: number;
  message: string;
  item?: InventoryItem;
  outcome?: 'consumed' | 'trashed';
  showRestockPrompt?: boolean;
  restocked?: boolean;
}

function loadLocalArray<T>(key: string, fallback: () => T[]): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback();
  } catch {
    return fallback();
  }
}

const FILTER_OPTIONS: { value: CategoryFilter; label: string; icon: React.ReactNode }[] = [
  { value: 'All', label: 'All', icon: <Layers className="w-4 h-4 shrink-0" /> },
  { value: 'Fridge', label: 'Fridge', icon: <Refrigerator className="w-4 h-4 shrink-0" /> },
  { value: 'Skincare', label: 'Skincare', icon: <Droplets className="w-4 h-4 shrink-0" /> },
  { value: 'Medicine', label: 'Medicine', icon: <Pill className="w-4 h-4 shrink-0" /> },
];

export function App() {
  // Auth & Household Cloud State
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [anonymousDisabledHint, setAnonymousDisabledHint] = useState(false);
  const [activePantryId, setActivePantryId] = useState<string | null>(null);
  const [personalPantryId, setPersonalPantryId] = useState<string | null>(null);
  const [pantryInfo, setPantryInfo] = useState<PantryInfo | null>(null);
  const [members, setMembers] = useState<PantryMember[]>([]);

  // Local Guest Fallback State
  const [localItems, setLocalItems] = useState<InventoryItem[]>(() =>
    loadLocalArray<InventoryItem>(LOCAL_ITEMS_KEY, createStarterItems)
  );
  const [localShopping, setLocalShopping] = useState<ShoppingListItem[]>(() =>
    loadLocalArray<ShoppingListItem>(LOCAL_SHOPPING_KEY, () => [])
  );
  const [localHistory, setLocalHistory] = useState<WasteEvent[]>(() =>
    loadLocalArray<WasteEvent>(LOCAL_HISTORY_KEY, () => [])
  );

  // Cloud-synced collections
  const [cloudItems, setCloudItems] = useState<InventoryItem[]>([]);
  const [cloudShopping, setCloudShopping] = useState<ShoppingListItem[]>([]);
  const [cloudHistory, setCloudHistory] = useState<WasteEvent[]>([]);

  // UI Controls
  const [activeTab, setActiveTab] = useState<ViewTab>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('soonest');

  // Modals / Sheets
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isRecipeOpen, setIsRecipeOpen] = useState(false);
  const [isHouseholdOpen, setIsHouseholdOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState<'login' | 'signup'>('signup');

  // Push Notifications & Alerts
  const [remindersEnabled, setRemindersState] = useState<boolean>(isRemindersEnabled);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const localItemsRef = useRef(localItems);
  localItemsRef.current = localItems;

  const isCloudSynced = Boolean(firebaseUser && activePantryId);
  const isSignedInAccount = Boolean(firebaseUser && !firebaseUser.isAnonymous);
  const items = isCloudSynced ? cloudItems : localItems;
  const shoppingList = isCloudSynced ? cloudShopping : localShopping;
  const wasteHistory = isCloudSynced ? cloudHistory : localHistory;

  // Register Service Worker for Push/System Notifications on mount
  useEffect(() => {
    void registerNotificationServiceWorker();
  }, []);

  // Persist local guest state
  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(localItems));
    } catch {
      // Ignore storage errors
    }
  }, [localItems]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_SHOPPING_KEY, JSON.stringify(localShopping));
    } catch {
      // Ignore
    }
  }, [localShopping]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(localHistory));
    } catch {
      // Ignore
    }
  }, [localHistory]);

  // Firebase Auth initialization + Anonymous Guest Mode First
  useEffect(() => {
    let active = true;
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      if (user) {
        setFirebaseUser(user);
        setAuthReady(true);
        try {
          const bootstrapped = await bootstrapUserPantry(user, localItemsRef.current);
          if (!active) return;
          setActivePantryId(bootstrapped.activePantryId);
          setPersonalPantryId(bootstrapped.personalPantryId);
          if (typeof bootstrapped.notificationsEnabled === 'boolean') {
            setRemindersEnabled(bootstrapped.notificationsEnabled);
            setRemindersState(bootstrapped.notificationsEnabled);
          }
        } catch (err) {
          console.error('Failed to bootstrap pantry:', err);
        }
      } else {
        setFirebaseUser(null);
        setActivePantryId(null);
        setPersonalPantryId(null);
        setPantryInfo(null);
        setMembers([]);
        setCloudItems([]);
        setCloudShopping([]);
        setCloudHistory([]);
        const attempt = await tryAnonymousGuestSignIn();
        if (!active) return;
        if (attempt.anonymousDisabled) {
          setAnonymousDisabledHint(true);
        }
        setAuthReady(true);
      }
    });

    return () => {
      active = false;
      unsubAuth();
    };
  }, []);

  // Subscribe to active household pantry collections in Firestore
  useEffect(() => {
    if (!firebaseUser || !activePantryId) return;
    const unsub = subscribePantryWorkspace(activePantryId, {
      onPantry: setPantryInfo,
      onMembers: setMembers,
      onItems: setCloudItems,
      onShoppingList: setCloudShopping,
      onHistory: setCloudHistory,
    });
    return () => unsub();
  }, [firebaseUser, activePantryId]);

  // Immediate 3-Day Expiry Push Notification Watcher + 9:00 AM Daily Check
  useEffect(() => {
    if (!remindersEnabled || items.length === 0) return;

    let cancelled = false;
    void (async () => {
      const result = await checkAndNotifyWithin3Days(items);
      if (cancelled) return;
      if (result.triggered && !result.sentBrowserNotification) {
        showSimpleToast(`${result.title} — ${result.body}`);
      }
    })();

    const todayIso = getTodayDateString();
    const now = new Date();
    if (now.getHours() >= 9 && !wasTodayNotified(todayIso)) {
      void sendLocalExpiryNotification(items).then((res) => {
        markTodayNotified(todayIso);
        if (
          !res.sentBrowserNotification &&
          (res.summary.redItems.length > 0 || res.summary.yellowItems.length > 0)
        ) {
          showSimpleToast(`${res.summary.title} — ${res.summary.body}`);
        }
      });
    }

    const timerId = window.setTimeout(() => {
      const currentTodayIso = getTodayDateString();
      if (!wasTodayNotified(currentTodayIso)) {
        void sendLocalExpiryNotification(items);
        markTodayNotified(currentTodayIso);
      }
    }, msUntilNext9Am());

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remindersEnabled, items]);

  // Keyboard shortcut 'n' for quick add
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        isItemModalOpen ||
        isScannerOpen ||
        isRecipeOpen ||
        isHouseholdOpen ||
        isAuthOpen
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (!isTyping && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setEditingItem(null);
        setIsItemModalOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isItemModalOpen, isScannerOpen, isRecipeOpen, isHouseholdOpen, isAuthOpen]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showSimpleToast = (message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 5500);
  };

  const showFinishToast = (item: InventoryItem, outcome: 'consumed' | 'trashed') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({
      id: Date.now(),
      message: outcome === 'consumed' ? `Used up ${item.name}` : `Thrown away ${item.name}`,
      item,
      outcome,
      showRestockPrompt: outcome === 'consumed',
      restocked: false,
    });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 6500);
  };

  // Counts per category across full inventory
  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      All: items.length,
      Fridge: 0,
      Skincare: 0,
      Medicine: 0,
    };
    for (const item of items) {
      if (CATEGORIES.includes(item.category)) {
        counts[item.category] += 1;
      }
    }
    return counts;
  }, [items]);

  // Filtered by category & search query
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== 'All' && item.category !== categoryFilter) {
        return false;
      }
      if (q) {
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesNote = item.note?.toLowerCase().includes(q) ?? false;
        const matchesCat = item.category.toLowerCase().includes(q);
        return matchesName || matchesNote || matchesCat;
      }
      return true;
    });
  }, [items, categoryFilter, searchQuery]);

  // Urgency band counts
  const urgencyStats = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let safe = 0;
    for (const item of filteredItems) {
      const urgency = getExpiryUrgency(getDaysRemaining(item.expiryDate));
      if (urgency === 'critical') critical += 1;
      else if (urgency === 'warning') warning += 1;
      else safe += 1;
    }
    return { critical, warning, safe };
  }, [filteredItems]);

  const urgentWithin3Days = useMemo(() => getExpiringWithin3Days(items), [items]);

  // Group into Expiring Soon (<7d) and Fresh (>=7d)
  const { expiringSoonItems, freshItems } = useMemo(() => {
    const expiring: InventoryItem[] = [];
    const fresh: InventoryItem[] = [];

    for (const item of filteredItems) {
      const group = getExpiryGroup(getDaysRemaining(item.expiryDate));
      if (group === 'expiring-soon') expiring.push(item);
      else fresh.push(item);
    }

    const comparator = (a: InventoryItem, b: InventoryItem) => {
      if (sortOption === 'name') {
        return a.name.localeCompare(b.name);
      }
      const diff = getDaysRemaining(a.expiryDate) - getDaysRemaining(b.expiryDate);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    };

    expiring.sort(comparator);
    fresh.sort(comparator);

    return { expiringSoonItems: expiring, freshItems: fresh };
  }, [filteredItems, sortOption]);

  // Fridge items eligible for "Cook With What's Expiring"
  const expiringFridgeItems = useMemo(() => {
    const fromExpiring = items.filter(
      (i) => i.category === 'Fridge' && getDaysRemaining(i.expiryDate) < 7
    );
    fromExpiring.sort(
      (a, b) => getDaysRemaining(a.expiryDate) - getDaysRemaining(b.expiryDate)
    );
    return fromExpiring;
  }, [items]);

  // Handlers
  const handleSaveItem = async (data: {
    id?: string;
    name: string;
    category: Category;
    expiryDate: string;
    printedExpiryDate?: string;
    openedDate?: string;
    paoMonths?: number;
    note?: string;
    brand?: string;
    barcode?: string;
    photoUrl?: string;
  }) => {
    setIsItemModalOpen(false);
    setEditingItem(null);

    if (isCloudSynced && firebaseUser && activePantryId) {
      await savePantryItem(activePantryId, firebaseUser.uid, data);
    } else if (data.id) {
      setLocalItems((prev) =>
        prev.map((item) =>
          item.id === data.id
            ? {
                ...item,
                name: data.name,
                category: data.category,
                expiryDate: data.expiryDate,
                printedExpiryDate: data.printedExpiryDate,
                openedDate: data.openedDate,
                paoMonths: data.paoMonths,
                note: data.note,
                brand: data.brand,
                barcode: data.barcode,
                photoUrl: data.photoUrl,
              }
            : item
        )
      );
    } else {
      const newItem: InventoryItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: data.name,
        category: data.category,
        expiryDate: data.expiryDate,
        printedExpiryDate: data.printedExpiryDate,
        openedDate: data.openedDate,
        paoMonths: data.paoMonths,
        note: data.note,
        brand: data.brand,
        barcode: data.barcode,
        photoUrl: data.photoUrl,
        createdAt: Date.now(),
      };
      setLocalItems((prev) => [newItem, ...prev]);
    }
  };

  const handleImportScannedItems = async (
    scanned: Array<{
      name: string;
      category: Category;
      expiryDate: string;
      note?: string;
    }>
  ) => {
    for (const entry of scanned) {
      await handleSaveItem({
        name: entry.name,
        category: entry.category,
        expiryDate: entry.expiryDate,
        printedExpiryDate: entry.expiryDate,
        note: entry.note,
      });
    }
    showSimpleToast(
      `Added ${scanned.length} scanned ${scanned.length === 1 ? 'item' : 'items'}`
    );
  };

  const handleFinishItem = async (
    item: InventoryItem,
    outcome: 'consumed' | 'trashed'
  ) => {
    if (isCloudSynced && firebaseUser && activePantryId) {
      await recordWasteOutcome(activePantryId, firebaseUser.uid, item, outcome);
    } else {
      setLocalItems((prev) => prev.filter((e) => e.id !== item.id));
      setLocalHistory((prev) => [
        {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          itemName: item.name,
          category: item.category,
          outcome,
          recordedAt: Date.now(),
        },
        ...prev,
      ]);
    }
    showFinishToast(item, outcome);
  };

  const handleDeleteItem = async (item: InventoryItem) => {
    setIsItemModalOpen(false);
    setEditingItem(null);
    if (isCloudSynced && activePantryId) {
      await removePantryItem(activePantryId, item.id);
    } else {
      setLocalItems((prev) => prev.filter((e) => e.id !== item.id));
    }
    setToast({
      id: Date.now(),
      message: `Deleted ${item.name}`,
      item,
    });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
  };

  const handleUndoToast = async () => {
    if (!toast?.item) return;
    const restored = toast.item;
    setToast(null);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);

    if (isCloudSynced && firebaseUser && activePantryId) {
      await savePantryItem(activePantryId, firebaseUser.uid, {
        id: restored.id,
        name: restored.name,
        category: restored.category,
        expiryDate: restored.expiryDate,
        printedExpiryDate: restored.printedExpiryDate,
        openedDate: restored.openedDate,
        paoMonths: restored.paoMonths,
        note: restored.note,
        brand: restored.brand,
        barcode: restored.barcode,
        photoUrl: restored.photoUrl,
      });
    } else {
      setLocalItems((prev) => [restored, ...prev]);
    }
  };

  const handleAddShoppingItem = async (name: string, category: Category) => {
    if (isCloudSynced && firebaseUser && activePantryId) {
      await addShoppingListItem(activePantryId, firebaseUser.uid, name, category);
    } else {
      setLocalShopping((prev) => [
        {
          id: `shop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: name.trim().slice(0, 80),
          category,
          checked: false,
          createdAt: Date.now(),
        },
        ...prev,
      ]);
    }
  };

  const handleAddMissingIngredientsToShoppingList = async (
    ingredientNames: string[]
  ): Promise<number> => {
    const existingActive = new Set(
      shoppingList
        .filter((item) => !item.checked)
        .map((item) => item.name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim())
    );

    const uniqueToAdd: string[] = [];
    const seenIncoming = new Set<string>();

    for (const rawName of ingredientNames) {
      const cleanName = rawName.trim().slice(0, 80);
      const norm = cleanName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleanName || !norm) continue;
      if (existingActive.has(norm) || seenIncoming.has(norm)) continue;
      seenIncoming.add(norm);
      uniqueToAdd.push(cleanName);
    }

    if (uniqueToAdd.length === 0) {
      showSimpleToast('All missing ingredients are already on your Shopping List');
      return 0;
    }

    if (isCloudSynced && firebaseUser && activePantryId) {
      await addShoppingListItemsBatch(
        activePantryId,
        firebaseUser.uid,
        uniqueToAdd,
        'Fridge'
      );
    } else {
      const now = Date.now();
      const created: ShoppingListItem[] = uniqueToAdd.map((name, idx) => ({
        id: `shop-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        category: 'Fridge',
        checked: false,
        createdAt: now + idx,
      }));
      setLocalShopping((prev) => [...created, ...prev]);
    }

    showSimpleToast(
      uniqueToAdd.length === 1
        ? `Added ${uniqueToAdd[0]} to Shopping List`
        : `Added ${uniqueToAdd.length} missing ingredients to Shopping List`
    );
    return uniqueToAdd.length;
  };

  const handleOneTapRestockFromToast = async () => {
    if (!toast?.item) return;
    const item = toast.item;
    await handleAddShoppingItem(item.name, item.category);
    setToast((prev) =>
      prev ? { ...prev, restocked: true, showRestockPrompt: false } : null
    );
  };

  const handleToggleShoppingItem = async (item: ShoppingListItem) => {
    if (isCloudSynced && activePantryId) {
      await toggleShoppingListItem(activePantryId, item.id, !item.checked);
    } else {
      setLocalShopping((prev) =>
        prev.map((e) => (e.id === item.id ? { ...e, checked: !e.checked } : e))
      );
    }
  };

  const handleDeleteShoppingItem = async (item: ShoppingListItem) => {
    if (isCloudSynced && activePantryId) {
      await deleteShoppingListItem(activePantryId, item.id);
    } else {
      setLocalShopping((prev) => prev.filter((e) => e.id !== item.id));
    }
  };

  const handleRestockToPantry = async (shopItem: ShoppingListItem) => {
    const defaultDays =
      shopItem.category === 'Fridge' ? 10 : shopItem.category === 'Skincare' ? 180 : 365;
    await handleSaveItem({
      name: shopItem.name,
      category: shopItem.category,
      expiryDate: addDaysToToday(defaultDays),
      printedExpiryDate: addDaysToToday(defaultDays),
      note: 'Restocked from Shopping List',
    });
    await handleDeleteShoppingItem(shopItem);
    showSimpleToast(`Restocked ${shopItem.name} to pantry`);
  };

  const handleRestoreSamples = async () => {
    const starters = createStarterItems();
    if (isCloudSynced && firebaseUser && activePantryId) {
      for (const item of starters) {
        await savePantryItem(activePantryId, firebaseUser.uid, {
          name: item.name,
          category: item.category,
          expiryDate: item.expiryDate,
          printedExpiryDate: item.printedExpiryDate,
          openedDate: item.openedDate,
          paoMonths: item.paoMonths,
          note: item.note,
        });
      }
    } else {
      setLocalItems(starters);
    }
    setCategoryFilter('All');
    setSearchQuery('');
    setActiveTab('all');
  };

  const handleEnablePushNotifications = async () => {
    const perm = await requestReminderPermission();
    setRemindersEnabled(true);
    setRemindersState(true);
    if (firebaseUser) {
      void updateUserNotificationPreference(firebaseUser.uid, true).catch(() => {});
    }

    const alertResult = await checkAndNotifyWithin3Days(items, { force: true });
    if (perm === 'granted' && alertResult.sentBrowserNotification) {
      showSimpleToast('3-day expiry push notifications enabled');
    } else {
      showSimpleToast(`${alertResult.title} — ${alertResult.body}`);
    }
  };

  const handleToggleReminders = async () => {
    if (!remindersEnabled) {
      await handleEnablePushNotifications();
    } else {
      setRemindersEnabled(false);
      setRemindersState(false);
      if (firebaseUser) {
        void updateUserNotificationPreference(firebaseUser.uid, false).catch(() => {});
      }
    }
  };

  const handleTestNotification = async () => {
    if (getNotificationPermissionState() === 'default') {
      await requestReminderPermission();
    }
    const res = await checkAndNotifyWithin3Days(items, { force: true });
    if (res.sentBrowserNotification) {
      showSimpleToast(`Sent push alert: ${res.title}`);
    } else {
      showSimpleToast(`${res.title} — ${res.body}`);
    }
  };

  const openAuthModal = (tab: 'login' | 'signup') => {
    setAuthInitialTab(tab);
    setIsAuthOpen(true);
  };

  const defaultModalCategory: Category =
    categoryFilter === 'All' ? 'Fridge' : categoryFilter;
  const totalFilteredCount = expiringSoonItems.length + freshItems.length;
  const hasActiveFilters = categoryFilter !== 'All' || searchQuery.trim().length > 0;
  const uncheckedShoppingCount = shoppingList.filter((i) => !i.checked).length;

  return (
    <div className="min-h-screen bg-[#F6F6F3] text-zinc-900 pb-28">
      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-30 bg-[#F6F6F3]/92 backdrop-blur-md border-b border-zinc-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('all');
                setCategoryFilter('All');
                setSearchQuery('');
              }}
              className="font-display text-xl font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0"
            >
              Shelfline
            </a>
            <span className="hidden md:inline text-xs text-zinc-500 whitespace-nowrap">
              {formatHeaderToday()}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-zinc-200/90 text-xs sm:text-sm font-medium text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Camera className="w-4 h-4 text-zinc-600" />
              <span className="hidden sm:inline">Scan</span>
            </button>

            <button
              type="button"
              onClick={() => setIsHouseholdOpen(true)}
              aria-label="Household sharing and alert settings"
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-zinc-200/90 text-xs sm:text-sm font-medium text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {remindersEnabled ? (
                <Bell className="w-4 h-4 text-emerald-700" />
              ) : (
                <Users className="w-4 h-4 text-zinc-600" />
              )}
              <span className="hidden sm:inline max-w-[100px] truncate">
                {isCloudSynced ? pantryInfo?.name || 'Household' : 'Alerts'}
              </span>
            </button>

            {isSignedInAccount ? (
              <button
                type="button"
                onClick={() => setIsHouseholdOpen(true)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-zinc-900 text-white text-xs sm:text-sm font-medium hover:bg-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="max-w-[96px] truncate">
                  {firebaseUser?.displayName?.split(' ')[0] ||
                    firebaseUser?.email?.split('@')[0] ||
                    'Account'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                disabled={!authReady}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-zinc-900 text-white text-xs sm:text-sm font-semibold hover:bg-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span>Log In / Sign Up</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="top" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        {/* Friendly Guest Sign-Up Banner + Push Notification Prompt */}
        {!bannerDismissed && (!remindersEnabled || !isSignedInAccount) && (
          <div className="mb-5 rounded-2xl bg-white border border-zinc-200/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-800 flex items-center justify-center shrink-0">
                {!remindersEnabled ? (
                  <BellRing className="w-4 h-4" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0 text-xs sm:text-sm text-zinc-700">
                {!remindersEnabled ? (
                  <span>
                    <strong className="font-semibold text-zinc-900">
                      Get 3-day expiry push alerts:
                    </strong>{' '}
                    {urgentWithin3Days.length > 0
                      ? `Be notified immediately when items like ${urgentWithin3Days[0].name} are within 3 days of expiring.`
                      : 'Receive a notification with the item name whenever anything is within 3 days of expiring.'}
                  </span>
                ) : (
                  <span>
                    <strong className="font-semibold text-zinc-900">
                      Save your pantry across devices:
                    </strong>{' '}
                    Create a free account or log in so your inventory stays backed up whenever you return.
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {!remindersEnabled ? (
                <button
                  type="button"
                  onClick={() => void handleEnablePushNotifications()}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
                >
                  Enable Alerts
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openAuthModal('login')}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-zinc-100 text-zinc-800 text-xs font-semibold hover:bg-zinc-200 whitespace-nowrap cursor-pointer"
                  >
                    Log In
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuthModal('signup')}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
                  >
                    Sign Up
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                aria-label="Dismiss banner"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Page Heading + Category Filter Pills */}
        <section aria-label="Inventory overview and category filters">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 text-balance">
                Pantry &amp; Shelf Expiry
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {isSignedInAccount
                  ? `Signed in as ${
                      firebaseUser?.displayName || firebaseUser?.email || 'Member'
                    } · ${pantryInfo?.name || 'My Pantry'} · Data synced to cloud`
                  : isCloudSynced
                  ? `${pantryInfo?.name || 'Guest Pantry'} · Sign up anytime to keep your data across devices`
                  : 'Guest Mode active · Swipe right if used up, left if trashed'}
              </p>
            </div>
          </div>

          {/* Filter Pills at the top for categories */}
          {activeTab !== 'shopping' && (
            <>
              <div
                className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
                role="group"
                aria-label="Filter by category"
              >
                {FILTER_OPTIONS.map((option) => {
                  const active = categoryFilter === option.value;
                  const count = categoryCounts[option.value];
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCategoryFilter(option.value)}
                      className={`min-h-[42px] px-4 py-2 rounded-full text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F6F3] cursor-pointer ${
                        active
                          ? 'bg-zinc-900 text-white shadow-sm'
                          : 'bg-white text-zinc-700 border border-zinc-200/90 hover:border-zinc-300 hover:text-zinc-900'
                      }`}
                    >
                      {option.icon}
                      <span>{option.label}</span>
                      <span
                        className={`font-mono tabular-nums text-xs ${
                          active ? 'text-zinc-300' : 'text-zinc-400'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Compact 3-band Color Strip Summary */}
              <div className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('expiring-soon')}
                  className="flex items-stretch bg-white rounded-2xl border border-zinc-200/85 overflow-hidden text-left hover:border-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 cursor-pointer"
                >
                  <div className="w-1.5 sm:w-2 bg-red-600 shrink-0" aria-hidden="true" />
                  <div className="px-3 py-3 sm:px-4 sm:py-3.5 min-w-0">
                    <div className="font-mono tabular-nums text-xl sm:text-2xl font-bold text-zinc-900 leading-none">
                      {urgencyStats.critical}
                    </div>
                    <div className="mt-1.5 text-[11px] sm:text-xs font-medium text-zinc-600 truncate">
                      3 days or less
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('expiring-soon')}
                  className="flex items-stretch bg-white rounded-2xl border border-zinc-200/85 overflow-hidden text-left hover:border-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 cursor-pointer"
                >
                  <div className="w-1.5 sm:w-2 bg-yellow-400 shrink-0" aria-hidden="true" />
                  <div className="px-3 py-3 sm:px-4 sm:py-3.5 min-w-0">
                    <div className="font-mono tabular-nums text-xl sm:text-2xl font-bold text-zinc-900 leading-none">
                      {urgencyStats.warning}
                    </div>
                    <div className="mt-1.5 text-[11px] sm:text-xs font-medium text-zinc-600 truncate">
                      Under a week
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('fresh')}
                  className="flex items-stretch bg-white rounded-2xl border border-zinc-200/85 overflow-hidden text-left hover:border-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 cursor-pointer"
                >
                  <div className="w-1.5 sm:w-2 bg-emerald-600 shrink-0" aria-hidden="true" />
                  <div className="px-3 py-3 sm:px-4 sm:py-3.5 min-w-0">
                    <div className="font-mono tabular-nums text-xl sm:text-2xl font-bold text-zinc-900 leading-none">
                      {urgencyStats.safe}
                    </div>
                    <div className="mt-1.5 text-[11px] sm:text-xs font-medium text-zinc-600 truncate">
                      Safe &amp; fresh
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}
        </section>

        {/* Single Tabbed Screen Controls + Search & Sort */}
        <section
          className="mt-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-zinc-200/80"
          aria-label="View tabs and search"
        >
          {/* Segmented View Tabs */}
          <div
            role="tablist"
            aria-label="Pantry views"
            className="flex items-center p-1 rounded-xl bg-zinc-200/70 overflow-x-auto no-scrollbar w-full lg:w-auto"
          >
            {(
              [
                { id: 'all', label: 'All Items', count: totalFilteredCount },
                { id: 'expiring-soon', label: 'Expiring Soon', count: expiringSoonItems.length },
                { id: 'fresh', label: 'Fresh', count: freshItems.length },
                { id: 'shopping', label: 'Shopping List', count: uncheckedShoppingCount },
              ] as const
            ).map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 lg:flex-initial min-h-[40px] px-3 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
                    selected
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {tab.id === 'shopping' && (
                    <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono tabular-nums text-[11px] ${
                      selected ? 'text-zinc-500' : 'text-zinc-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search & Sort Controls (Inventory views) */}
          {activeTab !== 'shopping' && (
            <div className="flex items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-56">
                <Search
                  className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search items..."
                  aria-label="Search inventory items"
                  className="w-full min-h-[42px] pl-9 pr-9 py-2 rounded-xl bg-white border border-zinc-200/90 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  setSortOption((prev) => (prev === 'soonest' ? 'name' : 'soonest'))
                }
                aria-label={`Sort order: ${sortOption === 'soonest' ? 'Soonest first' : 'Name A to Z'}`}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white border border-zinc-200/90 text-xs sm:text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:border-zinc-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <ArrowDownUp className="w-3.5 h-3.5 text-zinc-500" />
                <span>{sortOption === 'soonest' ? 'Soonest' : 'A–Z'}</span>
              </button>
            </div>
          )}
        </section>

        {/* Tab Panel Content */}
        <div className="mt-6 space-y-10" role="tabpanel">
          {activeTab === 'shopping' ? (
            <ShoppingListView
              shoppingList={shoppingList}
              wasteHistory={wasteHistory}
              onAddShoppingItem={(name, category) => void handleAddShoppingItem(name, category)}
              onToggleShoppingItem={(item) => void handleToggleShoppingItem(item)}
              onDeleteShoppingItem={(item) => void handleDeleteShoppingItem(item)}
              onRestockToPantry={(item) => void handleRestockToPantry(item)}
            />
          ) : totalFilteredCount === 0 ? (
            <div className="py-16 px-6 text-center bg-white rounded-2xl border border-zinc-200/80">
              <div className="w-11 h-11 rounded-2xl bg-zinc-100 text-zinc-600 mx-auto flex items-center justify-center mb-4">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h2 className="font-display text-lg font-bold text-zinc-900">
                {items.length === 0 ? 'Your shelf is clear' : 'No matching items found'}
              </h2>
              <p className="mt-1.5 text-sm text-zinc-500 max-w-sm mx-auto">
                {items.length === 0
                  ? 'Tap + to add items, or tap Scan to read an EXP stamp or supermarket receipt.'
                  : 'Try switching categories or clearing your search query.'}
              </p>
              <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('All');
                      setSearchQuery('');
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    Clear Filters
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(null);
                        setIsItemModalOpen(true);
                      }}
                      className="min-h-[44px] px-5 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      Add First Item
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRestoreSamples()}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-100 text-zinc-700 text-sm font-medium hover:bg-zinc-200/80 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Load Sample Items</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* EXPIRING SOON GROUP */}
              {(activeTab === 'all' || activeTab === 'expiring-soon') && (
                <section aria-labelledby="heading-expiring-soon">
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5">
                    <div className="flex items-baseline gap-2.5">
                      <h2
                        id="heading-expiring-soon"
                        className="font-display text-lg sm:text-xl font-bold text-zinc-900 tracking-tight"
                      >
                        Expiring Soon
                      </h2>
                      <span className="font-mono tabular-nums text-xs sm:text-sm text-zinc-500">
                        {expiringSoonItems.length}
                      </span>
                      <span className="text-xs text-zinc-500 hidden sm:inline">
                        · Under 7 days left
                      </span>
                    </div>

                    {expiringFridgeItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsRecipeOpen(true)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs"
                      >
                        <ChefHat className="w-3.5 h-3.5" />
                        <span>Cook What&apos;s Expiring</span>
                      </button>
                    )}
                  </div>

                  {expiringSoonItems.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {expiringSoonItems.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          onEdit={(selected) => {
                            setEditingItem(selected);
                            setIsItemModalOpen(true);
                          }}
                          onFinish={(selected, outcome) =>
                            void handleFinishItem(selected, outcome)
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 px-5 bg-white rounded-2xl border border-zinc-200/80 text-center">
                      <p className="text-sm font-medium text-zinc-700">
                        Nothing expiring within the next 7 days.
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Everything in this view is safely stocked in Fresh.
                      </p>
                    </div>
                  )}
                </section>
              )}

              {/* FRESH GROUP */}
              {(activeTab === 'all' || activeTab === 'fresh') && (
                <section
                  aria-labelledby="heading-fresh"
                  className={activeTab === 'all' ? 'pt-2' : ''}
                >
                  <div className="flex items-baseline justify-between gap-4 mb-3.5">
                    <div className="flex items-baseline gap-2.5">
                      <h2
                        id="heading-fresh"
                        className="font-display text-lg sm:text-xl font-bold text-zinc-900 tracking-tight"
                      >
                        Fresh
                      </h2>
                      <span className="font-mono tabular-nums text-xs sm:text-sm text-zinc-500">
                        {freshItems.length}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-500">
                      7 days or more left
                    </span>
                  </div>

                  {freshItems.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {freshItems.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          onEdit={(selected) => {
                            setEditingItem(selected);
                            setIsItemModalOpen(true);
                          }}
                          onFinish={(selected, outcome) =>
                            void handleFinishItem(selected, outcome)
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 px-5 bg-white rounded-2xl border border-zinc-200/80 text-center">
                      <p className="text-sm font-medium text-zinc-700">
                        No fresh items in this filter yet.
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Items with 7 or more days remaining appear here automatically.
                      </p>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {/* Bottom-left Action / Alert Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-4 sm:left-8 right-24 sm:right-auto z-40 max-w-md bg-zinc-900 text-white rounded-2xl px-4 py-3 shadow-xl flex items-center justify-between gap-3 flex-wrap"
        >
          <span className="text-xs sm:text-sm line-clamp-2 max-w-[230px] sm:max-w-[280px]">
            {toast.restocked ? `Added ${toast.item?.name} to Shopping List` : toast.message}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {toast.showRestockPrompt && !toast.restocked && (
              <button
                type="button"
                onClick={() => void handleOneTapRestockFromToast()}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-zinc-950 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Restock</span>
              </button>
            )}
            {toast.item && (
              <button
                type="button"
                onClick={() => void handleUndoToast()}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/12 hover:bg-white/20 text-xs font-semibold text-white inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom-right Floating "+" Button */}
      <FloatingAddButton
        onClick={() => {
          setEditingItem(null);
          setIsItemModalOpen(true);
        }}
      />

      {/* Add / Edit Item Sheet Modal */}
      <ItemSheetModal
        isOpen={isItemModalOpen}
        editingItem={editingItem}
        defaultCategory={defaultModalCategory}
        onClose={() => {
          setIsItemModalOpen(false);
          setEditingItem(null);
        }}
        onSave={(data) => void handleSaveItem(data)}
        onDelete={(item) => void handleDeleteItem(item)}
      />

      {/* AI Camera Expiry & Receipt Scanner */}
      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onImportItems={(scanned) => void handleImportScannedItems(scanned)}
      />

      {/* "Cook With What's Dying" Rescue Recipe Generator */}
      <RecipeModal
        isOpen={isRecipeOpen}
        expiringFridgeItems={expiringFridgeItems}
        allPantryItems={items}
        shoppingList={shoppingList}
        onAddMissingToShoppingList={handleAddMissingIngredientsToShoppingList}
        onOpenShoppingList={() => {
          setIsRecipeOpen(false);
          setActiveTab('shopping');
        }}
        onClose={() => setIsRecipeOpen(false)}
      />

      {/* Dedicated Sign Up & Log In Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        initialTab={authInitialTab}
        isGuestDataPresent={items.length > 0}
        onClose={() => setIsAuthOpen(false)}
        onGoogleAuth={async () => {
          await continueWithGoogle();
          showSimpleToast('Signed in! Your pantry data is synced.');
        }}
        onEmailSignUp={async (data) => {
          await signUpWithEmail(data);
          showSimpleToast('Account created and pantry saved!');
        }}
        onEmailLogIn={async (data) => {
          await logInWithEmail(data);
          showSimpleToast('Welcome back! Loaded your saved pantry.');
        }}
      />

      {/* Household Sharing & Push Notification Settings */}
      <HouseholdSheetModal
        isOpen={isHouseholdOpen}
        isCloudSynced={isCloudSynced}
        anonymousDisabledHint={anonymousDisabledHint}
        isAnonymousUser={Boolean(firebaseUser?.isAnonymous)}
        userDisplayName={
          firebaseUser?.displayName ||
          firebaseUser?.email?.split('@')[0] ||
          (firebaseUser?.isAnonymous ? 'Guest' : 'Member')
        }
        userEmail={firebaseUser?.email ?? null}
        currentUid={firebaseUser?.uid ?? null}
        pantry={pantryInfo}
        personalPantryId={personalPantryId}
        members={members}
        wasteHistory={wasteHistory}
        remindersEnabled={remindersEnabled}
        onClose={() => setIsHouseholdOpen(false)}
        onOpenAuth={(tab) => openAuthModal(tab)}
        onSignOut={async () => {
          await signOutAccount();
        }}
        onJoinByCode={async (code) => {
          if (!firebaseUser) return;
          const res = await joinPantryByInviteCode(firebaseUser, code);
          setActivePantryId(res.pantryId);
        }}
        onSwitchToPersonal={async () => {
          if (!firebaseUser || !personalPantryId) return;
          await switchActivePantry(firebaseUser.uid, personalPantryId);
          setActivePantryId(personalPantryId);
        }}
        onRegenerateCode={async () => {
          if (!firebaseUser || !pantryInfo) return;
          await regeneratePantryInviteCode(pantryInfo, firebaseUser.uid);
        }}
        onRenamePantry={async (newName) => {
          if (!pantryInfo) return;
          await renamePantry(pantryInfo.id, newName);
        }}
        onRemoveMember={async (memberId) => {
          if (!pantryInfo) return;
          await removePantryMember(pantryInfo.id, memberId);
        }}
        onLeavePantry={async () => {
          if (!firebaseUser || !pantryInfo || !personalPantryId) return;
          await leaveSharedPantry(pantryInfo.id, firebaseUser.uid, personalPantryId);
          setActivePantryId(personalPantryId);
        }}
        onToggleReminders={handleToggleReminders}
        onTestNotification={() => void handleTestNotification()}
      />
    </div>
  );
}

export default App;
