# Milestone Brief: Crafting Mastery (Apprentice Rank) & Recipe Level Rebalancing

> **Status:** PLANNING / PROPOSAL ONLY — Awaiting Director Approval before modifying game data or code.  
> **Target Scope:** Starter Band (Levels 0–10) Recipe Alignment, Apprentice Crafting Classes, and Floor-Band Economy Consistency.

---

## 1. Executive Summary

This milestone establishes the **Apprentice Crafting Progression** across all four core crafting disciplines:
1. **Blacksmithing** (Weapons, Tools, Shields)
2. **Armorsmithing** (Leather, Silk, Talismans)
3. **Bowyer** (Quarterstaves, Bows)
4. **Alchemy** (Medicine, Potions, Reagents)

Following the Director's rules:
- **Starter Band (0–10):** All early game recipes are partitioned across levels 0–10 matching floor-band material access.
  - **Band 1 (Floors 1–2):** Levels 0–4 (Iron, Timber, Wolf Pelts, Bones, Basic Potions).
  - **Band 2 (Floors 3–5):** Levels 5–7 (Steel Scrap, Spider Silk, Venom, Heavy Hide).
  - **Band 3 (Floors 6–10):** Levels 8–10 (Morningstar, War Bow, near Apprentice mastery cap).
- **Future Tiers (30 / 60 / 90):** Strictly reserved for Journeyman, Master, and Grandmaster tiers when caldera/glacial native enemies and void/boss crafting are built.
- **Apprentice Classes (Proficiency 10):** Add the missing Apprentice crafting titles to `data/classes.json` (`apprentice_smith`, `apprentice_alchemist`, joining existing `apprentice_armorer` and `apprentice_bowyer`).

---

## 2. Item 0: Audit & Mismatch Report

### 2.1 Recipe-Level Mismatches Identified in Gear Ladder

1. **`greatsword` (Steel Greatsword):**
   - *Current State:* `requiredLevel: 0`.
   - *Issue:* In Milestone 14, `greatsword` had 2 Steel Scrap added to its recipe so that peak 2H damage does not come from two Floor 1 clears. However, its recipe level remained at `0`, meaning a Level 0 Blacksmith sees a recipe requiring Band 2 materials.
   - *Proposed Fix:* Move `greatsword` to **Level 5** in Blacksmithing (matching Band 2 entry and `heavy_mace`).
2. **`spiked_morningstar` & `war_bow`:**
   - *Current State:* Both set to `requiredLevel: 10`.
   - *Issue:* Level 10 is the exact ceiling of the Apprentice rank. Band 3 enemies (Caldera, Floors 6–10) drop the required materials. At level 10, players cannot craft these while actively working through Band 3 unless they grind to the absolute rank cap.
   - *Proposed Fix:* Adjust both to **Level 8** (or keep at Level 10 as pinnacle Apprentice capstones, per Director preference).
3. **`composite_bow` & `heavy_mace`:**
   - *Current State:* Both set to `requiredLevel: 5`.
   - *Status:* Perfectly aligned with Band 2 material availability (Spider Silk, Steel Scrap).
4. **`silk_cowl`, `silk_robe`, `venom_charm`:**
   - *Current State:* Silk Cowl is Lv 5, Silk Robe is Lv 5, Venom Charm is Lv 4.
   - *Status:* Venom Charm requires Silk + Venom (Band 2). A Lv 4 requirement makes it craftable immediately upon entering Band 2, but moving it to Lv 5 alongside Silk Cowl creates a cleaner Band 2 threshold. Silk Robe (+50 HP) should sit at Lv 6 as the premier body armor upgrade.
5. **Alchemy Recipes:**
   - *Current State:* `bandage`, `antidote`, `energy_potion`, `mana_potion` omit `requiredLevel` entirely (defaulting to 0).
   - *Status:* Bandage and Antidote are essential survival cures and should remain Level 0. Energy Potion (Herbs + Wood) can sit at Level 1, Mana Potion (Ectoplasm) at Level 2, and Revive Potion (Bone Meal + Herbs) at Level 3.

---

### 2.2 Complete Recipe Level Audit & Proposed Rebalancing

#### A. Blacksmithing (17 Recipes)
| Recipe ID | Item Name | Band | Current Req Lv | Proposed Req Lv | Ingredients | Rationale |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `short_sword` | Iron Shortsword | Band 1 | 0 | **0** | 3 Ore, 1 Wood | Baseline 1H sword (5 dmg) |
| `daggers` | Iron Daggers | Band 1 | 0 | **0** | 2 Ore, 1 Wood | Baseline dual-wield/rogue weapon (3 dmg, bleed) |
| `mace` | Iron Mace | Band 1 | 0 | **0** | 4 Ore, 2 Wood | Baseline stun weapon (7 dmg, 15% stun) |
| `iron_shield` | Iron Shield | Band 1 | 0 | **0** | 4 Ore, 2 Wood | Baseline defense offhand |
| `lockpick` | Lockpick | Band 1 | 0 | **0** | 1 Ore | Essential dungeon utility |
| `fishing_rod` | Fishing Rod | Band 1 | 0 | **0** | 3 Wood, 1 Bowstring | Essential gathering tool |
| `smelt_broken_lockbox` | Smelt Lockbox | Band 1/2 | 0 | **0** | 1 Broken Lockbox | Scrap conversion |
| `longsword_1h` | Iron Longsword | Band 1 | 0 | **1** | 4 Ore, 2 Wood | Standard military 1H blade (7 dmg) |
| `spear` | Iron Spear (1H) | Band 1 | 0 | **1** | 4 Ore, 3 Wood | Standard 1H thrust weapon (7 dmg) |
| `crossbow` | Arbalest Crossbow | Band 1 | 0 | **1** | 5 Ore, 3 Wood | Heavy mechanical ranged (9 dmg) |
| `throwing_weapons` | Iron Throwing Knives | Band 1 | 0 | **1** | 3 Ore, 1 Wood | Starter ranged consumable weapon (4 dmg) |
| `katana` | Forged Katana | Band 1 | 0 | **2** | 5 Ore, 2 Wood | Advanced rapid bleed weapon (6 dmg, 25% bleed) |
| `longsword_2h` | Two-Handed Longsword | Band 1 | 0 | **2** | 7 Ore, 3 Wood | Heavy two-handed starter blade (12 dmg) |
| `spears_2h` | Two-Handed Spear | Band 1 | 0 | **2** | 7 Ore, 5 Wood | Heavy two-handed pike (12 dmg) |
| `greatsword` | Steel Greatsword | Band 2 | 0 | **5** | 8 Ore, 3 Wood, 2 Steel Scrap | Band 2 upgraded two-handed blade (16 dmg, 11.4 DPS) |
| `heavy_mace` | Heavy War Mace | Band 2 | 5 | **5** | 6 Ore, 3 Steel Scrap, 1 Heavy Hide | Band 2 upgraded mace (10 dmg, 20% stun) |
| `spiked_morningstar` | Spiked Morningstar | Band 3 | 10 | **8** | 8 Ore, 5 Steel Scrap, 2 Heavy Hide | Band 3 pinnacle mace (13 dmg, 25% stun) |

#### B. Armorsmithing (7 Recipes)
| Recipe ID | Item Name | Band | Current Req Lv | Proposed Req Lv | Ingredients | Rationale |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `leather_cap` | Leather Cap | Band 1 | 0 | **0** | 2 Wolf Pelt | Starter light headgear (+15 HP) |
| `leather_armor` | Leather Armor | Band 1 | 0 | **0** | 4 Wolf Pelt | Starter medium body armor (+25 HP) |
| `bone_necklace` | Bone Necklace | Band 1 | 1 | **1** | 3 Bone, 1 Bowstring | Starter defensive necklace (+20 HP) |
| `wolf_claw_ring` | Wolf Claw Ring | Band 1 | 2 | **2** | 2 Wolf Claw, 1 Bone | Starter offensive ring (+14 HP) |
| `silk_cowl` | Silk Cowl | Band 2 | 5 | **5** | 3 Spider Silk, 1 Wolf Pelt | Band 2 light headgear upgrade (+30 HP) |
| `venom_charm` | Venom Charm | Band 2 | 4 | **5** | 2 Spider Venom, 2 Spider Silk | Band 2 survival charm (+26 HP, +5kg carry) |
| `silk_robe` | Silk Robe | Band 2 | 5 | **6** | 5 Spider Silk, 2 Wolf Pelt | Band 2 premier robe (+50 HP) |

#### C. Bowyer (4 Recipes)
| Recipe ID | Item Name | Band | Current Req Lv | Proposed Req Lv | Ingredients | Rationale |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `quarterstaff` | Hardwood Quarterstaff | Band 1 | 0 | **0** | 5 Wood | Starter wooden stave (7 dmg) |
| `hunting_bow` | Hunting Bow | Band 1 | 0 | **0** | 4 Wood, 1 Bowstring | Starter ranged bow (6 dmg, range 4) |
| `composite_bow` | Composite Bow | Band 2 | 5 | **5** | 6 Wood, 2 Bone, 3 Spider Silk | Band 2 composite bow (9 dmg, range 4, 8.2 DPS) |
| `war_bow` | War Bow | Band 3 | 10 | **8** | 8 Wood, 2 Wolf Claw, 4 Spider Silk | Band 3 pinnacle heavy bow (13 dmg, range 5, 10.0 DPS) |

#### D. Alchemy (7 Recipes)
| Recipe ID | Item Name | Band | Current Req Lv | Proposed Req Lv | Ingredients | Rationale |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `bandage` | Bandage | Band 1 | *undefined* | **0** | 5 Wood | Basic emergency bleed cure |
| `antidote` | Antidote | Band 1 | *undefined* | **0** | 1 Wild Herbs | Basic emergency poison cure |
| `bone_meal` | Bone Meal | Band 1 | 0 | **0** | 1 Bone | Reagent for revive potion (yields 2) |
| `escape_stone` | Escape Stone | Band 1 | 0 | **0** | 1 Wood | Emergency retreat rune |
| `energy_potion` | Energy Potion | Band 1 | *undefined* | **1** | 2 Wild Herbs, 2 Wood | Basic stamina rejuvenation |
| `mana_potion` | Mana Potion | Band 1 | *undefined* | **2** | 2 Wild Herbs, 1 Ectoplasm | Mana restoration (gated by Skeleton ectoplasm) |
| `revive_potion` | Revive Potion | Band 1 | 0 | **3** | 2 Bone Meal, 1 Wild Herbs | Powerful party revive consumable |

---

### 2.3 Apprentice Crafting Classes Status in `data/classes.json`

Currently in `data/classes.json`:
- ✅ `apprentice_armorer`: Present (Requires Armorsmithing Lv 10). Grants `resilience: 0.05`.
- ✅ `apprentice_bowyer`: Present (Requires Bowyer Lv 10).
- ❌ `apprentice_smith`: **Missing**. Should require Blacksmithing Lv 10.
- ❌ `apprentice_alchemist`: **Missing**. Should require Alchemy Lv 10.

#### Proposed Class Definitions for Missing Apprentice Ranks:
```json
{
  "id": "apprentice_smith",
  "name": "Apprentice Smith",
  "tier": "novice",
  "requirements": [
    { "type": "proficiency", "target": "blacksmithing", "value": 10 }
  ],
  "fantasy": "Pounding raw iron and salvaged alloys into balanced instruments of war"
},
{
  "id": "apprentice_alchemist",
  "name": "Apprentice Alchemist",
  "tier": "novice",
  "requirements": [
    { "type": "proficiency", "target": "alchemy", "value": 10 }
  ],
  "fantasy": "Distilling essences, herbs, and bone dust into restorative elixirs"
}
```

---

## 3. Plan for Implementation (Once Approved)

1. **Step 1: Data Alignment**
   - Update `data/blacksmithRecipes.json` with proposed `requiredLevel` values (notably `greatsword: 5`, `spiked_morningstar: 8`, tier 0-2 distribution).
   - Update `data/armorsmithRecipes.json` with proposed `requiredLevel` values (`silk_robe: 6`, `venom_charm: 5`).
   - Update `data/bowyerRecipes.json` with proposed `requiredLevel` values (`war_bow: 8`).
   - Update `data/alchemyRecipes.json` to explicitly define `requiredLevel: 0, 1, 2, 3`.
   - Update `data/classes.json` with `apprentice_smith` and `apprentice_alchemist`.
2. **Step 2: UI & System Verification**
   - Verify station modals (Blacksmith, Armorsmith, Bowyer, Alchemy) properly display level requirements and locked status badges.
   - Verify class progression engine detects when a player hits level 10 in any of the 4 crafts and awards the Apprentice title.
3. **Step 3: Test Suite Updates**
   - Update any tests that assert recipe level values to match the approved ladder.
   - Run `scripts/verify_floor_band_segmentation.ts` and `npm run build`.

---

## 4. Director Decision Points Requested

1. **Morningstar & War Bow Level:**
   - *Option A (Recommended):* Level 8. Allows crafting while actively conquering Band 3 (Floors 6–10).
   - *Option B:* Level 10. Functions as the pinnacle milestone capstone for the Apprentice rank.
2. **Venom Charm & Silk Robe Separation:**
   - *Option A (Recommended):* Venom Charm Lv 5, Silk Robe Lv 6. Staggers the two major Band 2 survival upgrades.
   - *Option B:* Both at Level 5. Available simultaneously upon unlocking Band 2 silk/venom crafting.
