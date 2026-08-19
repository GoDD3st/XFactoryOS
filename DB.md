## Table `users`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `email` | `citext` |  Unique |
| `full_name` | `text` |  |
| `department` | `text` |  Nullable |
| `employee_code` | `text` |  Nullable Unique |
| `status` | `user_status` |  |
| `avatar_url` | `text` |  Nullable |
| `locale` | `text` |  Nullable |
| `theme` | `text` |  Nullable |
| `last_login_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `roles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `code` | `text` |  Unique |
| `name` | `text` |  |
| `description` | `text` |  Nullable |
| `is_critical` | `bool` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `permissions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `code` | `text` |  Unique |
| `domain` | `text` |  |
| `description` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `role_permissions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `role_id` | `uuid` | Primary |
| `permission_id` | `uuid` | Primary |
| `can_read` | `bool` |  |
| `can_create` | `bool` |  |
| `can_update` | `bool` |  |
| `can_delete` | `bool` |  |
| `can_approve` | `bool` |  |

## Table `user_roles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `role_id` | `uuid` | Primary |
| `granted_by` | `uuid` |  Nullable |
| `granted_at` | `timestamptz` |  |

## Table `buildings`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  |
| `code` | `text` |  Unique |
| `active` | `bool` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `floors`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `building_id` | `uuid` |  |
| `name` | `text` |  |
| `level` | `int4` |  |
| `created_at` | `timestamptz` |  |

## Table `spaces`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `floor_id` | `uuid` |  |
| `name` | `text` |  |
| `type` | `space_type` |  |
| `active` | `bool` |  |
| `capacity` | `int4` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `clusters`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `space_id` | `uuid` |  |
| `code` | `text` |  |
| `name` | `text` |  |
| `management_reserved` | `bool` |  |
| `enabled` | `bool` |  |
| `desk_count` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `cluster_authorizations`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `cluster_id` | `uuid` |  |
| `requested_by` | `uuid` |  |
| `reason` | `text` |  |
| `decided_by` | `uuid` |  Nullable |
| `status` | `approval_status` |  |
| `starts_at` | `timestamptz` |  Nullable |
| `ends_at` | `timestamptz` |  Nullable |
| `decided_at` | `timestamptz` |  Nullable |
| `decision_note` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `workstations`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `cluster_id` | `uuid` |  |
| `code` | `text` |  |
| `status` | `workstation_status` |  |
| `reservable` | `bool` |  |
| `svg_position` | `jsonb` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `digital_twin_objects`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `space_id` | `uuid` |  |
| `object_type` | `digital_twin_object_type` |  |
| `workstation_id` | `uuid` |  Nullable |
| `svg_element_id` | `text` |  |
| `label` | `text` |  Nullable |
| `geometry` | `jsonb` |  |
| `interactive` | `bool` |  |
| `created_at` | `timestamptz` |  |

## Table `settings`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `space_id` | `uuid` |  Nullable |
| `max_duration_hours_no_approval` | `numeric` |  |
| `no_show_window_minutes` | `int4` |  |
| `business_days` | `_int4` |  |
| `business_hours_start` | `time` |  |
| `business_hours_end` | `time` |  |
| `waiting_list_offer_expiry_minutes` | `int4` |  |
| `updated_by` | `uuid` |  Nullable |
| `updated_at` | `timestamptz` |  |
| `raw_config` | `jsonb` |  |

## Table `reservations`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `workstation_id` | `uuid` |  |
| `user_id` | `uuid` |  |
| `type` | `reservation_type` |  |
| `start_at` | `timestamptz` |  |
| `end_at` | `timestamptz` |  |
| `status` | `reservation_status` |  |
| `requires_approval` | `bool` |  |
| `purpose` | `text` |  Nullable |
| `check_in_deadline` | `timestamptz` |  Nullable |
| `cancelled_at` | `timestamptz` |  Nullable |
| `cancelled_by` | `uuid` |  Nullable |
| `cancel_reason` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `period` | `tstzrange` |  Nullable |

## Table `approval_requests`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `approval_type` | `approval_type` |  |
| `reservation_id` | `uuid` |  Nullable |
| `cluster_authorization_id` | `uuid` |  Nullable |
| `requested_by` | `uuid` |  |
| `status` | `approval_status` |  |
| `decided_by` | `uuid` |  Nullable |
| `decision_reason` | `text` |  Nullable |
| `decided_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `objective` | `text` |  Nullable |

## Table `check_events`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `reservation_id` | `uuid` |  |
| `event_type` | `check_event_type` |  |
| `actor_id` | `uuid` |  Nullable |
| `occurred_at` | `timestamptz` |  |
| `metadata` | `jsonb` |  Nullable |

## Table `waiting_list_entries`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `space_id` | `uuid` |  |
| `preferred_cluster_id` | `uuid` |  Nullable |
| `requested_start_at` | `timestamptz` |  |
| `requested_end_at` | `timestamptz` |  |
| `status` | `waiting_list_status` |  |
| `offered_workstation_id` | `uuid` |  Nullable |
| `offer_expires_at` | `timestamptz` |  Nullable |
| `fifo_rank` | `int8` |  Identity |
| `created_at` | `timestamptz` |  |
| `resolved_at` | `timestamptz` |  Nullable |
| `notes` | `text` |  Nullable |

## Table `notifications`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `reservation_id` | `uuid` |  Nullable |
| `event_code` | `text` |  |
| `channel` | `notification_channel` |  |
| `status` | `notification_status` |  |
| `title` | `text` |  |
| `body` | `text` |  Nullable |
| `sent_at` | `timestamptz` |  Nullable |
| `read_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `ai_interactions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `prompt` | `text` |  |
| `response` | `text` |  Nullable |
| `context_scope` | `jsonb` |  Nullable |
| `confidence` | `numeric` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `audit_logs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `actor_id` | `uuid` |  Nullable |
| `action` | `audit_action` |  |
| `entity_type` | `text` |  |
| `entity_id` | `uuid` |  Nullable |
| `before` | `jsonb` |  Nullable |
| `after` | `jsonb` |  Nullable |
| `ip_address` | `inet` |  Nullable |
| `user_agent` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `settings_change_requests`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `challenge_id` | `text` |  Unique |
| `admin_id` | `uuid` |  |
| `admin_name` | `text` |  Nullable |
| `new_settings` | `jsonb` |  |
| `otp_code` | `text` |  |
| `status` | `text` |  |
| `expires_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  |

## Custom Types / Enums

### `user_status`

`ACTIVE` | `INACTIVE` | `SUSPENDED`

### `space_type`

`OPEN_SPACE` | `MEETING_ROOM` | `EXECUTIVE_ROOM` | `PHONE_BOX` | `LOUNGE` | `OTHER`

### `workstation_status`

`AVAILABLE` | `RESERVED` | `OCCUPIED` | `NO_SHOW` | `DISABLED` | `MAINTENANCE`

### `digital_twin_object_type`

`WALL` | `CIRCULATION` | `ENTRANCE` | `WORKSTATION` | `CLUSTER_ZONE` | `COLLAB_ZONE` | `EQUIPMENT` | `PRINTER` | `DISPLAY` | `DISABLED_ZONE`

### `reservation_type`

`HALF_DAY_AM` | `HALF_DAY_PM` | `FULL_DAY` | `MULTI_DAY` | `STANDARD`

### `reservation_status`

`DRAFT` | `PENDING_APPROVAL` | `CONFIRMED` | `CHECK_IN_PENDING` | `OCCUPIED` | `COMPLETED` | `CANCELLED` | `REJECTED` | `NO_SHOW` | `AVAILABLE_RELEASED`

### `approval_type`

`LONG_DURATION` | `CLUSTER_MANAGEMENT`

### `approval_status`

`PENDING` | `APPROVED` | `REJECTED` | `INFO_REQUESTED`

### `check_event_type`

`CHECK_IN` | `CHECK_OUT_MANUAL` | `CHECK_OUT_AUTO` | `NO_SHOW_RELEASE`

### `waiting_list_status`

`WAITING` | `OFFERED` | `ACCEPTED` | `EXPIRED` | `CANCELLED`

### `notification_channel`

`IN_APP` | `EMAIL` | `PUSH`

### `notification_status`

`PENDING` | `SENT` | `FAILED` | `READ`

### `audit_action`

`LOGIN` | `CREATE` | `UPDATE` | `DELETE` | `APPROVE` | `REJECT` | `CHECK_IN` | `CHECK_OUT` | `NO_SHOW` | `CLUSTER_ACTIVATE` | `CLUSTER_DEACTIVATE` | `ROLE_CHANGE` | `SETTINGS_CHANGE` | `EXPORT` | `AI_QUERY`

## RLS Policies

### `users`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_users_admin_all` | ALL | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` | - |
| `p_users_ops_read` | SELECT | public | PERMISSIVE | `has_role(ARRAY['BUILDING_MANAGER'::text, 'GCI_MANAGER'::text, 'IT_ADMIN'::text])` | - |
| `p_users_self` | SELECT | public | PERMISSIVE | `(id = auth.uid())` | - |

### `user_roles`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_user_roles_admin_manage` | ALL | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` |
| `p_user_roles_self` | SELECT | public | PERMISSIVE | `((user_id = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text]))` | - |

### `roles`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_roles_read` | SELECT | public | PERMISSIVE | `true` | - |

### `permissions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_permissions_admin_write` | ALL | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` |
| `p_permissions_read` | SELECT | public | PERMISSIVE | `true` | - |

### `role_permissions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_role_permissions_admin_write` | ALL | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` |
| `p_role_permissions_read` | SELECT | public | PERMISSIVE | `true` | - |

### `buildings`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_buildings_read` | SELECT | public | PERMISSIVE | `true` | - |

### `floors`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_floors_read` | SELECT | public | PERMISSIVE | `true` | - |

### `ai_interactions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_ai_interactions_insert` | INSERT | public | PERMISSIVE | - | `(user_id = auth.uid())` |
| `p_ai_interactions_read` | SELECT | public | PERMISSIVE | `((user_id = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'IT_ADMIN'::text]))` | - |

### `settings`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_settings_admin_insert` | INSERT | public | PERMISSIVE | - | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'IT_ADMIN'::text])` |
| `p_settings_admin_write` | UPDATE | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'IT_ADMIN'::text])` | - |
| `p_settings_read` | SELECT | public | PERMISSIVE | `true` | - |

### `settings_change_requests`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_settings_change_requests_admin` | ALL | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` |

### `audit_logs`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_audit_insert` | INSERT | public | PERMISSIVE | - | `true` |
| `p_audit_read` | SELECT | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'SECURITY'::text, 'IT_ADMIN'::text])` | - |

### `spaces`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_spaces_read` | SELECT | public | PERMISSIVE | `true` | - |

### `reservations`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_reservations_delete` | DELETE | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'BUILDING_MANAGER'::text])` | - |
| `p_reservations_owner_insert` | INSERT | public | PERMISSIVE | - | `((user_id = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'RECEPTIONIST'::text]))` |
| `p_reservations_owner_read` | SELECT | public | PERMISSIVE | `((user_id = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'BUILDING_MANAGER'::text, 'GCI_MANAGER'::text, 'RECEPTIONIST'::text]))` | - |
| `p_reservations_owner_update` | UPDATE | public | PERMISSIVE | `((user_id = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'BUILDING_MANAGER'::text, 'GCI_MANAGER'::text]))` | - |

### `workstations`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_workstations_admin_delete` | DELETE | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` | - |
| `p_workstations_admin_insert_delete` | INSERT | public | PERMISSIVE | - | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` |
| `p_workstations_admin_write` | UPDATE | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'BUILDING_MANAGER'::text, 'GCI_MANAGER'::text])` | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'BUILDING_MANAGER'::text, 'GCI_MANAGER'::text])` |
| `p_workstations_read` | SELECT | public | PERMISSIVE | `true` | - |

### `clusters`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_clusters_admin_delete` | DELETE | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` | - |
| `p_clusters_admin_insert_delete` | INSERT | public | PERMISSIVE | - | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text])` |
| `p_clusters_admin_write` | UPDATE | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'BUILDING_MANAGER'::text, 'GCI_MANAGER'::text])` | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'BUILDING_MANAGER'::text, 'GCI_MANAGER'::text])` |
| `p_clusters_read` | SELECT | public | PERMISSIVE | `true` | - |

### `digital_twin_objects`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_dt_objects_read` | SELECT | public | PERMISSIVE | `true` | - |

### `cluster_authorizations`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_cluster_auth_decide` | UPDATE | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'GCI_MANAGER'::text, 'BUILDING_MANAGER'::text])` | - |
| `p_cluster_auth_insert` | INSERT | public | PERMISSIVE | - | `(requested_by = auth.uid())` |
| `p_cluster_auth_read` | SELECT | public | PERMISSIVE | `((requested_by = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'GCI_MANAGER'::text, 'BUILDING_MANAGER'::text]))` | - |

### `check_events`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_check_events_insert` | INSERT | public | PERMISSIVE | - | `((actor_id = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'RECEPTIONIST'::text]))` |
| `p_check_events_read` | SELECT | public | PERMISSIVE | `((actor_id = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'BUILDING_MANAGER'::text, 'GCI_MANAGER'::text, 'RECEPTIONIST'::text]))` | - |

### `notifications`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_notifications_insert` | INSERT | public | PERMISSIVE | - | `((user_id = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'EXECUTIVE_ASSISTANT'::text, 'DIRECTOR'::text, 'GCI_MANAGER'::text, 'BUILDING_MANAGER'::text, 'RECEPTIONIST'::text, 'IT_ADMIN'::text]))` |
| `p_notifications_owner` | SELECT | public | PERMISSIVE | `(user_id = auth.uid())` | - |
| `p_notifications_owner_update` | UPDATE | public | PERMISSIVE | `((user_id = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text]))` | - |

### `approval_requests`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_approvals_decide` | UPDATE | public | PERMISSIVE | `has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'EXECUTIVE_ASSISTANT'::text, 'DIRECTOR'::text, 'GCI_MANAGER'::text, 'BUILDING_MANAGER'::text])` | - |
| `p_approvals_insert` | INSERT | public | PERMISSIVE | - | `((requested_by = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'EXECUTIVE_ASSISTANT'::text, 'DIRECTOR'::text, 'GCI_MANAGER'::text, 'BUILDING_MANAGER'::text, 'RECEPTIONIST'::text]))` |
| `p_approvals_read` | SELECT | public | PERMISSIVE | `((requested_by = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'EXECUTIVE_ASSISTANT'::text, 'DIRECTOR'::text, 'GCI_MANAGER'::text, 'BUILDING_MANAGER'::text]))` | - |

### `waiting_list_entries`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `p_waiting_list_insert` | INSERT | public | PERMISSIVE | - | `((user_id = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'RECEPTIONIST'::text]))` |
| `p_waiting_list_read` | SELECT | public | PERMISSIVE | `((user_id = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'BUILDING_MANAGER'::text, 'GCI_MANAGER'::text, 'RECEPTIONIST'::text]))` | - |
| `p_waiting_list_update` | UPDATE | public | PERMISSIVE | `((user_id = auth.uid()) OR has_role(ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'RECEPTIONIST'::text]))` | - |

