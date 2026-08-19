-- Dedicated permission for the global AI configuration.
--
-- The AI config routes were first gated on `technical_administration`, which is the closest
-- existing row but the wrong one: the §13 matrix grants that to IT Admin and withholds it from
-- Administrator, giving exactly the inverse of the required access (Admin 403, IT Admin 200).
--
-- AI configuration is its own authority - it controls an external provider credential and the
-- model every AI capability runs on - so it gets its own permission rather than overloading a
-- row that means something else.
--
-- Grants: Administrator and Super Admin only. Every other role, IT Admin included, is denied:
-- the credential is a business/vendor relationship, not a technical-operations concern.

insert into permissions (code, domain, description) values
  ('ai_configuration', 'administration', 'Configuration IA globale (provider & modèle)')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id, can_read, can_create, can_update, can_delete, can_approve)
select r.id, p.id, v.cr, v.cc, v.cu, v.cd, v.ca
from (values
  ('SUPER_ADMIN','ai_configuration',true,true,true,false,false),
  ('ADMIN','ai_configuration',true,true,true,false,false),
  ('IT_ADMIN','ai_configuration',false,false,false,false,false),
  ('BUILDING_MANAGER','ai_configuration',false,false,false,false,false),
  ('GCI_MANAGER','ai_configuration',false,false,false,false,false),
  ('RECEPTIONIST','ai_configuration',false,false,false,false,false),
  ('EXECUTIVE_ASSISTANT','ai_configuration',false,false,false,false,false),
  ('DIRECTOR','ai_configuration',false,false,false,false,false),
  ('EMPLOYEE','ai_configuration',false,false,false,false,false),
  ('SECURITY','ai_configuration',false,false,false,false,false)
) as v(role_code, permission_code, cr, cc, cu, cd, ca)
join roles r on r.code = v.role_code
join permissions p on p.code = v.permission_code
on conflict (role_id, permission_id) do update set
  can_read = excluded.can_read,
  can_create = excluded.can_create,
  can_update = excluded.can_update,
  can_delete = excluded.can_delete,
  can_approve = excluded.can_approve;
