-- Global AI provider/model configuration.
--
-- Exactly one row is active platform-wide: changing it changes the model every AI capability
-- uses, for every role. Superseded rows are kept (is_active = false) so the configuration
-- history is auditable without a second table.
--
-- Deliberately NOT folded into `settings`: that row is readable by every authenticated user
-- through the settings API, and this table holds an encrypted provider credential. Keeping it
-- separate lets RLS deny it wholesale rather than relying on column-level filtering in app code.

create type ai_config_status as enum (
  'NOT_CONFIGURED',
  'CONNECTED',
  'VALIDATING',
  'INVALID_CREDENTIALS',
  'PROVIDER_UNAVAILABLE',
  'MODEL_UNAVAILABLE'
);

create table public.ai_provider_config (
  id                    uuid primary key default gen_random_uuid(),
  provider              text not null,
  model                 text not null,

  -- AES-256-GCM ciphertext of the provider API key, base64. The plaintext key never leaves the
  -- server: it is never selected into any API response, never logged, never audited.
  -- Null is legal for a provider bootstrapped from an environment variable.
  encrypted_credential  text,
  credential_iv         text,
  credential_tag        text,
  -- Last 4 characters only, so the UI can say "...a1b2" without holding the secret.
  credential_hint       text,

  status                ai_config_status not null default 'NOT_CONFIGURED',
  is_active             boolean not null default false,
  model_capabilities    jsonb not null default '{}'::jsonb,

  configured_by         uuid references public.users(id),
  last_validated_at     timestamptz,
  validation_error      text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- An active configuration must have been validated; an unvalidated row must never be live.
  constraint ai_config_active_is_validated check (
    not is_active or (status = 'CONNECTED' and last_validated_at is not null)
  ),
  -- Ciphertext is only meaningful with its IV and auth tag; all three or none.
  constraint ai_config_credential_complete check (
    (encrypted_credential is null and credential_iv is null and credential_tag is null)
    or (encrypted_credential is not null and credential_iv is not null and credential_tag is not null)
  )
);

-- "There is exactly one active system-wide AI configuration" enforced by the database rather
-- than by application convention, so a concurrent activation cannot produce two live configs.
create unique index ai_provider_config_single_active
  on public.ai_provider_config ((true)) where is_active;

create index ai_provider_config_history_idx
  on public.ai_provider_config (created_at desc);

alter table public.ai_provider_config enable row level security;

-- No policy grants direct table access to end users. Every read and write goes through the
-- backend service role, which is what keeps the credential columns unreachable from the client
-- even if someone holds a valid anon JWT.
comment on table public.ai_provider_config is
  'Global AI provider/model configuration. Service-role access only - contains an encrypted provider credential.';
