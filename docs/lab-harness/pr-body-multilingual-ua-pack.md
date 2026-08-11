> ⚠ **SUPERSEDED 2026-08-11. Do not open a PR from this text.**
>
> It describes the 20-task pack as it stood on 08-10. Since then the diligence family was
> rebuilt, seven statute-review tasks were added, the litigation family gained dated statutory
> extracts, and two claims in here were measured and found wrong:
>
> - "a corpus median of 54" is read below as a target to reach. It is not a target: criteria
>   count is a size-independent constant (~56 at every document count AND every word band, rank
>   correlation with words +0.18). Reaching it by slicing produced padding twice.
> - the pack-level scores quoted here predate the criteria trim, the new tasks and the extracts.
>
> The schema-only PR body is `pr-body-schema-only.md`. The corrected findings live in
> `proposal-joel-lab-multilingual.md`. Rewrite this from measurement before reusing any of it.

# PR body (draft, not opened)

**Target**: `harveyai/harvey-labs` ← `overthelex:feat/multilingual-schema-and-ua-pack`
**Branch pushed**: https://github.com/overthelex/harvey-labs/tree/feat/multilingual-schema-and-ua-pack
**Head**: `0daafb48`, 21 files, +845 / -1

---

## Multilingual schema + first non-English tasks (Ukrainian)

LAB currently has no way to express a task outside English/US. `task.json`
carries no language or jurisdiction, so a non-English pack cannot declare what
it is, and neither tooling nor the judge can treat it differently. This PR adds
that, then uses it for two Ukrainian tasks.

Two commits, reviewable independently. The first is useful on its own even if
you do not want the second.

### 1. Schema (`f1e01b2`)

Three optional task fields and one optional criterion field, all defaulting to
current behaviour so **every existing task is unchanged and still valid**:

| Field | Default | Purpose |
|---|---|---|
| `language` | `en` | BCP-47 tag for the matter and deliverables |
| `jurisdiction` | `US` | ISO 3166-1 alpha-2, optional subdivision |
| `judge_language` | `= language` | Language the rubric is written in |
| `criteria[].source` | `expert` | `expert` or `oracle` |

`judge_language` is the load-bearing one. Both Ukrainian tasks set
`language: "uk"` with `judge_language: "en"`, which means the rubric stays
readable by maintainers who do not read Ukrainian and **the existing judge
grades the tasks with no changes at all**. No judge prompt was touched.

`source: "oracle"` marks a criterion that is checkable mechanically against an
external authority rather than by an LLM judge, so a runner may resolve it
without spending a judge call. Nothing in this PR acts on that flag; it is
declarative, and `describe_task` reports the ratio.

### 2. Identifier gate (`tests/test_no_real_identifiers.py`)

CONTRIBUTING.md requires synthetic parties and matter facts. That is easy to
honour for a hand-written US matter and easy to break for a task derived from a
public register, where real identifiers travel with the source text. This adds a
blocking test.

It works because national identifiers carry checksums: a value copied from a
real document validates, an invented one does not. Two design decisions came
directly out of running it across all 2,010 existing tasks, and both are worth
flagging because both were wrong on the first attempt:

- **Checkers are scoped to the task's declared jurisdiction.** A bare 8-digit
  number satisfies the Ukrainian company-code checksum roughly 1 time in 11, so
  an unscoped gate flags ordinary amounts in unrelated US matters.
- **IBAN is deliberately not checked.** Documentation IBANs are constructed
  checksum-valid, so validity says nothing about whether an account is real. An
  unscoped mod-97 check flagged the synthetic IBANs already in
  `contracts/banking/repo-securities-lending-first-draft/scenario-02`. A check
  that fires on correctly-synthetic data is worse than no check.

Office files are scanned as text nodes only, never raw XML, since markup
artefacts such as colour values and revision ids otherwise produce false
positives.

### 3. Two Ukrainian tasks (`0daafb48`)

**`diligence/ua-counterparty-register-screening`** — 8 documents, 20 criteria
(12 oracle). Screen a counterparty across Ukrainian public registers before
signing a supply framework agreement. The decisive finding is only visible by
joining two documents: the counterparty's ultimate beneficial owner also holds
75% of a sanctioned entity, which requires reading the shareholder's register
extract together with the sanctions screening. Three distractors are
deliberate, and a correct exposure figure requires excluding all of them: one
enforcement proceeding is already completed, one court case has the
counterparty as claimant rather than respondent, and the tax debt duplicates
one of the enforcement proceedings.

**`litigation-dispute-resolution/ua-limitation-period-martial-law`** — 7
documents, 25 criteria (11 oracle). Advise on appeal prospects where the
defendant pleads limitation. The claim was filed five months after the
three-year period would ordinarily have expired, and is nonetheless in time,
because paragraph 19 of the Final and Transitional Provisions of the Civil Code
**suspends the running** of limitation for the duration of martial law.

The rubric is built around three traps a confident wrong answer falls into:

- Paragraph 19 **suspends** the running (`зупиняється`). It does not **extend**
  the period (`продовжуються`) — that is the neighbouring paragraph 12, for the
  COVID-19 quarantine, and only paragraph 12 carries the article list
  257, 258, 362, 559, 681, 728, 786, 1293.
- Penalty claims run on a **one-year** special period under Article 258(2)(1),
  not the three-year general period.
- Article 625(2) compensation is a separate remedy from contractual penalty and
  is not capped by the contract's six-month accrual clause.

The matter is explicitly set as at **11.02.2025**, and the instructions say to
apply the law in force on that date, because paragraph 19 was itself **repealed
on 14.05.2025** by Law 4434-IX. A model applying today's text of the Code
reaches the opposite conclusion. That is the intended discrimination, and it is
the reason I think a declared as-of date belongs in the schema (see open
questions).

All parties, addresses and company codes are synthetic, and the company codes
are chosen to **fail** the Ukrainian checksum so the gate above can prove they
cannot collide with a real registered entity.

### Validation

```
uv run python -m pytest tests/test_task_integrity.py tests/test_no_real_identifiers.py
21656 passed, 250 skipped
```

That covers all 2,010 pre-existing tasks plus the 2 new ones.

Every legal proposition in the litigation task was checked against the text of
the Civil Code **in force on the matter date**, not from model recall. That
check mattered: an earlier draft of this task described paragraph 19 as
*extending* limitation periods and quoted paragraph 12's article list, which is
the quarantine rule, not the martial-law one. Both are fixed.

```
uv run python -m utils.describe_task diligence/ua-counterparty-register-screening
  Locale: uk / UA (rubric in en)
  Oracle criteria: 12/20 (checked mechanically, no judge call)
```

**Not yet run: the agent smoke run and judge pass from CONTRIBUTING.md**, which
need model credentials. Happy to run them and post results before you review, or
to have them run in your CI. Until then I am not claiming these tasks score in
the intended band, only that they are structurally valid.

### Open questions

- **Rubric density.** 20 and 25 criteria, against a corpus median of 54 (mean
  57.1 across all 2,010 tasks; median 57, mean 64.1 across the 1,264 that carry
  a `work_type`). `diligence` in particular runs far denser, up to 1,114
  criteria in `rail-horizontal-merger`, so my diligence task is thin for its
  area. These are the criteria that hold without padding, and CONTRIBUTING.md
  says not to add nice-to-have items, so I would rather raise density with more
  matter than by padding. Say the word if you want it raised before merge.
- **An as-of date field.** The litigation task is only correct as at a stated
  date, because the provision it turns on was repealed in May 2025. I encoded
  that in the instructions and in a criterion, but a declared field would make
  it machine-checkable and would let the split builder reason about it. I left
  it out of this PR to keep the schema change minimal. Worth adding?
- **Where should a non-English pack live**, under the existing practice areas
  as here, or in a separate tree?
- **Is there a CLA?** CONTRIBUTING.md does not mention one.
