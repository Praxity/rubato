---
name: composer
description: Compose a new course or module from a brief, or address a training problem. Starts from the behaviour people should change and what stops them, picks learning patterns, writes an outline, then builds and reviews the course through prax-format, assessment-writing, praxity-trace and praxity-check.
---

# Composer

You turn a brief into a course that changes what people do. You own four things: the behaviour, its barriers, the pattern choices and the outline. Other skills own writing and review, so at each hand-off this skill names the skill and leaves its rules to it.

Write the outline to `outline.md` beside the course's `course.yaml`, starting from [outline-template.md](outline-template.md). Pattern facts are in [patterns.md](patterns.md). The later steps run the `praxity` command; when it's missing, use the install-praxity skill first.

For a lesson added to an existing outline, use prax-format directly. For an unfinished course, use the single label "Draft" in `outline.md` and the report, followed by the specific blocking reason or reasons. A draft is not ready to ship; step 8.3 still exports it temporarily for checking. Clear each reason and remove Draft before producing a deliverable export.

## 1. Read the brief

Fill the outline's Brief section: audience and their reading level, where and when they will act, time per sitting, device and connection, output, languages and register, records wanted, and the sources of truth for facts.

For French, ask and record the person's register and regional variety. The prax-format skill's "Agree on French register" section in `skill/learners.md` owns the rules and defaults. When the choice is `tu`, tell the person about the built-in-control mismatch described there and record it in Questions.

Output is Pages, Guided slides, a PDF, or a mix such as slides on a projector with a printed take-home. Decide it here, because some patterns don't work in every output.

When something is missing and would change a choice, ask the person. In an unattended run, add it to Questions with the default you took, and go on. A requirement the brief states, such as "every student must work through every part", is a constraint: a default can't relax it. When a requirement clashes with what Studio can do, ask.

Done when every Brief field holds a value from the brief or points to a question with a default.

## 2. Name the behaviour

Write one to three behaviours as "When <situation>, <who> <does what>, <to what standard>." Each one is something a manager, a teacher or the learner could see happen.

A brief that asks for knowledge or awareness ("understand the policy") gets a question back: what would you see learners do differently? Offer two behaviour sentences to choose from. The standard says what counts as done, including what happens when a check fails, such as nobody answering the phone. When you write the standard yourself, add it to Questions.

Done when each behaviour names a situation and an action someone could observe.

## 3. Find the barriers

List what stops people doing each behaviour today. Quote barriers from the brief, and mark any you add as inferred. Give each barrier one category:

- knowledge: they don't know it, misremember it or hold a wrong idea;
- skill: they know it but can't yet do it well, fast or under pressure;
- motivation: they could, but don't want to, don't feel able, or habit or another pressure wins. Experienced learners bored by what they already know count here;
- environment: tools, time, rules, incentives or missing information at the point of work.

These follow action mapping ([Moore, *Map It*, 2017](https://blog.cathy-moore.com/action-mapping/)) and the COM-B model ([Michie, van Stralen and West, 2011](https://doi.org/10.1186/1748-5908-6-42)). Traits of the learners and their setting, such as reading level, disability, device or interruptions, are constraints for the Brief rather than barriers. They shape the writing, which prax-format does from the Brief, more than the pattern choice.

A course can't fix an environment barrier. Put each one under Fixes outside the course, with a concrete fix and who could make it. That list may be empty. When an environment barrier contradicts what the course will teach, such as a screen that shows last year's limits, tell the person before you build. In an unattended run, put it first in your report; if learners will meet the contradiction, add one note in the course that names it and say in the report that the note goes once the fix lands.

When every barrier is environment, stop. Report the fixes and ask whether they still want a course.

Done when every barrier has one category and a source, and every environment barrier has a fix.

## 4. Choose patterns

Open patterns.md. For each barrier that isn't environment, find the patterns whose use-when fits the barrier and the brief, then read each one's avoid-when against the brief. Record each choice in Selection with the barrier, the use-when it meets and the avoid-when you checked. Record up to five of the closest candidates you rejected across the course, each with the barrier it was for and why, including any planned pattern that would fit better.

- Choose patterns marked usable now that work in every output the brief needs. When a planned pattern is the best fit, record it as rejected (planned) and use its fallback.
- Every chosen pattern answers a barrier. One pattern may answer several. `final-check` and `written-task` answer the record instead: list `record` as their barrier. Drop a pattern rather than invent a barrier for it.
- When the only fitting pattern needs something the person hasn't given, such as a screenshot for `hotspot`, list the barrier under `unmet` with what it needs, and ask for it. Keep a placeholder activity for it in Lessons, marked blocked, so the gap stays visible.
- Use the fewest patterns that cover the barriers. A short course with three patterns done well beats seven done thinly.
- Score only what the brief asks to record. Practice stays unscored.

Done when every barrier that isn't environment has a pattern or is listed as unmet, every pattern names its barrier, and Selection lists every pattern the course will use.

## 5. Write the outline

Fill Lessons with one row per activity: behaviour, barrier, pattern, what the learner does, the information they need for it, minutes, and whether it's scored. Teaching pages go in the Information needed column of the activity they serve. Estimate the minutes so each lesson fits one sitting; the praxity-trace pace view checks your estimate later.

- Open each lesson with its behaviours in plain words that learners see. The praxity-trace alignment view reads objectives from course text.
- Teach only what the activities need. Put practice early, with the information beside it.
- For each keyed choice, fill Items: the decision it tests and the misconceptions behind its wrong options, each marked as from the brief or a hypothesis.
- Fill Records. Completion shows someone reached the end. A passed check shows they picked right answers once. Neither shows the behaviour at work, so name a way the person could see it, such as a manager's observation or a real work sample. What learners say they did is self-report, not observation. Check every claim about what is stored or reported against the block settings: unscored isn't private, and ordinary choices report to the LMS. Levels follow [LTEM](https://www.worklearning.com/ltem/).

Done when every activity traces to a barrier, every barrier has an activity that practises that barrier's own action, and each lesson fits one sitting.

## 6. Check in

Show the person the behaviour, barriers, fixes outside the course, selection and questions. Wait for their yes or their changes before writing any `.prax`. In an unattended run, continue with your defaults.

## 7. Hand off the writing

1. Write the course from outline.md with the prax-format skill, following steps 1 to 6 of its build list; export comes in step 8 below. It owns syntax, block details, validation and identity. For two languages, keep one outline and build one course folder per language, side by side, with the same lessons in the same order.
2. Write every keyed single-answer choice, scored or practice, with the assessment-writing skill, including its attack, before any export. Hand it the Items section, and list each deliberate poll in the course by ref: its hand-in checklist declares them, and its gate stops on a choice with no key that it wasn't told about. When Trace is missing, follow that skill's fallback. When no fresh agent can run its probes, mark the bank unverified and keep the course a draft.

   Trace's masked gate covers English only. For any bank where it doesn't apply, including French, run the plain choices-only and cover-the-options probes, the key check and the explanations probe within assessment-writing's pass cap. Report the masked gate as "not applicable" with its reason, mark that bank unverified, and add the unverified bank as a blocking reason under Draft. Continue through steps 7.3 to 9, including the fidelity review, alignment check, accessibility check and report, even in an unattended run. Ask the person how to resolve the unverified bank at the end in step 9, rather than at this hand-off; a fluent-reader check alone doesn't verify it.

   When assessment-writing's gate returns `"tooling"`, the installed tools can't verify the bank. Let that skill check pass 1's rewrites first, then treat the bank as above: mark it unverified because of the tooling limit, add it as a blocking reason under Draft, continue through steps 7.3 to 9, and ask the person at the end in step 9.

3. Sort facts three ways:
   - facts the person's organisation owns (its policy, limits, steps, contacts) come only from the brief or its named sources. Where one is missing, write `[SOURCE NEEDED: what]` once per course folder, where learners first meet the fact, and add it to Questions;
   - general facts of a subject (science, common safety advice) you may write; list each one in the report for an expert to check;
   - invented details for cases and examples (names, items, prices) are fine when they agree with the first kind.

   Every restatement of a rule, whether an objective, a card, a summary, a model answer or feedback, keeps all its conditions and exceptions. Feedback adds no claim that the course or the brief's sources don't support. A neighbouring-case explanation from assessment-writing requires support for its claim and conditions in the brief's sources. Any teaching added to support feedback must itself be supported by those sources; adding a teaching page doesn't create evidence. Otherwise add teaching supported by those sources first, or drop the option. Subject facts still need the expert check above.

Done when every activity in the outline exists in the course, prax-format's validation and identity steps pass for each course folder, and every `[SOURCE NEEDED]` marker is listed in Questions. Any remaining marker keeps the course a draft.

## 8. Review with fresh eyes

The agent that wrote the course doesn't grade it. The fidelity reviewer also judges alignment in step 8.2. Use a fresh-context reviewer from a different model family than the writer when one is available. If no other model family is available, run a fresh-context reviewer from the same family, using a different model if one is available. Record the reviewer and model, and keep Draft with the blocking reason "independent review still needed because only a same-family reviewer was available".

1. Fidelity. Give the fresh agent the brief, outline.md, the course and the brief's sources. It checks support for every model answer, example plan, shortened rule, branch and feedback line in the course or the brief's sources, against the behaviour sentences and step 7.3. It also checks every teaching page added to support feedback directly against the brief's sources, including each condition; unsourced teaching or a wrong condition goes back to the writer. It flags unsupported claims and missing conditions; a supported neighbouring-case explanation may add information learners haven't yet read. It reads every language; mirror each fix in all of them.
2. Run the praxity-trace report, and have that fresh agent answer its alignment view. Compare the result with outline.md: each behaviour should have practice and, if scored, a check.
3. Export every course, including a draft, through prax-format as HTML into a fresh temporary folder solely for checking. Run praxity-check on that export, save its findings outside the temporary folder and put the results in the report. Then delete the temporary export; never ship it. If validation or identity refuses export, record that exact failure as a blocking reason without bypassing the refusal. Produce the brief's deliverable exports only after all blocking reasons are cleared.
4. Fix through prax-format, rerun what the fix touched, and update outline.md when an activity changes. The fidelity reviewer then rechecks every line the fixes changed; a finding counts as fixed only when the course text meets it, not when the report notes it.

When no fresh reviewer can run at all, keep Draft with the blocking reason "independent review unavailable". Report which reviews couldn't run; the writer's own check doesn't replace them. Continue the other available checks.

Done when no review finding is left without a fix or a note in the report. Any unresolved finding keeps the course a draft.

## 9. Report

Tell the person:

- the files written;
- the fixes outside the course;
- the open questions and the defaults you took;
- the review results, including praxity-check's findings from the temporary export;
- Draft status and each remaining blocking reason, then ask the person how to resolve the unverified banks and other open blockers;
- what still needs a person: every fact checked against its source, subject facts checked by an expert, the second language read by a fluent reader, and any portrayal of a group checked by members of that group.

## When to ask, refuse or stop

Ask before outlining when the following hold. In an unattended run, each becomes a question with a default:
- the brief names no audience or no situation where they will act;
- facts the course must teach (policy, thresholds, procedure) have no source;
- the records wanted are unclear, or completion is asked for as proof of skill;
- the course includes French and the register or regional variety is unstated.

Decline, and say what you'll do instead, when asked to:
- match content to learning styles. Offer access and choice instead;
- promise a pass, show a readiness percentage, or report completion as competence;
- build pages, scripts or players outside Studio for a pattern Studio lacks. Name the gap and use the fallback;
- copy items from a real exam or a prep bank;
- collect learner data the brief doesn't need.

Require an expert before delivery when the course teaches safety, health, legal or financial facts. Build the course as a draft, list the facts to check, name who should check them, and record the pending expert check as a blocking reason. Continue available reviews and the temporary checking export; produce deliverable exports only after the expert check and other blocking reasons are cleared.
