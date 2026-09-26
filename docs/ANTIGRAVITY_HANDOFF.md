# Handing True Grind to Antigravity — Workflow Guide

## Why "feed it the doc" didn't work

Antigravity is an **agentic coding IDE** (Plan Mode → Implementation Plan artifact → code → browser-tested verification), not a document-to-game compiler. Our two design docs are excellent as a *reference bible*, but on their own they're missing the three things an engineering agent actually needs to start:

1. **A tech stack.** Never specified until now. **Resolved: TypeScript + Phaser 3, via Vite.**
2. **A scoped, buildable first slice.** The docs describe a finished game with 134 classes, procedural dungeons, tile-based building, mood, crafting, etc. all at once. No agent — human or AI — should be asked to build all of that in one task. That's not a failure of the agent, it's a mis-sized ask.
3. **Machine-readable data**, not prose tables. Both docs already write requirements as JSON in places — that's the format to hand over directly, not re-derive from markdown every session.

This handoff fixes all three.

## What to give Antigravity, and where

Set up the workspace folder like this before opening Antigravity:

```
true-grind/
├── docs/
│   ├── true_grind_gdd.md       (full reference — background only)
│   ├── class_system.md          (full reference — background only)
│   └── milestone_1_brief.md     (the actual task for this session)
└── data/
    ├── weapons.json
    ├── classes.json
    └── enemies.json
```

The `docs/` folder is **context, not instructions** — tell Antigravity to consult it for flavor/fantasy/naming, not to try to implement all of it. The `milestone_1_brief.md` is the actual scoped task. The `data/` files are the authoritative source of truth for numbers — the agent should read and extend these files as new content is added, not hand-code weapon/class stats into game logic.

## The prompting workflow (repeat per milestone)

1. **Open a fresh Antigravity task, in Plan Mode.** Don't reuse one long-running task across the whole project — one milestone per task keeps context small and focused.
2. **Prompt it something like this** (adapt per milestone):

   > Read `docs/milestone_1_brief.md` — that's your task. Use `docs/true_grind_gdd.md` and `docs/class_system.md` only as background reference for terminology and fantasy, not as additional scope. Use `data/*.json` as the authoritative schema for weapons/classes/enemies — extend those files if you need new fields, don't hardcode game data into scripts. **Do not write any code yet.** First produce a Task and Implementation Plan artifact, listing the files you'll create and the order you'll build them in. Wait for my approval before executing.

3. **Review the Plan artifact.** Push back on anything that scope-creeps beyond the milestone brief — this is the point where you catch "and I'll also add a building system" before it happens.
4. **Approve, let it execute**, and use the built-in Browser Preview to actually check the running result yourself rather than trusting a "done" status.
5. **Commit to git before starting the next milestone.** Stage (don't push) each working milestone so a bad next run is easy to diff against and roll back from.
6. **Start the next milestone as a new task**, pointing at the next brief (`milestone_2_brief.md`, etc.) once you're happy with the current one.

### Lesson from Milestone 2.1: for stateful/timing bugs, demand real evidence, not a checklist

M2.1 went through five rounds of bugfixes on the same enemy AI, and the walkthroughs for two of those rounds confidently claimed a bug was "fixed and verified" when it demonstrably wasn't — the agent's own manual-verification checklist isn't reliable proof for anything involving state machines, timing, or per-frame logic, because it's easy for an agent to describe what the code *should* do without having actually confirmed what it *does* do frame-by-frame.

What actually broke the stalemate: requiring the walkthrough to include **real console log output from a live browser run** — actual state transitions, actual distance values, actual timestamps — not a description of the fix or a list of checked boxes. Once that was required, the true root cause (a movement-state check that went false mid-animation, causing a 60fps repath loop) showed up immediately in the logs.

**Going forward:** for anything involving a state machine, a timer, or per-frame/per-tick logic (enemy AI, skill cooldowns, scene transitions, status effect ticking), ask for actual log output or a screen recording as part of the walkthrough *before* treating it as done — not just when a bug has already resisted two fix attempts. It's cheap to ask for up front and expensive to discover you need it after multiple false "verified" claims.

## Milestone roadmap (build in this order)

| # | Milestone | Depends On |
|---|---|---|
| 1 | Single character, tile grid, click-to-move, one weapon, one enemy, basic auto-combat, single HP bar | — ✅ done |
| 2 | Two-bar HP (Critical state), Energy bar, skill auto-cast/cooldowns, status effects | M1 ✅ done |
| 2.1 | **Bugfix pass:** enemy pursuit stopping partway, unreliable click-to-engage targeting, enemy aggro-on-damage | M2 |
| 3 | Outpost scene, portal scene transition, Skill Loadout (5 equipped slots, outpost-only swapping), per-skill Autocast toggle | M2.1 |
| 3.1 | Polish/bugfix pass: HUD toggle, dungeon autocast button wiring | M3 |
| 4 | Tile-based build mode, indoor/enclosure detection, first crafting station | M3.1 |
| 5.0 | **Foundational retrofit:** real Level/EXP system replacing the flat proficiency counter used since M1, per-level stat bonuses for Short Swords | M4 |
| 5 | Construction skill (build cost reduction, demolish refund scaling — now built on M5.0's Level system), Automatic Room Classification | M5.0 |
| 5.5 | Hidden Defensive & Regen Skills: Evasion, Parry, Block, Counterattack, Resilience, Health Regen, Mana Regen | M5.0 |
| 6 | Research tree, Skill Books, Alchemy + cure recipes | M2, M5 |
| 7 | Food/Hunger/Spoilage, Mood system (now consumes Room Classification from M5) | M5 |
| 8 | Fixed 4-person party, shared party inventory, dual-wielding unlock | M1, M2 |
| 8.1 | **Bugfix saga (5+ rounds):** portal group movement, strict tile no-stacking, 2×2 formation, full-group engage-on-click — the biggest post-milestone stabilization pass in the project | M8 |
| 9 | **Shield + Bestiary Expansion.** Add Shield as a real equippable item (finally live-verifies Block, gate-tested only since M5.5); add Goblin, Skeleton, and Undead as real implemented enemies using the harvest-tag design already written in `true_grind_gdd.md` Section 11.5. Gives the party-combat engine from M8/8.1 actual content to exercise, and is the first real test of the swarm-trap open question | M8.1 |
| 10 | **Gathering + Cooking.** One gathering skill (Foraging is the simplest starting point) plus the Cooking profession, closing the placeholder-ingredient debt both Milestone 6 (Alchemy's Bandage used Wood) and Milestone 7 (Ration was debug-only) explicitly incurred | M9 |
| 11 | **Combat Medic + Full-Group Retaliation.** Both preconditions have existed since M8 and were explicitly deferred rather than built — Combat Medic's unlock (reviving downed companions) and the group-retaliation behavior captured during the M8.1 bugfix rounds | M9 |
| 12 | **Second full class chain.** Vanguard (Short Swords + Shield, now buildable thanks to M9) as the second real class beyond Fencer, with its own 5-skill kit — the first real proof the class-unlock and skill-kit systems generalize beyond the one example that's existed since Milestone 1 | M9, M5.5 |
| 13 | Procedural dungeon generation, Regions, full bestiary continuation | M9–M12 |

Never ask Antigravity to jump ahead in this list — each milestone assumes the previous ones already work and are committed. **Milestone 3 was inserted after playtesting M2** — the Outpost scene turned out to be a shared prerequisite for both the Skill Loadout system and the building/crafting work originally planned as M3, so it made sense to build the location itself first and let both later milestones build on it. **Milestone 5 was inserted after M4's plan review** — Construction (the skill governing build cost/refund) and Automatic Room Classification are both direct extensions of M4's `BuildingSystem`, best built while that code is fresh rather than bolted on during the unrelated M6 (research tree) work. M4 itself intentionally ships with a flat 100% demolish refund as a placeholder, per `true_grind_gdd.md` Section 9.4 — that's superseded once M5 lands. **Milestone 5.0 was inserted after discovering a foundational gap during M5 review** — every trainable stat since Milestone 1 (Short Swords proficiency) was implemented as a flat counter compared directly against tier thresholds, with no real Level/EXP split and no per-level stat bonuses, despite that being the game's core stated pillar since the very first design conversation. Construction's tier table was about to be built on the same flawed model. M5.0 fixes the underlying system once, retroactively for Short Swords and for Construction if it was already built, before any more skills get added on top of the wrong foundation.

**Milestone 5.5 was added at the same time as this curve retune request** — Evasion, Parry, Block, Counterattack, Resilience, and the two Regen skills were fully specified in the design doc but never scheduled into any actual milestone. It needs one reconciliation before it's built: those skills were originally designed with their own proc-then-directly-add-0.1 growth model, written before M5.0 formalized the shared Level/EXP system. Once M5.0 lands, procs on these skills should grant **EXP** feeding the same shared curve, not increment a raw value directly — bring them onto the universal system rather than leaving a second, different leveling model running in parallel.

**Milestones 9–12 replace what was originally a single Milestone 9 (procedural dungeon generation, Regions, full bestiary), reordered after a full project review.** The original plan would have built a randomization system with almost nothing to randomize — one enemy, one weapon pair, one crafting station. Multiple systems accumulated real, explicitly-flagged debt while party-combat infrastructure absorbed a disproportionate amount of engineering time (an entire multi-round stabilization saga in 8.1): Shield has been the single most-referenced missing piece blocking Block, Vanguard, and meaningful weapon choice since M5.5; Cooking and gathering were placeholder-ingredient debt since M6/M7; Combat Medic and group retaliation have had their preconditions sitting unused since M8. Content now comes before the procedural system that would distribute it — the renumbered Milestone 13 is what the roadmap always called Milestone 9, just built once there's something worth generating dungeons full of.

**Not-yet-numbered future item, captured during M11 planning:** the item-based revive system (Alchemy-crafted, 3-second channel, interrupted by damage) is a real, resolved design spec sitting in `true_grind_gdd.md` Section 6, not yet assigned a milestone. It should probably land once Alchemy's recipe catalog is expanded beyond Bandage — worth reconsidering when scoping whatever milestone eventually deepens the Alchemy/Cooking crafting side further. Current instant revive (`R` key, Party Overview button, console helper) is confirmed to be an intentional testing convenience, not the final mechanic.

**Not-yet-numbered future item, captured during Milestone 13 planning:** the Return Teleporter Crystal mechanic (no free portal home once inside the dungeon — the player must find a crystal placed somewhere in the generated layout to retreat, and interacting with it offers a Continue-to-next-floor vs. Return-to-Outpost choice) is a real, resolved design spec sitting in `true_grind_gdd.md` Section 11.1a. Explicitly deferred by design — the current instant bidirectional portal is a testing convenience, not the final mechanic, matching the same distinction already made for instant revive vs. the future item-based revive system. Implement once active testing of other systems no longer benefits from the easy-return workflow. Worth noting: this also implies multi-floor dungeon progression (Continue → a new, deeper floor), which isn't otherwise specified anywhere yet — that's a real scope addition to keep in mind, not just a portal-placement change.

**Roadmap update after Milestone 14 review — captured during Milestone 15 (Healing Magic) planning:**

1. **Milestone 15 (Healing Magic) now includes Energy Regen** as an eighth hidden defensive/regen skill, added specifically because Mana Regen's gate (requires a magic-school proficiency) leaves every physical class with zero resource-sustain training path — see `class_system.md`'s Hidden Defensive & Regen Skills section for the full mechanic.
2. **Energy/Mana economy rebalancing is explicitly deferred, not urgent, but real** — the current Energy regen rate lets skills auto-fire with effectively no resource constraint. Not fixed now; will be addressed once Energy/Mana potions exist via Alchemy and Energy Regen/Mana Regen are live and tunable together as one balance pass, rather than three separate half-fixes. **Concrete tuning target, captured during Milestone 18 planning:** at early proficiency levels, a spell's Energy cost should be steep enough that a caster with no potions runs dry after roughly 4-5 casts, not dozens. **Correction to the "offensive magic needs no melee conduit" reasoning used when Fire Magic was scoped:** that claim only accounted for one reason a caster might need to fall back to melee (a support spell that can never hit an enemy). Running out of Energy entirely is a second, independent reason that applies to *every* magic school, offensive or not — a Fire mage at 0 Energy is exactly as stuck as an unequipped healer. **Once this rebalance actually makes running dry a real, frequent occurrence (not just theoretically possible), every magic-wielding character — not just Healing Magic's — should be able to equip a Staff and physically fight while Energy regenerates**, generalizing the Staff/spell split from Milestone 15 to all schools, not just support ones. Not built now — Milestone 18's Fire Magic stays self-contained under the current loose economy, where this scenario essentially never comes up; revisit once the rebalance lands and 0-Energy states become common.
3. **Potions boosting regen should also grant bonus EXP toward the relevant regen skill** while active — a resolved design principle, not yet implementable since Energy/Mana potions don't exist yet. See `class_system.md`.
4. **Changeable party leader** — currently fixed to whichever character was created at game start; the ability to designate a different party member as Leader (affecting portal-trigger behavior, camera follow, etc.) is a real future feature, not yet scheduled.
5. **Enemy respawn overhaul — flagged as the clear next priority after Milestone 15.** The current per-enemy debug respawn timer (built for early single-Wolf testing) is explicitly a testing convenience, not final design, and it actively undermines real dungeon-clearing by refilling cleared rooms every few seconds. The intended mechanic — no individual respawns, a floor-wide timer that repopulates one random room when it expires — is fully specified in `true_grind_gdd.md` Section 11.5. This affects the core feel of the dungeon loop more than almost anything else currently outstanding.

**Two more items captured during Milestone 16 review:**
1. **Floor timer calibration expectation.** As more gathering node types and dungeon content get added in future milestones, players legitimately taking longer per floor — and triggering the 300-second floor timer more often — is expected and acceptable, not a regression to defensively tune away. Revisit the actual duration once real content density changes.
2. **Gathering channel + combat interrupt** — a real, resolved design captured in `true_grind_gdd.md` Section 11.2: gathering nodes take a few seconds to harvest (a visible progress bar), and taking damage during that window cancels the gather (no rewards, bar resets) and immediately starts combat with the attacker. Not implemented yet — current Foraging harvests instantly. Worth building once more gathering types exist, since it should apply uniformly to all of them, not be retrofitted onto each one separately.

**Captured during Milestone 18 review — Burn's future-facing design principle (not an M18 change, since no named Fire Magic skills exist yet):** once Fire Magic gets its own 5-skill kit in a future milestone, each named skill should define its own Burn behavior explicitly — guaranteed, elevated chance, or none at all — rather than universally inheriting the base attack's proc chance forever. The base attack's chance (and its per-level/class scaling) is the *default*, not a rule every future skill must follow.
**Decided during the same review:** Ember Adept (Milestone 18's Tier 0 class) does not get a Burn-chance hidden bonus — kept minimal like every other Tier 0 class. Burn-chance class bonuses are deferred to a future, more developed fire-specialization class once one exists.

**Caught during Milestone 19 plan review:** `slime_gel` was proposed as a Mana Potion ingredient, but no Slime enemy has ever been implemented — corrected to `ectoplasm` (an existing, verified Skeleton/Undead drop already tagged for Alchemy). Also flagged: Healing Magic's melee-fallback logic (Milestone 15) was built entirely under the old abundant-Energy assumption and has no explicit branch for "ally needs healing but Energy is insufficient" — needs the same fix Fire Magic's new fallback is getting in Milestone 19, not left as a latent gap now that scarcity is real.

**Rejected during the Healing/Fire Magic EXP misattribution bugfix review:** a proposed fix used `entityName === 'Valerie'` as a fallback condition to disambiguate a bare Staff equip between Healing Magic and Fire Magic. Hardcoded name checks in core combat logic are never acceptable — this project has consistently generalized per-character behavior since Milestone 8 specifically to avoid this. The ambiguity is real (a bare Staff doesn't inherently declare its caster's intended school), but must be resolved via actual trained proficiency (which school the character has invested EXP in, or their unlocked class) with "no autocast, melee only" as the sane default when neither resolves — never by name.

**Resolved and shipped: Skinning and Butchering (Milestone 32).** No longer deferred — kept here only as a historical note that this was once a captured-ahead-of-time idea that paid off.

**Deferred during Milestone 39 (Gardening) planning: Living Vegetable enemies, not yet a milestone.** Enemies that complement Gardening — thematically vegetable/fruit-based, dropping the same produce type they're based on plus Seeds, giving combat a second source of gardening materials alongside dedicated dungeon vegetable nodes. Deliberately not built alongside Gardening itself; captured here so the intent isn't lost. Start with one representative type when picked up, matching the established "smallest correct version first" pattern (Elite/Epic/Boss each started with one before any expansion).

**Major deferred design vision, captured during Dark Knight passive-imbuement discussion — NOT to be built now, explicitly deferred:** every trainable stat in the game (weapon proficiencies, class levels, crafting professions, gathering skills) should eventually give a small, continuous, real stat bonus at every single level gained — not just at specific unlock thresholds. Stated example: roughly +1 HP (or +0.5 HP) per level, similarly for Energy and possibly other stats. The motivation: right now, most levels between named unlock thresholds don't feel meaningfully different from each other — a Level 47 in some skill isn't distinguishable from Level 43 unless a milestone happens to land there. This would make every single point of grinding, in any stat, feel like real, felt character growth, not just progress toward the next specific unlock. Explicitly confirmed: keep working as normal for now; this is a real, intended future direction, not something to start building yet.

**Directly connected technical requirement, confirmed as universal, not Dark-Knight-specific:** every class's Class Level should genuinely continue leveling up to 100, even though named skill unlocks stop at each class's own capstone (typically Level 40). The Level 40 capstone was always meant as "where the last named skill unlocks," never as a hard level cap — this needs a real, explicit audit across every existing class, not assumed to already work correctly just because nothing has tested it before.

**Captured during Milestone 49 (Spears) planning: Javelin class, deferred, not yet a milestone.** Requires `Spears` + `Throwing Weapons` — Throwing Weapons doesn't exist yet as a built weapon type (still on the original master weapon backlog). Same shape as Bows→Scout and Longswords→Dark Knight: build Throwing Weapons as its own weapon milestone first, and Javelin becomes a natural, immediately-buildable follow-up, matching that proven sequencing pattern.

**Captured during Milestone 49 (Spears) planning: a genuinely new mechanical category — Armor Proficiency (Light/Medium/Heavy), leveled through wear, not yet designed or built.** Surfaced because Dragoon (Lancer's evolution) is meant to require a Heavy Armor proficiency threshold. This is significant: every armor piece built so far (Milestones 28 and 33 — Helmet, Body Armor, Necklace, Ring, Accessory) is static equipment with flat stat bonuses. Nothing about wearing armor currently levels up the way weapons, magic, gathering, or crafting proficiencies do. If this is ever built, it would need:
- A real decision on whether wearing any armor trains one generic "armor" proficiency, or whether the specific weight class worn (light/medium/heavy) trains its own distinct proficiency — the latter seems more consistent with how this game already handles school-specific magic training (casting Fire Magic trains `fire_magic` specifically, not a generic "magic" stat).
- Every existing armor piece (Leather Cap, Leather Armor, Silk Cowl, Silk Robe, Bone Necklace, Wolf Claw Ring, Venom Charm) retroactively tagged with a weight class before this could function correctly.
- Confirmed explicitly as genuinely future work — "nothing to worry about now," per direct instruction — but real enough that Dragoon should not be attempted until this exists properly, not built around a shortcut or a fake stand-in requirement.

**Flagged during Milestone 54's citation audit, not yet resolved: M49's shipped "Lancer" and "Hoplite" classes appear to have swapped names relative to `class_system.md`.** The doc's actual entries are Spearman (Spears 10) and Lancer (Spears 30 + Shields 10) — but the game shipped "Lancer" at Spears 10 and "Hoplite" at Spears 30 + Shields 10. Also newly discovered: the doc's real evolution for Lancer is "Storm Lancer" (Spears 30 + Lightning Magic 30 + Lancer Lv 15), a different gate than the previously-discussed "Dragoon" (Heavy Armor). Not yet decided: whether to rename the shipped classes, and whether Dragoon or Storm Lancer (or both) is the intended direction for Lancer's evolution. Deliberately not auto-corrected — retroactive renames have real save/reference consequences worth handling deliberately, not reflexively.

**Captured during Research Points earnability discussion: puzzle minigames for locked doors/chests, connected as a possible future Research Points source.** This was a pre-existing deferred idea from early design capture (puzzle minigames for locked content), not something new. If picked up, it's worth considering as an additional RP source alongside Elite/Epic/Boss kills, lockboxes, and discovery bonuses — but it's a genuine new mechanic requiring real scope, not a number tweak, and should get its own dedicated milestone rather than being folded into the RP-earnability fix.

**Design decision confirmed: no death-wipe punishment for the default difficulty, deliberately.** A full party wipe simply returns the party to the Outpost with zero resource loss or penalty. Real consequences (resource loss, permadeath, or similar) are explicitly reserved for a future harder-difficulty mode, not abandoned as an idea — just not part of the base experience for now.

**Resolved and shipped: Milestone — Tutorial & Onboarding (Alpha-Ready).**
- Built an interactive, non-blocking 10-step onboarding flow managed by `TutorialSystem` and the `#guild-guide-widget` HUD component.
- Strictly maintained "orientation, not documentation" scope discipline — teaching party recruitment, 2x2 movement/camera, portal transition, combat autocast/wipe penalty, safe room gathering, research unlocking, station building, gear forging, and pointing to the Guild Knowledge Base (`[K]`) for deep references.
- Corrected real playtest misconceptions directly in-game (explicitly clarifying that genuinely cleared rooms are safe from ambushes and party wipes carry zero penalty).
- Tutorial progress persists cleanly through storage checkpoints (`GameState` save/load) and survives reloads.
- No gating or hard progression blocks: dismissing early (`✕`) leaves the entire game unconstrained.
- Fully verified via headless browser (Puppeteer) executing the real cold-start loop with live console evidence. Recommended follow-up: run a real human naive test pass before wide alpha distribution.

**Resolved and shipped: Milestone — Armor Proficiency (Light/Medium/Heavy).**
- **Design Resolution**: Confirmed specific weight class leveling (`light_armor`, `medium_armor`, `heavy_armor`) over generic proficiency, matching the school-specific magic and distinct weapon architecture.
- **True Armor Tagging vs. Pure Stat Jewelry**:
  - The 4 true armor pieces in `data/armors.json` (Helmet and Body) are explicitly tagged with their weight class:
    - `leather_cap`: `light` (1.0kg wolf pelt headwear)
    - `leather_armor`: `medium` (5.0kg reinforced wolf hide tunic)
    - `silk_cowl`: `light` (1.0kg spider silk cowl)
    - `silk_robe`: `light` (3.0kg spider silk robe)
  - The 3 jewelry/accessory pieces have **no `weightClass` tag** (pure stat items, zero involvement in armor proficiency):
    - `bone_necklace`: slot `necklace` (+20 HP)
    - `wolf_claw_ring`: slot `ring` (+14 HP)
    - `venom_charm`: slot `accessory` (+26 HP, +5kg carry capacity)
- **Explicit Slot Exclusion & EXP Consistency**:
  - All combat wear hooks (`hit`, `attack`, `kill`) and weight class introspection (`getEquippedArmorWeightClasses()`) **explicitly evaluate only true armor slots (`helmet` and `body`)**, ignoring jewelry slots entirely.
  - Implemented real EXP-on-use pattern: +1 EXP per piece per hit taken (`awardArmorWearExp('hit')`), +1 EXP per unique weight class worn per combat attack (`awardArmorWearExp('attack')`), and +2 EXP per unique weight class on defeating enemies (`awardArmorWearExp('kill')`).
  - **Hit vs. Attack/Kill Distinction (Deliberate Design)**:
    - `hit` is **per-piece**: each true armor piece covering the body absorbs incoming impact (+1 EXP each). Wearing two light pieces (cowl + robe) awards +2 `light_armor` EXP per hit because more armor surface area protects the character.
    - `attack` and `kill` are **per-unique-class**: offensive combat maneuvers are performed within the armor encumbrance class as a whole, not per piece. Deduplication avoids artificial EXP inflation from equipping multiple lightweight items while still cleanly awarding +1/+2 EXP across all active weight classes for mixed loadouts.
  - Follows universal `LevelingSystem` curve with floating combat level-up notifications.
  - Discoveries feed `GameState.discoveredProficiencies`, Knowledge Base Codex, and Party Overview.
- **Known Deliberate Gap — `heavy_armor` Currently Untrainable**:
  - All 4 existing true armor items in `data/armors.json` (and recipes in `data/armorsmithRecipes.json`) are tagged `light` or `medium` — zero pieces are tagged `heavy`.
  - While the `heavy_armor` proficiency is fully implemented, verified, and functional in code (trainable stat definition, leveling curve, UI, and serialization), there is currently no equipment in the game that allows a player to earn EXP in it.
  - **Prerequisite Tracking (Matching Throwing Weapons → Javelin)**: Exactly matching how Throwing Weapons was tracked as Javelin's missing piece (Milestone 49 → Milestone 54), Heavy Armor equipment (e.g., Iron Plate / Forged Heavy Mail) is a known, deliberate prerequisite that must be introduced in a future blacksmithing/armor milestone before players can earn `heavy_armor` levels to unlock Dragoon (`Spears 60 + Heavy Armor 30 + Lancer/Hoplite Lv 15`).
- **Zero Regressions**: Preserved 50/50 two-bar HP split, Outpost-only equip rules, Critical HP floor-of-1 safety, and save/snapshot persistence.

**Resolved and shipped: Milestone — Spellsword.**
- **Citation & Line References**:
  - Exact citation in `docs/class_system (1).md` line 127: `| Spellsword | Longswords 30 + Arcane 10 | Warrior-mage hybrid trainee |`.
  - Also cited at line 157 as a prerequisite for Battlemage (`Spellsword Lv 30 + Fire Magic 20`).
  - GDD Section 12.2 audit confirmed Spellsword is absent from Section 12.2; the 5-skill kit is transparently framed as an original, authentic hybrid design.
- **Weapon Discipline (Pure Longsword Specialist)**:
  - Spellsword has **exactly one valid weapon: Longswords (1H or 2H)**.
  - Zero staff, wand, or Arcane conduit equip path. Regression tests explicitly assert the absence of any conduit/spell weapon pairing in `data/classes.json`.
- **One-Directional Secondary EXP Flow**:
  - Implements the Dark Knight passive-imbuement pattern: every Longsword attack or skill awards full primary EXP (+2 `longswords` EXP) and a secondary share (+1 `arcane_magic` EXP) via `passiveImbuement.secondaryExp`.
- **Unconditional Arcane Magic Scaling**:
  - Spellsword skills scale directly and unconditionally with the character's `arcane_magic` level (`+0.15 * arcane_magic level`), without being gated behind weapon checks.
  - Formally verified with an exact numeric check in tests: Arcane Magic 30 provides precisely `+4.5` bonus damage (`30 × 0.15`).
- **Full 5-Skill Kit (1, 10, 20, 30, 40 Unlock Cadence)**:
  - `arcane_strike` (Lv 1, 12 EN, 2.5s CD): 150% damage melee thrust + Arcane scaling.
  - `runic_infusion` (Lv 10, 18 EN, 12s CD): 8s self-buff imbuing the blade with +25% magic damage and +4 energy siphon on hit.
  - `spell_ward` (Lv 20, 20 EN, 14s CD): 6s protective ward granting 40 shield HP absorption and +20% Parry bonus.
  - `dimensional_lunge` (Lv 30, 25 EN, 8s CD): 4-tile gap-closer teleport and strike dealing 190% damage + Arcane scaling.
  - `blade_beam` (Lv 40 capstone, 35 EN, 15s CD): 4-tile piercing wave dealing 260% damage + Arcane scaling; resonates with Runic Infusion to refund 10 EN and cleave adjacent targets for 60% damage.
- **Status Effects & Passives**:
  - Registered `arcane_vulnerability` (+15% damage amplification), `runic_infusion` (+25% magic damage, +4 energy siphon), and `spell_ward` (40 shield HP, +20% parry).
  - Passive imbuement proc applies `arcane_vulnerability` on melee hits with scaling chance (5% at Lv 1 to 50% at Lv 50+).
- **Verification & Integrity**:
  - Unit test suite `test/milestone_spellsword.test.ts` (all 7 tests passing).
  - Regression test suites `test/milestone_armor_proficiency.test.ts` and `test/milestone58.test.ts` pass cleanly.
  - TypeScript type check (`tsc --noEmit`) and production bundle build (`npm run build`) pass with zero errors.

**Resolved and shipped: Urgent Bugfix — Downed Leader Soft-Lock Elimination (Crystal/Portal Access & Emergency Leader Swap).**
- **The Issue**: Real human playtesting identified that when the Leader is Downed in the dungeon and no revive items are available, the session completely soft-locked. The crystal previously required the Leader specifically to arrive to trigger it, Downed units cannot move or act, and Milestone 45 restricted leader swapping to Outpost-only.
- **Defense-in-Depth Solution (Both Components Shipped)**:
  1. **Generalized Crystal & Portal Interaction (`MainScene.ts`, `OutpostScene.ts`)**:
     - Removed the "Leader only" requirement for Teleporter Crystal and Portal interactions.
     - Any conscious, living party member adjacent to the Teleporter Crystal (or Outpost Portal) immediately opens the crystal modal (or triggers portal transition).
     - When commanded to move toward the crystal/portal, all conscious party members pathfind towards adjacent tiles, and whichever conscious member arrives first triggers the interaction.
     - Downed characters are not commanded to move.
  2. **Emergency Mid-Dungeon Leader Swap Exception (`HUD.ts`, `MainScene.ts`)**:
     - Added an explicit, narrow exception to the Outpost-only leader swap rule: leadership can be reassigned mid-dungeon specifically when the current Leader is Downed or dead.
     - In `HUD.ts`, the "👑 Make Leader" button is rendered in the dungeon only on conscious allies when the current leader is Downed.
     - In `MainScene.ts`, `changePartyLeader(newLeaderIdx)` verifies that the current leader is Downed before allowing the swap, reorders `this.party` to place the new leader at index 0, updates camera follow, updates `progressionSystem`, and saves snapshots.
     - The moment a conscious companion becomes Leader, normal Outpost-only leader-swap restrictions immediately re-lock.
  3. **Transition Integrity (Downed Members Carried Over)**:
     - Verified with adversarial test scenario: party transitions operate on the entire `this.party` roster via `GameState.savePartySnapshot(this.party, ...)`. All party members — including Downed ones located far away from the interaction point — travel together, correctly retaining their Downed status, 0 HP, and clickable revive icon upon arrival in the new scene.
- **Verification**:
  - `test/downedPartyTransitionVerification.test.ts` (100% pass)
  - `test/downedLeaderSoftlockFix.test.ts` (100% pass across all 5 test cases)
  - Production build (`npm run build`) clean with 0 errors.

**Resolved and shipped: Milestone — Thrower (Reachable & Complete).**
- **Citation & Line References**:
  - Exact citation in `docs/class_system (1).md` line 136: `| Thrower | Throwing Weapons 30 + Daggers 10 | Quick-handed skirmisher |`.
  - Cited at line 500: `Throwing Weapons is now covered (Skirmisher -> Thrower), but it doesn't yet have an Expert/Master-tier class of its own`.
  - GDD Section 12.2 audit confirmed Thrower is absent from Section 12.2; the 5-skill kit is transparently framed as an original, authentic hybrid design.
- **Genuine Hybrid Identity (Throwing Weapons + Daggers)**:
  - Unlocked at `throwing_weapons: 30` + `daggers: 10` in `data/classes.json`.
  - Dual hidden skill bonuses: `evasion: 0.05` and `counterattack: 0.05`.
  - Allowed sidearm pairing in `Player.ts`: can equip Throwing Weapons main + Dagger offhand, or Dagger main + Throwing Weapons offhand without requiring universal Dual Wielding.
  - Cross-proficiency hybrid damage scaling (+0.15 to +0.25 scaling per partner weapon proficiency level).
  - Cross-proficiency EXP training: attacks award EXP to both proficiencies (+2 wielded, +1/+2 partner).
- **Full 5-Skill Kit (1, 10, 20, 30, 40 Unlock Cadence)**:
  - `quick_toss` (Lv 1, 12 EN, 3.0s CD, 3 tiles): 140% weapon damage + partner scaling + Bleed check.
  - `skirmish_step` (Lv 10, 18 EN, 7.0s CD, 4s duration): tactical self-buff granting +35% Evasion.
  - `fan_of_knives` (Lv 20, 22 EN, 6.0s CD, 3 tiles): 160% weapon damage + 50% splash cleave to adjacent enemies within 1 tile.
  - `crippling_volley` (Lv 30, 26 EN, 9.0s CD, 4 tiles): 185% weapon damage + 50% Slow and Bleed for 4s.
  - `blade_barrage` (Lv 40 capstone, 35 EN, 12.0s CD, 4 tiles): 260% weapon damage + elevated hybrid scaling (+0.25/level); synergizes with `skirmish_step` to deal +25% bonus damage and refund 10 energy.
- **Alchemical Bomber Audit & Explicit Deferral**:
  - Audited `Alchemical Bomber` requirement in `docs/class_system (1).md` line 269: `Alchemy 30 + Throwing Weapons 60 + Journeyman Alchemist Lv 15`.
  - Line 250 records `Journeyman Alchemist` as a Tier 2 crafting mastery class requiring `Alchemy 30, req. Apprentice Alchemist Lv 10`.
  - Neither `Journeyman Alchemist` nor `Apprentice Alchemist` exists in `data/classes.json` or anywhere in the codebase.
  - Alchemical Bomber is explicitly deferred to a future Crafting Mastery & Alchemy Expansion milestone, adhering to the project's strict prerequisite tracking discipline (matching Dragoon and Javelin precedents) rather than inventing a shortcut stand-in.
- **Verification**:
  - `test/milestone_thrower.test.ts` (100% pass across all tests).
  - Production build (`npm run build`) clean with 0 errors.

**Resolved and shipped: Milestone — Third Named Region (Glacial Caverns).**
- **Depth Boundary & Progression Continuum**:
  - Extends dungeon progression past Floor 10 into deep subterranean stratum.
  - Capped `infernal_caldera` at `maxFloor: 10`, cleanly encapsulating the Floor 10 Boss milestone chamber.
  - Established `glacial_caverns` starting at Floor 11 (`minFloor: 11`), fulfilling the requirement of a real, specific depth threshold meaningfully deeper than Floor 6.
  - Complete 4-biome ladder:
    - Ancient Crypts: Floors 1–2 (Upper Stone Chambers, slate gray & soft purple `#a78bfa`)
    - Abyssal Depths: Floors 3–5 (Deep Void Stratum, obsidian & vibrant violet `#c084fc`, Floor 5 Boss Chamber)
    - Infernal Caldera: Floors 6–10 (Scorched Subterranean Core, basalt & incandescent magma orange `#f97316`, Floor 10 Boss Chamber)
    - Glacial Caverns: Floors 11+ (Sub-Zero Crystalline Depths, deep glacial slate & radiant cyan `#06b6d4`)
- **Visual & Thematic Distinction**:
  - Procedurally generated `tile-glacial-walkable`: deep sub-zero oceanic glacial slate foundation (`0x082f49`), rime frost border (`0x0284c7`), radiant cyan ice fissures (`0x06b6d4`, `0x67e8f9`), translucent ice pockets (`0x22d3ee`, `0xa5f3fc`), and diamond dust frost glints (`0xf0fdf4`).
  - Procedurally generated `tile-glacial-obstacle`: pitch arctic permafrost bedrock (`0x030712`), frost crystalline frame (`0x0284c7`), jagged glacial ice crag facets (`0x0c4a6e`), central sapphire/cyan ice spires (`0x0369a1`, `0x38bdf8`), sub-zero crystal fissures (`0x0891b2`, `0x22d3ee`), and diamond glacial core flares.
  - Distinct `#06b6d4` accent color dynamically tinting the HUD location badge.
  - Atmospheric tagline: `"The Sub-Zero Crystalline Depths"`.
- **System Parity & Zero Generation Impact**:
  - Data-driven configuration registered in `data/dungeonConfig.json` and mirrored in `DataLoader.DEFAULT_REGIONS`.
  - Zero modifications to core procedural dungeon generation logic (`DungeonGenerator.ts`). Multi-seed deterministic test standard confirmed 100% byte-identical room layouts, coordinates, grid matrices, and crystal/portal positions across seeds 42, 100, 777, and 9999.
  - Teleporter crystal modal accurately announces next region only at cross-boundary floors (Floor 2→3: "Abyssal Depths", Floor 5→6: "Infernal Caldera", Floor 10→11: "Glacial Caverns"), and omits next-region preview when continuing descent within the same region.
- **Stale Assertions Fixed**:
  - Audited and updated prior region milestone test suites (`test/milestone44.test.ts` and `test/milestone56.test.ts`) where region counts were strictly asserted as 3 and Infernal Caldera was asserted as uncapped into Floor 50. All tests now pass cleanly without regressions.
- **Verification**:
  - `test/milestone_third_named_region.test.ts`: 100% pass across all 6 unit, topology, and deterministic invariance tests.
  - `test/verify_milestone_third_region_browser.mjs`: Live browser E2E test executing a real continue-chain descent from Outpost -> Floor 1 -> Floor 2 -> Floor 3 -> Floor 5 -> Floor 6 -> Floor 10 -> Floor 11 (Glacial Caverns) -> Return to Outpost -> Fresh Re-entry.
  - `npm run build`: Production bundle builds cleanly with 0 TypeScript errors.

**Resolved and shipped: Milestone — Second Boss Enemy (Glacial Sovereign).**
- **Boss Archetype & Thematic Identity**:
  - Distinct identity from Abyssal Colossus: while Abyssal Colossus is a massive melee tank/brute (1 tile range, 500 HP, 35 damage, Titanic Cleave, Earthshaker Stun, Berserk Enrage frenzy), **Glacial Sovereign** is an icy crystalline monarch / ranged artillery spellcaster (4 tile range, 420 HP, 32 cold damage, 8 aggro radius, 1400ms attack cadence).
  - Procedural avatar texture `glacial_sovereign-avatar` (36x36 diamond frost carapace, sharp cyan border `#06b6d4`, crystal horns, crown spire, frost facets, glowing azure eyes, pulsing glacial heart crystal).
  - Cyan boss badge (`'👑 BOSS 👑'`, style `#06b6d4`) and distinct 8-point snowflake frost aura particles.
- **Signature Combat Mechanics**:
  - **Glacial Spike Nova / Permafrost Shards**: 40% cold splash damage fracturing to all other living party members within 3 tiles of the primary target upon ranged projectile impact.
  - **Rime Frostbite**: 100% inflicts `frostbite` (4500ms duration, 1500ms tick, 3 frost damage/tick, 50% movement speed slow).
  - **Permafrost Glaciation & Crystalline Barrier (<= 50% HP)**: Phase transition at or below 210 HP. Unlike Abyssal Colossus's attack speed/move speed frenzy Enrage, Glacial Sovereign encases itself in permafrost, conjuring a 100 HP Crystalline Ice Barrier (`iceBarrierHp: 100`) that completely absorbs incoming damage before main HP until shattered, and updates badge to `'❄️ CRYO SOVEREIGN ❄️'`.
  - **Frost Thorns Reflection**: While glaciated, reflects 15% of all incoming melee damage back to attackers as cold damage.
- **Spawn Logic, Thematic Regional Fit & Floor 10 Deliberate Resolution**:
  - Zero modification to Boss-tier spawn rates or floor-interval logic (guaranteed every 5th floor + random chance unchanged).
  - Explicit regional boss alignment eliminating accidental thematic mismatches:
    - **Floor 5 (Abyssal Depths, Floors 3–5)**: Explicitly routes to `abyssal_colossus` via `abyssal_depths.bossEnemyId`.
    - **Floor 10 (Infernal Caldera, Floors 6–10)**: Explicitly routes to `abyssal_colossus` via `infernal_caldera.bossEnemyId = "abyssal_colossus"`. This avoids silent fallback or random `bossPool` roulette that could inappropriately drop an ice monarch into the volcanic core. As a massive dark subterranean stone titan with tectonic Earthshaker Tremors, `abyssal_colossus` serves as the deliberate, documented subterranean boss placeholder for Infernal Caldera pending a future dedicated Fire/Magma Boss milestone. Multi-seed testing confirms 0% Glacial Sovereign bleed into Infernal Caldera.
    - **Floor 15+ (Glacial Caverns, Floors 11+)**: Explicitly routes to `glacial_sovereign` via `glacial_caverns.bossEnemyId`.
  - `bossPool: ["abyssal_colossus", "glacial_sovereign"]` registered in `data/dungeonConfig.json` with backward-compatible fallback `bossEnemyId: "abyssal_colossus"`.
- **Harvest & Drop Table**:
  - 4-item salvage/rare drop table in `data/enemies.json`:
    - `glacial_core` (salvage, 1.0 roll chance, amount [1, 2], sellValue 75, craftable into cryo catalysts)
    - `rime_carapace` (salvage, 0.85 roll chance, amount [1, 3], sellValue 65, craftable into frost mail)
    - `glacial_essence` (salvage, 0.70 roll chance, amount [2, 4], sellValue 50, pure cryo reagents)
    - `eye_of_the_sovereign` (rare_drop, 0.20 roll chance, amount [1, 1], sellValue 220, prized monarch relic)
  - Registered items in `data/items.json` and tooltips in `src/ui/HUD.ts`.
  - Guaranteed 20 Research Points awarded upon defeat via `calculateResearchPointsForEnemy`.
- **Verification**:
  - `test/milestone_second_boss.test.ts`: 100% pass across all unit tests, including dedicated multi-seed testing of Floor 5, Floor 10 (50 random seeds verifying 100% Abyssal Colossus with 0% Glacial Sovereign bleed), and Floor 15.
  - `test/milestone34.test.ts`: 100% pass across all tests and 100-floor boss chamber simulations.
  - `test/milestone_third_named_region.test.ts`: 100% pass.
  - `test/verify_milestone_second_boss_browser.mjs`: Live browser E2E test in real Chrome instance verifying procedural generation on Floor 5 (`abyssal_colossus`), Floor 10 (`abyssal_colossus`), Floor 15 (`glacial_sovereign`), texture generation, ranged attacks, Glacial Spike Nova splash damage, Rime Frostbite affliction, Permafrost Glaciation barrier absorption, Frost Thorns reflection, and +20 RP award.
  - `npm run build`: Production bundle (`tsc && vite build`) compiles cleanly with 0 errors.

**Resolved and shipped: Milestone — Water Terrain Generation.**
- **Tile & Obstacle Classification**:
  - `TileType.FLOOR = 0`: Walkable floor terrain.
  - `TileType.WALL = 1`: Impassable stone/bedrock obstacle.
  - `TileType.WATER = 2`: Impassable water terrain (hard obstacle for movement, interactable from adjacent tiles).
  - Stated walkability rule: water is strictly impassable to normal movement. EasyStar acceptable tiles remain strictly `[0]`.
  - `Pathfinder`:
    - `isObstacle(x, y)`: Returns true for wall (`1`) and water (`2`).
    - `isWater(x, y)`: Returns true only for water (`2`).
    - `isWall(x, y)`: Returns true only for wall (`1`).
    - `isWalkable(x, y)`: Returns true only for floor (`0`).
    - `hasLineOfSight(start, end)`: Water does not block vision or ranged projectiles (`isWall` blocks LOS).
- **Procedural Visual Asset Ladder (Quad-Biome Theming)**:
  - `tile-water` (Ancient Crypts / Standard): Subterranean freshwater cistern pool with soft ripples, caustic fluid lines, stone basin trim, and reflection glints.
  - `tile-abyssal-water` (Abyssal Depths): Bioluminescent void spring with deep obsidian-purple foundation, radiant violet/magenta ripples, and glowing spore particles.
  - `tile-caldera-water` (Infernal Caldera): Volcanic thermal pool / hot spring with scorched basalt rim, swirling incandescent amber/orange currents, and bubbling heat glints.
  - `tile-glacial-water` (Glacial Caverns): Freezing sub-zero glacial melt pool with oceanic cyan base, frosted rime border, sharp ice-fracture wavelets, and floating diamond frost flecks.
  - Registered in `data/dungeonConfig.json` and mirrored in `DataLoader.DEFAULT_REGIONS`.
- **Procedural Placement Invariants (`DungeonGenerator.ts`)**:
  - Restricts water generation to eligible rooms (`gathering`, `light_combat`) with minimum dimensions of 5x5.
  - Excluded from `entrance` and `boss` chambers.
  - **Corridor Exclusion**: Confined strictly to room interior; 0 water tiles placed in corridors.
  - **Doorway Clearance**: Every water tile maintains Chebyshev distance >= 2 from all room perimeter doorway thresholds.
  - **Feature Exclusion**: Strictly forbids spawning on `portalPos`, `crystalPos`, room center, enemy spawns, or gathering node / bush spawns.
  - **Intra-Room Traversal Guarantee**: Intra-room BFS verifies that all room doorway entrances can reach every other doorway entrance and the room center through walkable floor (`0`) without obstruction.
  - **Global Connectivity Invariant**: Verified via BFS from `portalPos` across all room centers and `crystalPos`.
  - Driven by a deterministic local PRNG (`roomWaterSeed`), ensuring zero perturbation of sequential multi-floor RNG simulations.
- **Adjacent-Tile Interaction**:
  - Clicking on water routes selected party members to the nearest open adjacent walkable tile facing the water pool, mirroring gathering node interaction mechanics.
  - Dispatches feedback toast (`"The water here looks too deep to cross."`).
  - Scene methods: `isWater(x, y)`, `getWaterTiles()`, and `interactWithWater(waterTile, character)`.
- **Verification**:
  - `test/milestone_water_terrain.test.ts`: 100% pass across all 7 unit, topology, and multi-seed tests (500 seeds tested: 0 corridor bottlenecks < 2 tiles, 0 doorway bottlenecks, 100% full graph connectivity, 100% byte-for-byte deterministic seed invariance).
  - `test/test_corridor_doorway_widths.ts`: 100% pass across 500 seeds.
  - `test/milestone34.test.ts`: 100% pass across all tests and 100-floor boss encounter simulations.
  - `test/milestone44.test.ts`, `test/milestone56.test.ts`, and `test/milestone_third_named_region.test.ts`: 100% pass.
  - `test/verify_water_terrain_browser.mjs`: Live Chrome E2E browser test verifying water rendering, Pathfinder queries, click-to-water dispatch, and adjacent-tile movement.
  - `npm run build`: Production bundle (`tsc && vite build`) compiles cleanly with 0 errors.

**Resolved and shipped: Milestone — Fishing.**
- **Specification & Documentation Audit (Documented vs Newly Designed Transparency Standard)**:
  - **Already-Documented in Design Docs**:
    - `docs/true_grind_gdd (2).md` Section 11.2 (Lines 308–310): Line 310 explicitly named `fishing spots (Fishing)` as one of the dungeon gathering nodes alongside Trees (Woodcutting), bushes (Foraging), rocks (Mining), and dig spots (Digging).
    - `docs/true_grind_gdd (2).md` Section 11.2 universal gathering specification (Lines 312–314): Line 312 specifies channel-based interaction with progress bar ("takes a few real seconds") and combat damage interrupt (cancels attempt, wipes progress, zero yield/EXP, enters combat). Line 314 specifies node depletion rules (stays depleted for floor visit, reset only on fresh floor). *Note: The specific numeric duration of "2.5 seconds" (2500ms) is an inference adopted from the codebase standard in `data/gatheringNodes.json` (Line 2: `"defaultChannelDurationMs": 2500`), not a literal quote from the GDD.*
    - `docs/true_grind_gdd (2).md` Section 11.2a Gathering Mode specification (Lines 316–318): Lines 316–318 specify the dedicated hotkey, dragging to draw a marquee selection area encompassing multiple nodes, and party queue execution. Line 329 also explicitly specifies that new node types should enter the same universal pool without special-case selection logic.
    - `docs/class_system (1).md` lines 208, 221, 237:
      - Line 208: Defines `Fishing` as an optional extra gathering skill.
      - Line 221: Gathering Skills table lists `| Fishing | Fish, aquatic reagents | Cooking, Alchemy |`.
      - Line 237: Cooking Recipe Tiers table lists `Fishing` among ingredient sources.
  - **Newly Designed / Extrapolated to Complete Implementation**:
    - No specific numeric loot tables or item weights were written in the original docs: implemented a balanced standard loot table in `data/gatheringNodes.json` yielding `raw_fish` (70% weight, 1x) and `aquatic_reagent` (30% weight, 1x), awarding standard +15 EXP.
    - Added item definitions in `data/items.json`: `raw_fish` ("Raw Fish", 0.3 weight, gathering) and `aquatic_reagent` ("Aquatic Reagent", 0.1 weight, reagents).
    - No Tier 0 class for Fishing was named in `class_system.md`: added Tier 0 Novice class `angler` in `data/classes.json` (`fishing: 10`, novice, fantasy: *"Patient hands, a line in the water, and an eye on the ripples"*), exactly matching the pattern of `Excavator` (`digging: 10`).
- **8th Gathering Skill Mechanics**:
  - Registered `fishing` proficiency across `data/player.json`, `ProgressionSystem.ts`, `DataLoader.ts`, and `HUD.ts` (accent color `#38bdf8`, Knowledge Base discipline entry).
  - Procedural node placement (`spawnWaterFishingSpots` in `MainScene.ts`): automatically populates interactive `fishing_spot` nodes on water tiles in rooms with water pools that maintain adjacent walkable floor clearance.
  - Node visuals: `TextureGenerator.ts` generates luminous swirling water ripples and fish silhouette for `fishing-spot`, and calm dissipated ripples for `fishing-spot-depleted`.
  - Adjacent-bank channeling: interacting with a fishing spot paths the character to an open adjacent walkable bank tile facing the water (`dist <= 1.5`), channeling for 2500ms with floating progress bar. Clicking a water tile containing an active fishing spot also seamlessly begins fishing.
  - On completion: awards resource yields, grants +15 Fishing EXP, displays floating text/toasts (`"🎣 Caught Raw Fish (+15 Fishing EXP)"`), and sets node state to `Fished Out` for remainder of floor visit.
- **Gathering Mode Auto-Queue Integration**:
  - Drag marquee selection in Gathering Mode encompasses `fishing_spot` nodes without any special-case handling.
  - Auto-queue dispatches available workers to shore tiles adjacent to fishing spots to execute channeling and advance through the queue.
- **Tier 0 Class Unlock**:
  - Reaching level 10 in `fishing` unlocks the `Angler` class and notifies the progression system.
- **Zero Regression on Water Terrain Generation**:
  - Water terrain placement logic in `DungeonGenerator.ts` left strictly untouched.
  - Impassable water movement and LOS invariants fully preserved.
- **Verification**:
  - `test/verify_fishing_browser.mjs`: 100% pass across all 6 live browser E2E suites: schema validation, procedural spawning, adjacent-shore channeling, +15 Fishing EXP and item yields, depleted label update, Gathering Mode drag marquee/queue integration, and Tier 0 Angler unlock.
  - `test/verify_water_terrain_browser.mjs`: 100% pass across live Pathfinder queries and adjacent-tile water approach.
  - `npm run build`: Production bundle (`tsc && vite build`) compiles cleanly with 0 errors.





