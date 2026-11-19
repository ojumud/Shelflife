import React, { useState } from 'react';
import { motion, PanInfo, useMotionValue, useTransform } from 'motion/react';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { InventoryItem } from '../types/inventory';
import {
  formatCountdown,
  formatReadableDate,
  formatShortDate,
  getDaysRemaining,
  getExpiryUrgency,
} from '../utils/expiry';

interface ItemCardProps {
  item: InventoryItem;
  onEdit: (item: InventoryItem) => void;
  onFinish: (item: InventoryItem, outcome: 'consumed' | 'trashed') => void;
}

const URGENCY_STYLES = {
  critical: {
    strip: 'bg-red-600',
    countdownText: 'text-red-700',
    statusText: 'text-red-600',
  },
  warning: {
    strip: 'bg-yellow-400',
    countdownText: 'text-amber-800',
    statusText: 'text-amber-700',
  },
  safe: {
    strip: 'bg-emerald-600',
    countdownText: 'text-emerald-800',
    statusText: 'text-emerald-700',
  },
} as const;

const SWIPE_THRESHOLD = 78;

export const ItemCard: React.FC<ItemCardProps> = ({ item, onEdit, onFinish }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const x = useMotionValue(0);
  const rightActionOpacity = useTransform(x, [12, 72], [0, 1]);
  const leftActionOpacity = useTransform(x, [-72, -12], [1, 0]);

  const daysRemaining = getDaysRemaining(item.expiryDate);
  const urgency = getExpiryUrgency(daysRemaining);
  const countdown = formatCountdown(daysRemaining);
  const styles = URGENCY_STYLES[urgency];
  const dateLabel = daysRemaining < 0 ? 'Expired' : 'Expires';

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (info.offset.x >= SWIPE_THRESHOLD) {
      onFinish(item, 'consumed');
    } else if (info.offset.x <= -SWIPE_THRESHOLD) {
      onFinish(item, 'trashed');
    }
  };

  return (
    <div className="relative rounded-2xl overflow-hidden bg-zinc-100">
      {/* Swipe Right Backdrop: Used Up */}
      <motion.div
        style={{ opacity: rightActionOpacity }}
        className="absolute inset-0 bg-emerald-600 text-white flex items-center justify-start px-5 pointer-events-none"
        aria-hidden="true"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Check className="w-5 h-5" strokeWidth={2.5} />
          <span>Used Up</span>
        </div>
      </motion.div>

      {/* Swipe Left Backdrop: Expired / Thrown Away */}
      <motion.div
        style={{ opacity: leftActionOpacity }}
        className="absolute inset-0 bg-red-600 text-white flex items-center justify-end px-5 pointer-events-none"
        aria-hidden="true"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span>Thrown Away</span>
          <Trash2 className="w-5 h-5" strokeWidth={2.2} />
        </div>
      </motion.div>

      {/* Draggable Horizontal Card */}
      <motion.article
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -120, right: 120 }}
        dragElastic={0.22}
        dragSnapToOrigin
        onDragEnd={handleDragEnd}
        className="group relative flex items-stretch bg-white rounded-2xl border border-zinc-200/85 overflow-hidden transition-shadow duration-150 hover:border-zinc-300 hover:shadow-[0_6px_20px_rgba(24,24,27,0.05)] touch-pan-y"
        aria-label={`${item.name}, ${item.category}, ${countdown.primary}`}
      >
        {/* Bold left-edge color strip: green safe, yellow < 1 week, red <= 3 days */}
        <div
          className={`w-2 sm:w-2.5 shrink-0 ${styles.strip}`}
          aria-hidden="true"
        />

        {/* Primary clickable item info */}
        <button
          type="button"
          onClick={() => onEdit(item)}
          className="flex-1 min-w-0 flex items-center justify-between gap-3 px-3.5 py-3.5 sm:px-4 sm:py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900 cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {item.photoUrl && !imgFailed && (
              <img
                src={item.photoUrl}
                alt={item.name}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-10 h-10 rounded-xl object-cover border border-zinc-200/80 bg-zinc-50 shrink-0"
              />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] sm:text-base font-semibold text-zinc-900 truncate leading-snug">
                  {item.name}
                </h3>
                <Pencil
                  className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hidden sm:block"
                  aria-hidden="true"
                />
              </div>

              <div className="mt-1 flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs sm:text-[13px] text-zinc-500">
                <span className="font-medium text-zinc-700">{item.category}</span>
                {item.assignedMemberName && (
                  <>
                    <span aria-hidden="true" className="text-zinc-300">
                      ·
                    </span>
                    <span className="font-medium text-zinc-800">
                      For {item.assignedMemberName}
                    </span>
                  </>
                )}
                <span aria-hidden="true" className="text-zinc-300">
                  ·
                </span>
                <span className="tabular-nums">
                  {dateLabel} {formatReadableDate(item.expiryDate)}
                </span>
                {typeof item.earlyReminderDays === 'number' && item.earlyReminderDays >= 1 && (
                  <>
                    <span aria-hidden="true" className="text-zinc-300">
                      ·
                    </span>
                    <span
                      className={`tabular-nums ${
                        daysRemaining <= item.earlyReminderDays
                          ? 'font-semibold text-amber-700'
                          : 'font-medium text-zinc-600'
                      }`}
                    >
                      {daysRemaining <= item.earlyReminderDays
                        ? `Get early (${item.earlyReminderDays}d alert)`
                        : `Remind ${item.earlyReminderDays}d early`}
                    </span>
                  </>
                )}
                {item.paoMonths && item.openedDate && (
                  <>
                    <span aria-hidden="true" className="text-zinc-300">
                      ·
                    </span>
                    <span className="text-zinc-600 font-medium tabular-nums">
                      PAO {item.paoMonths}M (Opened {formatShortDate(item.openedDate)})
                    </span>
                  </>
                )}
                {item.note && (
                  <>
                    <span aria-hidden="true" className="text-zinc-300">
                      ·
                    </span>
                    <span className="truncate max-w-[160px] sm:max-w-[210px] text-zinc-500">
                      {item.note}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Tabular countdown + accessible text status */}
          <div className="shrink-0 text-right pl-1">
            <div
              className={`font-mono tabular-nums text-sm sm:text-[15px] font-semibold leading-tight whitespace-nowrap ${styles.countdownText}`}
            >
              {countdown.primary}
            </div>
            <div
              className={`mt-0.5 text-[11px] font-medium whitespace-nowrap ${styles.statusText}`}
            >
              {countdown.urgencyText}
            </div>
          </div>
        </button>

        {/* Accessible Quick Actions: Used Up (right swipe equiv) & Thrown Away (left swipe equiv) */}
        <div className="flex items-center border-l border-zinc-100 px-1 shrink-0">
          <button
            type="button"
            onClick={() => onFinish(item, 'consumed')}
            title={`Used up "${item.name}"`}
            aria-label={`Mark ${item.name} as used up`}
            className="min-h-[44px] min-w-[40px] sm:min-w-[42px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 cursor-pointer"
          >
            <Check className="w-[18px] h-[18px]" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => onFinish(item, 'trashed')}
            title={`Expired / thrown away "${item.name}"`}
            aria-label={`Mark ${item.name} as expired or thrown away`}
            className="min-h-[44px] min-w-[40px] sm:min-w-[42px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 cursor-pointer"
          >
            <Trash2 className="w-[16px] h-[16px]" strokeWidth={2} />
          </button>
        </div>
      </motion.article>
    </div>
  );
};
