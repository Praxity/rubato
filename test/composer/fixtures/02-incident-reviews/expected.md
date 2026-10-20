# Expected: blameless incident reviews

## Behaviour
When writing an incident review, the engineer writes the summary and contributing-factors sections about system conditions and concrete follow-ups, with no person named as the cause.

## Barriers and choices
| Barrier | Category | Expected choice | Why |
| --- | --- | --- | --- |
| Habit: "X did Y" is the quickest sentence | skill | `self-check` | Learners write a section and check it against clear parts |
| No clear picture of a good contributing-factors section | knowledge | `worked-example` (weak beside strong, from their anonymised reviews) | They need a model before writing |
| Blameless read as vague | knowledge | `self-check` criteria for concreteness, `sort` or `knowledge-check` on example sentences | Separates blameless from vague |

Also fits: `action-plan`, `knowledge-check`, `sort`, `dont-know`, `hotspot`.

Best fits that are planned: `first-answer` (rewrite a past review at the start and compare at the end; fallback `self-check`), `highlight` (mark blaming phrases in a weak review; fallback a multiple-answer choice or `hotspot`).

Doesn't fit: `final-check` (no scores wanted), `retrieval-sheet`, `flashcards`, `check-first`.

## Must ask or flag
- Confirm the three past reviews are anonymised and cleared for use.
- The behaviour evidence is the team lead reading each person's next real review. Say so under Records.
- One 30-minute sitting.

```json
{
  "required": [["self-check"], ["worked-example"]],
  "allowed": ["sort", "knowledge-check", "action-plan", "dont-know", "hotspot"],
  "forbidden": ["final-check", "check-first", "test-out", "retrieval-sheet", "flashcards"],
  "environment": [],
  "mustAsk": ["the example reviews are anonymised and cleared"],
  "records": "none in the course; team lead reviews the next real review",
  "output": "pages or guided"
}
```
