# True Grind — The Guild RPG
### Master Design Document (Living Doc)

**Companion doc:** `class_system.md` — the full weapon/class/skill unlock tree (130 classes, proficiency tiers, hidden skills, crafting professions). This document covers everything else: controls, combat, survival systems, base-building, and dungeon structure. Treat both as one spec — this doc references the other constantly instead of repeating it.

**How to use this doc:** sections marked **TODO** are open threads the design isn't settled on yet. Everything else is a working spec you can build against, but nothing here is too sacred to argue with — flag anything that doesn't work once it's in engine.

**Reference game:** *Dungeon Settlers* (CanOpener, Steam Early Access, Sep 4 2026) — a 2D pixel-art dark fantasy colony sim / dungeon crawler where a settlement (bedrooms, dining areas, production rooms, fields, a research tree) supports expeditions sent into a randomized, permadeath dungeon. True Grind adopts its overall structure and presentation. Two deliberate departures, decided and locked:

| System | Dungeon Settlers | True Grind |
|---|---|---|
| Character death | Permanent — losing a settler underground is final | **Revivable Downed state** (2-bar HP + Combat Medic, Section 3) — this stays our system |
| Character progression | Standard leveling/gear | **Learn-by-doing weapon/class/skill trees** (see `class_system.md`) — this is our core differentiator |

Everything else in this doc — art style, camera, party structure, settlement systems, food/mood — targets parity with Dungeon Settlers unless noted otherwise.

---

## 1. Core Pillars

1. **Everything is learned by doing.** No stat allocation screens, no talent points spent in a menu. You get better at a weapon by hitting things with it; you get a class by playing in a way that qualifies for it.
2. **Two loops, one loop feeds the other.** Dungeon runs (through a portal) generate the materials, recipes, and recruits that let you build the guild outpost; the guild outpost (rest, food, gear, research) makes the next dungeon run survivable.
3. **The game plays itself once you've told it what to do.** Click a spot, your character walks there. Click an enemy, your character fights it the smart way for their weapon. Skills fire themselves. The player's job is positioning and priorities, not button-mashing a rotation.
4. **The guild is alive.** Recruits have moods, get hungry, get hurt, and need somewhere decent to sleep — the base isn't just a crafting bench with a skin on it.

---

## 2. Controls & Camera

**Art style: 2D pixel art, top-down** (matching Dungeon Settlers) — this replaces the earlier 3D free-camera assumption everywhere below.

- **Click-to-move:** click a ground location, the active party pathfinds there together (see Party Structure below — this is now settled, not a TODO).
- **Click an enemy:** the party moves to engage automatically.
  - **Melee weapons** close to contact range.
  - **Ranged weapons (Bows, Crossbows, Throwing Weapons, most Magic)** path to the *minimum* effective range for their current skill/weapon and hold there, kiting backward if the enemy closes the gap, rather than walking into melee.
- **Camera:** top-down, WASD or edge-pan to move the view; mouse wheel to zoom. No free rotation (2D doesn't need it). Can be **locked on** to a specific playable character, following them directly as they move.
- **Party structure (resolved):** expeditions are a **fixed 4-person party**, matching Dungeon Settlers. Click-to-move/click-to-engage commands the whole active party as a group; individual characters can still be selected on their own for fine positioning, but the default click target is the party.
- **Party portrait selection (resolved design, not yet built — captured during downtime planning):** the HUD shows **4 portraits**, one per party member. Clicking a single portrait switches control to commanding that one character individually — the next click-to-move/click-to-engage applies only to them, not the whole party. **Shift-clicking additional portraits adds them to the current selection**, letting the player command any subset (2, 3, or all 4) rather than only "one" or "everyone." **A dedicated hotkey reselects the entire group at once**, returning to the default all-party command mode without needing to click every portrait individually. This is a real UI feature layered on top of the existing party-command system, not a replacement for it — full-party click-to-move stays the default.
- **Enemy aggro (resolved):** enemies engage on proximity (aggro radius) **or immediately upon taking any damage**, whichever comes first — an enemy that's out of its aggro radius but gets hit (by a skill, a ranged shot, anything) should retaliate against its attacker right away rather than waiting to notice via radius alone.
- **Enemy de-aggro / leash (resolved, added after M2.1 playtesting exposed the gap):** an enemy gives up the chase and returns toward its spawn point if **any** of the following is true: (a) it has chased beyond a **maximum leash distance** from its own spawn tile (e.g. 10 tiles), regardless of continued proximity, (b) the player has been outside its aggro radius continuously for a short **timeout** (e.g. 4 seconds) without a fresh hit re-triggering aggro, or (c) **line of sight to the player is broken by an obstacle tile** — this drops aggro immediately, not on a timeout, since being fully hidden is a stronger signal than merely being far away. **Correction from an earlier version of this doc:** LOS was previously deferred as "later, once dungeons have walls" — that was wrong; the test scene already has obstacle tiles the player correctly can't path through, so LOS is in-scope now, not a future milestone. **TODO:** does a de-aggroed enemy heal back to full, or keep whatever HP it had? Fully healing is the common convention (prevents "hit it, run away, come back and finish it for free" cheese) but is a real balance choice, not an obvious default.
- **Enemy pathfinding must use the same walkable-tile grid as the player (resolved — this was a real bug, not a design gap).** Player and enemy movement need to share one source of truth for which tiles are walkable. An enemy that steers directly toward the player's raw position instead of following an A* path over that shared grid will walk straight through obstacles the player can't — which is exactly the bug found during M2.1 playtesting.

---

## 3. Combat: Bars, States, and Automation

### 3.1 Two-Bar Health Model

Every character has **two stacked health bars**:

1. **Health Bar** — normal HP. Damage comes off this first.
2. **Critical Health Bar** — a second pool that only starts draining once the Health Bar hits zero. While on the Critical bar, the character is in a **Critical state**. **Resolved: no mechanical penalty.** It's purely a visual/audio warning — flashing portrait, distinct health-bar color, maybe a sound cue — telling the player and any auto-healers that this character goes Downed on the next meaningful hit. Keeping it penalty-free means the tension comes from urgency alone, not from a character also fighting worse right when they most need to fight well.
3. **Downed** — once *both* bars hit zero, the character goes down. Downed characters can't act and must be revived by a **skill** (see Combat Medic below) or a **revive item**.

**TODO:** does Downed have a bleed-out timer that leads to permanent loss of that dungeon run's loot, or does it just sideline them until revived with no further penalty? This is a real difficulty-tuning decision, not a detail — flag it early.

### 3.2 Energy Bar

- Powers skills and spells. Each skill has an energy cost.
- Regenerates slowly, at a rate governed by: the hidden **Energy Regen** skill (universally trainable, added specifically to give physical characters a resource-sustain path) and the stronger, magic-specific **Mana Regen** skill layered on top for anyone with a magic-school proficiency (see `class_system.md`), plus equipped gear, consumables, and passive class skills.

### 3.3 Combat Medic (ties into the hidden-skill system)

Reviving a downed teammate is itself a trackable action. Reusing the `activityCount` requirement type already defined in the companion doc:

```json
{
  "skill": "Combat Medic",
  "requirements": [
    { "type": "activityCount", "target": "Ally Revived", "value": 5 },
    { "type": "proficiency", "target": "Healing Magic", "value": 30 }
  ]
}
```

Once unlocked, Combat Medic lets Healing Magic be cast **offensively** as well as defensively (e.g., a holy-charged nova that both damages enemies and heals allies caught in it) — this is the game's cleric-hybrid identity, earned through actually saving people rather than picked from a class list.

**Resolved after review: Combat Medic does get real offensive spells — the original vision stands, and a companion pure-support class is added alongside it for players who want a dedicated healer instead of a hybrid.** Full 5-skill kit locked in below (Section 12.2, alongside the other worked examples) — First Aid stays as the Level 1 heal already built; Level 10 becomes a new single-target offensive spell; Level 40 (capstone) becomes the AoE nova, damaging enemies and healing allies caught in the blast, matching the original "holy-charged nova" vision precisely. First Aid's existing behavior and Milestone 19's Staff dry-fallback are both unaffected — this adds real offensive options for when there's Energy to spend, it doesn't remove the melee fallback for when there isn't.

### 3.4 Skill Automation

Skills auto-fire when **off cooldown** and **affordable** (enough energy). Since a character usually has several skills available at once, priority needs a rule:

- **Recommended default:** each skill carries a designer-set priority number; the highest-priority ready skill fires first, then the next, down the list, each frame/tick it's re-evaluated.
- **TODO:** should the player be able to reorder priority per-character in a simple drag list (a light layer of control without breaking the "plays itself" pillar), or is priority fully fixed by class design? Recommend allowing player reordering — it's a small UI cost for a lot of build expression.
- **Resolved — per-skill Autocast toggle.** Each equipped skill (see Section 12.1) has an on/off Autocast switch. Off means the skill simply never fires on its own, freeing its Energy cost for other skills — this is the player's main tool for conserving Energy or intentionally simplifying a character's combat behavior, without touching cooldowns or priority order.

---

## 4. Equipment & Weight

### 4.1 Slots

Helmet · Body Armor · Main-hand (or 2H weapon occupying both hands) · Off-hand (shield, or a second 1H weapon once **Dual Wielding** is unlocked — see 4.3) · Side weapon (dagger or throwing weapon, always available even with a 2H weapon equipped) · Necklace · Ring · Accessory.

Any skill or passive effect on an equipped item applies automatically while worn — no separate "equip skill" action.

**UI note, clarified during downtime planning:** the current Main Weapon/Offhand dropdown selectors in the Party Overview modal are an explicitly temporary, functional-but-not-final interface. The intended long-term UI is a real **drag-and-drop character equipment screen** — a visual paperdoll with inventory items dragged onto their matching slots — covering every slot in this section at once (weapons, armor, accessories), not just weapons. **Deliberately deferred until Helmet/Body Armor/Necklace/Ring/Accessory actually exist as real items** — building a proper equipment screen for weapons alone now would mean redoing it once the other slot types land; better to build one correct version once armor and accessories are real.

### 4.2 Weight

- Every armor piece and weapon contributes weight.
- **Accessories and Backpacks** don't add capacity themselves in the sense of taking up inventory space, but specific accessory *types* can **increase** carry capacity.
- **Hidden skill tie-in:** repeatedly carrying over-capacity can proc a hidden skill (using the same proc-and-reveal mechanic as Resilience/Parry/etc. in the companion doc) — recommend **Iron Back** (Lv 1 unlock: flat capacity increase; further tiers reduce the movement penalty from being overweight).
- **Resolved — encumbrance penalty:** going over capacity is a hard, flat **-80% movement speed**, not a gradual curve. It's meant to feel like a wall, not a slope — you fix it by dropping/storing something, not by shrugging it off. Iron Back's later tiers are what eventually soften this, not the base curve.

### 4.4 Party Inventory (matching Dungeon Settlers)

With the whole party selected, opening the inventory screen shows **every party member's inventory at once**, side by side, and items can be dragged directly between characters from that shared view — no need to select each character individually to redistribute gear, potions, or crafting materials mid-run.

### 4.3 Dual Wielding (resolved — unlockable, not default)

Dual-wielding two 1-handed melee weapons is **supported, but gated behind a dedicated skill unlock** rather than available from the start — until it's unlocked, the off-hand slot only accepts a shield.

```json
{
  "skill": "Dual Wielding",
  "requirements": [
    { "type": "proficiency", "target": "any 2 one-handed melee weapon types", "value": 30 }
  ]
}
```

- Eligible 1H melee types: **Katana, Short Swords, Daggers, Mace, Spears** (Longswords and Greatswords stay 2H-only per the Section 12 fix in the companion doc).
- Requiring proficiency 30 (Adept) in *any two* of them — rather than one specific pair — keeps this open to any dual-blade playstyle instead of forcing a single "correct" combo, consistent with how Weaponmaster's "any 5 physical weapon types" requirement works in the companion doc.
- **Resolved — per-character.** Unlocking Dual Wielding is tied to that character's own weapon proficiencies, not account-wide.
- **Resolved — tradeoff.** Dual Wielding is itself a trainable skill, not a one-time unlock: it starts with a real accuracy penalty (recommend **-20%**) the moment it's unlocked, and gains its own exp from fighting while dual-wielding. As it climbs the usual 10/30/60/90 tiers, the penalty shrinks — e.g. -15% at 10, -10% at 30, -5% at 60, 0% at 90 — so early dual-wielding is a genuine tradeoff for the offhand damage, and only a fully-trained dual-wielder loses nothing for skipping a shield.

---

## 5. Food & Hunger

- Every character has a **Hunger meter** that drains over time.
- If they're carrying food, they **auto-eat** once hunger drops below a threshold — no player micromanagement required.
- Food grants **timed buffs**: +HP regen, +Mana regen, +Defense, +Attack, +Magic Attack, and others (full list TODO, should scale with Chef's dish-quality tiers from the companion doc — Common/Good/Excellent/Perfect dishes give proportionally stronger buffs).
- **Resolved — hunger only affects Mood, nothing else.** Going hungry does not directly reduce regen, stats, or combat performance — it lowers Mood (Section 10), and Mood is what carries any downstream performance effect. This keeps hunger from double-dipping as both its own penalty and a Mood input.
- **Spoilage (matching Dungeon Settlers):** stored food degrades over time and eventually becomes unusable or actively harmful (a spoiled-food debuff/status if eaten). **Resolved — baseline rate: every food item spoils in 7 in-game days** by default. This is a starting-point uniform rate, not a hard rule forever — individual recipes (e.g., higher Chef dish tiers, cured/preserved items) can override it later once that content exists, but 7 days is the number to build the spoilage system against now.

---

## 6. Consumables

- **Revive items** (field alternative to the Combat Medic skill) — **resolved mechanic, deferred implementation:** Alchemy-crafted (recipe TBD, once Alchemy's recipe catalog grows beyond Bandage). Using one requires clicking a downed ally while the item is selected, which starts a **3-second revive channel** — not instant. Taking damage during that channel **interrupts and cancels it**, matching real risk/tension to reviving mid-fight rather than a free, safe action. **Current instant revive (the `R` key, Party Overview button, console helper) is explicitly a testing convenience, not the final mechanic** — it's serving its purpose well for verification during development, but should eventually be replaced or gated behind this item-based system once Alchemy has the recipe to support it. Not scheduled into a numbered milestone yet.
- **Healing potions / Mana potions**
- **Regen potions** (HP or mana over time)
- **Thrown items** — bombs, knives, javelins. These are actual **Throwing Weapons** for exp purposes, not a separate "grenade" system — throwing one levels the same Throwing Weapons proficiency as a dedicated throwing build.
- **Weapon coatings (poisons)** — applied to a weapon, add a status-effect chance to that weapon's hits for a duration.
- **Status cures** — see below.

---

## 7. Status Effects

| Effect | What It Does | Typically Inflicted By | Cured By |
|---|---|---|---|
| Poison | Damage over time | Dark Magic, Daggers + poison coating, Nature Magic | Antidote (Alchemy) |
| Paralysis | Chance to fail an action | Lightning Magic | Paralysis Cure (Alchemy) |
| Burn | Damage over time, stacks | Fire Magic | Burn Salve (Alchemy) |
| Frost | Reduced attack speed | Ice Magic, Water Magic | Warming Draught (Alchemy) |
| Slow | Reduced movement speed | Ice Magic, Earth Magic, Nature Magic | Swiftness Draught (Alchemy) |
| Stun | Cannot act briefly | Mace, heavy weapon crits, deliberate skill effects (e.g. a Lightning-class active skill) | Cannot be cured mid-effect by design (short duration); resist gear instead |
| Shock *(added alongside Lightning Magic)* | Brief interrupt/disable, weaker and more frequent than Stun | Lightning Magic's base chain attack (a passive proc, not a skill) | Wears off quickly; no cure item needed given its short, frequent nature |
| Confused | Random/misdirected actions | Dark Magic, Arcane | Clarity Draught (Alchemy) |
| Bleed | Damage over time, worsened by movement | Katana, Short Swords, Daggers | Bandage (Alchemy or base item) |
| Blind | Reduced accuracy | Wind Magic, Dark Magic, thrown sand/dust items | Eyewash (Alchemy) |
| Hidden *(buff-ish, not harmful)* | Reduces detection, ties to Stealth | Stealth skill activation | N/A — it's a buff |
| Disarm | Loses main weapon temporarily, falls back to unarmed/side weapon | Specific enemy/boss skills, Mace-line skills | Wears off; no cure item needed |
| Expose | Increased damage taken | Perception-line skills, specific debuff skills | Wears off; no cure item needed |

All cure recipes are **learned, not automatic** — they're crafted at the **Alchemy station** and follow the same profession-tier-unlock pattern as other crafting (see companion doc), except the actual cure recipes should be discoverable early since they're needed for survival, not gated behind endgame tiers.

---

## 8. Crafting Stations & the Research Tree

- **Research Tree** gates which crafting stations exist at all. You don't start with a forge — you research your way to one.
- **Experimenting at a station is how you earn crafting-class exp** for the professions built this way. **Corrected during a documentation audit — this is a per-profession choice, not a universal rule as originally written here.** Cooking (Milestone 10) uses true discovery: interacting with a station, trying combinations, has a chance to reveal new recipes. Alchemy (Milestone 6) and Blacksmithing (Milestone 21) deliberately chose the opposite — tier-unlock, where recipes become available at fixed proficiency thresholds instead of being found through experimentation. Both are legitimate; pick one per profession based on whether that craft's fantasy is more "experimental" (Cooking) or "blueprint-driven" (metalworking, alchemy).
- Stations to research, roughly in unlock order: **Research Station** (meta — the tutorial's first build, unlocks the tree itself) → **Campfire/Cooking** → **Workbench (Woodworking/Bowyer)** → **Stonemason's Yard** → **Forge (Blacksmithing)** → **Armorsmithing Bench** → **Alchemy Station** → **Enchanting Altar** → **Tailoring/Jewelcrafting Bench**.
- **Resolved — research currency is Skill Books.** This reuses the Skill Book concept from the core progression design (rare enemy/loot drops that teach a skill usable in any class, regardless of what class is equipped): a Skill Book can either be **consumed to learn its skill directly**, or, if the character already knows it (or the player doesn't want it), **turned in at the Research Station** as research fuel instead. That gives duplicate Skill Book drops a purpose instead of becoming dead inventory clutter, and it means research progress is driven by dungeon-running rather than a separate currency grind.
  - Drop sourcing: **chests** are the primary source, **elite and boss enemies** drop them sometimes, and **normal monsters** drop them very, very rarely — see Section 11.4 for how this fits the loot tiers.

---

## 9. Building & Construction

### 9.1 Tile System

- Everything snaps to a grid so player bases stay clean and symmetrical.
- **Build Mode:** select a blueprint, then click valid ("white") tiles to place it.
- **Rotation** is allowed on everything **except walls** (walls infer their orientation from the grid edge they're placed on).
- **Indoor requirement:** Beds and crafting stations must be placed inside an **enclosed space** — defined as walls forming a closed perimeter with at least one door as the entrance. The game should validate enclosure at placement time (flood-fill check from the proposed tile to confirm it's bounded).

### 9.2 Material Progression

Starting point confirmed by you: **Wood → Planks (refined Wood) → Stone → Bricks (refined Stone)**. Recommend extending it two more tiers so it scales alongside the rest of the game's 4-tier proficiency pattern instead of stopping short:

| Tier | Material | Refined From | Gate |
|---|---|---|---|
| 1 | Wood | Woodcutting | — |
| 2 | Planks | Wood, via Woodworking | Woodworking 10 |
| 3 | Stone | Mining | — |
| 4 | Bricks | Stone, via **Stonemason** (resolved — its own dedicated profession, parallel to Woodworking but for stone) | Stonemason 30 |
| 5 | Reinforced (Iron-braced Brick/Plank) | Bricks/Planks + Ore, via Blacksmithing | Blacksmithing 30 |
| 6 | Runic/Masterwork | Tier 5 material + Enchanting | Enchanting 60 |

### 9.3 Decoration & Mood

- Placing decorations inside a room raises that room's **Quality score**.
- Room Quality directly feeds the occupant's **Mood** (see below) — a well-decorated private room should visibly outperform a bare stone box with a bed in it.

### 9.4 The Construction Skill (resolved — new)

Building and demolishing structures should be governed by its own trainable skill, the same 10/30/60/90 pattern as every other skill in this doc — trained through the act of placing and demolishing, not through a separate crafting station. Two effects scale with its tier:

| Tier | Build Cost | Demolish Refund |
|---|---|---|
| Untrained (0) | 100% of listed cost | ~50% refund |
| Novice (10) | ~90% of listed cost | ~60% refund |
| Adept (30) | ~75% of listed cost | ~75% refund |
| Expert (60) | ~60% of listed cost | ~90% refund |
| Master (90) | ~50% of listed cost | 100% refund |

These numbers are a starting point, not final balance. **Note for whichever milestone implements this:** Milestone 4 intentionally ships with a flat 100% refund regardless of skill, since Construction doesn't exist yet at that point — that's a deliberate placeholder, not the final design, and should be replaced by this table once Construction is built.

**Distinct from Woodworking/Stonemason:** those professions craft *portable items* (a Chair, a Table, refined Bricks) that get placed afterward. Construction is the meta-skill governing the *act of placing or removing anything* on the grid — it applies broadly across all buildable categories, not to one material type. Add it to the crafting mastery classes alongside the others in `class_system.md` (Apprentice/Journeyman/Master/Grandmaster Builder), but flag clearly there that its benefit is a flat cost/refund modifier, not a recipe-tier unlock like the rest of that table.

### 9.5 Automatic Room Classification (resolved — new)

Rooms are **not manually labeled by the player** — the game infers a room's type from what's actually inside it, checked whenever the enclosed space (Section 9.1) changes. Each furniture/station item carries a `roomTag`, and the room's name is derived from whichever tags are present, with **combinations of tags producing a more specific name than either tag alone**:

| Contents | Resulting Room Type |
|---|---|
| A Bed | Bedroom (or "House," if it's the only furnished room in the structure) |
| A Cooking Station | Kitchen |
| A Cooking Station + a Table and Chairs | Cooking & Dining Area (more specific than Kitchen alone) |
| A Blacksmithing station | Smithy |
| An Alchemy station | Apothecary |
| A Research Station | (Milestone 5 will likely add its own tag/name here — Study, Laboratory, etc.) |

**TODO — this needs a fuller design pass before implementation:** the full tag vocabulary, the priority/combination rules when multiple unrelated tags end up in one room (e.g. a Bed *and* a Cooking Station in the same space — which wins, or do they combine into something like "Cottage"?), and what a room with no tagged furniture at all is called (just "Room," or does it not count as a named room until something qualifying is placed). Treat the table above as confirmed examples to build toward, not a complete ruleset — flesh out the remaining combination logic before this becomes its own milestone.

---

## 10. Guild Mood System

Each guild member tracks a **Mood** meter. Proposed inputs:

| Factor | Effect on Mood |
|---|---|
| Room Quality (decoration, tier of materials, personal space) | Higher quality = higher mood ceiling |
| Food quality/variety (ties to Chef's dish tiers) | Better/varied meals = mood boost |
| **Hunger (resolved)** | Going hungry is purely a Mood drain — it has no other direct effect (Section 5) |
| Rest (time spent at the outpost vs. back-to-back dungeon runs) | Overworking without rest drains mood |
| Being left downed/unrevived often *(TODO — consider)* | Could tie combat performance into mood, reinforcing that a good healer keeps the guild happy too |

**What Mood affects (needs a firm decision, currently open):**
- Crafting speed/quality at stations
- A small combat stat modifier while that member is out on a run
- **TODO — hard call:** does Mood bottoming out ever cause a member to leave the guild? That's a real stakes decision (survival-management tone) versus keeping Mood purely a soft performance buff/debuff with no loss condition. Recommend starting with **no departure risk** for v1 — purely a performance multiplier — and only adding defection risk later if the game needs harder guild-management stakes.

---

## 11. Dungeons

### 11.0 Regional Progression (matching Dungeon Settlers)

Rather than one dungeon that just gets harder, structure content into **Regions** — each a distinct biome with its own enemy roster, gathering nodes, and material set — plus an endgame **Abyss** region as the final, hardest tier. This gives the research tree and gear progression a visible destination and matches the launch content shape (Regions 1–2 + Abyss at Early Access, more regions over time). **TODO:** name and design each region's identity/theme.

### 11.1 Generation

- **Fully randomized on every visit** — layout, enemy placement, resource node placement, and puzzle/vault placement all reroll per run, within whichever Region's rule set is active.

### 11.1a The Return Teleporter Crystal (resolved design, deferred implementation)

**Real design decision, intentionally not built yet — implementing this now would make ongoing testing significantly harder, so the current free bidirectional portal stays in place as a development convenience until this is ready.** Same category of distinction as instant revive being a testing shortcut for the eventual item-based revive system — the current easy portal access is not the final design.

**The actual intended mechanic:** once a player enters the dungeon, there is **no free, immediate way back to the Outpost.** The only way out is to physically find a **Teleporter Crystal**, placed somewhere within the randomly generated layout — not guaranteed to be near the entrance. This is the core tension of a dungeon run: the player must decide whether to keep pushing deeper and exploring (more loot, more risk, further from a known way out) or actively navigate back toward finding the crystal to retreat and heal/prepare before continuing.

**Interacting with the Crystal presents a binary choice, not an automatic return:**
- **Continue** — proceed to a **new, freshly generated floor**, going deeper (implying multi-floor dungeon progression, not a single flat layout).
- **Return** — teleport back to the Outpost, ending the run.

This is deliberately consistent with the hard-mode swarm-trap design decision — no safety net, real consequences for exploration choices, tension baked into the core loop rather than smoothed over. **Not scheduled into a numbered milestone yet** — implement once the debug-friendly instant-portal workflow is no longer needed for active testing of other systems.

### 11.2 Gathering Nodes Found In Dungeons

Trees (**Woodcutting**, also called Logging), bushes, berry bushes (Foraging), mineable rocks (Mining), fishing spots (Fishing), and **dig spots** (Digging — the Excavator/Explorer line from the companion doc). This is what makes gathering skills relevant to dungeon runs specifically, not just idle base activities.

**Resolved design, deferred implementation (captured during Milestone 16 review): gathering is a channel, not an instant action, and it's interruptible by combat.** Interacting with a gathering node (currently just Foraging's bushes, but this should apply to every future gathering type) takes a few real seconds to complete, represented by a visible progress bar filling as the character channels. **If the gathering character takes damage from an enemy during that window, the attempt is immediately cancelled** — no items, no EXP, progress bar resets to zero — **and the character enters combat with whatever hit them**, using the same engage logic already built for any other combat trigger. This adds real risk to gathering (you're vulnerable while channeling) rather than making it a completely safe, free action, consistent with the hard-mode philosophy already locked in for the swarm-trap and floor-timer systems. Not implemented yet — Milestone 10's Foraging currently harvests instantly on arrival/click.

**Corrected during Milestone 17 review: gathering nodes follow the same "stays depleted" rule Milestone 16 established for enemies — no individual per-node respawn timer at all.** Once a node is harvested, it's gone for the rest of that floor visit. New gathering nodes appear only when the floor itself regenerates — leaving and re-entering the dungeon (or, once the Teleporter Crystal/multi-floor system exists, moving to a new floor), never from a standing timer. This is a deliberate, explicit exclusion from the floor-wide enemy repopulation timer (Section 11.5) too — that timer only ever repopulates combat rooms with enemies, and should never spawn new gathering nodes as a side effect. The two systems stay completely separate: enemies get pressured back by the floor timer, gathering nodes only reset on a genuine new floor.

### 11.2a Gathering Mode (resolved design, not yet built — captured during downtime planning)

**Dungeon-only, entered via a dedicated hotkey.** While active, the player can **drag the mouse to draw a selection area** encompassing multiple gathering nodes at once, rather than clicking each one individually. Once confirmed, the party automatically works through every node in that area as a queue — each available member paths to an unclaimed node, channels it (per Section 11.2's gather-channel-and-interrupt rule, which still fully applies — taking damage mid-channel still cancels and pulls into combat), then moves to the next unclaimed node in the queue. **Once the queue is exhausted, party members remain wherever they last gathered** rather than auto-returning to formation — unless there's still an unpicked, unoccupied node within the original selection, in which case they path to that instead. This is meant to feel like an efficient area-clearing tool for dense gathering rooms, not a replacement for manually targeting a single specific node when that's all that's wanted.

### 11.2b Skinning & Butchering — Corpses as Gathering Nodes (resolved design, deferred implementation, captured during downtime planning)

**Not something for now — captured precisely so it's ready whenever it's picked up.** Two more gathering skills, but with a genuinely different node source than Foraging/Woodcutting/Mining/Digging: **a defeated enemy's corpse becomes a real gatherable node**, harvestable through the exact same universal gather-channel-and-interrupt system every other gathering type already shares (Section 11.2) — no new mechanic, a new node *source*.

- **Skinning** harvests pelts/hide — only from enemies that actually have one (Wolf being the clear existing example; Spider's silk arguably qualifies too). Not every enemy is Skinning-eligible.
- **Butchering** harvests meat — from any enemy **except** Undead and Skeletons, who obviously have no flesh to harvest. This exclusion needs to be a real per-enemy check, not an oversight waiting to happen the first time someone tries to butcher a Skeleton.
- **Both skills are locked behind their own separate Research Tree node** — "Harvest Enemy Skin" and "Harvest Enemy Meat" are two independent unlocks, completing one does not grant the other. This reuses the same Research-gated pattern already established for unlocking crafting stations, just gating a *harvesting capability* instead of a *buildable*.
- **Corpse nodes are inherently one-time, unlike the other four gathering types.** A tree or rock node depletes and only renews on a full floor regeneration; a corpse node is tied 1:1 to that specific kill and is simply gone once harvested — there's no "respawn" concept for it, since a new one only ever appears from a genuinely new kill (including from floor-timer repopulation's fresh enemies).
- **Gathering Mode (Section 11.2a) should pick these up automatically** once built, the same way it should for Digging — corpse nodes are just another node type in the same pool, not a special case requiring their own selection logic.

### 11.3 Puzzles & Gated Content

Small minigame-format puzzles can gate:
- Locked chests
- Doors into **Elite**, **Epic**, or **Boss** encounter rooms

(Exact minigame formats TODO — recommend keeping them short and skippable-with-a-key-item for players who'd rather fight than puzzle, so the mechanic adds variety without becoming a wall.)

### 11.4 Enemies & Loot

- Enemy tiers: **Common → Elite → Epic → Boss**, each with proportionally better loot tables.
- **Recipe drop tiers** (for standard weapons, armor, and accessories): **Common, Uncommon, Rare, Very Rare, Mythical, Legendary** — sourced from monster kills, boss kills, chest loot, and quest completion rewards.
- **Skill Book drop weighting** (Section 8): chests are the primary source, elites/bosses drop them sometimes, normal monsters very, very rarely.

### 11.5 Enemy Respawn — Floor Timer, Not Individual Respawn (built in Milestone 16, correcting a former testing convenience)

**Important correction:** the individual per-enemy respawn timer built early in this project (originally ~3 seconds, added specifically so a single test Wolf could be fought repeatedly without needing to leash-and-return) was a **testing convenience only** — it was never meant to be the real dungeon-clearing behavior. It has been replaced.

**The actual mechanic, now implemented:**
- **Defeated enemies do not respawn individually.** A room you've cleared stays cleared — killing everything in it is a real, permanent accomplishment for that dungeon visit.
- **A floor-wide timer runs continuously while the player remains on the current floor without progressing** (not leaving to a new floor via the eventual Teleporter Crystal system, Section 11.1a). Currently 300 seconds (5 minutes), tunable in `dungeonConfig.json`.
- **When that timer expires, one random combat room on the current floor is repopulated with new enemies** — could be a room that was already cleared, could be one that wasn't. The timer then resets and starts counting again immediately.
- **Net effect:** exploring and clearing rooms at a normal pace essentially never triggers this. Camping on one floor indefinitely (farming, stalling, avoiding progress) eventually gets punished with fresh danger appearing somewhere on the floor.
- **Calibration note for future content additions:** the 300-second default was tuned against how sparse the dungeon currently is. As more gathering node types and other things-to-do get added to dungeon floors in future milestones, players legitimately spending longer per floor — and triggering this timer more often as a result — is an **expected, acceptable consequence of richer content**, not a sign the duration needs to shrink defensively. Revisit the actual number once real content density changes, rather than assuming today's tuning stays correct forever.

### 11.6 Starter Bestiary & Ingredient Tagging

Full bestiary is still a living-document item, but here's a first batch of enemy families with their harvest items — and, importantly, a **tagging convention** so future recipes can reference "anything tagged X" instead of needing every recipe hand-written the moment an item is created. Each drop item carries one or more profession tags showing what it's *for*, even before the actual recipe exists.

| Enemy | Harvest Method | Item | Tags (what it's for, even before the recipe exists) |
|---|---|---|---|
| Slime | Special "collect" action (not Skinning/Butchering — it's not an animal) | Slime Gel | `Cooking` (→ Slime Pudding, a food item), `Alchemy` (later — adhesive/potion base) |
| Wolf | Skinning | Wolf Pelt | `Armorsmithing` (light/medium hide armor) |
| Wolf | Butchering | Wolf Meat | `Cooking` |
| Wolf | Rare drop | Wolf Claw | `Blacksmithing`/`Bowyer` (weapon component), `Tailoring/Jewelcrafting` (accessory component) |
| Goblin (and other humanoids) | Butchering | Monster Meat | `Cooking` — flagged as lower-tier than Wolf Meat; recommend it can't reach the higher Chef dish-quality tiers on its own, giving beast meat a real reason to stay valuable |
| Goblin | Rare drop | Goblin Ear | `Alchemy` (potions and the poison weapon-coatings from Section 7's status effect table) |
| Skeleton / Undead | Salvage (no flesh — a "reclaim" action instead of Skinning/Butchering) | Bone | `Bowyer` (arrows/shafts), `Blacksmithing` (bone-hilted weapons) |
| Skeleton / Undead | Rare drop | Ectoplasm | `Enchanting`, `Alchemy` — a natural fit for Dark Magic/Necromancer-line recipes down the road |

**TODO:** this covers the first five enemy families you named (slime, wolf, goblin, skeleton, undead) — the full roster, per-Region variants, and Elite/Epic/Boss versions of each are still open. The tagging convention above should carry forward to every new enemy added, so this table can grow without needing a rewrite each time.

---

## 12. Active Skills — 5 Per Combat Class

### 12.0 Skill Portability & Skill Books

Two ways a skill escapes being locked to the class that taught it — both from the original core design, formalized here since Section 8 now leans on the second one:

1. **Level-gated portability.** A skill trained far enough within its original class (exact threshold TODO — a natural fit would be the skill's own 60 or 90 proficiency tier) becomes usable while a *different* class is equipped. This is what lets a long-term character build genuinely personal hybrid kits instead of being fully redefined every time they swap classes.
2. **Skill Books.** Very rare loot (see Section 11.5's drop weighting) that teaches its skill **immediately, usable in any class**, bypassing the class/level requirement entirely. As of this doc, Skill Books also double as the Research Tree's currency (Section 8) when a duplicate or unwanted one drops.

### 12.1 Skill Loadout — Known vs. Equipped (resolved)

Between class kits, portability, and Skill Books, a long-term character can end up **knowing** far more than 5 skills. Only a subset of those can actually be active in combat at once:

- **Known skills:** everything a character has ever unlocked — every class they've leveled into skill range, every portable skill, every Skill Book learned. This list only grows.
- **Equipped skills:** a maximum of **5 active slots**, drawn from the Known list, that actually auto-cast during combat (Section 3.4). This is the loadout the player curates.
- **Swapping is outpost-only.** Equipped skills can only be changed while at the guild outpost, not mid-dungeon-run. This is a deliberate loop-reinforcing choice: it makes loadout planning part of *preparing* for a run rather than a mid-fight menu, and gives the outpost another reason to matter beyond building and crafting.
- Each equipped skill carries its own priority (Section 3.4) and its own Autocast toggle — a character could equip 5 skills and still turn 3 of them off to run a deliberately simple, Energy-conserving rotation.

### 12.2 The 5-Per-Class Template

**Template:** every combat class gets exactly 5 active skills, unlocked as the *class* (not the underlying weapon) levels up. Recommended unlock spread: **Class Lv 1 (on unlock) → Lv 10 → Lv 20 → Lv 30 → Lv 40 (capstone)**.

This needs to eventually be filled in for all 74 combat classes in the companion doc — that's a lot of content, so below are fully worked examples for the five classes tied to the game's starting weapon kits and its very first class, to lock in the format before it's mass-produced.

### Fencer (Short Swords path — Tier 0, the game's very first class)

**Gap found during a Milestone 21 downtime review: Fencer was never actually included among the "fully worked examples" below, despite being the first class ever built (Milestone 1) and the only one live in-game for 13 milestones before Vanguard.** Only 2 of its 5 skills (Power Strike, Thrust) were ever implemented, and neither the kit's remaining 3 skills nor Thrust's exact effect were ever formally designed — Thrust exists in the codebase without ever having a written spec. Filled in now, matching the established "quick, light-footed duelist" fantasy and deliberately differentiated from Dark Knight (bleed/self-sacrifice), Scout (ranged/utility), and Arcane Initiate (caster) so the four Tier 0/1 starting kits each feel distinct:

1. **Power Strike** (Lv 1, already built) — heavy single-target strike, higher cost, the burst-damage option.
2. **Thrust** (Lv 10, already built but never formally specced — **this locks in its intended design, reconcile against whatever the current implementation actually does**) — a fast, cheap, high-accuracy strike with a short cooldown: the reliable filler/opener, deliberately the opposite of Power Strike's heavy-hit identity rather than a redundant second version of it.
3. **Riposte** (Lv 20, new) — a guaranteed counter-strike, usable only in the brief window right after successfully evading or parrying an attack. Directly synergizes with Fencer's existing innate Counterattack head-start (already noted elsewhere in this doc's class-bonus table) — this is the skill that makes that passive bonus feel like an active playstyle choice, not just a hidden number.
4. **Fleche** (Lv 30, new) — a fencing term for a running lunge attack: a gap-closing dash-strike that instantly closes distance to a target and deals damage on arrival. This is what actually delivers on "light-footed" — nothing in Fencer's kit before this point does anything with mobility.
5. **Blade Dance** (Lv 40, capstone, new) — several rapid strikes against the current target in quick succession, high total damage, longer cooldown. The classic duelist finisher, and Fencer's answer to every other kit's single big capstone hit — this one's capstone is about speed and volume instead of one massive blow.

### Combat Medic (Healing Staff path — hybrid healer/damage-dealer)

**Confirmed after review: Combat Medic keeps its original "cleric-hybrid" identity from Section 3.3** — offense and support together, distinct from the pure-support Restoration Mage below.

1. **First Aid** (Lv 1, already built) — single-target heal, unchanged from Milestones 11/15.
2. **Smite** (Lv 10, new) — single-target offensive holy strike, dealing damage to one enemy. This is what makes Combat Medic genuinely hybrid rather than "healer with one damage button bolted on."
3. **Cleanse** (Lv 20, new) — removes a harmful status effect (Bleed, Burn, Shock, Poison, etc.) from an ally, on cooldown.
4. **Guardian's Ward** (Lv 30, new) — a brief shield absorbing incoming damage on a targeted ally, a proactive defensive tool distinct from reactive healing.
5. **Holy Nova** (Lv 40, capstone, new) — an AoE burst around the caster that damages enemies and heals allies caught in the blast simultaneously, matching the original Section 3.3 vision word-for-word. The signature "why Combat Medic is worth playing over a pure healer" payoff.

### Restoration Mage (Healing Staff path — pure support specialist, new class)

**A companion class to Combat Medic for players who want a dedicated healer with zero offensive capability**, rather than the hybrid identity above. Requires deeper investment in Healing Magic specifically than either Medic (Tier 0) or Combat Medic — this is the "went all-in on pure healing" path. Suggested requirement: `Healing Magic 60 + Medic Lv 15` (Tier 2/Expert, per the tier table in `class_system.md`), distinguishing it clearly from Combat Medic's `Healing Magic 30 + 5 Ally Revives` (Tier 0/Novice-adjacent).

1. **Heal** (Lv 1) — single-target instant heal, the class's own baseline (distinct from First Aid, which stays Combat Medic's signature skill).
2. **Regenerate** (Lv 10) — applies a heal-over-time effect to a target, rewarding sustained support over burst healing.
3. **Barrier** (Lv 20) — a damage-absorption shield on a targeted ally, this class's own defensive tool.
4. **Blessed Weapons** (Lv 30) — a party-wide buff applying a temporary Holy element to allies' weapons for a few minutes, a proactive raid-support tool rather than a reactive heal.
5. **Mass Revive** (Lv 40, capstone) — revives multiple downed allies at once in an area, rather than one at a time. A genuinely powerful, rare-use capstone matching the "dedicated healer's ultimate" fantasy — this is what makes going pure-support instead of hybrid feel like a real, distinct payoff rather than a strictly weaker Combat Medic.

**Deliberate contrast between the two:** Combat Medic trades some support depth for real offense (Smite, Holy Nova doubling as damage); Restoration Mage trades all offense for support depth (a HoT, a proactive buff, and a capstone that saves the whole party instead of one ally). Both are legitimate builds from the same Healing Magic investment, not one being a strictly-better version of the other.

### Vanguard (Short Swords + Shield path)

1. **Shield Bash** (Lv 1) — short-range stun, low cost.
2. **Guard Up** (Lv 10) — brief large mitigation boost, self-cast.
3. **Taunt** (Lv 20) — forces nearby enemies to target this character.
4. **Retaliate** (Lv 30) — next hit taken triggers a free counterattack (synergizes with the hidden Counterattack skill).
5. **Unbreakable** (Lv 40, capstone) — brief full damage immunity, long cooldown.

### Dark Knight (Longsword, 2H, no-shield path)
1. **Rending Cut** (Lv 1) — bleed-applying strike.
2. **Dark Pact** (Lv 10) — trade a small HP cost for a burst of damage.
3. **Umbral Step** (Lv 20) — short gap-closer dash that also applies Blind.
4. **Soul Drain** (Lv 30) — attack heals for a % of damage dealt (temporary Life Steal boost).
5. **Oblivion Strike** (Lv 40, capstone) — massive single-target hit, longer cooldown, consumes bonus energy for bonus damage.

### Scout (Bow + Dagger path — mentor NPC's class)
1. **Quickshot** (Lv 1) — fast, low-cost ranged attack, primarily a filler/opener.
2. **Mark Target** (Lv 10) — applies Expose to the target.
3. **Evasive Roll** (Lv 20) — short dash with a brief dodge window, synergizes with Evasion.
4. **Trap Snare** (Lv 30) — places a ground trap that Slows the first enemy to cross it.
5. **Kill Shot** (Lv 40, capstone) — bonus damage against targets below a health threshold, rewarding good target prioritization.

### Arcane Initiate (Random Magic Staff starting path — generic caster template)
1. **Arcane Bolt** (Lv 1) — basic ranged spell, low cost, primary filler.
2. **Mana Shield** (Lv 10) — converts a chunk of incoming damage into energy cost instead of HP, briefly.
3. **Overcharge** (Lv 20) — next spell cast costs more energy but hits significantly harder.
4. **Blink** (Lv 30) — short teleport, escape or reposition tool.
5. **Arcane Nova** (Lv 40, capstone) — AoE burst around the caster, longer cooldown.

**TODO:** the remaining ~70 combat classes need their own 5-skill kits. Recommend tackling them in the same priority order players unlock them (Tier 0 → Tier 1 → Tier 2 → Tier 3 → Tier 4, per the companion doc) so early-game content is never blocked waiting on capstone-tier design work.

---

## 13. Character Creation & Starting Kits

Expeditions are a fixed 4-person party (Section 2), but the game obviously doesn't start with 4 people — the opening sequence (Section 14) has just the player and the Scout, with the remaining slots filling as recruits arrive. Early dungeon runs are meant to happen under-strength.

At game start, the player customizes their character's appearance and chooses **one** starting weapon kit:

1. **Sword and Shield** (Short Swords + Shields — feeds toward the Vanguard/Knight line)
2. **2H Longsword** (Longswords — feeds toward the Dark Knight/Sword Saint line)
3. **Bow and Dagger** (Bows + Daggers — same kit as the Scout mentor NPC)
4. **Random Magic Staff** (resolved — the game randomly assigns **one magic school** from the offensive/elemental pool: Arcane, Fire, Water, Ice, Earth, Nature, Lightning, Wind, Holy, or Dark. A player could start as, say, a Fire mage or a Lightning mage entirely by chance. Healing Magic and Druid Staff are excluded from this pool — Healing has no offensive kit to start combat with, and Druid Staff is a combo-focused tool weapon rather than a standalone starting school.)

### 13.1 Second Offensive School — Lightning Magic (fully specced during a downtime design pass, not yet built)

**Why Lightning specifically:** Fire Magic's identity is single-target damage with an area splash and a damage-over-time effect (Burn). For Random Magic Staff to actually feel random rather than deterministic, the second school needs to be a genuinely different mechanical shape, not a recolor. Lightning is built around **chaining between separate enemies** — a fundamentally different area-effect pattern than Fire's "splash around one point."

- **Weapon architecture, matching the established two-layer pattern from Fire/Healing Magic:** `lightning_staff` is the equippable conduit item (Main Weapon slot, follows the same melee-fallback-when-dry pattern every magic school now has); `lightning_magic` is the actual spell/damage/EXP definition resolved at cast time, exactly mirroring how `fire_staff`/`fire_magic` already work.
- **Core mechanic — chain targeting, not radius splash.** On cast, the bolt strikes the primary target, then arcs to 1-2 additional *separate* living enemies within a short hop distance of the previous target (not all clustered around one point — it's a chain, hopping enemy to enemy). Each subsequent hop deals reduced damage relative to the previous hit. This directly complements Fire Magic: Fire rewards enemies clustered together, Lightning rewards enemies spread out in a line or loose formation — genuinely different positioning incentives for the player.
- **Shock, not Stun, for the base chain attack — confirmed after review.** The Status Effects table lists Stun as inflicted by "Mace, Lightning Magic," which reads as though Lightning's base attack should reuse Stun directly — but the actual intent, confirmed after discussion, is a genuine two-tier split: **Shock** is Lightning Magic's own new status effect, a frequent, low-severity proc on the base chain attack (a brief interrupt/disable, weaker and more common than Stun). **Stun stays reserved for a dedicated skill within Lightning's eventual class kit** — a deliberate, skill-gated, stronger effect the player chooses to use, not something that fires passively on every attack. This gives Lightning two distinct layers of crowd control instead of one effect doing both jobs.
- **Tier 0 class:** **Spark Adept** (`Lightning Magic 10`), already named in `class_system.md`'s weapon-tier table — no new class name needed.
- **This closes Random Magic Staff's "not actually random" gap in a meaningful way** — with Fire and Lightning both live, the starting-kit roll now produces two builds with genuinely different combat feel, not just different flavor text on the same mechanic.

**New generic weapon type added during Milestone 15 review: Staff. Corrected during a Milestone 20 bugfix review to eliminate a real ambiguity bug at the data level.** Originally, one single generic "Staff" item was meant to be shared and reusable across every staff-wielding school (Healing Magic, a future Fire Magic conduit, a future Monk). In practice this created a genuine ambiguity: a bare Staff equip gave no way to tell which spell (if any) a character intended to cast, which caused a real bug where a Healing Magic character's combat actions were misattributed to Fire Magic.

**The corrected model: each magic school that uses a staff conduit gets its own distinctly-named item — Healing Staff, Fire Staff, and so on for future schools — each one inherently and unambiguously declaring its school by identity, not by inference.** Equipping a Healing Staff means casting Healing Magic, full stop, no runtime disambiguation logic needed. A separate, genuinely generic **Staff** (no school name attached) remains for melee-only classes with no spellcasting at all — the future Monk archetype being the clearest example. **All staff-type items — school-specific or plain — still train the same shared `staff` melee proficiency when physically swung**, exactly as originally designed; only the *spell* side of the equation is now resolved by item identity rather than character training history. This is a stronger, simpler fix than trying to infer intent at runtime — the ambiguity is designed out of existence rather than resolved after the fact.

**Open question, not resolved now:** should Druid eventually be migrated onto this same "school-named staff" convention (a "Druid Staff" fits the pattern naturally) rather than remaining its own bespoke line? Worth revisiting once a second staff-using class beyond Healing/Fire actually exists, not a decision to force now.

**Note on naming clarity:** "Sword and Shield" uses **Short Swords**, not Longswords — Longswords are tagged 2H in the weapon list (see the companion doc's Section 12 fix), so they can't be paired with a shield. Worth confirming this matches your intent before it's locked into the character creator UI text.

---

## 14. Opening Sequence (Tutorial Script)

A structured beat sheet for the intro, based on what you outlined:

1. **Character creation** — appearance + starting weapon kit (Section 13).
2. **Arrival at the remote guild outpost.** Empty. Nothing built. No beds, no food.
3. **Meet the Scout** (outpost founder, Bow + Dagger, already at Daggers 10 + Bows 15 — see companion doc's Scout entry). The Scout explains the core loop bluntly: *the only way to get anything is through the dungeon portal, because there's nothing here yet.*
4. **First dungeon run (guided):**
   - Controls taught: click-to-move, camera (WASD/MMB), lock-on.
   - Harvesting taught: interact with a resource node (tree/rock/etc.) to gather.
   - Combat taught: click an enemy, watch auto-engage + auto-skill-firing happen, learn the two-bar HP model by taking a hit.
5. **Return via the portal crystal** back to the empty outpost.
6. **Build tutorial:** construct the first **indoor structure** (walls + door, satisfying the enclosure rule from Section 9.1).
7. **Research tutorial:** build the **Research Station** inside that structure — this is the node that unlocks the rest of the research tree (Section 8).
8. **Narrative beat — the call:** Guild HQ contacts the Scout to check on recruitment status.
   - Scout reports the player has arrived and is being shown around.
   - HQ contact asks: *"Only one recruit?"*
   - Scout confirms, and mentions a second recruit is inbound — **someone HQ describes as "too invested in research to be useful at HQ,"** framed as a lucky break for the outpost given the Research Station was just built. This is a clean, organic way to introduce whichever class/NPC becomes the guild's first dedicated crafter/researcher.

**TODO:** name and class the second recruit (a Chef, an Alchemist, or a generic "Scholar" archetype would all fit "too invested in research" — Alchemy or Chef both tie in well since both already use experimentation-based unlocks in the companion doc).

---

## 15. Open Design Questions (running list)

Consolidated from every TODO above, so this section alone can be scanned for what's still undecided:

- ~~Does click-to-move command the whole party or only selected units?~~ **Resolved:** fixed 4-person party, commanded as a group by default.
- ~~Art style / camera~~ **Resolved:** 2D pixel art, top-down, no free rotation.
- ~~Character death~~ **Resolved:** revivable Downed state stays (deliberate departure from Dungeon Settlers' permadeath).
- ~~Exact stat penalty while on the Critical health bar.~~ **Resolved:** none — it's a pure warning state (Section 3.1).
- Does Downed have a bleed-out timer with real stakes, or is it purely "sidelined until healed"?
- ~~Is dual-wielding two 1H weapons supported?~~ **Resolved:** yes, per-character, unlockable via any 2 one-handed melee types at 30 proficiency, starting at -20% accuracy that shrinks as the Dual Wielding skill itself levels through 10/30/60/90 (Section 4.3).
- ~~Exact overweight movement-speed curve.~~ **Resolved:** flat -80% while over capacity, no gradual curve (Section 4.2).
- ~~Does hunger ever cause damage/death, or stay a pure performance debuff?~~ **Resolved:** hunger only affects Mood, nothing else (Section 5, Section 10).
- ~~Spoilage rate per food type~~ **Resolved:** uniform 7 in-game days as the baseline (Section 5) — individual recipe overrides are still an open door, not yet used.
- ~~What currency unlocks Research Tree nodes?~~ **Resolved:** Skill Books (Section 8) — doubling as the cross-class skill-learning item (Section 12.0).
- ~~Name for the Stone→Brick refining sub-skill~~ **Resolved:** its own profession, Stonemason (Section 9.2).
- Does Mood ever cause a guild member to leave, or stay a pure soft multiplier?
- Puzzle minigame formats, and whether they're skippable with a key item.
- Region themes/identities and what makes the Abyss distinct as the endgame region.
- The exact proficiency/level threshold at which a skill becomes portable to other classes (Section 12.0).
- Full bestiary beyond the current nine enemies plus the first Elite (Orc Warrior, Milestone 20), per-Region variants, and Epic/Boss versions.
- Full 5-skill kits for the remaining ~70 combat classes.
- Identity/class of the second recruit in the opening sequence.
