-- Seed: the ten roles.
--
-- The baseline is schema-only, and everywhere else in this directory that is the right rule -
-- rows belong in database/seeder.ts or in a migration that has a reason to write them. This file
-- is the one exception, because the schema the baseline creates is not merely empty without these
-- ten rows, it is broken:
--
--   * handle_new_auth_user() looks up code = 'EMPLOYEE' to give each new account its default role.
--     With no such row the insert into user_roles selects nothing, the trigger still succeeds, and
--     the account lands with no roles at all.
--   * 20260811132256 joins every cell of the RBAC matrix against roles.code. Against an empty
--     roles table it inserts zero rows, role_permissions stays empty, and PermissionService.can()
--     returns null rather than false - by design, so a database outage degrades to previous
--     behaviour instead of locking everyone out. The result is an application that comes up and
--     works, serving every request on the route guards' hardcoded fallback lists, with one [RBAC]
--     warning on boot as the only signal that the matrix was never loaded. See the "Why an empty
--     matrix is worse than a crash" section of README.md.
--
-- So these rows are not sample data; they are the vocabulary every policy, every route guard and
-- every matrix cell in the project is written against. A database without them is not a database
-- with less data in it - it is a database enforcing a different, weaker set of rules. That is what
-- puts them in the migration directory rather than in the seeder, and it is dated 00000000000001
-- so it lands immediately after the baseline and long before anything that reads roles.code.
--
-- Transcribed from the live project on 2026-08-20: codes, names, descriptions and is_critical
-- exactly as they stand there, trailing spaces in six of the descriptions included. Ids are left
-- to the column's gen_random_uuid() default. Nothing in the repository or the schema references a
-- role by its id literal - every reference is by code, through roles.code, which is why the
-- conflict target below is the roles_code_key unique constraint and not the primary key. Fixing
-- the ids would only invite two databases to disagree about which id was the real one.
--
-- Idempotent, and a no-op against the hosted project, where all ten already exist. ON CONFLICT
-- DO NOTHING rather than DO UPDATE on purpose: a name or a description edited through the app is
-- the operator's, and a replay of the history should not silently reword it. A code that has to
-- change its meaning gets its own later migration.

insert into public.roles (code, name, description, is_critical) values
  ('SUPER_ADMIN',         'Super Administrator',     'Responsable global de la configuration de la plateforme',        true),
  ('ADMIN',               'Administrator',           'Administrateur fonctionnel du module',                           true),
  ('BUILDING_MANAGER',    'Building Manager',        'Gestion opérationnelle bâtiment ',                               false),
  ('GCI_MANAGER',         'GCI Manager',             'Gouvernance des espaces GCI ',                                   false),
  ('RECEPTIONIST',        'Receptionist',            'Support opérationnel ',                                          false),
  ('DIRECTOR',            'Director',                'Sponsor décisionnel ',                                           false),
  ('EXECUTIVE_ASSISTANT', 'Executive Assistant',     'Autorisé à approuver certaines réservations longues ou sensibles', false),
  ('IT_ADMIN',            'IT Administrator',        'Sécurité, infrastructure, support ',                             false),
  ('SECURITY',            'Security',                'Contrôle, audit, accès ',                                        false),
  ('EMPLOYEE',            'Employee / Collaborator', 'Utilisateurs finaux',                                            false)
on conflict (code) do nothing;
