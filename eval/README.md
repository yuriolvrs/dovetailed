# Evaluation harness

Measures tailoring quality on three fictional personas (A nurse to PAS Coordinator, B graduate to MarComm Coordinator, C accountant to Project Coordinator). It calls the real app modules against the real proxy. It is NOT part of `npm run test`.

## Run it

```
npm run eval
```

Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `EVAL_RUNS` | `1` | Generations per persona. |
| `EVAL_PROXY_URL` | `https://dovetailed-proxy.pimp-my-resume.workers.dev` | Proxy to call. Use `http://localhost:8787` for a local Worker. |
| `EVAL_ORIGIN` | `http://localhost:5173` | `Origin` header added to proxy requests (the proxy rejects unknown origins). |

Personas run one after another to stay under the provider's per-minute limits. A run takes a few minutes per persona. Each generation does: profile extraction, atoms, posting analysis, matching, resume selection, cover letter. `fitToOnePage` is skipped because it needs a browser; resumes may be longer than one page.

Output goes to `eval/out/<timestamp>/` (git-ignored):

- `report.json` and `report.md`: all metrics, per run.
- `stacks/<P>.txt` (run 1) and `stacks/<P>-r<N>.txt` (later runs): resume and letter in plain text, one neutral layout, test markers removed.

The metrics unit tests (`eval/metrics.test.ts`) run in the normal `npm run test`.

## Fixtures

`eval/fixtures/` holds, per persona `<P>`: `<P>-resume.txt`, `<P>-posting.txt`, `<P>-key.json` (answer key) and `<P>-keywords.json` (posting keywords, lowercase substrings).

Answer key items: `match` words find the requirements (any substring of the requirement text), `coveredBy` lists profile lines that honestly cover it (empty means a gap is correct), `mustNotBeCoveredBy` lists lines that must not be the reason for a cover. Keep keys small and honest. Change a key only when the profile or posting fixture changes.

Report terms: true cover (cites a `coveredBy` line), false gap (key has a covering line, matcher says gap), false cover (only cites a must-not line), honest gap (key expects a gap and got one), unexpected cover (key expects a gap, matcher found a line; review by hand).

## Judge blind

1. Collect stacks from the runs to compare (for example before and after a change). Rename each file to a random id and keep the id-to-source table in a separate file (the key).
2. Give the renamed stacks to several readers or several fresh model runs. Do not tell them which is which, and do not show them `report.md` or the answer keys.
3. Ask each reader for the same thing: shortlist or reject, the single strongest and weakest sentence, and any claim that looks invented. Use more than one reader and more than one generation (`EVAL_RUNS=3`) because model output varies run to run.
4. Open the key only after all judgments are written. Compare shortlist rates per source.
5. Use the numbers in `report.md` to explain a judgment, not to make it. They are heuristics (the career-change check is a keyword guess).
