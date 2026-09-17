# Migrations

Reversible by policy (API spec §6). Each migration is a directory `NNNN_snake_name/` holding
`up.sql` and a non-empty `down.sql`. CI runs `db:migrate --verify` and fails without one.

## Adding a migration

1. Change the Drizzle schema in `src/db/schema/`.
2. `pnpm --filter @repo/api db:generate --name <snake_name>` — writes `drizzle/NNNN_<snake_name>.sql`.
3. Copy it verbatim to `migrations/NNNN_<snake_name>/up.sql`. `mirror.test.ts` fails if they differ.
4. Write `down.sql` by hand: the statements that return the schema to its previous state.
5. `pnpm --filter @repo/api test:integration` — `schema.int.test.ts` applies everything, rolls
   everything back and applies again.

## Destructive changes: expand / contract

Never drop or rename in the release that stops using a column. Add → backfill → switch reads →
drop in a *later* release. `db:migrate --dry-run` prints every statement that takes an
`ACCESS EXCLUSIVE` lock so the reviewer sees the blast radius.

## Commands (run with `DATABASE_URL` set, or from `apps/api/.env`)

| Command | Effect |
|---|---|
| `pnpm --filter @repo/api db:migrate --verify` | Layout check, no database |
| `pnpm --filter @repo/api db:migrate --status` | Applied / pending / drift; exit 1 on drift |
| `pnpm --filter @repo/api db:migrate --dry-run` | Pending SQL + lock warnings; writes nothing |
| `pnpm --filter @repo/api db:migrate --apply` | All pending, one transaction |
| `pnpm --filter @repo/api db:migrate --rollback 1 --yes` | `down.sql` of the newest migration |

The runner applies a batch in one transaction, so statements that cannot run inside a
transaction (`CREATE INDEX CONCURRENTLY`) are not supported.
