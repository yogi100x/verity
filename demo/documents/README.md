# Synthetic demo dataset — Margaret Ellis

**Every document here is fabricated.** No real patient data at any point. Say so on the slide.

Lane D owns this directory: render these to PDFs on realistic letterheads, print and rescan at least one so it carries photocopier noise, and photograph the prescription at an angle in kitchen lighting.

## The people

**Margaret Ellis**, 82. Born 14 March 1944. Widowed, lives alone in a terraced house in Bristol. Heart failure (HFrEF, LVEF 40%), CKD stage 3b, type 2 diabetes. Admitted 21 June 2026 with breathlessness and ankle swelling; discharged 25 June. A Juno user for eighteen months — she tracks her breathlessness and her sleep.

**Sarah Ellis**, 54. Daughter, Manchester. Marketing manager, two teenagers, the default sibling. Holds the carrier bag of paperwork.

**James Ellis**, 49. Son, Leeds. Helps by phone.

## The documents

| File | Kind | Role in the demo |
|---|---|---|
| `01-discharge-summary.md` | PDF, 2 pages | Says furosemide **stopped**. Conflict source 1. Carries the 7-day renal review instruction driving the headline gap. |
| `02-repeat-prescription.md` | Phone photo, angled | Printed 3 July — **eight days after discharge** — and still lists furosemide. Conflict source 2. |
| `03-cardiology-letter.md` | PDF | March 2026. Continue furosemide, review in six months. The quieter find: that review is now overdue and unbooked. |
| `04-juno-history.md` | Juno entries | Margaret's own words. Conflict source 3 — **the patient against the institutions.** |
| `05-care-log.md` | Scanned page | Carries the well-managed-need bait: stability language beside a PRN lorazepam entry and a hoist transfer. |

## The three planted findings

1. **The furosemide conflict** — three sources, three different answers. The hero.
2. **The renal review gap** — discharge asks for it within 7 days; nothing recorded after. Pure date arithmetic.
3. **The well-managed-need flag** — stability language beside active intervention. Triggers para 162.

One deliberate **near-miss** is also planted: a care-log line with stability language and no intervention nearby. The detector must **not** fire on it. That is the precision test, and it matters more than the recall test.
