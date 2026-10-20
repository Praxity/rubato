# Patterns for the composer

Pick from this file in step 4 of the composer skill. Each entry gives the pattern id to write in the outline, whether Studio can publish it now, the barriers it answers, when to use it and when to avoid it.

Library patterns quote their README in [Praxity/learning-patterns](https://github.com/Praxity/learning-patterns/tree/main/patterns). That README owns the pattern; when this file and the README disagree, the README wins. Studio's own compositions have no README yet, so their entries live here. The prax-format skill owns how to write each block.

Output matters. Rules (show, hide, jump) run only in Pages: Guided slides and PDF reject them. Learner PDF also refuses self-checks.

## Quick lookup

| Barrier | Usable now | Planned |
| --- | --- | --- |
| Forgets facts, steps or thresholds | `knowledge-check`, `flashcards`, `retrieval-sheet`, `dont-know`, `checklist` | `review-prompts` |
| Holds a wrong idea | `knowledge-check`, `dont-know`, `sort` | `write-distractors`, `first-answer`, `misconception` |
| Can't make the call in a situation | `scenario`, `dialogue-branching`, `sort`, `worked-example` | `conversation` |
| Can't produce good written work | `self-check`, `worked-example` | `first-answer`, `explain-back`, `live-feedback` |
| Misses what to notice | `hotspot`, `scenario` | `highlight` |
| Gives in to pressure or habit | `dialogue-branching`, `scenario`, `action-plan` | `conversation` |
| Hides uncertainty, guesses | `dont-know` | answer with confidence |
| Already knows most of it | `check-first`; when skipping isn't allowed, an unscored `knowledge-check` before the teaching, as a prediction | `test-out` |
| Needs a record: a pass, or work a person marks | `final-check`, `written-task` | |

## Usable now

### scenario
- Studio: now, Pages only. A `choice` (often `display=scenario`) followed by rules that show the follow-up for the learner's answer. Model: the prax-format scenario-feedback example.
- Answers: skill (making a call), motivation (seeing what a choice leads to).
- Use when the behaviour is a decision in a situation learners will recognise, and the wrong options are ones people really pick.
- Avoid when the behaviour is a physical skill, or when no wrong option is tempting. Rules can't read private choices, so a scenario's choice can't be private.
- Rules earn their place when the right and wrong paths lead to different follow-up content worth showing. When feedback on each option says enough, or the output is Guided slides or PDF, use a `knowledge-check` built on the case instead.
- Evidence: Clark, *Scenario-based e-Learning* (Pfeiffer, ISBN 9781118127254).

### dialogue-branching
- Studio: now, Pages only. `dialogue` turns, a `choice` for the learner's reply, rules that show the other person's response. Needs a cast in `course.yaml`.
- Answers: skill and motivation when the decision is what to say to someone.
- Use when the hard moment is a conversation: a customer pushing back, a caller who sounds official, a colleague who is upset.
- Avoid when the output is Guided slides or PDF. Branches follow right or wrong only, so both wrong replies get the same response.

### dont-know
- Studio: now. The `dontKnow` setting on a single-answer choice; the prax-format skill documents its default. Studio counts it as wrong, with no penalty. Say in the outline where you want it on, and where it would read oddly, such as a reply in a conversation.
- If you don't choose `dont-know`, set `dontKnow=false` on practice choices.
- Answers: knowledge, and motivation when learners guess to hide what they don't know.
- Use it "for short practice quizzes where learners need a way to say they are unsure" (README).
- Avoid on scored questions until the scoring has been tested with your learners (README).

### knowledge-check
- Studio: now. A single-answer `choice` with feedback on each option, placed between short teaching sections.
- Answers: knowledge (a fact or distinction the behaviour needs).
- Use when the behaviour depends on a fact or distinction that recognition can check.
- Avoid as the only practice for a skill barrier, and for facts the behaviour doesn't need.
- Evidence: retrieval practice beats rereading (Roediger and Karpicke, 2006, doi:10.1111/j.1467-9280.2006.01693.x); explanations beat right-or-wrong feedback (Van der Kleij, Feskens and Eggen, 2015, doi:10.3102/0034654314564881).

### flashcards
- Studio: now. `cards {layout=slides}` with a `back` on each card.
- Answers: knowledge (short items to recall cold: terms, thresholds, codes).
- Use when learners must recall short items without looking them up.
- Avoid for judgement calls, and for teaching that every learner must read (a flip hides it).

### retrieval-sheet
- Studio: now. `::: retrieval-sheet`, 1 to 8 questions.
- Answers: knowledge (forgetting after the course).
- Use it "for a short module with a few ideas or actions worth recalling". Learners can use it without internet (README).
- Avoid counting on it to bring learners back: "choosing a date sends no reminder" (README).

### self-check
- Studio: now, not in learner PDF. `::: self-check` with a model answer and criteria.
- Answers: skill (producing written work), knowledge (explaining an idea).
- Use it "when learners can check their answers against a short list of clear parts" (README).
- Avoid when you need a grade: "the pattern does not judge the learner's text" (README).

### sort
- Studio: now. `categorize`, `match` or `order`.
- Answers: knowledge (telling similar cases apart), skill (doing steps in order).
- Use when the behaviour depends on sorting cases into kinds or doing steps in sequence.
- Avoid `order` for a rare procedure a job aid could carry instead. No skill owns quality rules for these items yet, so keep them few.

### hotspot
- Studio: now. `::: hotspot` over a real image asset.
- Answers: skill (noticing the thing that matters in a screen, message or scene).
- Use when the behaviour starts with spotting something visible.
- Avoid when you have no real image to use.

### worked-example
- Studio: now. Teaching content: a `sequence` of steps, a `comparison` of a weak and a strong version, or a short example in prose.
- Answers: skill, for novices.
- Use before practice when learners are new to the task.
- Avoid for learners who already do the task well; worked examples can slow them down.
- Evidence: Atkinson et al., 2000, doi:10.3102/00346543070002181; expertise reversal, Kalyuga et al., 2003, doi:10.1207/S15326985EP3801_4.

### action-plan
- Studio: now. `free-response {private}` asking for "When <situation>, I will <action>".
- Answers: motivation (acting at the right moment against habit or pressure).
- Use when the behaviour has a clear trigger moment and habit or pressure gets in the way.
- Avoid scoring it. `private` keeps answers out of LMS reporting, but the text still sits in the LMS's saved progress.
- Evidence: Gollwitzer and Sheeran, 2006, doi:10.1016/S0065-2601(06)38002-1.

### checklist
- Studio: now. `::: checklist` in the course.
- Answers: knowledge for rare or long tasks. A card at the point of work is a fix outside the course; the praxity-print skill can make it from the same list.
- Use when the task is rare, has several steps, and people can look at a card while doing it.
- Avoid when the moment leaves no time to look anything up.

### check-first
- Studio: now, Pages only. A short check at the start. Each question has a refresher every learner can open, such as an accordion, and a rule points learners to it after a wrong answer. Stands in for `test-out`.
- Answers: motivation (experienced learners bored by what they know).
- Use when most learners already know most of the content and the record needed is a pass, not proof they saw every page.
- Put the rules every learner needs on a page everyone sees; the refreshers hold the detail. Each opening question tests what its refresher teaches. The opening check can be the record only when its questions cover every behaviour; otherwise add a `final-check`.
- Avoid when the course needs proof that learners saw each section.

### written-task
- Studio: now. `free-response`, with `download` so learners can hand in their answer.
- Answers: the record, when a teacher or manager marks written work outside the course.
- Use when a person will read and mark what learners write.
- Avoid when nobody will read it; use `self-check` for practice the learner judges.

### final-check
- Studio: now. A `group` of scored choices with a pass mark. assessment-writing writes the items.
- Answers: the record, not a barrier.
- Use only when the brief asks for a recorded pass.
- Avoid presenting a pass as proof of the behaviour. It shows the learner picked right answers once.

## Planned: not usable yet

Record these as rejected (planned) when they are the best fit, and use the fallback.

| Pattern | Status | Use when (README) | Fallback now |
| --- | --- | --- | --- |
| `write-distractors` | Studio adoption in progress; cannot publish | Learners know enough to answer from memory and explain common mistakes | none |
| `highlight` | Studio support accepted, not built | Finding key ideas or evidence in a short passage; not recall | `hotspot` over an image of the passage, or a multiple-answer `choice` listing its pieces |
| `review-prompts` | Studio support accepted, not built | Short readings with facts or actions to recall later | `knowledge-check` or `flashcards` between sections, without review dates |
| `first-answer` | Studio adoption deferred | The same question at the start and end; learners judge their own change | `self-check` at the end; the saved first answer is lost |
| `test-out` | Studio adoption deferred | A small refresher where one or two questions justify skipping a section | `check-first` |
| answer with confidence | Library pattern next; Studio later | Learners mark sure, guessed or don't know | `dont-know` |
| `conversation` (AI) | Library only | Practising a difficult workplace conversation | `dialogue-branching` |
| `explain-back` (AI) | Library only | Explaining a short reading in your own words | `self-check` |
| `live-feedback` (AI) | Library only | Short classifiable writing such as action plans | `self-check` |
| `misconception` (AI) | Library only | A short answer that can reveal a mistaken belief | `knowledge-check` with feedback that explains the contrast |
| `journal` (AI) | Library only | Weekly reflection | `free-response {private}` |
| `course-lookup` (AI) | Library only | Questions across a course with a small, stable catalogue | none |

AI patterns let a model pick among messages the author wrote; the model writes no learner text. They need a server to run the model, which Studio courses don't have. Ideas in the pattern gallery that are not in this file can't be chosen yet.
