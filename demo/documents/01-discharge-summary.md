# Discharge Summary — render as a 2-page PDF on NHS letterhead

## Page 1

    BRISTOL ROYAL INFIRMARY
    Department of Cardiology · Ward 8B

    DISCHARGE SUMMARY

    Patient:      Margaret ELLIS
    DOB:          14/03/1944           NHS No: 999 000 1234
    Address:      14 Elmfield Road, Bristol BS6 6AY
    Admitted:     21/06/2026
    Discharged:   25/06/2026
    Consultant:   Dr A. Okafor, Consultant Cardiologist
    GP:           Dr H. Mensah, Elmfield Surgery

    REASON FOR ADMISSION
    Breathlessness on minimal exertion with bilateral ankle oedema.

    DIAGNOSIS
    1. Decompensated heart failure (HFrEF)
    2. Chronic kidney disease stage 3b
    3. Type 2 diabetes mellitus

    CLINICAL COURSE
    Mrs Ellis was admitted with a four-day history of worsening
    breathlessness and ankle swelling. She was treated with intravenous
    diuresis with good symptomatic response. Renal function deteriorated
    during admission (creatinine rose from 118 to 164 umol/L) and diuretic
    therapy was adjusted accordingly. She was reviewed by the heart failure
    specialist nurse prior to discharge.

## Page 2

    MEDICATION CHANGES ON DISCHARGE

      line 12   Bisoprolol 2.5mg once daily — CONTINUE
      line 14   Furosemide 40mg — STOPPED prior to discharge due to
                worsening renal function. Do not restart without review.
      line 16   Dapagliflozin 10mg once daily — NEW, started 23/06/2026
      line 18   Metformin 500mg twice daily — CONTINUE
      line 20   Atorvastatin 20mg nocte — CONTINUE

    ACTIONS FOR PRIMARY CARE

      line 24   GP to review renal function and diuretic requirement
                within 7 days of discharge.
      line 26   Daily weights. Contact GP if weight rises more than 2kg
                over 3 days.

    FOLLOW-UP

      line 30   Heart failure specialist nurse to contact within 2 weeks.
      line 32   Cardiology outpatient review in 3 months.

    Information given to patient and to daughter (Mrs S. Ellis) by telephone.

    Dr A. Okafor
    Consultant Cardiologist
    25/06/2026

---

**Demo notes.** Line 14 is conflict source 1 — the citation chip must resolve to *page 2, line 14*. Line 24 drives the `instruction_without_result` gap: no renal result exists after 25/06/2026 anywhere in the dataset.
