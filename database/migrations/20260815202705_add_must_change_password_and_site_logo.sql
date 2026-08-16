-- Forced password creation on first sign-in.
--
-- Accounts are created (and reset) with a generated temporary password that the administrator
-- reads out to the user. Until now nothing recorded that the password was temporary, so a user
-- could keep working indefinitely on a credential their admin also knows. This flag is set by
-- both creation and reset, and cleared the moment the user sets their own password.
alter table public.users
  add column if not exists must_change_password boolean not null default false;

comment on column public.users.must_change_password is
  'True while the account is on an admin-issued temporary password. Forces the password-creation form at sign-in.';

-- Every account that exists today was provisioned with a temporary password, so they are all
-- due a rotation. Kept out of the demo/system rows which have no interactive sign-in.
update public.users set must_change_password = true where status = 'ACTIVE';

-- Site logo, stored alongside the rest of the branding settings.
--
-- Held as a validated data URI rather than a storage-bucket URL: the settings row is already
-- admin-gated and served with the rest of the configuration, which avoids introducing a public
-- bucket whose object ACLs would become a second thing to secure. Size is capped in the
-- application layer (services/settings/logoValidation.ts) before it ever reaches this column.
alter table public.settings
  add column if not exists site_logo_data_url text;

comment on column public.settings.site_logo_data_url is
  'Validated image data URI for the site mark. Written only through the settings API, which enforces type, magic-byte, size and dimension checks.';
