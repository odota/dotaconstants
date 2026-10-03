# Talent generation and validation

The generator collects talent values from unmodified ability definitions before description formatting. It collects every real talent modifier, ignores upgrade/facet field names as talent names, and matches localization keys and placeholders case-insensitively. Localization supplies signs and units. Talent-owned values have priority 3, equipped hero abilities 2, and other abilities 1. Equally relevant conflicting candidates remain unresolved; traversal order never chooses a winner.

## Value and input compatibility

Candidate comparison retains operation, unit, condition and sequence position. Exact decimal identities make `+10` and `+10.0` equivalent without floating-point rounding or permissive `parseFloat`. The displayed spelling is unchanged for a single candidate; equivalent spellings use a deterministic lexical selection. `+10`, `-10`, `=10`, `x10` and `+10%` have different semantics. Sequences are not sorted. Signed operands such as the snapshot's `+-10`, `+-0.1` and `+-3` are supported. Signs, percentages, decimals, repeated placeholders and multivalues continue to be formatted by localization.

Both `AbilityValues` and the existing nested-attribute form of `AbilitySpecial` are supported. Repeated `AbilitySpecial` attributes retain all modifiers. A modifier object with an explicit `value` supplies its base value; nested `special_bonus_scepter`, `special_bonus_shard` and facet branches remain separate conditional candidates. A conditional-only object has no proven base value, so it blocks unconditional resolution, including a lower-priority obsolete base. Unknown object fields, arrays, invalid strings and invalid types receive diagnostics instead of disappearing. Relevant malformed candidates cannot make another candidate look uniquely reliable. Diagnostics are emitted during generation and included in the audit.

The old collector flattened a nested `special_bonus_scepter` value regardless of equipment context. The existing upgrade formatter applies that field specifically to upgraded values, and the pinned source uses sibling upgrade fields for this purpose. There are **no object-valued talent modifiers in this snapshot**, so the meaning of an actual nested historical object was not independently established. Retaining the conditional candidate and reporting the missing base is a conservative policy, not a claim that an observed historical game value was wrong. Synthetic tests exercise this boundary through the repository implementation.

Missing names use one type-safe rule: absent, empty, whitespace-only and non-string names fail. Valid name contents are preserved.

## Localization metadata and audit scope

The legacy localization supplement also exports tooltip descriptions and notes as independent `special_bonus` keys: its case-sensitive `Description` filter misses lowercase `_description` and does not exclude `_Note0`. This behavior predates the PR. The audit now separates `_description` and `_note<digits>` suffixes case-insensitively when a matching localization token exists, the key has no ability definition, and it is not referenced as a current talent. Actual definitions and current references take precedence over suffixes.

Five records in client 6942 are identified as localization metadata: four descriptions and one note. Three descriptions contain placeholders; two records contain complete text. They are listed separately with their parent names and localization keys, rather than labeled source-resolved talents or missing historical values. Existing public keys and texts are preserved; filtering or removing these legacy exports needs a separate compatibility decision. This audit correction changes no generated data.

Other non-current diagnostics concern exported records, not authenticated historical talents. A missing definition or candidate is evidence about the pinned source only; it does not establish that a historical game value is lost. Complete historical-data cleanup is outside this PR's scope.

## Historical display policy

Current talent failures always fail generation. Historical display compatibility cannot repair or conceal a current failure.

For every generated non-current `special_bonus` record:

1. Use a fully resolved name from the pinned current source when available.
2. Otherwise retain a complete previously published label from the immutable compatibility input, and report `legacy-fallback` with the unresolved source name and fallback provenance.
3. Otherwise retain the missing name or unresolved template, with classified diagnostics. A fallback is never counted as source-resolved.

`tasks/data/legacy-talent-names.json` contains all 1,452 complete talent labels extracted from `odota/dotaconstants` commit `b4b5a8299de5f3e0704e62fdd04a6a54c4d4548e:build/abilities.json`, with the file's SHA-256. It records public **display labels**, not authenticated historical game values. Regenerate it with `node tasks/importlegacytalents.ts` when that fixed commit is available locally. Normal generation reads the committed input; it never reads previous build output for fallbacks. Templates and blank names were excluded. The runtime schema is unchanged.

In client 6942, this general policy selects two fallbacks:

| Non-current talent                              | Preserved display                  | Conflicting pinned definitions         |
| ----------------------------------------------- | ---------------------------------- | -------------------------------------- |
| `special_bonus_unique_kunkka_rum`               | `+8% Admiral's Rum Damage Delayed` | X Marks the Spot +15; Admiral's Rum +8 |
| `special_bonus_unique_disruptor_kinetic_damage` | `+60 Kinetic Field Touch DPS`      | Kinetic Field +50; Kinetic Fence +60   |

Both pairs are equally preferred equipped abilities. Neither numeric label is presented as a uniquely verified source resolution. Preserving these labels removes the PR's historical tooltip regression while leaving the ambiguity visible in audit output. No talent key has a special-case branch.

## Fixed-source reproduction

Use Node.js 24 (validation used 24.18.0), npm (11.16.0), and the repository's lockfile/dependencies. There is no CI configuration or declared lint/typecheck script. The formatter script formats all tasks; narrow checks should preserve pre-existing formatting in untouched code.

```powershell
$env:DOTA_SOURCE_REF = "cf0d37a32c8df338a7832fd32a282747969e9a5f"
$env:DOTA_SOURCE_DIR = "C:/path/to/d2vpkr/dota"
npm test
npm run build
node tasks/audittalents.ts --output audit.json
node tasks/verifytalentgeneration.ts --output C:/path/to/new-empty-verification-directory
```

The snapshot is [d2vpkr client 6942](https://github.com/dotabuff/d2vpkr/tree/cf0d37a32c8df338a7832fd32a282747969e9a5f/dota), as recorded in `steam.inf`. Remove `DOTA_SOURCE_DIR` for real remote reads. A local directory requires an explicit full SHA; missing local files fail without remote fallback. All game inputs in one build use the same ref. No installed client VPK was inspected.

The audit records local paths or pinned remote URLs, a declared ref, runtime and fingerprints for the shared files, `npc_heroes.txt`, and every hero include. Its `verifiedRef` remains null: the loader does not authenticate bytes against Git objects. Fingerprints hash decoded UTF-8 text after removing only the initial BOM; they preserve line endings and interior U+FEFF. Both read paths share that decoder.

For additional input verification, save the response from the fixed [GitHub Git tree API](https://api.github.com/repos/dotabuff/d2vpkr/git/trees/cf0d37a32c8df338a7832fd32a282747969e9a5f?recursive=1), and pass `--source-tree tree.json` to `verifytalentgeneration.ts`. The check requires a complete tree matching the declared SHA and checks every local file's raw Git blob hash. This run verified 142 cached game files, including all 134 audit inputs, against that tree. This separate evidence does not change the loader's provenance claims.

The integration verifier uses fresh directories for base `b4b5a82`, PR start `fc5d817`, and the working code. For the old generator only, its `master` requests are served the same fixed bytes. It explicitly stubs the unrelated hero feed and uses countries from the base commit, blocking actual network requests. It compares all generated files, poisons all 22 regenerated files before repeating, and compares local reads with a mock remote transport returning the same bytes. `cluster.json` and `region.json` are the two retained inputs. Output and source evidence are saved in `verification.json`; a used output directory is rejected. Run with Git, tar, npm and installed dependencies available.

## Verification evidence and limits

[The machine evidence](talent-validation-6942.json) lists source file hashes, every changed name and raw input, and all remaining problematic records and classifications. Counts are observations from this fixed snapshot, not hard-coded validation targets.

| Measure                                | Base | PR at start | Final |
| -------------------------------------- | ---: | ----------: | ----: |
| Current distinct talents               |  973 |         973 |   973 |
| Current missing names                  |    1 |           0 |     0 |
| Current unresolved names               |    6 |           0 |     0 |
| Current missing IDs                    |    0 |           0 |     0 |
| Non-current missing names              |    3 |           3 |     3 |
| Non-current displayed unresolved names |  313 |         313 |   311 |
| Localization metadata records          |    5 |           5 |     5 |

The same metadata classification is applied to all three revisions. Earlier totals included three unresolved descriptions (316 at base/start, 314 at final); separating them produces 313 and 311 without resolving additional values. The five metadata exports remain unchanged.

The final audit covers 127 heroes and 1,016 current slots. It reports no current ID, name, list-length, duplicate-entry, declaration-order or export-level errors. One historical ID alias exists: 323 belongs to current Luna's glaive-count talent and also to an inactive Vengeful Spirit name; the current mapping is correct. The existing `level` tiers remain 1, 1, 2, 2, etc.; these checks do not establish actual in-game learning levels.

Excluding the five metadata records, final non-current statuses are 484 source-resolved, 2 legacy fallbacks, 311 unresolved, and 3 missing names. Current-source resolution still leaves **313** non-current templates unresolved before fallbacks. The 311 displayed unresolved names comprise:

| Evidence class                                                  | Count | Example                          |
| --------------------------------------------------------------- | ----: | -------------------------------- |
| No active definition and no source value                        |   278 | Spectre Haunt cooldown           |
| No active definition/value, with a commented modifier reference |    16 | Brewmaster Primal Split duration |
| Existing definition but requested value missing                 |    12 | Mirana Arrow damage              |
| Existing definition but value missing, with commented reference |     5 | Juggernaut Healing Ward hits     |

Commented references are evidence of excluded text, not usable numeric definitions. Three unnamed records lack templates: `special_bonus_attributes`, `special_bonus_unique_furion_8`, and `special_bonus_unique_lone_druid_entangle_hits`. None has a complete baseline fallback label.

The scan covers 1,957 merged scripts and 1,216 real modifier entries. It finds 15 attributes with adjacent upgrade/facet fields, one localization name requiring broader case handling, 227 mixed-case placeholder records, and seven modifiers on abilities without their own localization. All 1,216 modifiers were found in the collector; reversing all object traversal preserved the lookup and left source objects unchanged. No attribute has multiple real talent modifiers in this snapshot; no modifier is object-valued; no `AbilitySpecial` occurs; no equally preferred numerically equivalent but textually different candidates occur. Those compatibility cases have direct implementation tests, not claimed real-data fixes. Of 77 conflicting candidate groups, mostly unused `value` aliases over different attributes, only the two historical templates above request conflicting groups. No current template requires a conflicting group.

42 tests passed (24 at PR start, 39 before the audit correction). Attributed fixtures assert explicit expected labels for actual pinned definitions and the five metadata tokens. Boundary tests require localization evidence and protect actual definitions and current references from suffix-based exclusion. A separate raw-definition/template numeric oracle checks all 973 current labels, including 916 templated names and 937 placeholder occurrences, without the generator's collector or resolver. It compares numeric meaning, not decimal spelling. This adds evidence beyond the shared audit algorithm; it does not prove every modifier behaves correctly in-game.

The isolated comparisons change only `abilities.json`: two non-current labels relative to PR start; ten labels relative to base (eight current and two Ancient Apparition non-current resolutions). The audit correction changes no public generated files. Fresh isolated builds, the raw-definition oracle, repeat generation and mocked local/remote parity were rerun after the correction; all 24 generated files also match the preceding verification. A separate **real remote audit** was rerun and passed with matching fingerprints, metadata classification and talent diagnostics. A complete isolated build with real external hero/countries feeds previously exited 0 at `74bb4a0`; all 24 JSON outputs semantically matched the final checkout. Those live external feeds were not rerun for this audit-only correction. Its unrelated missing-attribute/shard warnings are outside talent validation. Stub-produced `aghs_desc.json` was never copied into the checkout.

TypeScript 5.9.3 against the same strict `tsconfig.json` and dependencies reports 83 errors at the actual PR base `b4b5a82`, and 79 at PR start, `74bb4a0`, and after the audit correction. Comparing diagnostic multisets after normalizing only line/column positions finds no added diagnostics and four removed diagnostics relative to base. The remaining diagnostics are in `tasks/updateconstants.ts`; the repository typecheck still fails. Changed/new helper files pass formatting and syntax checks; unchanged generator formatting is preserved. Package exports and `git diff --check` pass. Web rendering, historical patch reconstruction and in-game verification were not executed.
