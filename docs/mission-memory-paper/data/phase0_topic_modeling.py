#!/usr/bin/env python3
"""
Phase 0 Enhancement: Topic Modeling of Operator Prompt Corpus

Input: 925 prompts from orphan git commits (Phase 0 bridge).
Analysis:
  - BERTopic for topic discovery on user prompts
  - Intent classification (distribution of prompt types)
  - Cross-project switching patterns
  - Session-level topic dynamics

Output: JSON with topics, distributions, and switching patterns.
"""

import json
import os
import subprocess
from collections import Counter, defaultdict
from datetime import datetime

import numpy as np

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "phase0_topics.json")
CORPUS_FILE = "/tmp/prompt_corpus.json"


def load_corpus() -> list[dict]:
    """Load prompts from saved corpus or extract from git."""
    if os.path.exists(CORPUS_FILE):
        with open(CORPUS_FILE) as f:
            return json.load(f)

    result = subprocess.run(
        ["git", "log", "--all", "--format=%H"],
        capture_output=True, text=True,
        cwd="/home/vovkes/.claude/prompt-corpus.git"
    )
    hashes = result.stdout.strip().split("\n")
    prompts = []
    for h in hashes:
        r = subprocess.run(
            ["git", "show", f"{h}:prompt.json"],
            capture_output=True, text=True,
            cwd="/home/vovkes/.claude/prompt-corpus.git"
        )
        if r.returncode == 0:
            try:
                prompts.append(json.loads(r.stdout))
            except json.JSONDecodeError:
                pass
    return prompts


def classify_intent(text: str) -> str:
    """Rule-based intent classification for operator prompts."""
    t = text.lower().strip()

    if any(w in t for w in ["fix", "баг", "bug", "ошибк", "помилк", "error", "broken", "не працює", "не работает", "crash"]):
        return "bug_fix"
    if any(w in t for w in ["deploy", "деплой", "розгорн", "продакшн", "prod", "ci/cd", "pipeline"]):
        return "deploy"
    if any(w in t for w in ["додай", "добавь", "add", "створи", "create", "new", "implement", "зроби", "сделай"]):
        return "feature"
    if any(w in t for w in ["рефактор", "refactor", "clean", "перейменуй", "rename", "move"]):
        return "refactor"
    if any(w in t for w in ["тест", "test", "spec", "перевір", "проверь", "check"]):
        return "test_verify"
    if any(w in t for w in ["commit", "push", "pr ", "pull request", "merge", "branch", "коміт"]):
        return "git_ops"
    if any(w in t for w in ["поясни", "explain", "як ", "как ", "how", "what", "що ", "show", "покажи", "подивись", "look", "давай", "let's"]):
        return "explore_discuss"
    if any(w in t for w in ["знайди", "найди", "search", "шукай", "grep", "find", "where"]):
        return "search"
    if any(w in t for w in ["аналіз", "анализ", "analyz", "статист", "datas", "paper", "стаття", "article"]):
        return "analysis"
    if any(w in t for w in ["конфіг", "config", "setting", "env", "nginx", "docker"]):
        return "config"
    return "other"


def analyze_switching_patterns(prompts: list[dict]) -> dict:
    """Analyze cross-project switching patterns."""
    # Sort by timestamp
    timed = []
    for p in prompts:
        ts = p.get("timestamp", "")
        if ts:
            try:
                dt = datetime.fromisoformat(ts)
                timed.append({"dt": dt, "repo": p.get("repo", "?"),
                              "session": p.get("session_id", "?")})
            except ValueError:
                pass

    timed.sort(key=lambda x: x["dt"])

    # Transitions between repos
    transitions = Counter()
    for i in range(1, len(timed)):
        if timed[i]["repo"] != timed[i - 1]["repo"]:
            transitions[(timed[i - 1]["repo"], timed[i]["repo"])] += 1

    # Sessions per repo
    session_repos = defaultdict(set)
    for t in timed:
        session_repos[t["session"]].add(t["repo"])

    multi_repo_sessions = sum(1 for repos in session_repos.values() if len(repos) > 1)

    # Time gaps at repo switches
    switch_gaps = []
    for i in range(1, len(timed)):
        if timed[i]["repo"] != timed[i - 1]["repo"]:
            gap_min = (timed[i]["dt"] - timed[i - 1]["dt"]).total_seconds() / 60
            switch_gaps.append(gap_min)

    return {
        "total_transitions": sum(transitions.values()),
        "top_transitions": [
            {"from": f, "to": t, "count": c}
            for (f, t), c in transitions.most_common(10)
        ],
        "multi_repo_sessions": multi_repo_sessions,
        "total_sessions": len(session_repos),
        "switch_gap_minutes": {
            "mean": round(float(np.mean(switch_gaps)), 1) if switch_gaps else 0,
            "median": round(float(np.median(switch_gaps)), 1) if switch_gaps else 0,
        },
    }


def run_bertopic(texts: list[str], repos: list[str]) -> dict:
    """Run BERTopic topic modeling."""
    from bertopic import BERTopic
    from sklearn.feature_extraction.text import CountVectorizer

    # Filter short texts
    valid = [(t, r) for t, r in zip(texts, repos) if len(t) >= 10]
    if not valid:
        return {"error": "no valid texts"}
    texts_clean, repos_clean = zip(*valid)
    texts_clean = list(texts_clean)

    vectorizer = CountVectorizer(stop_words=None, min_df=2, max_df=0.95)

    topic_model = BERTopic(
        language="multilingual",
        min_topic_size=5,
        vectorizer_model=vectorizer,
        verbose=False,
    )

    topics, probs = topic_model.fit_transform(texts_clean)

    # Topic info
    topic_info = topic_model.get_topic_info()
    topic_details = []
    for _, row in topic_info.iterrows():
        tid = row["Topic"]
        if tid == -1:
            label = "outliers"
        else:
            label = f"topic_{tid}"
        topic_details.append({
            "topic_id": int(tid),
            "label": label,
            "count": int(row["Count"]),
            "name": str(row.get("Name", "")),
            "words": [w for w, _ in topic_model.get_topic(tid)][:8] if tid != -1 else [],
        })

    # Topic distribution per repo
    repo_topics = defaultdict(lambda: Counter())
    for text_idx, (topic, repo) in enumerate(zip(topics, repos_clean)):
        repo_topics[repo][topic] += 1

    repo_topic_dist = {}
    for repo, tc in repo_topics.items():
        total = sum(tc.values())
        repo_topic_dist[repo] = {
            "total": total,
            "topics": {str(t): c for t, c in tc.most_common(5)},
        }

    return {
        "n_texts": len(texts_clean),
        "n_topics": len([t for t in topic_details if t["topic_id"] != -1]),
        "n_outliers": sum(1 for t in topics if t == -1),
        "topics": topic_details,
        "by_repo": repo_topic_dist,
    }


def main():
    print("Loading prompt corpus...")
    corpus = load_corpus()
    print(f"  {len(corpus)} total prompts")

    # Separate user prompts from system
    user_prompts = [p for p in corpus if not p.get("prompt", "").startswith("<")]
    system_prompts = [p for p in corpus if p.get("prompt", "").startswith("<")]
    print(f"  {len(user_prompts)} user prompts, {len(system_prompts)} system")

    # === Intent classification ===
    print("\nIntent classification...")
    intents = Counter()
    intent_by_repo = defaultdict(Counter)
    for p in user_prompts:
        intent = classify_intent(p["prompt"])
        intents[intent] += 1
        intent_by_repo[p.get("repo", "?")][intent] += 1

    print("  Distribution:")
    for intent, count in intents.most_common():
        print(f"    {intent}: {count} ({count/len(user_prompts)*100:.1f}%)")

    # === Repo distribution ===
    repos = Counter(p.get("repo", "?") for p in user_prompts)
    print(f"\nRepo distribution:")
    for r, n in repos.most_common(8):
        print(f"  {r}: {n}")

    # === Switching patterns ===
    print("\nSwitching patterns...")
    switching = analyze_switching_patterns(user_prompts)
    print(f"  {switching['total_transitions']} repo transitions")
    print(f"  {switching['multi_repo_sessions']}/{switching['total_sessions']} multi-repo sessions")
    if switching["top_transitions"]:
        print(f"  Top: {switching['top_transitions'][0]}")

    # === BERTopic ===
    print("\nRunning BERTopic...")
    texts = [p["prompt"] for p in user_prompts]
    repos_list = [p.get("repo", "?") for p in user_prompts]

    try:
        bt_results = run_bertopic(texts, repos_list)
        print(f"  {bt_results['n_topics']} topics, {bt_results['n_outliers']} outliers")
        for t in bt_results["topics"][:10]:
            if t["topic_id"] != -1:
                words = ", ".join(t["words"][:5])
                print(f"    Topic {t['topic_id']}: {t['count']} docs — {words}")
    except Exception as e:
        print(f"  BERTopic failed: {e}")
        bt_results = {"error": str(e)}

    # === Temporal patterns ===
    by_date = defaultdict(int)
    by_hour = defaultdict(int)
    for p in user_prompts:
        ts = p.get("timestamp", "")
        if ts:
            try:
                dt = datetime.fromisoformat(ts)
                by_date[dt.strftime("%Y-%m-%d")] += 1
                by_hour[dt.hour] += 1
            except ValueError:
                pass

    # === Prompt length distribution ===
    lengths = [len(p["prompt"]) for p in user_prompts]

    # === Build results ===
    results = {
        "corpus_stats": {
            "total_prompts": len(corpus),
            "user_prompts": len(user_prompts),
            "system_prompts": len(system_prompts),
            "unique_sessions": len(set(p.get("session_id", "") for p in corpus)),
            "unique_repos": len(repos),
            "date_range": {
                "start": min(p.get("timestamp", "9") for p in corpus),
                "end": max(p.get("timestamp", "0") for p in corpus),
            },
        },
        "prompt_lengths": {
            "mean": round(float(np.mean(lengths)), 0),
            "median": round(float(np.median(lengths)), 0),
            "p90": round(float(np.percentile(lengths, 90)), 0),
            "max": max(lengths),
        },
        "intent_distribution": {
            intent: {
                "count": count,
                "pct": round(count / len(user_prompts) * 100, 1),
            }
            for intent, count in intents.most_common()
        },
        "intent_by_repo": {
            repo: dict(intents_counter.most_common(5))
            for repo, intents_counter in sorted(
                intent_by_repo.items(),
                key=lambda x: -sum(x[1].values())
            )[:8]
        },
        "repo_distribution": {
            r: {"count": n, "pct": round(n / len(user_prompts) * 100, 1)}
            for r, n in repos.most_common()
        },
        "switching_patterns": switching,
        "temporal": {
            "by_hour": dict(sorted(by_hour.items())),
            "active_days": len(by_date),
            "prompts_per_day": {
                "mean": round(float(np.mean(list(by_date.values()))), 1),
                "max": max(by_date.values()) if by_date else 0,
            },
        },
        "bertopic": bt_results,
    }

    print(f"\n{'='*60}")
    print(f"PHASE 0: Topic Modeling Summary")
    print(f"{'='*60}")
    print(f"Corpus: {len(user_prompts)} user prompts, {len(set(p.get('session_id','') for p in corpus))} sessions")
    print(f"Top intents: {', '.join(f'{k}={v}' for k,v in intents.most_common(5))}")
    print(f"Active days: {len(by_date)}, prompts/day: {results['temporal']['prompts_per_day']['mean']}")

    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nSaved: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
