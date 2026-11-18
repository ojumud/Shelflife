import React, { useEffect, useRef, useState } from 'react';
import {
  Barcode,
  Clock,
  Droplets,
  Loader2,
  Pill,
  Refrigerator,
  Trash2,
  X,
} from 'lucide-react';
import {
  CATEGORIES,
  Category,
  InventoryItem,
  PAO_MONTH_OPTIONS,
} from '../types/inventory';
import {
  addDaysToToday,
  addMonthsToDateString,
  computeEffectiveExpiryDate,
  formatCountdown,
  formatReadableDate,
  getDaysRemaining,
  getExpiryGroup,
  getExpiryUrgency,
  getTodayDateString,
} from '../utils/expiry';

interface ItemSheetModalProps {
  isOpen: boolean;
  editingItem: InventoryItem | null;
  defaultCategory?: Category;
  onClose: () => void;
  onSave: (data: {
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
  }) => void;
  onDelete?: (item: InventoryItem) => void;
}

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  Fridge: <Refrigerator className="w-4 h-4 shrink-0" />,
  Skincare: <Droplets className="w-4 h-4 shrink-0" />,
  Medicine: <Pill className="w-4 h-4 shrink-0" />,
};

const QUICK_OFFSETS = [
  { label: '+2 days', days: 2 },
  { label: '+5 days', days: 5 },
  { label: '+2 weeks', days: 14 },
  { label: '+1 month', days: 30 },
  { label: '+6 months', days: 180 },
];

const PREVIEW_STYLES = {
  critical: {
    strip: 'bg-red-600',
    text: 'text-red-700',
  },
  warning: {
    strip: 'bg-yellow-400',
    text: 'text-amber-800',
  },
  safe: {
    strip: 'bg-emerald-600',
    text: 'text-emerald-800',
  },
} as const;

export const ItemSheetModal: React.FC<ItemSheetModalProps> = ({
  isOpen,
  editingItem,
  defaultCategory = 'Fridge',
  onClose,
  onSave,
  onDelete,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [printedExpiryDate, setPrintedExpiryDate] = useState(addDaysToToday(7));
  const [usePao, setUsePao] = useState(false);
  const [openedDate, setOpenedDate] = useState(getTodayDateString());
  const [paoMonths, setPaoMonths] = useState<number>(6);
  const [note, setNote] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeMessage, setBarcodeMessage] = useState('');

  const [error, setError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (editingItem) {
      setName(editingItem.name);
      setCategory(editingItem.category);
      setPrintedExpiryDate(
        editingItem.printedExpiryDate || editingItem.expiryDate
      );
      const hasPao = Boolean(editingItem.openedDate && editingItem.paoMonths);
      setUsePao(hasPao);
      setOpenedDate(editingItem.openedDate || getTodayDateString());
      setPaoMonths(editingItem.paoMonths || 6);
      setNote(editingItem.note ?? '');
      setBrand(editingItem.brand ?? '');
      setBarcode(editingItem.barcode ?? '');
      setPhotoUrl(editingItem.photoUrl ?? '');
      setBarcodeInput(editingItem.barcode ?? '');
    } else {
      setName('');
      setCategory(defaultCategory);
      setPrintedExpiryDate(addDaysToToday(7));
      setUsePao(false);
      setOpenedDate(getTodayDateString());
      setPaoMonths(6);
      setNote('');
      setBrand('');
      setBarcode('');
      setPhotoUrl('');
      setBarcodeInput('');
    }
    setBarcodeMessage('');
    setError('');
    const timer = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [isOpen, editingItem, defaultCategory]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const effectiveExpiryDate = computeEffectiveExpiryDate({
    printedExpiryDate,
    usePao,
    openedDate,
    paoMonths,
  });

  const paoComputedDate = usePao
    ? addMonthsToDateString(openedDate, paoMonths)
    : null;

  const previewDays = getDaysRemaining(effectiveExpiryDate);
  const previewUrgency = getExpiryUrgency(previewDays);
  const previewGroup = getExpiryGroup(previewDays);
  const previewCountdown = formatCountdown(previewDays);
  const previewStyle = PREVIEW_STYLES[previewUrgency];

  const handleBarcodeLookup = async (codeOverride?: string) => {
    const code = (codeOverride ?? barcodeInput).replace(/[^0-9A-Za-z]/g, '');
    if (code.length < 4) {
      setBarcodeMessage('Enter a valid barcode (at least 4 digits).');
      return;
    }
    setBarcodeLoading(true);
    setBarcodeMessage('');
    try {
      const res = await fetch(`/api/barcode/${encodeURIComponent(code)}`);
      const data = (await res.json()) as {
        found?: boolean;
        name?: string;
        brand?: string;
        category?: Category;
        photoUrl?: string;
        barcode?: string;
        error?: string;
      };
      if (!res.ok) {
        setBarcodeMessage(data.error || 'Barcode lookup failed.');
        return;
      }
      if (!data.found) {
        setBarcodeMessage(`No product found for barcode ${code}.`);
        return;
      }
      if (data.name) setName(data.name);
      if (data.category) setCategory(data.category);
      if (data.brand) setBrand(data.brand);
      if (data.photoUrl) setPhotoUrl(data.photoUrl);
      setBarcode(data.barcode || code);
      setBarcodeMessage(`Auto-filled from Open Food Facts (${data.name}).`);
      if (error) setError('');
    } catch {
      setBarcodeMessage('Could not reach barcode lookup service.');
    } finally {
      setBarcodeLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter an item name.');
      nameInputRef.current?.focus();
      return;
    }
    if (!printedExpiryDate && !usePao) {
      setError('Please pick an expiration date.');
      return;
    }

    onSave({
      id: editingItem?.id,
      name: trimmedName,
      category,
      expiryDate: effectiveExpiryDate,
      printedExpiryDate: printedExpiryDate || undefined,
      openedDate: usePao ? openedDate : undefined,
      paoMonths: usePao ? paoMonths : undefined,
      note: note.trim() || undefined,
      brand: brand.trim() || undefined,
      barcode: barcode.trim() || undefined,
      photoUrl: photoUrl.trim() || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/45 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-zinc-200/80 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Mobile grab affordance */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-zinc-300" aria-hidden="true" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 pt-3 sm:pt-5 pb-4 border-b border-zinc-100">
          <h2
            id="item-modal-title"
            className="font-display text-lg sm:text-xl font-bold text-zinc-900 tracking-tight"
          >
            {editingItem ? 'Edit Item' : 'Add Inventory Item'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          {/* Barcode Auto-Fill (Open Food Facts) */}
          {!editingItem && (
            <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <label
                  htmlFor="barcode-lookup-input"
                  className="text-xs font-semibold text-zinc-700 inline-flex items-center gap-1.5"
                >
                  <Barcode className="w-4 h-4 text-zinc-500" />
                  <span>Barcode Auto-Fill (Open Food Facts)</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeInput('3017620422003');
                    void handleBarcodeLookup('3017620422003');
                  }}
                  className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 underline underline-offset-2 cursor-pointer"
                >
                  Try sample
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="barcode-lookup-input"
                  type="text"
                  inputMode="numeric"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleBarcodeLookup();
                    }
                  }}
                  placeholder="Enter UPC / EAN barcode..."
                  className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-xs sm:text-sm font-mono tabular-nums text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={barcodeLoading}
                  onClick={() => void handleBarcodeLookup()}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  {barcodeLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : null}
                  <span>Look Up</span>
                </button>
              </div>
              {barcodeMessage && (
                <p className="mt-1.5 text-xs text-zinc-600">{barcodeMessage}</p>
              )}
            </div>
          )}

          {/* Product Photo + Item Name */}
          <div>
            <label
              htmlFor="item-name-input"
              className="block text-sm font-medium text-zinc-800 mb-1.5"
            >
              Item name
            </label>
            <div className="flex items-center gap-3">
              {photoUrl && (
                <img
                  src={photoUrl}
                  alt={name || 'Product thumbnail'}
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-xl object-cover border border-zinc-200 shrink-0 bg-zinc-50"
                />
              )}
              <input
                ref={nameInputRef}
                id="item-name-input"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. Greek Yogurt, Retinol Serum, Ibuprofen"
                maxLength={80}
                className="flex-1 min-h-[46px] px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-colors"
              />
            </div>
            {error && (
              <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Category Selector */}
          <div>
            <span className="block text-sm font-medium text-zinc-800 mb-1.5">
              Category
            </span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Category">
              {CATEGORIES.map((cat) => {
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setCategory(cat)}
                    className={`min-h-[48px] px-3 py-2.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-all duration-150 whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    {CATEGORY_ICONS[cat]}
                    <span>{cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expiration Date + Quick Offsets */}
          <div>
            <label
              htmlFor="item-expiry-input"
              className="block text-sm font-medium text-zinc-800 mb-1.5"
            >
              Printed expiration date
            </label>
            <input
              id="item-expiry-input"
              type="date"
              value={printedExpiryDate}
              onChange={(e) => setPrintedExpiryDate(e.target.value)}
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-[15px] font-mono tabular-nums text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-colors"
            />

            <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {QUICK_OFFSETS.map((preset) => {
                const targetDate = addDaysToToday(preset.days);
                const active = printedExpiryDate === targetDate;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setPrintedExpiryDate(targetDate)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                      active
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100 hover:text-zinc-900'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom "Opened On" Timer (PAO — Period After Opening) */}
          <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/70 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Clock className="w-4 h-4 text-zinc-500 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-zinc-900">
                    Date Opened Timer (PAO)
                  </div>
                  <div className="text-xs text-zinc-500">
                    Track Period After Opening for skincare &amp; liquid medicine
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={usePao}
                aria-label="Toggle Date Opened PAO timer"
                onClick={() => setUsePao((prev) => !prev)}
                className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
                  usePao ? 'bg-zinc-900' : 'bg-zinc-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition duration-150 ${
                    usePao ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {usePao && (
              <div className="mt-3.5 pt-3.5 border-t border-zinc-200/80 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="item-opened-input"
                      className="block text-xs font-medium text-zinc-700 mb-1"
                    >
                      Date opened
                    </label>
                    <input
                      id="item-opened-input"
                      type="date"
                      value={openedDate}
                      onChange={(e) => setOpenedDate(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-white border border-zinc-200 text-sm font-mono tabular-nums text-zinc-900 focus:border-zinc-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-zinc-700 mb-1">
                      PAO window
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {PAO_MONTH_OPTIONS.map((months) => {
                        const active = paoMonths === months;
                        return (
                          <button
                            key={months}
                            type="button"
                            onClick={() => setPaoMonths(months)}
                            className={`min-h-[38px] px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-colors cursor-pointer ${
                              active
                                ? 'bg-zinc-900 text-white border-zinc-900'
                                : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                            }`}
                          >
                            {months}M
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {paoComputedDate && (
                  <p className="text-xs text-zinc-600 tabular-nums">
                    PAO cutoff:{' '}
                    <strong className="font-semibold text-zinc-900">
                      {formatReadableDate(paoComputedDate)}
                    </strong>
                    {printedExpiryDate && paoComputedDate < printedExpiryDate
                      ? ' (earlier than printed box expiry — applied automatically)'
                      : ''}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Optional Note */}
          <div>
            <label
              htmlFor="item-note-input"
              className="block text-sm font-medium text-zinc-800 mb-1.5"
            >
              Note <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <input
              id="item-note-input"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Half full, keep refrigerated"
              maxLength={120}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-colors"
            />
          </div>

          {/* Live Status Preview */}
          <div className="flex items-stretch rounded-xl bg-zinc-50 border border-zinc-200/80 overflow-hidden">
            <div className={`w-2 shrink-0 ${previewStyle.strip}`} aria-hidden="true" />
            <div className="flex-1 flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
              <span className="text-zinc-600">
                Groups into{' '}
                <strong className="font-semibold text-zinc-900">
                  {previewGroup === 'expiring-soon' ? 'Expiring Soon' : 'Fresh'}
                </strong>
              </span>
              <span className={`font-mono tabular-nums font-semibold ${previewStyle.text}`}>
                {previewCountdown.primary} · {previewCountdown.urgencyText}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between gap-3">
            {editingItem && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(editingItem)}
                className="min-h-[48px] px-3.5 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[48px] px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[48px] px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
              >
                {editingItem ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
