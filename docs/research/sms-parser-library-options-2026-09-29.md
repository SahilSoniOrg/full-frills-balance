# SMS parser library options

**Research date:** 2026-09-29

**Scope:** Reusable SMS transaction parsers for an Expo/React Native personal finance app, including worldwide English-language SMS. Sources are project repositories, official product documentation, and package registries. Project feature and coverage claims are self-reported unless otherwise stated.

## Recommendation

There is no clear, mature, permissively licensed, ready-to-install parser with broad worldwide coverage and a direct fit for this TypeScript app. English-only narrows language handling, but does not normalize provider-specific templates, sender IDs, transaction vocabulary, currencies, or date conventions. This is an inference from the candidate architectures and their provider-specific rules.

For worldwide English coverage, evaluate these codebases in a fixture bakeoff before choosing:

1. **ZenMoney `sms-formats`** is the strongest format-corpus lead: community-maintained sender lists, regex rules, field mappings, and real SMS examples, with CI checks for example matches, rule collisions within a bank, capture counts, and allowed fields. It is not a packaged parser SDK; our TypeScript app would need an adapter/runtime for the corpus. I found no license declaration in the public repository, so do not copy or ship its rules until reuse terms are confirmed. [Repository and format schema](https://github.com/zenmoney/sms-formats) · [validation code](https://github.com/zenmoney/sms-formats/tree/main/scripts)

2. **Omoi `omoi-sms-parser`** is the best technical fit to evaluate as a TypeScript parsing design: MIT, on-device, no runtime dependencies, and explicit handling for balances, reversals, future debits, OTPs, and uncertain financial messages. Its README documents `npm install omoi-sms-parser`, but the npm registry returned 404 for that package on the research date. It is therefore a source repository today, not a verified registry dependency. Its README describes an adversarial corpus and tests, but the project is small and independently unvalidated. [Repository README](https://github.com/abhirajsinha/omoi-sms-parser/blob/master/README.md) · [package.json](https://raw.githubusercontent.com/abhirajsinha/omoi-sms-parser/master/package.json) · [parser tests](https://github.com/abhirajsinha/omoi-sms-parser/blob/master/test/parser.spec.ts)

3. **Expense Buddy's parser module** is the clearest explicitly multi-region implementation found: its React Native/Expo app uses a pure Kotlin Android parser with rule packs for India, US, UK, Canada, Australia, and Japan, local processing, and review before import. It is Android-only and AGPL-3.0, and the parser is a module inside an app rather than a JS package. [Repository and parser overview](https://github.com/sudokoi/expense-buddy) · [license](https://github.com/sudokoi/expense-buddy/blob/main/LICENSE)

4. **PennyWise `parser-core`** has evidence of sustained parser maintenance across multiple countries: releases document additions and fixes for Indian, African, Middle Eastern, and other bank formats. It is Kotlin embedded in an app rather than a published JS library, and is AGPL-3.0. [Repository](https://github.com/sarim2000/pennywiseai-tracker) · [release history](https://github.com/sarim2000/pennywiseai-tracker/releases) · [license](https://github.com/sarim2000/pennywiseai-tracker/blob/main/LICENSE)

Do not select by claimed bank count. Run the candidates against this app's anonymized, labeled SMS corpus and measure exact amount/direction, transaction recall, and false-positive rate. In particular, verify that balance, limit, failed-payment, OTP, promo, reversal, and future-debit amounts never become expenses. Keep the current parser as the control and run the candidate in shadow mode before changing imports.

## Candidates

| Candidate | Fit | Strengths | Risks / constraints | Assessment |
|---|---|---|---|---|
| [Expense Buddy SMS parser](https://github.com/sudokoi/expense-buddy) | Kotlin Android parser inside React Native/Expo app | Explicit rule packs for India, US, UK, Canada, Australia, and Japan; on-device; review-first | AGPL-3.0; Android-only; not separately published; repository says coverage is still being broadened | Best multi-region implementation to inspect; not a drop-in dependency |
| [PennyWise `parser-core`](https://github.com/sarim2000/pennywiseai-tracker/tree/main/parser-core) | Kotlin Android parser inside finance app | Broad provider fixes visible in release history; a TypeScript port exists | AGPL-3.0; embedded rather than separately packaged; port is small and unpublished | Good global source/reference if license permits |
| [BankSMSParser](https://github.com/rahatsayyed/BankSMSParser) | TypeScript; README claims React Native/no native dependency | Claims Indian and international bank support, including 120+ banks | AGPL-3.0; README install name (`bank-sms-parser`) differs from manifest (`@lifeos/bank-sms-parser`); both returned 404 from npm; sparse repo history | Not suitable without source verification, packaging cleanup, and license approval |
| [Kotlin `sms-transaction-parser`](https://github.com/peteretelej/sms-transaction-parser) | JVM/Android; native integration required | Apache-2.0; ISO-wide currency detection; JSON templates; typed failures and confidence; generic fallback | README says battle-tested templates cover Kenya; other markets use a fallback and should be reviewed; documented v0.2.0 but no GitHub releases | Best permissive generic engine; provider coverage must be built |
| [ZenMoney `sms-formats`](https://github.com/zenmoney/sms-formats) | Text rule corpus; no packaged parser SDK | Sender lists, regex + positional field mappings, examples, financial fields, CI format validation | No license declaration found; runtime adapter required; project README lists English and Russian docs, which does not establish language coverage of every sample | Best coverage corpus to inspect; legal reuse and English fit need confirmation |
| [Omoi `omoi-sms-parser`](https://github.com/abhirajsinha/omoi-sms-parser) | TypeScript; direct runtime fit | MIT; deterministic; integer minor units; tests cover balance/limit confusion and uncertain transactions | India-specific sender assumptions; npm package returned 404; small project and limited external validation | Useful design reference; outside requested coverage |
| [Dart `transaction_sms_parser`](https://pub.dev/packages/transaction_sms_parser) | Dart/Flutter | MIT; claims 30+ Indian banks, wallet/UPI support, and separate balance extraction | Poor fit for React Native; version 0.0.1 and low package activity | Not practical here |
| [Umber parser](https://github.com/DeepakSilaych/umber) | Kotlin module inside Android app | MIT; pure regex, sender filtering, integer minor units, versioned reparse, review | App source, not a published parser package; Kotlin/native integration required | Useful implementation reference |
| [Dart `transaction_sms_parser`](https://pub.dev/packages/transaction_sms_parser) | Dart/Flutter | MIT; claims 30+ Indian banks, wallet/UPI support, and separate balance extraction | Flutter/Dart package and platform integration are a poor fit for this React Native app; version 0.0.1 and low package activity indicate limited validation | Not a practical dependency here |
| [Umber parser](https://github.com/DeepakSilaych/umber) | Kotlin module inside Android app | MIT; documents pure regex parsing, sender filtering, versioned reparsing, integer paise, and review of uncertain classification | App source, not a published parser library; Kotlin/native integration required | Useful implementation reference, not drop-in |

## Evidence and project fit

### Worldwide coverage and English-only scope

English-only is not equivalent to a universal body grammar. Provider messages still differ in transaction verbs, currency placement, date order, decimal/grouping conventions, and whether they include balances, fees, or references. A practical design is a shared English classifier and safe amount model, with region/provider rule packs and explicit review for unverified patterns.

Expense Buddy is the closest multi-region architecture found: its app documents six region packs, deterministic local extraction, and review before import. Its parser is Kotlin-only and Android-only, and the repository is AGPL-3.0, so it is a reference or potential module extraction—not a cross-platform dependency. [SMS import overview](https://github.com/sudokoi/expense-buddy#auto-import-first) · [license](https://github.com/sudokoi/expense-buddy/blob/main/LICENSE)

The standalone Kotlin parser is the clearest permissive, currency-generic engine: ISO-wide currency detection, JSON templates, and a fallback parser. Its own README says only the Kenya templates are battle-tested; other provider coverage is intended to be added as template data. [README](https://github.com/peteretelej/sms-transaction-parser)

PennyWise release history documents parser work across multiple countries. Its parser is tied to an Android application and AGPL-3.0. A TypeScript port exists, but inherits AGPL and was not available from npm when checked. [Release history](https://github.com/sarim2000/pennywiseai-tracker/releases) · [TypeScript port](https://github.com/rahatsayyed/BankSMSParser)

### ZenMoney

The relevant public repository is [`zenmoney/sms-formats`](https://github.com/zenmoney/sms-formats). It stores sender lists and per-format text files containing a regex, positional `COLUMNS` mappings, and one or more real SMS examples. The schema covers payee, income/outcome, fee/cashback, balances, currencies, dates, comments, and MCC. CI validates that examples match their own rule, do not collide with another rule for the same bank, and have the right number of capture groups. This is useful evidence that the project is more than an unstructured sample dump, and its rules could materially reduce template authoring work. [README/schema](https://github.com/zenmoney/sms-formats/blob/main/README.md) · [validator](https://github.com/zenmoney/sms-formats/tree/main/scripts)

It is still a **data corpus, not a ready-to-call parser package**. A consumer must load/select sender rules, execute the regex, interpret positional fields, normalize amounts/dates/currencies, and handle ambiguity/failure. No license declaration is visible in the public repo, so treat its rule files and examples as unavailable for redistribution until the project owner clarifies permission. The repo's English-language README does not prove that all contributed SMS formats are in English; assess sample language and country coverage from the actual corpus before adoption.

ZenMoney's user-facing behavior is also a useful product reference: its support documentation describes surfacing unknown sender/format cases and letting users submit messages so new templates can be added. The public `ZenPlugins` repo is a separate bank-API sync system, not the SMS format corpus. [SMS support article](https://support.zenmoney.ru/knowledge-bases/2/articles/13-sinhronizatsiya-s-bankom-po-sms) · [ZenPlugins README](https://github.com/zenmoney/ZenPlugins)

### Omoi

The project describes a two-layer design: a DLT sender-ID trust gate and a deterministic body grammar. It says messages are classified into debit, credit, card bill, reversal, upcoming, financial-unparsed, and non-financial; amounts in balance/limit clauses are removed before extraction. That architecture directly addresses two failure modes found in this app: balance amounts being mistaken for transaction amounts and unknown financial messages disappearing instead of reaching review. These are repository claims, not an independent audit. [README](https://github.com/abhirajsinha/omoi-sms-parser/blob/master/README.md) · [parser source](https://github.com/abhirajsinha/omoi-sms-parser/blob/master/src/parser.ts)

The source package manifest identifies version 0.1.0 and MIT, but `npm view omoi-sms-parser ...` returned npm 404 on 2026-09-29. The repository README's npm install command is therefore not usable as documented at this time. A git dependency or vendoring is technically possible but creates versioning and supply-chain maintenance work. [package.json](https://raw.githubusercontent.com/abhirajsinha/omoi-sms-parser/master/package.json)

### PennyWise and Kotlin options

PennyWise is an Android finance app rather than a parser package. Its release notes provide practical evidence of active parser iteration: they mention issues such as Indian Bank `Sent Rs.` UPI debits being dropped, Canara compact debit formats, Kotak refund direction, and subsequent bank additions. That is stronger coverage evidence than an unverified supported-bank count, but it comes with AGPL-3.0 and Kotlin extraction costs. [Release history](https://github.com/sarim2000/pennywiseai-tracker/releases) · [license](https://github.com/sarim2000/pennywiseai-tracker/blob/main/LICENSE)

The standalone Kotlin parser is Apache-2.0 and documents sender/body/time input, explicit parse failures, review confidence, and JSON templates. Its README states that Kenya has 27 built-in provider templates while other markets use a fallback. A package coordinate is documented, but the GitHub releases page had no releases when reviewed. [README](https://github.com/peteretelej/sms-transaction-parser) · [releases](https://github.com/peteretelej/sms-transaction-parser/releases)

### TypeScript port and Flutter package

BankSMSParser is a TypeScript port of PennyWise that says it supports React Native and 120+ banks. Its own package manifest declares `@lifeos/bank-sms-parser` version 1.0.0 and AGPL-3.0, while its README tells users to install `bank-sms-parser`; npm returned 404 for both names on the research date. The discrepancy and sparse repository history make its advertised breadth insufficient evidence for adoption. [README](https://github.com/rahatsayyed/BankSMSParser) · [package.json](https://github.com/rahatsayyed/BankSMSParser/blob/main/package.json)

The Dart package advertises 30+ Indian banks and extensive wallet/UPI parsing, and pub.dev lists MIT. It is published as version 0.0.1 and shows low package activity. Even if its parsing works, bringing Dart/Flutter dependencies into an Expo app would add a runtime/build boundary with little benefit over a TypeScript candidate. [pub.dev package](https://pub.dev/packages/transaction_sms_parser)

## Suggested evaluation

1. Assemble a redacted corpus from current `Failed` records plus known transaction alerts that currently disappear. Keep sender ID, body structure, expected class, expected amount, direction, currency, merchant/reference where known, and whether the message is safe to auto-post.
2. Include hard negatives and multi-amount examples: balance/available limit, card bill, OTP quoting a purchase, failed payment, reversal, future mandate notice, promo, and messages without a transaction amount.
3. Run current parser and candidates on identical fixtures. Report exact-field accuracy separately from transaction detection; optimize first for zero false posts, then recover missed valid messages into a review state.
4. Run the best candidate in shadow mode over historical local SMS. Compare outputs without writing journals or changing user-visible statuses.
5. Only then decide whether to adopt, vendor/fork, or improve the current implementation. Preserve parser version and raw message provenance so stored failures can be replayed after parser changes.

## Local code context

The app is Expo/React Native with TypeScript SMS parsing in `src/services/ledger/SmsParser.ts` and `src/services/ledger/SmsExtractor.ts`. A TypeScript parser avoids a native bridge. A Kotlin parser would need integration through the Android module boundary; iOS would need separate support or a shared JS implementation. The existing repo currently has six SMS fixture types in `src/testing/smsFixtures.ts`, which is not enough to establish broad bank coverage.
