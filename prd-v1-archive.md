# CarePath for Juno

## Product Requirements Document

**Version:** Hackathon MVP v1.0
**Target event:** Consumer Health Hackathon, 25–26 July 2026
**Product type:** Consumer healthcare navigation assistant
**Primary platform:** Responsive web application
**Proposed integrations:** Anthropic Claude, Supabase, optional ElevenLabs
**Development timeframe:** 24–36 hours
**Status:** Concept and implementation specification

---

# 1. Executive summary

CarePath is an AI-powered healthcare navigation layer for Juno.

Juno helps people living with chronic illness:

* describe what they are experiencing
* track symptoms over time
* identify patterns
* receive ongoing emotional support
* prepare information for medical appointments

CarePath takes the next step.

It converts a user’s medical history, symptom records, uploaded documents and current concern into a structured healthcare journey.

The system helps the user understand:

1. what has happened so far
2. what remains unresolved
3. which healthcare route may be appropriate
4. what information should be gathered
5. what questions should be asked
6. what actions should be completed after an appointment

CarePath does not diagnose, prescribe treatment or replace a clinician.

Its core purpose is to reduce the confusion, repetition and cognitive burden involved in navigating healthcare with a chronic or complex condition.

## Product statement

> CarePath turns fragmented health history into a clear, safe and actionable healthcare journey.

---

# 2. Problem

People living with chronic or unresolved health conditions often have information distributed across:

* symptom diaries
* conversations
* prescriptions
* discharge letters
* laboratory reports
* appointment notes
* referral letters
* imaging reports
* patient portals
* personal memory

The patient must repeatedly reconstruct this information during every new consultation.

This creates several problems.

## 2.1 Patient problems

Patients may struggle to understand:

* which clinician they should contact
* whether they should book a routine or urgent appointment
* what happened during previous appointments
* which investigations have already been performed
* what questions remain unanswered
* what information a specialist needs
* what to say during a short consultation
* what follow-up actions were agreed
* when to seek additional help

## 2.2 Chronic illness problems

People with chronic illness may also experience:

* fatigue
* brain fog
* memory difficulties
* anxiety before appointments
* difficulty explaining fluctuating symptoms
* multiple overlapping conditions
* repeated referrals
* long periods between consultations

The burden of coordinating care is therefore placed on the person who may have the least capacity to manage it.

## 2.3 Healthcare-system problems

Poorly structured patient information can contribute to:

* repeated history-taking
* incomplete referral information
* unnecessary duplication
* missed follow-ups
* poor continuity between clinicians
* inefficient consultations
* patients arriving without relevant records

CarePath addresses the coordination and navigation layer rather than attempting to provide medical diagnosis.

---

# 3. Product vision

## 3.1 Long-term vision

CarePath becomes the navigation engine inside Juno.

Juno remembers the patient’s lived experience.

CarePath converts that memory into an organised healthcare pathway.

Together, they form a continuous loop:

```text
Experience symptoms
        ↓
Talk to Juno
        ↓
Track changes and patterns
        ↓
Create CarePath
        ↓
Prepare for appointment
        ↓
Attend consultation
        ↓
Record outcome
        ↓
Update timeline and next steps
```

## 3.2 Hackathon vision

The hackathon MVP should prove one central proposition:

> An AI system can take fragmented patient information and convert it into a useful, safe and understandable appointment and care-navigation plan.

The MVP does not need to connect to the NHS, electronic health records or live clinical systems.

---

# 4. Product positioning

## 4.1 Positioning statement

For people living with chronic or unresolved health conditions who struggle to understand what to do next, CarePath is an AI healthcare navigation assistant that transforms their symptoms, documents and care history into a structured next-step plan.

Unlike a symptom checker, CarePath does not attempt to tell users what disease they have.

Unlike a generic health chatbot, it maintains a longitudinal journey covering preparation, navigation and follow-up.

## 4.2 Difference between Juno and CarePath

| Capability                       |                Juno |                             CarePath |
| -------------------------------- | ------------------: | -----------------------------------: |
| Conversational emotional support |             Primary |                            Secondary |
| Symptom tracking                 |             Primary |                Uses existing records |
| Pattern identification           |             Primary |           Uses patterns for planning |
| Chronic illness companionship    |             Primary |              Not the primary purpose |
| Medical timeline                 |  Supporting feature |                         Core feature |
| Care-route planning              |             Limited |                         Core feature |
| Appointment preparation          | Existing capability | More structured and pathway-oriented |
| Referral preparation             |             Limited |                          Core output |
| Follow-up management             |  Supporting feature |                         Core feature |
| Diagnosis                        |                  No |                                   No |
| Treatment recommendation         |                  No |                                   No |

## 4.3 Product relationship

CarePath should be presented as:

> **CarePath, powered by Juno**

or:

> **CarePath for Juno**

It should not be positioned as a replacement for Juno.

---

# 5. Goals

## 5.1 MVP goals

The MVP must allow a user to:

1. describe their current health concern
2. provide relevant health-history information
3. upload one or more medical documents
4. generate a structured medical timeline
5. identify missing or unclear information
6. receive an appropriate healthcare-navigation suggestion
7. create an appointment brief
8. create a follow-up checklist
9. see clear safety and emergency guidance

## 5.2 Product goals

* Reduce the effort required to explain medical history.
* Improve the organisation of information before consultations.
* Help patients understand possible routes through healthcare.
* Reduce missed follow-up actions.
* Give users greater clarity without overstating medical certainty.
* Extend the value of Juno’s longitudinal memory.

## 5.3 Hackathon goals

* Demonstrate a compelling end-to-end user journey.
* Use Claude for structured reasoning rather than generic chat.
* Create a visually understandable healthcare timeline.
* Show strong safety boundaries.
* Make the concept credible as a Juno product extension.
* Complete a reliable demo within the event timeframe.

---

# 6. Non-goals

The hackathon MVP will not:

* diagnose medical conditions
* recommend medication changes
* recommend specific prescription drugs
* interpret imaging as a radiologist
* replace emergency services
* guarantee the correct healthcare route
* create an official medical referral
* connect directly to NHS systems
* communicate directly with clinicians
* make autonomous appointments
* continuously monitor physiological data
* support every healthcare system globally
* act as a regulated medical device

---

# 7. Target users

## 7.1 Primary persona: chronic-condition patient

**Name:** Maya
**Age:** 34
**Situation:** Lives with chronic fatigue, migraine and recurring joint pain.

### Behaviours

* tracks symptoms inconsistently
* has several appointment letters and reports
* struggles to remember the order of events
* feels rushed during GP consultations
* frequently remembers important details after appointments

### Needs

* one clear medical timeline
* help deciding which issue to raise first
* a concise summary for the clinician
* a list of questions to ask
* a record of agreed next steps

## 7.2 Secondary persona: person with an unresolved condition

**Name:** Daniel
**Age:** 46
**Situation:** Has recurring swelling and pain following an old injury.

### Behaviours

* has seen different clinicians
* received different explanations
* has an old scan report
* does not know whether to return to a GP, physiotherapist or specialist

### Needs

* organise previous care
* identify unresolved questions
* determine a sensible next route
* prepare relevant documents

## 7.3 Tertiary persona: family caregiver

**Name:** Priya
**Age:** 52
**Situation:** Helps coordinate appointments for an elderly parent.

### Needs

* understand what has already happened
* track appointments and recommendations
* prepare questions
* avoid missing follow-ups

Caregiver access should remain outside the hackathon MVP unless time permits.

---

# 8. Jobs to be done

## Primary job

> When my medical situation feels fragmented or confusing, help me organise what has happened and understand the safest practical next step.

## Supporting jobs

> When I have an upcoming appointment, help me explain my situation clearly and use the limited time effectively.

> When I receive a medical document, explain its practical significance without pretending to diagnose me.

> When a clinician gives me several next steps, help me remember and complete them.

> When my symptoms change, help me understand whether my existing care plan may need review.

---

# 9. Core use cases

## Use case 1: Prepare for a GP appointment

The user describes a current concern and uploads previous records.

CarePath generates:

* current concern summary
* symptom chronology
* previous investigations
* current medications entered by the user
* unresolved questions
* suggested questions for the GP
* relevant documents to bring

## Use case 2: Understand the care journey

The user has spoken to several healthcare professionals.

CarePath creates a timeline showing:

* symptoms started
* GP appointment
* test ordered
* result received
* referral submitted
* specialist appointment
* outstanding follow-up

## Use case 3: Decide where to begin

The user does not know which healthcare service to contact.

CarePath provides navigation categories such as:

* emergency assistance
* urgent same-day advice
* routine primary care
* follow-up with an existing clinician
* pharmacist
* physiotherapy or allied health
* specialist discussion through a GP

The output must use cautious language and explain uncertainty.

## Use case 4: Follow up after an appointment

The user enters what happened during the appointment.

CarePath converts it into:

* actions for the patient
* actions expected from the provider
* deadlines
* symptoms to monitor
* next appointment preparation

## Use case 5: Identify information gaps

CarePath notices that the user has mentioned a scan but not provided:

* the date
* body area
* result
* clinician interpretation

The system asks for the missing information before generating the final plan.

---

# 10. Product principles

## 10.1 Navigation, not diagnosis

CarePath organises information and explains possible routes.

It must not state:

> “You have rheumatoid arthritis.”

It may state:

> “Your symptoms appear persistent and involve more than one joint. A clinician may need to review the pattern and decide whether further assessment is appropriate.”

## 10.2 Evidence before confidence

Every generated statement should be classified as:

* provided by the user
* extracted from a document
* inferred by the system
* unknown or missing

## 10.3 Visible uncertainty

The interface must distinguish between:

* established facts
* possible next steps
* missing information
* urgent warning indicators

## 10.4 Patient-controlled records

The user must be able to:

* edit extracted information
* remove incorrect information
* exclude documents
* regenerate the plan
* delete their data

## 10.5 Minimal cognitive load

Outputs should prioritise:

1. what matters now
2. what to do next
3. what to prepare
4. what remains unresolved

The user should not initially receive a long essay.

## 10.6 Safety over fluency

The system should prefer:

> “I cannot determine this safely from the information available.”

over a confident but unsupported answer.

---

# 11. MVP scope

## 11.1 P0: required features

### Authentication

* email magic-link authentication
* optional guest demo mode
* consent acknowledgement

### Patient profile

* name or preferred name
* age range
* country or healthcare region
* known conditions
* current medications
* allergies
* existing clinicians
* optional accessibility preferences

### Current concern intake

* free-text description
* symptom start date
* current severity
* change over time
* effect on daily life
* relevant previous care

### Document upload

Supported MVP formats:

* PDF
* PNG
* JPG
* plain text

### Document extraction

Extract:

* document type
* date
* provider
* symptoms
* conditions
* tests
* results
* medications
* recommendations
* follow-up actions

### Medical timeline

Display events chronologically.

Each event should show:

* date
* event type
* short description
* source
* confidence or verification status

### Missing-information review

Generate no more than five high-value clarification questions.

### Care-navigation plan

Generate:

* recommended level of care
* explanation
* alternative route
* timeframe
* uncertainty
* urgent warning signs

### Appointment brief

Generate:

* one-sentence purpose
* concise history
* major changes
* previous investigations
* current medications
* patient priorities
* five questions to ask
* relevant documents

### Follow-up checklist

Create tasks with:

* title
* owner
* target date
* status
* notes

### Safety controls

* emergency red-flag detection
* crisis guidance
* disclaimers
* no diagnosis
* no medication changes
* human confirmation before export

## 11.2 P1: desirable features

* voice intake
* ElevenLabs read-aloud mode
* downloadable PDF summary
* shareable appointment link
* Juno chat-history import simulation
* comparison between previous and current symptoms
* UK healthcare route adaptation
* progress dashboard

## 11.3 P2: future features

* NHS App integration
* GP record integration
* FHIR support
* automatic referral tracking
* appointment booking
* caregiver access
* clinician portal
* wearable integration
* medication reminders
* multilingual support
* country-specific care pathways
* automated post-appointment voice capture

---

# 12. Functional requirements

## FR-1: Create a case

The user can create a new CarePath case around one primary concern.

A case contains:

* current concern
* selected health history
* selected documents
* generated timeline
* generated plan
* appointment brief
* follow-up tasks

## FR-2: Capture current concern

The system must accept conversational free text.

Example:

> “My left ankle has been swelling after I walk for more than 20 minutes. I injured it two years ago. The swelling has become more frequent during the last three months.”

The system must structure this into:

```json
{
  "primary_concern": "Recurrent left ankle swelling",
  "onset": "Approximately two years ago",
  "recent_change": "More frequent over the last three months",
  "trigger": "Walking for more than 20 minutes",
  "associated_history": "Previous ankle injury",
  "impact": "Not specified"
}
```

## FR-3: Upload documents

The user must be able to upload multiple documents.

The interface must show:

* upload progress
* processing status
* extraction status
* errors
* delete control

## FR-4: Extract structured information

Claude must return structured JSON matching the application schema.

The extraction process must not silently convert uncertainty into facts.

Example:

```json
{
  "document_type": "MRI report",
  "document_date": "2025-07-29",
  "body_region": "Right ankle",
  "findings": [
    {
      "text": "Mild signal change in the anterior talofibular ligament",
      "certainty": "documented",
      "source_reference": "Page 1"
    }
  ],
  "recommendations": [],
  "unknown_fields": [
    "Treating clinician interpretation"
  ]
}
```

## FR-5: Verify extracted facts

Before CarePath uses extracted information, the user must be able to:

* approve
* edit
* reject
* mark as unsure

## FR-6: Build timeline

The system must combine:

* user-provided events
* document-derived events
* simulated Juno conversation events

Events must be ordered by date.

Events without exact dates should be marked:

* approximate
* month only
* year only
* unknown

## FR-7: Ask clarification questions

Claude should identify questions that materially affect navigation.

Questions should be prioritised by:

1. immediate safety
2. care-routing relevance
3. timeline completeness
4. appointment usefulness

The product should avoid asking every possible clinical question.

## FR-8: Generate navigation plan

The output must contain:

```json
{
  "recommended_route": "",
  "recommended_timeframe": "",
  "reasoning_summary": "",
  "alternative_route": "",
  "urgent_warning_signs": [],
  "information_to_prepare": [],
  "uncertainties": [],
  "disclaimer": ""
}
```

## FR-9: Generate appointment brief

The brief should fit on one screen or approximately one printed page.

The user must be able to edit all sections.

## FR-10: Create follow-up tasks

The user can convert recommendations into tasks.

Example:

* Book GP appointment.
* Locate previous MRI report.
* Record swelling photographs for seven days.
* Ask whether another assessment is appropriate.
* Check whether referral was submitted.

## FR-11: Record appointment outcome

The user can enter:

* consultation date
* clinician type
* what was discussed
* investigations ordered
* treatment discussed
* referral outcome
* follow-up timing

The system updates the timeline and checklist.

## FR-12: Export

The user can export:

* appointment brief
* timeline summary
* follow-up plan

Exported documents must include:

* generated date
* user verification notice
* non-diagnostic disclaimer
* emergency guidance

---

# 13. Non-functional requirements

## Performance

* Initial page load below three seconds on a standard connection.
* Text intake response below ten seconds where possible.
* Document extraction should provide visible processing states.
* Demo documents should process reliably within the hackathon environment.

## Reliability

* Structured outputs must validate against a schema.
* Invalid model responses must be retried or repaired.
* The application must not display raw malformed JSON.
* Every generation action must have an error state.

## Privacy

* Uploaded documents should be private by default.
* Storage buckets must not be publicly accessible.
* Signed URLs should expire.
* Logs should not contain full medical-document content.
* Demo mode should use synthetic records.

## Accessibility

* Keyboard-navigable interface.
* Sufficient contrast.
* Plain-language content.
* Avoid relying solely on colour.
* Support text enlargement.
* Read-aloud capability as a stretch goal.

## Explainability

Every recommendation should show:

* information used
* missing information
* confidence limitations
* why the suggested route was selected

---

# 14. Safety requirements

## 14.1 Emergency escalation

The system must immediately interrupt the standard flow when the user reports potential emergency indicators.

Examples include descriptions associated with:

* severe breathing difficulty
* signs of stroke
* severe chest pain
* uncontrolled bleeding
* loss of consciousness
* immediate danger
* suicidal intent or immediate self-harm risk

The system should not continue detailed navigation reasoning before displaying emergency guidance.

## 14.2 Medical boundaries

CarePath must not:

* declare a diagnosis
* rule out a serious condition
* tell a user to stop medication
* change a dosage
* guarantee that a symptom is harmless
* claim that an appointment is unnecessary
* fabricate referral requirements

## 14.3 Appropriate language

Avoid:

> “This is probably nothing serious.”

Use:

> “The available information is insufficient to determine the cause. Because the symptom is persistent, a healthcare professional should review it.”

Avoid:

> “You need an MRI.”

Use:

> “A clinician can decide whether examination or further investigation is appropriate.”

## 14.4 Route categories

The system should use bounded route classifications:

```text
EMERGENCY_NOW
URGENT_SAME_DAY
PROMPT_CLINICAL_REVIEW
ROUTINE_APPOINTMENT
EXISTING_CARE_TEAM_FOLLOW_UP
SELF_MANAGEMENT_WITH_MONITORING
INSUFFICIENT_INFORMATION
```

The MVP should favour escalation when uncertainty and potential severity are high.

## 14.5 Human confirmation

Before an appointment brief is downloaded or shared, the user must confirm:

> “I have reviewed this summary and corrected any inaccurate information.”

---

# 15. Information architecture

## Primary navigation

```text
Home
├── Start a CarePath
├── My CarePaths
├── Health Timeline
├── Documents
└── Profile
```

## Case navigation

```text
Case Overview
├── Current Concern
├── Timeline
├── Missing Information
├── Recommended Path
├── Appointment Brief
└── Follow-up
```

---

# 16. End-to-end user journey

## Stage 1: Entry

### User goal

Understand what CarePath does.

### Screen

Landing page.

### Content

**Headline**

> Turn your health history into a clear next step.

**Supporting copy**

> CarePath organises your symptoms, documents and previous care into a timeline, appointment brief and follow-up plan.

**Primary action**

> Start my CarePath

**Secondary action**

> View example

### Trust elements

* Does not diagnose.
* You control what is included.
* Review all generated information before sharing.
* Seek emergency assistance for urgent symptoms.

---

## Stage 2: Consent and safety

### User actions

The user acknowledges:

* CarePath provides informational navigation support.
* It does not replace a healthcare professional.
* Emergency symptoms require emergency services.
* AI-generated information may contain errors.
* The user must review generated summaries.

### Result

Consent record is stored.

---

## Stage 3: Profile setup

### Questions

* What should we call you?
* Which country are you receiving healthcare in?
* Which conditions have you been diagnosed with?
* Which medications are you taking?
* Do you have known allergies?
* Which healthcare professionals are already involved?

### Design rule

Every question must support:

* Skip
* I do not know
* Prefer not to say

---

## Stage 4: Describe current concern

### Prompt

> What is happening, and what are you trying to understand or do next?

### Example input

> “My ankle has started swelling again after walking. I had an injury two years ago and an MRI last year, but I do not know whether I should see my GP, a physiotherapist or someone else.”

### Optional guided fields

* When did it begin?
* Has it changed?
* What makes it better or worse?
* How does it affect daily life?
* Have you already received care for it?

### System action

Run emergency and safety classification.

### Branch A: emergency concern

Show escalation instructions and stop the normal flow.

### Branch B: non-emergency concern

Continue to record collection.

---

## Stage 5: Add health information

### User options

* Connect Juno history.
* Upload documents.
* Add events manually.
* Continue with current concern only.

For the hackathon, “Connect Juno history” can load a synthetic conversation dataset.

### Document examples

* test result
* scan report
* discharge letter
* referral
* prescription
* clinician letter

---

## Stage 6: Extraction review

### Screen structure

**Document:** Ankle MRI report
**Date:** 29 July 2025

Extracted information:

* MRI of right ankle
* previous ligament-related changes
* bone-marrow contusion documented
* no treatment recommendation found

### User actions

* Confirm
* Edit
* Remove
* Mark as unclear

### Product rule

CarePath cannot build the final pathway from unreviewed extraction without visibly labelling it as unverified.

---

## Stage 7: Timeline generation

### Timeline example

```text
March 2024
Initial ankle injury
Source: User

July 2025
MRI performed
Source: Uploaded MRI report

August 2025
Physiotherapy discussed
Source: Juno conversation

May 2026
Swelling returned after longer walks
Source: User

July 2026
Swelling occurring more frequently
Source: Current concern
```

### User actions

* Add event
* Edit event
* Exclude event
* Mark event unresolved

---

## Stage 8: Missing-information questions

### Example questions

1. Is the swelling in the same ankle as the previous injury?
2. Is the area red, hot or suddenly more painful?
3. Can you place weight on the ankle?
4. Have you seen a clinician since the MRI?
5. What advice or treatment did you receive after the scan?

### Design rule

Ask only questions that change:

* safety classification
* route recommendation
* appointment preparation

---

## Stage 9: CarePath generation

### Output structure

#### Recommended next step

> Arrange a GP or existing musculoskeletal clinician review.

#### Suggested timing

> Prompt routine appointment, earlier if symptoms worsen.

#### Why this route was selected

> The swelling is recurrent, follows a previous injury and has become more frequent. A clinician can assess whether the previous injury, another musculoskeletal problem or another cause requires further investigation.

#### What to prepare

* MRI report
* date symptoms returned
* photographs of swelling
* activities that trigger symptoms
* previous treatment attempted

#### Alternative route

> Where locally available, a musculoskeletal first-contact physiotherapist may also be an appropriate entry point. Access rules differ by area.

#### Seek urgent help if

* severe sudden swelling
* inability to bear weight after a new injury
* marked redness or heat with fever
* chest pain or breathing difficulty
* rapidly worsening symptoms

#### Uncertainty

> CarePath cannot determine the cause from the supplied information.

---

## Stage 10: Appointment-brief creation

### Appointment brief

**Reason for appointment**

Recurring ankle swelling following a previous injury, with increasing frequency during the last three months.

**Relevant history**

* Previous ankle injury approximately two years ago.
* MRI completed in July 2025.
* Swelling occurs after approximately 20 minutes of walking.
* Frequency has increased.

**What has changed**

The swelling now occurs more frequently and affects walking tolerance.

**Relevant documents**

* MRI report dated 29 July 2025.

**Patient priorities**

1. Understand why the swelling keeps returning.
2. Determine whether further assessment is needed.
3. Establish a safe activity and rehabilitation plan.

**Questions to ask**

1. Could the current swelling be related to the previous injury?
2. Is a physical examination or further investigation appropriate?
3. Would physiotherapy or another specialist assessment be suitable?
4. Which symptoms should trigger urgent review?
5. What activity level is appropriate while waiting?

---

## Stage 11: After-appointment update

### Prompt

> What happened during the appointment?

### User can

* type a summary
* paste notes
* upload a letter
* record a voice note

### System output

```text
Completed
✓ GP appointment attended

Waiting for provider
○ Physiotherapy referral

Your actions
○ Book blood test
○ Record symptoms for two weeks

Review date
○ Reassess if no referral update by 15 August
```

---

# 17. User-flow diagram

```text
Landing page
      ↓
Consent and safety acknowledgement
      ↓
Create or select profile
      ↓
Describe current concern
      ↓
Emergency-safety classifier
      ├── Emergency detected
      │       ↓
      │   Immediate escalation screen
      │       ↓
      │   End standard flow
      │
      └── No immediate emergency detected
              ↓
        Add information
        ├── Juno history
        ├── Upload documents
        └── Manual events
              ↓
        Extract structured facts
              ↓
        User verifies extracted facts
              ↓
        Generate medical timeline
              ↓
        Ask high-value clarification questions
              ↓
        Generate CarePath
              ↓
        User reviews and edits
              ↓
        Generate appointment brief
              ↓
        Export or use during appointment
              ↓
        Record appointment outcome
              ↓
        Generate follow-up checklist
              ↓
        Update longitudinal timeline
```

---

# 18. Screen inventory

## Screen 1: Landing page

Components:

* headline
* explanation
* start button
* example case
* safety disclaimer

## Screen 2: Consent

Components:

* informational-use acknowledgement
* emergency warning
* privacy acknowledgement
* continue button

## Screen 3: Profile

Components:

* basic information
* conditions
* medications
* allergies
* existing care team

## Screen 4: Current concern

Components:

* free-text input
* guided fields
* severity selector
* submit button

## Screen 5: Safety escalation

Components:

* urgent message
* appropriate emergency direction
* location-sensitive service placeholder
* return control for non-emergency correction

## Screen 6: Add records

Components:

* Juno import
* document upload
* manual event
* skip option

## Screen 7: Extraction review

Components:

* document preview
* extracted fields
* confidence labels
* edit controls
* approve button

## Screen 8: Timeline

Components:

* chronological events
* filters
* source indicators
* verification state
* unresolved markers

## Screen 9: Clarification

Components:

* one question at a time
* multiple choice where suitable
* free-text option
* skip option

## Screen 10: Recommended path

Components:

* next-step card
* timeframe
* reasoning
* alternative route
* warning signs
* uncertainty

## Screen 11: Appointment brief

Components:

* editable sections
* regenerate control
* verification checkbox
* export control

## Screen 12: Follow-up tracker

Components:

* actions
* owner
* target dates
* statuses
* update appointment button

---

# 19. Technical architecture

## 19.1 Proposed stack

### Front end

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui
* React Hook Form
* Zod

### Backend

* Next.js server actions or API routes
* Supabase Postgres
* Supabase Auth
* Supabase Storage
* Supabase Row Level Security
* Anthropic API

### Optional

* ElevenLabs for voice output
* browser speech recognition for voice input
* PDF generation library
* Sentry for error tracking

## 19.2 Architecture diagram

```text
User
  ↓
Next.js web application
  ↓
Authentication and case management
  ↓
Supabase
├── Postgres
├── Auth
└── Private document storage
  ↓
Application orchestration layer
├── Safety classifier
├── Document extraction
├── Timeline builder
├── Gap-question generator
├── Navigation-plan generator
└── Appointment-brief generator
  ↓
Anthropic Claude API
  ↓
Structured JSON responses
  ↓
Schema validation
  ↓
User review interface
```

## 19.3 Model usage

Use separate model calls for separate tasks.

Do not send one broad prompt asking Claude to perform the entire workflow.

### Call 1: safety classification

Input:

* current concern
* relevant profile information

Output:

* route category
* emergency flag
* explanation
* confidence
* required escalation text

### Call 2: document extraction

Input:

* document text or supported document content

Output:

* structured medical events
* findings
* recommendations
* unknowns

### Call 3: timeline normalisation

Input:

* verified extracted events
* user-entered events
* Juno-history events

Output:

* normalised chronological timeline
* contradictions
* duplicates

### Call 4: clarification generation

Input:

* current concern
* timeline
* missing fields

Output:

* maximum five prioritised questions

### Call 5: pathway generation

Input:

* verified timeline
* clarification answers
* country
* safety classification

Output:

* bounded route
* timeframe
* explanation
* preparation list
* alternative
* warning signs
* uncertainty

### Call 6: appointment brief

Input:

* verified care plan and timeline

Output:

* concise one-page appointment brief

---

# 20. Suggested database schema

## profiles

```sql
id uuid primary key
user_id uuid
preferred_name text
age_range text
country_code text
healthcare_region text
known_conditions jsonb
medications jsonb
allergies jsonb
care_team jsonb
created_at timestamptz
updated_at timestamptz
```

## cases

```sql
id uuid primary key
user_id uuid
profile_id uuid
title text
primary_concern text
status text
safety_status text
recommended_route text
created_at timestamptz
updated_at timestamptz
```

## documents

```sql
id uuid primary key
case_id uuid
user_id uuid
storage_path text
file_name text
mime_type text
processing_status text
document_type text
document_date date
extraction jsonb
verification_status text
created_at timestamptz
```

## timeline_events

```sql
id uuid primary key
case_id uuid
event_date date
date_precision text
event_type text
title text
description text
source_type text
source_id uuid
verification_status text
confidence text
metadata jsonb
created_at timestamptz
updated_at timestamptz
```

## clarification_questions

```sql
id uuid primary key
case_id uuid
question text
priority integer
reason text
answer jsonb
status text
created_at timestamptz
```

## care_plans

```sql
id uuid primary key
case_id uuid
route_category text
recommended_timeframe text
reasoning_summary text
alternative_route text
warning_signs jsonb
preparation_items jsonb
uncertainties jsonb
model_version text
prompt_version text
created_at timestamptz
```

## appointment_briefs

```sql
id uuid primary key
case_id uuid
purpose text
history_summary text
changes_summary text
investigations jsonb
medications jsonb
patient_priorities jsonb
questions jsonb
documents_to_bring jsonb
user_verified boolean
created_at timestamptz
updated_at timestamptz
```

## follow_up_tasks

```sql
id uuid primary key
case_id uuid
title text
description text
owner text
target_date date
status text
source text
created_at timestamptz
updated_at timestamptz
```

## consent_records

```sql
id uuid primary key
user_id uuid
consent_version text
accepted_at timestamptz
```

## generation_logs

Store only operational metadata.

```sql
id uuid primary key
user_id uuid
case_id uuid
task_type text
model_name text
prompt_version text
latency_ms integer
success boolean
error_code text
created_at timestamptz
```

Do not store full medical prompts in general application logs.

---

# 21. API design

## Create case

```http
POST /api/cases
```

```json
{
  "profileId": "uuid",
  "primaryConcern": "Recurring ankle swelling after walking"
}
```

## Safety classification

```http
POST /api/cases/:caseId/safety-check
```

Response:

```json
{
  "category": "PROMPT_CLINICAL_REVIEW",
  "emergency": false,
  "reason": "Persistent and worsening recurrent symptom",
  "warningSigns": [
    "Sudden severe swelling",
    "Marked redness or fever",
    "Chest pain or breathing difficulty"
  ]
}
```

## Upload document

```http
POST /api/cases/:caseId/documents
```

## Extract document

```http
POST /api/documents/:documentId/extract
```

## Verify extraction

```http
PATCH /api/documents/:documentId/verification
```

## Generate timeline

```http
POST /api/cases/:caseId/timeline/generate
```

## Generate clarification questions

```http
POST /api/cases/:caseId/questions/generate
```

## Submit answers

```http
POST /api/cases/:caseId/questions/answer
```

## Generate CarePath

```http
POST /api/cases/:caseId/care-path/generate
```

## Generate appointment brief

```http
POST /api/cases/:caseId/appointment-brief/generate
```

## Create follow-up task

```http
POST /api/cases/:caseId/tasks
```

---

# 22. Prompt architecture

## 22.1 System prompt principles

The system prompt should establish:

* role as healthcare-navigation assistant
* non-diagnostic boundary
* requirement to distinguish facts from inference
* use of bounded route categories
* requirement to show uncertainty
* emergency escalation rules
* prohibition on medication changes
* use of plain language
* structured JSON-only response

## 22.2 Care-path prompt outline

```text
You are a healthcare-navigation assistant.

Your task is to help the user organise their information and identify an appropriate next healthcare route.

You must not:
- diagnose a condition
- recommend prescription treatment
- tell the user to stop or change medication
- claim that a serious condition has been excluded
- fabricate local healthcare rules

Use only:
- facts provided by the user
- verified document information
- clearly labelled inference

Select exactly one primary route category from:
EMERGENCY_NOW
URGENT_SAME_DAY
PROMPT_CLINICAL_REVIEW
ROUTINE_APPOINTMENT
EXISTING_CARE_TEAM_FOLLOW_UP
SELF_MANAGEMENT_WITH_MONITORING
INSUFFICIENT_INFORMATION

Return valid JSON matching the supplied schema.
```

## 22.3 Extraction prompt rule

The model must copy clinical terms accurately when extracting them, but explain them separately in plain language.

It should not replace:

> “Posterior talofibular ligament hyperintensity”

with:

> “Severe ligament damage”

unless the source explicitly states that interpretation.

---

# 23. Structured-output schemas

## Safety output

```typescript
const SafetySchema = z.object({
  category: z.enum([
    "EMERGENCY_NOW",
    "URGENT_SAME_DAY",
    "PROMPT_CLINICAL_REVIEW",
    "ROUTINE_APPOINTMENT",
    "EXISTING_CARE_TEAM_FOLLOW_UP",
    "SELF_MANAGEMENT_WITH_MONITORING",
    "INSUFFICIENT_INFORMATION"
  ]),
  emergency: z.boolean(),
  reasons: z.array(z.string()),
  warningSigns: z.array(z.string()),
  uncertainty: z.string()
});
```

## Timeline event

```typescript
const TimelineEventSchema = z.object({
  eventDate: z.string().nullable(),
  datePrecision: z.enum([
    "exact",
    "month",
    "year",
    "approximate",
    "unknown"
  ]),
  eventType: z.enum([
    "symptom",
    "appointment",
    "diagnosis",
    "test",
    "result",
    "medication",
    "referral",
    "treatment",
    "follow_up",
    "other"
  ]),
  title: z.string(),
  description: z.string(),
  sourceType: z.enum([
    "user",
    "document",
    "juno_history",
    "model_inference"
  ]),
  verificationStatus: z.enum([
    "verified",
    "unverified",
    "rejected"
  ])
});
```

## Care-plan output

```typescript
const CarePlanSchema = z.object({
  primaryRoute: z.string(),
  timeframe: z.string(),
  reasoningSummary: z.string(),
  preparationItems: z.array(z.string()),
  alternativeRoute: z.string().nullable(),
  urgentWarningSigns: z.array(z.string()),
  uncertainties: z.array(z.string()),
  sourceEventIds: z.array(z.string())
});
```

---

# 24. Basic implementation plan

## Phase 1: foundation

### Tasks

* Initialise Next.js project.
* Configure TypeScript.
* Install Tailwind and UI components.
* Create Supabase project.
* Configure authentication.
* Create database tables.
* Enable row-level security.
* Create private document-storage bucket.
* Add environment variables.
* Build shared page layout.

### Completion criteria

* User can sign in.
* User can create a profile.
* User can create and view a case.

---

## Phase 2: concern intake and safety

### Tasks

* Build concern-intake form.
* Add guided optional questions.
* Create safety-classifier API route.
* Define Zod output schema.
* Create emergency-interruption screen.
* Add response logging without medical content.

### Completion criteria

* Current concern can be submitted.
* Valid structured safety response is returned.
* Emergency test cases trigger the escalation screen.
* Non-emergency cases continue to the upload flow.

---

## Phase 3: document processing

### Tasks

* Build multi-file upload.
* Store files privately in Supabase.
* Extract document content.
* Send document content to Claude.
* Validate extracted JSON.
* Store extraction.
* Build extraction-review interface.

### Completion criteria

* Demo PDF uploads successfully.
* Major events are extracted.
* User can edit and approve extracted information.
* Approved information becomes timeline events.

---

## Phase 4: timeline

### Tasks

* Build event schema.
* Create manual-event form.
* Load synthetic Juno history.
* Merge user, document and Juno events.
* Add duplicate detection.
* Build vertical timeline UI.
* Add verification and source labels.

### Completion criteria

* At least three source types appear on one timeline.
* Events are correctly ordered.
* Approximate dates are visibly marked.
* User can edit or exclude events.

---

## Phase 5: clarification and CarePath

### Tasks

* Create gap-analysis prompt.
* Limit generated questions to five.
* Build one-question-at-a-time interface.
* Create care-path generation prompt.
* Validate response schema.
* Build recommendation screen.
* Show evidence and uncertainty.

### Completion criteria

* Questions are generated from missing information.
* Answers are saved.
* One structured pathway is generated.
* Recommendation includes timeframe, preparation and warning signs.

---

## Phase 6: appointment brief and follow-up

### Tasks

* Generate one-page brief.
* Build editable brief interface.
* Add user-verification checkbox.
* Add browser-print or PDF export.
* Create follow-up-task model.
* Create post-appointment update flow.

### Completion criteria

* User can generate and edit an appointment brief.
* User can export it.
* User can add an appointment outcome.
* System produces a follow-up checklist.

---

## Phase 7: testing and demo preparation

### Tasks

* Create synthetic patient case.
* Create synthetic MRI or clinician letter.
* Test emergency scenarios.
* Test malformed-model responses.
* Test empty-state scenarios.
* Add seeded demo account.
* Preprocess demo documents as fallback.
* Record backup demo video.

### Completion criteria

* Main demo completes in under four minutes.
* No step depends on manually changing database records.
* AI calls have loading and failure states.
* A cached demo response exists if an external API fails.

---

# 25. Hackathon build schedule

## First four hours

* Confirm product scope.
* Create repository.
* Configure Supabase.
* Build basic layout.
* Implement profile and concern intake.
* Define schemas and prompts.

## Hours 4–10

* Implement Anthropic API integration.
* Build safety classification.
* Build document upload.
* Create synthetic records.
* Implement extraction.

## Hours 10–16

* Build extraction verification.
* Build timeline.
* Add synthetic Juno-history import.
* Implement clarification questions.

## Hours 16–22

* Generate CarePath.
* Build recommendation screen.
* Generate appointment brief.
* Add editing and export.

## Hours 22–28

* Add follow-up tasks.
* Improve interface.
* Test edge cases.
* Add safety language.
* Add loading and failure states.

## Final hours

* Freeze new features.
* Polish primary user journey.
* Create demo data.
* Rehearse pitch.
* Prepare backup recording.
* Verify deployment.

---

# 26. Team allocation

## One-person team

Prioritise:

1. current concern
2. synthetic Juno history
3. one document upload
4. timeline
5. CarePath
6. appointment brief

Remove:

* authentication if necessary
* voice
* PDF generation
* post-appointment flow
* caregiver features

## Two-person team

### Builder 1

* backend
* Supabase
* Anthropic calls
* structured outputs
* document processing
* safety logic

### Builder 2

* UX
* forms
* timeline
* recommendation view
* appointment brief
* demo design

## Three-person team

### Product/front end

Owns journey, UI and demo.

### AI/backend

Owns prompts, extraction and orchestration.

### Safety/data

Owns test cases, evaluation, synthetic data and safety controls.

---

# 27. MVP prioritisation

| Feature                 | Priority | Demo importance | Complexity |
| ----------------------- | -------: | --------------: | ---------: |
| Current concern input   |       P0 |            High |        Low |
| Safety classifier       |       P0 |            High |     Medium |
| Synthetic Juno import   |       P0 |            High |        Low |
| One-document upload     |       P0 |            High |     Medium |
| Structured extraction   |       P0 |            High |     Medium |
| Timeline                |       P0 |       Very high |     Medium |
| Clarification questions |       P0 |          Medium |     Medium |
| Care route              |       P0 |       Very high |     Medium |
| Appointment brief       |       P0 |       Very high |     Medium |
| Follow-up checklist     |       P1 |          Medium |        Low |
| PDF export              |       P1 |          Medium |     Medium |
| Voice                   |       P2 |             Low |     Medium |
| Live NHS integration    | Excluded |             Low |  Very high |

---

# 28. Synthetic demo dataset

## Patient

**Name:** Alex Morgan
**Age:** 38
**Location:** United Kingdom

## Known history

* Previous right-ankle injury.
* Recurring swelling after walking.
* MRI completed in July 2025.
* Physiotherapy attempted briefly.
* Symptoms became more frequent in June 2026.

## Synthetic Juno entries

### 12 May 2026

> “My ankle was swollen again after walking around town.”

### 29 May 2026

> “It settled by the morning, but this keeps happening.”

### 18 June 2026

> “I stopped walking after 15 minutes because it felt tight.”

### 7 July 2026

> “I do not know whether I should go back to the GP or try physiotherapy again.”

## Synthetic uploaded letter

```text
Musculoskeletal Imaging Report

Date: 29 July 2025

Clinical history:
Persistent right ankle discomfort following previous inversion injury.

Findings:
Mild signal alteration involving the anterior talofibular ligament.
Small joint effusion.
No acute fracture identified.

Recommendation:
Clinical correlation advised.
```

## Expected CarePath output

* Route: prompt clinical review through GP or existing musculoskeletal service.
* Timeframe: routine but timely appointment.
* Prepare: report, symptom chronology, triggers and previous physiotherapy details.
* Questions: whether reassessment or renewed rehabilitation is suitable.
* Warning signs: sudden severe swelling, redness and fever, inability to bear weight, chest pain or breathing difficulty.

---

# 29. Evaluation framework

## 29.1 Safety evaluation

Create at least 20 test cases covering:

* emergency symptoms
* urgent symptoms
* routine concerns
* medication questions
* ambiguous descriptions
* incomplete history
* contradictory documents

## 29.2 Extraction evaluation

Measure whether the system correctly extracts:

* dates
* document type
* condition names
* tests
* results
* recommendations
* follow-up requirements

## 29.3 Hallucination evaluation

Check whether the model introduces:

* diagnoses not in the source
* medications not mentioned
* test recommendations presented as requirements
* fabricated dates
* fabricated local services

## 29.4 Usability evaluation

Ask test users to complete:

1. submit concern
2. upload record
3. verify extraction
4. read timeline
5. find next step
6. generate brief

Observe:

* points of confusion
* completion time
* misunderstood recommendations
* whether safety warnings are visible

## 29.5 Quality rubric

Score outputs from one to five on:

| Dimension         | Definition                         |
| ----------------- | ---------------------------------- |
| Factual grounding | Uses only supplied information     |
| Safety            | Avoids diagnosis and unsafe advice |
| Relevance         | Focuses on the current concern     |
| Clarity           | Uses understandable language       |
| Actionability     | Produces practical next steps      |
| Transparency      | Shows uncertainty and sources      |
| Brevity           | Avoids unnecessary detail          |

---

# 30. Success metrics

## Hackathon success

* Complete demonstration without manual intervention.
* Generate a timeline from at least three data sources.
* Generate a safe and structured CarePath.
* Produce an editable appointment brief.
* Clearly distinguish facts, uncertainty and recommendations.
* Demonstrate one emergency-interruption scenario.

## Product success metrics

### Activation

* Percentage of users who complete their first CarePath.
* Percentage who upload or add at least one historical record.
* Percentage who verify generated information.

### Utility

* Percentage who generate an appointment brief.
* Percentage who complete at least one follow-up task.
* Self-reported increase in appointment preparedness.
* Self-reported reduction in confusion about next steps.

### Quality

* Extraction correction rate.
* Unsupported-claim rate.
* Emergency-classification recall.
* Care-path regeneration rate.
* Percentage of briefs edited before sharing.

### Retention

* Users returning after an appointment.
* Users updating their timeline.
* Users creating a second CarePath.

---

# 31. Risks and mitigations

## Risk 1: The product appears to diagnose

### Mitigation

* Use bounded navigation categories.
* Avoid disease labels unless already documented.
* Show uncertainty.
* Use clinician-review language.
* Perform output moderation.

## Risk 2: Wrong urgency classification

### Mitigation

* Create deterministic emergency keyword checks alongside Claude.
* Default toward escalation where serious uncertainty exists.
* Display warning signs on every plan.
* Test high-risk scenarios.

## Risk 3: Inaccurate document extraction

### Mitigation

* Require user verification.
* Preserve source text.
* Link timeline events to source documents.
* Mark uncertain fields.
* Never hide extraction confidence.

## Risk 4: Too much overlap with Juno

### Mitigation

Position CarePath as the transition between:

```text
Juno’s longitudinal support
          ↓
CarePath’s structured action plan
          ↓
Real-world healthcare appointment
```

## Risk 5: Too much scope

### Mitigation

The hackathon demo should use:

* one user
* one concern
* one synthetic Juno history
* one document
* one care-path output
* one appointment brief

## Risk 6: External API failure

### Mitigation

* Cache demo results.
* Store seeded synthetic extraction.
* Add retry handling.
* Prepare a recorded backup.

## Risk 7: Privacy concerns

### Mitigation

* Use synthetic demo data.
* Use private storage.
* Avoid storing sensitive data in logs.
* Provide delete controls.
* Clearly explain data use.

---

# 32. Demo script

## Scene 1: The problem

> Alex has lived with recurring ankle swelling for two years. The relevant information is scattered across conversations, an MRI report and memory. Alex does not know what to do next.

## Scene 2: Juno history

Display several historical Juno entries showing the symptom becoming more frequent.

## Scene 3: Upload

Upload the synthetic imaging report.

Claude extracts:

* date
* previous injury
* findings
* recommendation

Alex confirms the information.

## Scene 4: Timeline

Display the unified timeline.

Highlight:

* initial injury
* imaging
* attempted physiotherapy
* symptom recurrence
* recent worsening

## Scene 5: Missing information

CarePath asks:

> “Did you receive any follow-up after the MRI?”

Alex answers:

> “No, I was told to rest and return if it continued.”

## Scene 6: CarePath

Display:

* suggested route
* timing
* why
* what to prepare
* warning signs
* uncertainty

## Scene 7: Appointment brief

Generate a one-page summary.

## Scene 8: Product vision

> Juno helps patients capture and understand the lived experience of chronic illness. CarePath turns that history into the next practical step through healthcare.

---

# 33. Pitch structure

## Problem

People with chronic illness carry the burden of assembling their fragmented medical history and deciding what to do next.

## Existing value

Juno already helps users track symptoms, identify patterns and feel supported between appointments.

## Product

CarePath transforms that longitudinal history into:

* a medical timeline
* a care-navigation plan
* an appointment brief
* a follow-up checklist

## Differentiation

It is not another symptom checker.

It is the bridge between daily health experience and real-world healthcare action.

## Demonstration

Show one complete patient journey.

## Future

CarePath can become a navigation layer connecting:

* patient-generated history
* clinical records
* appointment preparation
* referrals
* ongoing follow-up

---

# 34. One-line descriptions

## Product tagline

> From health history to the right next step.

## Clear description

> CarePath converts your symptoms, medical documents and previous care into a structured timeline, appointment brief and follow-up plan.

## Juno integration description

> Juno remembers what you have been going through. CarePath helps you act on it.

## Judge-facing description

> CarePath is an AI healthcare-navigation layer for Juno that transforms longitudinal patient history into a safe, evidence-linked care pathway.

---

# 35. Final MVP definition

The hackathon MVP is complete when a user can:

1. enter a current concern
2. load a synthetic Juno history
3. upload one medical document
4. confirm the extracted information
5. view a combined medical timeline
6. answer clarification questions
7. receive a safe navigation recommendation
8. generate an editable appointment brief

Everything beyond this is optional.

The central product experience is:

```text
Juno remembers
      ↓
CarePath organises
      ↓
The patient prepares
      ↓
The clinician decides
```
