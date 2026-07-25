/**
 * SCHEMA FIDELITY — the one failure mode the other tests cannot catch.
 *
 * Every other test in this directory reasons about plans in memory. None of
 * them touch Postgres, so a plan that upserts a column which does not exist
 * passes the entire suite and fails on stage. This file closes that hole by
 * parsing `supabase/migrations/0001_init.sql` itself and cross-checking every
 * table name, column name, NOT NULL, foreign key and load-bearing constraint
 * that the demo plans depend on. If Lane A adds an additive migration that
 * moves a column, or a fixture grows a field, CI goes red here.
 *
 * The parser is deliberately crude (regex over CREATE TABLE blocks) — it only
 * needs to be right about this one file, which is frozen at hour 0.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  baselinePlan,
  deletePlan,
  demoCarer,
  resetPlan,
  revokePlan,
  seedPlan,
  TABLE_INSERT_ORDER,
  type Plan,
} from '../dal';
import { loadArtifactTemplates, loadMargaretSnapshot } from '../fixtures';

/* ============================ migration parser ============================ */

type ColumnDef = {
  readonly name: string;
  readonly notNull: boolean;
  readonly hasDefault: boolean;
  /** Table this column references, if any. */
  readonly references: string | null;
};

type TableDef = {
  readonly name: string;
  readonly columns: readonly ColumnDef[];
  readonly checks: readonly string[];
};

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATION_PATH = join(REPO_ROOT, 'supabase', 'migrations', '0001_init.sql');

function parseMigration(sql: string): Map<string, TableDef> {
  const tables = new Map<string, TableDef>();
  const blockRe = /create table (\w+)\s*\(([\s\S]*?)\n\);/g;

  for (const block of sql.matchAll(blockRe)) {
    const name = block[1];
    const body = block[2];
    if (name === undefined || body === undefined) continue;

    const columns: ColumnDef[] = [];
    const checks: string[] = [];

    // Strip line comments FIRST: several of them contain commas ("typed full
    // name, never a checkbox") which would otherwise split a column in half.
    const stripped = body
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');

    // Then split on top-level commas — the only nested commas left are inside
    // the check constraints, which parentheses depth keeps together.
    let depth = 0;
    let current = '';
    const parts: string[] = [];
    for (const char of stripped) {
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (char === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    parts.push(current);

    for (const rawPart of parts) {
      const part = rawPart
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join(' ')
        .trim();
      if (part.length === 0) continue;

      const lowered = part.toLowerCase();
      if (lowered.startsWith('constraint') || lowered.startsWith('check')) {
        checks.push(part);
        continue;
      }

      const columnName = part.split(/\s+/)[0];
      if (columnName === undefined) continue;
      const referenceMatch = /references\s+(\w+)\s*\(/.exec(lowered);
      columns.push({
        name: columnName,
        notNull: /\bnot null\b/.test(lowered),
        hasDefault: /\bdefault\b/.test(lowered) || lowered.includes('primary key default'),
        references: referenceMatch?.[1] ?? null,
      });
    }

    tables.set(name, { name, columns, checks });
  }

  return tables;
}

const SCHEMA = parseMigration(readFileSync(MIGRATION_PATH, 'utf8'));

function columnNames(table: string): readonly string[] {
  const def = SCHEMA.get(table);
  if (def === undefined) throw new Error(`table ${table} is not in the migration`);
  return def.columns.map((c) => c.name);
}

function parentsOf(table: string): readonly string[] {
  const def = SCHEMA.get(table);
  if (def === undefined) throw new Error(`table ${table} is not in the migration`);
  return def.columns
    .map((c) => c.references)
    .filter((ref): ref is string => ref !== null && ref !== table);
}

/* =============================== fixtures =============================== */

const snapshot = loadMargaretSnapshot();
const templates = loadArtifactTemplates();
const carer = demoCarer(snapshot.person.id);

const PLANS: readonly { readonly label: string; readonly plan: Plan }[] = [
  { label: 'baselinePlan', plan: baselinePlan(snapshot, templates, carer) },
  { label: 'seedPlan', plan: seedPlan(snapshot, templates, carer) },
  { label: 'deletePlan', plan: deletePlan(snapshot) },
  { label: 'resetPlan', plan: resetPlan(snapshot, templates, carer) },
  { label: 'revokePlan', plan: revokePlan(snapshot, '2026-07-25T12:00:00.000Z') },
];

/* ============================== the parser =============================== */

describe('migration parser', () => {
  it('found every table the demo writes to, and their columns', () => {
    // Sanity-check the crude regex before trusting anything it produces.
    expect(SCHEMA.size).toBeGreaterThanOrEqual(11);
    expect(columnNames('people')).toEqual([
      'id',
      'display_name',
      'dob',
      'created_by',
      'created_at',
    ]);
    expect(columnNames('care_relationships')).toEqual([
      'id',
      'person_id',
      'member_id',
      'role',
      'access_basis',
      'declared_name',
      'granted_at',
      'revoked_at',
    ]);
    expect(columnNames('assertions')).toEqual([
      'id',
      'artifact_id',
      'slot_key',
      'text',
      'fact_ids',
      'citation_verified',
    ]);
  });

  it('read the two load-bearing constraints and the FK graph', () => {
    expect(SCHEMA.get('facts')?.checks.join(' ')).toContain('fact_needs_support');
    expect(SCHEMA.get('assertions')?.checks.join(' ')).toContain('citation_requires_facts');
    expect(SCHEMA.get('claim_conflicts')?.checks.join(' ')).toContain('conflict_needs_two');
    expect(parentsOf('assertions')).toEqual(['artifacts']);
    expect(parentsOf('artifacts')).toEqual(['people', 'artifact_templates']);
    expect(parentsOf('claims')).toEqual(['people', 'sources']);
  });
});

/* ========================= column-by-column diff ========================= */

describe('plan rows against the real schema', () => {
  it('every table a plan touches exists in the migration', () => {
    for (const { label, plan } of PLANS) {
      for (const op of plan) {
        expect(SCHEMA.has(op.table), `${label}: table ${op.table}`).toBe(true);
      }
    }
  });

  it('every column written, matched or patched is a real column', () => {
    for (const { label, plan } of PLANS) {
      for (const op of plan) {
        const allowed = columnNames(op.table);
        const keys =
          op.kind === 'upsert'
            ? op.rows.flatMap((row) => Object.keys(row))
            : op.kind === 'update'
              ? [...Object.keys(op.match), ...Object.keys(op.patch)]
              : Object.keys(op.match);
        for (const key of new Set(keys)) {
          expect(allowed, `${label}: ${op.table}.${key}`).toContain(key);
        }
      }
    }
  });

  it('onConflict targets the declared primary key of each table', () => {
    const primaryKey = (table: string): string => {
      const def = SCHEMA.get(table);
      const sql = readFileSync(MIGRATION_PATH, 'utf8');
      const block = new RegExp(`create table ${table}\\s*\\(([\\s\\S]*?)\\n\\);`).exec(sql);
      expect(def).toBeDefined();
      expect(block).not.toBeNull();
      const line = (block?.[1] ?? '')
        .split('\n')
        .find((l) => l.toLowerCase().includes('primary key'));
      return (line ?? '').trim().split(/\s+/)[0] ?? '';
    };

    for (const { label, plan } of PLANS) {
      for (const op of plan) {
        if (op.kind !== 'upsert') continue;
        expect(op.onConflict, `${label}: ${op.table}`).toBe(primaryKey(op.table));
      }
    }
  });

  it('every NOT NULL column without a default is supplied, and not null', () => {
    for (const { label, plan } of PLANS) {
      for (const op of plan) {
        if (op.kind !== 'upsert') continue;
        const required = (SCHEMA.get(op.table)?.columns ?? []).filter(
          (c) => c.notNull && !c.hasDefault,
        );
        for (const row of op.rows) {
          const record: Record<string, unknown> = Object.fromEntries(Object.entries(row));
          for (const column of required) {
            expect(
              record[column.name],
              `${label}: ${op.table}.${column.name} must be supplied`,
            ).not.toBeUndefined();
            expect(
              record[column.name],
              `${label}: ${op.table}.${column.name} is NOT NULL`,
            ).not.toBeNull();
          }
        }
      }
    }
  });

  it('nullable-only columns are the only ones ever set to null', () => {
    for (const { label, plan } of PLANS) {
      for (const op of plan) {
        if (op.kind !== 'upsert') continue;
        const byName = new Map(
          (SCHEMA.get(op.table)?.columns ?? []).map((c) => [c.name, c] as const),
        );
        for (const row of op.rows) {
          for (const [key, value] of Object.entries(row)) {
            if (value !== null) continue;
            expect(byName.get(key)?.notNull, `${label}: ${op.table}.${key} is NOT NULL`).toBe(
              false,
            );
          }
        }
      }
    }
  });
});

/* ===================== constraints the DB will enforce ==================== */

describe('rows satisfy the constraints the database will apply', () => {
  const plan = seedPlan(snapshot, templates, carer);

  function upsertRows(table: string): readonly Record<string, unknown>[] {
    const op = plan.find((o) => o.table === table && o.kind === 'upsert');
    if (op === undefined || op.kind !== 'upsert') throw new Error(`no upsert for ${table}`);
    return op.rows.map((row) => Object.fromEntries(Object.entries(row)));
  }

  it('fact_needs_support: only an unknown fact may lack supporting claims', () => {
    for (const row of upsertRows('facts')) {
      const supporting = row.supporting_claim_ids;
      expect(Array.isArray(supporting)).toBe(true);
      if (Array.isArray(supporting) && supporting.length === 0) {
        expect(row.status).toBe('unknown');
      }
    }
  });

  it('citation_requires_facts: no verified citation with an empty fact list', () => {
    for (const row of upsertRows('assertions')) {
      if (row.citation_verified !== true) continue;
      const factIds = row.fact_ids;
      expect(Array.isArray(factIds)).toBe(true);
      expect(Array.isArray(factIds) ? factIds.length : 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('conflict_needs_two: every conflict cites at least two claims', () => {
    for (const row of upsertRows('claim_conflicts')) {
      const claimIds = row.claim_ids;
      expect(Array.isArray(claimIds) ? claimIds.length : 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('every FK value in the plan resolves to a row the same plan writes', () => {
    const ids = new Map<string, Set<string>>();
    for (const op of plan) {
      if (op.kind !== 'upsert') continue;
      const pk = op.onConflict;
      const bucket = ids.get(op.table) ?? new Set<string>();
      for (const row of op.rows) {
        const record: Record<string, unknown> = Object.fromEntries(Object.entries(row));
        bucket.add(String(record[pk]));
      }
      ids.set(op.table, bucket);
    }

    for (const op of plan) {
      if (op.kind !== 'upsert') continue;
      const fkColumns = (SCHEMA.get(op.table)?.columns ?? []).filter(
        (c) => c.references !== null,
      );
      for (const row of op.rows) {
        const record: Record<string, unknown> = Object.fromEntries(Object.entries(row));
        for (const column of fkColumns) {
          const value = record[column.name];
          if (value === undefined || value === null) continue;
          const target = column.references;
          if (target === null || target === op.table) continue; // self-FK
          expect(
            ids.get(target)?.has(String(value)),
            `${op.table}.${column.name} -> ${target}(${String(value)})`,
          ).toBe(true);
        }
      }
    }
  });
});

/* ============================== FK ordering ============================== */

describe('insert and delete order follow the FK graph', () => {
  const insertOrder: readonly string[] = TABLE_INSERT_ORDER;

  it('TABLE_INSERT_ORDER is itself parents-before-children', () => {
    insertOrder.forEach((table, index) => {
      for (const parent of parentsOf(table)) {
        const parentIndex = insertOrder.indexOf(parent);
        if (parentIndex === -1) continue;
        expect(parentIndex, `${parent} must precede ${table}`).toBeLessThan(index);
      }
    });
  });

  it('seedPlan writes every parent before its children', () => {
    const plan = seedPlan(snapshot, templates, carer);
    const firstIndex = new Map<string, number>();
    plan.forEach((op, index) => {
      if (!firstIndex.has(op.table)) firstIndex.set(op.table, index);
    });

    plan.forEach((op, index) => {
      for (const parent of parentsOf(op.table)) {
        const parentIndex = firstIndex.get(parent);
        if (parentIndex === undefined) continue;
        expect(parentIndex, `${parent} must be written before ${op.table}`).toBeLessThan(
          index + 1,
        );
        expect(parentIndex).toBeLessThan(firstIndex.get(op.table) ?? index);
      }
    });
  });

  it('seedPlan and baselinePlan visit tables in TABLE_INSERT_ORDER', () => {
    for (const plan of [baselinePlan(snapshot, templates, carer), seedPlan(snapshot, templates, carer)]) {
      const visited = plan.map((op) => insertOrder.indexOf(op.table));
      expect(visited).not.toContain(-1);
      expect([...visited].sort((a, b) => a - b)).toEqual(visited);
    }
  });

  it('deletePlan removes children before parents (reverse FK order)', () => {
    const plan = deletePlan(snapshot);
    const position = new Map<string, number>(plan.map((op, index) => [op.table, index]));

    for (const [table, index] of position) {
      for (const parent of parentsOf(table)) {
        const parentIndex = position.get(parent);
        if (parentIndex === undefined) continue;
        expect(index, `${table} must be deleted before ${parent}`).toBeLessThan(parentIndex);
      }
    }
  });

  it('deletePlan is exactly the reverse of the derived-row insert order', () => {
    const identityTables: readonly string[] = [
      'artifact_templates',
      'people',
      'care_relationships',
      'consent_records',
    ];
    const derived = insertOrder.filter((table) => !identityTables.includes(table));
    const deleted = deletePlan(snapshot).map((op) => op.table);
    expect(deleted).toEqual([...derived].reverse());
  });
});

/* ============================== secrets ================================= */

describe('the service role key never becomes public', () => {
  const source = readFileSync(join(__dirname, '..', 'dal.ts'), 'utf8');

  it('no NEXT_PUBLIC_ env var carrying a key or secret is read anywhere', () => {
    const publicVars = [
      ...new Set([...source.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)].map((m) => m[0])),
    ];
    expect(publicVars).toEqual(['NEXT_PUBLIC_SUPABASE_URL']);
    for (const name of publicVars) {
      expect(name).not.toMatch(/KEY|SECRET|SERVICE|TOKEN/);
    }
  });
});
