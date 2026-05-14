---
license: cc-by-4.0
task_categories:
  - graph-ml
  - text-classification
language:
  - uk
tags:
  - legal
  - citation-graph
  - network-analysis
  - Ukrainian
  - court-decisions
  - EDRSR
  - ontology
pretty_name: "Ukrainian Legal Citation Graph: 502M Edges from 100M Court Decisions"
size_categories:
  - 1M<n<10M
---

# Ukrainian Legal Citation Graph

Aggregated citation statistics from the paper:

> **Automatic Construction of a Legal Citation Graph from 100 Million Ukrainian Court Decisions: Large-Scale Extraction, Topological Analysis, and Ontology-Driven Clustering**
> Volodymyr Ovcharov (LEX AI LLC, Kyiv, Ukraine)

## Dataset Description

This dataset contains aggregated citation statistics from the complete Unified State Register of Court Decisions (EDRSR) of Ukraine -- 100.7 million decisions, 502 million citation edges, extracted via regex-based pipeline in approximately 5 hours on commodity hardware.

Raw decision texts are not included (they are available from the official EDRSR API at reyestr.court.gov.ua). This dataset provides the citation graph structure.

## Files

### article_stats.csv (1.5M rows)
Legislation articles cited at least 10 times.

| Field | Description |
|---|---|
| law_number | Legislation name (e.g., "Цивільний процесуальний кодекс України") |
| law_article | Article number (e.g., "178", "124") |
| citation_type | One of: codex_article, law_article, constitution, case_reference, supreme_court_ruling, law_by_number |
| total_citations | Total citation count across all decisions |
| unique_decisions | Number of distinct decisions citing this article |

### year_type_stats.csv (114 rows)
Annual citation volume by type (2007-2025).

| Field | Description |
|---|---|
| year | Year of decision |
| citation_type | Citation type |
| citations | Total citations that year |
| unique_decisions | Unique decisions that year |

### domain_stats.csv (30 rows)
Citation distribution by justice domain (1=civil, 2=criminal, 3=commercial, 4=administrative, 5=admin offense).

### cocitation_top100k.csv (100K rows)
Top 100,000 co-citation edges by weight (legislation articles that are frequently cited together by the same decisions).

## Key Statistics

- **Total citation edges**: 502,231,421
- **Unique legislation targets**: 36,958,613
- **Co-citation edges**: 2,328,213
- **Time span**: 2007-2025
- **Power-law exponent**: alpha = 1.57 +/- 0.008
- **Community modularity**: Q = 0.44-0.55
- **Extraction precision**: 1.00 (95% Wilson CI: [0.982, 1.000])

## Citation Type Distribution

| Type | Edges | % |
|---|---|---|
| Codex article | 396M | 78.9% |
| Case reference | 66M | 13.2% |
| Law article | 29M | 5.8% |
| Constitution | 5.6M | 1.1% |
| Supreme Court ruling | 3.0M | 0.6% |
| Law by number | 2.5M | 0.5% |

## Top-10 Most Cited Articles

1. Criminal Code art. 185 (theft) -- 3.3M citations
2. KUpAP art. 130 (drunk driving) -- 3.0M citations
3. Civil Procedure Code art. 178 -- 2.8M citations
4. KUpAP art. 124 (traffic violations) -- 2.5M citations
5. Civil Procedure Code art. 175 -- 2.1M citations

## Citation

```bibtex
@article{ovcharov2026citationgraph,
  title={Automatic Construction of a Legal Citation Graph from 100 Million
         Ukrainian Court Decisions: Large-Scale Extraction, Topological Analysis,
         and Ontology-Driven Clustering},
  author={Ovcharov, Volodymyr},
  year={2026},
  note={arXiv preprint}
}
```

## Links

- Platform: [legal.org.ua](https://legal.org.ua)
- Repository: [github.com/overthelex/SecondLayer](https://github.com/overthelex/SecondLayer)
- EDRSR: [reyestr.court.gov.ua](https://reyestr.court.gov.ua/)
- Companion datasets: [overthelex/oversight-constitution](https://huggingface.co/datasets/overthelex/oversight-constitution)
