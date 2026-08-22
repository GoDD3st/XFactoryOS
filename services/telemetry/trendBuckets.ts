import { DailyReservationTrend } from './telemetryService';

/**
 * Collapsing a daily trend series into months once the window gets long.
 *
 * /api/telemetry/trends answers in days whatever window is asked for, which is right - the API
 * should not decide how a chart wants to draw itself, and the daily numbers are what the exports
 * carry. But a year of days is 365 bars in a strip a few hundred pixels wide: under a pixel each,
 * with eleven labels out of twelve suppressed to stop them overlapping. That is not a trend line,
 * it is texture. Aggregating to months turns the same data into twelve readable bars.
 *
 * The threshold is a year rather than something smaller because the shorter presets stay legible:
 * 90 days is dense but you can still see individual days, and at 180 the shape is still a shape.
 * A year is where the marks stop being distinguishable at all.
 */

export interface TrendBucket {
  /** Stable identity for React keys: 'YYYY-MM-DD' by day, 'YYYY-MM' by month. */
  key: string;
  /** Axis label, already formatted for display. */
  label: string;
  count: number;
  noShows: number;
  /** How many days this bucket covers - 1 by day, the days present by month. */
  days: number;
}

export type TrendGranularity = 'day' | 'month';

/** At or beyond this window the series is shown by month. */
export const MONTHLY_TREND_THRESHOLD_DAYS = 365;

export function trendGranularityFor(windowDays: number): TrendGranularity {
  return windowDays >= MONTHLY_TREND_THRESHOLD_DAYS ? 'month' : 'day';
}

/**
 * Buckets a daily series for display.
 *
 * Summing is the correct aggregation for both fields: they are counts of events in a period, so a
 * month's total is the sum of its days. It would be wrong for a rate or an occupancy percentage -
 * those would need weighting - which is why this function is about counts and says so rather than
 * pretending to be a general-purpose aggregator.
 *
 * Order is preserved from the input, which arrives oldest-first, so months come out chronological
 * without a second sort. Days absent from the input simply do not contribute; a month with no
 * reservations at all produces no bucket rather than a zero one, matching how the daily view
 * already omits days the API did not return.
 */
export function bucketTrends(
  trends: DailyReservationTrend[],
  windowDays: number
): { buckets: TrendBucket[]; granularity: TrendGranularity } {
  const granularity = trendGranularityFor(windowDays);

  if (granularity === 'day') {
    return {
      granularity,
      buckets: trends.map((t) => ({
        key: t.date,
        label: formatDayLabel(t.date),
        count: t.count,
        noShows: t.noShows,
        days: 1,
      })),
    };
  }

  const byMonth = new Map<string, TrendBucket>();

  for (const t of trends) {
    // 'YYYY-MM-DD' -> 'YYYY-MM'. Sliced rather than parsed through Date on purpose: the string is
    // already a local calendar date, and constructing a Date from it only invites a timezone shift
    // that could move a booking on the 1st into the previous month.
    const key = t.date.slice(0, 7);
    const existing = byMonth.get(key);
    if (existing) {
      existing.count += t.count;
      existing.noShows += t.noShows;
      existing.days += 1;
    } else {
      byMonth.set(key, {
        key,
        label: formatMonthLabel(key),
        count: t.count,
        noShows: t.noShows,
        days: 1,
      });
    }
  }

  return { granularity, buckets: [...byMonth.values()] };
}

function formatDayLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function formatMonthLabel(yearMonth: string): string {
  const d = new Date(yearMonth + '-01T00:00:00');
  // Short month plus a two-digit year: a year-long window can span two calendar years, and
  // "janv." appearing twice with no way to tell them apart is worse than a slightly longer label.
  return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}
