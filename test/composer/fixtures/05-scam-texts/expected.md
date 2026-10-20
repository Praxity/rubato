# Expected: scam text messages

## Behaviour
When a text asks them to tap a link, call a number or pay, the learner stops and contacts the sender through a number they already have before doing anything.

## Barriers and choices
| Barrier | Category | Expected choice | Why |
| --- | --- | --- | --- |
| Scam texts look official and urgent | skill (noticing) | `hotspot` on an image of a text, or `scenario` or `knowledge-check` on sample texts | Learners practise spotting the signs; `highlight` is the planned best fit |
| Embarrassed to say they aren't sure, so they guess | motivation | `dont-know` | Saying "I don't know" is the safe move here too |
| Forget within weeks; no one to ask; no internet at home | knowledge, environment | `retrieval-sheet` printed to take home; `action-plan` | Works on paper; an if-then plan for the moment a text arrives |

Also fits: `checklist` (printed card), `worked-example`, `dialogue-branching`, `flashcards`.

Doesn't fit: `write-distractors`, `check-first`, `self-check`, `final-check` (no record asked for).

## Must ask or flag
- French register; *vous* is the likely choice for older adults.
- No one to ask after the workshop: suggest a fix outside the course, such as a library help line or drop-in hour.
- The retrieval sheet sends no reminder.
- Large print and reading range: the printed sheet and card in large type.
- The course runs in the workshop on library laptops; Pages output.

```json
{
  "required": [["dont-know"], ["retrieval-sheet"], ["hotspot", "scenario", "knowledge-check"]],
  "allowed": ["action-plan", "checklist", "worked-example", "dialogue-branching", "flashcards"],
  "forbidden": ["write-distractors", "check-first", "test-out", "self-check", "final-check"],
  "environment": ["no one to ask after the workshop"],
  "mustAsk": ["French register"],
  "records": "none",
  "output": "pages",
  "languages": ["en", "fr"]
}
```
