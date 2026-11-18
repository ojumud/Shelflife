import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  FileImage,
  Loader2,
  Receipt,
  ScanLine,
  X,
} from 'lucide-react';
import { CATEGORIES, Category, ScannedDraftItem } from '../types/inventory';
import { getTodayDateString } from '../utils/expiry';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportItems: (
    items: Array<{
      name: string;
      category: Category;
      expiryDate: string;
      note?: string;
    }>
  ) => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  onImportItems,
}) => {
  const [mode, setMode] = useState<'expiry' | 'receipt'>('expiry');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');
  const [draftItems, setDraftItems] = useState<ScannedDraftItem[]>([]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resetScan = () => {
    setPreviewUrl('');
    setDraftItems([]);
    setError('');
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, or WebP).');
      return;
    }

    setError('');
    setDraftItems([]);
    setMimeType(file.type || 'image/jpeg');

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      setPreviewUrl(dataUrl);
      await runScan(dataUrl, file.type || 'image/jpeg', mode);
    };
    reader.readAsDataURL(file);
  };

  const runScan = async (
    dataUrl: string,
    mime: string,
    scanMode: 'expiry' | 'receipt'
  ) => {
    setIsScanning(true);
    setError('');
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType: mime,
          mode: scanMode,
          todayDate: getTodayDateString(),
        }),
      });
      const data = (await response.json()) as {
        items?: Array<{
          name: string;
          category: Category;
          expiryDate: string;
          note?: string;
        }>;
        error?: string;
      };

      if (!response.ok) {
        setError(data.error || 'Could not analyze image.');
        return;
      }

      const extracted = (data.items || []).map((item, idx) => ({
        tempId: `scan-${Date.now()}-${idx}`,
        name: item.name,
        category: CATEGORIES.includes(item.category) ? item.category : 'Fridge',
        expiryDate: item.expiryDate,
        note: item.note,
        selected: true,
      }));

      if (extracted.length === 0) {
        setError(
          'No readable product names or expiry dates were found. Try a clearer, well-lit photo.'
        );
      }
      setDraftItems(extracted);
    } catch {
      setError('Network error while scanning image.');
    } finally {
      setIsScanning(false);
    }
  };

  const updateDraft = (tempId: string, patch: Partial<ScannedDraftItem>) => {
    setDraftItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item))
    );
  };

  const selectedCount = draftItems.filter((i) => i.selected && i.name.trim()).length;

  const handleConfirmImport = () => {
    const chosen = draftItems
      .filter((i) => i.selected && i.name.trim().length > 0)
      .map(({ name, category, expiryDate, note }) => ({
        name: name.trim(),
        category,
        expiryDate,
        note,
      }));
    if (chosen.length === 0) return;
    onImportItems(chosen);
    resetScan();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/45 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-zinc-200/80 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-zinc-300" aria-hidden="true" />
        </div>

        <div className="flex items-center justify-between px-5 sm:px-6 pt-3 sm:pt-5 pb-4 border-b border-zinc-100">
          <div>
            <h2
              id="scanner-modal-title"
              className="font-display text-lg sm:text-xl font-bold text-zinc-900 tracking-tight"
            >
              Scan Expiry or Receipt
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Point at an EXP date stamp or snap a supermarket receipt
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          {/* Scan Mode Switch */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMode('expiry');
                if (previewUrl) void runScan(previewUrl, mimeType, 'expiry');
              }}
              className={`min-h-[42px] px-3 py-2 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                mode === 'expiry'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <ScanLine className="w-4 h-4" />
              <span>Expiry Stamp</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('receipt');
                if (previewUrl) void runScan(previewUrl, mimeType, 'receipt');
              }}
              className={`min-h-[42px] px-3 py-2 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                mode === 'receipt'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Full Receipt</span>
            </button>
          </div>

          {/* Hidden File Inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void handleFileSelected(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void handleFileSelected(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          {/* Capture / Upload Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={isScanning}
              onClick={() => cameraInputRef.current?.click()}
              className="min-h-[48px] px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-60 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Take Photo</span>
            </button>
            <button
              type="button"
              disabled={isScanning}
              onClick={() => uploadInputRef.current?.click()}
              className="min-h-[48px] px-4 py-2.5 rounded-xl bg-white border border-zinc-200 text-zinc-800 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileImage className="w-4 h-4" />
              <span>Upload Image</span>
            </button>
          </div>

          {/* Image Preview */}
          {previewUrl && (
            <div className="relative rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50 max-h-52 flex items-center justify-center">
              <img
                src={previewUrl}
                alt="Scanned preview"
                className="max-h-52 w-full object-contain"
              />
              {isScanning && (
                <div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[1px] flex flex-col items-center justify-center text-white gap-2">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-xs font-medium">
                    {mode === 'receipt'
                      ? 'Reading receipt items...'
                      : 'Reading printed expiration date...'}
                  </span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs sm:text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {/* Extracted Items Review List */}
          {draftItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900">
                  Detected Items ({draftItems.length})
                </h3>
                <button
                  type="button"
                  onClick={resetScan}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-900 cursor-pointer"
                >
                  Clear
                </button>
              </div>

              <div className="space-y-2.5">
                {draftItems.map((draft) => (
                  <div
                    key={draft.tempId}
                    className={`rounded-xl border p-3 transition-colors ${
                      draft.selected
                        ? 'bg-white border-zinc-300'
                        : 'bg-zinc-50 border-zinc-200/70 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft(draft.tempId, { selected: !draft.selected })
                        }
                        aria-label={`Select ${draft.name}`}
                        className={`mt-1 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 cursor-pointer ${
                          draft.selected
                            ? 'bg-zinc-900 border-zinc-900 text-white'
                            : 'bg-white border-zinc-300'
                        }`}
                      >
                        {draft.selected && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                      </button>

                      <div className="flex-1 min-w-0 space-y-2">
                        <input
                          type="text"
                          value={draft.name}
                          onChange={(e) =>
                            updateDraft(draft.tempId, { name: e.target.value })
                          }
                          aria-label="Detected item name"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-sm font-medium text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-none"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={draft.category}
                            onChange={(e) =>
                              updateDraft(draft.tempId, {
                                category: e.target.value as Category,
                              })
                            }
                            aria-label="Detected item category"
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-xs font-medium text-zinc-800 focus:bg-white focus:border-zinc-900 focus:outline-none"
                          >
                            {CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={draft.expiryDate}
                            onChange={(e) =>
                              updateDraft(draft.tempId, { expiryDate: e.target.value })
                            }
                            aria-label="Detected expiration date"
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-xs font-mono tabular-nums text-zinc-800 focus:bg-white focus:border-zinc-900 focus:outline-none"
                          />
                        </div>
                        {draft.note && (
                          <p className="text-[11px] text-zinc-500">{draft.note}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-zinc-100 flex items-center justify-end gap-2.5 bg-zinc-50/70">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-200/70 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedCount === 0 || isScanning}
            onClick={handleConfirmImport}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
          >
            Add {selectedCount > 0 ? `${selectedCount} ` : ''}to Pantry
          </button>
        </div>
      </div>
    </div>
  );
};
