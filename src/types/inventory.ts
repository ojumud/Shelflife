export type Category = 'Fridge' | 'Skincare' | 'Medicine';

export type CategoryFilter = 'All' | Category;

export type ExpiryUrgency = 'critical' | 'warning' | 'safe';

export type ExpiryGroup = 'expiring-soon' | 'fresh';

export type ViewTab = 'all' | 'expiring-soon' | 'fresh' | 'shopping';

export type SortOption = 'soonest' | 'name';

export type PantryRole = 'owner' | 'member';

export interface InventoryItem {
  id: string;
  name: string;
  category: Category;
  expiryDate: string; // YYYY-MM-DD effective expiry date
  printedExpiryDate?: string; // YYYY-MM-DD optional box/bottle date
  openedDate?: string; // YYYY-MM-DD optional opened date for PAO
  paoMonths?: number; // 1..60 months after opening
  note?: string;
  brand?: string;
  barcode?: string;
  photoUrl?: string;
  createdBy?: string;
  createdAt: number;
}

export interface ShoppingListItem {
  id: string;
  name: string;
  category: Category;
  checked: boolean;
  addedBy?: string;
  createdAt: number;
}

export interface WasteEvent {
  id: string;
  itemName: string;
  category: Category;
  outcome: 'consumed' | 'trashed';
  recordedBy?: string;
  recordedAt: number;
}

export interface PantryInfo {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
}

export interface PantryMember {
  uid: string;
  role: PantryRole;
  displayName: string;
  isAnonymous: boolean;
}

export interface ScannedDraftItem {
  tempId: string;
  name: string;
  category: Category;
  expiryDate: string;
  note?: string;
  selected: boolean;
}

export interface RescueRecipe {
  title: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  usedIngredients: string[];
  missingIngredients: string[];
  pantryStaples: string[];
  steps: string[];
  tip: string;
}

export const CATEGORIES: Category[] = ['Fridge', 'Skincare', 'Medicine'];
export const PAO_MONTH_OPTIONS = [3, 6, 12, 18, 24] as const;
