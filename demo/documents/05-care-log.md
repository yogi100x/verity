# Care log extract — render as a scanned page, slightly skewed

Handwriting-style or a photocopied form. This is the **well-managed-need** source and the CHC evidence backbone.

    ELMFIELD HOME CARE — DAILY VISIT LOG
    Client: M. Ellis, 14 Elmfield Road
    Week commencing: 06/07/2026

    ------------------------------------------------------------------
    Mon 06/07  0800  Assisted with washing and dressing. Prompted
                     morning medication. Breakfast prepared. Settled.
               1900  Evening call. Prompted medication. No concerns.

    Tue 07/07  0800  Assisted wash/dress. Prompted meds. Client reports
                     poor night. Ankles swollen.
               1900  Evening call. Prompted meds. Settled overnight,
                     no incidents reported.

    Wed 08/07  0800  Assisted wash/dress. Hoist used for transfer to
                     chair — client unsteady this morning. Prompted meds.
               1900  PRN lorazepam 0.5mg administered at 2130 for
                     agitation. Settled overnight, no incidents.

    Thu 09/07  0800  Assisted wash/dress. Prompted meds. Client
                     mentioned feeling wobbly on stairs.
               1900  Evening call. Prompted meds. Slept well, no
                     concerns.

    Fri 10/07  0800  Assisted wash/dress. Prompted meds. Two-hourly
                     repositioning continued per care plan.
               1900  PRN lorazepam 0.5mg administered 2200. Settled.

    Sat 11/07  0800  Daughter staying for the weekend and covering personal
                     care herself; carer attended for a welfare check only.
                     Good day, no concerns, client in good spirits.
               1900  Evening call. All well.
    ------------------------------------------------------------------

    Carer signature: J. Adeyemi

---

**Demo notes — read carefully, this document carries the precision test.**

**Should fire the well-managed detector:**

- **Wed 08/07 evening** — *"Settled overnight, no incidents"* appears immediately after *PRN lorazepam administered*. Stability language beside active intervention. This is the canonical hit.
- **Fri 10/07 evening** — *"Settled"* after a second PRN dose.
- **Wed 08/07 morning** — hoist transfer plus *"unsteady"*: CHC mobility evidence.
- **Fri 10/07 morning** — two-hourly repositioning: skin integrity evidence.

**Must NOT fire — the deliberate near-miss:**

- **Sat 11/07 morning** — the daughter covers personal care for the weekend, so the carer attends for a welfare check only: *"Good day, no concerns, client in good spirits"* with **no intervention anywhere nearby.** The intervention-free preamble is load-bearing, not padding — it is what pushes the stability phrase clear of Friday evening's PRN entry (measured distance ~185 chars, outside the detector's 150-char co-occurrence window). Shorten that line and the near-miss becomes a hit. A detector that fires here is over-firing, and over-firing on a CHC claim is worse than missing one. This is the precision test in `docs/lanes/lane-d-integrator.md` §7.
- **Sat 11/07 evening** — *"All well"* is deliberately NOT one of the detector's stability phrases (settled, no incidents, stable on, no concerns, slept well), so it is inert either way.

**Cross-source link:** Thu 09/07 *"feeling wobbly on stairs"* corroborates Margaret's own Juno entry the same morning — the patient's account and a professional record independently agreeing, which is as valuable to show as a disagreement.
