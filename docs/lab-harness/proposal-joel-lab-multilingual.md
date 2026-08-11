# Draft: proposal to Joel Niklaus, Ukrainian pack for LAB

**Status**: draft, NOT sent. Rewritten short 2026-08-11 — best findings first, details deferred
to the PR.
**To**: Joel Niklaus (HF `joelniklaus`; `joel.niklaus.2@bfh.ch`)
**Context**: continuing a LinkedIn exchange from 2026-08-09, where he replied "sure, happy to
chat about it" to the ask about extending LAB to non-English legal systems. ⚠ "Chat" means the
written exchange, not a call — do not offer to schedule one, and do not reintroduce yourself: he
answered two days ago and knows who I am. LEXTREME PR #16 was dropped for the same reason.
**Ask**: confirm or refute two defects in his pipeline; a view on the task shape. Neither
requires a decision from him. Findings 3 and 4 (criteria count is a size-independent constant;
LAB grounds 77% of cited statutes in the matter) are cut from the letter and live in the PR.
**Suggested subject line**: `Ukrainian pack for LAB — two things in your split profiler`

---

## Message

Hi Joel,

Picking up from the thread — moving to email since this got longer than a comment. Rather than
write back with a proposal, I built a small Ukrainian pack for LAB and ran it, so there is
something measured to react to. Two of the things that came out are in your code, and you can
settle both faster than I can.

**1. `splits/build_profile.py:69` will misrank non-English tasks by 1.7x.** `est_tokens =
chars // 4` feeds `ctx_bucket`, the `is_large` floor and the `>1_000_000` force-include in
`build_split.py`. On a parallel EN/UA corpus (opus-100 `en-uk`, 40k pairs, language the only
variable) that constant is near-exact for English — est/real 1.05 on the DeepSeek-V3 tokenizer —
and understates Ukrainian by 39%, est/real 0.61. A Ukrainian task that genuinely stresses the
window profiles at ~61% of its size and drops out of the large band. Your published results are
untouched: the split is a committed contract over an English corpus, where the constant is
right. It bites the first non-English pack anyone adds, mine included.

**2. The promotion gate is not language-neutral.** `- 0.005*tokens/1M` on measured tokens costs
0.0094 at the 1.88M dev mean. The same work in Ukrainian burns ~1.7x the tokens, so ~0.016 — a
gap of 0.0066 against a `min_delta` of 0.01. Two thirds of the promotion threshold, spent on the
language rather than the harness.

What I built off the back of that: the governing act goes in the workspace and the task asks
which clauses of a drafted instrument break which provision. Closed-universe, and the recall
confound goes away. On the first one — a draft LLC charter against the Ukrainian LLC Act, 46
criteria — Sonnet 4.6 scored 37/46 and 39/46 over two runs, called both deliberately *lawful*
clauses breaches, and missed the mandatory clause that was simply absent. That last one holds
across seven more tasks: 0/12 on missing clauses against 86/87 on planted defects.

I've opened the small piece that makes any of this expressible at all as a PR on LAB —
harveyai/harvey-labs#139: `language`, `jurisdiction`, `judge_language`, `criteria[].source`, all
optional and defaulting to `en`/`US`, plus a run-id fix that hits anyone running LAB on Bedrock.
No tasks in it. The measurements behind everything above are in the description, along with two
things I found about LAB itself that changed how I build tasks.

Tell me if 1 or 2 is wrong. Beyond that, a view on whether this task shape is a direction LAB
would want would save me building forty of them — and if that's a Harvey call rather than yours,
that's a useful answer too.

No rush on any of it — reply whenever you get to it.

Volodymyr

---

## Notes to self — NOT part of the message

**Two claims were corrected on re-check, 2026-08-11 — do not restore the earlier wording.**
"Density tracks words" was false: criteria count is flat against words too (rank r +0.18), so the
finding is that the count is a size-independent constant which presupposes material. And the
grounding rate was measured at 92% with a pattern that also matched "Section 14.3" — a contract
clause, present in the contract by construction. Statutory citations only, over the whole corpus
rather than a sample: 77%.

**Deferred to the PR deliberately**, to keep the letter to one screen: the deliverable matcher
hardcoding `model="claude-sonnet-4-6"` so `--judge-model` never reaches it (worth 35.2pp in my
environment; the handler prints and returns `{}`, so a sweep looks complete and is wrong); judge
spend not being recorded anywhere in a run's artifacts; `sources` documented but `[]` on all 219
criteria that carry it; the range-inflation note (max−min grows 1.49x from 3 trials to 6);
`docs/eval-strategies.md` stating 1,660 tasks against 2,010 in the tree.

**Not claimed anywhere, on purpose:**

- **No pack-level score.** The last three-trial figure (74.5% pooled) stopped describing the tree
  after the criteria trim, the seven new tasks and the statutory extracts.
- **No legal-correctness claim.** The rubrics state Ukrainian law and have not been through the
  reviewing advocate. Joel cannot validate that and is not asked to.
- **No spread result.** The study has not run, and the load-bearing hypothesis is currently NOT
  supported by the one mechanism measured: the landing gate was +6.4pp here, the same as his
  published +6.4pp on English.

## Every number in the message, and where it came from

| claim | source |
|---|---|
| `chars // 4` at `build_profile.py:69` | read in the clone |
| est/real 1.05 EN vs 0.61 UA | opus-100 `en-uk`, 40k pairs, measured on local.lex |
| promotion gate formula | `HARNESSES.md` |
| 32,702 vs 299 words; 56/55/57 by doc count | measured over 1,143 graded upstream tasks |
| 60/55/64 by word band; rank r +0.18 | 120 sampled graded upstream tasks |
| padding moved pooled 68% → 87% | two reverted attempts, measured per criterion group |
| 1,030 of 1,336 citations grounded (77%) | ALL 476 graded upstream tasks citing a statute |
| five of nine workspaces lacked the rules | measured, then fixed by adding dated extracts |
| pilot 37/46 and 39/46, 11 and 19 turns | two runs, `bedrock/eu.anthropic.claude-sonnet-4-6` |
| missing-clause 0/12 vs defects 86/87 | seven statute-review tasks, one run each |
| 26 of 46 oracle | counted in `task.json` |
| 406,728 dated editions | `rada_editions` on prod |
| LEXTREME PR #16 merged | checked on GitHub |
