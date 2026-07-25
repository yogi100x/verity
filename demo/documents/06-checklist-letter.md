# CHC Checklist outcome letter — render as a clean 1-page PDF

This is the source behind the `chc.checklist_date` fact, which powers the 28-day
Checlist-to-decision clock (Lane C's `chcDeadlines`). Checklist completed **10
July 2026** → on demo day (26 July) the clock reads **Day 16 of the 28-day
timescale** — inside the window, factual, no urgency language.

    BRISTOL COMMUNITY HEALTH PARTNERSHIP
    Continuing Healthcare Team

    11 July 2026

    Mrs Margaret Ellis
    14 Elmfield Road, Bristol BS6 6AY

    Re: NHS Continuing Healthcare screening

    Dear Mrs Ellis,

    The NHS Continuing Healthcare Checklist was completed on 10 July 2026
    by the community matron. The outcome was positive and a referral has
    been made for a full assessment of eligibility using the Decision
    Support Tool.

    A member of the team will contact you to arrange the multidisciplinary
    assessment. If you have questions about this process, please contact
    the Continuing Healthcare Team on the number above.

    Yours sincerely,

    R. Whitfield
    CHC Coordinator

---

**Demo notes.**

- *"completed on 10 July 2026"* is the clock's anchor — the claim quote must
  resolve verbatim.
- A positive Checklist is **a door, not a verdict** (guidance para 3: the
  threshold is deliberately low). The pack must never imply the referral
  predicts eligibility.
- Letter deliberately does **not** name any condition — keeps `filterOutput`
  clean and matches how these letters actually read.
