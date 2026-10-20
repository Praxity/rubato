# Patterns for the composer

Pick from this file in step 4 of the composer skill. Each entry gives the pattern id to write in the outline, whether Studio can publish it now, the barriers it answers, when to use it and when to avoid it.

Library guidance below is generated from the READMEs in [Praxity/learning-patterns at 3ed3d0e](https://github.com/Praxity/learning-patterns/tree/3ed3d0e2ccb373cc3646dd89a6dd33030fab58e6/patterns). Those READMEs own when to use and avoid each library pattern. Studio's own compositions have no README yet, so their entries live here. Studio support, barriers and fallbacks also live here. The prax-format skill owns how to write each block.

Output matters. Rules (show, hide, jump) run only in Pages: Guided slides and PDF reject them. Learner PDF also refuses self-checks.

## Library guidance

Use these sections for every library pattern, including the planned patterns. Check Studio support below before choosing one.

<!-- library-pattern-guidance:start -->

| Pattern | Use it when | Avoid it when |
| --- | --- | --- |
| `conversation` | Use it to practise a difficult workplace conversation. You can acknowledge the impact, defend the change, attack, withdraw or ask for a pause. Michel responds to each choice. The review explains the effects of your two replies. | It gives no score. |
| `course-lookup` | Use it across a course with a small, stable catalogue. The demo has eight FAQ entries and six course sections. |  |
| `dont-know` | Use it for short practice quizzes where learners need a way to say they are unsure. | Test the scoring with your learners before using it for assessment. |
| `explain-back` | Use it after a short reading. This example checks three ideas: stonewalling, announcing a pause and returning to the conversation. The feedback helps you revise your explanation. | It gives no grade. |
| `first-answer` | Use it when learners can answer the same question at the start and end of a course. Keep the question and self-check criteria the same. | Learners judge their own changes, so use another method to grade answers. |
| `highlight` | Use it to find key ideas or evidence for a question. Keep passages short and split them into meaningful pieces. | Learners select whole pieces, so use another pattern for selecting individual words. Searching visible text does not test recall. |
| `journal` | Use it for weekly course reflections. Each suggestion asks about the first missing detail: a situation, your response, a next step or when to try it. | There is no score or checklist. |
| `live-feedback` | Use it for short action plans, outline-like writing assignments, and generally to give learners immediate feedback on responses that can be classified. This example checks for three different actions a colleague could see or hear, a time or situation, and your own commitments. The feedback helps you revise. | It gives no grade. |
| `misconception` | Use it when a short answer can reveal a mistaken belief. This example asks whether rereading notes prepares you for a test. The proxy checks four study misconceptions. Feedback helps you revise your reasoning. | It gives no grade. |
| `retrieval-sheet` | Use it for a short module with a few ideas or actions worth recalling. Keep questions focused and answers short. Learners can use the sheet without internet. Print it or save a PDF while connected. A SCORM package prints from its course files without fetching anything. | Choosing a date sends no reminder. Arrange one through your course host if needed. |
| `review-prompts` | Use it for short readings with facts or actions learners need to recall later. Give each section one focused question and a short answer. | Ratings record what learners say they remembered. They do not verify recall or workplace performance. |
| `self-check` | Use it when learners can check their answers against a short list of clear parts. It works offline and can help you compare self-checking with automated feedback. | The pattern does not judge the learner's text. |
| `test-out` | Use it for a small refresher where one or two questions can justify skipping a section. Advanced questions must test any prerequisite knowledge they credit. | Keep all sections required when the course needs proof that learners saw each one. |
| `write-distractors` | Use it when learners know enough to answer from memory and explain common mistakes. Authors can review their wrong options for use in quizzes. | A person must judge whether each option expresses the chosen misconception and would tempt a learner. Matching labels cannot do that. |

<!-- library-pattern-guidance:end -->

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
- Selection guidance: see [Library guidance](#library-guidance).

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
- Selection guidance: see [Library guidance](#library-guidance).

### self-check
- Studio: now, not in learner PDF. `::: self-check` with a model answer and criteria.
- Answers: skill (producing written work), knowledge (explaining an idea).
- Selection guidance: see [Library guidance](#library-guidance).

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

For library patterns, use and avoid guidance is in [Library guidance](#library-guidance). The proposed answer-with-confidence pattern lets learners mark sure, guessed or don't know; it has no library README yet.

| Pattern | Status | Fallback now |
| --- | --- | --- |
| `write-distractors` | Studio adoption in progress; cannot publish | none |
| `highlight` | Studio support accepted, not built | `hotspot` over an image of the passage, or a multiple-answer `choice` listing its pieces |
| `review-prompts` | Studio support accepted, not built | `knowledge-check` or `flashcards` between sections, without review dates |
| `first-answer` | Studio adoption deferred | `self-check` at the end; the saved first answer is lost |
| `test-out` | Studio adoption deferred | `check-first` |
| answer with confidence | Library pattern next; Studio later | `dont-know` |
| `conversation` (AI) | Library only | `dialogue-branching` |
| `explain-back` (AI) | Library only | `self-check` |
| `live-feedback` (AI) | Library only | `self-check` |
| `misconception` (AI) | Library only | `knowledge-check` with feedback that explains the contrast |
| `journal` (AI) | Library only | `free-response {private}` |
| `course-lookup` (AI) | Library only | none |

AI patterns let a model pick among messages the author wrote; the model writes no learner text. They need a server to run the model, which Studio courses don't have. Ideas in the pattern gallery that are not in this file can't be chosen yet.
