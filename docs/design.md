# Verity — Design System

**Source of truth for every visual decision.** Lane B builds against this. `prd.md` §10 is the summary; this is the detail.

Visual reference: `demo/design-showcase.html` — open it in a browser. It is the target.

---

## 1. Principles

**Provenance is the visual thesis.** A judge should be able to tell from across a room which parts of the screen came from a document and which came from a person. Every other decision is subordinate to that.

**One idea per screen.** If a screen does two things, it's two screens. Density is the enemy of a frightened reader.

**Calm, not premium.** We borrow CRED's *restraint* — whitespace, hierarchy, motion craft, short copy — and reject its *register*. CRED sells status. Verity sells *"you can stop panicking; here is what your documents actually say."* Never clever, never aspirational.

**Nothing to prove.** A screenshot should look designed by someone with taste who isn't showing off.

**Warm, not clinical.** Paper, not white. Ink, not black. This is read by a frightened 54-year-old at 11pm, not by a clinician at a workstation.

---

## 2. Typography

Three families, each with exactly one job. Self-hosted via `next/font`.

| Family | Role | Weights |
|---|---|---|
| **Fraunces** | Display only | 400, 560, 680 |
| **Public Sans** | UI and body | 400, 500, 600, 700 |
| **IBM Plex Mono** | Verbatim quotes and locators | 400, 500 |

**Fraunces appears in exactly four places** and nowhere else: the landing headline, the artefact masthead, section dividers, and the conflict-card header. It is punctuation, not wallpaper.

**Public Sans over Inter** deliberately — USWDS built and tested it for low-vision and older-adult legibility. Inter is the default everyone uses; this is both better here and less generic.

### The mono switch is the provenance signal

**IBM Plex Mono means copied verbatim from a source. Public Sans means prose the product wrote.** Never mix them inside a sentence. This single rule does more work than any colour or icon, and it teaches itself within about ten seconds of use.

### Scale

Root **18px**, not 16 — scaling to 20px below 480px viewport.

| Token | Size | Line height | Use |
|---|---|---|---|
| `display-xl` | 3.5rem | 1.05 | landing headline (Fraunces 680) |
| `display-l` | 2.25rem | 1.15 | artefact masthead (Fraunces 560) |
| `display-m` | 1.375rem | 1.3 | conflict-card header (Fraunces 560) |
| `title` | 1.25rem | 1.35 | screen titles (Public Sans 600) |
| `body-l` | 1.125rem | 1.6 | primary reading (Public Sans 400) |
| `body` | 1rem | 1.6 | default (Public Sans 400) |
| `body-s` | 0.875rem | 1.5 | secondary (Public Sans 400) |
| `label` | 0.8125rem | 1.4 | chips, labels (Public Sans 600) |
| `mono` | 0.875rem | 1.55 | quotes (Plex Mono 400) |
| `mono-s` | 0.75rem | 1.4 | locators (Plex Mono 500) |

**Hierarchy ratio target: 3–4×** between a screen's headline and its body. Most apps settle for 1.5× and look timid. Don't.

---

## 3. Colour

| Token | Hex | On paper | Use |
|---|---|---|---|
| `paper` | `#FAF7F2` | — | page background. Warm, lower glare than white |
| `surface` | `#FFFFFF` | — | cards |
| `ink` | `#1C1B1A` | 15.8:1 | primary text |
| `ink-secondary` | `#55504A` | 6.1:1 | secondary text |
| `hairline` | `#E7E1D8` | — | borders, rules |
| `brand` | `#14453D` | 9.6:1 | deep forest-teal. Primary actions, focus rings |

### Provenance families — each means exactly one thing

| State | Fill | Border | Text | Meaning |
|---|---|---|---|---|
| **Citation** | `#E4EFEC` | `#A9C9C2` | `#14453D` | anchored to a real page. **Used nowhere else.** |
| **Unverified** | `#FBEADD` | `#E8B98C` | `#9A4A15` | user-stated, no document. Terracotta — not orange-500 |
| **Conflict** | `#FFF4D6` | `#E0B94A` | `#7A5C05` | sources disagree. Amber, a distinct hue from both above |
| **Emergency** | `#FDEDEC` | — | `#B3261E` | 6.8:1 |

**Emergency red is reserved exclusively for the 999 halt card and the permanent safety banner.** Never for validation, never for errors, never for destructive actions — those use `ink-secondary` plus an icon. Diluting this signal is a safety regression, not a style choice.

**No dark theme.** Wrong for an 82-year-old's eyes in daylight, breaks parity with the printed artefact, and reads cold when someone is frightened.

---

## 4. Space, radius, motion

**Spacing scale (rem):** `0.25 · 0.5 · 0.75 · 1 · 1.5 · 2 · 3 · 4 · 6`. Nothing between. Card padding 1.5rem mobile / 2rem desktop. **Section gaps 3–6rem, not 1.5** — emptiness signals confidence.

**Radius:** 4px chips and badges ("data"), 12px cards and panels ("content"), 20px primary CTA and bottom sheets (reserved for the two or three highest-commitment actions only).

**Elevation:** almost none. A 1px `hairline` border does the work of a shadow. One shadow token exists, for bottom sheets and modals only: `0 -4px 24px rgba(28,27,26,0.08)`.

**Motion:**

| Interaction | Timing |
|---|---|
| Micro (hover, focus, press) | 120ms ease-out |
| Timeline event entry | 320ms `cubic-bezier(0.16,1,0.3,1)`, 8px translateY + opacity, staggered 60ms |
| Panel expand | 240ms via `grid-template-rows` — never JS height measurement |
| Conflict card entry | 400ms scale 98%→100%. **The only scaling transition in the product** |
| **The beat** | The conflict's resolving question appears **400ms after** the chips settle. A deliberate pause before the payoff. |
| Page transitions | **none.** Instant nav — a spinner between screens reads as broken |

Everything wraps in `prefers-reduced-motion: reduce` → 100ms opacity only.

---

## 5. `<ProvenanceTag>` — the signature component

Build this first. Everything else depends on it existing and being right.

**Type-level invariant:** accepts *either* a `citation` prop *or* `userStated: true`. Never both, never neither. **A sourceless fact must be unrepresentable in the type system**, not merely discouraged.

```tsx
type ProvenanceTagProps =
  | { citation: { sourceTitle: string; locator: Locator; quote: string; sourceId: string };
      userStated?: never }
  | { userStated: true; citation?: never };
```

### Citation variant

4px radius · `#E4EFEC` fill · 1px `#A9C9C2` border · `label` type in `#14453D` · document icon · source short-name · locator in `mono-s` (`p.2 · line 14`). Visually compact but **32px minimum touch height**.

**Hover or focus, 320ms delay → popover:**
- The verbatim quote in `mono`, in quotation marks, with a 3px `brand` left border
- Source name and full locator beneath
- `Open page 2 →` — mints a 60-second signed URL server-side, opens `{url}#page=2` in a new tab

Native PDF viewers honour the `#page=` fragment. **Do not build a PDF viewer.**

On mobile: tap opens a bottom sheet with the same content plus a full-width open button.

### Unverified variant

Identical geometry, terracotta family, speech-bubble icon, and the words *"You told us this — not from a document."* **No popover** — the badge is the entire disclosure.

---

## 6. Components

### Conflict card — the money moment

Full width · 2.5rem padding · amber wash at 8% · 12px radius · 1px `#E0B94A`.

Header in Fraunces `display-m` — the only place the serif appears mid-flow, deliberately, to slow the reader at the highest-stakes card in the product.

Three chips in a row (stacked below 640px), **equal visual weight — no source outranks another.** Each is a mini-card: source icon, source name, locator in `mono-s`, and the quoted span in `mono` on a light provenance-tinted ground. Two are institutions; one is the patient. That asymmetry is the point and must not be visually flattened.

Below: a bolded resolution line — *"This is now a question on the appointment brief:"* — then the generated question in a bordered callout (1px `brand`, 8px radius, white fill).

**No accept or reject buttons.** Conflicts are surfaced, never resolved by us.

### Timeline event

Left rule in `hairline` with a 8px `brand` dot. Date in `mono-s`. Title in `body-l`. Exactly one `<ProvenanceTag>`. Approximate dates get a dotted underline **and** are spelled out ("around March 2024", never a bare asterisk).

**Superseded events** (stretch S6): struck through, dimmed to `ink-secondary`, with a note *"Replaced by the discharge summary, 25 June."* Citation chip stays live — superseded evidence is still evidence. Never hidden behind a toggle; the visible strike-through *is* the feature.

### Gap card

Dashed 1px `hairline` border, 12px radius, `surface` fill. Statement in `body-l`. Provenance tags for supporting claims. Optional `Draft request letter` secondary button (stretch S3).

A gap is a **statement about the record**, never advice. The visual language should feel informational, not alarming — no icons that read as warnings.

### Buttons

| Variant | Style |
|---|---|
| Primary | `brand` fill, white text, 20px radius, 56px height |
| Secondary | `surface` fill, 1px `hairline`, `ink` text, 12px radius, 48px height |
| Tertiary | text only, `brand`, underline on hover |
| Disabled | `hairline` fill, `ink-secondary` text, **with a label explaining why** — e.g. *"Review to unlock printing"* |

A disabled button that doesn't say why it's disabled is a bug.

### Uncertainty and empty states

Calm and structured, never a broken red UI:

1. **Not yet known** → dashed ghost card, `ink-secondary` italic placeholder ("No review date recorded"), inline `+ Add this`
2. **Approximate dates** → dotted underline plus spelled-out wording
3. **Partial extraction** → honest and specific: *"We could read most of this page, but not the handwritten note in the margin"*, with a thumbnail and `View the original`

Palette for all three: `ink-secondary` plus the terracotta family. **Never red, never a warning triangle** — both belong to the 999 card alone.

### Safety banner and 999 card

**Banner:** permanent, every screen, identical for every user, never conditional on input. A conditional symptom-triggered alert is exactly the "indication of seriousness" output that MHRA classes as a device function.

**999 halt card:** full-screen takeover. Emergency palette. Copy verbatim from `lib/copy/safety.ts` — never re-typed, never paraphrased.

---

## 7. Mobile and PWA

App-shaped, web-delivered.

- `display: standalone`, `theme_color: #14453D`, `background_color: #FAF7F2`
- `viewport-fit=cover` plus `env(safe-area-inset-*)` padding
- **Bottom navigation below 768px** — Timeline / Conflicts / Gaps / Artefacts
- Full-height views over long scrolling pages
- **Bottom sheets, not modals**
- Primary actions in the lower third — thumb-reachable
- Install prompt: dismissible, shown once, never on first load

---

## 8. Print

`window.print()` plus a print stylesheet. No PDF library.

```css
@media print {
  .no-print { display: none; }          /* nav AND the red safety banner */
  body { column-count: 2; column-gap: 2rem; font-size: 11pt; }
  .card, table { break-inside: avoid; }
  @page { size: A4; margin: 14mm; }
}
```

Masthead 18pt, body 11pt, footer 9pt — regardless of the 18px screen root.

**Print-safe overrides:** teal citation chip → black text with a thin rule. Amber conflict box → 20% grey fill. Colour prints unreliably; the document must survive a bad office printer.

**Hide the red safety banner in print** — inappropriate on a page handed to a clinician.

---

## 9. Accessibility

- WCAG **AA** minimum (4.5:1 body, 3:1 large/UI). `ink`/`paper` and `brand`/white hit **AAA** deliberately
- Holds at **200% zoom** with no horizontal scroll and no clipping — rem throughout
- Touch targets: 44px WCAG minimum, **48px default, 56px primary**
- Full keyboard path. Visible 2px `brand` focus ring, 2px offset
- Citation popover opens with Enter or Space, closes with Escape
- **Never colour alone** — every status carries at least two of {icon, text label, border style}
- Carer vs self mode is a copy flag, not a UI fork

---

## 10. Do not

- Use Fraunces outside its four permitted places
- Mix Plex Mono and Public Sans within a sentence
- Use emergency red anywhere but the 999 card and banner
- Render a fact with neither a citation chip nor an unverified badge
- Add a shadow where a hairline border would do
- Ship a spinner-only loading state — name what is happening
- Ship a disabled control without saying why
- Introduce a component library
- Build a dark theme
