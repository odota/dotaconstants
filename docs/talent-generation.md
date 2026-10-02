# Talent generation and validation

The generator builds talent values from unmodified ability definitions before description formatting. It collects every talent modifier, matches localization and placeholder keys case-insensitively, and lets localization supply signs and units. An equipped hero ability takes precedence over obsolete or summon variants; equally relevant conflicting values stay unresolved. Generation rejects missing IDs, missing names or unresolved templates for current referenced talents.

## Reproduce

Use Node.js 24, install the repository dependencies, and pin a game-resource commit:

```powershell
$env:DOTA_SOURCE_REF = "cf0d37a32c8df338a7832fd32a282747969e9a5f"
npm run build
node tasks/audittalents.ts
npm test
```

This public [d2vpkr snapshot](https://github.com/dotabuff/d2vpkr/tree/cf0d37a32c8df338a7832fd32a282747969e9a5f/dota) records client 6942 in `steam.inf`. The tests contain attributed extracts from that revision. No installed client VPK was inspected.

Set `DOTA_SOURCE_DIR` to the snapshot's `dota` directory for local game-resource reads. A full SHA is required. All d2vpkr inputs use that directory and missing files fail without a remote fallback. An offline talent audit works with the local directory; the full generator still fetches its unrelated Valve hero-data and countries feeds.

An optional `--output <path>` on the audit writes a machine report. Reports distinguish local and remote modes, a declared SHA, verification status and actual file locations. Local files are unverified against the declared SHA. In remote mode, URLs identify requests pinned to that SHA; neither mode independently authenticates bytes against Git objects or an installed client, so `verifiedRef` is null. Zero errors indicate consistency, not authenticated provenance.

Shared-file fingerprints are SHA-256 of decoded UTF-8 text re-encoded as UTF-8 after removing the initial BOM. Both read paths use the same decoder, preserving line endings and interior U+FEFF characters. Fingerprints are not raw-file byte hashes and do not cover every hero include.

## Scope of the checks

The audit checks current talent names, IDs, template resolution, list length, duplicate entries, source declaration order and the existing exported `level` tiers (1, 1, 2, 2, ...). It also reports source-ID aliases. For generated `special_bonus` records outside the current talent set, `unnamedInactiveTalents` lists missing or blank names and `unresolvedInactiveTalents` lists names containing brace-delimited placeholders. These are informational diagnostics, not current-talent validation errors; they do not cover absent records or establish complete historical data. The audit does not change or establish in-game talent learning levels or ordering for the new talent mechanism.

The audit shares parsing and name/value-resolution helpers with the generator. It verifies source/output consistency; a common algorithm bug can affect both sides. Pinned excerpts with explicit expected strings and mutation tests add regression evidence, not independent proof of correctness. Web rendering and integration are outside these checks.

The isolated generation check blocks actual networking and stubs the unrelated external feeds. The build directory contains 24 JSON files: the script writes 22 (13 transformed results and 9 copied manual-data files), while `cluster.json` and `region.json` are existing retained files. Of these 24 directory files, 23 match the prepared dataset, including the 2 retained files; `aghs_desc.json` differs because of the hero-feed stub and is not validated by that check. Temporary generated files do not replace repository output.

## Historical conflict behavior

Two inactive talents change from numeric labels to unresolved templates in the regenerated data:

| Talent                                          | Previous label                     | Conflicting definitions in the pinned snapshot                 |
| ----------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `special_bonus_unique_kunkka_rum`               | `+8% Admiral's Rum Damage Delayed` | `kunkka_x_marks_the_spot`: +15; `kunkka_admirals_rum`: +8      |
| `special_bonus_unique_disruptor_kinetic_damage` | `+60 Kinetic Field Touch DPS`      | `disruptor_kinetic_field`: +50; `disruptor_kinetic_fence`: +60 |

These talents are absent from the current hero talent set. The old collector overwrote values according to traversal order. The new resolver preserves the template when no equally relevant value can be selected from the snapshot. This avoids an arbitrary numeric choice but makes historical-match tooltips less readable. It does not establish that the previous labels were wrong for every historical patch. Fully resolving historical names requires patch/ability context that the current flat dataset lacks.

Tests use the actual conflicting excerpts in both traversal orders. Retaining this behavior is part of the resolver's conflict policy, rather than a manual edit to generated JSON. A compatibility policy for historical labels would need a separate explicit rule and regression coverage.
