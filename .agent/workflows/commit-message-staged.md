---
description: Review staged diff and produce a conventional commit message when safe
---

Use this workflow on staged changes only (`git diff --cached`).

## Steps
1. Review staged changes for correctness and architectural rule compliance.
2. If blocking issues exist, report them first and do not draft a commit message yet.
3. If safe, propose one conventional commit message and optional alternatives.
4. Commit message must not include file path.

## Commit format
`<type>(optional-scope): <short imperative summary>`

Examples:
- `feat(journal): add transaction details hydration`
- `fix(accounts): prevent invalid reorder persistence`
- `refactor(reports): simplify date range derivation`
- `test(data): cover journal repository edge cases`
- `docs(agent): refresh architecture and coding practices`

## Message quality bar
- Subject <= 72 chars.
- Reflect user-visible or architecture-relevant change.
- Avoid vague subjects like "update stuff".