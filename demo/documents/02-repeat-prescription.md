# Repeat Prescription — render, print, then photograph at an angle

This one must **not** look like a clean PDF. Print it, lay it on a worktop, photograph it slightly rotated with a shadow across one corner. It is the robustness proof, and the moment a judge realises this works on what families actually have.

    ELMFIELD SURGERY
    22 Elmfield Road, Bristol BS6 6AZ  ·  0117 496 0122

    REPEAT PRESCRIPTION — PATIENT COPY

    Mrs Margaret ELLIS            DOB 14/03/1944
    NHS No 999 000 1234           Printed: 03/07/2026

    Current repeat items:

      1.  Bisoprolol 2.5mg tablets              28 days
      2.  Furosemide 40mg tablets               28 days
      3.  Metformin 500mg tablets               56 days
      4.  Atorvastatin 20mg tablets             28 days
      5.  Amitriptyline 10mg tablets  nocte     28 days
      6.  Colecalciferol 800iu capsules         28 days

    Last issued: 03/07/2026
    Next review: not recorded

    Please allow 48 hours for repeat requests.

---

**Demo notes.**

- **Item 2 is conflict source 2.** Printed 3 July — eight days after a discharge summary that said stop.
- **Item 5 (Amitriptyline) appears in no other document.** A second, quieter find beyond the headline conflict, and more material for the CHC drug-therapies domain.
- **"Next review: not recorded"** triggers the `medication_without_review` detector.
- **Dapagliflozin is absent**, though it was started on discharge — a third finding for anyone looking closely.
