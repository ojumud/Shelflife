import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChefHat,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react';
import { InventoryItem, RescueRecipe, ShoppingListItem } from '../types/inventory';
import { getDaysRemaining } from '../utils/expiry';

interface RecipeModalProps {
  isOpen: boolean;
  expiringFridgeItems: InventoryItem[];
  allPantryItems: InventoryItem[];
  shoppingList: ShoppingListItem[];
  onAddMissingToShoppingList: (names: string[]) => Promise<number>;
  onOpenShoppingList: () => void;
  onClose: () => void;
}

function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isIngredientCoveredByPantry(
  ingredient: string,
  pantryNames: string[]
): boolean {
  const normTarget = normalizeName(ingredient);
  if (!normTarget) return false;
  return pantryNames.some((pantryNorm) => {
    if (!pantryNorm) return false;
    if (pantryNorm === normTarget) return true;
    const targetWords = normTarget.split(' ').filter((w) => w.length > 2);
    const pantryWords = pantryNorm.split(' ').filter((w) => w.length > 2);
    if (targetWords.length === 0 || pantryWords.length === 0) return false;
    return (
      targetWords.every((w) => pantryNorm.includes(w)) ||
      pantryWords.every((w) => normTarget.includes(w))
    );
  });
}

export const RecipeModal: React.FC<RecipeModalProps> = ({
  isOpen,
  expiringFridgeItems,
  allPantryItems,
  shoppingList,
  onAddMissingToShoppingList,
  onOpenShoppingList,
  onClose,
}) => {
  const [recipes, setRecipes] = useState<RescueRecipe[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [addingSingle, setAddingSingle] = useState<string | null>(null);
  const [error, setError] = useState('');

  const generateRecipes = async () => {
    if (expiringFridgeItems.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const payload = expiringFridgeItems.map((item) => ({
        name: item.name,
        daysLeft: getDaysRemaining(item.expiryDate),
      }));
      const pantryNames = Array.from(
        new Set(allPantryItems.map((i) => i.name.trim()).filter(Boolean))
      );

      const res = await fetch('/api/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: payload,
          pantryItems: pantryNames,
        }),
      });
      const data = (await res.json()) as {
        recipe?: RescueRecipe;
        recipes?: RescueRecipe[];
        error?: string;
      };

      const nextRecipes =
        Array.isArray(data.recipes) && data.recipes.length > 0
          ? data.recipes
          : data.recipe
            ? [data.recipe]
            : [];

      if (!res.ok || nextRecipes.length === 0) {
        setError(data.error || 'Could not generate recipes right now.');
        return;
      }

      setRecipes(
        nextRecipes.map((r) => ({
          ...r,
          missingIngredients: Array.isArray(r.missingIngredients)
            ? r.missingIngredients
            : [],
          pantryStaples: Array.isArray(r.pantryStaples) ? r.pantryStaples : [],
          usedIngredients: Array.isArray(r.usedIngredients) ? r.usedIngredients : [],
          steps: Array.isArray(r.steps) ? r.steps : [],
        }))
      );
      setSelectedIndex(0);
    } catch {
      setError('Network error while generating your rescue recipes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setRecipes([]);
    setSelectedIndex(0);
    void generateRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const activeRecipe = recipes[selectedIndex] ?? null;

  const normalizedPantryNames = useMemo(
    () => allPantryItems.map((i) => normalizeName(i.name)).filter(Boolean),
    [allPantryItems]
  );

  const activeShoppingNames = useMemo(() => {
    const set = new Set<string>();
    shoppingList.forEach((item) => {
      if (!item.checked) {
        const norm = normalizeName(item.name);
        if (norm) set.add(norm);
      }
    });
    return set;
  }, [shoppingList]);

  const missingIngredients = useMemo(() => {
    if (!activeRecipe) return [];
    const seen = new Set<string>();
    return activeRecipe.missingIngredients.filter((ing) => {
      const norm = normalizeName(ing);
      if (!norm || seen.has(norm)) return false;
      seen.add(norm);
      return !isIngredientCoveredByPantry(ing, normalizedPantryNames);
    });
  }, [activeRecipe, normalizedPantryNames]);

  const remainingToAdd = useMemo(
    () =>
      missingIngredients.filter(
        (ing) => !activeShoppingNames.has(normalizeName(ing))
      ),
    [missingIngredients, activeShoppingNames]
  );

  const handleAddAllMissing = async () => {
    if (remainingToAdd.length === 0 || addingAll) return;
    setAddingAll(true);
    try {
      await onAddMissingToShoppingList(remainingToAdd);
    } finally {
      setAddingAll(false);
    }
  };

  const handleAddSingleMissing = async (ingredient: string) => {
    const norm = normalizeName(ingredient);
    if (!norm || activeShoppingNames.has(norm) || addingSingle) return;
    setAddingSingle(norm);
    try {
      await onAddMissingToShoppingList([ingredient]);
    } finally {
      setAddingSingle(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/45 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipe-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-zinc-200/80 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-zinc-300" aria-hidden="true" />
        </div>

        <div className="flex items-center justify-between px-5 sm:px-6 pt-3 sm:pt-5 pb-4 border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center shrink-0">
              <ChefHat className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="recipe-modal-title"
                className="font-display text-lg font-bold text-zinc-900 tracking-tight"
              >
                Cook With What&apos;s Expiring
              </h2>
              <p className="text-xs text-zinc-500">
                Choose a 15-minute rescue recipe &amp; add missing items in one click
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recipe dialog"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-zinc-700" />
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  Crafting rescue recipe ideas...
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Using{' '}
                  {expiringFridgeItems
                    .slice(0, 3)
                    .map((i) => i.name)
                    .join(', ')}
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 space-y-3">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void generateRecipes()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
            </div>
          ) : activeRecipe ? (
            <div className="space-y-5">
              {/* Recipe Chooser Tabs when multiple ideas are available */}
              {recipes.length > 1 && (
                <div
                  role="tablist"
                  aria-label="Choose a rescue recipe"
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                >
                  {recipes.map((opt, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={`${opt.title}-${idx}`}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => setSelectedIndex(idx)}
                        className={`min-h-[44px] text-left px-3 py-2 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-900 border-zinc-900 text-white shadow-xs'
                            : 'bg-zinc-50 border-zinc-200/80 text-zinc-700 hover:border-zinc-300 hover:bg-white'
                        }`}
                      >
                        <div className="text-xs font-semibold line-clamp-1">
                          {opt.title}
                        </div>
                        <div
                          className={`mt-0.5 text-[11px] tabular-nums ${
                            isSelected ? 'text-zinc-300' : 'text-zinc-500'
                          }`}
                        >
                          {opt.prepMinutes + opt.cookMinutes} min ·{' '}
                          {opt.missingIngredients.length} to buy
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div>
                <h3 className="font-display text-xl font-bold text-zinc-900 text-balance">
                  {activeRecipe.title}
                </h3>
                <div className="mt-2 flex items-center gap-3 text-xs text-zinc-600 font-medium">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    {activeRecipe.prepMinutes + activeRecipe.cookMinutes} min total
                  </span>
                  <span aria-hidden="true" className="text-zinc-300">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Users className="w-3.5 h-3.5 text-zinc-400" />
                    {activeRecipe.servings}{' '}
                    {activeRecipe.servings === 1 ? 'serving' : 'servings'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Used from Fridge / Pantry */}
                <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/70 p-3.5">
                  <div className="text-xs font-semibold text-emerald-900 mb-2">
                    In Your Fridge &amp; Pantry
                  </div>
                  <ul className="space-y-1 text-xs sm:text-sm text-emerald-950">
                    {activeRecipe.usedIngredients.map((ing, idx) => (
                      <li key={idx}>· {ing}</li>
                    ))}
                  </ul>
                  {activeRecipe.pantryStaples.length > 0 && (
                    <p className="mt-2.5 pt-2 border-t border-emerald-200/60 text-[11px] text-emerald-800/80">
                      Staples: {activeRecipe.pantryStaples.join(', ')}
                    </p>
                  )}
                </div>

                {/* Missing Ingredients + One-Click Shopping List Integration */}
                <div className="rounded-xl bg-zinc-50 border border-zinc-200/90 p-3.5 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold text-zinc-900">
                        Missing Ingredients
                      </span>
                      {missingIngredients.length > 0 && (
                        <span className="font-mono tabular-nums text-[11px] font-semibold text-zinc-500">
                          {remainingToAdd.length === 0
                            ? 'All in list'
                            : `${remainingToAdd.length} to add`}
                        </span>
                      )}
                    </div>

                    {missingIngredients.length === 0 ? (
                      <p className="text-xs text-zinc-600 leading-relaxed">
                        Nothing missing — you already have everything needed in your pantry.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {missingIngredients.map((ing, idx) => {
                          const norm = normalizeName(ing);
                          const inList = activeShoppingNames.has(norm);
                          const isAddingThis = addingSingle === norm;
                          return (
                            <li
                              key={`${norm}-${idx}`}
                              className="flex items-center justify-between gap-2 text-xs sm:text-sm text-zinc-800"
                            >
                              <span className="truncate">{ing}</span>
                              {inList ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 whitespace-nowrap shrink-0">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>In List</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={Boolean(addingSingle) || addingAll}
                                  onClick={() => void handleAddSingleMissing(ing)}
                                  aria-label={`Add ${ing} to shopping list`}
                                  className="min-h-[30px] px-2.5 py-1 rounded-lg bg-white border border-zinc-200 hover:border-zinc-400 text-[11px] font-semibold text-zinc-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                                >
                                  {isAddingThis ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Plus className="w-3 h-3" />
                                  )}
                                  <span>Add</span>
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {missingIngredients.length > 0 && (
                    <div className="pt-1">
                      {remainingToAdd.length > 0 ? (
                        <button
                          type="button"
                          disabled={addingAll}
                          onClick={() => void handleAddAllMissing()}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
                        >
                          {addingAll ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ShoppingBag className="w-3.5 h-3.5" />
                          )}
                          <span>
                            Add Missing to Shopping List ({remainingToAdd.length})
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onOpenShoppingList}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>View Shopping List</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-zinc-900 mb-2.5">
                  Quick Steps
                </h4>
                <ol className="space-y-2.5">
                  {activeRecipe.steps.map((step, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 text-sm text-zinc-700 leading-relaxed"
                    >
                      <span className="font-mono tabular-nums text-xs font-semibold text-zinc-500 mt-0.5 shrink-0">
                        0{idx + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {activeRecipe.tip && (
                <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 px-3.5 py-2.5 text-xs text-zinc-600">
                  <strong className="font-semibold text-zinc-900">Chef tip:</strong>{' '}
                  {activeRecipe.tip}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-zinc-100 flex items-center justify-between gap-2.5 bg-zinc-50/70">
          <button
            type="button"
            disabled={loading}
            onClick={() => void generateRecipes()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-zinc-200 text-xs sm:text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>New Ideas</span>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {activeRecipe && remainingToAdd.length > 0 && (
              <button
                type="button"
                disabled={addingAll}
                onClick={() => void handleAddAllMissing()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                {addingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShoppingBag className="w-3.5 h-3.5" />
                )}
                <span>Add {remainingToAdd.length} Missing</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 sm:px-5 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
