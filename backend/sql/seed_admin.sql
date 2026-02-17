-- Create ADMIN role + admin user for DEV tests (no real login yet)
-- Requires pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Ensure Role ADMIN exists
INSERT INTO "Role" ("id","name")
VALUES (gen_random_uuid(), 'ADMIN')
ON CONFLICT ("name") DO NOTHING;

-- 2) Ensure admin user exists
-- NOTE: passwordHash is just a placeholder until login module exists.
INSERT INTO "User" ("id","name","email","passwordHash","active","roleId","createdAt")
SELECT
  gen_random_uuid(),
  'Admin',
  'admin@pharma.local',
  'dev',
  true,
  r.id,
  now()
FROM "Role" r
WHERE r."name"='ADMIN'
ON CONFLICT ("email") DO NOTHING;

-- Show created/exists
SELECT u.id, u.email, u."createdAt", r.name as role
FROM "User" u
JOIN "Role" r ON r.id = u."roleId"
WHERE u.email='admin@pharma.local';
