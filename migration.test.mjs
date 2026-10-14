// Migration test: v2.3 localStorage profiles and an old export file load into v3
// without losing XP, level or achievements.  Run: node tests/migration.test.mjs
import fs from 'fs';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCore } from './core.test.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const C = loadCore();
const J = x => JSON.parse(JSON.stringify(x));
const read = f => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', f), 'utf8'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; } catch (e) { failed++; console.log('FAIL ' + name + '\n    ' + e.message); }
}

const stored = read('localStorage_v23.json');     // value of localStorage.mathFractionsProfiles
const exported = read('export_v23.json');          // file from the v2.3 "💾" button

test('v2.3 localStorage profiles keep XP, level, achievements', () => {
    const out = J(C.migrateProfiles(stored));
    assert.strictEqual(out.length, 2);
    const e = out[0];
    assert.strictEqual(e.id, 1718900000000);
    assert.strictEqual(e.name, 'Ελένη');
    assert.strictEqual(e.xp, 2350);
    assert.strictEqual(e.level, 7);
    assert.deepStrictEqual(e.achievements, stored[0].achievements);
    assert.strictEqual(e.bestStreak, 23);
    assert.strictEqual(e.vsWins, 3);
    assert.strictEqual(e.problemsCorrect, 127);
    assert.strictEqual(e.equivalentCorrect, 41);
    // new fields filled with defaults
    assert.strictEqual(e.operationsCorrect, 0);
    assert.strictEqual(e.decimalCorrect, 0);
    assert.deepStrictEqual(e.stats, {});
    assert.strictEqual(e.schemaVersion, 3);
});

test('level 101 from the v2.3 bug is capped at 100, XP kept', () => {
    const n = J(C.migrateProfiles(stored))[1];
    assert.strictEqual(n.level, 100);
    assert.strictEqual(n.xp, 505000);
    assert.deepStrictEqual(n.achievements, ['first_correct', 'level_100', 'vs_legend']);
    assert.strictEqual(J(C.xpProgress(n)).max, true);
});

test('names are kept verbatim (escaping is done at render time)', () => {
    assert.strictEqual(J(C.migrateProfiles(stored))[1].name, 'Νίκος <b>&</b>');
});

test('migration is idempotent', () => {
    const once = J(C.migrateProfiles(stored));
    const twice = J(C.migrateProfiles(once));
    assert.deepStrictEqual(twice, once);
});

test('old export file imports', () => {
    const r = J(C.parseImport(exported));
    assert.ok(r);
    assert.strictEqual(r.currentPlayerId, 1718900000000);
    assert.strictEqual(r.profiles.length, 3);
    const e = r.profiles[0];
    assert.strictEqual(e.xp, 2600);
    assert.strictEqual(e.level, 7);
    assert.ok(e.achievements.includes('vs_5'));
});

test('older profile with missing fields and string numbers gets defaults', () => {
    const old = J(C.parseImport(exported)).profiles[1];
    assert.strictEqual(old.xp, 450);
    assert.strictEqual(old.level, 3);
    assert.strictEqual(old.totalGames, 0);
    assert.strictEqual(old.vsWins, 0);
    assert.deepStrictEqual(old.achievements, []);
    assert.strictEqual(old.avatar, '🐼');
});

test('malicious id/avatar from a crafted file are neutralised', () => {
    const bad = J(C.parseImport(exported)).profiles[2];
    assert.strictEqual(typeof bad.id, 'number');            // unsafe id replaced
    assert.strictEqual(bad.avatar, '🧑‍🎓');                 // over-long avatar replaced
    assert.deepStrictEqual(bad.achievements, []);
    assert.strictEqual(bad.name, '<svg/onload=alert()>');   // kept as text, rendered with textContent
});

test('bare array and single-profile files are accepted', () => {
    assert.strictEqual(J(C.parseImport(stored)).profiles.length, 2);
    assert.strictEqual(J(C.parseImport(stored[0])).profiles.length, 1);
    assert.strictEqual(C.parseImport({ foo: 1 }), null);
    assert.strictEqual(C.parseImport('nonsense'), null);
});

test('merge keeps the copy with more XP and unions achievements', () => {
    const local = C.migrateProfiles(stored);
    const merged = J(C.mergeProfiles(local, C.parseImport(exported).profiles));
    assert.strictEqual(merged.length, 4);                    // 2 local + 2 new
    const e = merged.find(p => p.id === 1718900000000);
    assert.strictEqual(e.xp, 2600);                          // export copy has more XP
    assert.ok(e.achievements.includes('vs_5'));
    assert.ok(e.achievements.includes('problem_solver'));
    assert.ok(merged.find(p => p.name === 'Νίκος <b>&</b>')); // local-only profile survives
});

test('migrated profile keeps playing: counters continue from old values', () => {
    const e = C.migrateProfiles(stored)[0];
    const r = C.applyAnswer(e, 'problems', 'medium', true);
    assert.strictEqual(e.problemsCorrect, 128);
    assert.strictEqual(e.totalCorrect, 169);
    assert.strictEqual(e.xp, 2350 + 15);
    assert.strictEqual(e.achievements.filter(a => a === 'problem_solver').length, 1); // not duplicated
    assert.ok(Array.isArray(r.achievements));
});

console.log(`\nmigration: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
