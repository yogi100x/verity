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

    Sat 11/07  0800  Assisted wash/dress. Prompted meds. Good day,
                     no concerns, client in good spirits.
               1900  Evening call. Prompted meds. Settled.
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

- **Sat 11/07** — *"Good day, no concerns, client in good spirits"* with **no intervention anywhere nearby.** A detector that fires here is over-firing, and over-firing on a CHC claim is worse than missing one. This single line is the precision test in `docs/lanes/lane-d-integrator.md` §7.

**Cross-source link:** Thu 09/07 *"feeling wobbly on stairs"* corroborates Margaret's own Juno entry the same morning — the patient's account and a professional record independently agreeing, which is as valuable to show as a disagreement.
