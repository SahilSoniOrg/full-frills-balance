---
description: Propose clean conventional commit message for staged changes
---

# Propose Commit Message
Analyze staged diff (`git diff --cached`) for correctness, then generate conventional commit message.

## 1. Quality Checklist
- **Blockers**: Report any active rule or logic violations before proposing the commit.
- **Rules**: Limit subject to <= 72 chars, use active imperative present tense (e.g. `add`, `fix`), do not include file paths.
- **Vagueness**: Avoid vague subjects like "fix bug" or "update code".

## 2. Commit Format
`<type>(optional-scope): <short summary>`

### Examples:
- `feat(journal): add transaction details hydration`
- `fix(accounts): prevent invalid reorder persistence`
- `refactor(reports): simplify date range derivation`
- `test(data): cover journal edge cases`