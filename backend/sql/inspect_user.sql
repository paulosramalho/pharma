-- Inspect columns of User table
\d "User"
SELECT id, name, email, active, "createdAt" FROM "User" ORDER BY "createdAt" ASC LIMIT 10;
