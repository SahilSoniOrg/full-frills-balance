# Conversational Onboarding: Cash Clarity Storyboard

**Status:** Living design for canonical `/onboarding`
**Date:** 2026-09-10
**Target:** Expo / React Native, iOS and Android
**Parent architecture:** [`docs/plans/setup-simplification-plan.md`](../plans/setup-simplification-plan.md)

**Shipped first-run** is Scenes 0–7 below. Collectors use type chips and editable rows, not one-question branches. Chrome matches the rest of onboarding (stage label, progress bar, a large Safe to Spend number, heard line).

**Not in the first-run product yet** — keep these in this doc as later work: post-onboarding dashboard coachmark, optional capability tour (SMS, voice, notifications, app lock, appearance). Sample workspace is intentionally not an entry path.

**Not in the first-run product yet** — keep these in this doc as later work: post-onboarding dashboard coachmark, optional capability tour (SMS, voice, notifications, app lock, appearance). Sample workspace is intentionally not an entry path.

## The product question

When someone opens Full Frills Balance for the first time, can they understand one useful answer quickly?

> **What do I have, what is coming, what is already spoken for, and what can I safely spend?**

Onboarding is successful when the user sees a believable Safe to Spend number and understands why it has that value. It is not successful because the user completed every setting.

## The central story

The app should feel like a calm conversation, not an accounting form.

The user gives the app a few facts. The app reflects each fact back in a living cash picture:

```text
What I have now
        +
What is coming in
        −
What is already committed
        −
What I want to reserve for everyday life
        =
What I can safely spend
```

The number at the top is not a decoration or a tutorial counter. It is the reason for every question.

## Product decisions

### No login gate

The current product promise is private, offline-first, and usable without a cloud account. A login screen at the beginning would contradict that promise and introduce anxiety before the user receives value.

The entry choices are:

- **Start with my money** — requires a name on this screen, then the core story
- **Restore a backup** — existing restore journey

Do not offer **Explore a sample workspace** on first run.

If cloud sync is added in the future, account creation can be offered after the user reaches the dashboard, framed around the benefit of sync. It should never be required to begin.

### Two layers, not one long wizard

Onboarding has a short required story and an optional capability tour after the dashboard (not shipped yet; see below).

**Cash clarity core (shipped):**

1. Name on the splash, then currency (workspace is **Personal** with a default icon)
2. Current money (type chips; several accounts allowed)
3. Expected income (source chips; several incomes allowed)
4. Upcoming commitments (type chips; several payments allowed)
5. Everyday spending boundaries (category chips; several allowed)
6. Safe to Spend explanation
7. Review and enter

**Optional after-value setup (not in first-run product yet):**

- Additional accounts and commitments from the live app
- First real expense coachmark
- Android SMS recognition
- Voice entry and quick splits
- Notifications
- App lock
- Theme and other preferences

The user can enter the app after the core story. No capability or permission step should block that transition.

### Collectors, not one field per screen

Each money / income / payment / budget scene is a chip list plus editable rows:

- One question at the top
- **Tap a type to add** chips
- Amount (and cadence / due date where relevant) on each row
- Primary action pinned at the bottom
- **I’ll add this later** / skip when the list is empty
- Compact Safe to Spend strip once the user is in the Now–Reserve stages
- Heard line after continue, for consistency with the rest of the flow

Do not force a salary yes/no tree, a single-account gate, or a food-only first budget. Those were an earlier storyboard draft; the shipped collectors are the source of truth.

## Mobile frame and behavior

### Persistent chrome

After the user leaves the splash, screens use the same onboarding chrome as the rest of the flow:

```text
┌──────────────────────────────────────┐
│  Next                                 │
│  ━━━━━━━━━━━━━━━                       │
│  Safe to spend                         │
│  ₹ 2,002                               │
│  Got it. ₹2,002 in your bank.          │
└──────────────────────────────────────┘
```

- Stage labels: **Space**, **Now**, **Next**, **Protect**, **Reserve**, **Clarity**.
- Back lives on the conversation step, not a separate top-left app chrome.
- The Safe to Spend number is large (not a compact right-aligned strip). It appears from Now through Reserve.
- The heard line sits under the number after a confirmed continue (not on splash, currency, clarity, or review).
- The primary action is pinned to the bottom safe area.
- Choice chips can scroll horizontally; rows scroll vertically inside the screen.

### Transitions

The preview is live with the draft:

1. Adding a chip, editing an amount, or changing a date updates Safe to Spend as the draft changes.
2. Continue captures a heard line and advances.
3. Skip is a valid answer and also advances with copy that says what was left out.

Do not wait for continue before the strip moves. A ticking number after every draft change is expected.

### Skip behavior

Skipping is a valid answer, not a failure state.

Examples:

- No accounts: Safe to Spend stays empty until cash exists; planned income or payments require a spendable account first.
- No income: Safe to Spend uses only money currently available.
- No planned payment: no obligation is reserved.
- No budget: the projection remains unbuffered for that category.
- No SMS permission: the app continues with manual entry (later capability, not first-run).

The copy should say what was left out, not pressure the user to complete it.

## Storyboard

### Scene 0 — Open the app

**Purpose:** Establish trust, collect a name, and give a clear first choice.

**User sees:**

```text
          A calmer way to track money

       Know what you can actually spend.

   Your bank balance doesn’t know about next
   week’s bills. We do the quiet math so you
   always know what’s safe today.

   What should we call you?
   [ Alex                               ]

   [ Start with my money                ]

   Already have your data?
   [ Restore a backup                   ]

   Private · stays on this device
   [ Read the privacy notice            ]
```

**Behavior:**

- Name is required before **Start with my money**.
- **Start with my money** enters workspace setup, then the core collectors.
- **Restore a backup** opens the existing restore flow.
- Privacy acknowledgement is required by the current setup architecture (sheet before start or restore if not yet acknowledged).
- Do not request OS permissions here.
- Do not ask for a login.
- Do not offer a sample workspace.

### Scene 1 — Currency

**Purpose:** Pick a currency. Workspace name and icon are defaulted (**Personal**, home icon) so this is not a naming screen.

**User sees:**

```text
        Choose your main currency

        [ ₹ INR ▾                          ]

                         [ Continue ]
```

Currency defaults from the device locale and remains editable. Continue goes straight to money. Safe to Spend is explained on the later cash-clarity page, not as a separate Why step. Review can still edit the person’s name and currency; it does not reopen a workspace identity step.

### Scene 2 — What do you have today?

**Purpose:** Give the projection a trustworthy starting point.

**User sees:**

```text
     Safe to spend
     ₹ 50,000

     What money exists right now?
     Start with the account you use most.

     Tap a type to add
     [ Bank ] [ Cash ] [ Savings ] [ Card ]

     Bank                    [ ₹ 50,000 ]
     Savings  [ spend / protect ]
                             [ ₹ 12,000 ]
     Card     outstanding    [ ₹  8,000 ]
              pay on 1 Oct   [ ₹  4,000 ]

     [ I’ll add this later ]
     [ Continue to what comes next ]
```

**Behavior:**

- Type chips add rows. Several accounts on this screen are expected.
- Skip is available only while the list is empty.
- Savings asks whether it is available to spend or protected.
- Credit Card is a liability: outstanding balance plus expected payment amount and date. Cards must never inflate liquid Safe to Spend.
- If the user plans a card payment without a spendable account, send them back to add one.
- On continue, the heard line summarises what they added.

### Scene 3 — What money comes in?

**Purpose:** Model known inflows without pretending uncertain money has arrived.

**User sees:**

```text
     Where does it usually come from?

     Tap a type to add
     [ Salary ] [ Family ] [ Retirement ]
     [ Freelance ] [ Other ]

     Salary     [ ₹ 80,000 ]
                [ Monthly ] [ Next 25 Sep ]

     [ Skip for now ]
     [ Continue ]
```

**Behavior:**

- Source chips add rows. Several incomes on this screen are expected.
- Each row has amount, interval (monthly / every 2 weeks / weekly), and next date.
- Skip with an empty list: no expected income; Safe to Spend is only cash on hand.
- Recurring answers preview planned income in the app. Do not invent a forecast for irregular or unknown income (that branch is not in the shipped collector).
- Safe to Spend grows only for expected income inside the projection window.
- Copy should say **expected income** or **recurring income**, not “available cash.”
- Planning income requires a spendable account.

### Scene 4 — What should be protected?

**Purpose:** Make the main value of the product tangible: the bank balance is not the whole story.

**User sees:**

```text
     What payment would you hate to forget?

     Tap a type to add
     [ Rent / mortgage ] [ Subscription ]
     [ Loan / EMI ] [ Utilities ]

     Rent / mortgage    [ ₹ 25,000 ]
                        [ Due 1 Oct ]

     [ Nothing yet ]
     [ Protect this payment ]
```

**Behavior:**

- Type chips add rows. Several payments on this screen are expected.
- Skip with an empty list: nothing reserved.
- Examples are placeholders, never pre-filled user data.
- A planned payment is not a posted transaction. It reserves a future projection only.
- If the selected source is a card or liability, keep the obligation distinct from the account balance.
- Planning a payment requires a spendable account.

### Scene 5 — What should have a boundary?

**Purpose:** Introduce budgets as a helpful guardrail, not a moral judgment.

**User sees:**

```text
     What should have a boundary?
     Start with food, then add other
     boundaries if you want.

     Tap a type to add
     [ Food ] [ Transport ] [ … ]

     Food               [ ₹ 8,000 / month ]

     [ I’ll add this later ]
     [ Continue ]
```

**Behavior:**

- Category chips add rows. Several boundaries on this screen are expected; food is the first chip, not a separate gated scene.
- Skip with an empty list: “No everyday buffer included.”
- Interval and category are explicit in review; account-scope stays on sensible defaults.
- Setting a buffer requires a spendable account.

### Scene 6 — The first aha moment

**Purpose:** Let the user understand the calculation, not merely see a number.

**User sees:**

```text
     Here is your cash clarity.
     over the next 30 days

     Safe to spend
     ₹ 37,000

     What you can spend today
     Cash you have              ₹50,000
     Held until money arrives   −₹13,000

     Still on the way
     Expected income            +₹80,000
     Planned payment            −₹25,000
     Food buffer                −₹8,000

     Safe to Spend is cash you already have,
     after holding what you will need before
     money arrives.

     [ 30-day projection — drag to inspect ]

     Now                         ₹50,000
     Next                       +₹80,000
     Protect                    −₹25,000
     Reserve                    −₹8,000
```

Drag across the projection to see the cash line on each day and the events that move it. Same engine as the dashboard chart.

If the draft is empty, say that the number will follow cash they actually have, or that nothing is held yet.

The exact displayed value must come from the same projection semantics used by the real Dashboard. The storyboard should not invent a second formula.

The breakdown should explain why the visible number can differ from the raw balance. If liabilities, existing journal activity, or the lowest projected balance affect the result, the detail view should name them clearly.

**Do not include a fake first expense in this calculation.** An actual expense belongs to Activity and should be the next contextual action after the user enters the dashboard.

### Scene 7 — Review and enter the app

**Purpose:** Give the user confidence that the app understood them and let them leave.

**User sees:**

```text
     Your first cash picture

     You                     Alex
     Workspace               Personal
     Currency                INR
     Bank                    ₹50,000
     Income                  +₹80,000 on 25 Sep
     Payments                −₹25,000 on 1 Oct
     Buffer                  −₹8,000 / month
     Safe to Spend           ₹37,000

     [ Enter my dashboard ]
     [ Change something ]
```

The review is not a second setup form. Each row links back to its question (name, workspace, currency, money, income, payments, buffer). **Change something** returns to the money collector.

On final confirmation:

- Create the workplace and selected accounts/categories.
- Create opening-balance journals for entered starting balances.
- Create planned income and expense payments.
- Create the starter budgets.
- Apply only the preferences the user explicitly chose.
- Commit the draft atomically through the existing setup finishing path.

## Post-onboarding continuation

Not in the first-run product yet. The dashboard should be populated, but it should not trap the user in another tour.

### First dashboard state

The first dashboard shows:

- Safe to Spend with the user’s actual number
- A short 30-day projection
- The next expected income
- The protected planned payment
- The starter budget buffer
- The account balance

### One contextual next action

Use one gentle coachmark:

```text
     Your picture is ready.
     Record one real expense to see it update.

     [ Add first expense ]       [ Later ]
```

After the user records an expense, the Safe to Spend card can explain the change. This is the right place to demonstrate the Activity loop because the user now has a meaningful baseline.

## Optional capability tour

Not in the first-run product yet. This is a separate, dismissible layer after the dashboard is usable.

### Android SMS recognition

Show only on Android and only after the user has seen the core value:

```text
     Want less manual entry?

     On this device, Full Frills can look for bank SMS messages
     and show you possible transactions to review.

     [ Try SMS recognition ]
     [ Maybe later ]
```

Rules:

- Explain exactly what is read and that candidates require review.
- Show parsed examples as a preview, never silently post them.
- Ask for the OS permission only after the user taps the feature action.
- Do not claim “zero telemetry” unless that is a verified product guarantee.

### iOS and cross-platform shortcuts

Use a separate capability card for:

- Voice entry
- Quick splits
- Fast manual entry

Do not present Android SMS and iOS voice as if they are the same capability. The content should adapt to the platform.

### Notifications

Ask in context after a planned payment exists:

> “Want a reminder before Rent is due?”

The user should be able to choose **Turn on reminders** or **Not now**. Request the OS notification permission only after that choice.

### App lock and appearance

Offer these from a post-onboarding “Make it yours” card or Settings:

- Face ID / Touch ID / fingerprint app lock
- Theme and appearance
- Backup/export

They are valuable housekeeping features, but they do not explain why the product exists. They should not delay the first Safe to Spend result.

## Projection rules the UI must respect

The onboarding preview is transient, but its meaning must match the production projection engine.

At the design level, the user should understand:

```text
Safe to Spend =
  spendable liquid balances
  + dated inflows inside the projection window
  − planned payments and liability obligations
  − budget reserves according to the app’s projection rules
```

Implementation constraints:

- Use the existing `CashFlowSimulationService` semantics through a pure draft adapter. Do not implement a second arithmetic formula in the UI.
- Keep the draft in memory until final confirmation, using the resumable setup architecture.
- Do not write opening balances, planned payments, budgets, or preferences before the final commit.
- Preserve the distinction between planned, scheduled, posted, and skipped items.
- Opening balances must become balanced journal entries, not raw account mutations.
- The preview must handle skipped income without inventing a forecast.

The draft model will need to represent more than a label and amount. Planned income and expense inputs need destination/source accounts, currency, recurrence details, next occurrence, and review/posting behavior. This should extend the existing setup slices rather than bypassing them with an unrelated one-off setup object.

## What is intentionally out of the core story

- Login or cloud account creation
- Sample / demo workspace as a first-run door
- Salary yes/no and irregular-income interview trees
- One-account or one-bill or food-only gates (chips allow more; none are required)
- Full account inventory and full category taxonomy as a requirement
- First posted transaction
- SMS, notification, or biometric permission prompts
- Theme selection
- Reports and advanced accounting education

These belong after the user has seen the core answer, when the user actively asks for them, or not at all on first run.

## Validation criteria

The flow is working if a new user can:

- Explain Safe to Spend in their own words after completing the core.
- Reach a meaningful projected number without entering historical transactions.
- Understand why that number differs from their bank balance.
- Skip income, bills, or budgets without feeling blocked.
- Enter the dashboard and find their balance, planned payment, and budget without a tutorial tour.
- Add their first real expense as the next natural action (later; not gated in first-run).

The flow is failing if users:

- Ask why the app needs a login before showing anything.
- Think a planned payment has already been posted.
- Treat a credit-card balance as spendable cash.
- Confuse a budget reserve with a bill.
- Abandon before seeing the Safe to Spend explanation.
- Receive OS permission prompts before they understand the benefit.

## Verdict

The storytelling direction makes sense. The winning version is not “ask every financial question up front.” It is:

> **Ask the smallest set of questions that makes Safe to Spend believable, then reveal the rest of the product at the moment it becomes useful.**

This storyboard is the design source of truth for `/onboarding`. The HTML prototype and the older one-question-per-branch frames are visual history, not the shipped interaction model.
