import React, { useState } from 'react';
import { Check, Plus, RotateCcw, ShoppingBag, Trash2 } from 'lucide-react';
import {
  CATEGORIES,
  Category,
  ShoppingListItem,
  WasteEvent,
} from '../types/inventory';

interface ShoppingListViewProps {
  shoppingList: ShoppingListItem[];
  wasteHistory: WasteEvent[];
  onAddShoppingItem: (name: string, category: Category) => void;
  onToggleShoppingItem: (item: ShoppingListItem) => void;
  onDeleteShoppingItem: (item: ShoppingListItem) => void;
  onRestockToPantry: (item: ShoppingListItem) => void;
}

export const ShoppingListView: React.FC<ShoppingListViewProps> = ({
  shoppingList,
  wasteHistory,
  onAddShoppingItem,
  onToggleShoppingItem,
  onDeleteShoppingItem,
  onRestockToPantry,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('Fridge');

  const consumedCount = wasteHistory.filter((e) => e.outcome === 'consumed').length;
  const trashedCount = wasteHistory.filter((e) => e.outcome === 'trashed').length;
  const totalFinished = consumedCount + trashedCount;
  const saveRate =
    totalFinished > 0 ? Math.round((consumedCount / totalFinished) * 100) : 100;

  const unchecked = shoppingList.filter((item) => !item.checked);
  const checked = shoppingList.filter((item) => item.checked);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddShoppingItem(trimmed, category);
    setName('');
  };

  return (
    <div className="space-y-6">
      {/* Waste Habits Summary */}
      <section
        aria-label="Waste habits summary"
        className="grid grid-cols-3 gap-2.5 sm:gap-4"
      >
        <div className="bg-white rounded-2xl border border-zinc-200/85 px-4 py-3.5">
          <div className="font-mono tabular-nums text-xl sm:text-2xl font-bold text-emerald-700 leading-none">
            {consumedCount}
          </div>
          <div className="mt-1.5 text-xs font-medium text-zinc-600">
            Used Up
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/85 px-4 py-3.5">
          <div className="font-mono tabular-nums text-xl sm:text-2xl font-bold text-red-600 leading-none">
            {trashedCount}
          </div>
          <div className="mt-1.5 text-xs font-medium text-zinc-600">
            Thrown Away
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/85 px-4 py-3.5">
          <div className="font-mono tabular-nums text-xl sm:text-2xl font-bold text-zinc-900 leading-none">
            {totalFinished > 0 ? `${saveRate}%` : '—'}
          </div>
          <div className="mt-1.5 text-xs font-medium text-zinc-600">
            Save Rate
          </div>
        </div>
      </section>

      {/* Add Restock Item Bar */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-zinc-200/85 p-3 sm:p-4 flex flex-col sm:flex-row gap-2.5"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add item to restock (e.g. Oat Milk, Cleanser)..."
          maxLength={80}
          aria-label="Restock item name"
          className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-900 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            aria-label="Restock category"
            className="min-h-[44px] px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-sm font-medium text-zinc-700 focus:bg-white focus:border-zinc-900 focus:outline-none"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>
        </div>
      </form>

      {/* Shopping List Items */}
      {shoppingList.length === 0 ? (
        <div className="py-14 px-6 text-center bg-white rounded-2xl border border-zinc-200/80">
          <div className="w-11 h-11 rounded-2xl bg-zinc-100 text-zinc-600 mx-auto flex items-center justify-center mb-3.5">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <h3 className="font-display text-lg font-bold text-zinc-900">
            Restock list is empty
          </h3>
          <p className="mt-1 text-sm text-zinc-500 max-w-sm mx-auto">
            Mark an item as Used Up to send it straight here in one tap, or add items manually above.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {unchecked.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-base font-bold text-zinc-900">
                  To Buy
                </h3>
                <span className="font-mono tabular-nums text-xs text-zinc-500">
                  {unchecked.length}
                </span>
              </div>
              <div className="space-y-2">
                {unchecked.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-zinc-200/85 px-3.5 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleShoppingItem(item)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left min-h-[44px] cursor-pointer"
                    >
                      <span className="w-5 h-5 rounded-md border-2 border-zinc-300 flex items-center justify-center shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm sm:text-[15px] font-medium text-zinc-900 truncate">
                          {item.name}
                        </div>
                        <div className="text-xs text-zinc-500">{item.category}</div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onRestockToPantry(item)}
                        title="Bought &amp; add back to pantry"
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-xs font-medium text-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restock</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteShoppingItem(item)}
                        aria-label={`Remove ${item.name} from shopping list`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {checked.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-base font-bold text-zinc-500">
                  Picked Up
                </h3>
                <span className="font-mono tabular-nums text-xs text-zinc-400">
                  {checked.length}
                </span>
              </div>
              <div className="space-y-2">
                {checked.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 bg-white/70 rounded-2xl border border-zinc-200/70 px-3.5 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleShoppingItem(item)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left min-h-[44px] cursor-pointer"
                    >
                      <span className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm sm:text-[15px] font-medium text-zinc-400 line-through truncate">
                          {item.name}
                        </div>
                        <div className="text-xs text-zinc-400">{item.category}</div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onRestockToPantry(item)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-xs font-medium text-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restock</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteShoppingItem(item)}
                        aria-label={`Delete ${item.name}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
