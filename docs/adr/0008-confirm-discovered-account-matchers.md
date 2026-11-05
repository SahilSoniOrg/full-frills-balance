# Confirm discovered account matchers before recognition

Status: Accepted; implemented through Phases 1–8 (feature flag remains for one internal release)

SMS linked to journals can nominate Account matcher suggestions without separate proof that the User explicitly chose an account. Matchers may describe general message patterns or specific account references; the User reviews and confirms the matching conditions before they gain account-recognition authority, and subsequent learning proposes changes without mutating accepted matchers. Ambiguous account or source/destination assignments still require review. Selecting older SMS for configuration analyzes evidence without importing, consuming, or posting the messages, so configuration cannot accidentally invoke SMS rules or change journals.

Accepting a new format adds a matcher by default. Existing matchers retain their coverage until the User explicitly edits, replaces, disables, or forgets them. Account merge follows the same boundary: when duplicate matchers combine, a disabled copy keeps the result disabled, so merging never turns a matcher on.

Recognition that cannot be evaluated is treated as unconfirmed, not as absent: it holds automatic posting for review instead of letting the rule post without its contradiction check.

Configuration uses one Account matcher editor for SMS selection and direct condition editing, backed by one matcher store. Account Edit links to a dedicated SMS recognition management screen so recognition configuration saves independently without crowding the Account form. This keeps preview, saved configuration, and live recognition under one contract. SMS rules retain posting authority; confirmation of recognition conditions does not enable automatic posting.

The [discovery spec](../specs/account-matcher-discovery/spec.md) records the agreed behavior.
