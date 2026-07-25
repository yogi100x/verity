# Lane D — Integrator & Demo

**Paste this whole file into the agent on machine D (or run in each merge window if fewer than 4 machines).**

**Read first:** `docs/implementation-plan.md`, `docs/user-journey.md`, `docs/stack-freeze.md`.

**You enforce the stack freeze.** If a PR adds a dependency without orchestrator approval, reject it — including a lockfile change you didn't expect. Vitest, Tailwind-only, raw Anthropic SDK, no pgvector. Reasons are in the freeze document.

**Branch:** `lane/d` for your own work; you also perform merges to `main` **only during a merge window, only with the orchestrator present**.
**Territory:** `demo/**`, `scripts/**`, `.github/**`, `vercel.json`, `app/demo/**`, `public/sw.js`, **`lib/modes/**`**.

**`lib/modes/**` is how you own the three modes without touching Lane A's files.** You export a mode-aware wrapper (model call + DB read); Lane A routes everything through it. The recorder, fixture lookup by request hash, and replay all live inside the wrapper — one code path, three behaviours.

---

## Objective

Make the seams hold and the demo unkillable.

The other three lanes each produce clean, passing work in isolation. **Nobody but you owns the place where they meet**, and that is where multi-agent builds die at hour 22. You are also the reason a dead venue wifi is a non-event rather than a catastrophe.

You serve the orchestrator, who cannot read code. Every mechanism you build exists so that a human who only clicks can tell whether the product works.

---

## Spec

### 1. CI — build this first, before anything else

On every PR: `pnpm typecheck`, `pnpm test`, Vercel preview deploy. **A PR with a red check is not reviewed.** This is what lets the orchestrator trust a green check instead of reading a diff.

The fixture-conforms-to-contract test runs on every PR. If it goes red, **every lane is building against a lie** — escalate immediately, do not merge anything.

### 2. Three modes — `?mode=live|fixtures|replay`

| Mode | Behaviour |
|---|---|
| `live` | Real Anthropic calls. Every response written to `fixtures/recorded/<sha256-of-request>.json`. |
| `fixtures` | Reads recorded responses by content hash. Default for testing. |
| `replay` | Fully seeded, **zero network**. The stage backup. |

**All three render through the identical code path.** If replay looks even slightly different from live, the fallback is a lie and a judge will spot it. This is the single most important property of your lane.

Auto-degrade: if a `live` call fails or exceeds ~8s, fall back to fixtures **without a visible error**.

### 3. Fixtures recorder

Every live model response written to disk keyed by a hash of the request. Turns each successful live run into permanent demo insurance. Run it early and often so that by H16 you have a full recorded set.

### 4. Service worker — yours, because it collides with modes

Lane B builds the manifest and icons; **you own `public/sw.js` and its registration**, because a caching strategy that fights `?mode=` switching will produce failures nobody can diagnose at hour 22.

- **Network-first** for HTML documents and everything under `/api/**`
- **Cache-first** only for static assets, fonts and icons
- Never cache a response whose request carried a `mode` parameter
- Ship a kill switch: `?nosw=1` unregisters and hard-reloads
- Version the cache name and purge old versions on activate

The payoff is real: with the offline shell plus `replay` mode, a dead venue network becomes a demonstration of the architecture rather than a recovery. Test it by installing to a phone home screen and enabling airplane mode.

### 5. Demo control surface

- `/demo/reset` — restore Margaret to her starting state
- `/demo/revoke` — trigger consent revocation for Journey 4
- `/demo/seed` — full seeded state including Juno history

Seed `artifact_templates` from `fixtures/templates.json` — **never hand-write template SQL.** The JSON is the source of truth; the table is a copy of it.

The orchestrator uses these constantly. Make them fast and idempotent.

### 6. Synthetic dataset

Author and maintain `demo/documents/**`. Realistic NHS letterheads, NHS number fields, consultant signature blocks, plausible trust names. **Print one and rescan it** so it carries photocopier noise — a clean PDF proves nothing about robustness.

**All documents synthetic. Say so on the slide.** Real patient data plus a public stage plus venue wifi is a live breach, not a hypothetical.

### 7. Blind gap test — the honest evaluation

Assemble 8–10 documents **nobody on the team wrote**. `docs/data-sources.md` §1 lists real ones with links — start there rather than hunting.

**Document #1 is already chosen for you:** the PRSB eDischarge Summary example (Robert Smith, 66, infective exacerbation of COPD). It is externally authored, structurally realistic, and **already contains two of our detections naturally** — a GP asked to review BP a week after discharge with no result following (`instruction_without_result`), and a specialist nurse due to visit within a week with no outcome (`referral_without_outcome`). Plant nothing in it; score whether Verity finds what is already there.

Add published trust clinic letters, two blank official CHC forms partially hand-completed, and **at least three phone photos taken in bad light at an angle** — non-negotiable, because clean PDFs prove nothing about what families actually have.

Plant, in a sealed answer key the other lanes never see, 4–5 known gaps, 2–3 genuine well-managed patterns, and 1–2 deliberate near-misses (stability language with *no* intervention nearby, to test the detector doesn't over-fire).

Score blind: gap recall, gap **precision**, well-managed precision, and whether any framework citation was fabricated.

**Known detector interactions, from Lane C's build — handle these on your side, do not ask Lane C to relax a rule:**

- **The Sat 11/07 near-miss in `demo/documents/05-care-log.md` is RESOLVED (25 July 2026)** — but the constraint it exposed is permanent, so keep this note. Intervention-freedom on the Saturday line alone is NOT enough: the detector's 150-character window runs across the joined transcript, so Friday evening's `PRN lorazepam 0.5mg administered` entry can reach Saturday's `no concerns` (it was 75 chars away after the first naïve fix). The current text gives Saturday an in-fiction preamble (daughter covering weekend personal care; welfare check only), which is intervention-free AND puts 185 chars between Friday's PRN and the stability phrase. **That preamble is load-bearing — shorten Saturday's entry and the near-miss silently becomes a hit.** Any future edit to this document must keep both properties and re-run `pnpm test` (Lane C's well-managed tests derive their transcript from this document, and the fixture transcript is byte-cross-checked against it).
- **"difficulty swallowing" is a red-flag trigger** (rule 4, anaphylaxis, per research/01 §6) and also core CHC dysphagia language. It halts only in *concern text* — documents are never scanned — so keep the phrase out of every typed concern in the demo script. In documents it is fine and expected; that is where dysphagia evidence naturally lives.

**Pass bar:** gap recall ≥70%; well-managed precision **100%**, zero tolerance; zero fabricated citations. Run this at H12–16, not at H26. If it fails, the fallback is a manual "flag this as well-managed?" toggle the family clicks themselves — still demoable, zero fabrication risk.

Publish the results including the case it got wrong. Judges reward that; hiding it is the failure mode.

### 8. Backup video

Record at H20, **while the wifi is still fast**. Under 90 seconds, full demo path, loaded in a second browser tab on demo day.

### 9. Merge protocol

At each window: pull all lane branches, resolve seams, run the full test suite, deploy a single integrated preview, hand the orchestrator that one URL plus a list of which journey steps should now pass.

**Never merge to `main` during the night shift.** PRs wait.

---

## Tests

1. Fixture conforms to contract (this is the keystone test)
2. Recorder writes a file whose name is the request hash
3. `fixtures` mode makes zero network calls — assert with a mocked fetch that throws
4. `replay` mode completes the full journey with network disabled
5. `/demo/reset` is idempotent
6. Live-call failure degrades to fixtures with no thrown error surfaced

---

## Stretch goals — do not start before H16, and only if Journey 1 is fully green

See `docs/implementation-plan.md` §7b.

### S5 — Published eval numbers (1h)

You already run the blind gap test (§7). This turns it into a slide.

Publish, in the README and on a deck slide:

| Metric | Result |
|---|---|
| Documents tested (none written by us) | N |
| Real issues found | X of Y |
| **Issues invented that did not exist** | **0** |
| Framework citations fabricated | 0 |
| The one it missed | *describe it plainly* |

**Publish the miss.** Every team claims it works; almost none can say they measured it on documents they didn't write and name what failed. The invented-issues number matters far more than the found number — a missed issue is a bug, an invented one sends a family chasing a document that never existed.

If either zero becomes non-zero, that is a stop-the-line finding, not a slide. Escalate to the orchestrator immediately.

### S1 / S7 support

- **S1 (Maya):** seed the second account — the dataset already exists in `prd-v1-archive.md` §28. Lane B owns the copy layer; you own the seed.
- **S7 (discharge pack):** seed the `discharge_pack_v1` template row and its demo content. Lane A owns the renderer.

### Stretch tests

- Eval numbers regenerate from a script, not hand-typed into the README
- The sealed answer key is committed **after** the scoring run, never before
- Maya's seed loads without touching Margaret's data
- Both accounts reset independently via `/demo/reset`

---

## Night-shift backlog

1. Author more synthetic documents
2. Expand the recorded fixture set
3. Print-stylesheet regression screenshots
4. README with architecture diagram and the MDCG module boundary drawn on it
5. Compliance artefacts: one-page DPIA-lite, stub DCB0129 hazard log with six real hazards

---

## PR checklist

- [ ] CI green
- [ ] Replay mode still completes the full journey offline
- [ ] Description states which journey steps are affected
- [ ] No lane's territory edited without that lane's PR requesting it
