-- Ver últimos documentos fiscais criados
SELECT "id","storeId","status","createdAt"
FROM "FiscalDocument"
ORDER BY "createdAt" DESC
LIMIT 10;
