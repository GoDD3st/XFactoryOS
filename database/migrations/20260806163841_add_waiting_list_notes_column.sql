
-- WaitingListRepository was reading/writing user_name, user_department, notes, and
-- preferred_cluster_code - none of which exist as columns on waiting_list_entries (user
-- name/department are joinable via user_id -> users; cluster code via preferred_cluster_id ->
-- clusters). notes has no equivalent anywhere, so add it directly.
ALTER TABLE public.waiting_list_entries ADD COLUMN IF NOT EXISTS notes text;
