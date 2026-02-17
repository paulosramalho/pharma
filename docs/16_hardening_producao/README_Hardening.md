# Hardening de Produção — Checklist Executável (Windows)

## 1) Atualizar arquivos (este pacote)
- `backend/src/common/env.js`
- `backend/src/common/boot.js`
- `backend/src/server.js` (atualizado para validar ENV)
- `backend/scripts/monitor-ready.ps1`
- `infra/task-scheduler/*.xml` (importar no Agendador)

## 2) ENV obrigatório
Crie `C:\pharma\backend\.env` e garanta:
- `DATABASE_URL=...`
- `PORT=3000` (ou sua porta)

> Se `DATABASE_URL` faltar, o server falha ao iniciar (fail-fast).

## 3) Rodar e validar
- Subir: `npm run dev`
- Testes:
  - `http://localhost:3000/health/live`
  - `http://localhost:3000/health/ready`
  - `http://localhost:3000/metrics`

## 4) Monitoramento (mínimo)
### Opção A (recomendada no Windows): Task Scheduler
Importe os XMLs em `C:\pharma\infra\task-scheduler\`:
- `Task_ReadyEvery5Min.xml` (ping /ready)
- `Task_BackupDaily.xml` (backup diário)

Logs:
- `C:\pharma\backups\monitor\ready_YYYYMMDD.log`

## 5) Backups
Script: `C:\pharma\backend\scripts\backup-postgres.ps1`
Saída padrão: `C:\pharma\backups\db\pharma_YYYYMMDD_HHMMSS.dump`

Retenção padrão: 14 dias (ajuste no XML ou parâmetros do script)

## 6) Staging + Restore testado (com evidência)
- Crie DB staging (ex.: `pharma_staging`)
- Rode restore usando `restore-postgres.ps1` apontando DATABASE_URL para staging
- Preencha a evidência em `EVIDENCIA_RESTORE.md`
