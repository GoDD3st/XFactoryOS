-- Reservation wall clocks become true Morocco instants.
--
-- These columns are derived from a wall clock the user typed: someone picks 08:00 and means eight
-- in the morning at Site Safi. They are stored as timestamptz, which is an instant, and the
-- conversion between the two needs a timezone that the code never named - it built dates with
-- `new Date("<date>T<time>")`, which means "in whatever zone this process runs in". On Vercel that
-- is UTC, so 08:00 was stored as 08:00Z, which is 09:00 in Morocco.
--
-- Nothing looked wrong, because the value was read back the same way it was written: the app also
-- rendered in UTC and displayed "08:00". The error only surfaced where the stored instant meets
-- real time. No-show detection compares against now(), so at 08:30 Casablanca - 07:30Z - the
-- server believed the booking had not started, and a desk abandoned at 08:00 stayed blocked until
-- 09:30. The waiting-list cascade that a no-show triggers was late by the same hour.
--
-- The process is now pinned to Africa/Casablanca (services/time/siteTime.ts), so new rows are
-- written correctly. This repairs the rows written before that.
--
-- THE TRANSFORMATION, and why it is shaped this way:
--
--   (start_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca'
--
-- The first step renders the stored instant as a naive wall clock in UTC - which recovers exactly
-- the clock time the user originally typed, because that is how it was written. The second
-- interprets that same clock time as Morocco local, producing the instant it should always have
-- been. Postgres resolves the offset per row from the tz database, so rows dated during Ramadan
-- (Morocco on UTC+0) shift by nothing while the rest shift by an hour. A blanket `- interval
-- '1 hour'` would have been wrong for about a month of every year.
--
-- WHAT USERS SEE: nothing changes. A booking displayed as 08:00 today is still displayed as 08:00
-- afterwards - it is rendered in Casablanca now instead of UTC, which lands on the same string.
-- What changes is that it is finally 08:00 in Morocco underneath.
--
-- DELIBERATELY NOT TOUCHED: created_at, updated_at, check_in_at, check_out_at, cancelled_at,
-- decided_at, occurred_at, resolved_at, offer_expires_at, and every other column captured with
-- `new Date()` at the moment something happened. Those are already true instants - the moment was
-- the moment, whatever zone recorded it. Shifting them would corrupt correct data. The rule for
-- deciding: if a human typed the time, it needs this; if the clock produced it, it does not.
--
-- REVERSIBLE: swap the two zone names to undo.

update public.reservations
set start_at          = (start_at          at time zone 'UTC') at time zone 'Africa/Casablanca',
    end_at            = (end_at            at time zone 'UTC') at time zone 'Africa/Casablanca',
    check_in_deadline = case
                          when check_in_deadline is null then null
                          else (check_in_deadline at time zone 'UTC') at time zone 'Africa/Casablanca'
                        end;

update public.waiting_list_entries
set requested_start_at = (requested_start_at at time zone 'UTC') at time zone 'Africa/Casablanca',
    requested_end_at   = (requested_end_at   at time zone 'UTC') at time zone 'Africa/Casablanca',
    offered_start_at   = case
                           when offered_start_at is null then null
                           else (offered_start_at at time zone 'UTC') at time zone 'Africa/Casablanca'
                         end,
    offered_end_at     = case
                           when offered_end_at is null then null
                           else (offered_end_at at time zone 'UTC') at time zone 'Africa/Casablanca'
                         end;
