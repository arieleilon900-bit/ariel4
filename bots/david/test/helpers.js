// Test doubles: a D1-compatible database on node:sqlite (real SQL, real schema),
// a WhatsApp outbox, and a scripted model client.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const MIG = new URL('../migrations/', import.meta.url);
const SCHEMA = readdirSync(MIG).filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(new URL(f, MIG), 'utf8')).join('\n');

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args.map(a => (a === undefined ? null : a))); }
  async first() { const r = this.db.prepare(this.sql).get(...this.args); return r ? { ...r } : null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map(r => ({ ...r })) }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes) } }; }
}

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    batch: async (stmts) => Promise.all(stmts.map(s => s.run())),
  };
}

export function fakeEnv() {
  return { DB: fakeD1(), OUTBOX: [] };
}

// Each step returns a model response; it also sees the request so it can check tool results.
export function scriptedClient(steps) {
  const calls = [];
  return {
    calls,
    messages: { create: async (params) => {
      calls.push(params);
      const step = steps.shift();
      assert.ok(step, 'model called more times than scripted');
      return { usage: { input_tokens: 9000, output_tokens: 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, ...(await step(params)) };
    } },
  };
}

export const toolUse = (name, input) => () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_' + name, name, input }] });
export const say = (text, check) => (params) => { check?.(params); return { stop_reason: 'end_turn', content: [{ type: 'text', text }] }; };
export const lastToolResult = (params) => JSON.parse(params.messages.at(-1).content[0].content);
