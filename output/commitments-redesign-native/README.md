# Commitments native validation harness

This harness mounts the real `BudgetListView`, `PlannedPaymentListView`, `BudgetDetailView`, and `PlannedPaymentDetailsView` with invented typed view-model fixtures. Planned list `listData` is built with `buildPlannedPaymentListPresentation`; budget rows and summary use production sort/summary helpers. Budget detail's three typed `EnrichedJournal` rows are mapped through the production journal timeline mapper and day-net grouping options, so account legs appear once and Oct 3/Oct 2 sections are newest-first. Lists sit inside real `ScreenWithChrome` and `AppSegmentedControl`, with the live privacy toggle and FloatingActionButton. Budget detail gets real `CommitmentDetailHeaderActions` and a fixture-backed Expense FAB. The actual `CommitmentsScreen` is not mounted because its hooks require database-backed view models; the outer tab shell is an approximation, and navigation/detail actions use inert fixture callbacks. Deep Space fonts must load successfully before the view renders; failure is visible. The harness does not seed or read user finance data.

The native audit from October 2 is in `docs/audits/commitments-native-2026-10-02/`. It contains five iPhone screenshots and no written findings. The screenshots show the pre-redesign card density, outgoing amounts colored red, account chips, and the floating create action overlapping the planned list.

## Build and install

Run from the repository root after the redesign components are ready:

```sh
./output/commitments-redesign-native/run.sh build
./output/commitments-redesign-native/run.sh install
```

The script exports a fresh iOS JS bundle from `entry.tsx`, copies the existing Release simulator `.app` into a task-specific temporary directory, replaces its JS bundle and assets, and installs it on the already available **iPhone 17e** simulator (`7A00412D-BDDA-44E9-94D7-4C8721449B8B`, iOS 26.5). It boots only that simulator. It never targets, shuts down, erases, or reseeds the booted **iPhone 17 Daily** (`47968EC9-CD3F-4B7B-A716-6BEDFB4B4B03`). No dependencies are installed globally.

Interactive harness controls switch among the four views, appearance, privacy, and 390pt/320pt widths. Preset `launch` hides those controls for clean captures, explicitly sets native appearance and Dynamic Type, and constrains the viewport to 390pt or 320pt centered in the 390pt simulator. Its optional content-size argument defaults to `large`; use `accessibility-large` for native large text.

For repeatable screen/theme/width/privacy setups, install once, then launch a preset (the last argument is privacy off/on):

```sh
./output/commitments-redesign-native/run.sh launch budgets dark 390 1 large
./output/commitments-redesign-native/run.sh launch planned light 320 0 accessibility-large
./output/commitments-redesign-native/run.sh launch planned-detail dark 390 0 large paused
./output/commitments-redesign-native/run.sh launch budget-detail dark 390 0 large over-limit
```

The simulator passes these as native process launch arguments, so no URL confirmation prompt interrupts the capture. Dynamic Type remains the simulator's native accessibility setting.

Available fixture arguments are `default`, `nothing-over` (Budgets list), `nothing-spent`, `missing-fx`, `over-limit` (Budget Detail), `paused`, and `ended` (Planned Detail). The over-limit detail uses the same ₹14,680 chart/activity as the ₹14,000 budget/usage hero. Paused and ended models clear occurrence posting and outstanding-journal actions; ended retains a typed last-recorded journal.

Set a large Dynamic Type category directly on the same simulator with `./output/commitments-redesign-native/run.sh content-size accessibility-large` (or another category supported by `simctl ui help`).

## Capture after GO

No screenshots are taken by `build` or `install`. After explicit GO, capture the simulator screen to this directory with:

```sh
./output/commitments-redesign-native/run.sh capture <name>
```

Choose a descriptive name for each combination, such as `budget-list-dark-390`, `planned-detail-light-320-privacy`, or `budget-detail-large-text`. Preset `launch` applies the view and controls as native process arguments. Set Dynamic Type first using `content-size accessibility-large`. The screenshot is native simulator output from the actual app binary and real React Native views; browser or mockup images are not used as evidence.

To rebuild after source changes, run `build` again. The current temporary app path is saved in `/tmp/commitments-redesign-native-app-path`; all copied app files and generated bundle assets stay outside the repository.
