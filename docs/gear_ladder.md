# Gear Ladder & Crafting Progression

> **Living Document:** Defines the equipment progression across dungeon floor bands, mapping enemy materials to craftable weapons, armor, and consumables. Keep this document updated whenever enemies, drops, or recipes change.

---

## 1. Overview & Band Structure

The game segments equipment crafting into **Floor Bands**, matching dungeon depth to economic progression:
- **Band 1 — Ancient Crypts (Floors 1–2):** 100% Core. Starter economy: wood, ore, bone, pelts, and bowstrings. Supplies the full tier-0 iron and leather gear ladder.
- **Band 2 — Abyssal Depths (Floors 3–5):** 70% Core / 30% Carry-over. Introduces subterranean Spider Silk, Venom, and Elite Orc materials (Steel Scrap, Heavy Hide).
- **Band 3 — Infernal Caldera (Floors 6–10):** 70% Core / 30% Carry-over. Introduces Epic Void Knight materials (Void Plate, Void Essence, Void Core) and pinnacle tier-1 weapons.
- **Band 4 — Glacial Caverns (Floors 11+):** 70% Core / 30% Carry-over. Introduces Boss Glacial materials (Rime Carapace, Glacial Core/Essence).

---

## 2. Floor-Band Gear Ladder

| Band / Floors | Region Name | Enemies Present | Key Materials Introduced | Craftable Weapons & Power | Craftable Armor & Power | Craftable Consumables & Tools | Recipe Levels | Content Gaps & Level Mismatches |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **Band 1**<br>(Floors 1–2) | Ancient Crypts | **Core:** Wolf, Skeleton, Goblin, Goblin Archer, Slime.<br>**Elite / Epic:** None.<br>**Boss:** None. | • `ore`<br>• `wood`<br>• `wild_herbs`<br>• `bone`<br>• `wolf_pelt`<br>• `wolf_claw`<br>• `wolf_meat`<br>• `monster_meat`<br>• `ectoplasm`<br>• `slime_gel`<br>• `bowstring`<br>• `feather` | • **Iron Shortsword:** 5 base dmg<br>• **Iron Longsword:** 7 base dmg<br>• **Forged Katana:** 6 base dmg (25% bleed)<br>• **Iron Mace:** 7 base dmg (15% stun)<br>• **Iron Spear:** 7 base dmg<br>• **Iron Daggers:** 3 base dmg (20% bleed)<br>• **Hunting Bow:** 6 base dmg (range 4)<br>• **Hardwood Quarterstaff:** 7 base dmg<br>• **Arbalest Crossbow:** 9 base dmg (range 4)<br>• **Iron Throwing Knives:** 4 base dmg (range 3)<br>• **Two-Handed Longsword:** 12 base dmg<br>• **Two-Handed Spear:** 12 base dmg<br>• **Iron Shield:** 5% block, 1 mit | • **Leather Cap:** +15 HP (+8 Main / +7 Crit)<br>• **Leather Armor:** +25 HP (+13 Main / +12 Crit)<br>• **Bone Necklace:** +20 HP (+10 Main / +10 Crit)<br>• **Wolf Claw Ring:** +14 HP (+7 Main / +7 Crit) | • **Lockpick** (1 ore)<br>• **Fishing Rod** (3 wood, 1 bowstring)<br>• **Bandage** (cleanses bleed)<br>• **Antidote** (cleanses poison)<br>• **Energy Potion** (+35 EN, +2 EN/s)<br>• **Mana Potion** (+35 MP, +2 MP/s)<br>• **Revive Potion** (revives to 50% HP)<br>• **Escape Stone** (safe retreat) | Blacksmith 0<br>Armorsmith 0, 1, 2<br>Bowyer 0<br>Alchemy 0 | • *Gap:* Planned Health Potion (Wild Herbs) lacks recipe definition.<br>• *Gap:* No arrow crafting system (bows fire without ammunition). |
| **Band 2**<br>(Floors 3–5) | Abyssal Depths | **Core:** Giant Spider, Undead.<br>**Carry:** Skeleton, Goblin Archer, Wolf.<br>**Elite:** Orc Warrior.<br>**Boss:** Abyssal Colossus. | • `spider_silk`<br>• `spider_venom`<br>• `steel_scrap`<br>• `orc_heavy_hide`<br>• `orc_emblem`<br>• `colossus_core`<br>• `abyssal_ingot`<br>• `dread_essence`<br>• `heart_of_the_colossus` | • **Heavy War Mace:** 10 base dmg (20% stun)<br>• **Composite Bow:** 9 base dmg (range 4)<br>• **Steel Greatsword:** 16 base dmg (1400ms, 2 steel scrap) | • **Silk Cowl:** +30 HP (+15 Main / +15 Crit)<br>• **Silk Robe:** +50 HP (+25 Main / +25 Crit)<br>• **Venom Charm:** +26 HP (+13 Main / +13 Crit), +5kg carry | *Smelt Broken Lockbox* (recovers 2 steel scrap) | Blacksmith 0, 5<br>Armorsmith 4, 5<br>Bowyer 5 | • *Mismatch:* `heavy_mace` (lvl 5) & `greatsword` (lvl 0) require Band 2 Orc Steel Scrap; levels await Crafting Mastery rebalancing.<br>• *Gap:* Boss materials (`colossus_core`, `abyssal_ingot`) lack gear recipes. |
| **Band 3**<br>(Floors 6–10) | Infernal Caldera | **Core:** Skeleton Archer, Giant Spider *(stand-in)*.<br>**Carry:** Undead, Goblin Archer.<br>**Elite:** Orc Warrior.<br>**Epic:** Void Knight.<br>**Boss:** Abyssal Colossus. | • `void_plate`<br>• `void_essence`<br>• `void_core` | • **Spiked Morningstar:** 13 base dmg (25% stun)<br>• **War Bow:** 13 base dmg (range 5) | *Trophy materials acquired for future master crafting* | *Trophy materials acquired for future master crafting* | Blacksmith 10<br>Bowyer 10 | • *Gap:* No caldera-specific common monsters in game data (reuses archer/spider).<br>• *Gap:* `void_plate` and `void_core` have no recipes in Blacksmithing or Armorsmithing.<br>• *Mismatch:* Morningstar and War Bow require level 10. |
| **Band 4**<br>(Floors 11+) | Glacial Caverns | **Core:** Undead, Skeleton Archer *(stand-ins)*.<br>**Carry:** Giant Spider, Skeleton.<br>**Elite:** Orc Warrior.<br>**Epic:** Void Knight.<br>**Boss:** Glacial Sovereign. | • `glacial_core`<br>• `rime_carapace`<br>• `glacial_essence`<br>• `eye_of_the_sovereign` | *Trophy materials acquired for future master crafting* | *Trophy materials acquired for future master crafting* | *Trophy materials acquired for future master crafting* | Future Tiers (30/60/90) | • *Gap:* No glacial-specific common monsters in game data.<br>• *Gap:* `rime_carapace` and `glacial_core` have no recipes. |

---

## 3. Weapon Families Ladder & Content Gaps

Every weapon family begins with a Band 1 "iron" tier. Deeper bands reinforce specific families with steel scrap, spider silk, and heavy hides.

| Weapon Family | Band 1 (Iron / Timber Rung) | Band 2 (Steel / Silk / Hide Rung) | Band 3 (Morningstar / War Rung) | Status / Content Gap |
| :--- | :--- | :--- | :--- | :--- |
| **1H Swords** | • **Iron Shortsword** (5 dmg, 1000ms)<br>• **Iron Longsword** (7 dmg, 1100ms)<br>• **Forged Katana** (6 dmg, 900ms, 25% bleed) | *GAP: No Steel 1H Sword* | *GAP: No Void / Master 1H Sword* | **Gap:** 1H Sword family has no Band 2 or Band 3 progression recipe. |
| **2H Swords** | • **Two-Handed Longsword** (12 dmg, 1300ms) | • **Steel Greatsword** (16 dmg, 1400ms, +2 steel scrap) | *GAP: No Void Greatsword* | **Gap:** Band 3 two-handed blade missing. |
| **Maces** | • **Iron Mace** (7 dmg, 1300ms, 15% stun) | • **Heavy War Mace** (10 dmg, 1400ms, 20% stun) | • **Spiked Morningstar** (13 dmg, 1500ms, 25% stun) | **Complete:** Full 3-rung ladder present in data. |
| **Bows** | • **Hunting Bow** (6 dmg, 1200ms, range 4) | • **Composite Bow** (9 dmg, 1100ms, range 4) | • **War Bow** (13 dmg, 1300ms, range 5) | **Complete:** Full 3-rung ladder present in data. |
| **Spears** | • **Iron Spear (1H)** (7 dmg, 1100ms)<br>• **Two-Handed Spear (2H)** (12 dmg, 1300ms) | *GAP: No Steel Spear / Pike* | *GAP: No Void Halberd / Lance* | **Gap:** Spear family has no Band 2 or Band 3 upgrades. |
| **Daggers** | • **Iron Daggers** (3 dmg, 600ms, 20% bleed) | *GAP: No Steel / Serrated Daggers* | *GAP: No Void Assassin Daggers* | **Gap:** Daggers have no Band 2 or Band 3 upgrades. |
| **Crossbows** | • **Arbalest Crossbow** (9 dmg, 1500ms, range 4) | *GAP: No Heavy / Steel Crossbow* | *GAP: No Repeating / Void Crossbow* | **Gap:** Crossbow family lacks Band 2 and Band 3 rungs. |
| **Staves / Conduits** | • **Hardwood Quarterstaff** (7 dmg, 1300ms)<br>• **Magic Conduit Staves** (7 dmg, spells 7–10 dmg) | *GAP: No Reinforced / Silk Staves* | *GAP: No Void Conduit Staff* | **Gap:** Staves lack craftable rungs past Band 1. |
| **Shields** | • **Iron Shield** (5% block, 1 mit, 2 dmg) | *GAP: No Steel Reinforced Shield* | *GAP: No Void Tower Shield* | **Gap:** Shields have no craftable upgrades past Band 1. |
| **Throwing** | • **Iron Throwing Knives** (4 dmg, 800ms, range 3) | *GAP: No Steel Chakrams / Spikes* | *GAP: No Void Throwing Blades* | **Gap:** Throwing weapons lack craftable upgrades past Band 1. |

---

## 4. Armor Progression & Content Gaps

Armor follows a parallel ladder based on pelts, silk, and monster accessories:

| Slot / Category | Band 1 (Leather / Bone Rung) | Band 2 (Spider Silk / Venom Rung) | Band 3 (Plate / Void Rung) | Status / Content Gap |
| :--- | :--- | :--- | :--- | :--- |
| **Helmet (Light)** | • **Leather Cap** (+15 HP, 1.0kg) | • **Silk Cowl** (+30 HP, 1.0kg) | *GAP: No Void Hood / Mask* | Solid 2-rung progression; Band 3 missing. |
| **Body (Medium / Light)** | • **Leather Armor** (+25 HP, 5.0kg) | • **Silk Robe** (+50 HP, 3.0kg) | *GAP: No Void Armor / Hauberk* | Solid 2-rung progression; heavy armor rung missing. |
| **Necklace** | • **Bone Necklace** (+20 HP, 0.5kg) | *GAP: No Silk / Gem Talisman* | *GAP: No Void Pendant* | Accessible Band 1 defense talisman. |
| **Ring** | • **Wolf Claw Ring** (+14 HP, 0.2kg) | *GAP: No Venom / Steel Band* | *GAP: No Void Signet* | Early endurance ring. |
| **Accessory** | *GAP: No Band 1 general accessory* | • **Venom Charm** (+26 HP, +5kg cap) | *GAP: No Void Relic* | Valuable Band 2 survival and capacity ward. |

---

## 5. Level Mismatch Log *(For Crafting Mastery Milestone)*

As dictated by the owner, recipe levels remain at their original values during the Floor-Band Segmentation milestone:
1. `lockpick`: Level 0 (Band 1, 1 Ore).
2. `greatsword`: Level 0 (Band 2, 8 Ore + 3 Wood + 2 Steel Scrap). Mismatch: requires Band 2 drops despite being Level 0.
3. `heavy_mace`: Level 5 (Band 2, 6 Ore + 3 Steel Scrap + 1 Heavy Hide).
4. `spiked_morningstar`: Level 10 (Band 3, 8 Ore + 5 Steel Scrap + 2 Heavy Hide).
5. `hunting_bow`: Level 0 (Band 1, 4 Wood + 1 Bowstring).
6. `composite_bow`: Level 5 (Band 2, 6 Wood + 2 Bone + 3 Spider Silk).
7. `war_bow`: Level 10 (Band 3, 8 Wood + 2 Wolf Claw + 4 Spider Silk).
8. `silk_cowl` & `silk_robe`: Level 5 (Band 2, Spider Silk + Wolf Pelt).
9. `bone_necklace`: Level 1 (Band 1, 3 Bone + 1 Bowstring).
10. `venom_charm`: Level 4 (Band 2, 2 Spider Venom + 2 Spider Silk).
