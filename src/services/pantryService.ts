import {
  AuthProvider,
  EmailAuthProvider,
  User,
  createUserWithEmailAndPassword,
  linkWithCredential,
  linkWithPopup,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  Unsubscribe,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  OperationType,
  appleProvider,
  auth,
  db,
  githubProvider,
  googleProvider,
  handleFirestoreError,
  microsoftProvider,
} from '../lib/firebase';
import {
  CATEGORIES,
  Category,
  FamilyLink,
  InventoryItem,
  PantryInfo,
  PantryMember,
  PantryRole,
  ShoppingListItem,
  WasteEvent,
} from '../types/inventory';
import { createStarterItems } from '../utils/expiry';

export interface UserBootstrapResult {
  activePantryId: string;
  personalPantryId: string;
  displayName: string;
  notificationsEnabled?: boolean;
}

function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  return cleaned || `id_${Date.now()}`;
}

function sanitizeCategory(raw: unknown): Category {
  return CATEGORIES.includes(raw as Category) ? (raw as Category) : 'Fridge';
}

function sanitizeDateStr(raw: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
}

function timestampToMs(ts: unknown): number {
  if (
    ts &&
    typeof ts === 'object' &&
    'toMillis' in ts &&
    typeof (ts as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

function mapFirebaseAuthError(error: unknown): Error {
  const code = (error as { code?: string })?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return new Error('An account with this email already exists. Try logging in instead.');
    case 'auth/account-exists-with-different-credential':
      return new Error(
        'An account with this email already exists using a different sign-in method (such as Google or Email). Please sign in with that method first.'
      );
    case 'auth/invalid-email':
      return new Error('Please enter a valid email address.');
    case 'auth/weak-password':
      return new Error('Password must be at least 6 characters.');
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return new Error('Incorrect email or password. Please check your credentials.');
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return new Error(
        'This sign-in method is not enabled yet in Firebase Console (Authentication > Sign-in method). Enable it there or choose another sign-in option.'
      );
    case 'auth/popup-blocked':
      return new Error('Sign-in popup was blocked by your browser. Please allow popups and try again.');
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return new Error('Sign-in popup was closed before completing.');
    default:
      return error instanceof Error ? error : new Error('Authentication failed.');
  }
}

async function syncMemberIdentity(user: User, displayName: string): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;

  const data = userSnap.data();
  const batch = writeBatch(db);
  const userUpdate: Record<string, unknown> = {
    displayName: displayName.slice(0, 60),
    isAnonymous: user.isAnonymous,
    updatedAt: serverTimestamp(),
  };
  if (user.email) {
    userUpdate.email = user.email.slice(0, 120);
  }
  batch.update(userRef, userUpdate);

  if (data.activePantryId) {
    batch.update(doc(db, 'pantries', String(data.activePantryId), 'members', user.uid), {
      displayName: displayName.slice(0, 60),
      isAnonymous: user.isAnonymous,
    });
  }
  await batch.commit();
}

export async function tryAnonymousGuestSignIn(): Promise<{
  user: User | null;
  anonymousDisabled: boolean;
}> {
  if (auth.currentUser) {
    return { user: auth.currentUser, anonymousDisabled: false };
  }
  try {
    const cred = await signInAnonymously(auth);
    return { user: cred.user, anonymousDisabled: false };
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (
      code === 'auth/operation-not-allowed' ||
      code === 'auth/admin-restricted-operation'
    ) {
      return { user: null, anonymousDisabled: true };
    }
    console.warn('Anonymous sign-in fallback to local guest mode:', error);
    return { user: null, anonymousDisabled: false };
  }
}

async function continueWithOAuthProvider(provider: AuthProvider): Promise<{
  user: User;
  linkedFromGuest: boolean;
}> {
  const current = auth.currentUser;
  if (current && current.isAnonymous) {
    try {
      const result = await linkWithPopup(current, provider);
      const displayName = (
        result.user.displayName ||
        result.user.email?.split('@')[0] ||
        'Household Member'
      ).slice(0, 60);
      await syncMemberIdentity(result.user, displayName).catch(() => {});
      return { user: result.user, linkedFromGuest: true };
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      if (
        code !== 'auth/credential-already-in-use' &&
        code !== 'auth/email-already-in-use'
      ) {
        throw mapFirebaseAuthError(error);
      }
      // Fall through to standard sign-in for an existing account
    }
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return { user: result.user, linkedFromGuest: false };
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }
}

export function continueWithGoogle() {
  return continueWithOAuthProvider(googleProvider);
}

export function continueWithApple() {
  return continueWithOAuthProvider(appleProvider);
}

export function continueWithGithub() {
  return continueWithOAuthProvider(githubProvider);
}

export function continueWithMicrosoft() {
  return continueWithOAuthProvider(microsoftProvider);
}

export async function signUpWithEmail(params: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user: User; linkedFromGuest: boolean }> {
  const cleanName = params.name.trim().slice(0, 60) || 'Pantry Member';
  const cleanEmail = params.email.trim().toLowerCase();
  const current = auth.currentUser;

  if (current && current.isAnonymous) {
    try {
      const cred = EmailAuthProvider.credential(cleanEmail, params.password);
      const result = await linkWithCredential(current, cred);
      await updateProfile(result.user, { displayName: cleanName });
      await syncMemberIdentity(result.user, cleanName);
      return { user: result.user, linkedFromGuest: true };
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        throw new Error('This email is already registered. Switch to Log In to access your saved pantry.');
      }
      throw mapFirebaseAuthError(error);
    }
  }

  try {
    const result = await createUserWithEmailAndPassword(auth, cleanEmail, params.password);
    await updateProfile(result.user, { displayName: cleanName });
    return { user: result.user, linkedFromGuest: false };
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }
}

export async function logInWithEmail(params: {
  email: string;
  password: string;
}): Promise<User> {
  const cleanEmail = params.email.trim().toLowerCase();
  try {
    const result = await signInWithEmailAndPassword(auth, cleanEmail, params.password);
    return result.user;
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

export async function updateUserNotificationPreference(
  userId: string,
  enabled: boolean
): Promise<void> {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      notificationsEnabled: enabled,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function bootstrapUserPantry(
  user: User,
  localItemsToMigrate?: InventoryItem[]
): Promise<UserBootstrapResult> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  let userSnap;
  try {
    userSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  if (userSnap.exists()) {
    const data = userSnap.data();
    const latestName = (
      user.displayName ||
      String(data.displayName || (user.isAnonymous ? 'Guest' : 'Member'))
    ).slice(0, 60);

    // Keep user metadata up to date on subsequent logins
    if (
      latestName !== data.displayName ||
      Boolean(user.isAnonymous) !== Boolean(data.isAnonymous) ||
      (user.email && user.email !== data.email)
    ) {
      try {
        await updateDoc(userRef, {
          displayName: latestName,
          ...(user.email ? { email: user.email.slice(0, 120) } : {}),
          isAnonymous: user.isAnonymous,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, userPath);
      }
    }

    const existingActiveId = String(data.activePantryId);
    const existingPersonalId = String(data.personalPantryId || data.activePantryId);

    // Ensure private family link index is populated for existing accounts
    const ensureFamilyLink = async (targetPantryId: string, fallbackRole: PantryRole) => {
      const linkRef = doc(db, 'users', user.uid, 'families', targetPantryId);
      const linkSnap = await getDoc(linkRef).catch(() => null);
      if (linkSnap && linkSnap.exists()) return;
      const pantrySnap = await getDoc(doc(db, 'pantries', targetPantryId)).catch(() => null);
      if (!pantrySnap || !pantrySnap.exists()) return;
      const pData = pantrySnap.data();
      const role: PantryRole =
        pData.ownerId === user.uid ? 'owner' : fallbackRole;
      await setDoc(linkRef, {
        pantryId: targetPantryId,
        name: String(pData.name || 'My Pantry').slice(0, 60),
        role,
        joinedAt: serverTimestamp(),
      }).catch(() => {});
    };

    await ensureFamilyLink(existingPersonalId, 'owner');
    if (existingActiveId !== existingPersonalId) {
      await ensureFamilyLink(existingActiveId, 'member');
    }

    return {
      activePantryId: existingActiveId,
      personalPantryId: existingPersonalId,
      displayName: latestName,
      notificationsEnabled:
        typeof data.notificationsEnabled === 'boolean'
          ? data.notificationsEnabled
          : undefined,
    };
  }

  const personalPantryId = sanitizeId(`pantry_${user.uid}`);
  const inviteCode = generateSixDigitCode();
  const displayName = (
    user.displayName ||
    (user.email ? user.email.split('@')[0] : null) ||
    (user.isAnonymous ? 'Guest' : 'Pantry Owner')
  ).slice(0, 60);
  const pantryName = user.isAnonymous
    ? 'My Pantry'
    : `${displayName.split(' ')[0]}'s Pantry`.slice(0, 60);

  const batch = writeBatch(db);
  batch.set(doc(db, 'pantries', personalPantryId), {
    name: pantryName,
    ownerId: user.uid,
    inviteCode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'pantries', personalPantryId, 'members', user.uid), {
    uid: user.uid,
    role: 'owner',
    displayName,
    isAnonymous: user.isAnonymous,
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'invites', inviteCode), {
    inviteCode,
    pantryId: personalPantryId,
    pantryName,
    ownerId: user.uid,
    createdAt: serverTimestamp(),
  });

  const userProfilePayload: Record<string, unknown> = {
    uid: user.uid,
    displayName,
    activePantryId: personalPantryId,
    personalPantryId,
    isAnonymous: user.isAnonymous,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (user.email) {
    userProfilePayload.email = user.email.slice(0, 120);
  }
  batch.set(userRef, userProfilePayload);

  batch.set(doc(db, 'users', user.uid, 'families', personalPantryId), {
    pantryId: personalPantryId,
    name: pantryName,
    role: 'owner',
    joinedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `pantries/${personalPantryId}`);
  }

  // Seed initial items only after the pantry & member doc exist in Firestore
  // so item create rules (isPantryMember) evaluate cleanly.
  const seedItems =
    localItemsToMigrate && localItemsToMigrate.length > 0
      ? localItemsToMigrate
      : createStarterItems();

  if (seedItems.length > 0) {
    const itemsBatch = writeBatch(db);
    for (const item of seedItems) {
      const itemId = sanitizeId(
        item.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      );
      const payload: Record<string, unknown> = {
        name: item.name.trim().slice(0, 80) || 'Pantry Item',
        category: sanitizeCategory(item.category),
        expiryDate: sanitizeDateStr(item.expiryDate),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (item.printedExpiryDate) {
        payload.printedExpiryDate = sanitizeDateStr(item.printedExpiryDate);
      }
      if (item.openedDate) payload.openedDate = sanitizeDateStr(item.openedDate);
      if (typeof item.paoMonths === 'number' && item.paoMonths >= 1 && item.paoMonths <= 60) {
        payload.paoMonths = Math.round(item.paoMonths);
      }
      if (item.assignedMemberId && sanitizeId(item.assignedMemberId)) {
        payload.assignedMemberId = sanitizeId(item.assignedMemberId);
      }
      if (item.assignedMemberName?.trim()) {
        payload.assignedMemberName = item.assignedMemberName.trim().slice(0, 60);
      }
      if (
        typeof item.earlyReminderDays === 'number' &&
        item.earlyReminderDays >= 1 &&
        item.earlyReminderDays <= 60
      ) {
        payload.earlyReminderDays = Math.round(item.earlyReminderDays);
      }
      if (item.note) payload.note = item.note.trim().slice(0, 120);
      if (item.brand) payload.brand = item.brand.trim().slice(0, 80);
      if (item.barcode) payload.barcode = item.barcode.trim().slice(0, 32);
      if (item.photoUrl) payload.photoUrl = item.photoUrl.trim().slice(0, 500);

      itemsBatch.set(doc(db, 'pantries', personalPantryId, 'items', itemId), payload);
    }

    try {
      await itemsBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `pantries/${personalPantryId}/items`);
    }
  }

  return {
    activePantryId: personalPantryId,
    personalPantryId,
    displayName,
  };
}

export function subscribePantryWorkspace(
  pantryId: string,
  callbacks: {
    onPantry: (pantry: PantryInfo | null) => void;
    onMembers: (members: PantryMember[]) => void;
    onItems: (items: InventoryItem[]) => void;
    onShoppingList: (items: ShoppingListItem[]) => void;
    onHistory: (events: WasteEvent[]) => void;
  }
): () => void {
  const unsubs: Unsubscribe[] = [];

  const pantryPath = `pantries/${pantryId}`;
  unsubs.push(
    onSnapshot(
      doc(db, 'pantries', pantryId),
      (snap) => {
        if (!snap.exists()) {
          callbacks.onPantry(null);
          return;
        }
        const d = snap.data();
        callbacks.onPantry({
          id: snap.id,
          name: String(d.name || 'My Pantry'),
          ownerId: String(d.ownerId || ''),
          inviteCode: String(d.inviteCode || ''),
        });
      },
      (error) => handleFirestoreError(error, OperationType.GET, pantryPath)
    )
  );

  const membersPath = `pantries/${pantryId}/members`;
  unsubs.push(
    onSnapshot(
      collection(db, 'pantries', pantryId, 'members'),
      (snap) => {
        const list: PantryMember[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            uid: String(d.uid || docSnap.id),
            role: d.role === 'owner' ? 'owner' : 'member',
            displayName: String(d.displayName || 'Member'),
            isAnonymous: Boolean(d.isAnonymous),
          };
        });
        callbacks.onMembers(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, membersPath)
    )
  );

  const itemsPath = `pantries/${pantryId}/items`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'pantries', pantryId, 'items'), orderBy('createdAt', 'desc')),
      (snap) => {
        const list: InventoryItem[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            name: String(d.name || ''),
            category: sanitizeCategory(d.category),
            expiryDate: String(d.expiryDate || ''),
            printedExpiryDate: d.printedExpiryDate ? String(d.printedExpiryDate) : undefined,
            openedDate: d.openedDate ? String(d.openedDate) : undefined,
            paoMonths: typeof d.paoMonths === 'number' ? d.paoMonths : undefined,
            assignedMemberId: d.assignedMemberId ? String(d.assignedMemberId) : undefined,
            assignedMemberName: d.assignedMemberName ? String(d.assignedMemberName) : undefined,
            earlyReminderDays:
              typeof d.earlyReminderDays === 'number' ? d.earlyReminderDays : undefined,
            note: d.note ? String(d.note) : undefined,
            brand: d.brand ? String(d.brand) : undefined,
            barcode: d.barcode ? String(d.barcode) : undefined,
            photoUrl: d.photoUrl ? String(d.photoUrl) : undefined,
            createdBy: d.createdBy ? String(d.createdBy) : undefined,
            createdAt: timestampToMs(d.createdAt),
          };
        });
        callbacks.onItems(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, itemsPath)
    )
  );

  const shoppingPath = `pantries/${pantryId}/shoppingList`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'pantries', pantryId, 'shoppingList'), orderBy('createdAt', 'desc')),
      (snap) => {
        const list: ShoppingListItem[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            name: String(d.name || ''),
            category: sanitizeCategory(d.category),
            checked: Boolean(d.checked),
            addedBy: d.addedBy ? String(d.addedBy) : undefined,
            createdAt: timestampToMs(d.createdAt),
          };
        });
        callbacks.onShoppingList(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, shoppingPath)
    )
  );

  const historyPath = `pantries/${pantryId}/history`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'pantries', pantryId, 'history'), orderBy('recordedAt', 'desc')),
      (snap) => {
        const list: WasteEvent[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            itemName: String(d.itemName || ''),
            category: sanitizeCategory(d.category),
            outcome: d.outcome === 'trashed' ? 'trashed' : 'consumed',
            recordedBy: d.recordedBy ? String(d.recordedBy) : undefined,
            recordedAt: timestampToMs(d.recordedAt),
          };
        });
        callbacks.onHistory(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, historyPath)
    )
  );

  return () => {
    unsubs.forEach((unsub) => unsub());
  };
}

export async function savePantryItem(
  pantryId: string,
  userId: string,
  data: {
    id?: string;
    name: string;
    category: Category;
    expiryDate: string;
    printedExpiryDate?: string;
    openedDate?: string;
    paoMonths?: number;
    assignedMemberId?: string;
    assignedMemberName?: string;
    earlyReminderDays?: number;
    note?: string;
    brand?: string;
    barcode?: string;
    photoUrl?: string;
  }
): Promise<string> {
  const itemId = sanitizeId(
    data.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );
  const path = `pantries/${pantryId}/items/${itemId}`;
  const ref = doc(db, 'pantries', pantryId, 'items', itemId);

  const cleanMemberId = data.assignedMemberId
    ? data.assignedMemberId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128)
    : '';
  const cleanMemberName = data.assignedMemberName
    ? data.assignedMemberName.trim().slice(0, 60)
    : '';
  const validEarlyDays =
    typeof data.earlyReminderDays === 'number' &&
    data.earlyReminderDays >= 1 &&
    data.earlyReminderDays <= 60
      ? Math.round(data.earlyReminderDays)
      : undefined;

  try {
    if (data.id) {
      const updatePayload: Record<string, unknown> = {
        name: data.name.trim().slice(0, 80),
        category: sanitizeCategory(data.category),
        expiryDate: sanitizeDateStr(data.expiryDate),
        printedExpiryDate: data.printedExpiryDate
          ? sanitizeDateStr(data.printedExpiryDate)
          : deleteField(),
        openedDate: data.openedDate ? sanitizeDateStr(data.openedDate) : deleteField(),
        paoMonths:
          typeof data.paoMonths === 'number' && data.paoMonths >= 1 && data.paoMonths <= 60
            ? Math.round(data.paoMonths)
            : deleteField(),
        assignedMemberId: cleanMemberId || deleteField(),
        assignedMemberName: cleanMemberName || deleteField(),
        earlyReminderDays: validEarlyDays ?? deleteField(),
        note: data.note?.trim() ? data.note.trim().slice(0, 120) : deleteField(),
        brand: data.brand?.trim() ? data.brand.trim().slice(0, 80) : deleteField(),
        barcode: data.barcode?.trim() ? data.barcode.trim().slice(0, 32) : deleteField(),
        photoUrl: data.photoUrl?.trim() ? data.photoUrl.trim().slice(0, 500) : deleteField(),
        updatedAt: serverTimestamp(),
      };
      await updateDoc(ref, updatePayload);
    } else {
      const createPayload: Record<string, unknown> = {
        name: data.name.trim().slice(0, 80),
        category: sanitizeCategory(data.category),
        expiryDate: sanitizeDateStr(data.expiryDate),
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (data.printedExpiryDate) {
        createPayload.printedExpiryDate = sanitizeDateStr(data.printedExpiryDate);
      }
      if (data.openedDate) {
        createPayload.openedDate = sanitizeDateStr(data.openedDate);
      }
      if (typeof data.paoMonths === 'number' && data.paoMonths >= 1 && data.paoMonths <= 60) {
        createPayload.paoMonths = Math.round(data.paoMonths);
      }
      if (cleanMemberId) createPayload.assignedMemberId = cleanMemberId;
      if (cleanMemberName) createPayload.assignedMemberName = cleanMemberName;
      if (typeof validEarlyDays === 'number') {
        createPayload.earlyReminderDays = validEarlyDays;
      }
      if (data.note?.trim()) createPayload.note = data.note.trim().slice(0, 120);
      if (data.brand?.trim()) createPayload.brand = data.brand.trim().slice(0, 80);
      if (data.barcode?.trim()) createPayload.barcode = data.barcode.trim().slice(0, 32);
      if (data.photoUrl?.trim()) createPayload.photoUrl = data.photoUrl.trim().slice(0, 500);

      await setDoc(ref, createPayload);
    }
    return itemId;
  } catch (error) {
    handleFirestoreError(error, data.id ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function removePantryItem(pantryId: string, itemId: string): Promise<void> {
  const path = `pantries/${pantryId}/items/${itemId}`;
  try {
    await deleteDoc(doc(db, 'pantries', pantryId, 'items', itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function recordWasteOutcome(
  pantryId: string,
  userId: string,
  item: InventoryItem,
  outcome: 'consumed' | 'trashed'
): Promise<void> {
  const eventId = sanitizeId(`evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'pantries', pantryId, 'items', item.id));
  batch.set(doc(db, 'pantries', pantryId, 'history', eventId), {
    itemName: item.name.trim().slice(0, 80),
    category: sanitizeCategory(item.category),
    outcome,
    recordedBy: userId,
    recordedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `pantries/${pantryId}/history/${eventId}`);
  }
}

export async function addShoppingListItem(
  pantryId: string,
  userId: string,
  name: string,
  category: Category
): Promise<void> {
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) return;
  const shopId = sanitizeId(`shop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const path = `pantries/${pantryId}/shoppingList/${shopId}`;
  try {
    await setDoc(doc(db, 'pantries', pantryId, 'shoppingList', shopId), {
      name: cleanName,
      category: sanitizeCategory(category),
      checked: false,
      addedBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function addShoppingListItemsBatch(
  pantryId: string,
  userId: string,
  names: string[],
  category: Category = 'Fridge'
): Promise<void> {
  const cleanedNames = names
    .map((n) => n.trim().slice(0, 80))
    .filter((n) => n.length > 0);
  if (cleanedNames.length === 0) return;

  const batch = writeBatch(db);
  const sanitizedCategory = sanitizeCategory(category);
  const baseTs = Date.now();

  cleanedNames.forEach((cleanName, index) => {
    const shopId = sanitizeId(
      `shop_${baseTs}_${index}_${Math.random().toString(36).slice(2, 6)}`
    );
    batch.set(doc(db, 'pantries', pantryId, 'shoppingList', shopId), {
      name: cleanName,
      category: sanitizedCategory,
      checked: false,
      addedBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `pantries/${pantryId}/shoppingList`);
  }
}

export async function toggleShoppingListItem(
  pantryId: string,
  shopItemId: string,
  checked: boolean
): Promise<void> {
  const path = `pantries/${pantryId}/shoppingList/${shopItemId}`;
  try {
    await updateDoc(doc(db, 'pantries', pantryId, 'shoppingList', shopItemId), {
      checked,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteShoppingListItem(
  pantryId: string,
  shopItemId: string
): Promise<void> {
  const path = `pantries/${pantryId}/shoppingList/${shopItemId}`;
  try {
    await deleteDoc(doc(db, 'pantries', pantryId, 'shoppingList', shopItemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserFamilies(
  userId: string,
  onFamilies: (families: FamilyLink[]) => void
): () => void {
  const familiesPath = `users/${userId}/families`;
  return onSnapshot(
    query(collection(db, 'users', userId, 'families'), orderBy('joinedAt', 'asc')),
    (snap) => {
      const list: FamilyLink[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          pantryId: String(d.pantryId || docSnap.id),
          name: String(d.name || 'My Pantry'),
          role: d.role === 'owner' ? 'owner' : 'member',
          joinedAt: timestampToMs(d.joinedAt),
        };
      });
      onFamilies(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, familiesPath)
  );
}

export async function createFamilyPantry(
  user: User,
  rawFamilyName: string
): Promise<{ pantryId: string; pantryName: string; inviteCode: string }> {
  if (user.isAnonymous) {
    throw new Error('Sign up or log in with an account to create a shared family.');
  }

  const familyName = rawFamilyName.trim().slice(0, 60);
  if (!familyName) {
    throw new Error('Enter a family name (e.g. Ojumu Family).');
  }

  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef).catch(() => null);
  if (!userSnap || !userSnap.exists()) {
    await bootstrapUserPantry(user);
  }

  const familyPantryId = sanitizeId(
    `family_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );
  const inviteCode = generateSixDigitCode();
  const displayName = (
    user.displayName ||
    (user.email ? user.email.split('@')[0] : null) ||
    'Family Organizer'
  ).slice(0, 60);

  const batch = writeBatch(db);
  batch.set(doc(db, 'pantries', familyPantryId), {
    name: familyName,
    ownerId: user.uid,
    inviteCode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'pantries', familyPantryId, 'members', user.uid), {
    uid: user.uid,
    role: 'owner',
    displayName,
    isAnonymous: user.isAnonymous,
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'invites', inviteCode), {
    inviteCode,
    pantryId: familyPantryId,
    pantryName: familyName,
    ownerId: user.uid,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', user.uid, 'families', familyPantryId), {
    pantryId: familyPantryId,
    name: familyName,
    role: 'owner',
    joinedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'users', user.uid), {
    activePantryId: familyPantryId,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `pantries/${familyPantryId}`);
  }

  return { pantryId: familyPantryId, pantryName: familyName, inviteCode };
}

export async function joinPantryByInviteCode(
  user: User,
  rawCode: string
): Promise<{ pantryId: string; pantryName: string }> {
  const code = rawCode.replace(/\D/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(code)) {
    throw new Error('Enter a valid 6-digit family invite code.');
  }

  const invitePath = `invites/${code}`;
  let inviteSnap;
  try {
    inviteSnap = await getDoc(doc(db, 'invites', code));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, invitePath);
  }

  if (!inviteSnap.exists()) {
    throw new Error('No family or pantry found for that 6-digit code.');
  }

  const inviteData = inviteSnap.data();
  const pantryId = String(inviteData.pantryId);
  const pantryName = String(inviteData.pantryName || 'Shared Family').slice(0, 60);
  const displayName = (
    user.displayName ||
    (user.email ? user.email.split('@')[0] : null) ||
    (user.isAnonymous ? 'Guest' : 'Member')
  ).slice(0, 60);

  const memberRef = doc(db, 'pantries', pantryId, 'members', user.uid);
  const memberSnap = await getDoc(memberRef).catch(() => null);
  let resolvedRole: PantryRole = 'member';

  if (!memberSnap || !memberSnap.exists()) {
    try {
      await setDoc(memberRef, {
        uid: user.uid,
        role: 'member',
        displayName,
        isAnonymous: user.isAnonymous,
        joinedViaCode: code,
        joinedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `pantries/${pantryId}/members/${user.uid}`);
    }
  } else {
    resolvedRole = memberSnap.data().role === 'owner' ? 'owner' : 'member';
  }

  const familyLinkRef = doc(db, 'users', user.uid, 'families', pantryId);
  const familyLinkSnap = await getDoc(familyLinkRef).catch(() => null);
  try {
    if (familyLinkSnap && familyLinkSnap.exists()) {
      await updateDoc(familyLinkRef, {
        name: pantryName,
        role: resolvedRole,
      });
    } else {
      await setDoc(familyLinkRef, {
        pantryId,
        name: pantryName,
        role: resolvedRole,
        joinedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/families/${pantryId}`);
  }

  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef).catch(() => null);
  if (!userSnap || !userSnap.exists()) {
    await bootstrapUserPantry(user);
  }

  try {
    await updateDoc(userRef, {
      activePantryId: pantryId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
  }

  return { pantryId, pantryName };
}

export async function switchActivePantry(userId: string, targetPantryId: string): Promise<void> {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      activePantryId: targetPantryId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function renamePantry(
  pantryId: string,
  newName: string,
  userId?: string
): Promise<void> {
  const trimmed = newName.trim().slice(0, 60);
  if (!trimmed) return;
  try {
    await updateDoc(doc(db, 'pantries', pantryId), {
      name: trimmed,
      updatedAt: serverTimestamp(),
    });
    if (userId) {
      const linkRef = doc(db, 'users', userId, 'families', pantryId);
      const linkSnap = await getDoc(linkRef).catch(() => null);
      if (linkSnap && linkSnap.exists()) {
        await updateDoc(linkRef, { name: trimmed }).catch(() => {});
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `pantries/${pantryId}`);
  }
}

export async function regeneratePantryInviteCode(
  pantry: PantryInfo,
  ownerId: string
): Promise<string> {
  const newCode = generateSixDigitCode();
  const batch = writeBatch(db);
  if (pantry.inviteCode && /^\d{6}$/.test(pantry.inviteCode)) {
    batch.delete(doc(db, 'invites', pantry.inviteCode));
  }
  batch.set(doc(db, 'invites', newCode), {
    inviteCode: newCode,
    pantryId: pantry.id,
    pantryName: pantry.name.slice(0, 60),
    ownerId,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'pantries', pantry.id), {
    inviteCode: newCode,
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `pantries/${pantry.id}`);
  }
  return newCode;
}

export async function removePantryMember(
  pantryId: string,
  memberId: string
): Promise<void> {
  const path = `pantries/${pantryId}/members/${memberId}`;
  try {
    await deleteDoc(doc(db, 'pantries', pantryId, 'members', memberId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function leaveSharedPantry(
  pantryId: string,
  userId: string,
  personalPantryId: string
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'pantries', pantryId, 'members', userId));
  batch.delete(doc(db, 'users', userId, 'families', pantryId));
  batch.update(doc(db, 'users', userId), {
    activePantryId: personalPantryId,
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `pantries/${pantryId}/members/${userId}`);
  }
}
