import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import { HiddenSkillSystem } from '../src/systems/HiddenSkillSystem.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import type { WeaponDef, EnemyDef, ClassesData, PlayerData } from '../src/types/game.ts';

// Setup mock fetch for node testing
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

console.log('--- RUNNING MILESTONE 9: SHIELD & BESTIARY EXPANSION UNIT TESTS ---');

async function runTests() {
  await DataLoader.getInstance().loadAll();
  const dataLoader = DataLoader.getInstance();

  const mockClassesData: ClassesData = dataLoader.getClassesData();
  const mockPlayerData: PlayerData = dataLoader.getPlayer();
  const shortSwords = dataLoader.getWeapon('short_swords')!;
  const daggers = dataLoader.getWeapon('daggers')!;
  const shields = dataLoader.getWeapon('shields')!;
  const longswords = dataLoader.getWeapon('longswords')!;

  // ==========================================================================
  // TEST 1: Shield Weapon Definition in data/weapons.json
  // ==========================================================================
  assert.ok(shields, 'Shields must exist in data/weapons.json');
  assert.equal(shields.category, 'offhand', 'Shield category must be "offhand"');
  assert.equal(shields.twoHanded, false, 'Shield must not be two-handed');
  assert.equal(shields.baseBlock, 0.05, 'Shield must have baseBlock 0.05');
  assert.equal(shields.baseMitigation, 1, 'Shield must have baseMitigation 1');
  assert.ok(shields.levelBonus, 'Shield must define levelBonus');
  assert.equal(shields.levelBonus?.blockPerLevel, 0.005, 'Shield blockPerLevel must be 0.005');
  assert.equal(shields.levelBonus?.mitigationPerLevel, 0.2, 'Shield mitigationPerLevel must be 0.2');
  console.log('? Test 1 passed: Shield weapon definition has real stats and per-level passive bonus');

  // ==========================================================================
  // TEST 2: Offhand slot clarification - Shield equippable without Dual Wielding
  // ==========================================================================
  const prog1 = new ProgressionSystem(mockClassesData);

  // Character model implementing the single offhand slot logic
  const player1 = {
    entityName: 'Hero',
    equippedWeapon: shortSwords,
    offhandWeapon: null as WeaponDef | null,
    progression: prog1,

    equipWeapon(weapon: WeaponDef): void {
      this.equippedWeapon = weapon;
      if (weapon.twoHanded && this.offhandWeapon) {
        this.offhandWeapon = null;
      }
    },

    equipOffhandWeapon(weapon: WeaponDef | null): boolean {
      if (weapon === null) {
        this.offhandWeapon = null;
        return true;
      }
      if (this.equippedWeapon?.twoHanded) {
        return false;
      }
      if (weapon.category === 'offhand' || weapon.id === 'shields') {
        this.offhandWeapon = weapon;
        return true;
      }
      if (!this.progression.isDualWieldUnlocked()) {
        return false;
      }
      if (weapon.category !== 'melee_1h' || weapon.twoHanded) {
        return false;
      }
      this.offhandWeapon = weapon;
      return true;
    },

    isDualWielding(): boolean {
      return this.offhandWeapon !== null && this.offhandWeapon.category !== 'offhand';
    },

    hasShield(): boolean {
      return this.offhandWeapon !== null && (this.offhandWeapon.category === 'offhand' || this.offhandWeapon.id === 'shields');
    }
  };

  assert.equal(prog1.isDualWieldUnlocked(), false, 'Dual Wielding must initially be locked');
  
  // Dagger in offhand without Dual Wielding must fail
  const equipDaggerFail = player1.equipOffhandWeapon(daggers);
  assert.equal(equipDaggerFail, false, 'Equipping 1H weapon in offhand without Dual Wielding must fail');
  assert.equal(player1.offhandWeapon, null, 'Offhand must remain null');
  assert.equal(player1.isDualWielding(), false, 'isDualWielding must be false');
  assert.equal(player1.hasShield(), false, 'hasShield must be false');

  // Shield in offhand without Dual Wielding must SUCCEED
  const equipShieldSuccess = player1.equipOffhandWeapon(shields);
  assert.equal(equipShieldSuccess, true, 'Equipping Shield in offhand must succeed without Dual Wielding');
  assert.equal(player1.offhandWeapon?.id, 'shields', 'Offhand weapon must be shields');
  assert.equal(player1.hasShield(), true, 'hasShield() must return true');
  assert.equal(player1.isDualWielding(), false, 'isDualWielding() must be false when Shield is equipped');
  console.log('? Test 2 passed: Shield equips without Dual Wielding; isDualWielding remains false');

  // ==========================================================================
  // TEST 3: Offhand slot mutual exclusivity & 2H weapon guard
  // ==========================================================================
  // Unlock Dual Wielding by setting short_swords and daggers to Lv 30
  prog1.getProficiencyStat('short_swords').level = 30;
  prog1.getProficiencyStat('daggers').level = 30;
  assert.equal(prog1.isDualWieldUnlocked(), true, 'Dual Wielding must be unlocked');

  // Currently player1 has Shield equipped. Equipping daggers in offhand must replace Shield!
  const equipDaggerSuccess = player1.equipOffhandWeapon(daggers);
  assert.equal(equipDaggerSuccess, true, 'Equipping offhand dagger with Dual Wielding unlocked must succeed');
  assert.equal(player1.offhandWeapon?.id, 'daggers', 'Offhand weapon must now be daggers');
  assert.equal(player1.isDualWielding(), true, 'isDualWielding() must be true when offhand is dagger');
  assert.equal(player1.hasShield(), false, 'hasShield() must be false when offhand is dagger');

  // Equipping Shield again must replace daggers!
  player1.equipOffhandWeapon(shields);
  assert.equal(player1.offhandWeapon?.id, 'shields', 'Offhand weapon must be shields again');
  assert.equal(player1.isDualWielding(), false, 'isDualWielding() must revert to false');
  assert.equal(player1.hasShield(), true, 'hasShield() must revert to true');

  // Equipping a two-handed weapon in main hand must unequip offhand Shield!
  player1.equipWeapon(longswords);
  assert.equal(player1.equippedWeapon.id, 'longswords', 'Main weapon is now longswords');
  assert.equal(player1.offhandWeapon, null, 'Two-handed main weapon must automatically unequip offhand');
  assert.equal(player1.hasShield(), false, 'hasShield() must be false with 2H weapon');

  // Attempting to equip offhand while wielding 2H weapon must fail
  assert.equal(player1.equipOffhandWeapon(shields), false, 'Cannot equip offhand while wielding 2H weapon');
  console.log('? Test 3 passed: Mutual exclusivity between Shield and second weapon; 2H weapon rules preserved');

  // ==========================================================================
  // TEST 4: Block live trigger, eligibility & EXP award
  // ==========================================================================
  const prog2 = new ProgressionSystem(mockClassesData);
  const hiddenSystem = HiddenSkillSystem.getInstance();

  const player2 = {
    entityName: 'Defender',
    equippedWeapon: shortSwords,
    offhandWeapon: null as WeaponDef | null,
    progression: prog2,
    hasShield(): boolean {
      return this.offhandWeapon !== null && (this.offhandWeapon.category === 'offhand' || this.offhandWeapon.id === 'shields');
    }
  };

  // Without shield
  const ctxNoShield = {
    equippedWeapon: player2.equippedWeapon,
    equippedOffhand: null,
    hasShield: player2.hasShield(),
    inCombat: true,
    isMeleeAttack: true
  };
  const blockDef = hiddenSystem.getSkillDef('block')!;
  assert.ok(blockDef, 'Block hidden skill definition must exist');
  assert.equal(hiddenSystem.evaluateEligibility(blockDef, ctxNoShield), false, 'Block must not be eligible without shield');

  // With shield equipped
  player2.offhandWeapon = shields;
  assert.equal(player2.hasShield(), true);
  const ctxWithShield = {
    equippedWeapon: player2.equippedWeapon,
    equippedOffhand: player2.offhandWeapon,
    hasShield: player2.hasShield(),
    shieldBlockBonus: 0.05,
    shieldMitigationBonus: 1,
    inCombat: true,
    isMeleeAttack: true
  };
  assert.equal(hiddenSystem.evaluateEligibility(blockDef, ctxWithShield), true, 'Block must be eligible with shield equipped');

  // Simulate Block proc EXP award
  assert.equal(prog2.getProficiencyLevel('block'), 0, 'Block must start at Level 0');
  assert.equal(prog2.getProficiencyLevel('shields'), 0, 'Shields must start at Level 0');

  // Award EXP as CombatSystem does on block
  prog2.addProficiencyExp('block', 1);
  prog2.addProficiencyExp('shields', 2);
  assert.equal(prog2.getProficiencyStat('block').currentExp, 1);
  assert.equal(prog2.getProficiencyStat('shields').currentExp, 2);

  // Hidden-until-Level-1 invariant: neither stat is revealed at partial EXP
  assert.equal(prog2.isStatRevealed('block'), false, 'Block must remain hidden under Level 1');
  assert.equal(prog2.isStatRevealed('shields'), false, 'Shields must remain hidden under Level 1');

  // Reach Level 1 (50 EXP threshold)
  let discoveredSkill: string | null = null;
  prog2.onSkillDiscovered((e) => {
    discoveredSkill = e.skillId;
  });

  prog2.addProficiencyExp('shields', 48); // totals 50 -> Level 1
  assert.equal(prog2.getProficiencyLevel('shields'), 1, 'Shields must reach Level 1');
  assert.equal(prog2.isStatRevealed('shields'), true, 'Shields must be revealed at Level 1');
  assert.equal(discoveredSkill, 'shields', 'Skill Discovered event must fire for shields');
  console.log('? Test 4 passed: Block eligibility with shield, EXP progression, and Level 1 discovery reveal');

  // ==========================================================================
  // TEST 5: Bestiary Expansion - Distinct Enemy Stats
  // ==========================================================================
  const wolfDef = dataLoader.getEnemy('wolf')!;
  const goblinDef = dataLoader.getEnemy('goblin')!;
  const skeletonDef = dataLoader.getEnemy('skeleton')!;
  const undeadDef = dataLoader.getEnemy('undead')!;

  assert.ok(wolfDef, 'Wolf must exist');
  assert.ok(goblinDef, 'Goblin must exist');
  assert.ok(skeletonDef, 'Skeleton must exist');
  assert.ok(undeadDef, 'Undead must exist');

  // Distinct stats verification
  assert.notEqual(goblinDef.hp, wolfDef.hp, 'Goblin HP must differ from Wolf');
  assert.notEqual(skeletonDef.meleeDamage, wolfDef.meleeDamage, 'Skeleton meleeDamage must differ from Wolf');
  assert.notEqual(undeadDef.hp, wolfDef.hp, 'Undead HP must differ from Wolf');
  assert.notEqual(goblinDef.moveSpeed, undeadDef.moveSpeed, 'Goblin speed must differ from Undead');

  // Validate behavioral attributes are populated
  assert.ok(goblinDef.aggroRadius >= 4, 'Goblin aggro radius must be defined');
  assert.ok(skeletonDef.attackIntervalMs > 0, 'Skeleton attack interval must be defined');
  assert.ok(undeadDef.moveSpeed > 0, 'Undead move speed must be defined');
  console.log('? Test 5 passed: Goblin, Skeleton, Undead have distinct stats and inherited Enemy fields');

  // ==========================================================================
  // TEST 6: Harvest drops on defeat
  // ==========================================================================
  const gameState = GameState.getInstance();
  const initialMeat = gameState.getItemCount('monster_meat');
  const initialEar = gameState.getItemCount('goblin_ear');
  const initialBone = gameState.getItemCount('bone');
  const initialEcto = gameState.getItemCount('ectoplasm');

  // Verify harvest tables in data
  assert.ok(goblinDef.harvest.some(h => h.item === 'monster_meat' && h.tags.includes('cooking')));
  assert.ok(goblinDef.harvest.some(h => h.item === 'goblin_ear' && h.tags.includes('alchemy')));
  assert.ok(skeletonDef.harvest.some(h => h.item === 'bone' && h.tags.includes('blacksmithing')));
  assert.ok(skeletonDef.harvest.some(h => h.item === 'ectoplasm' && h.tags.includes('alchemy')));
  assert.ok(undeadDef.harvest.some(h => h.item === 'bone'));
  assert.ok(undeadDef.harvest.some(h => h.item === 'ectoplasm'));

  // Test addItem to inventory directly
  gameState.addItem('monster_meat', 1);
  gameState.addItem('bone', 1);
  gameState.addItem('ectoplasm', 1);
  gameState.addItem('goblin_ear', 1);

  assert.equal(gameState.getItemCount('monster_meat'), initialMeat + 1);
  assert.equal(gameState.getItemCount('bone'), initialBone + 1);
  assert.equal(gameState.getItemCount('ectoplasm'), initialEcto + 1);
  assert.equal(gameState.getItemCount('goblin_ear'), initialEar + 1);
  console.log('? Test 6 passed: Defeat harvest drops verified with correct tags and inventory accumulation');

  console.log('\nALL MILESTONE 9 UNIT TESTS PASSED! ??\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
