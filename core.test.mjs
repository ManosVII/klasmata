// Tests for <script id="fraction-core"> in ΚΛΑΣΜΑΤΑ_v3.html.
// Run: node tests/core.test.mjs   (Node built-ins only: fs, vm, assert)
import fs from 'fs';
import vm from 'vm';
import assert from 'assert';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
export function loadCore() {
    const file = ['index.html', 'ΚΛΑΣΜΑΤΑ_v3.html'].map(f => path.join(here, '..', f)).find(f => fs.existsSync(f));
    if (!file) throw new Error('index.html (or ΚΛΑΣΜΑΤΑ_v3.html) not found');
    const html = fs.readFileSync(file, 'utf8');
    const m = /<script id="fraction-core">([\s\S]*?)<\/script>/.exec(html);
    if (!m) throw new Error('fraction-core script not found');
    const ctx = vm.createContext({});
    vm.runInContext(m[1], ctx, { filename: 'fraction-core.js' });
    return ctx.FractionCore;
}

// Values created inside the vm realm have foreign prototypes; compare as plain JSON.
const J = x => JSON.parse(JSON.stringify(x));

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
    try { fn(); passed++; }
    catch (e) { failed++; failures.push(name + '\n    ' + (e && e.message)); }
}
const eqF = (a, b, msg) => assert.deepStrictEqual(J(a), b, msg);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const C = loadCore();
const F = (n, d) => ({ n, d });

// ---------- simplify ----------
test('simplify reduces', () => eqF(C.simplify(6, 8), F(3, 4)));
test('simplify sign on numerator (-n/d)', () => eqF(C.simplify(-2, 4), F(-1, 2)));
test('simplify sign on numerator (n/-d)', () => eqF(C.simplify(2, -4), F(-1, 2)));
test('simplify double negative', () => eqF(C.simplify(-2, -4), F(1, 2)));
test('simplify zero numerator -> 0/1', () => { eqF(C.simplify(0, 7), F(0, 1)); eqF(C.simplify(0, -3), F(0, 1)); });
test('simplify rejects zero denominator', () => assert.throws(() => C.simplify(3, 0)));
test('simplify rejects non-integers', () => assert.throws(() => C.simplify(1.5, 2)));
test('simplify accepts an object', () => eqF(C.simplify({ n: 10, d: 15 }), F(2, 3)));
test('gcd / lcm', () => { assert.strictEqual(C.gcd(12, 18), 6); assert.strictEqual(C.lcm(4, 6), 12); assert.strictEqual(C.gcd(-4, 6), 2); });

// ---------- operations ----------
test('add', () => eqF(C.add(F(1, 2), F(1, 3)), F(5, 6)));
test('add to whole', () => eqF(C.add(F(1, 4), F(3, 4)), F(1, 1)));
test('sub', () => eqF(C.sub(F(3, 4), F(1, 4)), F(1, 2)));
test('sub to negative', () => eqF(C.sub(F(1, 4), F(1, 2)), F(-1, 4)));
test('mul', () => eqF(C.mul(F(2, 3), F(3, 4)), F(1, 2)));
test('div', () => eqF(C.div(F(1, 2), F(1, 4)), F(2, 1)));
test('div by zero throws', () => assert.throws(() => C.div(F(1, 2), F(0, 3))));
test('compare / equals (cross-multiplication)', () => {
    assert.strictEqual(C.compare(F(1, 3), F(1, 2)), -1);
    assert.strictEqual(C.compare(F(3, 4), F(2, 3)), 1);
    assert.strictEqual(C.compare(F(2, 4), F(3, 6)), 0);
    assert.ok(C.equals(F(-1, 2), F(1, -2)));
});
test('toMixed / fromMixed', () => {
    eqF(C.toMixed(F(7, 3)), { neg: false, whole: 2, n: 1, d: 3 });
    eqF(C.toMixed(F(14, 6)), { neg: false, whole: 2, n: 1, d: 3 });
    eqF(C.toMixed(F(-7, 2)), { neg: true, whole: 3, n: 1, d: 2 });
    eqF(C.fromMixed(2, 1, 3), F(7, 3));
    eqF(C.fromMixed(1, 1, 2, true), F(-3, 2));
    assert.throws(() => C.fromMixed(1, 1, 0));
});
test('mixed numbers: add', () => eqF(C.toMixed(C.add(C.fromMixed(1, 1, 2), C.fromMixed(2, 2, 3))), { neg: false, whole: 4, n: 1, d: 6 }));
test('mixed numbers: sub with borrowing', () => eqF(C.sub(C.fromMixed(3, 1, 4), C.fromMixed(1, 1, 2)), F(7, 4)));
test('mixed numbers: × whole', () => eqF(C.mul(C.fromMixed(2, 1, 3), C.fromInt(3)), F(7, 1)));
test('whole ÷ fraction', () => eqF(C.div(C.fromInt(3), F(3, 4)), F(4, 1)));

// ---------- parseAnswer ----------
const P = s => J(C.parseAnswer(s));
test('parse "3/4"', () => { const p = P('3/4'); assert.strictEqual(p.kind, 'fraction'); assert.deepStrictEqual(p.value, F(3, 4)); });
test('parse "3 / 4"', () => assert.deepStrictEqual(P('3 / 4').value, F(3, 4)));
test('parse "1 2/3"', () => { const p = P('1 2/3'); assert.strictEqual(p.kind, 'mixed'); assert.deepStrictEqual(p.value, F(5, 3)); });
test('parse "1 2 / 3"', () => assert.deepStrictEqual(P('1 2 / 3').value, F(5, 3)));
test('parse "0,75"', () => { const p = P('0,75'); assert.strictEqual(p.kind, 'decimal'); assert.deepStrictEqual(p.value, F(3, 4)); });
test('parse "0.75"', () => assert.deepStrictEqual(P('0.75').value, F(3, 4)));
test('parse integer "12"', () => { const p = P(' 12 '); assert.strictEqual(p.kind, 'integer'); assert.deepStrictEqual(p.value, F(12, 1)); });
test('parse keeps unreduced raw form', () => assert.deepStrictEqual(P('2/4').raw, F(2, 4)));
test('parse "-3/4"', () => assert.deepStrictEqual(P('-3/4').value, F(-3, 4)));
test('parse rejects zero denominator', () => { const p = P('3/0'); assert.strictEqual(p.ok, false); assert.strictEqual(p.error, 'zeroDen'); });
test('parse rejects junk', () => ['abc', '0,5abc', '1,2,3', '1.9.2', '3//4', '1 2', '/4'].forEach(s => assert.strictEqual(P(s).ok, false, s)));
test('parse empty', () => assert.strictEqual(P('  ').error, 'empty'));
test('parsePercent', () => { assert.deepStrictEqual(J(C.parsePercent('12,5%')).value, F(25, 2)); assert.deepStrictEqual(J(C.parsePercent('40')).value, F(40, 1)); });

// ---------- decimal ↔ fraction (exact) ----------
test('0,07 -> 7/100', () => eqF(C.decimalToFraction('0,07'), F(7, 100)));
test('8,29 -> 829/100', () => eqF(C.decimalToFraction('8,29'), F(829, 100)));
test('2,125 -> 17/8', () => eqF(C.decimalToFraction('2,125'), F(17, 8)));
test('7/100 -> "0,07"', () => assert.strictEqual(C.fractionToDecimal(F(7, 100)), '0,07'));
test('829/100 -> "8,29"', () => assert.strictEqual(C.fractionToDecimal(F(829, 100)), '8,29'));
test('17/8 -> "2,125"', () => assert.strictEqual(C.fractionToDecimal(F(17, 8)), '2,125'));
test('non-terminating -> null', () => assert.strictEqual(C.fractionToDecimal(F(1, 3)), null));
test('every n/100 and w+n/100 round-trips exactly', () => {
    for (let w = 0; w <= 9; w++) for (let n = 1; n <= 99; n++) {
        const f = C.simplify(w * 100 + n, 100);
        const s = C.fractionToDecimal(f);
        eqF(C.decimalToFraction(s), J(f), s);
        assert.ok(!/0{4,}|9{4,}/.test(s), 'float artifact in ' + s);
    }
});

// ---------- answer checking: equivalence and irreducible rules ----------
const valueQ = (value, extra) => ({ answer: Object.assign({ kind: 'value', value, forms: ['fraction', 'mixed', 'integer'], requireIrreducible: false, mustSimplifyBelow: 0 }, extra || {}) });
test('2/4 accepted for 1/2 when equivalents allowed', () => { const r = J(C.checkAnswer(valueQ(F(1, 2)), '2/4')); assert.strictEqual(r.correct, true); assert.strictEqual(r.note, 'canSimplify'); });
test('2/4 rejected when irreducible required', () => { const r = J(C.checkAnswer(valueQ(F(1, 2), { requireIrreducible: true }), '2/4')); assert.strictEqual(r.correct, false); assert.strictEqual(r.status, 'notSimplest'); });
test('1/2 accepted when irreducible required', () => assert.strictEqual(C.checkAnswer(valueQ(F(1, 2), { requireIrreducible: true }), '1/2').correct, true));
test('mixed and improper both accepted', () => { const q = valueQ(F(7, 4)); assert.ok(C.checkAnswer(q, '7/4').correct); assert.ok(C.checkAnswer(q, '1 3/4').correct); assert.ok(C.checkAnswer(q, '14/8').correct); });
test('improper "mixed" like 1 8/6 is not accepted', () => assert.strictEqual(J(C.checkAnswer(valueQ(F(7, 3)), '1 8/6')).status, 'improperMixed'));
test('decimal typed where fraction required -> wrongForm', () => assert.strictEqual(J(C.checkAnswer(valueQ(F(3, 4), { forms: ['fraction'] }), '0,75')).status, 'wrongForm'));
test('decimal answer exact (no tolerance)', () => {
    const q = valueQ(F(3, 8), { forms: ['decimal'] });
    assert.ok(C.checkAnswer(q, '0,375').correct);
    assert.ok(C.checkAnswer(q, '0.3750').correct);
    assert.strictEqual(C.checkAnswer(q, '0,37501').correct, false);
    assert.strictEqual(C.checkAnswer(q, '0,5abc').status, 'invalid');
});
test('"not simplified" when the original is retyped', () => assert.strictEqual(J(C.checkAnswer(valueQ(F(1, 2), { forms: ['fraction'], mustSimplifyBelow: 24 }), '12/24')).status, 'notSimplified'));
test('sign is normalized: -1/-2 equals 1/2, -1/2 does not', () => {
    assert.strictEqual(C.checkAnswer(valueQ(F(1, 2)), '-1/-2').correct, true);
    assert.strictEqual(C.checkAnswer(valueQ(F(1, 2)), '-1/2').correct, false);
});
test('conversion: 14/6 -> 2 1/3 and 2 2/6 accepted', () => {
    const rng = C.makeRng(7);
    let q;
    for (let i = 0; i < 5000; i++) { q = C.makeQuestion('conversion', 'hard', { rng, options: { conv: 'toMixed' } }); if (q.id === 'conversion:toMixed:14/6') break; }
    const q2 = q.id === 'conversion:toMixed:14/6' ? q : { answer: J(q.answer) };
    if (q.id === 'conversion:toMixed:14/6') {
        assert.ok(C.checkAnswer(q2, '2 1/3').correct);
        assert.ok(C.checkAnswer(q2, '2 2/6').correct);
        assert.strictEqual(C.checkAnswer(q2, '14/6').status, 'wrongForm');
    }
});

// ---------- generators: 1,000 per type × difficulty ----------
function walk(x, visit, pathStr) {
    if (x === null || x === undefined) return;
    if (typeof x === 'number') { visit(x, pathStr); return; }
    if (typeof x !== 'object') return;
    if ('n' in x && 'd' in x && typeof x.d === 'number') {
        if (x.d === 0) throw new Error('zero denominator at ' + pathStr);
    }
    for (const k of Object.keys(x)) walk(x[k], visit, pathStr + '.' + k);
}

function answerValue(q) {
    const a = q.answer;
    if (a.kind === 'value' || a.kind === 'percent' || a.kind === 'tick' || a.kind === 'fill') return a.value;
    return null;
}

const N = 1000;
const stats = {};
for (const type of C.TYPES) {
    for (const diff of C.DIFFS) {
        test(`generator ${type}/${diff}: ${N} valid questions`, () => {
            const rng = C.makeRng(1234 + type.length * 31 + diff.length);
            const ids = new Set();
            for (let i = 0; i < N; i++) {
                const q = C.makeQuestion(type, diff, { rng });
                const where = `${type}/${diff} #${i} ${q.id}`;
                walk(q, (v, p) => { if (!Number.isFinite(v)) throw new Error('NaN/Infinity at ' + p + ' in ' + where); }, 'q');
                const v = answerValue(q);
                if (v) {
                    assert.ok(v.d > 0, 'denominator > 0 ' + where);
                    assert.ok(v.n > 0, 'answer must be positive and non-zero: ' + where + ' = ' + v.n + '/' + v.d);
                }
                const verdict = C.checkAnswer(q, q.answer.response);
                assert.strictEqual(verdict.correct, true, 'stored answer must pass check: ' + where + ' response=' + JSON.stringify(q.answer.response) + ' -> ' + JSON.stringify(verdict));
                // operands are never identical
                const fr = (q.expr || []).filter(s => s.t === 'frac');
                if (fr.length === 2) assert.ok(!(fr[0].n === fr[1].n && fr[0].d === fr[1].d), 'identical fractions shown: ' + where);
                if (q.type === 'comparison' && q.answer.symbol === '=') assert.ok(fr[0].n !== fr[1].n, '"=" must show two different forms: ' + where);
                if (q.type === 'simplify') assert.strictEqual(C.isIrreducible(q.answer.value), true, where);
                if (q.input.kind === 'choice') {
                    const correctCount = q.input.options.filter((o, j) => j === q.answer.index).length;
                    assert.strictEqual(correctCount, 1);
                    assert.ok(q.input.options.length >= 3, 'at least 3 options: ' + where);
                    // no option may share the correct value
                    const cv = q.input.options[q.answer.index].segs[0];
                    q.input.options.forEach((o, j) => { if (j !== q.answer.index) assert.ok(!C.equals(o.segs[0], cv), 'duplicate correct option ' + where); });
                }
                // integer-answer word problems really are whole numbers
                if (q.type === 'unitfraction') assert.strictEqual(q.answer.value.d, 1, where);
                ids.add(q.id);
            }
            stats[type + '/' + diff] = ids.size;
        });
    }
}

test('no repeated question within a round of 10', () => {
    for (const type of C.TYPES) for (const diff of C.DIFFS) {
        for (let round = 0; round < 30; round++) {
            const rng = C.makeRng(round * 97 + 5);
            const used = new Set();
            const seen = [];
            for (let i = 0; i < 10; i++) seen.push(C.makeQuestion(type, diff, { rng, used }).id);
            assert.strictEqual(new Set(seen).size, seen.length, `${type}/${diff} repeated in round ${round}: ${seen.join(' | ')}`);
        }
    }
});

test('operations easy subtraction never gives 0; medium operands proper', () => {
    const rng = C.makeRng(99);
    for (let i = 0; i < 3000; i++) {
        const q = C.makeQuestion('operations', 'easy', { rng, options: { op: 'sub' } });
        assert.ok(q.answer.value.n > 0);
        const m = C.makeQuestion('operations', 'medium', { rng });
        m.expr.filter(s => s.t === 'frac').forEach(f => assert.ok(f.n < f.d, 'improper operand ' + m.id));
    }
});

test('word problems: counts are whole numbers', () => {
    const rng = C.makeRng(3);
    for (const diff of C.DIFFS) for (let i = 0; i < 2000; i++) {
        const q = C.makeQuestion('problems', diff, { rng, options: { op: 'div' } });
        const txt = q.prompt.filter(s => s.t === 'text').map(s => s.v).join(' ');
        if (/Πόσ(α|ες|ους|οι) (μπουκάλια|μερίδες|παρουσιάσεις|γύρους|δόσεις|κέρματα)/.test(txt)) assert.strictEqual(q.answer.value.d, 1, q.id);
    }
});

test('fraction → decimal uses decimal fractions only (10, 100, 1000, 10000)', () => {
    const allowed = { easy: [10, 100], medium: [10, 100], hard: [100, 1000, 10000] };
    for (const diff of C.DIFFS) {
        const rng = C.makeRng(21);
        const seen = new Set();
        for (let i = 0; i < 2000; i++) {
            const q = C.makeQuestion('decimals', diff, { rng, options: { dec: 'toDecimal' } });
            const f = q.prompt.find(s => s.t === 'frac');
            assert.ok(allowed[diff].includes(f.d), `${diff}: denominator ${f.d} in ${q.id}`);
            assert.strictEqual(C.checkAnswer(q, q.answer.response).correct, true);
            if (diff === 'easy' && f.d === 100) assert.strictEqual(f.n % 10, 0, 'easy hundredths must be tens: ' + q.id);
            seen.add(f.d);
        }
        assert.deepStrictEqual([...seen].sort((a, b) => a - b), allowed[diff], diff + ' uses every allowed denominator');
    }
    const q = { answer: { kind: 'value', value: F(7, 1000), forms: ['decimal'], requireIrreducible: false, mustSimplifyBelow: 0 } };
    assert.ok(C.checkAnswer(q, '0,007').correct);
    assert.strictEqual(C.checkAnswer(q, '0,07').correct, false);
});

test('percent answers exact', () => {
    const rng = C.makeRng(11);
    for (let i = 0; i < 2000; i++) {
        const q = C.makeQuestion('percent', 'hard', { rng, options: { pc: 'toPercent' } });
        assert.ok(C.checkAnswer(q, q.answer.response + '%').correct, q.id);
    }
});

// ---------- VS logic ----------
function play(target, answers) {
    let s = C.vsInit(target);
    for (const a of answers) s = C.vsStep(s, a);
    return J(s);
}
test('VS: P1 reaches target, P2 misses last chance -> P1 wins', () => {
    const s = play(2, [true, false, true]);
    assert.strictEqual(s.event, 'lastchance'); assert.strictEqual(s.over, false);
    const e = play(2, [true, false, true, false]);
    assert.strictEqual(e.over, true); assert.strictEqual(e.winner, 0);
});
test('VS: tie at target -> sudden death -> decided by one round', () => {
    const s = play(2, [true, true, true, true]);
    assert.strictEqual(s.sudden, true); assert.strictEqual(s.event, 'sudden_start');
    const e = play(2, [true, true, true, true, true, false]);
    assert.strictEqual(e.over, true); assert.strictEqual(e.winner, 0); assert.strictEqual(e.event, 'sudden');
    const c = play(2, [true, true, true, true, false, false]);
    assert.strictEqual(c.over, false); assert.strictEqual(c.event, 'sudden_continue');
});
test('VS: P2 reaches target after equal turns -> P2 wins at once', () => {
    const e = play(2, [false, true, false, true]);
    assert.strictEqual(e.over, true); assert.strictEqual(e.winner, 1);
});
test('VS: steps after the end change nothing', () => {
    const e = play(1, [false, true]);
    const again = J(C.vsStep(e, true));
    assert.deepStrictEqual(again, e);
});

// ---------- levels & scoring ----------
test('level is capped at 100', () => { assert.strictEqual(C.levelForXp(1e9), 100); assert.strictEqual(J(C.xpProgress({ level: 100, xp: 1e9 })).max, true); });
test('level mapping unchanged from v2.3', () => { assert.strictEqual(C.levelForXp(0), 1); assert.strictEqual(C.levelForXp(99), 1); assert.strictEqual(C.levelForXp(100), 2); assert.strictEqual(C.levelForXp(300), 3); });
test('applyAnswer: per-category counters, streak reset, XP by difficulty', () => {
    const p = C.newProfile('Test', '🦊', 1);
    C.applyAnswer(p, 'operations', 'hard', true);
    assert.strictEqual(p.operationsCorrect, 1); assert.strictEqual(p.problemsCorrect, 0);
    assert.strictEqual(p.xp, 25); assert.strictEqual(p.stats.operations.correct, 1);
    C.applyAnswer(p, 'operations', 'easy', false);
    assert.strictEqual(p.currentStreak, 0); assert.strictEqual(p.bestStreak, 1); assert.strictEqual(p.stats.operations.wrong, 1);
    for (let i = 0; i < 5; i++) C.applyAnswer(p, 'simplify', 'easy', true);
    assert.strictEqual(p.simplifyCorrect, 5);
    assert.strictEqual(p.xp, 25 + 10 * 4 + 15);
});

if (isMain) {
    console.log('Unique questions seen per 1,000 (type/difficulty):');
    console.log(Object.entries(stats).map(([k, v]) => `  ${k.padEnd(24)} ${v}`).join('\n'));
    for (const f of failures) console.log('FAIL ' + f);
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
}
