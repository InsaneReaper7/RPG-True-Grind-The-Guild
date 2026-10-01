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

**Resolved and shipped: Fishing Correction — Research Gate, Craftable Fishing Rod, and Generic Personal Tool Requirement.**
- **Research Tree Gate (`research_fishing`)**:
  - Gated Fishing behind the research unlock `research_fishing` in `data/researchTree.json` (Cost: 10 RP, category: `'gathering'`, prereqs: `[]`), matching the existing unlock paradigm of Digging, Skinning, Butchering, and Gardening.
  - `spawnWaterFishingSpots()` in `MainScene.ts` checks `GameState.getInstance().isFishingUnlocked()` (`this.isResearchCompleted('research_fishing')`); fishing spot nodes are completely hidden and never placed in dungeon waters while locked.
  - Registered node icon `🎣` in `HUD.ts` with research completion feedback toast.
  - Unlocking tested via modal interaction (`scene.hud.openResearchTreeModal()` spending 10 RP via UI button).
- **Craftable Fishing Rod (`fishing_rod`)**:
  - Added `fishing_rod` item definition to `data/items.json` (`category: "reagents"`, `weight: 1.0`, `icon: "🎣"`), matching the tool classification of `lockpick`.
  - Added `fishing_rod` recipe to `data/blacksmithRecipes.json` (`requiredLevel: 0`, `expGranted: 20`, ingredients: `wood: 3, spider_silk: 2`).
  - Implements Outpost crafting routing rules: consumes materials from shared party stockpile, awards +20 Blacksmithing EXP to the Party Leader, and deposits the rod into the Leader's personal inventory.
- **Generic Data-Driven Tool Requirement Schema (`requiredToolItemId`)**:
  - Extended `GatheringNodeDef` interface in `src/types/game.ts` with optional `requiredToolItemId?: string;`.
  - Configured `"requiredToolItemId": "fishing_rod"` on `fishing_spot` in `data/gatheringNodes.json` and `DataLoader.ts`.
  - Implemented generic `canInteractWithGatheringNode(node, character)` in `MainScene.ts`: validates depleted state, incapacitation, and presence of `requiredToolItemId` in character's personal inventory with **zero hardcoded skill checks** (audited in Test 7: no `skillId === 'fishing'` or any skill name in the interaction/tool-check path).
  - Verified with synthetic dummy node (`synthetic_resonator_matrix`) and synthetic dummy tool (`synthetic_plasma_resonator`), proving 100% data-driven engine support.
- **Personal Inventory & Non-Consumption Mechanics**:
  - Tool item must be carried personally in the specific character's inventory (`character.getItemCount(...) > 0`). Party members lacking the tool cannot interact or channel.
  - The tool is **persistently carried and not consumed** upon successful harvest completion.
  - **Mid-Channel Removal Edge Case**: If the required tool is removed mid-channel (e.g., inventory transfer), channeling aborts immediately with zero yield and node remains unharvested.
  - **Gathering Mode Auto-Queue Filtering**: Marquee drag selection skips tool-lacking nodes when no party member carries the tool with **exactly one warning toast** (audited in Test 5), while tool carriers are correctly assigned and unassigned nodes remain safely queued.
- **One-Time Pre-Gate Save Migration**:
  - Added migration logic to `GameState.restoreFromLoadedSnapshot(snap)`: automatically grants `research_fishing` if the Party Leader or any companion in an existing save file possesses Fishing progress (`currentExp > 0` or `level > 0`), preventing locked-out states on prior saves while preserving the lock for fresh games.
- **Seed Determinism Invariance (`MainScene.create()`)**:
  - Full-scene generation invariance verified across seeds using `MainScene.create()`.
  - Tested 8 seeds (all spawning $\ge 1$ fishing spots when unlocked), confirming byte-for-byte exact equality of all non-fishing entities (enemies matched by id, position, hp; non-fishing gathering nodes matched by id and position; dungeon rooms matched by position, dimensions, type; and water tiles matched by position) between locked and unlocked scene builds.
- **Verification**:
  - `test/fishing_correction.test.ts`: 100% pass across all unit and integration tests (static schema, Blacksmith crafting transaction, full scene seed invariance, retroactive save migration, personal inventory tool check and mid-channel cancellation, Gathering Mode single toast, synthetic generic node proof, and zero skill-name code audit).
  - `test/verify_fishing_browser.mjs`: 100% pass across live Chrome E2E browser tests (modal RP research unlock, Blacksmith rod crafting from stockpile to leader inventory, personal inventory tool check, shore channeling with crafted rod, rod non-consumption, dual-case Gathering Mode marquee queue/skip toast, and Tier 0 Angler unlock).
  - `test/milestone26.test.ts`: 100% pass across all 10 Gathering Mode regression tests.
  - `test/milestone_water_terrain.test.ts` & `test/verify_water_terrain_browser.mjs`: 100% pass across water terrain unit and browser tests.
  - `npm run build`: Production bundle (`tsc && vite build`) compiles cleanly with 0 errors.

**Resolved and shipped: Crafting Output Routing & Equipment Conservation.**
- **Crafting Output to Character Inventory**:
  - All Outpost crafting stations (Blacksmithing, Armorsmithing, Bowyer, Alchemy, Cooking) route crafted output goods and crafting EXP directly to the active Party Leader's personal inventory grid, adding to their carried weight.
  - Raw crafting inputs consume centrally from the shared party stockpile (`GameState`), allowing an empty-handed promoted leader to craft cleanly without personal reagents.
  - Explicit `resultItemId` audit: verified all 6 Alchemy recipes (`bandage`, `antidote`, `energy_potion`, `mana_potion`, `revive_potion`, `escape_stone`) specify valid item targets matching `data/items.json`.
- **Data-Driven Recipe Coverage**:
  - Full audit across all 13 physical weapon families and 5 armor slots confirms 100% recipe coverage across Blacksmithing, Armorsmithing, and Bowyer (with Fist documented as an unarmed baseline).
- **Equipment Source-of-Truth & Conservation Rule**:
  - **Equipping Rule**: `handleSlotDrop` deducts from the character's personal inventory first; if not present, it deducts from the shared party stockpile via `gameState.consumeItem`.
  - **Unequipping / Swapping Rule**: Removed or swapped gear returns exclusively to that character's personal inventory (`member.addItem`), never duplicated into the stockpile.
  - **Walkthrough Note for the Record**:
    > *"Because removed gear always returns to personal inventory, any item equipped from the stockpile migrates into that character's bag when it's unequipped, and adds to their carried weight."*
  - **Conservation Invariant Verification (`test/craftingInventoryRouting.test.ts` Test 2)**:
    - *Stockpile-Sourced Equip*: Starting at Personal=0, Stockpile=1, equipping decrements Stockpile 1 -> 0 and increments Equipped 0 -> 1 (`Total = 1`).
    - *Direct Unequip*: Direct unequip from paperdoll without weapon swap decrements Equipped 1 -> 0 and increments Personal 0 -> 1 into carried bag (`Total = 1`).
    - *Both-Stores Priority*: When present in both stores (Personal=1, Stockpile=1), equipping consumes personal inventory first (Personal 1 -> 0, Stockpile untouched at 1, Equipped 0 -> 1, `Total = 2`).
    - *10 Stockpile-Sourced Cycles*: 10 cycles alternating Stockpile 1 -> 0 -> 1 and Personal 0 -> 1 -> 0 with redeposit between cycles, proving exact item conservation (`Total = 1`) across all 30 steps.
    - *10 Swap Cycles Dual-Weapon Tracking*: 10 cycles of Katana-to-Greatsword swapping logging and asserting constant totals for both Katana (`Total = 2`) and Greatsword (`Total = 10`) at every step.
- **Stash Exploit Closure & Drag Restrictions**:
  - Unowned equipment in party overview modals is marked non-draggable (`draggable="false"`).
  - `handleSlotDrop` strictly validates item presence in either personal bag or stockpile before allowing equips, closing client-side injection / duplication exploits.
- **Encumbrance Recalculation Across All Routes**:
  - Encumbrance and speed penalties (-80%) update reliably across every route: item drops, gathering yields, stockpile deposits, inter-party transfers, and companion promotions.
- **Verification**:
  - `test/craftingInventoryRouting.test.ts`: 100% pass across all 7 test suites (recipe audit, 5-part equipment conservation suite, encumbrance routing, alchemy item targets, empty-handed leader input source, debug flag gating, stash exploit closure).
  - `test/craftingStationRecipeFilter.test.ts`: 100% pass across all 9 suites (unlocked filtering, Cooking undiscovered count secrecy, OutpostScene leader change re-renders).
  - `test/milestone51.test.ts` & `test/milestone35.test.ts`: 100% regression pass.
  - `npm run build`: Production bundle (`tsc && vite build`) compiles cleanly with 0 errors.

**Resolved and shipped: Dungeon Floor & Water Rendering Overhaul — Phaser Tilemap GID Root Cause, Regional Floor Restoration, and Seamless Multi-Variant Water System.**
- **Phaser 3 Tilemap GID Root Cause**:
  - In Phaser 3, `tilemap.addTilesetImage(name, key, tileWidth, tileHeight, tileMargin, tileSpacing, gid)` defaults `gid` to `0` if omitted.
  - When multiple tilesets are registered without an explicit `gid`, each call registers at GID 0. During `BuildTilesetIndex`, Phaser maps tile indices sequentially starting from each tileset's `firstgid` (`index = firstgid + localId`). Each successive registration without a distinct `gid` overwrote index 0 (`tiles[0]`) with its own texture, leaving higher indices (`1`, `2`) unmapped (`NULL_TILESET`, rendering completely transparent/invisible).
- **Historical Git Audit (When Did It Break?)**:
  - `addTilesetImage` was audited across git history using `git log -S "addTilesetImage"`:
    - **Milestone 1 (`9d57f61`)**: Registered `tile-walkable` then `tile-obstacle` without GIDs. `tiles[0]` was overwritten with `tile-obstacle`. Floor rendered as wall texture, and walls (`1`) were invisible (`NULL_TILESET`). **Perimeter walls have been invisible since Day One of the project.**
    - **Outpost Milestone 4 (`71a3bf1`)**: Registered `tile-outpost-grass` then `tile-outpost-wall` without GIDs. `tiles[0]` was overwritten with `tile-outpost-wall`. All grass rendered as wall, and outpost walls were invisible.
    - **Water Terrain Milestone (`5e137af`)**: Added `tile-water` as the 3rd tileset without GID. Overwrote `tiles[0]` with `tile-water`. All dungeon floors rendered as water, while walls (`1`) and water pools (`2`) were unrendered.
  - **Important Retrospective Note**:
    > *Earlier handoff and milestone entries describing regional tile visuals (Ancient Crypts slate, Abyssal Depths basalt, Infernal Caldera fiery floor, Glacial Caverns rime) were verified from texture generation canvas previews only and were never actually visible in-game until this fix. With this fix, authentic regional floors and perimeter walls render in-game for the first time.*
- **Tileset & Layer Scope Verification**:
  - Full codebase audit (`git grep`) confirms **no other `addTilesetImage` calls, tilemap instantiations, or overlay/decoration layers exist anywhere in the codebase** outside of `MainScene.ts` and `OutpostScene.ts`.
- **Code Audit: Zero Gameplay Reads on Rendered Tilemap Indices**:
  - Verified across all files: zero gameplay systems (pathfinding, fishing, interaction clicks, build mode, fog of war, minimap) read tile types from the Phaser tilemap layer (`getTileAt`, `layer.data`).
  - All game mechanics strictly query `gridMatrix[y][x]` or `Pathfinder.isWalkable(x, y)`. Assigning distinct GIDs `2`, `3`, and `4` for water variants introduces zero gameplay regressions.
- **Explicit GID Registration**:
  - `MainScene.ts`: Registered explicit GIDs: `tile-walkable` (GID 0), `tile-obstacle` (GID 1), `tile-water` (GID 2), `tile-water-1` (GID 3), `tile-water-2` (GID 4).
  - `OutpostScene.ts`: Registered `tile-outpost-grass` (GID 0) and `tile-outpost-wall` (GID 1).
- **Seamless Procedural Water System (3 Variants Per Biome)**:
  - Overhauled `TextureGenerator.ts` across all 4 biomes (`tile-water`, `tile-abyssal-water`, `tile-caldera-water`, `tile-glacial-water`) generating 12 total textures (base, `-1`, `-2`).
  - Completely removed outer `strokeRect` borders that created artificial grid patterns.
  - Wavelets and caustics are generated $\ge 4\text{px}$ from tile boundaries, guaranteeing zero tile-edge clipping or seams.
  - **Infernal Caldera Mineral Water**: Caldera water uses a dark thermal mineral base (`0x221815`) with amber steam wavelets (`0xd97706`), rendering unambiguously as liquid water and preventing visual confusion with upcoming hazardous lava mechanics.
- **Deterministic Coordinate Hash Variant Selection**:
  - In `MainScene.ts`, water tiles are assigned variants using a 32-bit coordinate hash with `Math.imul`:
    `const h = (Math.imul(wt.x, 374761393) ^ Math.imul(wt.y, 668265263)) ^ 0x5bf03635;`
    `this.tilemap.putTileAt(2 + (Math.abs(h) % 3), wt.x, wt.y, false, 0);`
  - Coordinate-only; does not advance or mutate dungeon RNG, fully preserving seed determinism.
- **Rendered-Texture Assertions in E2E Browser Test**:
  - Extended `test/verify_water_terrain_browser.mjs` to assert actual rendered texture keys via `layer.data[y][x].tileset.image.key`:
    - Outpost grass tiles assert `tile-outpost-grass` (0 wrong).
    - Outpost wall tiles assert `tile-outpost-wall` (0 unrendered).
    - MainScene floor tiles assert `activeRegion.walkableTexture` (0 wrong).
    - MainScene wall tiles assert `activeRegion.obstacleTexture` (0 wrong).
    - MainScene water tiles assert regional water texture variants (0 wrong).
- **Verification**:
  - `test/milestone_water_terrain.test.ts`: 100% pass across all 7 unit and topology tests (all 12 variants verified, 500-seed regression with 0 reachability/bottleneck failures, seed determinism verified).
  - `test/fishing_correction.test.ts`: 100% pass across all 7 tests.
  - `test/verify_water_terrain_browser.mjs`: 100% pass across Outpost rendering, dungeon floor/wall/water rendering, pathfinding, and adjacent interaction.
  - `test/verify_fishing_browser.mjs`: 100% pass across live fishing E2E workflows.
  - `cmd /c npm run build`: Production bundle (`tsc && vite build`) compiles cleanly with 0 TypeScript errors.

**Resolved and shipped: Urgent Alpha Checkpoint Fixes — Second-Wipe Soft-Lock, Stale Scene State, Dungeon Floor Seed Diversity, and Dual Wielding EXP Leak.**
- **Bug 1: Second Party Wipe Soft-Lock & Stale Scene State**:
  - **Root Cause**: Phaser 3 caches and reuses Scene instances (`MainScene` and `OutpostScene`). On the first party wipe, `MainScene.handlePartyWipe()` set `this.isWiping = true`. However, neither `MainScene.create()` nor `init()` reset `isWiping`. When the player returned from the Outpost and wiped a second time, the check `if (this.isWiping || this.isTransitioning) return;` suppressed the wipe flow, leaving the party downed indefinitely.
  - **Root Fix**: Implemented Phaser `init()` and dedicated `resetPerVisitState()` methods on both `MainScene` and `OutpostScene`. Every per-visit field is systematically reset on entry.
  - **Comprehensive Field Audit**:
    - *MainScene Per-Visit (Reset in init / resetPerVisitState)*: `isWiping` (`false`), `isTransitioning` (`false`), `isCameraLocked` (`true`), `floorTimerRemainingMs` (`floorTimerDurationMs`), `bossEncounterAnnounced` (`false`), `enemies` (`[]`), `selectedMembers` (`clear()`), `lastMoveDestinationHighlights` (`[]`), `activeMoveHighlights` (`[]`), `tileClaimOverlay` (`destroy()`), `activeGatherChannels` (`destroy() + clear()`), `activeReviveChannels` (`destroy() + clear()`), `gatheringArrivalTimers` (`remove() + clear()`), `gatheringNodes` (`respawnTimer.remove() + []`), `isGatheringMode` (`false`), `isGatheringDrag` (`false`), `gatherDragStart` (`null`), `currentGatherSelectionHighlights` (`[]`), `gatheringQueue` (`[]`), `gatheringQueueWorkers` (`clear()`), `gatheringWorkerNodeAssignments` (`clear()`), `dungeon` (`null` on exit/wipe/continue, preserved only when explicitly passed to restart), `assignedSeed` (`null`), `currentFloorSeed` (`undefined`).
    - *MainScene Cross-Visit / Persistent*: `gameState`, `pathfinder`, `combatSystem`, `gatheringSystem`, `buildingSystem`, `hud`, `player`, `party`, `mapWidth`, `mapHeight`, `tileSize`.
    - *OutpostScene Per-Visit (Reset in init / resetPerVisitState)*: `isTransitioning` (`false`), `isBuildMode` (`false`), `isPlacementValid` (`false`), `selectedBuildableDef` (`null`), `placementGhost` (`destroy() + null`), `roomLabels` (`destroy() + []`), `placementWarningText` (`destroy() + null`), `wallCandidateHighlights` (`[]`), `selectedMembers` (`clear()`), `lastMoveDestinationHighlights` (`[]`), `activeMoveHighlights` (`[]`).
    - *OutpostScene Cross-Visit / Persistent*: `gameState`, `pathfinder`, `buildingSystem`, `hud`, `player`, `party`.
  - **Verification**: Verified via `test/verify_three_consecutive_wipes.mjs` in a real browser session (3 consecutive wipes taking lethal damage, returning to Outpost each time with 100% reliability).
- **Bug 2: Dungeon Layout Reused on Re-entry**:
  - **Root Cause**: `this.dungeon = this.dungeon || DungeonGenerator.generate(...)` reused the first generated dungeon object across all subsequent portal entries and continue descents.
  - **Root Fix**: Added `DungeonGenerator.createRng(seed)` using a deterministic Linear Congruential Generator. Added `seed` to `GeneratedDungeon`. `MainScene` generates a unique random seed for each portal entry and crystal Continue, sets `this.dungeon.seed`, and nulls `this.dungeon` upon transition to Outpost, wipe, or crystal Continue descent (`executeContinueDescent`).
  - **Verification**: Verified via `test/verify_floor_seeds_and_determinism.mjs`:
    - 3 consecutive portal entries produced 3 distinct seeds (`10984`, `984196`, `853110`) and distinct room layouts.
    - Crystal Continue generated a fresh floor with new seed `507963`.
    - Identical seeds produced 100% byte-identical `gridMatrix`, room rects, `portalPos`, and `crystalPos`.
- **Bug 3: Dual Wielding EXP Leak on Sidearms**:
  - **Root Cause**: `CombatSystem` awarded `dual_wielding` proficiency EXP whenever `attacker.offhandWeapon` was present, and `Player.isDualWielding()` only checked if `offhandWeapon !== null`. Valerie (Scout, Bow + Dagger sidearm) was treated as dual wielding, struck with daggers at range, and received `dual_wielding` EXP.
  - **Root Fix**:
    - Updated `Player.isDualWielding()` to strictly require: mainhand is 1H melee (`category === 'melee_1h' && !twoHanded`), offhand is 1H melee (`category === 'melee_1h' && !twoHanded`), and `isDualWieldUnlocked()` is true.
    - Added `isLegitimatelyDualWielding(member)` in `CombatSystem.ts` and guarded all 3 EXP awarding routes: skill damage, offhand strike, and kill.
    - Sidearms (Bow + Dagger, Throwing Weapons + Dagger, Spear + Throwing Weapons) strictly isolated and gain 0 `dual_wielding` EXP.
    - Existing save files audited: `data/player.json` initializes at 0 EXP; test saves in `milestone8.test.ts` and `milestone_persistent_saves.test.ts` left untouched.
  - **Verification**: Verified via `test/verify_dual_wield_leak.mjs` (Valerie gained 0 `dual_wielding` EXP in combat, sidearms rejected, and legitimate dual wielder gained DW EXP only with DW perk unlocked).
- **Full Regression Verification Passed**:
  - `downedLeaderSoftlockFix.test.ts`: 100% pass (all 5 softlock scenarios).
  - `downedPartyTransitionVerification.test.ts`: 100% pass (descent and wipe preserve all party members).
  - `verify_milestone_third_region_browser.mjs`: 100% pass (full 11-floor continue-chain into Glacial Caverns and return to Outpost).
  - `milestone_water_terrain.test.ts`: 100% pass (all 7 tests, 500 seeds verified).
  - `fishing_correction.test.ts`: 100% pass (all 7 tests).
  - `milestone_thrower.test.ts`: 100% pass (all 9 tests).
  - `verify_water_terrain_browser.mjs`: 100% pass.
  - `verify_fishing_browser.mjs`: 100% pass.
  - `scripts/alpha_checkpoint_harness_v2.mjs`: 100% pass across all stages (cold start boot, build mode placement, tutorial progression, 5-seed deadlock re-test with 0 stalls, 15-trip realistic play loop, research unlock, blacksmith crafting, inventory routing, and return combat).
  - `npm run build`: Production bundle (`tsc && vite build`) built cleanly in 3.65s with 0 errors.

**Resolved and shipped: Fix — Digging Spots Must Add to the Floor, Not Reshuffle It.**
- **Root Cause**:
  - `DungeonGenerator.ts` assigned node types using `nodeTypes[(rIdx + i) % nodeTypes.length]` with `nodeTypes.push('dig_spot')` when `isDiggingUnlocked` was true.
  - Pushing `'dig_spot'` into the array expanded `nodeTypes.length` from 3 to 4, shifting modulo indexing across every room for identical seeds and mutating non-dig gathering node types and positions.
  - Furthermore, `dig_spot` consumed room gathering slots from `randInt(minB, maxB)`, reducing non-dig gathering nodes on every floor (from 9–11 down to 6–9 across audited seeds). Unlocking Digging penalized the player by depriving them of Wood, Ore, and Herbs.
- **Root Fix**:
  - **Base Gathering Modulo Pool Isolation**: In `DungeonGenerator.ts`, `nodeTypes` is strictly locked to `['foraging_bush', 'woodcutting_tree', 'mining_rock']`. All base gathering nodes (and rare vegetable nodes) generate with 100% byte-for-byte identical types, positions, counts, and RNG consumption regardless of whether Digging is locked or unlocked.
  - **Additive Post-Generation Placement Pass**: Dig spots are placed in a dedicated pass after the floor, corridors, water terrain, rooms, portal, crystal, enemies, and base nodes are generated.
  - **Deterministic Local PRNG**: Derived `digRng` directly from `(floorSeed ^ 0x9E3779B9) >>> 0`, where `floorSeed = options?.currentFloorSeed ?? options?.seed`. Strictly avoids calling or perturbing the shared dungeon RNG stream.
  - **Target Count (2–3 Spots)**: Evaluates `targetCount = 2 + Math.floor(digRng() * 2)`, guaranteeing exactly 2 or 3 dig spots per floor when unlocked (0 when locked).
  - **Placement Invariants (Reusing Water-Terrain Checks)**:
    - Floor tiles only (`gridMatrix[y][x] === 0`). Never wall (`1`) or water (`2`).
    - Strictly inside eligible rooms (`room.type !== 'entrance' && room.type !== 'boss'`). Never in corridors.
    - Inside room interior (`x >= room.x + 1 && x <= room.x + room.width - 2`, `y >= room.y + 1 && y <= room.y + room.height - 2`), never on perimeter walls.
    - Clearance from doorways: Identifies doorway threshold perimeter tiles; candidate tiles must not be doorway tiles and must maintain >= 1-tile clearance from any doorway tile.
    - Zero entity overlap: Avoids `portalPos`, `crystalPos`, room center, enemies in `enemySpawns`, base nodes in `bushSpawns`, water tiles in `waterTiles`, and other placed dig spots.
  - **Integration & Non-Retroactivity**: Placed dig spots are appended to `bushSpawns`, allowing `MainScene.create()` to instantiate them without special cases. Pre-existing floors generated prior to research unlock retain their `bushSpawns` without retroactively gaining dig spots.
- **Verification Evidence**:
  - `test/milestone_alpha_digging_determinism.test.ts`: 100% pass across all 8 seeds with `MainScene.create()`. Every non-dig gathering node (exact count, position, and type), enemy, room, water tile, portal, and crystal is 100% identical between locked and unlocked. Dig spot counts: exactly 0 when locked, 2–3 when unlocked. Coordinates per seed and room boundaries printed in runner output.
  - `test/milestone_alpha_dig_placement_validity.test.ts`: 100% pass across 500 seeds with 0 invalid tiles, 0 corridor placements, 0 doorway clearance violations, 0 entrance/boss room placements, and 0 entity overlaps (1241 total dig spots placed, avg 2.48/floor).
  - `test/milestone26.test.ts`: 100% pass across all 11 tests, including Test 11 where the party marquee-selects a mix of base nodes and dig spots and gathers both simultaneously in parallel.
  - `test/milestone30.test.ts`: 100% pass across all 7 tests (strict gating, non-retroactivity, 4-item loot table, excavator unlock).
  - `test/milestone_water_terrain.test.ts`: 100% pass across all 7 tests (500 seeds verified).
  - `test/fishing_correction.test.ts`: 100% pass across all 7 tests (seed determinism and scene invariance).
  - `test/milestone32.test.ts`: 100% pass across all 7 tests.
  - `npm run build`: Production bundle (`tsc && vite build`) compiled cleanly in 3.23s with 0 errors.

**Resolved and shipped: Milestone — Revive Economy: Starting Revives, Bones, and Bone Meal.**
- **Expanded Starting Consumable Kit (New Games Only)**:
  - In `src/systems/GameState.ts`, new game initialization seeds Guild Hero and Valerie with personal consumable kits:
    - 5x Revive Potion (2.5 kg)
    - 5x Bandage (0.5 kg)
    - 5x Antidote (1.0 kg)
    - 5x Energy Potion (1.5 kg)
    - Total: 20 items, 5.5 kg carried.
  - Summoned recruits (e.g. Kaelen via `createBlankRecruitSnapshot`) receive 0 starting consumables (`inventory: {}`).
  - Stockpile begins with 0 consumable items.
  - Carry weight verified: Guild Hero carried weight is 8.5 kg / 45.0 kg (3.0 kg short_swords + 5.5 kg kit); Valerie carried weight is 8.5 kg / 45.0 kg (2.0 kg bows + 1.0 kg daggers + 5.5 kg kit). Both characters remain well under the 45.0 kg encumbrance threshold (18.9% capacity, 36.5 kg spare capacity).
  - Existing saves loaded via `loadFromDisk` are preserved untouched.
- **Bones & Enemy Loot Rebalance**:
  - Reused existing `bone` item (`data/items.json`).
  - Common enemy drops consolidated to a single 40% any-drop roll (`dropChance: 0.40`), picking at most 1 item from weighted loot table via `CombatSystem.rollCommonEnemyDrop`.
  - All skeletal/vertebrate common enemies drop bones (Wolf weight 3, Goblin weight 3, Goblin Archer weight 2, Skeleton weight 2, Skeleton Archer weight 2, Undead weight 2).
  - Non-skeletal enemies (Slime, Giant Spider) drop 0 bones across all kills.
  - Elite/Epic/Boss retain independent tiered rolls; added `bone` as `rare_drop` (35%) to Orc Warrior and Void Knight. Abyssal Colossus and Glacial Sovereign drop 0 bones.
  - Ectoplasm preserved at approved baseline weight 1 on Skeleton and Undead (~0.46 drops/cleared Floor 1).
- **Bone Meal & Revive Potion Rebalance**:
  - Added `bone_meal` item to `data/items.json` (weight 0.1 kg, reagents category, icon 🥣).
  - Added Alchemy recipe: 1 Bone $\rightarrow$ 2 Bone Meal (requiredLevel: 0, 20 EXP).
  - Rebalanced Revive Potion recipe: 2 Bone Meal + 1 Wild Herb $\rightarrow$ 1 Revive Potion (requiredLevel: 0, 40 EXP).
  - Both recipes explicitly declare `requiredLevel: 0` and `resultCount`.
  - Scaled by player mood multiplier uniformly in `src/ui/HUD.ts`: $\text{Craft Yield} = \text{recipe.resultCount} \times (1 + \text{moodTier.alchemyYieldBonus})$. Standard mood yields 2 Bone Meal and 1 Revive Potion; Euphoric mood (+100%) yields 4 Bone Meal and 2 Revive Potions.
- **Carried-Only Consumable Consumption Rule**:
  - All consumable use draws **strictly from carried bags** (acting character's personal bag first, then party members' bags in order):
    - Revive Potion (`MainScene`, `OutpostScene`, `Player.consumeCarriedConsumable`): Stockpile fallback removed; channel consumes from carried bags.
    - Bandages (`Player.applyBandage`, `HUD.applyBandage`): Only consumed from carried bags.
    - Antidotes (`Player.applyAntidote`, `HUD.applyAntidote`): Only consumed from carried bags.
    - Energy & Mana Potions (`Player.drinkPotion`): Only consumed from carried bags.
    - Escape Stones (`MainScene.useEscapeStone`): Only consumed from carried bags.
    - Lockpicks (`LockpickingSystem`, `HUD.handleLockpickBox`): Consumed from carried bags when player entity is provided.
  - **The Single Food Exception (Owner Decision)**:
    - At the Outpost (`Player.isAtOutpost() === true`): Auto-eat and manual eating check actor's bag, then party members, and may fall back to the central stockpile (`consumeOldestFood`).
    - In the Dungeon (`Player.isAtOutpost() === false`): Food comes strictly from carried bags; zero stockpile fallback.
- **HUD Counters**:
  - `src/ui/HUD.ts` rows for Bandages, Energy Potions, Mana Potions, Revive Potions, and Escape Stones updated to display total party-carried counts ($\sum_{\text{member} \in \text{party}} \text{member.getItemCount(itemId)}$) instead of stockpile totals.
- **Verification Evidence**:
  - `test/milestone_revive_economy.test.ts`: 100% pass across all 6 test suites:
    1. Starting inventory (Hero 5/5/5/5, Valerie 5/5/5/5, Kaelen 0, Stockpile 0) and carry weight (8.5 kg / 45.0 kg, encumbered = false).
    2. Common enemy drop simulation (1000 kills each): 40% drop rate verified, 0 multi-drops, correct skeletal bone drops, 0 bones for Slime and Spider, bone rare_drops on Orc Warrior and Void Knight, 0 bones on Bosses.
    3. Crafting chain: 1 Bone $\rightarrow$ 2 Bone Meal $\rightarrow$ 1 Revive Potion, stockpile deduction, leader personal inventory deposit, EXP awards, and Euphoric mood yield scaling.
    4. Carried-only consumption: stockpile-only fails for Revive, Bandage, Antidote, Energy Potion; carried items succeed from actor or party bags.
    5. Food Outpost exception: hungry character with empty bag eats from stockpile at Outpost, strictly fails to eat from stockpile in Dungeon.
    6. Live dungeon revive: Downed ally revived to 50% HP using carried potion.
  - `test/craftingStationRecipeFilter.test.ts`: 100% pass (Test 7 updated to assert 7 Unlocked / 7 All at Lv 0 with Bone Meal and Revive Potion).
  - `test/craftingInventoryRouting.test.ts`: 100% pass (all 7 tests).
  - `test/milestone32.test.ts`: 100% pass (Butchering bones intact).
  - `test/research_points.test.ts`: 100% pass (Kill RP intact).
  - `scripts/alpha_checkpoint_harness_v2.mjs`: 100% pass across all 13 stages (browser headless crawl, combat, loot, crafting, returning).
  - `npm run build`: Production bundle (`tsc && vite build`) compiled cleanly in 3.24s with 0 errors.

**Resolved and shipped: Bugfix + Small Feature — Duplicate Crafted Gear & Equipment Stash Owned-Only Toggle.**
- **Duplicate Crafted Gear Bugfix**:
  - **Root Cause**: In `src/ui/HUD.ts`, crafting completion handlers across Blacksmithing, Armorsmithing, Bowyer, and Alchemy were calling both `activeLeader.addItem(...)` **and** `gameState.addItem(...)`, creating one copy in the leader's bag and an extra duplicate copy in the central stockpile. Cooking experimentation and recipe cooking also duplicated prepared dishes into `gameState.foodItems`.
  - **Fix**: Removed duplicate `gameState.addItem` / `gameState.addFoodItem` calls from all 5 crafting stations. All crafted outputs route strictly to the active leader's inventory (`leader.addItem`), with zero additions to the central stockpile.
  - **Single Copy Invariant for Gear**: Enforced strict condition: weapons, shields, armor, and accessories **always craft exactly 1 copy**, regardless of character mood level. The mood bonus multiplier (e.g. +100% on Euphoric mood) remains exclusive to stackable consumables (potions, bone meal, food dishes) and craftable reagents.
  - **Equip Lockout**: When 1 copy of gear is crafted and equipped by the leader, companion equip attempts are strictly rejected (`canEquip` / `handleSlotDrop` returns false).
- **Codebase Add-Item Audit (Single-Destination Routing)**:
  - Full codebase audit completed for all item deposit pathways:
    | Source / Pathway | Destination Store | Status |
    |---|---|---|
    | Blacksmithing (`forgeRecipe`) | Leader personal bag (`player.addItem`) | Fixed (stockpile duplicate removed; gear locked to 1x) |
    | Armorsmithing (`craftArmorRecipe`) | Leader personal bag (`player.addItem`) | Fixed (stockpile duplicate removed; gear locked to 1x) |
    | Bowyer (`craftBowRecipe`) | Leader personal bag (`player.addItem`) | Fixed (stockpile duplicate removed; gear locked to 1x) |
    | Alchemy (`craftRecipe`) | Leader personal bag (`player.addItem`) | Fixed (stockpile duplicate removed; mood multiplier applies) |
    | Cooking (`cookRecipe` & Experimentation) | Leader personal bag (`player.addFoodItem`) | Fixed (stockpile duplicate removed) |
    | Combat kill drops (`rollCommonEnemyDrop`, Elite, Boss) | Central stockpile (`gameState.addItem`) | Verified correct (1 destination) |
    | Dungeon gathering nodes (Foraging, Mining, Woodcutting) | Gatherer personal bag (`character.addItem`) | Verified correct (1 destination) |
    | Corpse harvesting (Skinning, Butchering) | Harvester personal bag (`player.addItem`) | Verified correct (1 destination) |
    | Lockbox rewards (`handleLockpickBox`) | Opener personal bag (`player.addItem`) | Verified correct (1 destination) |
    | Outpost Gardening & Seed Maker | Central stockpile (`gameState.addItem`) | Verified correct (1 destination) |
- **Equipment Stash "Owned Only" Toggle Feature**:
  - Added `#stash-toggle-filter-btn` in the Equipment Stash header inside `.party-equipment-inventory .inventory-filter-tabs` next to the category tabs (All, Weapons, Armor, Jewelry, Items).
  - Styled using the Outpost station toggle pattern (`.stockpile-toggle-btn.crafting-toggle-btn`).
  - **Default State**: ON (`stashFilterOwnedOnly = true`). Displays `✅ Showing: Owned Only` with teal border/background. Only items currently owned across personal bags or central stockpile are shown. Unowned catalog items and "Craft Required" badges are hidden.
  - **Catalog State**: OFF (`stashFilterOwnedOnly = false`). Displays `👁️ Showing: All Gear`. Displays the complete equipment catalog with "Craft Required" badges on unowned items and `draggable="false"`.
  - **Empty State**: When Owned Only is ON and no gear is owned, renders empty-state notice: `"No gear owned yet — craft some at the Outpost stations."`.
  - Category tabs filter correctly in both Owned Only and Full Catalog modes.
  - `openPartyOverviewModal()` now calls `renderPartyOverviewModal(true)` to guarantee a fresh rebuild and accurate stash count rendering upon opening.
- **Non-Destructive Save Audit Helper**:
  - Implemented `GameState.auditSavedDuplicateGear()` and window binding `(window as any).__auditSavedDuplicateGear()`.
  - Non-destructively inspects `localStorage` for `RPG_TRUE_GRIND_SAVE_V1` and reports:
    - Total duplicate gear copies and specific locations (member personal bags, equipped slots, and stockpile).
    - Stockpiled alchemy consumables (e.g. `bone_meal`, `revive_potion`).
  - Guarantees zero mutation or stripping of player save data.
- **Verification Evidence**:
  - `test/duplicate_gear_and_stash_toggle.test.ts`: Dedicated test suite verifying:
    1. Station × Mood yield table across all stations and mood tiers (Lowest/Depressed 0%, Normal 0%, Euphoric +100%) -> gear strictly 1x, consumables receive mood multiplier.
    2. Single-copy equip lockout strictly enforced across party members.
    3. Stash Owned-Only toggle filtering, category tab switching, and empty state notice.
    4. Non-destructive save audit helper execution without mutating save data.
  - `test/verify_stash_toggle_browser.mjs`: Puppeteer headless Chrome browser test verifying DOM elements, dynamic toggling, save audit helper, and capturing clean screenshots:
    - `stash_toggle_on.png`: Equipment Stash in default Owned Only mode with empty notice and active toggle button.
    - `stash_toggle_off.png`: Equipment Stash in All Gear mode showing catalog items with "Craft Required" badges.
  - `test/craftingInventoryRouting.test.ts`: 100% pass (all 7 tests passing).
  - `test/craftingStationRecipeFilter.test.ts`: 100% pass (all 9 tests passing).
  - `test/milestone35.test.ts`: 100% pass (all 10 tests passing).
  - `test/milestone_revive_economy.test.ts`: 100% pass (all 6 tests passing).
  - `npm run build`: Production bundle (`tsc && vite build`) compiled cleanly in 3.29s with 0 errors.

**Resolved and shipped: Milestone — Item Flow Unification (Bags During the Run, Auto-Deposit at Home) + Food in Bags.**
- **Core Item Flow Architecture**:
  1. **Dungeon Run Pickups (Carried Bags Only, Encumbrance Applies, Stockpile Delta = 0)**:
     - Gathering nodes (Foraging, Mining, Woodcutting): items add exclusively to gatherer's personal bag (`character.addItem`).
     - Corpse harvests (Skinning, Butchering): items add exclusively to harvester's personal bag (`character.addItem`).
     - Combat enemy drops (Common, Elite, Epic, Boss): kill drops route to killer's personal bag; if killer is downed or dead, drops route to Party Leader (`party[0]`).
     - Dungeon lockboxes: opened rewards route to opener's bag; if opener is downed or dead, rewards route to Party Leader (`party[0]`).
     - Stockpile delta during dungeon exploration is strictly 0.
  2. **Auto-Deposit on Arrival at Outpost**:
     - Arriving at the Outpost from the dungeon (Portal, Teleporter Crystal, Escape Stone, or Party Wipe recovery) moves all crafting materials and reagents from party members' bags into the central stockpile (`GameState.autoDepositPartyMaterials(this.party)`).
     - Consumables, food, gear, and tools (`lockpick`, `fishing_rod` flagged with `keepOnReturn: true`) stay in the personal bags.
     - Single summary toast notification displayed: e.g. `📦 Deposited to stockpile: 10 Wood, 5 Ore, 2 Wolf Pelt`.
     - Party snapshot saved immediately with updated personal bags.
  3. **Explicit Transition Flag (`{ fromDungeon: true }`)**:
     - Transitions from `MainScene` (`executeTransitionToOutpost()` and `finishWipe()`) pass `{ fromDungeon: true }` in `scene.start('OutpostScene', { fromDungeon: true })`.
     - `OutpostScene.init(data)` and `create(data)` capture `fromDungeon`. Fresh game starts, new games, and save loads pass no flag and deposit 0 items.
  4. **Food Holding Freshness & Quality in Personal Bags**:
     - Character personal bags store `foodItems: FoodItemInstance[]` (`id`, `name`, `acquiredDay`, `quality`).
     - Cooking dishes (recipes and experimentation) creates dish instances directly into the cook's bag with rolled quality.
     - Spoilage check (`GameState.checkFoodSpoilage(activeParty)`) checks both party personal bags and stockpile on day advance.
     - `Player.eatFood()` consumes the oldest instance first across actor bag -> party bags -> stockpile (Outpost only), preserving rolled `quality` and applying quality multipliers (hunger restored, buff duration, HP regen rate).
     - Save migration automatically detects legacy plain food counts in snapshots and converts them to `FoodItemInstance`s with `acquiredDay = currentGameDay` and `quality = 'common'`, logging each migration to the console.
  5. **Tools in Bags**:
     - `lockpick` and `fishing_rod` are configured with `keepOnReturn: true`.
     - Retained in personal bags across auto-deposits, enabling carried interactions without depletion or auto-stash.
  6. **Locked Box Dual-Context Opening**:
     - Opening lockbox in dungeon: all rewards route to opener personal bag.
     - Opening lockbox at Outpost: material rewards immediately deposit to central stockpile, non-materials stay in bag.
  7. **Duplicate Item IDs Audit (Reported Only, Zero Deletion/Merge)**:
     - `ore` vs `iron_ore`: `ore` is the live, active ID across all mining nodes, blacksmith recipes, and HUD stockpile. `iron_ore` is dead data.
     - `wild_herbs` vs `herbs`: `wild_herbs` is the live, active ID across nodes, alchemy/cooking recipes, and HUD. `herbs` is dead data.
  8. **Skill Books Flow**:
     - Research Tree currency is Research Points (RP), not physical skill books. Skill books are consumed directly by characters (`ResearchSystem.consumeSkillBook`), hence they correctly **KEEP** in personal bags.
- **Verification Evidence**:
  - `test/item_flow_unification.test.ts`: Dedicated test suite verifying:
    1. Conservation per source: gathering, corpse harvests, combat drops, and dungeon lockbox rewards route to personal bags with stockpile delta = 0.
    2. Round-trip auto-deposit on Outpost return with `{ fromDungeon: true }`; fresh boot/save load deposits 0.
    3. Wipe recovery sets `{ fromDungeon: true }` and triggers identical auto-deposit without item loss.
    4. Food quality, oldest-eaten consumption, quality multipliers (1.5x hunger, 25s buff, 3 HP/s), bag spoilage, and legacy save migration.
    5. Tools (`lockpick`, `fishing_rod`) retained in bag with functional interactions.
    6. Outpost locked box opens and deposits material rewards immediately to stockpile while non-materials stay in bag.
  - `scripts/alpha_checkpoint_harness_v2.mjs`: Ran end-to-end full cold-start loop with headless browser; completed all 13 stages successfully with Trip #1 dungeon return, auto-deposit to stockpile, blacksmith station crafting mace, equipping mace, and dungeon combat.
  - Regression Suites Passing:
    - `test/craftingInventoryRouting.test.ts` (100% pass)
    - `test/fishing_correction.test.ts` (100% pass)
    - `test/milestone38.test.ts` (100% pass)
    - `test/milestone_revive_economy.test.ts` (100% pass)
    - `test/milestone26.test.ts` (100% pass)
    - `test/milestone32.test.ts` (100% pass)
    - `test/tutorialOnboarding.test.ts` (100% pass)
  - `npm run build`: Production bundle (`tsc && vite build`) compiled cleanly with 0 errors.

**Resolved and shipped: Milestone — Small Polish & Audit Pass.**
- **1. Tutorial Step 6 (`return_outpost`) Rewording**:
  - Reworded Step 6 instruction and Valerie mentor quote to point the player directly to the Teleporter Crystal as the primary way home from the dungeon, noting Escape Stones only as a later craftable item.
  - Step ID (`return_outpost`), position (Step 6/10), and completion triggers were strictly preserved.
  - Verified completion trigger fires on crystal return: `MainScene.executeContinueDescent` / crystal modal calls `executeTransitionToOutpost()` which executes `TutorialSystem.getInstance().completeStepId('return_outpost')` (line 1828), and `OutpostScene.create()` also advances `return_outpost` upon scene arrival (lines 578-580).
- **2. Dead Item Data Removal (`iron_ore`, `herbs`)**:
  - Repo-wide search confirmed neither `iron_ore` nor `herbs` was referenced in any live drop tables, recipes, gathering nodes, HUD elements, or save persistence paths. (The live IDs are `ore` and `wild_herbs`).
  - Removed dead definitions from `data/items.json`.
  - Updated synthetic tests in `test/milestone51.test.ts`, `test/verify_milestone51_live.mjs`, and `test/wipeAndReviveAudit.test.ts` to utilize the live IDs (`ore`, `wild_herbs`).
- **3. Hunger and Mood System Audit (Report Only)**:
  - Documented precise drain rates, mood effects across combat and alchemy crafting yield, starvation penalties, and mood recovery mechanics with exact file and line references.
- **Verification Evidence**:
  - `tutorial_step6_return_outpost.png`: Browser screenshot verifying new Step 6 text rendered in the Guild Guide HUD widget.
  - `test/tutorialOnboarding.test.ts`: 100% pass (all 4 test blocks passing).
  - `test/item_flow_unification.test.ts`: 100% pass (all 6 tests passing).
  - `test/craftingInventoryRouting.test.ts`: 100% pass (all 7 tests passing).
  - `test/milestone51.test.ts`: 100% pass (all 9 tests passing).
  - `test/wipeAndReviveAudit.test.ts`: 100% pass (all 4 tests passing).
  - `npm run build`: Production bundle (`tsc && vite build`) compiled cleanly with 0 errors.

**Resolved and shipped: Milestone — Freeze Hunger & Mood at Neutral (Until Food Content Milestone).**
- **1. Data-Driven Feature Switches**:
  - Configured in `data/moodEffects.json`: `"hungerEnabled": false` and `"moodEnabled": false`.
  - Added schema support in `src/types/game.ts` (`MoodEffectsData`) and helper methods in `src/utils/DataLoader.ts` (`isHungerEnabled()`, `isMoodEnabled()`, `setHungerEnabled(bool)`, `setMoodEnabled(bool)`).
- **2. Fixed Neutral State & Combat/Crafting Normalization**:
  - While switches are disabled, character Hunger is held at 100 (never drains or triggers auto-eat) and Mood is held at 50 in the Content tier.
  - At Mood 50, combat damage multiplier is strictly ×1.0, combat accuracy bonus is +0, and alchemy yield bonus is 0. Party fights at neutral baseline without penalties.
- **3. Save State Preservation & Overrides**:
  - Existing saves load into neutral state (`hunger: 100`, `mood: 50`) while switches are off without deleting historical saved values (`savedHunger`, `savedMood`).
  - Snapshots taken while switches are off preserve original saved values. Turning switches back to `true` restores original values faithfully.
- **4. Food Consumption & Spoilage Continuity**:
  - `Player.eatFood()` continues to work normally: eating food consumes the item, refreshes the Well Fed HP regen buff (+2 HP/s), while keeping hunger at 100 and mood at 50.
  - Food shelf life and spoilage checks on game day advance remain fully active.
- **5. HUD Presentation**:
  - Top HUD bar displays `${hunger} / ${maxHunger} (paused)` and `${mood} / ${maxMood} (${moodTier.name}) (paused)` in neutral grey `#9ca3af`.
  - Party Overview roster displays `(paused)` suffix with `#9ca3af` text for both meters.
  - Alchemy crafting modal indicates `(paused)` status on the mood banner.
  - Re-enabling the switches automatically restores original tier colors and eliminates paused indicators.
- **Verification Evidence**:
  - `test/hungerMoodFreeze.test.ts`: Dedicated test suite verifying:
    1. Data switches in `data/moodEffects.json` default to `false`.
    2. Simulated 10 minutes in dungeon with switches OFF keeps Hunger at 100 and Mood at 50 with combat damage ×1.0 and accuracy +0.
    3. Simulated 10 minutes in dungeon with switches ON reproduces exact drain rates: hunger empties in 200s (3.3 min), mood drains to 0, combat damage ×0.85 (-15%) and accuracy -0.10 (-10%).
    4. Eating stew while frozen applies Well Fed buff and heals 10 HP over 5s while meters hold at 100 and 50.
    5. Food spoilage check remains active on day advance while meters are frozen.
    6. Existing saves load into neutral state without deleting saved values; switches ON restores original values.
    7. HUD displays `(paused)` and grey `#9ca3af` style when frozen, normal colors when active.
  - Regressions:
    - `test/milestone_revive_economy.test.ts`: 100% pass (all 6 tests passing).
    - `test/item_flow_unification.test.ts`: 100% pass (all 6 tests passing).
    - `test/engageCombatHold.test.ts`: 100% pass (all 4 tests passing).
    - `test/darkKnightPassiveImbuement.test.ts`: 100% pass (all 8 tests passing).
  - Production Build: `npm run build` compiled cleanly with 0 TypeScript/vite errors.

**Resolved and shipped: Milestone — Regen Refinement (Out of Combat = 2× In Combat) + Critical-HP-First Healing Audit.**
- **1. Universal Out-of-Combat Multiplier (2× everywhere)**:
  - Base and passive regen sources recover at exactly 2× out of combat compared to in combat (`out = in × 2.0`), driven by `DataLoader.getOutOfCombatRegenMultiplier()` (configured as `outOfCombatRegenMultiplier: 2.0` in `data/player.json`).
  - No hardcoded out-of-combat values; all passive sources store their baseline in-combat amount and derive out-of-combat.
- **2. In-Combat Baseline Numbers (Data-Driven)**:
  - **Base Energy Regen**: Set to `0.5` EN/s in `data/player.json` (derived out-of-combat: `1.0` EN/s). This deliberately slows passive resting (0 -> 100 Energy takes ~100s instead of ~20s), pushing players toward crafting Energy potions and proper run preparation.
  - **Base HP Regen**: Added `0.25` HP/s in `data/player.json` (derived out-of-combat: `0.5` HP/s). Handled through a fractional accumulator (`hpFractionalAccumulator`) so fractional rates cleanly deliver whole-point heals (60s in combat yields exactly 15 HP).
  - **Hidden Skills (`health_regen`, `energy_regen`, `mana_regen`)**:
    - Stored in `data/hiddenSkills.json` as in-combat amounts: Lv 1-29 gives 0.5 HP / 2 EN / 2 EN per proc. Lv 30+: 1 / 5 / 5; Lv 60+: 2 / 8 / 8; Lv 90+: 3 / 12 / 12.
    - Derived out-of-combat amounts tick at exactly 2× (Lv 1 gives 1.0 HP / 4 EN / 4 EN).
    - Removed `inCombat` tier gating flags; all tiers proc in and out of combat.
  - **Potion Interaction**: Active `energy_regen` / `mana_regen` potion buffs grant the matching hidden skill ticks at the out-of-combat rate (2×) even while engaged in combat, plus +50% bonus EXP.
  - **Well Fed Buff**: Stored in-combat rate in `data/food.json` (`hpRegenPerSec` halved to 1.0 for Ration/Herb Stew, 0.5 for Veggie Stew, 1.5 for Beast Stew); scales with `currentRegenMultiplier` to provide the original full recovery out-of-combat (2.0 HP/s).
- **3. Critical-HP-First Healing Sink & Audit**:
  - `Entity.heal()` (and `Player.heal()`) verified as the single healing sink across all paths (potions, bandages, food Well Fed buff, passive base HP regen, hidden skills, life leech, paladin heals, etc.).
  - Always fills Critical HP first before overflowing to Main HP.
  - Downed characters do not passively regenerate HP or Energy.
- **4. Verification & Caster Dry Test**:
  - Verified caster dry test with 0 potions: Fire Mage runs dry after 4 casts (5.2s), matching the target 4-5 casts constraint.
  - Full test suite `test/regenRefinement.test.ts` (100% pass) and audit suite `test/hpRegenFillOrderAudit.test.ts` (100% pass across 13 tests).
  - Production Build: `npm run build` compiled cleanly with 0 TypeScript/vite errors.

**Resolved and shipped: Milestone — Test-Suite Hygiene + Ore Pacing Check.**
- **1. Test-Suite Hygiene (Fix Tests Only, Zero Game Code Changes)**:
  - Fixed stale assertions in `test/milestone15.test.ts` (Healing Magic cost read dynamically from `skills.json` instead of pre-M19 15), `test/milestone11.test.ts` (First Aid cost read dynamically from `skills.json` instead of pre-M19 20), and `test/item_flow_unification.test.ts` (Well Fed HP rate asserts stored in-combat rate 1.5 HP/s and derived out-of-combat rate 3.0 HP/s).
  - Swept through test suites with stale hardcoded values from earlier milestones and updated them to data-driven checks or correct modern values (`milestone14.test.ts`, `milestone17.test.ts`, `milestone18.test.ts`, `milestone20.test.ts`, `milestone23.test.ts`, `milestone25.test.ts`, `milestone27.test.ts`, `milestone29.test.ts`, `milestone31.test.ts`, `milestone34.test.ts`, `milestone36.test.ts`, `milestone37.test.ts`, `milestone42.test.ts`, `milestone45.test.ts`, `milestone52.test.ts`, `classLevel100Audit.test.ts`, `downedTransitionTwoBar.test.ts`, `lockedContentAndExpAudit.test.ts`, `milestone_persistent_saves.test.ts`, `partyOverviewLiveDropdown.test.ts`, `research_points.test.ts`, `reviveIconLifecycleVerification.test.ts`, `universalHiddenSkills.test.ts`, `unlockQueueAndDebugPanel.test.ts`).
  - Added test runner infrastructure:
    - `"test": "node scripts/run_all_tests.mjs"` in `package.json`: sequentially runs all 96 unit test files with per-file PASS/FAIL execution times and non-zero exit on failure.
    - `"test:e2e": "node scripts/run_e2e_tests.mjs"` in `package.json`: separates browser Puppeteer E2E tests (`test/dungeonAutocast.test.ts`, `test/e2e_blacksmith_crafting.test.ts`, `test/e2e_pacing_audit.test.ts`, `test/combatRetaliationLoop.test.ts`).
  - Result: **96 / 96 suites PASS (100% green, 0 failures, ~140s total runtime)**.
- **2. Ore Pacing Check (Report Only, Zero Tuning Changes)**:
  - **Zero-Minute Trips Root Cause**: Harness bug in `scripts/test_3_seeds_pacing.mjs`. In Outpost, calling `m.rest()` reset character HP/Energy in memory but never updated the persistent party snapshot via `GameState.savePartySnapshot(op.party, op.time.now)`. Furthermore, re-entering the dungeon bypassed the snapshot gate, leaving party snapshots marked as downed from previous wipes. Upon dungeon loading, `MainScene` reconstructed downed entities and broke immediately at room 0 (`party.every(m => m.state === 'dead' || m.state === 'downed')`). Additionally, `elapsedSec` was read from `scene.time.now` after `executeTransitionToOutpost()` stopped the scene clock, recording `0.00m`. Fixed in harness; re-runs completely eliminated zero-minute trips across all seeds.
  - **Comparative Pacing (`c8b87eb^` vs `c8b87eb`)**:
    - Seed 1: `c8b87eb^` crafted mace in 3 trips (5.17 min); `c8b87eb` crafted mace in 4 trips (5.38 min) due to tighter in-combat sustain causing an early retreat on Trip 2 (0.58 min vs 1.72 min).
    - Seed 2: `c8b87eb^` crafted mace in 2 trips (2.29 min); `c8b87eb` crafted mace in 3 trips (3.92 min).
    - Seed 3: `c8b87eb` crafted mace in 2 trips (2.88 min).
  - **Ore Supply Per Floor (20 Seeds Generated)**:
    - Rock veins count: exactly 100 veins across 20 seeds = **5.00 rock veins / floor average**.
    - Ore yield per vein: **100% drop chance**, exactly **1 Ore per vein** (`data/gatheringNodes.json:38-53` and `src/scenes/MainScene.ts:3122-3149`).
    - Average ore per fully cleared floor: **5.00 Ore**.
    - Pre-digging fix (`73db085^`): identical 5.00 veins/floor; digging nodes are additive and separate.
  - **Harness & Outpost Behavior**:
    - Party ends trips at full HP/Energy due to out-of-combat regeneration (3.5 HP/s, 1.0 EN/s) and Valerie's out-of-combat heals during the ~15-20s walk to the return crystal. Outpost resting further tops off stats. Harness clears all rooms sequentially before crystal return.
  - **First Weapon Crafting Costs**:
    - Mace: 4 Ore, 2 Wood (requires Blacksmithing Lv 0, `data/blacksmithRecipes.json:3-14`).
    - Comparison: Daggers (2 Ore, 1 Wood), Short Sword (3 Ore, 1 Wood), Throwing Weapons (3 Ore, 1 Wood), Longsword 1H (4 Ore, 2 Wood), Iron Shield (4 Ore, 2 Wood), Spear (4 Ore, 3 Wood), Katana (5 Ore, 2 Wood), Crossbow (5 Ore, 3 Wood), Longsword 2H (7 Ore, 3 Wood), Greatsword (8 Ore, 3 Wood), Hunting Bow (0 Ore, 4 Wood, 2 Silk).

**Resolved and shipped: Milestone — Crafting Mastery, Apprentice Rank.**
- **1. Crafting Mastery Decoupling & Classes**:
  - Implemented 4 Apprentice classes from `class_system.md`: `apprentice_smith`, `apprentice_armorer`, `apprentice_bowyer`, and `apprentice_alchemist` in `data/classes.json`. (Cooking deferred per owner decision; Construction deferred per note).
  - Categorized with `category: "crafting"` and governed by a centralized `isCraftingClass(id)` helper.
  - Decoupled from combat: Crafting classes are passive, unlock automatically at proficiency 10, never replace or occupy `activeClass`, never appear in the Loadout shelf combat class swapper, and never receive combat kill EXP.
  - Save migration: Any character with a crafting class in `activeClass` has it automatically migrated back to `null` with a logged notice.
- **2. Shared Crafting Architecture**:
  - Pure crafting logic extracted from UI into `CraftingSystem.applyCraft(crafter, recipe, professionId)`.
  - Class EXP awarded per craft equals the recipe's profession EXP (`expGranted`) and progresses on standard curve (`50 + level * 4`).
  - Stackables Perk: +1% bonus yield chance per Apprentice class level (capped at 15%), proccing +1 extra item. Applied after existing mood multiplier.
  - Gear Perk: +1% primary stats per class level (capped at 15%). Weapon: `baseDamage`; Shield: `baseBlock`; Armor/Jewelry: `hpBonus`.
  - Duplicate gear rule strictly enforced: Gear always crafts exactly 1 copy (bonus yield never applies to gear).
- **3. Persistent Gear Instances (`GearItemInstance`)**:
  - Only gear crafted with `bonusPercent > 0` generates an instance ID (`gear_<baseItemId>_<timestamp>_<rand>`). Non-bonus crafts produce the standard base ID, preventing save bloat.
  - Stored centrally in `GameState.gearInstances` and saved with the game save file.
  - Routed through `getBaseItemId(id)` and `resolveGearStats(id)`.
  - Fully compatible with equip/unequip, weapon proficiency checks, drag-and-drop paperdoll, stockpile inventory, Equipment Stash Owned-Only toggle, and non-destructive `auditSavedDuplicateGear`.
- **4. UI & Tooltips**:
  - Station headers display crafter's rank and current perk bonus (e.g. `🔨 Apprentice Smith Lv 8: +8% gear stats`).
  - Tooltips and paperdoll display crafted badge and provenance (e.g. `Crafted by Aria, +8%`).
  - Party Overview displays crafting class & level alongside combat class (e.g. `⚔️ [Combat] · 🔨 [Crafting]`).
- **5. Design Decisions & Documentation Recorded**:
  - Recipe-Tier Decision: Existing recipes (levels 0–10) are the starter band and remain intact (Mace at level 0). All future recipe tiers will use 30 / 60 / 90.
  - Git Log Citation: `apprentice_armorer` originated in commit `ac2687d` (Milestone 28); `apprentice_bowyer` originated in commit `9ab2690` (Milestone 36-37).
  - Deferred Features: Section 9 of `docs/deferred_features.md` updated—`Apprentice Alchemist` is implemented, and `Alchemical Bomber` is deferred waiting on `Journeyman Alchemist`.
  - Cheapest EXP-per-Material Table:
    - Blacksmithing: `lockpick` (1 Ore -> 10 EXP = 10.0 EXP/mat)
    - Armorsmithing: `leather_cap` (2 Wolf Pelts -> 25 EXP = 12.5 EXP/mat)
    - Bowyer: `hunting_bow` (4 Wood, 1 Bowstring -> 25 EXP = 5.0 EXP/mat)
    - Alchemy: `antidote` (1 Wild Herbs -> 25 EXP = 25.0 EXP/mat)
- **6. Verification**:
  - `test/crafting_mastery_apprentice.test.ts` (7/7 tests pass):
    - Recipe levels adhere to starter band (0-10) with Alchemy at 0.
    - Decoupled classes unlock at proficiency 10 without displacing combat class.
    - Class EXP awarded per craft equals profession EXP.
    - Monte Carlo simulation (1,000 runs) confirms ~5% yield at Lv 5 and ~15% yield at Lv 20 (capped).
    - Crafted Mace at Apprentice Lv 8 scales baseDamage (+8%: 7 -> 7.56); 0% for non-apprentice.
    - GearItemInstance survives save/load round-trip with full fidelity.
    - Systems integration verifies stash count, auto-deposit, duplicate audit, and activeClass migration.
  - Regression suites all pass cleanly (`duplicate_gear_and_stash_toggle.test.ts`, `milestone_persistent_saves.test.ts`, `craftingInventoryRouting.test.ts`, `craftingStationRecipeFilter.test.ts`).

---

### Milestone: Gear Salvage (Completed)

- **1. Pre-Check (Item 0)**:
  - Cataloged all 25 craftable weapons, shields, armor, and accessories across Blacksmithing (14), Armorsmithing (7), and Bowyer (4).
  - Identified uncraftable gear: magic spell conduits/pseudo-weapons, element staves (`fire_staff` from starting kit), and `fist`.
  - Audited gear locations at Outpost: party bags (`player.inventory`), shared stockpile (`gameState.inventory`), and equipped slots (`player.equippedWeapon`, `offhandWeapon`, etc.).
  - Stop condition check: Gear without recipes does not comprise the majority of gear; `getBaseItemId` resolves cleanly. Proceeded to build without stop.
- **2. Core Mechanics & Architecture**:
  - `salvageRefundRate: 0.5` and `salvageExpRate: 0.5` placed in a single data location: `data/blacksmithRecipes.json`, read centrally via `DataLoader`.
  - Added `CraftingSystem.applySalvage(member, itemIdOrInstanceId, options)` to shared system layer, keeping HUD logic strictly presentational.
  - Type-only import pattern maintained for `Player` in `CraftingSystem.ts` to ensure headless test suites never load Phaser or DOM globals unexpectedly.
  - **Recipe Matching by Output Item ID**: `CraftingSystem.getRecipeForGear(id)` strictly matches `resultWeaponId || resultArmorId || resultItemId === baseId`, preventing false-positive mismatches between recipe ID and output item ID (e.g. `short_sword` -> `short_swords`, `iron_shield` -> `shields`, `greatsword` -> `greatswords`, `hunting_bow` -> `bows`, `quarterstaff` -> `staff`).
  - **Probabilistic Rounding Refund**: 50% refund on each ingredient per salvaged unit using `floor(val) + (random() < fraction ? 1 : 0)`, ensuring exact 50% average across runs. Refunds route straight to stockpile. Mood multiplier and Apprentice bonus yield do not apply.
  - **EXP Award**: 50% of recipe's profession EXP rounded up (e.g. Greatsword 35 -> 18, Silk Robe 75 -> 38, War Bow 80 -> 40). If salvager holds the matching Apprentice class, an equal amount of Class EXP is granted.
  - **What Cannot Be Salvaged**: Equipped gear (must unequip first), consumables (`bandage`), materials (`ore`), tools with `keepOnReturn: true` (`lockpick`, `fishing_rod`), and gear with no recipe (`fire_staff`, magic conduits, unarmed).
  - **Bonus Gear Lifecycle**: Salvaging a `GearItemInstance` cleanly unregisters it from `GameState.gearInstances`, removing it from live state, persistent saves, and duplicate gear audits.
- **3. Station UI Integration**:
  - Integrated `#blacksmithing-salvage-container`, `#armorsmithing-salvage-container`, and `#bowyer-salvage-container` into the three gear crafting stations.
  - Lists unequipped salvageable items from both party bags and the stockpile with expected refund (e.g. "≈ 4 Ore, 1.5 Wood, 1 Steel Scrap") and EXP granted.
  - "Salvage ×N" supported for plain multi-count items. Confirmation prompt (`window.confirm`) requested when salvaging bonus gear (noted for future UI modal polish).
  - Action toast displayed: `"Salvaged [Item] → +[Refunds], +[EXP] [Profession] EXP"`.
- **4. Grind Table: Effect of Craft-and-Salvage Loops (Item 3 Report)**:
  *Assumptions: ~4.5 Ore/floor, ~8.2 Wood/floor, ~2.3 Wolf Pelts/floor. Lv 0 -> 5 requires 290 EXP; Lv 0 -> 10 requires 680 EXP.*
  - **Blacksmithing (`daggers` - 2 Ore, 1 Wood -> 15 EXP | Salvage: +1 Ore, +0.5 Wood, +8 EXP | Net: 1 Ore, 0.5 Wood for 23 EXP)**:
    - *Without salvage*: Lv 5 = 8.59 floors; Lv 10 = 20.15 floors (7.5 EXP/ore).
    - *With salvage*: Lv 5 = **2.80 floors** (12.6 net ore); Lv 10 = **6.57 floors** (29.6 net ore) [**67.4% reduction**].
    - *(With `mace`)*: Lv 5 = **3.39 floors** (15.3 net ore); Lv 10 = **7.95 floors** (35.8 net ore) [**67.1% reduction**].
  - **Armorsmithing (`leather_cap` - 2 Wolf Pelts -> 25 EXP | Salvage: +1 Wolf Pelt, +13 EXP | Net: 1 Wolf Pelt for 38 EXP)**:
    - *Without salvage*: Lv 5 = 10.09 floors; Lv 10 = 23.65 floors (12.5 EXP/pelt).
    - *With salvage*: Lv 5 = **3.32 floors** (7.6 net pelts); Lv 10 = **7.78 floors** (17.9 net pelts) [**67.1% reduction**].
  - **Bowyer (`quarterstaff` - 5 Wood -> 20 EXP | Salvage: +2.5 Wood, +10 EXP | Net: 2.5 Wood for 30 EXP)**:
    - *Without salvage*: Lv 5 = 8.84 floors; Lv 10 = 20.73 floors (4.0 EXP/wood).
    - *With salvage*: Lv 5 = **2.95 floors** (24.2 net wood); Lv 10 = **6.91 floors** (56.7 net wood) [**66.7% reduction**].
- **5. Verification**:
  - `test/salvage.test.ts`:
    - Group 1: Verified real salvage per station (Blacksmithing: `greatswords` -> 4 Ore, 1 Steel Scrap, 1.5 Wood, 18 EXP; Armorsmithing: `silk_robe` -> 1 Wolf Pelt, 2.5 Spider Silk, 38 EXP; Bowyer: `war_bow` -> 4 Wood, 1 Wolf Claw, 2 Spider Silk, 40 EXP). 1,000-run Monte Carlo simulations confirm exact 50% integer and probabilistic ingredient refunds within ±0.5% error.
    - Group 2: Equipped gear, materials (`ore`), consumables (`bandage`), tools (`lockpick`, `fishing_rod`), and uncraftable gear (`fire_staff`) properly rejected.
    - Group 3: Accurate bag/stockpile decrements, bonus gear instance unregistration, storage persistence cleanup, and duplicate audit invariant verified.
  - Regression suites passed: `test/craftingInventoryRouting.test.ts`, `test/duplicate_gear_and_stash_toggle.test.ts`, `test/milestone_persistent_saves.test.ts`.
  - Full suite: `npm test -- --quiet` passes **98/98 test suites (0 failures)**.
  - Build passed: `npm run build` succeeds with zero errors.



