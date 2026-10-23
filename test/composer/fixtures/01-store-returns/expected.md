# Expected: returns without a receipt

## Behaviour
When a customer brings back an item without a receipt, the cashier gives store credit within the current limits, scans ID from $30 to $150, and calls a manager over $150 or for any power tool, without giving cash.

## Barriers and choices
| Barrier | Category | Expected choice | Why |
| --- | --- | --- | --- |
| Forgets three thresholds; the task comes up twice a month | knowledge | `knowledge-check`, `flashcards`, `dont-know` or `checklist` | Short facts to recall; a counter card works because the cashier can glance at it |
| New cashiers give in when customers push | skill or motivation | `dialogue-branching` or `scenario` | The hard moment is a conversation; wrong replies are tempting |
| Till screen shows last year's limits | environment | Fix outside the course | It contradicts the course. IT must fix it before launch, or the course must say the screen is wrong |

Also fits: `sort` (sort returns into the three tiers), `worked-example`, `action-plan`, `retrieval-sheet`.

Doesn't fit: `check-first` and `test-out` (first-year staff), `self-check` and `first-answer` (no written work), `write-distractors` (novices), `final-check` (the brief asks only who finished).

## Must ask or flag
- The till screen contradicts the policy. Ask whether IT will fix it before launch.
- "Who finished" is completion, not skill. Suggest a better signal, such as a manager watching the next no-receipt return.
- Lessons fit a 10-minute phone sitting. Pages output, since branching needs rules.

```json
{
  "required": [["dialogue-branching", "scenario"], ["knowledge-check", "flashcards", "dont-know", "checklist"]],
  "allowed": ["sort", "worked-example", "action-plan", "retrieval-sheet"],
  "forbidden": ["check-first", "test-out", "self-check", "first-answer", "write-distractors", "final-check"],
  "environment": ["till or point-of-sale screen shows old limits"],
  "mustAsk": ["whether the screen is fixed before launch"],
  "records": "completion only; flag that it is not competence",
  "output": "pages"
}
```
