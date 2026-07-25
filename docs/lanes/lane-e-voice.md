# Lane E — Voice & Channels *(conditional)*

**Only launch this lane if you have a spare machine AND Window 3 is green.** The conflict card is the demo; this is a beat inside it. If it competes with Windows 1–3 for hours, it loses.

**Branch:** `lane/e`. **Territory:** `lib/voice/**`, `app/api/voice/**`.
**Never touch:** anything else.

---

## Objective

Let Margaret contribute **without installing anything and without looking at anything.**

She is 82, lives alone, and may not see well. The design answer is not a bigger font — it is that she never uses an interface at all. That is a stronger accessibility claim than any WCAG criterion, and it is the line to say on stage: *"Margaret didn't install anything. She just spoke."*

---

## Spec — a strict ladder, in order

### Rung 1 — Browser mic capture (~1h, ships regardless)

`MediaRecorder` in the web app. Sarah or Margaret records; audio uploads to Supabase Storage; a `Source` row is created with `kind: 'audio'`; Lane A's pipeline transcribes and extracts.

Zero provisioning, zero external dependency, works offline in replay mode. **Build this first and completely before considering rung 2.**

### Rung 2 — Inbound phone number (~2h; the number already exists)

**A US Twilio number is already held.** Provisioning is not part of this task — you are writing the webhook, not buying a number.

**Console wiring** (orchestrator does this once, after the first deploy): Twilio Console → Phone Numbers → Manage → Active numbers → the number → Voice Configuration → *"A call comes in"* = **Webhook**, **HTTP POST**, URL `https://<preview>.vercel.app/api/voice/inbound`. A Vercel preview URL is public, so no ngrok is needed.

**Three gotchas that each cost an hour if rediscovered:**
1. The TwiML response must be `Content-Type: text/xml`, not JSON.
2. Fetching `RecordingUrl` requires HTTP Basic auth with the Account SID and Auth Token. Append `.mp3`.
3. On a trial account, *outbound* calls only reach verified numbers and play a notice first. **Inbound is unaffected** — which is all we use.

Keep one small interface so Telegram stays viable as rung 3:

```ts
// lib/voice/provider.ts
export interface VoiceProvider {
  provisionNumber(country: string): Promise<{ e164: string }>;
  handleInboundWebhook(req: Request): Promise<{ recordingUrl: string; from: string }>;
}
```

**Twilio is the only provider.** The entire call flow is:

```xml
<Response>
  <Say voice="Polly.Amy">Please tell me how you have been since you came home from hospital.</Say>
  <Record maxLength="60" playBeep="true" recordingStatusCallback="/api/voice/recording" />
</Response>
```

The webhook downloads the recording, stores it, creates a `Source`. That is the whole feature.

The webhook downloads the recording, stores it in a private Supabase bucket, and creates a `Source` row with `kind: 'audio'`. Lane A's pipeline takes over from there. That is the whole feature.

The number is US. Nobody watching can tell what country an inbound number belongs to, and it is never shown on screen.

### Rung 3 — Telegram bot (fallback only)

If no number is obtainable, a Telegram bot accepting a voice note or photo is ten minutes with BotFather. Weaker story — she'd need a smartphone — but better than nothing.

---

## Explicitly out of scope — do not build these

**Conversational voice agent.** An agent that questions an elderly person about symptoms and responds is interactive clinical information gathering — the exact line `prd.md` §8 exists to stay behind. One-way capture of a volunteered statement is a document; a back-and-forth is an interview. Vapi, Retell, Bland and ElevenLabs Agents all build the thing we must not ship.

**Outbound calling.** Consent optics are terrible, and it was cut in `research/03` and `research/04` independently.

**Voice output / read-aloud.** Earns nothing on the rubric, fails in noisy rooms, and synthesised speech saying anything route-shaped drifts toward device territory.

**WhatsApp.** Blocked on Meta verification of the Business Account — a vendor cannot skip it, and Zernio's own prerequisites confirm it. Post-hackathon.

---

## Constraints

- Downscale images client-side before upload — providers commonly cap inbound images near 5MB and phone photos exceed it routinely. Wanted anyway for extraction cost.
- Recordings are health data: private bucket, signed URLs with short expiry, never a public path.
- The prompt Margaret hears is **fixed copy**, never model-generated. Import it from `lib/copy/safety.ts`.

---

## Tests

1. Browser capture produces a `Source` row with `kind: 'audio'` and a valid storage path
2. Inbound webhook creates exactly one `Source` per call; duplicate deliveries are idempotent
3. An oversized image is downscaled below the cap before upload
4. Recording URLs are signed and expire
5. The spoken prompt string is imported from safety copy, not inlined

---

## PR checklist

- [ ] Rung 1 complete and tested before any rung 2 work
- [ ] CI green
- [ ] Description states which rung landed and what the orchestrator should hear when they call or record
- [ ] No file outside territory touched
