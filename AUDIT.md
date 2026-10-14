# AUDIT — ΚΛΑΣΜΑΤΑ.html v2.3

Read-only audit. The source file was not modified. Line numbers refer to v2.3 (8,333 lines: CSS 11–2584, HTML 2586–3728, JS 3730–8331).
"Evidence: sim" means I copied the original generator or check code into a scratch Node script and ran it 200,000 times. The percentages come from those runs.

---

## 1. How the game works

### Screens
| Screen id | Purpose |
|---|---|
| `profileScreen` | Create a profile (avatar + name, max 20 chars) or import a JSON file |
| `menuScreen` | Header (avatar, level, XP bar, total correct/games, edit/switch/export/import), 9 category cards (Solo / VS), ribbons + achievements |
| `vsSelectScreen` | Reused for two things: choosing Player 2 (`vsCategory` set) or switching profile (`vsCategory = null`). Tabs: existing / new profile |
| 9 × `*GameScreen` | `equivalent`, `problems`, `operations`, `conversion`, `simplify`, `decimals`, `unitfraction`, `comparison`, `ordering`. Each has its own copy of: VS panel, settings, solo progress, question card, Check / Pass / Next buttons, result panel |
| Modals / overlays | `editProfileModal`, `deleteProfileModal`, `gameSettingsModal` (Solo: 5/10/20 questions; VS: target 5/10/15), `vsWinOverlay` (also reused for Solo results), `celebrationOverlay`, `adaptiveToast` |

### Flow
`startGame(cat, mode)` → `showGameSettings` → `confirmGameSettings` → `actualStartGame` resets the globals and calls `setupXGame()` → `generateXProblem()`.
Each game has a near-identical `checkX()` / `nextX()` / `passX()` triple (27 functions in total).

- **Question generation:** inline in each `generateX` function, using `randomInt` / `randomChoice`. Problems uses the `problemTemplates[op][difficulty]` objects (template + generate). Settings are module globals (`opDifficulty`, `convType`, …).
- **Answer checking:** `parseInt` on `type=number` inputs, then `simplify(user)` compared with a stored answer. The comparison is field by field and not always against a reduced answer (see D02, D21). Decimals use `parseFloat` with a ±0.0001 tolerance. Equivalence, comparison and ordering compare floats (`n/d`).
- **Scoring / XP:** there are two separate paths.
  - `handleCorrectAnswer(category)`: used only by Equivalent and Problems. It updates the answering player (P1 or P2), streak, `equivalentCorrect`/`problemsCorrect`, and XP 10/15/25 by **`currentDifficulty`**, ×1.5 at streak ≥ 5. It also does `vsScores++` and saves.
  - `awardXP(n)`: used by the other 7 games in **Solo only**. It gives a fixed 15 (ordering 20) and always increments `problemsCorrect`. In VS those 7 games only do `vsScores[...]++`.
  - Level = `calculateLevel(xp)` with thresholds `50i² + 50i`, i = 0..100.
- **VS logic** (`processVsAnswer`, `processSuddenDeath`): P1 always starts and turns alternate.
  - If P1 reaches the target, P2 gets a "last chance" turn (`lastchance_start`). After P2's turn with equal question counts, P1 wins, or both are at the target and it goes to sudden death.
  - If P2 reaches the target with equal question counts, P2 wins immediately.
  - Sudden death works in rounds: P1's result is stored in `window.suddenDeathP1Result`, and P2's answer decides (one right and one wrong ends it, otherwise it continues).
  - `showVsWinner` does `vsWins++` and `totalGames++` for both players.
- **Persistence:** `localStorage.mathFractionsProfiles` (array of profiles) and `localStorage.mathFractionsCurrentPlayer` (copy of the current profile).
  - Profile shape: `{id:Date.now(), name, avatar, xp, level, totalCorrect, totalGames, bestStreak, currentStreak, vsWins, equivalentCorrect, problemsCorrect, achievements:[]}`. `operationsCorrect`, `simplifyCorrect`, `conversionCorrect` and `decimalCorrect` are read by achievements but never written.
  - Export file: `{profiles, currentPlayerId, exportDate}`. Import **replaces** `allProfiles` without asking.
- **Other:** Web Audio oscillator sounds, CSS confetti, and an adaptive-difficulty toast (Problems game only).

---

## 2. Verification of your suspected defects

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `passProblem()` calls the undefined `generateProblem()` | ✅ CONFIRMED | L5611. Only `generateNewProblem` exists. It throws a ReferenceError **after** it has already counted the question (Solo) or switched the turn (VS), so the same question stays on screen with the counter or turn advanced. |
| 2 | Simplify easy/medium base not reduced | ✅ CONFIRMED (worse than suspected) | `generateSimplifyProblem` L6263–6273. The check compares the always-reduced `simplify(user)` with the **unreduced** stored base, e.g. shown 12/24, stored 4/8. **No input can ever be accepted** for these items: 1/2 fails, 2/4 fails, 4/8 fails too. The feedback then shows 4/8 as "the correct simplification". Sim: 24.0% of Easy and 33.1% of Medium items are unanswerable. |
| 3 | Decimals hard float artifacts | ✅ CONFIRMED (your example value differs) | L6474. In V8, `8 + 29/100` happens to give exactly 8.29. Other values break, e.g. `4 + 56/100 = 4.5600000000000005`: the question shows "4,5600000000000005" and the stored answer is 5700000000000001/1250000000000000. Sim: 4.8% of the whole + hundredths branch. The `/100` and `/1000` branches are clean. |
| 4 | Pass buttons stay visible after Check | ✅ CONFIRMED | No `checkX` hides `passXBtn`. After Check the screen shows two identical "Επόμενη ερώτηση" buttons. Pass sends `processVsAnswer(false)` even after a correct answer, so it skips the "reached target" branch. Worse case (D06): after the last question the Next/Pass buttons are still active, so clicks count again (Solo shows "12/10") and in VS `showVsWinner` runs twice (**vsWins += 2**). |
| 5 | `awardXP` always increments `problemsCorrect`; category counters never written | ✅ CONFIRMED | L7669. grep: `operationsCorrect\|simplifyCorrect\|conversionCorrect\|decimalCorrect` appear only in achievement checks. 4 achievements can never be unlocked, and "Λύτης Προβλημάτων" unlocks from any game. |
| 6 | `handleCorrectAnswer` uses `currentDifficulty` | ✅ CONFIRMED | L7699. Equivalent XP follows the Problems screen's difficulty, not `eqDifficulty`. |
| 7 | "MAX LEVEL" at level 20 | ✅ CONFIRMED | L4922/4926. Also D12: `calculateLevel` can return **101**, and at 101 the XP bar divides by 0 (NaN). |
| 8 | VS score without profile stats; Solo `totalGames` never increases | ✅ CONFIRMED: **seven** games, not six | operations, conversion, simplify, decimals, unitfraction, comparison, ordering: in VS neither player gets XP, totalCorrect or streak. `showSoloResults` never touches `totalGames`, so the menu's "Παιχνίδια" only counts VS games. |
| 9 | Global selectors in `setDifficulty` / `setOperation` / `applyAdaptiveDifficulty` | ✅ CONFIRMED | `.setting-group:first-child .setting-btn` matches the difficulty groups on all 9 screens. `:last-child` also matches every single-group screen (eq, simp, comp, ord) and the type groups. Buttons lose their highlight while internal state stays the same. `applyAdaptiveDifficulty` matches by text, so "Δύσκολο (Ανάγωγο)" never matches. `setDifficulty` and `applyAdaptiveDifficulty` also leave the current question unchanged. |
| 10 | Ordering drag listeners accumulate on `#ordPizzas` | ❌ REJECTED | `addEventListener` with the **same named function** on the same target is deduplicated by the DOM spec (`handleSourceDragOver` etc. are top-level functions). The listeners do not pile up. The calls will still move to one-time setup in v3. |
| 11 | Comparison "=" shows the identical fraction | ✅ CONFIRMED | L6899–6903. When fewer than 2 multipliers fit, it shows `a/b ? a/b`, e.g. Easy 3/5 vs 3/5 or 3/6 vs 3/6. Sim: 38.6% of "=" items. |
| 12 | Operations easy subtraction → 0; medium improper operands | ✅ CONFIRMED | Sim: **45.4%** of Easy subtractions equal 0 (with d = 2 it is always 1/2 − 1/2). Medium/Hard add/sub operands are improper or whole numbers in 44.6% of items (9/2, 4/2). Easy mul/div operands are improper in 40%. Medium subtraction equals 0 in 3.0%. |
| 13 | Conversion requires the unreduced form | ✅ CONFIRMED | L6138. 14/6 → only "2 2/6" is accepted, "2 1/3" is rejected. → improper: only the exact numerator/denominator is accepted. |
| 14 | Nonsensical word problems | ✅ CONFIRMED | Division Hard "Πόσα κομμάτια/σακούλες" has a non-integer answer in **88.9%** of items. Multiplication Medium has "σε 3/2 δευτερόλεπτα" (river). "Πόσα φανάρια" has a fencepost ambiguity. Subtraction Medium "πηγαίνοντας … γυρίζοντας" asks "how much further" on the same route. Easy multiplication has "2/2 σοκολάτας". Unit fraction can produce "Ο μπαμπάς έχει 4 χρόνια" and "Ένα σχολείο έχει 6 μαθητές". |
| 15 | Profile names in innerHTML (XSS) | ✅ CONFIRMED | `renderAllProfilesList` L4692 (name and avatar), `showVsStatus` L7848, `updateVsDisplay` L7912/7915. `<svg/onload=alert()>` is exactly 20 chars, so it fits the input limit. Also `profile.id` goes into inline `onclick="openEditModal(${profile.id})"`, which allows **JS injection from a crafted import file**. |
| 16 | Mixed-language alerts, blocking dialogs, duplicate keyframes, duplicate sounds, console noise, footer | ✅ CONFIRMED (footer partly) | 21 `alert`/`confirm` calls, 9 of them English ("Failed to save profiles!", "Invalid file format!", "Error: …"). The `saveProfiles` catch shows **two** alerts (EN + GR). `confirm()` blocks first load. `@keyframes confettiFall` is defined at L2333 and L2544 (the second wins). `playSound('correct')` plays twice in unitfraction, comparison and ordering. 53 `console.*` calls. Footer is `position:fixed`, about 73px tall. The `body{padding-bottom:80px}` stops it covering the very end of the page, but it permanently covers the bottom 73px of the viewport (the Check buttons while scrolling, about 20% of a 360px-tall landscape screen), and the adaptive toast overlaps it. |

---

## 3. Defect table (all findings)

Severity: **Math** = wrong maths or a wrong verdict for the student · **Functional** = broken logic or data · **UX** · **Security**

| ID | Location | What goes wrong | Reproduction | Severity |
|---|---|---|---|---|
| D01 | `passProblem` | Calls undefined `generateProblem()` | Problems → press "Επόμενη ερώτηση" before checking → ReferenceError; question unchanged, counter/turn advanced | Functional |
| D02 | `generateSimplifyProblem` / `checkSimplify` | Unreduced base makes the item unanswerable | Easy: shown 12/24; 1/2, 2/4, 4/8 all marked wrong; feedback says 4/8 (24% Easy, 33% Medium) | Math |
| D03 | `generateDecimalsProblem` (hard) | Float artifact in question and answer | 4 + 0.56 → "4,5600000000000005", answer 5700000000000001/1250000000000000 | Math |
| D04 | `checkDecimals` (toDecimal) | Tolerance and `parseFloat` accept wrong input | 3/8 → "0,37501" accepted; "0,5abc" accepted as 0.5; "1,2,5" partly parsed | Math |
| D05 | all `checkX` | Pass button stays visible after Check | Check → two "Επόμενη ερώτηση" buttons; Pass after a correct VS answer sends `wasCorrect=false` | Functional |
| D06 | all `nextX`/`passX` + `showVsWinner` | Buttons active after the round ends (1s timeout) | Solo last question → click Next 3× → "Ερώτηση 13/10"; VS final answer → click twice → winner `vsWins` +2, `totalGames` +2 | Functional |
| D07 | `awardXP` | Always `problemsCorrect++`; category counters never written | 100 correct in Operations → "Πραξάς" stays locked; "Λύτης Προβλημάτων" unlocks | Functional |
| D08 | wrong branch of 7 `checkX` | `currentStreak` never resets (no `handleWrongAnswer`) | Operations: right, wrong, right, … → streak keeps climbing → "Σερί 10/20/50" unlocked without earning it | Functional |
| D09 | `handleCorrectAnswer` | XP uses Problems' `currentDifficulty` | Equivalent on Hard, Problems untouched (easy) → 10 XP instead of 25 | Functional |
| D10 | `awardXP` callers | Fixed 15/20 XP regardless of difficulty or streak; inconsistent with D09 path | Simplify Hard = Simplify Easy = 15 XP | Functional |
| D11 | `updateMenuDisplay` | "MAX LEVEL!" from level 20 | Profile with xp ≥ 21000 (level 20) → XP bar frozen at 100% | UX |
| D12 | `calculateLevel` / `getXpToNextLevel` | Level 101 is reachable; progress is NaN | xp ≥ 505000 → level 101 → `(xp-x)/(0)` | Functional |
| D13 | 7 VS `checkX` | No XP or stats for either player in VS | VS Operations 10–8 → nobody's totalCorrect or XP changes | Functional |
| D14 | `showSoloResults` | Solo `totalGames` never incremented | Finish 3 Solo rounds → "Παιχνίδια: 0" | Functional |
| D15 | `handleWrongAnswer` | P2's streak reset is never saved | VS: P2 wrong → reload → P2 `currentStreak` unchanged | Functional |
| D16 | `setDifficulty`, `setOperation`, `applyAdaptiveDifficulty` | Global selectors reset other screens' buttons; current question not regenerated | Problems: click "Δύσκολο" → go to Operations → no difficulty button highlighted | UX |
| D17 | `checkAdaptiveDifficulty` | Only runs in Problems; reads shared streak counters | 3 wrong in Simplify, then 1 Problems item → offers a change based on Simplify answers | UX |
| D18 | `generateComparisonProblem` | "=" item shows the same fraction twice | Easy, base 3/5 → "3/5 ? 3/5" (38.6% of "=" items) | Math |
| D19 | `generateOperationsProblem` | Easy subtraction answer 0 | Easy, d=2 → 1/2 − 1/2 (45.4% of easy subtractions) | Math |
| D20 | `generateOperationsProblem` | Improper or whole-number operands not intended by level | Medium: 9/2 + 4/2 (44.6%); Easy mul: 5/3 × 4/2 (40%); medium sub = 0 (3%) | Math |
| D21 | `checkConversion` | Rejects equivalent mixed numbers and improper equivalents | 14/6 → "2 1/3" wrong | Math |
| D22 | `problemTemplates`, `generateUnitFractionProblem` | Answer type does not fit the context | "Πόσα κομμάτια;" → 32/15 (88.9% of Hard division); "σε 3/2 δευτερόλεπτα"; "μπαμπάς 4 χρόνια" | Math |
| D23 | `generateNewProblem` | Input layout reveals whether the answer is whole; mixed form not accepted | Integer answer → single box appears (hint); answer 7/4 cannot be typed as 1 3/4 | UX |
| D24 | `checkEquivalence`, comparison generator, ordering sort/dedupe | Floating-point comparisons (breaks the project rule; no wrong verdict found inside current ranges) | `Math.abs(a/b - c/d) < 0.0001` | Math (rule) |
| D25 | all `checkX` (`parseInt` on `type=number`) | Decimal input truncated | Answer 1/2: type 1.9 / 2 → accepted | Math |
| D26 | `simplify` | Sign not normalized; den 0 not rejected | Answer 1/2: type −1 / −2 → rejected; `simplify(3,0)` → {1,0} | Math |
| D27 | `renderAllProfilesList`, `showVsStatus`, `updateVsDisplay` | Stored XSS via name or avatar | Name `<svg/onload=alert()>` (20 chars) → runs on profile list | Security |
| D28 | `renderAllProfilesList` | `profile.id` in inline onclick → code injection from import | Import `{"profiles":[{"id":"1);alert(document.cookie)//",…}]}` | Security |
| D29 | `importProfiles` | Replaces all local profiles without warning; no validation or migration | Import a classmate's file → all local profiles gone. Old profile without `achievements` → `includes` crash; missing counter → NaN | Functional |
| D30 | `importProfiles` | Stale `currentPlayer` survives when its id is not in the imported file; re-added on next save | Import file without `currentPlayerId` match while logged in | Functional |
| D31 | `init` | `JSON.parse(savedCurrent)` not guarded | Corrupt `mathFractionsCurrentPlayer` → blank app on load | Functional |
| D32 | `saveProfiles`, `importProfiles`, `actualStartGame`, `init`, … | English alerts; double alert; blocking `confirm()` on first load | First visit → native confirm in Greek with "Cancel" in OS language | UX |
| D33 | CSS L2333 / L2544 | Duplicate `@keyframes confettiFall` | Second definition silently overrides the first | UX |
| D34 | `checkUnitFraction`, `checkComparison`, `checkOrdering` | `playSound('correct')` called twice | Correct answer → overlapping chime | UX |
| D35 | whole script | 53 `console.*` calls including profile dumps | DevTools shows all profile names on load | UX |
| D36 | `.game-footer` | Fixed footer (≈73px) covers controls while scrolling and on short landscape screens | 640×360 landscape: Check button hidden under the footer until scrolled to the end | UX |
| D37 | `keydown` handler in `init` | Enter on a focused button runs both the handler and the button's click | Tab to "Επόμενη" → Enter → two questions advanced (PLAUSIBLE, depends on focus) | Functional |
| D38 | Problems screen HTML | `probSoloProgress` element missing → no Solo progress shown | Solo Problems: no "Ερώτηση x/10" | UX |
| D39 | `showVsStatus` | Sudden-death text "Ο πρώτος που θα κάνει λάθος χάνει" contradicts the round rule (both answer, both wrong continues) | Enter sudden death, P1 wrong → game continues | UX |
| D40 | `playSound` / `initAudio` | No feature check; suspended context never resumed | Browser without AudioContext → TypeError in every check; iOS → silent | Functional |
| D41 | `generateEquivalentProblem` (hard) | Up to 60 slices (12×5); toppings re-randomize on every slider move | Hard → pizza with 60 thin slices flickers | UX |
| D42 | CSS, HTML | Accessibility: clickable `div`s (avatars, profile list, ordering items) not focusable; ordering needs a mouse; buttons and range slider lack a focus ring; 22 font sizes below 1em (0.5–0.95em); no `prefers-reduced-motion`; infinite pulse on turn indicator | Keyboard only: cannot pick an avatar or order fractions | UX |
| D43 | various | Dead code: VS timer stubs, `vsRounds`/`checkVsEnd`, `setVsTarget`/`setVsTimerGlobal` (`playSound('click')` has no case), `drawCompPizza`, `drawMiniPizza`, unused operations word templates, `lastChanceGiven` never set true | — | UX (maintainability) |
| D44 | `renderAllProfilesList` | Rejected #10 (listener accumulation): not a defect. Listed for traceability only | — | — |

**Totals:** 43 defects (D01–D43) plus 1 rejected claim (D44). Math 11 · Functional 16 · UX 14 · Security 2.

---

## 4. Decisions I need from you before Phase 2

Defaults are in **bold**. Replying "OK" accepts all of them.

1. **One retry vs. VS turns.** Phase 3 says "one retry before revealing the answer". Default: **retry in Solo only; VS stays one attempt per turn**, so the turn logic stays fair.
2. **Pass button.** Default: **rename it "Παράλειψη ⏭", show it only before Check, and count a skip as a wrong answer (no XP, streak reset)**. That matches the current counting.
3. **Import.** Default: **show a Greek modal "Συγχώνευση / Αντικατάσταση". Merge by id keeps the higher XP. Validate and migrate every profile, and accept bare-array files too.**
4. **Inflated old data (D08).** Default: **keep existing `bestStreak` and achievements as they are**. No student loses anything, and counting is correct from v3 on.
5. **Mixed numbers in Conversion.** Default: **accept any equivalent mixed number whose fraction part is proper (2 2/6 and 2 1/3). Require the irreducible form only when the question says "στην πιο απλή μορφή"**. Improper → also accept equivalents (14/6 for 7/3) unless it asks for the simplest form.
6. **Level cap.** Default: **cap at 100 and show "ΜΕΓΙΣΤΟ ΕΠΙΠΕΔΟ!" only at 100.**
