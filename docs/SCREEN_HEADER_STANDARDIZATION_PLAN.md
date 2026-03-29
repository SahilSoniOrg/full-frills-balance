# Screen Header Standardization Plan

## Problem

The entrypoint redesign exposed a second consistency issue:

- Some screens rely on the navigation bar title only.
- Some screens duplicate the title inside the content area.
- Some screens hide the navigation title and build a custom in-content header.
- Some screens put creation and management actions in the nav bar, others put them inside the body.

This makes the app feel like adjacent screens were built with different layout rules.

## Goal

Standardize where titles, actions, filters, and summary blocks live so users can predict the top region of every screen.

## Proposed Screen Classes

### 1. List Screens

Examples:

- Accounts
- Budgets
- Planned Payments
- SMS Rules
- Activity

Rules:

- Navigation bar owns the route title and top-right utility actions.
- Content starts with either the list directly or a single summary/filter block.
- Avoid repeating the page title inside the content body using `AppText variant="title"` unless the screen is an intentional exception where the in-content block is the primary identity.
- Move "Search" and utility toggles (e.g., Privacy, Reorder) to the Navigation Bar `headerActions` where possible.
- Primary create action should live either in the nav bar or as the dedicated capture action (FAB), not both.

### 2. Dashboard Screens

Examples:

- Dashboard
- Hub

Rules:

- Navigation bar title may be omitted if the first content block (e.g., Greeting) already acts as the screen identity.
- Top content block can own greeting, summary, and alert controls.
- "Greeting as Identity" is an exception for high-level overview screens only.
- Only one persistent capture action is allowed.

### 3. Detail Screens

Examples:

- Account Details
- Budget Details
- Planned Payment Details
- Transaction Details

Rules:

- Navigation bar owns route title and edit/delete/overflow actions.
- Content header owns the entity summary only.
- Contextual actions tied to the entity body should sit near the section they affect.
- Contextual creation shortcuts are allowed on detail screens when they preserve a high-frequency, prefilled workflow (for example, creating a transaction from a specific account).

### 4. Form Screens

Examples:

- Account Creation
- Budget Edit
- Planned Payment Form
- Journal Entry

Rules:

- Navigation bar title defines mode: `New`, `Edit`, or entity name.
- Footer owns the main submit action.
- Avoid secondary create or management actions in the top content block.

### 5. Tabbed List Screens

Examples:

- Commitments (Budgets vs. Planned)

Rules:

- Navigation bar owns the main title (e.g., `Commitments`).
- Tab switcher sits immediately below the navigation bar at the top of the content area.
- Content changes based on the active tab, but the header remains stable.

## Concrete Refactor Plan

### Phase 1

- Remove duplicated in-body titles where `Screen` already provides a title.
- Prefer `headerActions` for nav-bar utilities on list/detail screens.

Targets:

- Budgets (keep a single labeled create action and remove redundancy elsewhere)
- Planned Payments
- SMS Rules
- Accounts (remove in-body title, move Privacy/Reorder to nav bar)

### Phase 2

- Introduce a reusable `ScreenSectionHeader` for body-level section titles and actions.
- Use it for cases like `Recent Transactions`, `Sub-accounts`, and account detail sections.

### Phase 3

- Define a small set of approved top-region patterns in code comments or docs:
  - `nav title + list`
  - `nav title + summary block + list`
  - `summary identity + capture action + feed`
  - `nav title + entity hero + sections`

### Phase 4

- Audit every tab root and detail screen against those patterns.
- Reject mixed patterns unless the screen has a strong product reason.

## Suggested Standards

- One title owner per screen.
- One primary action owner per screen.
- One place for filters per screen.
- Summary blocks should sit above content, never duplicate navigation identity.

## Immediate Candidates

- Accounts: decide whether the in-content title remains the source of identity or moves fully to the nav bar.
- Commitments: likely needs a standard section-header pattern under the tab switcher.
- Dashboard: keep the greeting as identity, but formalize that as a dashboard-only exception.
