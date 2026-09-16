# Revised Class Unlock System

## Proficiency Tiers Refer to LEVEL, Not Raw EXP (correction — see Section 0 below)

| Level | Tier | Purpose |
|---|---|---|
| 10 | Novice | Single stat, first hour of play |
| 30 | Adept | Light combos, early-mid game |
| 60 | Expert | Real combos, requires prior class leveling |
| 90 | Master | Heavy combos, exotic builds |
| 100 | (used only where a stat is meant to be truly maxed) | Prestige-only |

**Every "value" in every requirement object throughout this document (`{ "type": "proficiency", "target": "X", "value": 10 }`) means "Level 10 in X," not "10 raw experience points."** This distinction matters because it was implemented incorrectly in early milestones — see Section 0.

## 0. The Level/EXP System (foundational — corrects an implementation gap found during Milestone 5)

**This is the core mechanic of the entire game**, and it was built wrong in Milestone 1 and almost built wrong again in Milestone 5's Construction skill. Every weapon, magic school, crafting profession, and passive skill in this document shares one underlying system:

- **Level, not a raw counter.** Every trainable stat has a **Level** (0–100, starting at 0/"Unranked") and a separate **current EXP** value tracking progress toward the *next* level. These are two different numbers. A skill at Level 6 with 40/70 EXP toward Level 7 is not "46" — the tier-gate checks (Novice/Adept/Expert/Master, and every `classLevel`/`proficiency` requirement anywhere in this doc) compare against **Level**, never against raw accumulated EXP.
- **EXP required per level increases, but never by doubling — strictly additive, constant-increment growth.** Going from Level 1→2 costs less EXP than Level 50→51, which costs less than Level 99→100 — but the growth is a flat, constant increment added per level (never multiplicative, never exponential). **Locked-in formula (final, after two rounds of tuning to hit a ~350-hit total to Fencer):** `expForNextLevel(currentLevel) = 50 + currentLevel × 4`. At the standard +2 EXP/hit for a weapon, that's 25, 27, 29, 31, 33, 35, 37, 39, 41, 43 hits for levels 1 through 10 — cumulative **340 hits** to reach Level 10 (a typical Novice-tier class unlock, e.g. Fencer). If this needs further adjustment once played against, tune only the `× 4` increment constant — the shape (flat additive growth) is the part that's load-bearing, not this exact number.
- **Every level grants a tangible bonus, not just tier-gate access.** Reaching Level 1 in a weapon isn't just "now I can use higher-tier content" — it should immediately make the character measurably better with that weapon (more accuracy, more attack speed, more damage, or a mix, depending on weapon type), and every subsequent level continues adding to that. This was completely missing from the Milestone 1 implementation — Short Swords proficiency gave zero stat benefit at any level, which contradicts this project's own founding pillar ("for each level up in a skill that character's stats get stronger").
- **Every weapon levels completely independently, always starting at 0.** Picking up a weapon you've never used — even mid-game, even if every other weapon type is heavily leveled — starts that weapon at Level 0/Unranked with zero bonuses, and it climbs the same curve as everything else. A combo class's two component weapons (e.g. Short Swords and Shields for Vanguard) level entirely separately from each other; there's no shared or blended progress between them.
- **This same system underlies weapons, magic schools, crafting professions (including Construction), and the hidden defensive/regen skills** — it's one leveling engine used everywhere, not something reinvented per-skill. Construction's cost/refund tier table (Section 9.4 of `true_grind_gdd.md`) should be read against **Construction's Level**, exactly like every other tier-gated stat in this document — not against a raw incrementing counter.
- **Corrected during Milestone 14 review: Class EXP is a separate, distinct currency from weapon/profession EXP — not derived or piped from it.** This uses the *same curve math* (`50 + level × 4`) as everything else, but a genuinely different source and a genuinely different gate:
  - **Active Class only.** A character has exactly one **Active Class** equipped at a time — the same pattern as the Skill Loadout (Section 12.1): known-vs-equipped, swappable **only at the Outpost**, never mid-dungeon. This isn't a new UI paradigm — it's the same precedent the Skill Loadout already established, just applied one level up.
  - **Class EXP is earned specifically by defeating an enemy while that class is active** — not from landing hits, not from weapon proficiency gains, not automatically piped from any other stat. A kill grants a flat amount of Class EXP (**starting point: 25 per kill**, explicitly tunable, scaled by enemy tier once Elite/Epic/Boss tiers exist) to whichever class the character currently has active. Switch Active Class at the Outpost, and only *that* class earns EXP from kills going forward — the previously-active class's level is preserved, just not currently progressing.
  - **This is what unlocks a class's skill kit at the correct level thresholds** (e.g. Vanguard's Shield Bash at Class Level 1, Guard Up at 10, Taunt at 20, Retaliate at 30, Unbreakable at 40) — Class Level, not weapon proficiency level, gates skill unlocks within a class.
  - **Weapon and profession EXP remain entirely separate and always-on, regardless of Active Class.** Swinging a sword always grants Short Swords EXP no matter which class is active or even if no class-unlock-relevant class is active at all — that passive layer never changes. Class EXP is the one exception requiring deliberate commitment.

- **Corrected during Milestone 9 review: every trainable stat is hidden until Level 1, with zero exceptions — not just the seven hidden defensive/regen skills.** Weapons, crafting professions, everything — a stat has **zero presence in the normal HUD or Party Overview at Level 0**, exactly matching the reveal-at-Level-1 mechanic already built for Evasion/Parry/Block/etc. There is no "Level 0 (12/50 EXP) [Unranked]" display anywhere for anyone. The instant a stat crosses into Level 1, it reveals itself with the same "Skill Discovered" treatment already used for hidden skills, and remains visible from then on. The only place pre-Level-1 progress remains visible at all is the dev-only debug all-skills overview panel, which exists specifically to see behind this curtain for testing.
- **Corrected during Milestone 14 review: the hidden-until-earned rule applies to classes and skills too, not just continuous trainable stats.** The same principle extends directly to classes (binary unlock rather than continuous progress) and to skills gated behind an unlocked class. **A class or skill the character hasn't unlocked yet must not appear in the UI at all** — no visible "LOCKED" card with its name and flavor text, no greyed-out entry, nothing. This was a gap in how Milestone 14's Active Class shelf and Known Skills Grimoire were built (both listed every class/skill including locked ones) — the fix isn't graying out locked options, it's not rendering them until they're actually unlocked. Once unlocked, a class appears exactly the same way a trainable stat reveals at Level 1 — no earlier "coming soon" preview.

**Per-level stat bonus starting points by weapon category (tunable, but pick a lane per category so the system is consistent):**

| Category | Suggested Per-Level Bonus |
|---|---|
| Melee (Katana, Short Swords, Daggers, Mace, Spears, Longswords, Greatswords) | Small mix of +accuracy and +damage per level |
| Ranged (Bows, Crossbows, Throwing Weapons) | +accuracy and +attack speed per level |
| Magic schools (Fire/Water/Ice/Earth/Nature/Lightning/Wind/Holy/Dark/Arcane/Healing) | +magic damage and reduced Energy cost per level |
| Shields | +block/mitigation per level (distinct from, and stacks with, the hidden Block skill) |

### Accuracy is a long-arc stat, uncapped, meant to be finished by gear — not by weapon level alone

**Resolved after review:** weapon accuracy starts meaningfully below 100% (`baseAccuracy: 0.60` as the reference starting point) and climbs gradually across the **full 100-level range**, not just the first class-unlock tier — `accuracyPerLevel: 0.004` lands exactly at 100% at Level 100, not Level 10. This is a deliberate split of labor: **damage is the stat that makes leveling feel good early** (steep, front-loaded growth), while **accuracy is a long-term stat gear and enchantments are meant to finish** — a maxed weapon alone shouldn't already be at 100%, or equipment accuracy bonuses become pointless dead stats on end-game characters.

**Critical implementation detail: total accuracy must NOT be clamped to 100% anywhere in combat resolution.** Weapon level, gear, and future enchantments all stack additively into one accuracy total, and that total can and should be able to exceed 100% — the overflow above 100% is what lets a character reliably land hits against high-Evasion enemies once the hidden Evasion skill (Milestone 5.5) exists on enemies. The likely final-hit-chance formula once Evasion exists on both sides: `finalHitChance = attackerAccuracy - defenderEvasion`, clamped only at the *bottom* (can't go below some minimum floor, e.g. 5%, so nothing is ever a guaranteed miss) — never clamped at the top before that subtraction happens. Evasion isn't implemented on any enemy yet (Wolf doesn't have one), so this interaction is a forward-looking note, not something to build right now — but the uncapped-accuracy requirement needs to go in today, since retrofitting a clamp back out later is exactly the kind of thing that's easy to forget once it's baked into `Math.min(1.0, ...)` somewhere in the combat code.

## Requirement Schema (data-driven, not code)

Every class is defined as a list of requirement objects, ANDed together (unless a class explicitly says "any N of"). Two requirement types:

```json
{
  "class": "Paladin",
  "requirements": [
    { "type": "classLevel", "target": "Vanguard", "value": 10 },
    { "type": "proficiency", "target": "Holy Magic", "value": 30 }
  ]
}
```

- `proficiency` — raw weapon/magic stat, always available regardless of class history.
- `classLevel` — must have leveled a specific *prerequisite* class to the given value (not just unlocked it). This is what creates the dependency tree.

Two more requirement types show up later for specific mechanics that don't fit a stat or a class level: `triggerCount` (a lifetime count of a random proc event — used by Luck/Lady Fortune) and `activityCount` (a lifetime count of a deliberate player action — used by Chef's recipe discoveries and Survivalist's camps). Same principle either way: it's a counter on the character, checked like any other requirement.

Adding a new weapon type later just means adding new Tier 0/1 entries with this same schema — no engine changes needed.

**Design rule used below:** Tier 0 is proficiency-only (nothing to level yet). From Tier 1 onward, classes increasingly lean on `classLevel` requirements from the tier below, so grinding stats alone can't skip the tree — you have to actually play the earlier class.

---

## Tier 0 — Novice (unlockable within the first hour)

Proficiency 10, single stat, no class-level requirement.

| Class | Requirement | Fantasy |
|---|---|---|
| Swordsman | Katana 10 | First swing of the blade |
| Fencer | Short Swords 10 | Quick, light-footed duelist |
| Guardian | Shields 10 | Learning to hold the line |
| Squire | Longswords 10 | Trainee in traditional swordplay |
| Brute | Greatswords 10 | Swinging something too heavy, badly |
| Cutthroat | Daggers 10 | Back-alley opportunist |
| Marksman | Bows 10 | First nocked arrow |
| Loader | Crossbows 10 | Mechanically minded shooter |
| Bludgeoner | Mace 10 | Blunt force enthusiast *(naming collision caught during a documentation audit: the approved Milestone 21 Blacksmithing plan invented a different name, "Enforcer," for this exact same unlock condition — Milestone 21 needs correcting to use Bludgeoner, the name already established here, before it executes)* |
| Spearman | Spears 10 | Basic reach fighter |
| Skirmisher | Throwing Weapons 10 | Hit-and-run thrower |
| Arcane Initiate | Arcane 10 | First spark of raw magic |
| Ember Adept | Fire Magic 10 | Can light a candle. Sometimes a person. |
| Tide Adept | Water Magic 10 | Basic control of water/ice |
| Sprout Keeper | Nature Magic 10 | Talks to plants; plants don't answer yet |
| Spark Adept | Lightning Magic 10 | Static shocks with intent |
| Gale Adept | Wind Magic 10 | Can ruin someone's hair from a distance |
| Medic | Healing Magic 10 | Knows one spell and it's a good one |
| Acolyte | Holy Magic 10 | Recently devout |
| Cultist | Dark Magic 10 | Recently indoctrinated |
| Grove Walker | Druid Staff 10 | Wandering nature novice |
| Staff Adept | Staff 10 | Generic quarterstaff training — the physical melee weapon shared by any staff-wielding school (Healing Magic now, a future Monk-style class later), distinct from Druid Staff's own separate line |
| Frost Initiate | Ice Magic 10 | First brush with true cold (distinct from Water Magic's fluid control) |
| Stoneheart Initiate | Earth Magic 10 | Can crack a rock. On purpose, mostly. |
| Excavator | Digging 10 | Learning where the ground hides things |
| Locksmith | Lockpicking 10 | Patient hands and an ear for the tumblers |
| Brawler | Fist 10 | Weaponless, and getting better at it — see the note below on this line's intended tone |

**Fist and Brawler, captured during downtime planning — deliberately not a normal weapon line, note this before anyone tunes it like one.** Fist is a new weapon type (unarmed combat), with Brawler as its Tier 0 class. This is explicitly intended as a fun easter egg with an escalating "One Punch Man" power fantasy — a fully-invested Brawler build should eventually feel cartoonishly, deliberately overpowered at the far end of its progression, not balanced against every other weapon line the normal way. The exact higher-tier Brawler kit and just how absurd the scaling gets are open for later design, but the *intent* needs to survive into whoever eventually builds it: this is meant to be silly-powerful on purpose, not a bug to fix.

---

## Tier 1 — Adept (early-mid game)

Proficiency 30, light combos. Some carry a soft `classLevel` gate from a Tier 0 class so you've spent a little time in the basic role first — pick a value (Lv 5 shown here) proportional to how fast your leveling curve moves.

| Class | Requirements | Fantasy |
|---|---|---|
| Ronin | Katana 30 + Swordsman Lv 5 | Wandering blade for hire |
| Samurai | Katana 30 + Shields 10 + Swordsman Lv 5 | Armored katana warrior in training |
| Duelist | Short Swords 30 + Daggers 10 | Fast, evasive close-range fighter |
| Ranger | Bows 30 + Daggers 10 | Mobile wilderness scout |
| Vanguard | Short Swords 30 + Shields 30 + Fencer Lv 5 + Guardian Lv 5 | Defensive frontline fighter |
| Reaver | Greatswords 30 + Brute Lv 5 | Heavy-hitting brawler |
| Shadow Initiate | Daggers 30 + Dark Magic 10 | Apprentice assassin |
| Lancer | Spears 30 + Shields 10 | Defensive spear fighter |
| Sharpshooter | Crossbows 30 + Bows 10 | Precision trainee |
| Battle Medic | Mace 30 + Healing Magic 10 | Frontline healer-in-training |
| Spellsword | Longswords 30 + Arcane 10 | Warrior-mage hybrid trainee |
| Flamecaller | Fire Magic 30 | Apprentice pyromancer |
| Frostcaller | Water Magic 30 | Apprentice aquamancer |
| Stormtouched | Lightning Magic 30 | Apprentice storm mage |
| Windwalker | Wind Magic 30 | Apprentice air mage |
| Naturalist | Nature Magic 30 | Apprentice nature mage |
| Priest | Holy Magic 30 | Devout novice |
| Warlock | Dark Magic 30 | Apprentice of forbidden power |
| Herbalist | Druid Staff 30 + Nature Magic 10 | Nature's apprentice |
| Thrower | Throwing Weapons 30 + Daggers 10 | Quick-handed skirmisher |
| Scout | Daggers 10 + Bows 15 | Deliberately the lowest-threshold hybrid in the game — meant to be the first real class most players unlock, and the one NPC mentors start with |

---

## Tier 2 — Expert (requires actual class leveling)

Proficiency 30–60 combos, plus a meaningful `classLevel` requirement (Lv 15–20 shown) from a specific Tier 1 class. This is where the tree stops being "grind stats" and starts being "play the role."

| Class | Requirements | Fantasy |
|---|---|---|
| Blademaster | Katana 60 + Longswords 30 + Ronin Lv 15 | Master of multiple sword styles |
| Assassin | Daggers 60 + Dark Magic 30 + Shadow Initiate Lv 15 | Stealth and lethal precision |
| Shadowblade | Daggers 30 + Dark Magic 30 + Shadow Initiate Lv 15 | Assassin empowered by darkness (magic-leaning) |
| Arcane Archer | Bows 30 + Arcane 30 + Ranger Lv 15 | Magic-infused archer |
| Storm Archer | Bows 30 + Lightning Magic 30 + Ranger Lv 15 | Lightning-infused ranged fighter |
| Witch Hunter | Crossbows 30 + Holy Magic 30 + Sharpshooter Lv 15 | Monster and magic hunter |
| Knight | Short Swords 60 + Shields 60 + Vanguard Lv 20 | Traditional armored warrior |
| Paladin | Shields 30 + Holy Magic 30 + Vanguard Lv 15 | Holy warrior |
| Dark Knight | Longswords 30 + Dark Magic 30 + Vanguard Lv 15 | Warrior empowered by darkness |
| Juggernaut | Greatswords 60 + Shields 30 + Reaver Lv 15 | Nearly unstoppable tank |
| Battlemage | Longswords 30 + Fire Magic 30 + Arcane 10 + Spellsword Lv 15 | Aggressive magic warrior |
| Storm Lancer | Spears 30 + Lightning Magic 30 + Lancer Lv 15 | Lightning-infused spear warrior |
| Elementalist | Fire Magic 30 + Water Magic 30 + Wind Magic 30 | Master of elemental forces |
| Druid | Druid Staff 30 + Nature Magic 60 + Herbalist Lv 15 | Master of nature |
| Aquamancer | Water Magic 60 + Frostcaller Lv 15 | Master of tides, currents, and fluid control |
| Cryomancer | Ice Magic 60 + Frost Initiate Lv 15 | Master of true cold — distinct from Aquamancer's fluid focus |
| Geomancer | Earth Magic 60 + Stoneheart Initiate Lv 15 | Master of stone and terrain |
| Explorer | Digging 60 + Perception 30 + Excavator Lv 20 | Finds what everyone else walks past |
| Cleric | Holy Magic 30 + Healing Magic 30 + Priest Lv 15 | Dedicated holy healer |
| Restoration Mage | Healing Magic 60 + Medic Lv 15 | Pure support specialist — full 5-skill kit in `true_grind_gdd.md` Section 12.2, deliberately contrasted with Combat Medic's hybrid offense/support identity |

---

## Tier 3 — Master / Exotic (real commitment)

Proficiency 60–90, plus `classLevel` Lv 20–25 from a Tier 2 class. These should feel like genuinely desirable, hard-earned builds.

| Class | Requirements | Fantasy |
|---|---|---|
| Sword Saint | Katana 90 + Longswords 60 + Blademaster Lv 25 | Legendary master of swordsmanship |
| Death Knight | Greatswords 90 + Dark Magic 60 + Juggernaut Lv 25 + Dark Knight Lv 20 | Terrifying heavy warrior infused with death magic |
| Celestial Knight | Longswords 90 + Holy Magic 60 + Healing Magic 30 + Knight Lv 25 + Paladin Lv 20 | Legendary holy swordsman |
| Shadow Monk | Short Swords 60 + Daggers 60 + Dark Magic 30 + Assassin Lv 20 | Extremely mobile melee assassin |
| Demon Hunter | Short Swords 60 + Crossbows 60 + Holy Magic 30 + Witch Hunter Lv 20 | Specialist in hunting supernatural creatures |
| Arcane Knight | Longswords 90 + Arcane 90 + Battlemage Lv 25 | Channels raw magical energy through weapons |
| Elemental Knight | Longswords 30 + Fire/Water/Lightning Magic 30 each + Battlemage Lv 20 + Elementalist Lv 20 | Imbues weapon with different elements |
| Tempest | Bows 30 + Lightning Magic 30 + Wind Magic 60 + Storm Archer Lv 20 | Ranged warrior who fights alongside storms |
| Necromancer | Druid Staff 10 + Dark Magic 90 + Warlock Lv 25 | Death magic specialist |
| Nature's Avatar | Druid Staff 60 + Nature Magic 90 + Healing Magic 30 + Druid Lv 25 | Near-mythical champion of nature |

---

## Tier 4 — Prestige / Mastery (endgame)

High or maxed proficiency, plus `classLevel` Lv 30 from a Tier 3 class. These should be rare and visible — the equivalent of a max-level badge.

| Class | Requirements | Fantasy |
|---|---|---|
| Swordmaster | Katana 100 + Short Swords 60 + Longswords 60 + Sword Saint Lv 30 | Peerless blade master |
| Weaponmaster | Any 5 physical weapon types at 60+ + any two Tier 2+ melee classes Lv 20 | Refuses to specialize, and doesn't need to |
| Archmage | Arcane 100 + any 3 elemental schools at 30+ + Arcane Knight Lv 25 or Elementalist Lv 25 | Master of pure magical theory |
| Grand Paladin | Short Swords 100 + Shields 100 + Holy Magic 90 + Healing Magic 60 + Celestial Knight Lv 30 | Pinnacle holy warrior |
| Dark Lord | Greatswords 100 + Dark Magic 100 + Death Knight Lv 30 | Apex of destructive darkness |
| Archdruid | Druid Staff 100 + Nature Magic 100 + Healing Magic 30 + Nature's Avatar Lv 30 | Mythical guardian of nature |
| Elemental Sovereign | Fire/Water/Lightning/Wind Magic 100 each + Elemental Knight Lv 25 or Tempest Lv 25 | Commands all elements at once |
| Deathbringer | Dark Magic 100 + Greatswords 100 + Daggers 60 + Necromancer Lv 30 or Death Knight Lv 30 | Harbinger of death itself |

---

# Gathering, Crafting & Passive Skills

Two gaps had to be filled to make the crafting side actually work: nothing produced raw **ore** or **wood** for smithing/carpentry to consume, and nothing crafted **ranged weapons** once Woodworking was scoped to decorations/furniture only. Added: **Mining**, **Woodcutting**, and a dedicated **Bowyer** profession. **Fishing** is included as an optional extra gathering skill.

## Gathering Skills

| Skill | Produces | Feeds Into |
|---|---|---|
| Mining | Ore, stone, gems | Blacksmithing, Armorsmithing (heavy), Jewelcrafting |
| Woodcutting | Logs, timber | Woodworking, Bowyer |
| Skinning | Hides, pelts | Armorsmithing (light/medium), Bowyer (bowstrings) |
| Butchering | Meat, organs, bone | Cooking, Alchemy |
| Foraging | Wild herbs, mushrooms | Alchemy, Cooking |
| Gardening | Cultivated crops (steadier supply than Foraging) | Cooking, Alchemy |
| Animal Husbandry | Wool, milk, eggs, livestock | Cooking, Tailoring, mounts |
| Fishing | Fish, aquatic reagents | Cooking, Alchemy |
| Digging | Buried treasure, rare ore veins, relics | Explorer class, Jewelcrafting, quest items |

## Crafting Professions — Recipe Tiers

Each profession uses the same 10/30/60/90 scale as combat proficiency, so a Tier N recipe requires Tier N proficiency in the profession — consistent with everything else in this system.

| Profession | Tier 0 (10) | Tier 1 (30) | Tier 2 (60) | Tier 3 (90) | Gathered From |
|---|---|---|---|---|---|
| Blacksmithing | Basic Katana/Daggers/Mace | Longswords, Spears | Greatswords, reinforced blades | Legendary-tier weapon frames | Mining |
| Armorsmithing | Light armor | Medium armor | Heavy armor | Masterwork plate (all weights) | Mining + Skinning |
| Bowyer | Basic Bows | Crossbows, Throwing Weapons | Reinforced/composite bows | Legendary ranged weapons | Woodcutting + Skinning |
| Woodworking | Simple furniture | Decorations, basic housing sets | Fine furniture, statues | Masterwork housing centerpieces | Woodcutting |
| Alchemy | Minor potions | Standard potions, basic transmutes | Strong potions, advanced transmutes | Elixirs, grand transmutation | Foraging + Gardening + Butchering |
| Enchanting | Minor stat imbues | Elemental imbues | Set-bonus imbues | Legendary enchant slots | A magic-school proficiency + finished item |
| Tailoring / Jewelcrafting | Cloth basics, simple rings | Robes, gemset rings | Enchant-ready caster gear, amulets | Legendary accessories | Animal Husbandry (cloth) + Mining (gems) |
| Cooking | — recipes are *discovered*, not tier-unlocked. Proficiency raises discovery odds and dish quality ceiling instead. See the Chef section below. | | | | Butchering + Foraging + Gardening + Animal Husbandry + Fishing + monster drops |
| Stonemason | Basic stone shaping, Bricks (refined from Stone) | Reinforced stone fittings | Fine stonework, statuary | Masterwork stone architecture | Mining |

## Crafting Mastery Classes

Same `classLevel` pattern as combat: each rank requires proficiency **and** having leveled the previous rank.

| Profession | Apprentice (10) | Journeyman (30, req. Apprentice Lv 10) | Master (60, req. Journeyman Lv 15) | Grandmaster (90, req. Master Lv 25) |
|---|---|---|---|---|
| Blacksmithing | Apprentice Smith | Journeyman Smith | Master Smith | Grandmaster Smith |
| Armorsmithing | Apprentice Armorer | Journeyman Armorer | Master Armorer | Grandmaster Armorer |
| Bowyer | Apprentice Bowyer | Journeyman Bowyer | Master Bowyer | Grandmaster Bowyer |
| Woodworking | Apprentice Carpenter | Journeyman Carpenter | Master Carpenter | Grandmaster Carpenter |
| Alchemy | Apprentice Alchemist | Journeyman Alchemist | Master Alchemist | Archalchemist |
| Enchanting | Apprentice Enchanter | Journeyman Enchanter | Master Enchanter | Runeweaver |
| Tailoring / Jewelcrafting | Apprentice Artisan | Journeyman Artisan | Master Artisan | Grandmaster Artisan |
| Cooking | Apprentice Cook | Line Cook | Chef | Executive Chef |
| Stonemason | Apprentice Stonemason | Journeyman Stonemason | Master Stonemason | Grandmaster Stonemason |
| Construction | Apprentice Builder | Journeyman Builder | Master Builder | Grandmaster Builder |

**Note on Construction:** unlike every other profession in this table, Construction doesn't unlock recipe tiers — it applies a flat, universal **build-cost reduction and demolish-refund increase** across all buildable categories as it levels (full table in `true_grind_gdd.md` Section 9.4). It's trained by placing and demolishing structures directly, not by using a crafting station.

That's **28 crafting classes**.

## Crafting × Combat Hybrids

A few classes that reward players who invest in both a craft and a combat/magic line — good "why would I ever level a profession" hooks.

| Class | Requirements | Fantasy |
|---|---|---|
| Battlesmith | Blacksmithing 30 + any weapon proficiency 60 + Journeyman Smith Lv 15 | Fights with weapons of their own making |
| Runeblade | Enchanting 30 + Arcane 60 + Journeyman Enchanter Lv 15 | Carves living magic into blades |
| Alchemical Bomber | Alchemy 30 + Throwing Weapons 60 + Journeyman Alchemist Lv 15 | Turns volatile potions into weapons |
| Beastmaster | Animal Husbandry 60 + Taming 60 + Bows 30 | Fights alongside a tamed companion |
| Herbwarden | Gardening 60 + Foraging 60 + Nature Magic 30 | Cultivator whose garden magic bites back |

That's **5 hybrid classes**.

## Passive Skills

| Skill | Effect | Pairs With |
|---|---|---|
| Accuracy | Increases hit chance | ↔ Evasion |
| Evasion | Increases dodge chance | ↔ Accuracy |
| Perception | Finds hidden treasure, traps, secrets | ↔ Stealth |
| Stealth | Reduces detection radius/chance | ↔ Perception |
| Life Steal | Heals a % of damage dealt | ↔ Critical Strike |
| Critical Strike | Increases critical hit chance/damage | ↔ Life Steal |
| Lockpicking | Opens containers/doors without keys | Perception |
| Taming | Allows capturing and bonding wild creatures | Animal Husbandry |
| Haggling / Appraisal | Better prices, reveals true item value/rarity | Luck |
| **Luck** | Unique mechanic — see below | Everything (loot, crit, gathering yield) |

### Luck — how it actually works

Every character starts with a very low base Luck (near 0%). On qualifying actions — loot rolls, crit checks, gather yields, anything with a random outcome — the game rolls against the character's **current** Luck value as the chance to "proc." On a successful proc, Luck increases by a small flat amount (**+0.1**). This is the loop you described: Luck is both the trigger chance and the thing that grows from triggering, so it climbs slowly and entirely through play, never by direct investment.

To make "trigger it 5 times" and "reach 10 Luck" land at roughly the same moment rather than one gate being trivial and the other absurd, split the proc into two tiers:

- **Normal proc** — the +0.1 Luck gain described above. Reaching 10.0 Luck from ~0 takes roughly **100 successful procs**.
- **Fortune Trigger** — a rarer flag on the *successful* proc roll (recommend ~1-in-20, i.e. 5% of normal procs). This is the big, visible "Fortune smiles on you" moment — extra loot roll, on-screen flourish — and is counted separately as the character's lifetime Fortune Trigger count.

At a 1-in-20 rate, by the time a character has accumulated ~100 normal procs (i.e. reached ~10 Luck), they'll have had ~5 Fortune Triggers on average — so your two conditions naturally converge instead of one being reached hundreds of procs before the other. That's the requirement type this needs, added to the schema:

```json
{
  "class": "Lady Fortune (skill tree)",
  "requirements": [
    { "type": "proficiency", "target": "Luck", "value": 10 },
    { "type": "triggerCount", "target": "Fortune Trigger", "value": 5 }
  ]
}
```

`triggerCount` is a new requirement type: a lifetime counter on the character, separate from any stat value, incremented by a specific tagged event.

### Lady Fortune Skill Tree (unlocked via the above)

| Node | Effect |
|---|---|
| Fortune's Favor | Increases normal Luck proc chance slightly |
| Golden Touch | Increases loot rarity/quantity from defeated mobs |
| Jackpot | Fortune Triggers have a chance to duplicate a rare drop |
| Fortune's Shield | Fortune Triggers can also negate an incoming critical hit |
| Lady Fortune's Blessing *(capstone)* | Fortune Triggers grant a brief buff to nearby allies, not just the character who rolled it |

### Passive-Skill Hybrid Classes

| Class | Requirements | Fantasy |
|---|---|---|
| Trickster | Daggers 30 + Luck 10 | Relies on blades and pure chance |
| Bounty Hunter | Crossbows 30 + Perception 30 | Tracks marks others can't find |
| Vampire | Dark Magic 30 + Life Steal 60 | Sustains through stolen life force |
| Treasure Hunter | Perception 60 + Luck 10 + Lockpicking 30 | Nothing stays hidden or locked for long |

That's **4 more classes**.

---

# Hidden Defensive & Regen Skills

This reuses the exact mechanic Luck already established — a hidden stat starting near 0%, a low per-action chance to proc based on its current value, +0.1 per successful proc — and applies it to **Evasion, Resilience, Parry, Block, Counterattack, Health Regen, Mana Regen,** and **Energy Regen**. Two additions specific to this set:

1. **Weapon/tool eligibility.** Unlike Luck (which can proc on anything), these only proc while the character has the right gear equipped — you can't grind Parry with a bow out, and you can't grind Block without a shield.
2. **Class head-starts.** Certain classes grant a hidden bonus toward a specific skill's proc chance from the moment you unlock the class — representing innate aptitude — even though the skill itself stays invisible to the player until it hits Level 1.

## The Eight Skills

| Skill | Procs When | Requires Equipped | Effect Once Unlocked (Lv 1 / 30 / 60 / 90) |
|---|---|---|---|
| Evasion | Attacked by any weapon | Nothing | Small chance to fully avoid a hit → higher chance → chance scales further → high-end evasion becomes a real defensive layer against accurate attackers |
| Resilience | Character takes a hit | Nothing (armor-agnostic) | 2% dmg reduction → 5% → 8% + brief mitigation chance → 12% + rare full negation |
| Parry | Attacked in melee | A parry-capable weapon (Katana, Short Swords, Longswords, Greatswords, Spears, Daggers) | Unlocks manual parry window → opens counter window reliably → partial dmg reflect → perfect parry stuns attacker |
| Block | Attacked while a shield is up | Shield | Chip dmg reduction → reduced stamina cost → negates crits → reflects a % of blocked dmg |
| Counterattack | Successfully dodge/parry/block an attack | Any melee weapon | Small chance to auto-counter → higher chance/dmg → counters can crit → counters chain to a second hit |
| Health Regen | Passive tick (out of combat) | Nothing | Passive regen out of combat → light regen in combat → regen rate increases → burst heal chance at low HP |
| **Energy Regen** *(new — resolved during Milestone 15 review)* | Passive tick (out of combat) | **Nothing — universally available** | Baseline Energy regen is deliberately trivial/near-zero at Level 0, exactly like the other regen skills before they reveal. This is the resource-sustain path available to **every** character regardless of build — a purely physical class (Vanguard, Fencer) with no magic proficiency has no path to Mana Regen (see below), but can still train this. |
| Mana Regen | Passive tick, mana pool present | Any magic-school proficiency | Passive regen out of combat → light regen in combat → regen rate increases → burst mana chance at low mana. **Stacks with Energy Regen, doesn't replace it** — a spellcaster training both sustains fastest of any build. |

**Why both exist:** Energy Regen and Mana Regen both restore the same Energy resource, but Mana Regen was originally gated behind having a magic-school proficiency at all — which meant physical classes had *no* hidden regen-training path whatsoever. Energy Regen closes that gap by being universally trainable, while Mana Regen remains the stronger, spellcaster-specific bonus layered on top for anyone who also has it.

**Resolved design principle, built in Milestone 19 (corrected during a later documentation audit — this was previously marked "not built yet," which is now stale):** Energy and Mana Potions (Alchemy-crafted) exist and, while their temporary regen-boost buff is active, **also grant bonus EXP toward whichever regen skill they're boosting** — not just a flat numeric buff with no progression consequence. This follows directly from the game's core "learn by doing" pillar: a potion making you regen faster is, in effect, making you *do more regen*, so it should teach you faster too.


## Unlock Flow (matches Luck's model exactly)

```json
{
  "skill": "Parry",
  "hiddenGrowth": {
    "eligibleWhen": { "equippedAny": ["Katana", "Short Swords", "Longswords", "Greatswords", "Spears", "Daggers"] },
    "procChance": "currentValue + classBonus",
    "gainPerProc": 0.1,
    "unlockThreshold": 10
  }
}
```

Below the Lv 1 threshold (value ≥ 10) the skill is completely hidden from the UI — the player just occasionally "gets lucky" defensively with no visible explanation, exactly like early Luck. At Lv 1 it reveals itself, names itself, and becomes a normal trainable stat that keeps climbing through the same 10/30/60/90 tiers as everything else.

## Class Head-Starts

A class can grant a flat hidden bonus added to a skill's proc chance from the moment it's unlocked — this doesn't unlock the skill outright, it just means that class reaches Lv 1 in far fewer procs than a character with no aptitude.

```json
{ "class": "Guardian", "hiddenBonus": { "skill": "Block", "value": 2.0 } }
```

| Class Family | Hidden Bonus Skill |
|---|---|
| Guardian, Vanguard, Knight, Paladin | Block |
| Squire, Ronin, Blademaster, Sword Saint | Parry |
| Brute, Reaver, Juggernaut, Berserker-line | Resilience |
| Duelist, Assassin, Shadowblade, Fencer | Counterattack |
| Any Tier 0 magic-school class (Ember Adept, Tide Adept, etc.) | Mana Regen |
| Medic, Battle Medic, Cleric, Priest | Health Regen |

This gives every class a bit of hidden personality even before a player notices — a Guardian who blocks "by accident" more often than a mage would, without either of them knowing why yet.

## New Hybrid Classes from Defensive Skills

| Class | Requirements | Fantasy |
|---|---|---|
| Bulwark | Shields 60 + Block 30 + Resilience 30 | Immovable wall of a person |
| Riposte Master | Parry 30 + Counterattack 30 + any bladed weapon 60 | Punishes every mistake an enemy makes |
| Vitality Warden | Health Regen 30 + Mana Regen 30 + Healing Magic 30 | Sustains a whole fight through sheer recovery |

That's **3 more classes**.

---

# Chef & Survivalist — Activity-Discovery Classes

Both of these break from the tier-unlock pattern on purpose: Chef learns by **experimenting**, and Survivalist learns by **doing a specific thing repeatedly out in the world**, not by grinding a stat in a menu. That's exactly why the `activityCount` requirement type exists — it counts a deliberate player action rather than a stat or a random proc.

## Chef

**Recipe discovery, not recipe unlocking.** Every other profession unlocks its recipe list automatically at a proficiency tier. Cooking doesn't — a player combines ingredients at a cooking station (or campfire, tying in nicely with Survivalist below) and has a chance to discover a new dish, based on:

- Whether that specific ingredient combination has been tried before (first attempt has the discovery chance; repeats just cook the already-known dish).
- Cooking proficiency (raises both the discovery chance and the maximum quality tier reachable).
- Ingredient rarity — **monster drops** (a Wolf Fang, a Slime Core, a Wyrmling Scale) behave as high-value "wildcard" ingredients that unlock dishes plain foraged/gardened ingredients can't reach on their own. This is what makes hunting feed into cooking instead of the two systems living in isolation.

Once discovered, a recipe is permanently known and can be cooked normally like any other profession's recipe.

### Dish Quality

Every cook has a chance, per dish, to produce one of four quality tiers — this is what "boosts how much it heals" actually means mechanically:

| Quality | Relative Heal/Buff Potency |
|---|---|
| Common | 1.0× (baseline) |
| Good | 1.25× |
| Excellent | 1.5× |
| Perfect | 2.0× + short bonus buff |

Base chance of each tier is weighted by Cooking proficiency; Chef-line skills (below) shift those odds further and independently of raw proficiency.

### Chef Skills

| Skill | Type | Effect |
|---|---|---|
| Forager's Palate | Passive | Increases chance of rare monster ingredient drops from kills |
| Butcher's Eye | Passive | Increases quantity of Cooking-usable drops from Butchering |
| Bulk Cooking | Active | Chance to produce extra portions from a single set of ingredients |
| Gourmet Touch | Active | Shifts dish-quality odds toward Excellent/Perfect |
| Iron Stomach *(party buff)* | Passive | Nearby allies who eat the Chef's dishes get a longer buff duration |

### Chef Class Tiers

| Class | Requirements | Fantasy |
|---|---|---|
| Apprentice Cook | Cooking 10 | Burns things occasionally, means well |
| Line Cook | Cooking 30 + Apprentice Cook Lv 10 + 5 recipes discovered | Competent, reliable, growing a real repertoire |
| Chef | Cooking 60 + Line Cook Lv 15 + 20 recipes discovered (incl. 1+ using a monster ingredient) | Cooks dishes that actually matter in a fight |
| Executive Chef | Cooking 90 + Chef Lv 25 + 50 recipes discovered (incl. 5+ using monster ingredients) | Their dishes are the reason the guild survives dungeon runs |

That's **4 new crafting classes** (folded into the crafting mastery total).

---

## Survivalist

**Unlocked entirely through action, not a stat.** A player sets up a camp while inside a dungeon run (consuming Woodcutting/Foraging materials, taking a moment of vulnerability to do it) — the camp grants the party a temporary safe zone: faster Health/Mana Regen ticks, a respawn point, and a short buff on breaking camp to continue. Doing this enough times is the unlock condition:

```json
{
  "class": "Survivalist",
  "requirements": [
    { "type": "activityCount", "target": "Dungeon Camp Setup", "value": 5 }
  ]
}
```

No proficiency or class-level gate on the base unlock — this is deliberately the one class line anyone can stumble into just by playing cautiously and setting up camp instead of pushing through exhausted.

### Survivalist Skills

| Skill | Type | Effect |
|---|---|---|
| Quick Camp | Active | Reduces camp setup time and resource cost |
| Well-Rested | Passive | Camp buffs last longer and grant a small bonus to XP gain |
| Trailblazer's Sense | Passive | Increases Perception while camping and briefly after breaking camp |
| Emergency Shelter | Active (Tier 3+) | Allows setting up a rough camp even mid-combat, at high resource cost, as a last resort |

### Survivalist Class Tiers

| Class | Requirements | Fantasy |
|---|---|---|
| Survivalist | 5 Dungeon Camps Setup | Knows how to not die between fights |
| Trailblazer | 15 Camps + Foraging 30 + Woodcutting 30 + Survivalist Lv 10 | The one the party trusts to find the safe spot |
| Wilderness Warden | 30 Camps + Foraging 60 + Woodcutting 60 + Trailblazer Lv 20 | Turns any dungeon corridor into a fortified rest stop |
| Grand Survivalist | 50 Camps + Nature Magic 60 + Perception 60 + Wilderness Warden Lv 30 | Legendary guide — parties seek them out before the hardest runs |

That's **4 more classes**.

---

## Notes / open decisions for you to tune

1. **Max class level & curve.** Everything above assumes classes have their own level (separate from weapon proficiency). Decide the level cap and how fast it scales — the Lv 5/15/20/25/30 gates above are placeholders proportional to a rough 1–30 or 1–50 curve. Adjust to match your actual leveling pace.
2. **AND vs OR between classLevel prerequisites.** A few Tier 3/4 classes list two prerequisite classes (e.g. Celestial Knight needs both Knight AND Paladin). Decide per-class whether that's a strict AND or whether "either" is acceptable — AND makes the class rarer and more meaningful, OR makes it more accessible from two different playstyles.
3. **Should proficiency ever decay or reset on respec?** Not addressed here — worth deciding before players start hybrid-building, since it affects whether Weaponmaster-style "any 5 at 60+" classes are grindy or trivially achievable by a completionist.
4. **Throwing Weapons is now covered** (Skirmisher → Thrower), but it doesn't yet have an Expert/Master-tier class of its own — worth adding one if it's meant to be a first-class combat style rather than a support stat.
5. **Luck's proc formula needs a curve, not a flat %.** Using the current Luck value as a straight percentage chance means Luck approaching 100 would proc almost constantly — you'll likely want a soft cap or diminishing-returns curve (e.g. effective chance = Luck × 0.5, or a log curve past 20) so late-game Luck doesn't spiral.
6. **Fortune Trigger rate (1-in-20) is a starting guess**, tuned specifically so "10 Luck" and "5 triggers" land together — if you change how fast Luck grows per proc, recalculate this ratio so the two Lady Fortune conditions stay roughly simultaneous rather than one gating the other.
7. **Enchanting and Tailoring/Jewelcrafting are marked optional** — only add them if you have an accessory slot and want casters to have a non-hide light-armor path; otherwise Armorsmithing's Light tier already covers cloth-adjacent gear.
8. **Combat log noise for hidden procs.** A Resilience/Parry/Counterattack proc happening invisibly pre-unlock still needs *some* in-game effect (reduced damage, a dodge, an extra hit) even though the player doesn't see a skill name yet — decide whether that shows as generic combat text ("You brace against the blow") or nothing at all, since total silence makes the eventual Lv 1 reveal less satisfying.
9. **Stacking class head-starts.** Decide whether a class can only ever grant one hidden bonus (as tabled above) or whether multiclassing/respec history should stack bonuses from every class a character has ever unlocked — the latter rewards long-term characters but makes early Lv-1 unlocks less distinctive per current class.
10. **Recipe discovery needs a search-space design, not just randomness.** With monster drops as wildcard ingredients, decide whether discovery is truly random per combo (simple, but can feel like slot-machine cooking) or hinted (e.g., an ingredient's flavor tag suggests what it pairs well with) — hinted discovery rewards experimentation more than luck and fits the "chef" fantasy better long-term.
11. **What counts as a valid "Dungeon Camp Setup."** Decide whether camps only count toward Survivalist's activityCount inside actual instanced dungeons, or also in open-world dangerous zones — this changes how fast casual players reach the unlock versus dungeon-focused ones.
12. **Fixed a real conflict:** Longswords are tagged 2H in the weapon list, but Vanguard, Knight, and Grand Paladin originally paired Longswords with a Shield, which needs a free off-hand. Swapped those three to Short Swords + Shield instead, keeping Longsword as a dedicated no-shield 2H line (Squire → Dark Knight → Sword Saint → Celestial Knight). Worth double-checking no other combo class makes the same mistake as new ones get added.
13. **Water/Ice/Earth are now three separate schools**, not one — Aquamancer (Water Magic) governs fluid/current control, Cryomancer (Ice Magic) governs true cold, and Geomancer (Earth Magic) governs stone/terrain. Elementalist-line classes (Elementalist, Elemental Knight, Elemental Sovereign) currently only reference the original four schools (Fire/Water/Lightning/Wind) — decide whether Ice and Earth get folded into those recipes too or stay as their own separate specialist path.

Total: 74 combat classes + 40 crafting mastery classes (incl. the 4-tier Chef line, the 4-tier Stonemason line, and the new 4-tier Construction line) + 5 crafting/combat hybrids + 4 passive-skill hybrids + 3 defensive-skill hybrids + 4 Survivalist tiers + 8 new classes (Scout, Frost Initiate, Stoneheart Initiate, Excavator, Aquamancer, Cryomancer, Geomancer, Explorer) = **138 classes**, plus 9 gathering skills, 10 crafting professions (added Stonemason and Construction), 10 passive skills, **8 hidden defensive/regen skills** (Evasion, Resilience, Parry, Block, Counterattack, Health Regen, Mana Regen, Energy Regen — count corrected during a documentation audit; Evasion and Energy Regen were added after this total was first written), and 2 activity/experimentation-based systems layered on the same core requirement schema.

**Cross-reference:** Dual Wielding (unlockable via any 2 one-handed melee weapons at proficiency 30, per-character, with a scaling accuracy penalty as it levels) and the Skill Book cross-class-learning mechanic are both specified in `true_grind_gdd.md` Sections 4.3 and 12.0 rather than duplicated here.
