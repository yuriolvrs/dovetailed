# CLAUDE.md — Standing rules for this codebase

## Project
Privacy-first job application assistant. See PRD.md for full spec. Work in the phases defined there; do not build ahead of the current phase.

## Engineering principles
General working style, in addition to the project-specific rules below (Conventions/Guardrails win on overlap).

**Think before coding.** State assumptions explicitly rather than guessing silently. If a request has multiple valid interpretations, present them instead of picking one unannounced. If a simpler approach exists than what was asked for, say so and push back before building the complicated version.

**Simplicity first.** Write the minimum code that solves the problem — no speculative features, no configurability that wasn't requested, no abstraction built for a single call site, no error handling for scenarios that can't occur. If a first draft came out bloated, rewrite it smaller before moving on.

**Surgical changes.** Touch only what the request requires. Don't refactor, reformat, or "improve" adjacent code/comments while in a file for an unrelated reason, and match existing style even when you'd choose differently. Clean up only the imports/variables/functions your own change made unused — flag pre-existing dead code instead of deleting it.

**Goal-driven execution.** Turn vague asks into a verifiable goal before starting ("fix the bug" → reproduce it, then make the repro pass). For multi-step work, state a short plan up front with a concrete check per step, so progress can be verified without stopping to ask at each one.

## Architecture invariants (never violate)
- All user data lives in the browser via Dexie/IndexedDB. Never add server-side storage, logging of user content, or analytics on content.
- The frontend never contains or receives an LLM API key. All LLM calls go through the Cloudflare Worker proxy.
- The proxy is stateless: forward, return, forget.
- Documents (resume, cover letter) are rendered views over structured JSON. Never store generated documents as opaque text blobs; always structured, field-editable content.
- LaTeX filling is deterministic code. The LLM only performs the one-time template-to-placeholder conversion, never per-generation LaTeX edits.
- LLM provider is abstracted in one module (`src/lib/llm.ts`); no provider-specific code elsewhere.

## Conventions
- Every new file gets a short header comment at the very top: one line explaining what it is/does in normal technical terms, and one line in plain English (`// In plain terms: ...`). Skip only where the format has no comment syntax (strict JSON) or the file is already self-describing prose (the root .md docs).
- Every new non-trivial function or class gets a description comment above it (JSDoc or `//`), same as file headers: one line/paragraph in normal technical terms, plus a plain-English line (`In plain terms: ...`). Skip only for trivial one-liners whose name already says everything (e.g. a short getter/wrapper).
- Write prose (explanations, commit bodies, comments, docs) following ASD-STE100 simplified technical English about half the time: short sentences, one idea per sentence, plain approved words, active voice.
- TypeScript strict mode everywhere, including the Worker.
- Shared types for all data models live in `src/types/` and are the single source of truth; Dexie tables and prompts derive from them.
- LLM prompts request JSON-only output; parse defensively (strip fences, validate shape, one retry). Prompt templates live in `src/prompts/`.
- Anti-fabrication: generation prompts must require sourceMap evidence; UI flags unevidenced claims.
- Unit tests (Vitest) required for: LaTeX escaping/filling, JSON export/import, schema validation. Mock all LLM calls in tests.
- Keep dependencies minimal; justify any new package.
- Before adding a new function, component, table, or UI pattern, search the codebase for an existing one that already does it (or close to it). Reuse or extend it rather than writing a duplicate. If similar UI already exists (tables, forms, buttons, cards, empty states), match its structure/styling so the app looks and behaves uniformly rather than each screen inventing its own look.

## Guardrails
- Do not invent APIs, packages, or provider endpoints. Before using any external API or npm package, verify it exists (check official docs or the package registry). If unsure, say so and ask rather than guessing.
- If information needed to proceed is missing from PRD.md or the codebase, stop and ask — never fill gaps with assumptions on architecture, data handling, or provider behavior.
- Never run destructive commands: no `rm -rf` outside the project, no `git push --force`, no deleting branches, no dropping/clearing user-facing storage logic.
- Never deploy (`wrangler deploy`, Pages settings) or change DNS/account settings without explicit confirmation in that session.
- Never commit secrets, .env files, or API keys; never print secret values.
- Do not add telemetry, analytics, error reporters, or any network calls beyond the LLM proxy without explicit approval.
- Make small, reviewable changes; commit at logical checkpoints with clear messages. Do not rewrite files wholesale when a targeted edit works.
- Commit messages contain only the conventional-commit subject and body. Never add a `Co-Authored-By` trailer, never add Claude as a co-author, and never append "Generated with Claude Code" or any similar attribution line.
- After completing work, update PROGRESS.md truthfully — only mark items done that are implemented AND tested. Never claim tests pass without running them.
- Stay in scope. Multiple Claude Code sessions may be running on this repo at once, each on a different task — touching files outside what was asked risks colliding with another session's in-progress work and burns time/tokens reading unrelated code. Only read or edit files relevant to the current request; don't proactively explore, "fix while I'm here," or review other parts of the codebase unless asked. If something out of scope looks broken, mention it instead of touching it. Before broad operations (repo-wide search/refactor, `git status`/`git diff` review, running the full test suite) confirm they're actually needed for the task at hand rather than doing them by default.

## Commands
- Frontend dev: `npm run dev`
- Tests: `npm run test`
- Worker deploy: `npx wrangler deploy` (from `worker/`)
- Secrets: `npx wrangler secret put <NAME>` — never commit secrets or .env files.
