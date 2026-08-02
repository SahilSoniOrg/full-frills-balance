# Account reference graph owns Account FK inventory and policies

Account foreign keys were inventoried in parallel walkers (write assert, delete blockers, import validate/remap). Adding or changing a reference required coordinated edits with no single owner.

We deepen one **Account reference graph** module under `src/services/accounts/` (`accountReferenceGraph`). It owns the WatermelonDB Account FK inventory (including CSV `assetAccountIds` parse/format) and, over a cutover sequence, the policies for write assert, delete block, import salvage/sanitize planning, and the site list merge uses. Commands and import become thin adapters. The site registry is exposed via `referenceSites` for merge and tests — not as a second primary façade.

This is complementary to [ADR-0008](./0008-account-mutations-via-commands.md): mutations still go through named command modules; the graph does **not** reintroduce an `AccountService` lifecycle façade.

_Avoid_: Parallel FK inventories; an AccountService that mixes reference policy with unrelated lifecycles; moving merge rewrite/destroy Watermelon ops into the graph in v1 (enumerate sites only).
