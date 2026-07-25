/**
 * S4 — the one-line Attendance Allowance prompt at the end of the CHC pack.
 *
 * Copy is Lane C's, verbatim (lib/copy/attendance_allowance.ts) — this
 * component never retypes the rate or the wording, it only lays the string
 * out. `attendanceAllowanceLine()` returns a single sentence that already
 * embeds AA_CHECK_URL as literal text; this component finds that substring
 * and wraps just it in an <a>, leaving everything else as plain text. The
 * reconstructed text (before + link text + after) is byte-identical to the
 * copy module's output — a test asserts that equality directly.
 *
 * PRINT: no template-key branching lives here (see the docs comment on
 * ArtefactDocument's `showAttendanceAllowance` prop for where that decision
 * is made). Because the link's visible text IS the URL, the href prints as
 * legible text automatically — no extra print CSS needed to reveal it.
 */

import { AA_CHECK_URL, attendanceAllowanceLine } from "@/lib/copy/attendance_allowance";

export function AttendanceAllowanceLine({
  personName,
  // Real callers pass only `personName`; the line is Lane C's copy for that
  // person. `line` is an injection seam for tests that need to exercise the
  // degraded branches below — a Lane-C line where AA_CHECK_URL is absent or
  // appears more than once — which the copy module never produces today.
  line = attendanceAllowanceLine(personName),
}: {
  personName: string;
  line?: string;
}) {
  const urlIndex = line.indexOf(AA_CHECK_URL);

  // Defensive only — attendanceAllowanceLine always appends AA_CHECK_URL as
  // prose text today. If that ever changes, fail safe to plain text rather
  // than silently dropping the link.
  if (urlIndex === -1) {
    return (
      <p className="mt-8 text-body-s text-ink-secondary print-avoid-break">{line}</p>
    );
  }

  const before = line.slice(0, urlIndex);
  const after = line.slice(urlIndex + AA_CHECK_URL.length);

  return (
    <p className="mt-8 text-body-s text-ink-secondary print-avoid-break">
      {before}
      <a
        href={AA_CHECK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline underline-offset-2"
      >
        {AA_CHECK_URL}
      </a>
      {after}
    </p>
  );
}
