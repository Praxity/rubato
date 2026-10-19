---
name: assessment-writing
description: Write or revise multiple-choice questions, distractors, keyed choices and exam-style practice in a Praxity course. Use when authoring assessments or checking whether answer cues let learners bypass the question.
---

# Writing assessments

Models often write a convincing key beside distractors that reveal why they are wrong. A learner can then pick the key without understanding the question. Write from misconceptions, then attack the items with independent probes.

## 1. Before the item

Name the one idea being tested and the decision the stem asks for. List the misconceptions a partly prepared learner might hold before writing options. Source them from learner answers and comments, published research on the topic, the course's confused-with topics, or older versions of the relevant standard. Label an author's judgement as a hypothesis to check with learners. Use fewer options when the format allows it rather than inventing a misconception to fill a slot.

## 2. Write the item

- Put the deciding detail in the stem. Someone who knows the topic should be able to answer with the options covered.
- Make distractors plausible and misconception-based. Each distractor targets a different misconception. Prefer statements or actions that are reasonable in a neighbouring case but do not answer this stem, such as the definition of a neighbouring concept or a partial solution.
- Keep options parallel in length, grammar, register and kind. If the key uses textbook wording, give the distractors the same register. Inspect the key's length rank across the bank; always making it second-shortest creates another cue.
- No option names its own flaw. Put the deciding scope or condition in the stem instead of giving a distractor a conspicuously wrong qualifier. Vary which option is hedged; certainty or caution must not identify the key.
- When options vary on two elements, consider all four combinations so the key is not the option sharing the most elements with all the others. Check for convergence, shared leads, duplicates, stem words echoed only in the key and absolutes confined to distractors.
- Keep all options respectful and person-centred. The key must win on the tested content rather than being the only considerate answer. Make wrong options credible, without jokes or cartoonishly unsafe actions.
- Match the target exam's format, including option count, number of best answers and stem style. Follow its rules for negative stems and all/none-of-the-above options. When no exam constrains the format, prefer a positive stem and one best answer with functioning distractors.
- Give each distractor feedback that names its misconception, explains why it is wrong here, and says when it would be right. Keep feedback separate from the option text so it cannot disclose the answer before submission.
- Predict items must not copy later checks. Ask for a prediction about a different case; preserve the later check's need for retrieval and judgement.
- Set `{shuffle}` on scored choices. Leave key position to runtime randomisation. With `dontKnow` alone, keep "I don't know" pinned last below the options, outside the shuffled answers. Use the supported `dontKnow` setting rather than authoring another ordinary option.
- When confidence and `dontKnow` are both on, use a segmented submit control: "Submit: Sure of my answer / I guessed / Don't know". "Don't know" sits in the submit control, not the option list. Preserve the target exam's option count. Check that the installed renderer supports this combination before using it; if it does not, report that limitation and keep confidence off rather than inventing syntax or claiming the control exists.

## 3. Attack the bank

This step is required. The writer never grades its own items. Trace owns the scripted cue rules and scores the independent responses against the key.

1. Run the scripted report first:

   ```sh
   praxity trace report <course> --out <dir>
   ```

   Its item-cues section must show no flagged cues, or each flag must be fixed or justified with item-specific evidence. Inspect key-position spread and key-length-rank spread across the bank as well as individual cues.

2. Prepare the blind probes:

   ```sh
   praxity trace prepare item-cues <course> --out <bundle>
   ```

   Spawn a fresh subagent for each probe that has never seen the course source or the key. Give it only the bundle's prompt and that probe's unkeyed inputs, never the source, feedback, keyed report or writer's reasoning. The choices-only solver sees options without stems and picks an answer with a named cue, if any. A separate cover-the-options solver sees stems without options and answers them. Follow the bundle's response schema to produce `<bundle>/answer.json`. The writer may assemble the responses without changing their answers or judgements.

3. Score the responses through Trace:

   ```sh
   praxity trace report <course> --out <dir> --item-cues <bundle>/answer.json
   ```

   Rewrite every item the choices-only solver got right with a named cue. Repair stems that the cover-the-options solver cannot answer because the deciding detail is missing; distinguish that from a solver's lack of subject knowledge. After changes, regenerate the bundle and repeat with new, unexposed subagents.

   Stop when all named cues on correctly guessed items are resolved, all scripted flags are fixed or justified, the stems pass the cover-the-options review, and the bank's one-sided binomial p is above 0.05. The bank is then not distinguishable from guessing by this test; that is not proof that every item is free of cues. On small banks, treat a flat percentage as noise. Record item count, option count, correct guesses, chance expectation and p with the bank, plus the responses and any flag justifications.

4. Treat plausibility judgements as hints, never gates. Ask which distractor a partly prepared learner might choose and why. Check those hypotheses against actual learner responses when available. Review distractors that attract very few responses, accounting for sample size and the learners' preparation.

### If item-cues is unavailable

If Trace's item-cues is not installed yet, say so and run both probes by hand with fresh subagents using the same blind inputs and separation above. Do not skip the attack step. If subagent execution is unavailable, report the attack as blocked and the bank as unverified.

Manually inspect the scripted cues listed in step 2 of writing, plus key-position spread and key-length-rank spread. Record each flag and its fix or justification. Lock the blind responses before a separate scoring subagent receives the key to score them; the writer does not substitute its own judgement for independent grading.

For a bank of n single-answer items with k options each and x correct guesses, compute the one-sided binomial tail P(X >= x) with chance 1/k. Chance expectation is n/k. Separate banks with different option counts rather than applying one binomial rate to all items. For example, 12 of 32 four-option items gives p about 0.080 and 13 gives p about 0.038. Apply the same rewrite and stopping rules as the Trace workflow. Keep the counts, calculation, responses and justifications with the bank; a flat percentage is not a substitute.

## Public research

- [Sadler, 1998, Psychometric models of student conceptions in science](https://users.nber.org/~sewp/events/2004.05.28/Sadler_PsychometricModels.pdf) grounds distractors in learners' alternative conceptions.
- [Gierl, Bulut, Guo and Zhang, 2017, Developing, analyzing, and using distractors for multiple-choice tests in education](https://doi.org/10.3102/0034654317726529) reviews distractor development and analysis.
- [Balepur, Ravichander and Rudinger, 2024, Artifacts or Abduction: How Do LLMs Answer Multiple-Choice Questions Without the Question?](https://aclanthology.org/2024.acl-long.555/) motivates the choices-only attack.
- [Tarrant, Ware and Mohammed, 2009, An assessment of functioning and non-functioning distractors](https://doi.org/10.1186/1472-6920-9-40) uses learner response data to identify distractors that do not function.
