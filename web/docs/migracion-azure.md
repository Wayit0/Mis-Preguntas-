# Runbook: migración de datos Render → Azure

Migración one-shot de los datos del MVP (Postgres de **Render**) a la base
**NUEVA** de Azure (Postgres Flexible Server provisionado por Bicep, Fase 8). La
base de Azure arranca vacía: aquí se copian usuarios, preguntas, textos y
colaboraciones conservando los IDs, se crea el esquema de better-auth y se
respaldan las credenciales legacy (`accounts` con `legacy-sha256:`).

> **No ejecutar contra datos reales sin leer todo este runbook, tener un respaldo
> reciente de Render y haber probado el dry-run.** El paso de restore modifica la
> base de Azure.

## 0. Pre-requisitos

- Cliente de PostgreSQL (`pg_dump`, `psql`) en el PATH. Idealmente la **misma
  major version** del servidor de Azure (PG 16) para evitar incompatibilidades de
  dump. Verifica con `pg_dump --version`.
- `pnpm` instalado y dependencias del proyecto (`pnpm install` en `web/`).
- Acceso de red a ambos Postgres:
  - **Render**: connection string externa (incluye `?sslmode=require`).
  - **Azure**: abrir temporalmente el firewall del Flexible Server a tu IP
    pública. El Bicep acepta `clientIp` (ver `infra/deploy.sh`); o bien:
    ```bash
    az postgres flexible-server firewall-rule create \
      --resource-group rg-mispreguntas-prod \
      --name <psql-server-name> \
      --rule-name migracion-temporal \
      --start-ip-address <TU_IP> --end-ip-address <TU_IP>
    ```
  Recuerda **borrar la regla** al terminar.

## 1. Variables de entorno

```bash
export RENDER_DATABASE_URL='postgres://USER:PASS@HOST.render.com/DB?sslmode=require'
export AZURE_DATABASE_URL='postgres://mispreguntasadmin:PASS@psql-...postgres.database.azure.com:5432/mispreguntas?sslmode=require'
```

`AZURE_DATABASE_URL` se puede leer del Key Vault provisionado:

```bash
az keyvault secret show --vault-name <kv-name> --name database-url --query value -o tsv
```

## 2. Qué hace el script

`scripts/migrate-render-to-azure.ts` orquesta, en orden:

1. **`drizzle-kit migrate`** sobre Azure → crea el esquema completo (tablas de
   dominio + `sessions`/`accounts`/`verifications` y las columnas añadidas para
   better-auth). Usa `DATABASE_URL = AZURE_DATABASE_URL`.
2. **`pg_dump`** de Render con `--data-only --no-owner --no-privileges` y sólo las
   tablas de dominio: `usuarios`, `preguntas`, `textos`, `colaboraciones`.
3. **`psql`** restaura ese dump en Azure (`ON_ERROR_STOP=on`,
   `--single-transaction`) **conservando los IDs**.
4. **`setval(...)`** reajusta las secuencias `id` de `usuarios`, `preguntas` y
   `textos` al `MAX(id)` (un restore data-only con COPY no avanza la secuencia;
   sin esto, el primer INSERT nuevo chocaría con un id existente).
5. **`backfillAccounts`** crea, por cada usuario sin account `credential`, la fila
   `accounts` con `password = 'legacy-sha256:<hash>'`. Idempotente. Las
   contraseñas se re-hashean a scrypt en el primer login (ver `lib/auth.ts` y
   `lib/auth-password.ts`).
6. **Verificación**: imprime conteos origen vs destino por tabla de dominio y
   **aborta con exit 1 si difieren**.

## 3. Dry-run (recomendado antes de tocar Render/Azure reales)

Prueba el flujo end-to-end contra dos Postgres locales (docker) para validar el
script sin riesgo:

```bash
# Origen "Render" simulado
docker run -d --name pg-render -e POSTGRES_PASSWORD=pg -p 5433:5432 postgres:16
# Destino "Azure" simulado
docker run -d --name pg-azure  -e POSTGRES_PASSWORD=pg -p 5434:5432 postgres:16

# Sembrar el origen con el esquema + algunos datos (usa las migraciones Drizzle).
DATABASE_URL='postgres://postgres:pg@localhost:5433/postgres' pnpm exec drizzle-kit migrate
# ... insertar usuarios/preguntas de prueba en pg-render ...

export RENDER_DATABASE_URL='postgres://postgres:pg@localhost:5433/postgres'
export AZURE_DATABASE_URL='postgres://postgres:pg@localhost:5434/postgres'
pnpm exec tsx scripts/migrate-render-to-azure.ts

# Limpieza
docker rm -f pg-render pg-azure
```

## 4. Ejecución real

```bash
cd web
pnpm install
# (firewall de Azure abierto a tu IP, variables exportadas)
pnpm exec tsx scripts/migrate-render-to-azure.ts
```

Salida esperada al final:

```
== 6/6 Verificación de conteos por tabla ==
   OK  usuarios         render=NN azure=NN
   OK  preguntas        render=NN azure=NN
   OK  textos           render=NN azure=NN
   OK  colaboraciones   render=NN azure=NN

Migración completada: conteos coinciden.
```

Si alguna fila aparece como `XX`, el script aborta (exit 1) sin marcar éxito;
revisa el dump/restore y vuelve a correr (el `psql` corre en una sola
transacción, así que un fallo no deja datos a medias).

## 5. Verificación post-migración

- **Login legacy**: inicia sesión con un usuario migrado y su contraseña
  original. Debe entrar y el `accounts.password` debe pasar de `legacy-sha256:` a
  `scrypt:` (re-hash automático). Confirmar:
  ```sql
  SELECT provider_id, left(password, 12) FROM accounts WHERE user_id = <id>;
  ```
- **IDs y secuencias**: crear una pregunta nueva no debe colisionar de id.
- **Conteos**: ya validados por el paso 6; revisar manualmente si hubo `XX`.

## 6. Limpieza

- Borrar la regla de firewall temporal de Azure:
  ```bash
  az postgres flexible-server firewall-rule delete \
    --resource-group rg-mispreguntas-prod --name <psql-server-name> \
    --rule-name migracion-temporal --yes
  ```
- Las imágenes (`uploads/`) **no** las migra este script: viven en Azure Blob y se
  suben desde la app; el MVP de Render no persistía uploads (ver memoria del
  proyecto), así que no hay archivos históricos que copiar.

## Notas

- El script es seguro de re-ejecutar respecto a `accounts` (backfill idempotente),
  pero el **restore** re-inserta filas de dominio: si ya corriste el restore,
  vuelve a partir de una base de Azure limpia (o trunca las tablas de dominio)
  antes de re-ejecutar, o los conteos divergirán por duplicados.
- Para una base de Azure recién provisionada esto no aplica (arranca vacía).
