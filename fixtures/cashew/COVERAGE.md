# Cashew export fixtures

Generated from the Cashew web app (6.7.2+521). The `.sql` file is a raw SQLite
database, not SQL text; `PRAGMA user_version` is 48. `cashew-full-2026-10-29.rows.json`
is a table dump used by the fixture-driven plugin test (Jest mocks `expo-sqlite`).

| Fixture | Contents |
| --- | --- |
| `cashew-full-2026-10-29.sql` | 3 wallets, 14 categories, 7 transaction rows, 1 budget, 2 objectives; includes USD and EUR accounts, a paired transfer, one recurring payment, one savings goal, and one lent loan. |

## Full export table counts

| Table | Rows | Import coverage |
| --- | ---: | --- |
| `wallets` | 3 | Asset accounts with currency, color/icon, ordering, and archived state. Cashew emoji icons and sharing metadata are omitted. |
| `categories` | 14 | Income/expense category accounts with color/icon, ordering, archived state, and `main_category_pk` hierarchy. `Hardware` is nested under `Loans`. Emoji icons are omitted. |
| `transactions` | 7 | 5 paid events (the paired transfer uses 2 linked rows) and 1 unpaid recurring payment. Imports amount, date, note, wallet, category/subcategory, recurrence, paired transfers, and loan movements. Goal links (`objective_fk`), budget exclusions, tags, sharing metadata, and reminder/creation flags are omitted (goal txs skipped with a warning). |
| `budgets` | 1 | Amount, active state, category scopes (`category_fks`), funding wallets (`wallet_fks` → `CanonicalBudget.assetAccountIds`), start month, and recurrence. Empty `category_fks` skips the budget (`EMPTY_BUDGET_SCOPE`). Income budgets are skipped. |
| `objectives` | 2 | Type 1 loan imports as a receivable asset or loan liability; linked loan movements import as transfers. Type 0 savings goals have no FFB equivalent and are not restored. |
| `app_settings` | 1 | Cashew preferences and cached exchange rates are not imported. FFB refreshes its own exchange rates after restore. |
| `associated_titles` | 4 | Cashew category/title autocomplete rules; FFB has no equivalent import surface. |
| `category_budget_limits` | 0 | Per-category budget caps; no FFB mapping yet. |
| `tags` | 0 | No FFB tag model; tags are not imported. |
| `transaction_to_tag_links` | 0 | No FFB tag-link model; links are not imported. |
| `scanner_templates` | 0 | Cashew receipt-scanner templates; no FFB equivalent. |
| `delete_logs` | 0 | Cashew deletion tombstones; not imported. |

## Schema compatibility

The plugin probes `PRAGMA table_info` per table and selects missing columns as
`NULL AS <name>`, so older Cashew backups without `objective_fk`,
`sub_category_fk`, `wallets.archived`, `budgets.period_length`, etc. still
parse. Preferred columns match Cashew 6.7.x (`user_version` 48).

## Known deferrals

- Wallet/loan/category `order` values can collide across namespaces; sequential renumbering deferred.
- `rows.json` is a mirrored dump of the `.sql` for Jest; regenerate both together when editing the fixture.
- Names/timestamps in the fixture are synthetic samples from the investigation session.

The importer uses the SQLite backup for surfaces that lose relationships in a
tabular export: paired transfers, subcategories, and loan movements.
