import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { WasteEvent } from '../types/inventory';

interface WasteAnalyticsSectionProps {
  wasteHistory: WasteEvent[];
}

interface DailyWasteDatum {
  dateKey: string;
  label: string;
  consumed: number;
  trashed: number;
}

const DAYS_WINDOW = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toLocalDateKey(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatAxisDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export const WasteAnalyticsSection: React.FC<WasteAnalyticsSectionProps> = ({
  wasteHistory,
}) => {
  const { chartData, consumedTotal, trashedTotal, saveRate } = useMemo(() => {
    const now = new Date();
    const todayMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const startMidnight = todayMidnight - (DAYS_WINDOW - 1) * MS_PER_DAY;

    const bucketMap = new Map<string, DailyWasteDatum>();
    const orderedDays: DailyWasteDatum[] = [];

    for (let i = 0; i < DAYS_WINDOW; i++) {
      const dayDate = new Date(startMidnight + i * MS_PER_DAY);
      const dateKey = toLocalDateKey(dayDate.getTime());
      const datum: DailyWasteDatum = {
        dateKey,
        label: formatAxisDate(dayDate),
        consumed: 0,
        trashed: 0,
      };
      bucketMap.set(dateKey, datum);
      orderedDays.push(datum);
    }

    let consumed = 0;
    let trashed = 0;

    for (const event of wasteHistory) {
      if (event.recordedAt < startMidnight) continue;
      const key = toLocalDateKey(event.recordedAt);
      const bucket = bucketMap.get(key);
      if (!bucket) continue;
      if (event.outcome === 'consumed') {
        bucket.consumed += 1;
        consumed += 1;
      } else {
        bucket.trashed += 1;
        trashed += 1;
      }
    }

    const total = consumed + trashed;
    const rate = total > 0 ? Math.round((consumed / total) * 100) : null;

    return {
      chartData: orderedDays,
      consumedTotal: consumed,
      trashedTotal: trashed,
      saveRate: rate,
    };
  }, [wasteHistory]);

  const hasEvents = consumedTotal + trashedTotal > 0;

  return (
    <section aria-label="Waste Analytics" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 inline-flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-zinc-500" />
          <span>Waste Analytics</span>
        </h3>
        <span className="text-xs text-zinc-500">Last 30 days</span>
      </div>

      <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 space-y-4">
        {/* 30-day Summary Metrics */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-xl bg-zinc-50 border border-zinc-200/70 px-3 py-2.5">
            <div className="font-mono tabular-nums text-lg sm:text-xl font-bold text-emerald-700 leading-none">
              {consumedTotal}
            </div>
            <div className="mt-1 text-[11px] font-medium text-zinc-600">
              Used Up
            </div>
          </div>
          <div className="rounded-xl bg-zinc-50 border border-zinc-200/70 px-3 py-2.5">
            <div className="font-mono tabular-nums text-lg sm:text-xl font-bold text-red-600 leading-none">
              {trashedTotal}
            </div>
            <div className="mt-1 text-[11px] font-medium text-zinc-600">
              Thrown Away
            </div>
          </div>
          <div className="rounded-xl bg-zinc-50 border border-zinc-200/70 px-3 py-2.5">
            <div className="font-mono tabular-nums text-lg sm:text-xl font-bold text-zinc-900 leading-none">
              {saveRate !== null ? `${saveRate}%` : '—'}
            </div>
            <div className="mt-1 text-[11px] font-medium text-zinc-600">
              Save Rate
            </div>
          </div>
        </div>

        {/* Bar Chart: Consumed vs Trashed over Last 30 Days */}
        {hasEvents ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Daily items finished</span>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-zinc-700">
                  <span
                    className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block"
                    aria-hidden="true"
                  />
                  Consumed
                </span>
                <span className="inline-flex items-center gap-1.5 text-zinc-700">
                  <span
                    className="w-2.5 h-2.5 rounded-xs bg-red-600 inline-block"
                    aria-hidden="true"
                  />
                  Trashed
                </span>
              </div>
            </div>

            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 4, left: -24, bottom: 0 }}
                  barGap={1}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e4e4e7"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#71717a' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e4e4e7' }}
                    interval={6}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: '#71717a' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#f4f4f5' }}
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#ffffff',
                      fontSize: '12px',
                      padding: '8px 10px',
                    }}
                    itemStyle={{ color: '#ffffff', padding: '1px 0' }}
                    labelStyle={{ color: '#a1a1aa', marginBottom: '2px' }}
                  />
                  <Bar
                    dataKey="consumed"
                    name="Consumed"
                    fill="#059669"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={14}
                  />
                  <Bar
                    dataKey="trashed"
                    name="Trashed"
                    fill="#dc2626"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={14}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-zinc-50 border border-dashed border-zinc-200 px-4 py-6 text-center">
            <p className="text-xs sm:text-sm font-medium text-zinc-700">
              No finished items recorded in the last 30 days yet
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Swipe right (Used Up) or left (Thrown Away) on any pantry card to track your 30-day waste habits here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
