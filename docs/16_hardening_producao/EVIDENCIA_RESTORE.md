# Evidência de Restore — Pharma (Staging)

**Data:** ____/____/____  
**Responsável:** __________________________  
**Ambiente:** STAGING  
**DB destino:** pharma_staging (ou outro)  
**Arquivo de backup:** _____________________

## 1) Preparação
- [ ] `DATABASE_URL` apontando para STAGING
- [ ] Backup selecionado (arquivo .dump)
- [ ] Server parado (se necessário) / staging isolado

## 2) Execução
Comando:
- [ ] `powershell -ExecutionPolicy Bypass -File C:\pharma\backend\scripts\restore-postgres.ps1 -DumpFile "<CAMINHO>"`

Resultado:
- [ ] Restore OK (sem erros)
- [ ] Tempo total: ________

## 3) Testes funcionais mínimos (staging)
- [ ] `GET /health/ready` retorna `db:"ok"`
- [ ] Prisma Studio abre e mostra tabelas
- [ ] Teste rápido:
  - [ ] Login (quando existir)
  - [ ] Criar venda (quando existir)
  - [ ] Fechar caixa (quando existir)

## 4) Evidências (cole prints/outputs)
- Output do restore:
```
(cole aqui)
```
- Output do /health/ready:
```
(cole aqui)
```

## 5) Assinatura
Responsável: __________________________
