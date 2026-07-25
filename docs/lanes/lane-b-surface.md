# Lane B — Surface

**Paste this whole file into the agent on machine B at kickoff.**

**Read first:** `prd.md` (especially §10 design system), `docs/user-journey.md`, `docs/contract-spec.md`, `docs/stack-freeze.md`.

**The stack is frozen.** Tailwind only — **no component library**. shadcn/ui and every equivalent are explicitly rejected: the design system is bespoke and specified to hex values, and a library's defaults are the templated look we are avoiding. Hand-build against the tokens. Do not run `pnpm add`.

**Branch:** `lane/b`. **Territory:** `app/(app)/**`, `components/**`, `app/globals.css`, `app/layout.tsx`.
**Never touch:** `lib/contracts.ts`, `lib/ai/**`, `app/api/**`, `lib/safety/**`, `fixtures/**`.

**You need no API key and no database.** Everything renders from `fixtures/margaret.json`. This is deliberate — you cannot be blocked by any other lane. If you find yourself waiting for Lane A, you have taken a wrong turn.

---

## Objective

Build every screen, and make the provenance system beautiful enough that it reads as the product's whole point rather than a footnote.

A judge should be able to tell, from across a room, which parts of the screen came from a document and which came from a person. That is the entire visual thesis.

The orchestrator cannot read code. **Your PR previews are how the product gets reviewed.** Treat the preview URL as the deliverable.

---

## Spec

### Non-negotiable design tokens (`prd.md` §10)

Fraunces for display only — masthead, landing headline, conflict-card header. Nowhere else. Public Sans for UI and body. IBM Plex Mono for every verbatim quote and every locator.

**The mono switch is itself the provenance signal.** Plex Mono means copied from a source. Public Sans means prose the product wrote. Never mix them within a sentence.

Paper `#FAF7F2` · ink `#1C1B1A` / `#55504A` · hairline `#E7E1D8` · brand `#14453D` · citation `#E4EFEC`/`#A9C9C2`/`#14453D` · unverified `#FBEADD`/`#E8B98C`/`#9A4A15` · conflict `#FFF4D6`/`#E0B94A`/`#7A5C05` · emergency `#B3261E` on `#FDEDEC`.

**Emergency red is reserved exclusively for the 999 card.** Not for validation, not for errors, not for destructive actions — those use neutral slate plus an icon. If red appears anywhere else the safety signal is diluted.

Root 18px. Spacing `0.25 0.5 0.75 1 1.5 2 3 4 6` rem. Radius 4px chips / 12px cards / 20px primary CTA. Motion 120ms micro, 320ms `cubic-bezier(0.16,1,0.3,1)` timeline entry staggered 60ms, all inside `prefers-reduced-motion`.

### `<ProvenanceTag>` — the signature component, build it first

Type-level invariant: it accepts **either** a `citation` prop **or** `userStated: true`, never both, never neither. A sourceless fact must be unrepresentable in the type system.

```tsx
type ProvenanceTagProps =
  | { citation: { sourceTitle: string; locator: Locator; quote: string; sourceId: string }; userStated?: never }
  | { userStated: true; citation?: never };
```

**Citation variant:** 4px radius, teal fill, document icon, source short-name, locator in Plex Mono (`p.2 · line 14`). 32px minimum touch height even though visually compact. Hover or focus after 320ms opens a popover with the verbatim quote in Plex Mono, quotation marks, 3px teal left border, plus "Open page 2 →". On mobile, tap opens a bottom sheet.

**Unverified variant:** same geometry, terracotta, speech-bubble icon, text *"You told us this — not from a document."* No popover — the badge is the full disclosure.

### Screens

1. **Landing** — headline, one line of explanation, Start, permanent safety banner
2. **Dashboard** — person header with access-basis badge, source list, primary actions
3. **Upload** — drag-drop, per-file progress, named processing states (never a bare spinner), honest partial-read state
4. **Timeline** — chronological, every event carrying a ProvenanceTag, approximate dates dotted-underlined *and* spelled out ("around March 2024")
5. **Conflict card** — see below
6. **Gaps panel** — each gap a statement about the record, with its own provenance
7. **Artefact view** — CHC pack and GP brief, review-gate checkbox, print

### Conflict card — the money moment

Full width, 2.5rem padding, amber wash at 8%. Header in Fraunces 22px — the only place the serif appears mid-flow, deliberately, to slow the reader at the highest-stakes moment.

Three chips in a row (stacked on mobile), **equal visual weight** — no source outranks another. Each shows source icon, name, Plex Mono locator, and the quoted span on a light provenance-coloured ground. The Juno chip shows Margaret's own words with her timestamp.

Below: a bolded resolution line — *"This is now a question on the appointment brief:"* — then the generated question in a bordered callout.

**No accept/reject buttons.** Conflicts are surfaced, never resolved by us.

Entrance: scroll-into-view, 400ms scale from 98%. The resolving question appears a full 400ms *after* the chips settle — a deliberate beat of silence before the payoff. This is the single most rehearsed moment in the demo; make it land.

### PWA — make it look like a mobile app that happens to live on the web

This is a delivery decision, not a nice-to-have: the product should read as an app on a phone and still open instantly from a URL.

- `public/manifest.json` — name, short_name, `display: "standalone"`, `theme_color: "#14453D"`, `background_color: "#FAF7F2"`, portrait orientation
- Icons at 192, 512, and a maskable 512
- `viewport-fit=cover` plus `env(safe-area-inset-*)` padding so it sits correctly on notched phones in standalone mode
- **Mobile-app layout patterns**: persistent bottom navigation on small viewports (Timeline / Conflicts / Gaps / Artefacts), full-height views rather than long scrolling pages, bottom sheets instead of modals, thumb-reachable primary actions
- A tasteful install prompt — dismissible, shown once, never on first load

**You do not own the service worker.** Lane D does, because caching interacts with `?mode=live|fixtures|replay`. Do not register one.

### Print

`window.print()` with a print stylesheet. No PDF library. A4, `column-count: 2`, `break-inside: avoid` on cards, `@page { size: A4; margin: 14mm }`, 11pt body / 9pt footer / 18pt masthead. Hide nav and the red safety banner — inappropriate on a page handed to a clinician. Print-safe colour overrides: teal chip becomes black text with a thin rule; amber box becomes 20% grey.

Print button disabled until the review checkbox is ticked, labelled *"Review to unlock printing"*.

---

## Tests

1. `<ProvenanceTag>` with neither prop fails to compile (type-level test)
2. Every timeline row in the fixture renders exactly one ProvenanceTag
3. Citation popover shows the quote verbatim, unmodified
4. Conflict card renders exactly three chips of equal weight from the fixture
5. Print button disabled until the checkbox is ticked
6. Emergency red appears in exactly one component
7. Axe: zero violations on every screen
8. Renders at 320px and at 200% zoom without horizontal scroll

---

## Stretch goals — do not start before H16, and only if Journey 1 is fully green

See `docs/implementation-plan.md` §7b. **S1 is the highest-value hour in the whole stretch list — do it first.**

### S1 — Maya coda (1h)

A second seeded account: Maya, 34, using the product **for herself** rather than for a parent.

No engine change. It is a `care_relationships` row with `role: 'self'`, plus a copy layer:

- First person throughout — *"my discharge letter"*, not *"Margaret's discharge letter"*
- **No consent step and no access-basis badge** — self is the degenerate carer case
- Everything else identical: same screens, same components, same pipeline

Implement copy as a `voice: 'first' | 'third'` prop resolved once at the layout level. **Do not fork any screen.** If you find yourself duplicating a component, stop — that is the wrong shape and it means the abstraction leaked.

On stage this is 25 seconds at 2:50: *"Same product. She's doing it for herself."* It matters because Juno's own users are chronic-illness patients managing their own care.

### S3 (UI half) — Request-letter button (~30m of the 1.5h)

Each gap gets a **Draft request letter** button. Lane C generates the text; you render it in a modal with copy-to-clipboard and print. Read-only — no editing, no sending.

### S6 (visual half) — Supersession (~45m of the 2h)

A superseded timeline event renders **struck through**, dimmed to ink-secondary, with a small note: *"Replaced by the discharge summary, 25 June."* Citation chip stays live and clickable — the old instruction is still evidence.

Do not hide it, do not collapse it behind a toggle. The visible strike-through **is** the feature.

### Stretch tests

- Maya's screens render with zero duplicated components (assert on the import graph or by inspection)
- Maya's account shows no consent step and no access badge
- Margaret's account still shows both
- A superseded event is struck through and still has a working citation chip
- Request-letter modal opens, copies, and prints

---

## Night-shift backlog

1. Empty states for every screen — explanatory, never fabricated content
2. Error states on every generation action
3. Loading skeletons matching final layout (no layout shift)
4. Mobile bottom sheets
5. Keyboard paths and visible focus rings throughout
6. Reduced-motion variants

---

## PR checklist

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Preview deploys
- [ ] **Screenshot of every changed screen in the PR description**
- [ ] Description names which `docs/user-journey.md` steps should now pass
- [ ] No file outside territory touched
