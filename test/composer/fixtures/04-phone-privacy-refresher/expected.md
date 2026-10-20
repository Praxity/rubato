# Expected: phone privacy refresher

## Behaviour
When a caller asks about a patient, front-desk staff confirm the caller's identity before sharing anything, and share nothing with a family member or employer unless the patient's file records consent.

## Barriers and choices
| Barrier | Category | Expected choice | Why |
| --- | --- | --- | --- |
| Experienced staff know the basics and are bored | motivation | `check-first` (`test-out` is the planned best fit) | Most already know it; the record needed is a pass, not every page seen |
| Worried family member or official-sounding HR caller | skill or motivation | `dialogue-branching` or `scenario` | The hard moment is a conversation under pressure |
| New hires don't know where the consent field is | knowledge, partly environment | `hotspot` on a screenshot, `worked-example` or `checklist` | Spotting a field on a screen; a desk card helps too |
| Privacy officer needs a pass | record | `final-check` | Asked for in the brief |

Also fits: `knowledge-check`, `dont-know` in practice, `action-plan`.

Doesn't fit: `self-check`, `write-distractors`, `first-answer`, `retrieval-sheet`.

## Must ask or flag
- `test-out` is planned; use `check-first`.
- The identity-check steps and consent rules need a source, and privacy law content needs an expert check.
- A screenshot of the patient file, or a description of the consent field.
- A passed check is not phone behaviour. Suggest a supervisor listening to calls or a mystery-caller check.
- Interruptions: short sections that keep progress.

```json
{
  "required": [["check-first"], ["dialogue-branching", "scenario"], ["final-check"]],
  "allowed": ["knowledge-check", "dont-know", "hotspot", "worked-example", "checklist", "action-plan"],
  "forbidden": ["test-out", "self-check", "write-distractors", "first-answer", "retrieval-sheet"],
  "environment": ["consent field hard to find in the patient file"],
  "mustAsk": ["source for identity-check steps", "expert check of privacy rules", "screenshot of the patient file"],
  "records": "final check pass; flag that it is not behaviour",
  "output": "pages"
}
```
