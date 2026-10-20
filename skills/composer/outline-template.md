# Outline template

Copy this into `outline.md` beside the course's `course.yaml`. The person reads the prose sections. The Selection section holds only a JSON block; keep its keys exactly as shown so the selection scorer can parse it.

```markdown
# <Course title>: outline

## Status
Draft. Blocking reasons: <each specific unresolved source, expert, bank or review issue>.

## Brief
- Audience and reading level:
- Where and when they will do the behaviour:
- Time per sitting, device, connection:
- Output (Pages, Guided slides, PDF, or a mix):
- Languages and register:
- Records wanted:
- Sources of truth for facts:

## Behaviour
1. When <situation>, <who> <does what>, <to what standard>.

## Barriers
| Id | Barrier | Category | Source |
| --- | --- | --- | --- |
| b1-forgets | ... | knowledge | brief: "<quote>" |

## Fixes outside the course
- <barrier id>: <who changes what>. (Or "None.")

## Selection
<the JSON block below>

## Lessons
### 1. <Lesson title> (<minutes> min)
| Activity | Behaviour | Barrier | Pattern | Learner does | Information needed | Minutes | Scored |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Items
| Item | Decision it tests | Misconceptions behind wrong options | From |
| --- | --- | --- | --- |
| <activity> | ... | ... | brief / hypothesis |

## Records
<what the course records, what that record can't show, and how the person could see the behaviour>

## Facilitator notes
<live sessions only: run order, how learners answer on a shared screen>

## Questions
- <question>. Default taken: <default>.
```

The Selection JSON:

```json
{
  "behaviours": [{ "id": "b1", "text": "" }],
  "barriers": [{ "id": "b1-forgets", "behaviours": ["b1"], "category": "knowledge", "text": "", "source": "brief" }],
  "patterns": [{ "pattern": "flashcards", "barriers": ["b1-forgets"], "useWhen": "", "avoidWhenChecked": "" }],
  "rejected": [{ "pattern": "test-out", "reason": "" }],
  "outsideCourse": [{ "barrier": "", "fix": "" }],
  "unmet": [{ "barrier": "", "needs": "" }]
}
```

- Ids are labels; any unique string works.
- `category` is one of `knowledge`, `skill`, `motivation`, `environment`.
- `source` is `brief` or `inferred`.
- `pattern` is an id from `patterns.md`.
- `outsideCourse` and `unmet` may be empty lists.
- `final-check` and `written-task` list `"record"` in `barriers`.
- A rejected planned pattern's reason starts with `planned:`.
