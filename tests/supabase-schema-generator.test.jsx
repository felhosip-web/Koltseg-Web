import assert from 'node:assert/strict';
import test from 'node:test';
import { getSupabaseSQLScript } from '../js/debug-panel.js';

test('Supabase schema generator includes fields used by incoming and work records', () => {
    const schema = getSupabaseSQLScript();
    const incomings = schema.match(/CREATE TABLE IF NOT EXISTS incomings \(([\s\S]*?)\n\);/)?.[1];
    const works = schema.match(/CREATE TABLE IF NOT EXISTS works \(([\s\S]*?)\n\);/)?.[1];

    assert.ok(incomings, 'incomings table is present');
    assert.match(incomings, /currency TEXT DEFAULT 'HUF'/);
    assert.match(incomings, /created_at TIMESTAMPTZ DEFAULT NOW\(\)/);
    assert.match(schema, /ALTER TABLE incomings ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'HUF'/);
    assert.match(schema, /ALTER TABLE incomings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW\(\)/);

    assert.ok(works, 'works table is present');
    assert.match(works, /name TEXT NOT NULL/);
    assert.match(works, /description TEXT/);
    assert.match(works, /location TEXT/);
    assert.match(works, /date TEXT NOT NULL/);
    assert.match(works, /duration NUMERIC DEFAULT 1/);
    assert.match(works, /status TEXT NOT NULL/);
    assert.match(works, /created_at TIMESTAMPTZ DEFAULT NOW\(\)/);
    assert.match(works, /updated_at TIMESTAMPTZ DEFAULT NOW\(\)/);
});
