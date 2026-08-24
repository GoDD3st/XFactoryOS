/**
 * The site's timezone, and the one place that knows it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE PROBLEM THIS SOLVES
 *
 * Reservation times are entered as a wall clock - a user picks "08:00" and means eight in the
 * morning at Site Safi. They are stored as `timestamptz`, which is a true instant. Converting
 * between the two requires a timezone, and the code never named one: it used
 * `new Date("2026-08-24T08:00")`, which silently means "08:00 in whatever zone this process
 * happens to run in".
 *
 * On Vercel that process runs in UTC. So a booking entered as 08:00 was stored as 08:00Z, which
 * IS 09:00 in Morocco. The app still displayed "08:00", because it read the time back in UTC too -
 * consistent, and consistently an hour away from reality. It only became visible where the stored
 * instant is compared against real time: no-show detection ran an hour late, because at 08:30
 * Casablanca (07:30Z) the server believed the booking had not started yet.
 *
 * Pinning the process to the site's zone makes the wall clock the user typed and the instant the
 * database stores agree, without a single conversion at any call site.
 *
 * WHY A ZONE NAME AND NOT AN OFFSET: Morocco is UTC+1 for most of the year and UTC+0 during
 * Ramadan. A hardcoded +01:00 would be wrong for roughly a month each year, and wrong in the
 * direction that breaks check-in. The tz database tracks that shift; a constant cannot.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

export const SITE_TIMEZONE = 'Africa/Casablanca';

/**
 * Pins this Node process to the site's timezone.
 *
 * Runs as an import side effect, which is why `backend/server.ts` imports this module FIRST -
 * ES module imports are evaluated in order, so this must be evaluated before anything that
 * constructs a Date. Anything importing it later still gets a correctly pinned process, because
 * the assignment happens once and Date reads TZ per call.
 *
 * An explicit TZ in the environment wins. That is deliberate: an operator moving the deployment
 * to another site should be able to say so without editing code, and a test can pin UTC to get
 * reproducible output. The warning fires only when the two disagree, so the normal case is silent.
 *
 * No-op in the browser, where the device's own zone is the right one to render in.
 */
function pinProcessTimezone(): void {
  if (typeof process === 'undefined' || !process.env) return;

  const configured = process.env.TZ;
  if (!configured) {
    process.env.TZ = SITE_TIMEZONE;
    return;
  }

  if (configured !== SITE_TIMEZONE) {
    console.warn(
      `[time] TZ is "${configured}", not the site zone "${SITE_TIMEZONE}". ` +
        'Reservation wall-clock times will be interpreted in that zone. Intentional for a ' +
        'relocated deployment or a test; a mistake anywhere else.'
    );
  }
}

pinProcessTimezone();

/**
 * The offset of the site's timezone, in minutes, AT a given instant.
 *
 * Computed by asking Intl what the wall clock reads there and comparing - rather than assuming a
 * fixed +60 - so the Ramadan shift to UTC+0 is handled for the date in question rather than the
 * date this code was written.
 */
function siteOffsetMinutesAt(instantMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);

  // `hour` can come back as 24 for midnight under hour12:false in some engines.
  const hour = get('hour') % 24;

  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return (asIfUtc - instantMs) / 60000;
}

/**
 * Turns a wall clock AT THE SITE into a true instant.
 *
 * `siteWallClockToEpoch('2026-08-24', '08:00')` is the epoch millisecond value of eight in the
 * morning at Site Safi - 07:00Z in August, 08:00Z during Ramadan.
 *
 * Two passes because the offset depends on the instant, and the instant is what we are solving
 * for: the first pass guesses by reading the wall clock as UTC, the second corrects using the
 * offset in force around that guess. One correction is enough for a one-hour shift; the only
 * inputs it cannot resolve are wall clocks that do not exist or occur twice on a transition day,
 * which for this app would mean booking a desk during the changeover hour.
 *
 * Use this anywhere a stored wall clock has to be compared against real time - a countdown, an
 * expiry, a "has this started yet" test. Reconstructing with `new Date(date + 'T' + time)` gives
 * the device's zone, which is right only by luck.
 */
export function siteWallClockToEpoch(dateISO: string, timeHHMM: string): number {
  const [y, mo, d] = dateISO.split('-').map(Number);
  const [h, mi] = timeHHMM.split(':').map(Number);
  if (!y || !mo || !d) return Number.NaN;

  const guess = Date.UTC(y, mo - 1, d, h || 0, mi || 0, 0, 0);
  const offset = siteOffsetMinutesAt(guess);
  return guess - offset * 60000;
}
