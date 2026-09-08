import type { Player } from '../entities/Player.ts';
import { ProgressionSystem } from '../systems/ProgressionSystem.ts';
import type { ClassDef, HiddenSkillDef, TrainableStat, FoodQuality } from '../types/game.ts';
import { DataLoader } from '../utils/DataLoader.ts';
import { GameState } from '../systems/GameState.ts';
import { BuildingSystem } from '../systems/BuildingSystem.ts';
import { LevelingSystem } from '../systems/LevelingSystem.ts';
import { ResearchSystem } from '../systems/ResearchSystem.ts';

export class HUD {
  private playerHpEl: HTMLElement | null;
  private playerCritHpEl: HTMLElement | null;
  private playerEnergyEl: HTMLElement | null;
  private weaponEl: HTMLElement | null;
  private hudProficiencyRowEl: HTMLElement | null;
  private hudProficiencyLabelEl: HTMLElement | null;
  private profEl: HTMLElement | null;
  private hudConstructionRowEl: HTMLElement | null;
  private constructionProfEl: HTMLElement | null;
  private hudAlchemyRowEl: HTMLElement | null;
  private alchemyProfTextEl: HTMLElement | null;
  private hudBandageRowEl: HTMLElement | null;
  private playerBandageTextEl: HTMLElement | null;
  private hudApplyBandageBtn: HTMLElement | null;
  private discoveredSkillsSectionEl: HTMLElement | null;
  private discoveredSkillsListEl: HTMLElement | null;
  private skillDiscoveredModalEl: HTMLElement | null;
  private discoveredSkillNameEl: HTMLElement | null;
  private discoveredSkillDescEl: HTMLElement | null;
  private playerStatusEl: HTMLElement | null;
  private locationBadgeEl: HTMLElement | null;
  private roomBadgeEl: HTMLElement | null;
  private hudSkillsListEl: HTMLElement | null;
  private outpostControlsEl: HTMLElement | null;
  private openLoadoutBtn: HTMLElement | null;
  private closeLoadoutBtn: HTMLElement | null;
  private loadoutModalEl: HTMLElement | null;
  private equipSlotsContainerEl: HTMLElement | null;
  private knownSkillsContainerEl: HTMLElement | null;
  private slotsCountBadgeEl: HTMLElement | null;
  private unlockModalEl: HTMLElement | null;
  private classNameEl: HTMLElement | null;
  private classFantasyEl: HTMLElement | null;
  private downedBannerEl: HTMLElement | null;
  private hudCardEl: HTMLElement | null;
  private hudWoodRowEl: HTMLElement | null;
  private playerWoodEl: HTMLElement | null;
  private toggleBuildBtn: HTMLElement | null;
  private buildOverlayEl: HTMLElement | null;
  private buildOverlayWoodEl: HTMLElement | null;
  private buildTierBadgeEl: HTMLElement | null;
  private buildRotationBadgeEl: HTMLElement | null;
  private exitBuildBtn: HTMLElement | null;
  private buildPaletteContainerEl: HTMLElement | null;
  private buildFeedbackToastEl: HTMLElement | null;
  private toastTimer: any = null;
  private static isHudCardVisible: boolean = true;
  private renderedSkillsKey: string = '';
  private debugSkillsPanelEl: HTMLElement | null;
  private debugSkillsListEl: HTMLElement | null;
  private static isDebugSkillsVisible: boolean = false;
  private renderedDebugSkillsKey: string = '';

  // Milestone 6 Modal Elements
  private researchTreeModalEl: HTMLElement | null;
  private closeResearchBtn: HTMLElement | null;
  private researchPointsCountEl: HTMLElement | null;
  private researchNodesContainerEl: HTMLElement | null;
  private alchemyModalEl: HTMLElement | null;
  private closeAlchemyBtn: HTMLElement | null;
  private alchemyModalProfEl: HTMLElement | null;
  private alchemyModalWoodEl: HTMLElement | null;
  private alchemyModalBandagesEl: HTMLElement | null;
  private alchemyRecipesContainerEl: HTMLElement | null;
  private alchemyPlayerStatusEl: HTMLElement | null;
  private alchemyApplyBandageBtn: HTMLElement | null;

  // Milestone 6 Debug Buttons
  private debugBtnPowerStrike: HTMLElement | null;
  private debugBtnThrust: HTMLElement | null;
  private debugBtnGrantRP: HTMLElement | null;
  private debugBtnBleedSelf: HTMLElement | null;
  private debugBtnGrantBandage: HTMLElement | null;

  // Milestone 7 Elements (Day, Hunger, Mood, Rations & Debug)
  private dayClockBadgeEl: HTMLElement | null;
  private playerHungerTextEl: HTMLElement | null;
  private playerMoodTextEl: HTMLElement | null;
  private hudRationRowEl: HTMLElement | null;
  private playerRationTextEl: HTMLElement | null;
  private hudEatRationBtn: HTMLElement | null;
  private debugBtnAdvanceDay: HTMLElement | null;
  private debugBtnGrantRation: HTMLElement | null;
  private debugBtnCycleHunger: HTMLElement | null;
  private debugBtnCycleMood: HTMLElement | null;
  private alchemyMoodValueEl: HTMLElement | null;
  private alchemyMoodEffectEl: HTMLElement | null;

  // Milestone 8 Elements (Party Overview & Dual Wielding)
  private partyOverviewModalEl: HTMLElement | null;
  private closePartyBtn: HTMLElement | null;
  private partySpawnCompanionBtn: HTMLElement | null;
  private partyOverviewRosterEl: HTMLElement | null;
  private openPartyBtn: HTMLElement | null;
  private currentParty: Player[] = [];
  private renderedPartyRosterKey: string = '';
  private lastPartyStatsUpdateTime: number = 0;

  // Milestone 8 Debug Buttons
  private debugBtnSpawnCompanion: HTMLElement | null;
  private debugBtnLv30SwordsDaggers: HTMLElement | null;
  private debugBtnGrantDaggersExp: HTMLElement | null;
  private debugBtnGrantDualWieldExp: HTMLElement | null;

  // Milestone 10 Modal Elements (Cooking Station)
  private cookingModalEl: HTMLElement | null;
  private closeCookingBtn: HTMLElement | null;
  private cookingModalProfEl: HTMLElement | null;
  private cookingStockpileHerbsEl: HTMLElement | null;
  private cookingStockpileMonsterMeatEl: HTMLElement | null;
  private cookingStockpileWolfMeatEl: HTMLElement | null;
  private cookingExpSlot1El: HTMLSelectElement | null;
  private cookingExpSlot2El: HTMLSelectElement | null;
  private cookingExperimentBtn: HTMLElement | null;
  private cookingExpStatusEl: HTMLElement | null;
  private cookingRecipesContainerEl: HTMLElement | null;
  private cookingDishesContainerEl: HTMLElement | null;

  private static activeInstance: HUD | null = null;
  private static hasGlobalListeners: boolean = false;

  private isOutpost: boolean = false;
  private currentPlayer: Player | null = null;
  private currentProgression: ProgressionSystem | null = null;
  private onBuildModeToggleCallback?: () => void;
  private onSelectBuildableCallback?: (id: string) => void;
  private lastBandageApplyTime: number = 0;
  private hasSeenBandages: boolean = false;

  constructor() {
    this.hudCardEl = document.getElementById('hud-card');
    this.playerHpEl = document.getElementById('player-hp-text');
    this.playerCritHpEl = document.getElementById('player-crit-hp-text');
    this.playerEnergyEl = document.getElementById('player-energy-text');
    this.weaponEl = document.getElementById('equipped-weapon-text');
    this.hudProficiencyRowEl = document.getElementById('hud-proficiency-row');
    this.hudProficiencyLabelEl = document.getElementById('proficiency-label');
    this.profEl = document.getElementById('proficiency-text');
    this.hudConstructionRowEl = document.getElementById('hud-construction-row');
    this.constructionProfEl = document.getElementById('construction-prof-text');
    this.discoveredSkillsSectionEl = document.getElementById('hud-discovered-skills-section');
    this.discoveredSkillsListEl = document.getElementById('hud-discovered-skills-list');
    this.skillDiscoveredModalEl = document.getElementById('skill-discovered-modal');
    this.discoveredSkillNameEl = document.getElementById('discovered-skill-name');
    this.discoveredSkillDescEl = document.getElementById('discovered-skill-desc');
    this.playerStatusEl = document.getElementById('player-status-text');
    this.hudWoodRowEl = document.getElementById('hud-wood-row');
    this.playerWoodEl = document.getElementById('player-wood-text');
    this.locationBadgeEl = document.getElementById('location-badge');
    this.roomBadgeEl = document.getElementById('room-badge');
    this.hudSkillsListEl = document.getElementById('hud-skills-list');
    this.outpostControlsEl = document.getElementById('outpost-controls');
    this.openLoadoutBtn = document.getElementById('open-loadout-btn');
    this.toggleBuildBtn = document.getElementById('toggle-build-btn');
    this.closeLoadoutBtn = document.getElementById('close-loadout-btn');
    this.loadoutModalEl = document.getElementById('skill-loadout-modal');
    this.equipSlotsContainerEl = document.getElementById('equip-slots-container');
    this.knownSkillsContainerEl = document.getElementById('known-skills-container');
    this.slotsCountBadgeEl = document.getElementById('slots-count-badge');
    this.unlockModalEl = document.getElementById('unlock-modal');
    this.classNameEl = document.getElementById('unlocked-class-name');
    this.classFantasyEl = document.getElementById('unlocked-class-fantasy');
    this.downedBannerEl = document.getElementById('downed-banner');
    this.buildOverlayEl = document.getElementById('build-mode-overlay');
    this.buildOverlayWoodEl = document.getElementById('build-overlay-wood');
    this.buildTierBadgeEl = document.getElementById('build-tier-badge');
    this.buildRotationBadgeEl = document.getElementById('build-rotation-badge');
    this.exitBuildBtn = document.getElementById('exit-build-btn');
    this.buildPaletteContainerEl = document.getElementById('build-palette-container');
    this.buildFeedbackToastEl = document.getElementById('build-feedback-toast');
    this.debugSkillsPanelEl = document.getElementById('debug-skills-panel');
    this.debugSkillsListEl = document.getElementById('debug-skills-list');

    this.hudAlchemyRowEl = document.getElementById('hud-alchemy-row');
    this.alchemyProfTextEl = document.getElementById('alchemy-prof-text');
    this.hudBandageRowEl = document.getElementById('hud-bandage-row');
    this.playerBandageTextEl = document.getElementById('player-bandage-text');
    this.hudApplyBandageBtn = document.getElementById('hud-apply-bandage-btn');

    this.researchTreeModalEl = document.getElementById('research-tree-modal');
    this.closeResearchBtn = document.getElementById('close-research-btn');
    this.researchPointsCountEl = document.getElementById('research-points-count');
    this.researchNodesContainerEl = document.getElementById('research-nodes-container');

    this.alchemyModalEl = document.getElementById('alchemy-modal');
    this.closeAlchemyBtn = document.getElementById('close-alchemy-btn');
    this.alchemyModalProfEl = document.getElementById('alchemy-modal-prof');
    this.alchemyModalWoodEl = document.getElementById('alchemy-modal-wood');
    this.alchemyModalBandagesEl = document.getElementById('alchemy-modal-bandages');
    this.alchemyRecipesContainerEl = document.getElementById('alchemy-recipes-container');
    this.alchemyPlayerStatusEl = document.getElementById('alchemy-player-status');
    this.alchemyApplyBandageBtn = document.getElementById('alchemy-apply-bandage-btn');

    this.debugBtnPowerStrike = document.getElementById('debug-btn-power-strike');
    this.debugBtnThrust = document.getElementById('debug-btn-thrust');
    this.debugBtnGrantRP = document.getElementById('debug-btn-grant-rp');
    this.debugBtnBleedSelf = document.getElementById('debug-btn-bleed-self');
    this.debugBtnGrantBandage = document.getElementById('debug-btn-grant-bandage');

    // Milestone 7 Elements
    this.dayClockBadgeEl = document.getElementById('day-clock-badge');
    this.playerHungerTextEl = document.getElementById('player-hunger-text');
    this.playerMoodTextEl = document.getElementById('player-mood-text');
    this.hudRationRowEl = document.getElementById('hud-ration-row');
    this.playerRationTextEl = document.getElementById('player-ration-text');
    this.hudEatRationBtn = document.getElementById('hud-eat-ration-btn');
    this.debugBtnAdvanceDay = document.getElementById('debug-btn-advance-day');
    this.debugBtnGrantRation = document.getElementById('debug-btn-grant-ration');
    this.debugBtnCycleHunger = document.getElementById('debug-btn-cycle-hunger');
    this.debugBtnCycleMood = document.getElementById('debug-btn-cycle-mood');
    this.alchemyMoodValueEl = document.getElementById('alchemy-mood-value');
    this.alchemyMoodEffectEl = document.getElementById('alchemy-mood-effect');

    // Milestone 8 Elements
    this.partyOverviewModalEl = document.getElementById('party-overview-modal');
    this.closePartyBtn = document.getElementById('close-party-btn');
    this.partySpawnCompanionBtn = document.getElementById('party-spawn-companion-btn');
    this.partyOverviewRosterEl = document.getElementById('party-overview-roster');
    this.openPartyBtn = document.getElementById('open-party-btn');

    this.debugBtnSpawnCompanion = document.getElementById('debug-btn-spawn-companion');
    this.debugBtnLv30SwordsDaggers = document.getElementById('debug-btn-lv30-swords-daggers');
    this.debugBtnGrantDaggersExp = document.getElementById('debug-btn-grant-daggers-exp');
    this.debugBtnGrantDualWieldExp = document.getElementById('debug-btn-grant-dual-wield-exp');

    // Milestone 10 Elements (Cooking Station)
    this.cookingModalEl = document.getElementById('cooking-modal');
    this.closeCookingBtn = document.getElementById('close-cooking-btn');
    this.cookingModalProfEl = document.getElementById('cooking-modal-prof');
    this.cookingStockpileHerbsEl = document.getElementById('cooking-stockpile-herbs');
    this.cookingStockpileMonsterMeatEl = document.getElementById('cooking-stockpile-monster-meat');
    this.cookingStockpileWolfMeatEl = document.getElementById('cooking-stockpile-wolf-meat');
    this.cookingExpSlot1El = document.getElementById('cooking-exp-slot1') as HTMLSelectElement | null;
    this.cookingExpSlot2El = document.getElementById('cooking-exp-slot2') as HTMLSelectElement | null;
    this.cookingExperimentBtn = document.getElementById('cooking-experiment-btn');
    this.cookingExpStatusEl = document.getElementById('cooking-exp-status');
    this.cookingRecipesContainerEl = document.getElementById('cooking-recipes-container');
    this.cookingDishesContainerEl = document.getElementById('cooking-dishes-container');

    if (this.hudCardEl) {
      this.hudCardEl.style.display = HUD.isHudCardVisible ? 'block' : 'none';
    }

    if (this.debugSkillsPanelEl) {
      if (HUD.isDebugSkillsVisible) {
        this.debugSkillsPanelEl.classList.add('active');
      } else {
        this.debugSkillsPanelEl.classList.remove('active');
      }
    }

    HUD.activeInstance = this;
    this.setupListeners();
  }

  private setupListeners(): void {
    if (this.openLoadoutBtn) {
      this.openLoadoutBtn.onclick = () => {
        const active = HUD.activeInstance;
        if (active && active.isOutpost && active.currentPlayer && active.currentProgression) {
          active.openLoadoutModal(active.currentPlayer, active.currentProgression);
        }
      };
    }

    if (this.closeLoadoutBtn) {
      this.closeLoadoutBtn.onclick = () => {
        HUD.activeInstance?.closeLoadoutModal();
      };
    }

    // Attach click handler for live dungeon combat HUD autocast toggle buttons
    if (this.hudSkillsListEl) {
      this.hudSkillsListEl.onclick = (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest<HTMLButtonElement>('[data-hud-skill]');
        const active = HUD.activeInstance;
        if (btn) {
          e.stopPropagation();
          const skillId = btn.getAttribute('data-hud-skill');
          if (!skillId || !active || !active.currentPlayer) return;

          const currentVal = active.currentPlayer.isAutocastEnabled(skillId);
          const newVal = !currentVal;
          active.currentPlayer.setAutocast(skillId, newVal);

          btn.className = `hud-autocast-btn ${newVal ? 'autocast-on' : 'autocast-off'}`;
          btn.innerText = newVal ? 'AUTO: ON' : 'AUTO: OFF';

          if (active.isLoadoutModalOpen() && active.currentProgression) {
            active.renderLoadoutModal(active.currentPlayer, active.currentProgression);
          }
          return;
        }

        // Clicking the row outside the AUTO toggle manually triggers the skill
        const row = target.closest<HTMLElement>('[data-skill-row]');
        if (row && active?.currentPlayer) {
          const skillId = row.getAttribute('data-skill-row');
          if (skillId) {
            active.currentPlayer.useSkill(skillId);
          }
        }
      };

      // Prevent clicks / drags on HUD buttons from triggering canvas movement
      this.hudSkillsListEl.onpointerdown = (e) => {
        e.stopPropagation();
      };
    }

    if (this.toggleBuildBtn) {
      this.toggleBuildBtn.onclick = () => {
        HUD.activeInstance?.onBuildModeToggleCallback?.();
      };
    }

    if (this.exitBuildBtn) {
      this.exitBuildBtn.onclick = () => {
        HUD.activeInstance?.onBuildModeToggleCallback?.();
      };
    }

    if (this.buildPaletteContainerEl) {
      this.buildPaletteContainerEl.onclick = (e) => {
        const target = e.target as HTMLElement;
        const item = target.closest<HTMLElement>('.palette-item');
        if (!item) return;
        const id = item.dataset.buildableId;
        if (id) {
          HUD.activeInstance?.onSelectBuildableCallback?.(id);
        }
      };
    }

    if (this.closeResearchBtn) {
      this.closeResearchBtn.onclick = () => {
        HUD.activeInstance?.closeResearchTreeModal();
      };
    }

    if (this.closeAlchemyBtn) {
      this.closeAlchemyBtn.onclick = () => {
        HUD.activeInstance?.closeAlchemyModal();
      };
    }

    if (this.closeCookingBtn) {
      this.closeCookingBtn.onclick = () => {
        HUD.activeInstance?.closeCookingModal();
      };
    }

    if (this.cookingExperimentBtn) {
      this.cookingExperimentBtn.onclick = () => {
        HUD.activeInstance?.handleCookingExperiment();
      };
    }

    if (this.alchemyApplyBandageBtn) {
      this.alchemyApplyBandageBtn.onclick = () => {
        HUD.activeInstance?.applyBandage();
      };
    }

    if (this.hudApplyBandageBtn) {
      this.hudApplyBandageBtn.onclick = () => {
        HUD.activeInstance?.applyBandage();
      };
    }

    // Debug Actions in Debug Panel
    if (this.debugBtnPowerStrike) {
      this.debugBtnPowerStrike.onclick = () => {
        HUD.activeInstance?.debugGrantSkillBook('book_power_strike');
      };
    }
    if (this.debugBtnThrust) {
      this.debugBtnThrust.onclick = () => {
        HUD.activeInstance?.debugGrantSkillBook('book_thrust');
      };
    }
    if (this.debugBtnGrantRP) {
      this.debugBtnGrantRP.onclick = () => {
        HUD.activeInstance?.debugGrantResearchPoints(10);
      };
    }
    if (this.debugBtnBleedSelf) {
      this.debugBtnBleedSelf.onclick = () => {
        HUD.activeInstance?.debugApplyBleed();
      };
    }
    if (this.debugBtnGrantBandage) {
      this.debugBtnGrantBandage.onclick = () => {
        HUD.activeInstance?.debugGrantBandage(1);
      };
    }

    // Milestone 7 Debug Actions
    if (this.debugBtnAdvanceDay) {
      this.debugBtnAdvanceDay.onclick = () => {
        HUD.activeInstance?.debugAdvanceDay(1);
      };
    }
    if (this.debugBtnGrantRation) {
      this.debugBtnGrantRation.onclick = () => {
        HUD.activeInstance?.debugGrantRation(1);
      };
    }
    if (this.debugBtnCycleHunger) {
      this.debugBtnCycleHunger.onclick = () => {
        HUD.activeInstance?.debugCycleHunger();
      };
    }
    if (this.debugBtnCycleMood) {
      this.debugBtnCycleMood.onclick = () => {
        HUD.activeInstance?.debugCycleMood();
      };
    }
    if (this.hudEatRationBtn) {
      this.hudEatRationBtn.onclick = () => {
        HUD.activeInstance?.eatRation();
      };
    }

    // Milestone 8 Party Overview & Debug Listeners
    if (this.openPartyBtn) {
      this.openPartyBtn.onclick = () => {
        HUD.activeInstance?.openPartyOverviewModal();
      };
    }
    if (this.closePartyBtn) {
      this.closePartyBtn.onclick = () => {
        HUD.activeInstance?.closePartyOverviewModal();
      };
    }
    if (this.partySpawnCompanionBtn) {
      this.partySpawnCompanionBtn.onclick = () => {
        (window as any).__spawnTestCompanion?.();
        HUD.activeInstance?.renderPartyOverviewModal();
      };
    }

    if (this.debugBtnSpawnCompanion) {
      this.debugBtnSpawnCompanion.onclick = () => {
        (window as any).__spawnTestCompanion?.();
        HUD.activeInstance?.renderPartyOverviewModal();
      };
    }
    if (this.debugBtnLv30SwordsDaggers) {
      this.debugBtnLv30SwordsDaggers.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          hero.progression.getProficiencyStat('short_swords').level = 30;
          hero.progression.getProficiencyStat('short_swords').currentExp = 0;
          hero.progression.getProficiencyStat('daggers').level = 30;
          hero.progression.getProficiencyStat('daggers').currentExp = 0;
          hero.progression.checkDualWieldUnlock();
          HUD.activeInstance?.showToast('⚔️ Set Hero Short Swords & Daggers to Lv30! Dual Wielding UNLOCKED!', 'success', 3500);
          if (HUD.activeInstance) {
            HUD.activeInstance.update(hero, hero.progression, 0, HUD.activeInstance.currentParty);
          }
        }
      };
    }
    if (this.debugBtnGrantDaggersExp) {
      this.debugBtnGrantDaggersExp.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          hero.progression.addProficiencyExp('daggers', 25);
          HUD.activeInstance?.showToast('+25 Daggers EXP (Hero)', 'success');
          if (HUD.activeInstance) {
            HUD.activeInstance.update(hero, hero.progression, 0, HUD.activeInstance.currentParty);
          }
        }
      };
    }
    if (this.debugBtnGrantDualWieldExp) {
      this.debugBtnGrantDualWieldExp.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          hero.progression.addProficiencyExp('dual_wielding', 25);
          HUD.activeInstance?.showToast('+25 Dual Wield EXP (Hero)', 'success');
          if (HUD.activeInstance) {
            HUD.activeInstance.update(hero, hero.progression, 0, HUD.activeInstance.currentParty);
          }
        }
      };
    }

    // Expose debug helpers globally on window for console testing
    (window as any).debugGrantSkillBook = (id: string = 'book_power_strike') => HUD.activeInstance?.debugGrantSkillBook(id);
    (window as any).debugGrantResearchPoints = (amount: number = 10) => HUD.activeInstance?.debugGrantResearchPoints(amount);
    (window as any).debugApplyBleed = () => HUD.activeInstance?.debugApplyBleed();
    (window as any).debugApplyBandage = () => HUD.activeInstance?.applyBandage();
    (window as any).debugAdvanceDay = (days: number = 1) => HUD.activeInstance?.debugAdvanceDay(days);
    (window as any).debugGrantRation = (count: number = 1) => HUD.activeInstance?.debugGrantRation(count);
    (window as any).debugSetHunger = (amount: number) => {
      HUD.activeInstance?.currentPlayer?.setHunger(amount);
      if (HUD.activeInstance?.currentPlayer && HUD.activeInstance?.currentProgression) {
        HUD.activeInstance.update(HUD.activeInstance.currentPlayer, HUD.activeInstance.currentProgression, 0);
      }
    };
    (window as any).debugCycleHunger = () => HUD.activeInstance?.debugCycleHunger();
    (window as any).debugSetMood = (amount: number) => {
      HUD.activeInstance?.currentPlayer?.setMood(amount);
      if (HUD.activeInstance?.currentPlayer && HUD.activeInstance?.currentProgression) {
        HUD.activeInstance.update(HUD.activeInstance.currentPlayer, HUD.activeInstance.currentProgression, 0);
      }
    };
    (window as any).debugCycleMood = () => HUD.activeInstance?.debugCycleMood();
    (window as any).debugEatRation = () => HUD.activeInstance?.eatRation();
    (window as any).debugCraftBandage = () => {
      const gs = GameState.getInstance();
      if (gs.consumeWood(5)) {
        const moodTier = DataLoader.getInstance().getMoodTier(HUD.activeInstance?.currentPlayer?.mood ?? 80);
        const yieldCount = 1 + moodTier.alchemyYieldBonus;
        gs.addItem('bandage', yieldCount);
        HUD.activeInstance?.currentProgression?.addProficiencyExp('alchemy', 25);
        HUD.activeInstance?.showToast(`⚗️ Crafted ${yieldCount}x Bandage! (+25 Alchemy EXP)`, 'success');
        if (HUD.activeInstance?.currentPlayer && HUD.activeInstance?.currentProgression) {
          HUD.activeInstance.update(HUD.activeInstance.currentPlayer, HUD.activeInstance.currentProgression, 0);
          if (HUD.activeInstance.isAlchemyModalOpen()) {
            HUD.activeInstance.renderAlchemyModal(HUD.activeInstance.currentPlayer, HUD.activeInstance.currentProgression);
          }
        }
      } else {
        HUD.activeInstance?.showToast('Not enough wood to craft Bandage!', 'error');
      }
    };

    if (!HUD.hasGlobalListeners) {
      HUD.hasGlobalListeners = true;
      // Key listeners: Tab (toggle HUD panel), L (toggle Loadout modal), B (toggle Build mode), H (apply bandage), O (toggle Party modal), Escape (close modals)
      window.addEventListener('keydown', (e) => {
        const active = HUD.activeInstance;
        if (!active) return;

        if (e.key === 'Tab') {
          e.preventDefault(); // Prevent default focus navigation
          active.toggleHudCard();
        } else if (e.key === '`' || e.code === 'Backquote' || e.key === '~') {
          e.preventDefault();
          active.toggleDebugSkillsPanel();
        } else if (e.key === 'l' || e.key === 'L') {
          if (active.isOutpost && active.currentPlayer && active.currentProgression) {
            active.toggleLoadoutModal(active.currentPlayer, active.currentProgression);
          }
        } else if (e.key === 'b' || e.key === 'B') {
          if (active.isOutpost) {
            active.onBuildModeToggleCallback?.();
          }
        } else if (e.key === 'h' || e.key === 'H') {
          active.applyBandage();
        } else if (e.key === 'o' || e.key === 'O' || e.code === 'KeyO') {
          active.togglePartyOverviewModal();
        } else if (e.key === 'y' || e.key === 'Y') {
          active.debugAdvanceDay(1);
        } else if (e.key === 'u' || e.key === 'U') {
          active.debugCycleHunger();
        } else if (e.key === 'm' || e.key === 'M') {
          active.debugCycleMood();
        } else if (e.key === 'Escape') {
          active.closeLoadoutModal();
          active.closeResearchTreeModal();
          active.closeAlchemyModal();
          active.closePartyOverviewModal();
          if (active.isBuildOverlayVisible()) {
            active.onBuildModeToggleCallback?.();
          }
        }
      });
    }
  }

  public setBuildCallbacks(
    onToggle: () => void,
    onSelect: (id: string) => void
  ): void {
    this.onBuildModeToggleCallback = onToggle;
    this.onSelectBuildableCallback = onSelect;
  }

  public isBuildOverlayVisible(): boolean {
    return this.buildOverlayEl?.classList.contains('active') ?? false;
  }

  public setBuildOverlayVisible(visible: boolean): void {
    if (this.buildOverlayEl) {
      if (visible) {
        this.buildOverlayEl.classList.add('active');
      } else {
        this.buildOverlayEl.classList.remove('active');
      }
    }
  }

  public updateBuildOverlay(wood: number, rotation: number, selectedId: string, constructionLevel: number = 0): void {
    if (this.buildOverlayWoodEl) {
      this.buildOverlayWoodEl.innerText = `🪵 Wood: ${wood}`;
    }
    if (this.playerWoodEl) {
      this.playerWoodEl.innerText = `🪵 ${wood}`;
    }
    if (this.buildRotationBadgeEl) {
      this.buildRotationBadgeEl.innerText = `Rotation: ${rotation}° [R]`;
    }

    const tier = BuildingSystem.getConstructionTier(constructionLevel);
    if (this.buildTierBadgeEl) {
      const costPct = Math.round(tier.buildCostMultiplier * 100);
      const refundPct = Math.round(tier.demolishRefundMultiplier * 100);
      this.buildTierBadgeEl.innerText = `Tier: ${tier.name} (Lv ${constructionLevel}) (${costPct}% Cost / ${refundPct}% Refund)`;
    }

    if (this.buildPaletteContainerEl) {
      const dataLoader = DataLoader.getInstance();
      const buildables = dataLoader.getBuildables();
      const gameState = GameState.getInstance();

      let html = '';
      if (buildables) {
        for (const b of buildables) {
          if (b.lockedByDefault && !gameState.isBuildableUnlocked(b.id)) {
            continue; // Gated behind Research Tree!
          }
          const effCost = BuildingSystem.getEffectiveBuildCost(b.woodCost, constructionLevel);
          const isActive = b.id === selectedId;
          const displayName = b.name.replace('Wood ', '');
          html += `
            <div class="palette-item ${isActive ? 'active' : ''}" data-buildable-id="${b.id}">
              <span class="palette-name">${displayName}</span>
              <span class="palette-cost" id="cost-badge-${b.id}">🪵 ${effCost}</span>
            </div>
          `;
        }
      }

      const isDemolishActive = selectedId === 'demolish';
      html += `
        <div class="palette-item ${isDemolishActive ? 'active' : ''}" data-buildable-id="demolish" style="border-color: #ef4444;">
          <span class="palette-name" style="color: #f87171;">Demolish</span>
          <span class="palette-cost" style="color: #9ca3af;">Refund</span>
        </div>
      `;

      this.buildPaletteContainerEl.innerHTML = html;
    }
  }

  public setRoomName(roomName: string | null): void {
    if (this.roomBadgeEl) {
      if (roomName) {
        this.roomBadgeEl.innerText = `🏠 Room: ${roomName}`;
        this.roomBadgeEl.style.display = 'block';
      } else {
        this.roomBadgeEl.style.display = 'none';
      }
    }
  }

  public showToast(
    message: string,
    type: 'info' | 'success' | 'warn' | 'error' = 'info',
    durationMs: number = 3500
  ): void {
    if (!this.buildFeedbackToastEl) return;

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.buildFeedbackToastEl.className = `active toast-${type}`;
    this.buildFeedbackToastEl.innerText = message;

    this.toastTimer = setTimeout(() => {
      if (this.buildFeedbackToastEl) {
        this.buildFeedbackToastEl.className = '';
      }
    }, durationMs);
  }

  public toggleHudCard(): void {
    HUD.isHudCardVisible = !HUD.isHudCardVisible;
    if (this.hudCardEl) {
      this.hudCardEl.style.display = HUD.isHudCardVisible ? 'block' : 'none';
    }
    console.log(`[HUD] Info panel visibility toggled: ${HUD.isHudCardVisible ? 'VISIBLE' : 'HIDDEN'}`);
  }

  public isHudVisible(): boolean {
    return HUD.isHudCardVisible;
  }

  public toggleDebugSkillsPanel(): void {
    HUD.isDebugSkillsVisible = !HUD.isDebugSkillsVisible;
    if (this.debugSkillsPanelEl) {
      if (HUD.isDebugSkillsVisible) {
        this.debugSkillsPanelEl.classList.add('active');
        this.renderedDebugSkillsKey = '';
        if (this.currentProgression) {
          this.updateDebugSkillsPanel(this.currentProgression);
        }
      } else {
        this.debugSkillsPanelEl.classList.remove('active');
      }
    }
    console.log(`[HUD] Debug all-skills panel toggled: ${HUD.isDebugSkillsVisible ? 'OPEN' : 'CLOSED'}`);
  }

  public isDebugSkillsPanelOpen(): boolean {
    return HUD.isDebugSkillsVisible;
  }

  public setDebugSkillsPanelVisible(visible: boolean): void {
    HUD.isDebugSkillsVisible = visible;
    if (this.debugSkillsPanelEl) {
      if (visible) {
        this.debugSkillsPanelEl.classList.add('active');
        this.renderedDebugSkillsKey = '';
        if (this.currentProgression) {
          this.updateDebugSkillsPanel(this.currentProgression);
        }
      } else {
        this.debugSkillsPanelEl.classList.remove('active');
      }
    }
  }

  public updateDebugSkillsPanel(progression: ProgressionSystem): void {
    if (!HUD.isDebugSkillsVisible || !this.debugSkillsListEl) return;

    const stats = progression.getAllProficiencyStats();
    let key = '';
    for (const [id, stat] of stats.entries()) {
      key += `${id}:${stat.level}:${stat.currentExp},`;
    }

    if (this.renderedDebugSkillsKey !== key) {
      this.renderedDebugSkillsKey = key;
      let html = '';
      for (const [id, stat] of stats.entries()) {
        const nextExp = LevelingSystem.expForNextLevel(stat.level);
        html += `<div class="debug-skill-row"><span class="debug-skill-id">${id}:</span> Level ${stat.level} (${stat.currentExp}/${nextExp} EXP)</div>`;
      }
      this.debugSkillsListEl.innerHTML = html;
    }
  }

  public setLocation(name: string, isOutpost: boolean): void {
    this.isOutpost = isOutpost;
    HUD.activeInstance = this;

    if (this.locationBadgeEl) {
      this.locationBadgeEl.innerText = name.toUpperCase();
      this.locationBadgeEl.style.color = isOutpost ? '#34d399' : '#a78bfa';
    }

    if (!isOutpost) {
      this.setRoomName(null);
    }

    if (this.outpostControlsEl) {
      this.outpostControlsEl.style.display = isOutpost ? 'block' : 'none';
    }

    if (this.hudWoodRowEl) {
      this.hudWoodRowEl.style.display = isOutpost ? 'flex' : 'none';
    }

    if (!isOutpost) {
      // Strictly enforce: Loadout modal and build overlay cannot remain open in dungeon
      this.closeLoadoutModal();
      this.setBuildOverlayVisible(false);
    }
  }

  public isLoadoutModalOpen(): boolean {
    return this.loadoutModalEl?.classList.contains('active') ?? false;
  }

  public toggleLoadoutModal(player: Player, progression: ProgressionSystem): void {
    if (!this.isOutpost) return;
    if (this.isLoadoutModalOpen()) {
      this.closeLoadoutModal();
    } else {
      this.openLoadoutModal(player, progression);
    }
  }

  public closeLoadoutModal(): void {
    if (this.loadoutModalEl) {
      this.loadoutModalEl.classList.remove('active');
    }
  }

  public openLoadoutModal(player: Player, progression: ProgressionSystem): void {
    if (!this.isOutpost) return; // Enforce outpost only
    this.currentPlayer = player;
    this.currentProgression = progression;

    this.renderLoadoutModal(player, progression);

    if (this.loadoutModalEl) {
      this.loadoutModalEl.classList.add('active');
    }
  }

  private renderLoadoutModal(player: Player, progression: ProgressionSystem): void {
    if (!this.equipSlotsContainerEl || !this.knownSkillsContainerEl) return;

    const dataLoader = DataLoader.getInstance();
    const equipped = player.equippedSkillIds;
    const known = player.knownSkillIds;

    if (this.slotsCountBadgeEl) {
      this.slotsCountBadgeEl.innerText = `${equipped.length} / 5 Slots`;
    }

    // 1. Render 5 Equip Slots
    this.equipSlotsContainerEl.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const slotEl = document.createElement('div');
      slotEl.className = `equip-slot ${i < equipped.length ? 'filled' : ''}`;
      slotEl.dataset.slotIndex = i.toString();

      // Drag & Drop event handlers for the slot
      slotEl.ondragover = (e) => {
        e.preventDefault();
        slotEl.classList.add('drag-over');
      };
      slotEl.ondragleave = () => {
        slotEl.classList.remove('drag-over');
      };
      slotEl.ondrop = (e) => {
        e.preventDefault();
        slotEl.classList.remove('drag-over');
        const droppedSkillId = e.dataTransfer?.getData('text/plain');
        if (droppedSkillId) {
          player.equipSkill(droppedSkillId, i);
          this.renderLoadoutModal(player, progression);
        }
      };

      if (i < equipped.length) {
        const skillId = equipped[i];
        const skillDef = dataLoader.getSkill(skillId);
        const isAuto = player.isAutocastEnabled(skillId);

        const skillName = skillDef ? skillDef.name : skillId;
        const details = skillDef
          ? skillDef.healAmount
            ? `${skillDef.energyCost} EN | ${skillDef.cooldownMs / 1000}s CD | +${skillDef.healAmount} HP`
            : `${skillDef.energyCost} EN | ${skillDef.cooldownMs / 1000}s CD | ${(skillDef.damageMultiplier ?? 1.0) * 100}% DMG`
          : '';

        slotEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase;">Slot ${i + 1}</div>
            <div style="font-weight: 700; color: #60a5fa; font-size: 13px;">${skillName}</div>
            <div style="font-size: 11px; color: #d1d5db;">${details}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="hud-autocast-btn ${isAuto ? 'autocast-on' : 'autocast-off'}" data-skill="${skillId}">
              ${isAuto ? 'AUTO: ON' : 'AUTO: OFF'}
            </button>
            <button type="button" style="background: #ef4444; color: #fff; border: none; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: bold; cursor: pointer;" data-unequip="${skillId}">
              ✕
            </button>
          </div>
        `;

        const autocastBtn = slotEl.querySelector(`[data-skill="${skillId}"]`) as HTMLElement;
        if (autocastBtn) {
          autocastBtn.onclick = () => {
            player.setAutocast(skillId, !isAuto);
            this.renderLoadoutModal(player, progression);
          };
        }

        const unequipBtn = slotEl.querySelector(`[data-unequip="${skillId}"]`) as HTMLElement;
        if (unequipBtn) {
          unequipBtn.onclick = () => {
            player.unequipSkill(skillId);
            this.renderLoadoutModal(player, progression);
          };
        }
      } else {
        slotEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <div class="slot-label">Slot ${i + 1}</div>
            <div style="font-size: 12px; color: #6b7280; font-style: italic;">Empty — Drop or click a known skill</div>
          </div>
        `;
      }

      this.equipSlotsContainerEl.appendChild(slotEl);
    }

    // 2. Render Known Skills Grimoire
    this.knownSkillsContainerEl.innerHTML = '';
    for (const skillId of known) {
      const skillDef = dataLoader.getSkill(skillId);
      if (!skillDef) continue;

      const isEquipped = equipped.includes(skillId);
      const isUnlocked = progression.isSkillUnlocked(skillDef, player);

      const card = document.createElement('div');
      card.className = `skill-card ${isEquipped ? 'equipped-badge' : ''}`;
      card.draggable = true;

      card.ondragstart = (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', skillId);
        }
      };

      const statusBadge = isEquipped
        ? `<span style="font-size: 11px; font-weight: bold; color: #34d399;">✓ Equipped</span>`
        : isUnlocked
        ? `<button type="button" style="background: #2563eb; color: #fff; border: none; border-radius: 4px; padding: 3px 10px; font-size: 11px; font-weight: bold; cursor: pointer;" data-equip="${skillId}">+ Equip</button>`
        : `<span style="font-size: 11px; color: #9ca3af;">(Requires Class)</span>`;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div class="skill-name">${skillDef.name}</div>
          <div>${statusBadge}</div>
        </div>
        <div class="skill-desc">${skillDef.description || 'Deals weapon damage.'}</div>
        <div class="skill-stats">
          <span>Cost: ${skillDef.energyCost} Energy</span>
          <span>Cooldown: ${skillDef.cooldownMs / 1000}s</span>
          <span>${skillDef.healAmount ? `Heal: +${skillDef.healAmount} HP` : `Damage: ${(skillDef.damageMultiplier ?? 1.0) * 100}%`}</span>
        </div>
      `;

      const equipBtn = card.querySelector(`[data-equip="${skillId}"]`) as HTMLElement;
      if (equipBtn) {
        equipBtn.onclick = () => {
          player.equipSkill(skillId);
          this.renderLoadoutModal(player, progression);
        };
      }

      this.knownSkillsContainerEl.appendChild(card);
    }
  }

  public update(player: Player, progression: ProgressionSystem, time: number, party?: Player[]): void {
    this.currentPlayer = player;
    this.currentProgression = progression;
    if (party && party.length > 0) {
      this.currentParty = party;
    } else if (this.currentParty.length === 0) {
      this.currentParty = [player];
    }

    // 1. Main HP
    if (this.playerHpEl) {
      this.playerHpEl.innerText = `${Math.ceil(player.hp)} / ${player.maxHp}`;
      this.playerHpEl.style.color = player.hp === 0 ? '#ef4444' : '#22c55e';
    }

    // 2. Critical HP
    if (this.playerCritHpEl) {
      this.playerCritHpEl.innerText = `${Math.ceil(player.criticalHp)} / ${player.maxCriticalHp}`;
      this.playerCritHpEl.style.color = player.hp === 0 && player.criticalHp > 0 ? '#f97316' : '#a855f7';
    }

    // 3. Energy
    if (this.playerEnergyEl) {
      this.playerEnergyEl.innerText = `${Math.floor(player.energy)} / ${player.maxEnergy}`;
    }

    // 4. Weapon & Proficiency
    if (this.weaponEl) {
      this.weaponEl.innerText = player.equippedWeapon.name;
    }

    const weaponId = player.equippedWeapon.id;
    const stat = progression.getProficiencyStat(weaponId);
    if (this.hudProficiencyRowEl) {
      if (stat.level >= 1) {
        this.hudProficiencyRowEl.style.display = 'flex';
        if (this.hudProficiencyLabelEl) {
          this.hudProficiencyLabelEl.innerText = `${player.equippedWeapon.name}:`;
        }
        if (this.profEl) {
          const nextExp = LevelingSystem.expForNextLevel(stat.level);
          const isFencerUnlocked = progression.isClassUnlocked('fencer');
          const tierText = isFencerUnlocked ? 'Novice' : 'Unranked';
          this.profEl.innerText = `Level ${stat.level} (${stat.currentExp}/${nextExp} EXP) [${tierText}]`;
        }
      } else {
        this.hudProficiencyRowEl.style.display = 'none';
      }
    }

    // 4b. Construction Proficiency
    if (this.hudConstructionRowEl && this.constructionProfEl) {
      const constStat = progression.getProficiencyStat('construction');
      if (constStat.level >= 1) {
        this.hudConstructionRowEl.style.display = 'flex';
        const constTier = progression.getConstructionTier();
        const nextExp = LevelingSystem.expForNextLevel(constStat.level);
        this.constructionProfEl.innerText = `Level ${constStat.level} (${constStat.currentExp}/${nextExp} EXP) (${constTier.name})`;
      } else {
        this.hudConstructionRowEl.style.display = 'none';
      }
    }

    // 4b2. Alchemy Proficiency
    if (this.alchemyProfTextEl && this.hudAlchemyRowEl) {
      const alchemyStat = progression.getProficiencyStat('alchemy');
      if (alchemyStat.level >= 1) {
        this.hudAlchemyRowEl.style.display = 'flex';
        const nextExp = LevelingSystem.expForNextLevel(alchemyStat.level);
        this.alchemyProfTextEl.innerText = `Level ${alchemyStat.level} (${alchemyStat.currentExp}/${nextExp} EXP)`;
      } else {
        this.hudAlchemyRowEl.style.display = 'none';
      }
    }

    // 4b3. Bandage Stockpile
    if (this.hudBandageRowEl && this.playerBandageTextEl) {
      const bandageCount = GameState.getInstance().getItemCount('bandage');
      const isAlchemyUnlocked = GameState.getInstance().isBuildableUnlocked('alchemy_station');
      if (bandageCount > 0) {
        this.hasSeenBandages = true;
      }
      if (bandageCount > 0 || isAlchemyUnlocked || this.hasSeenBandages) {
        this.hudBandageRowEl.style.display = 'flex';
        this.playerBandageTextEl.innerText = `${bandageCount}`;
      } else {
        this.hudBandageRowEl.style.display = 'none';
      }
    }

    // 4c. Discovered Defensive & Regen Skills (Strictly hidden until Level >= 1)
    if (this.discoveredSkillsSectionEl && this.discoveredSkillsListEl) {
      const dataLoader = DataLoader.getInstance();
      const hiddenSkills = dataLoader.getHiddenSkills();
      const revealedSkills: { def: HiddenSkillDef; stat: TrainableStat; nextExp: number }[] = [];

      for (const hDef of hiddenSkills) {
        const stat = progression.getProficiencyStat(hDef.id);
        if (stat.level >= 1) {
          const nextExp = LevelingSystem.expForNextLevel(stat.level);
          revealedSkills.push({ def: hDef, stat, nextExp });
        }
      }

      if (revealedSkills.length === 0) {
        this.discoveredSkillsSectionEl.style.display = 'none';
        this.discoveredSkillsListEl.innerHTML = '';
      } else {
        this.discoveredSkillsSectionEl.style.display = 'block';
        let html = '';
        for (const item of revealedSkills) {
          html += `
            <div style="font-size: 11px; display: flex; justify-content: space-between; align-items: center; background: rgba(31, 41, 55, 0.4); padding: 3px 6px; border-radius: 4px;">
              <span style="color: #60a5fa; font-weight: 600;">${item.def.name}:</span>
              <span style="color: #34d399; font-weight: 500;">Level ${item.stat.level} (${item.stat.currentExp}/${item.nextExp} EXP)</span>
            </div>
          `;
        }
        this.discoveredSkillsListEl.innerHTML = html;
      }
    }

    // 5. Equipped Skills List with Cooldowns and Live Autocast Toggles
    if (this.hudSkillsListEl) {
      const dataLoader = DataLoader.getInstance();
      const equipped = player.equippedSkillIds;
      const equippedKey = equipped.join(',');

      // Only rebuild DOM rows if equipped skills set changed
      if (this.renderedSkillsKey !== equippedKey) {
        this.renderedSkillsKey = equippedKey;
        if (equipped.length === 0) {
          this.hudSkillsListEl.innerHTML = `<div style="font-size: 11px; color: #6b7280; font-style: italic;">No skills equipped</div>`;
        } else {
          let html = '';
          for (const skillId of equipped) {
            const skillDef = dataLoader.getSkill(skillId);
            if (!skillDef) continue;
            const isAuto = player.isAutocastEnabled(skillId);
            html += `
              <div class="hud-skill-row" data-skill-row="${skillId}">
                <div>
                  <span style="font-weight: 600; color: #f3f4f6;">${skillDef.name}</span>
                  <span data-status-skill="${skillId}" style="font-size: 11px; margin-left: 6px;"></span>
                </div>
                <button type="button" class="hud-autocast-btn ${isAuto ? 'autocast-on' : 'autocast-off'}" data-hud-skill="${skillId}">
                  ${isAuto ? 'AUTO: ON' : 'AUTO: OFF'}
                </button>
              </div>
            `;
          }
          this.hudSkillsListEl.innerHTML = html;
        }
      }

      // Update per-frame dynamic values (cooldown/energy status and autocast state)
      for (const skillId of equipped) {
        const skillDef = dataLoader.getSkill(skillId);
        if (!skillDef) continue;

        const isUnlocked = progression.isSkillUnlocked(skillDef, player);
        const isAuto = player.isAutocastEnabled(skillId);
        const lastUsed = player.lastSkillUseTimes.get(skillId) || 0;
        const elapsed = time - lastUsed;
        const cooldownMs = skillDef.cooldownMs;

        let statusText = '';
        let statusColor = '#9ca3af';

        if (!isUnlocked) {
          statusText = 'Locked';
          statusColor = '#6b7280';
        } else if (elapsed < cooldownMs) {
          const remainingSec = ((cooldownMs - elapsed) / 1000).toFixed(1);
          statusText = `CD: ${remainingSec}s`;
          statusColor = '#f59e0b';
        } else if (player.energy < skillDef.energyCost) {
          statusText = `Low EN`;
          statusColor = '#9ca3af';
        } else {
          statusText = isAuto ? 'Ready' : 'Ready (Manual)';
          statusColor = isAuto ? '#22c55e' : '#93c5fd';
        }

        const statusEl = this.hudSkillsListEl.querySelector(`[data-status-skill="${skillId}"]`) as HTMLElement;
        if (statusEl) {
          statusEl.innerText = `[${statusText}]`;
          statusEl.style.color = statusColor;
        }

        const btn = this.hudSkillsListEl.querySelector(`[data-hud-skill="${skillId}"]`) as HTMLButtonElement;
        if (btn) {
          const expectedClass = `hud-autocast-btn ${isAuto ? 'autocast-on' : 'autocast-off'}`;
          if (btn.className !== expectedClass) {
            btn.className = expectedClass;
          }
          const expectedText = isAuto ? 'AUTO: ON' : 'AUTO: OFF';
          if (btn.innerText !== expectedText) {
            btn.innerText = expectedText;
          }
        }
      }
    }

    // 6. Player Status Effects / State
    if (this.playerStatusEl) {
      if (player.state === 'downed') {
        this.playerStatusEl.innerText = 'DOWNED';
        this.playerStatusEl.style.color = '#ef4444';
      } else if (player.activeStatusEffects.has('bleed')) {
        this.playerStatusEl.innerText = 'Bleeding (DoT)';
        this.playerStatusEl.style.color = '#ef4444';
      } else {
        this.playerStatusEl.innerText = 'Normal';
        this.playerStatusEl.style.color = '#9ca3af';
      }
    }

    // 7. Downed Banner Toggle
    if (this.downedBannerEl) {
      if (player.state === 'downed') {
        this.downedBannerEl.classList.add('active');
      } else {
        this.downedBannerEl.classList.remove('active');
      }
    }

    // 8. Outpost Wood Stockpile Counter
    if (this.isOutpost && this.playerWoodEl) {
      const wood = GameState.getInstance().getWood();
      this.playerWoodEl.innerText = `🪵 ${wood}`;
      if (this.buildOverlayWoodEl) {
        this.buildOverlayWoodEl.innerText = `🪵 Wood: ${wood}`;
      }
    }

    // 8b. Milestone 7: Day Clock, Hunger, Mood & Rations
    if (this.dayClockBadgeEl) {
      const day = GameState.getInstance().getCurrentGameDay();
      const progressPct = (GameState.getInstance().getDayProgress() * 100).toFixed(0);
      this.dayClockBadgeEl.innerText = `🌅 Day ${day} (${progressPct}%)`;
    }

    if (this.playerHungerTextEl) {
      this.playerHungerTextEl.innerText = `${Math.ceil(player.hunger)} / ${player.maxHunger}`;
      if (player.hunger > 50) {
        this.playerHungerTextEl.style.color = '#22c55e';
      } else if (player.hunger > 25) {
        this.playerHungerTextEl.style.color = '#f59e0b';
      } else {
        this.playerHungerTextEl.style.color = '#ef4444';
      }
    }

    if (this.playerMoodTextEl) {
      const moodTier = DataLoader.getInstance().getMoodTier(player.mood);
      this.playerMoodTextEl.innerText = `${Math.ceil(player.mood)} / ${player.maxMood} (${moodTier.name})`;
      if (moodTier.tier === 'high') {
        this.playerMoodTextEl.style.color = '#22c55e';
      } else if (moodTier.tier === 'content') {
        this.playerMoodTextEl.style.color = '#38bdf8';
      } else {
        this.playerMoodTextEl.style.color = '#ef4444';
      }
    }

    if (this.hudRationRowEl && this.playerRationTextEl) {
      const allFood = GameState.getInstance().getFoodItems();
      const foodCount = allFood.length;
      if (foodCount > 0 || this.isOutpost) {
        this.hudRationRowEl.style.display = 'flex';
        this.playerRationTextEl.innerText = `${foodCount}`;
        if (this.hudEatRationBtn) {
          this.hudEatRationBtn.style.display = foodCount > 0 ? 'inline-block' : 'none';
        }
      } else {
        this.hudRationRowEl.style.display = 'none';
      }
    }

    if (this.playerStatusEl && player.state !== 'downed' && !player.activeStatusEffects.has('bleed')) {
      if (player.wellFedRemainingMs > 0) {
        const sec = Math.ceil(player.wellFedRemainingMs / 1000);
        this.playerStatusEl.innerText = `Well Fed (+${player.wellFedHpPerSec} HP/s, ${sec}s)`;
        this.playerStatusEl.style.color = '#10b981';
      }
    }

    // 9. Live All-Skills Debug Overview Panel (Backtick toggle)
    this.updateDebugSkillsPanel(progression);

    // 10. Update Party Overview modal if open
    if (this.isPartyOverviewModalOpen()) {
      this.updatePartyOverview(time);
    }

    // 11. Update Cooking Station modal live if open
    if (this.isCookingModalOpen()) {
      this.updateCookingStockpileLive();
    }
  }

  private setElementTextIfChanged(el: HTMLElement | null, text: string): void {
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }

  private getPartyRosterKey(): string {
    return `${this.currentParty.length}_` + this.currentParty.map((m) => {
      const isDw = m.progression.isDualWieldUnlocked();
      const mainWpn = m.equippedWeapon?.id || 'none';
      const offWpn = m.offhandWeapon?.id || 'none';
      const equippedSkills = m.equippedSkillIds.join(',');
      const knownSkills = m.knownSkillIds.join(',');
      return `${m.id}:${m.entityName}:${m.state}:${mainWpn}:${offWpn}:${isDw}:${equippedSkills}:${knownSkills}`;
    }).join('|');
  }

  public openPartyOverviewModal(): void {
    this.renderPartyOverviewModal(true);
    if (this.partyOverviewModalEl) {
      this.partyOverviewModalEl.classList.add('active');
    }
  }

  public closePartyOverviewModal(): void {
    if (this.partyOverviewModalEl) {
      this.partyOverviewModalEl.classList.remove('active');
    }
  }

  public togglePartyOverviewModal(): void {
    if (this.isPartyOverviewModalOpen()) {
      this.closePartyOverviewModal();
    } else {
      this.openPartyOverviewModal();
    }
  }

  public isPartyOverviewModalOpen(): boolean {
    return this.partyOverviewModalEl?.classList.contains('active') ?? false;
  }

  public updatePartyOverview(time: number): void {
    if (!this.partyOverviewRosterEl) return;

    // Check if structural roster key changed (e.g. member count, downed status, DW unlock flipped)
    const currentKey = this.getPartyRosterKey();
    if (this.renderedPartyRosterKey !== currentKey) {
      this.renderPartyOverviewModal(false);
      return;
    }

    // Throttled in-place updates: 100ms (10 updates/second)
    if (time - this.lastPartyStatsUpdateTime < 100) {
      return;
    }
    this.lastPartyStatsUpdateTime = time;

    this.updatePartyOverviewLiveStats();
  }

  public updatePartyOverviewLiveStats(): void {
    if (!this.partyOverviewRosterEl) return;

    if (this.partySpawnCompanionBtn) {
      const isFull = this.currentParty.length >= 4;
      (this.partySpawnCompanionBtn as HTMLButtonElement).disabled = isFull;
      this.partySpawnCompanionBtn.style.opacity = isFull ? '0.5' : '1';
      this.partySpawnCompanionBtn.style.cursor = isFull ? 'not-allowed' : 'pointer';
    }

    for (let i = 0; i < this.currentParty.length; i++) {
      const member = this.currentParty[i];
      if (!member) continue;

      // 1. HP
      const hpEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-hp="${i}"]`);
      if (hpEl) {
        this.setElementTextIfChanged(hpEl, `${Math.ceil(member.hp)} / ${member.maxHp}`);
        const hpColor = member.hp === 0 ? '#ef4444' : '#22c55e';
        if (hpEl.style.color !== hpColor) hpEl.style.color = hpColor;
      }

      // 2. Critical HP
      const critHpEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-crit-hp="${i}"]`);
      if (critHpEl) {
        this.setElementTextIfChanged(critHpEl, `${Math.ceil(member.criticalHp)} / ${member.maxCriticalHp}`);
      }

      // 3. Energy
      const energyEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-energy="${i}"]`);
      if (energyEl) {
        this.setElementTextIfChanged(energyEl, `${Math.floor(member.energy)} / ${member.maxEnergy}`);
      }

      // 4. Hunger
      const hungerEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-hunger="${i}"]`);
      if (hungerEl) {
        this.setElementTextIfChanged(hungerEl, `${Math.floor(member.hunger)} / ${member.maxHunger}`);
      }

      // 5. Mood
      const moodEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-mood="${i}"]`);
      if (moodEl) {
        this.setElementTextIfChanged(moodEl, `${Math.floor(member.mood)} / ${member.maxMood}`);
      }

      // 6. Proficiencies
      let hasAnyRevealed = false;
      for (const [statId, stat] of member.progression.getAllProficiencyStats().entries()) {
        const rowEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-prof-row="${i}-${statId}"]`);
        const valEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-prof-val="${i}-${statId}"]`);
        if (stat.level >= 1) {
          hasAnyRevealed = true;
          if (rowEl && rowEl.style.display !== 'flex') {
            rowEl.style.display = 'flex';
          }
          if (valEl) {
            const nextExp = LevelingSystem.expForNextLevel(stat.level);
            this.setElementTextIfChanged(valEl, `Lv ${stat.level} (${stat.currentExp}/${nextExp})`);
          }
        } else {
          if (rowEl && rowEl.style.display !== 'none') {
            rowEl.style.display = 'none';
          }
        }
      }
      const noProfEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-no-prof="${i}"]`);
      if (noProfEl) {
        const targetDisplay = hasAnyRevealed ? 'none' : 'block';
        if (noProfEl.style.display !== targetDisplay) {
          noProfEl.style.display = targetDisplay;
        }
      }

      // 7. Dual Wield Penalty & Shield Status
      const isDwUnlocked = member.progression.isDualWieldUnlocked();
      if (isDwUnlocked) {
        const dwStat = member.progression.getProficiencyStat('dual_wielding');
        const dwPenaltyEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-dw-penalty="${i}"]`);
        if (dwPenaltyEl) {
          const dwPenaltyPct = Math.round(member.progression.getDualWieldPenalty() * 100);
          this.setElementTextIfChanged(dwPenaltyEl, `Dual Wield Penalty: -${dwPenaltyPct}% Hit Rate (DW Lv ${dwStat.level})`);
          const penaltyColor = dwPenaltyPct === 0 ? '#4ade80' : '#fbbf24';
          if (dwPenaltyEl.style.color !== penaltyColor) dwPenaltyEl.style.color = penaltyColor;
        }
      }
      const shieldStatusEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-shield-status="${i}"]`);
      if (shieldStatusEl) {
        const shieldStat = member.progression.getProficiencyStat('shields');
        this.setElementTextIfChanged(shieldStatusEl, `Shield Active: Block & Mitigation (Shields Lv ${shieldStat.level})`);
      }
    }
  }

  public renderPartyOverviewModal(forceRebuild: boolean = false): void {
    if (!this.partyOverviewRosterEl) return;

    const currentKey = this.getPartyRosterKey();
    if (!forceRebuild && this.renderedPartyRosterKey === currentKey) {
      this.updatePartyOverviewLiveStats();
      return;
    }
    this.renderedPartyRosterKey = currentKey;

    if (this.partySpawnCompanionBtn) {
      const isFull = this.currentParty.length >= 4;
      (this.partySpawnCompanionBtn as HTMLButtonElement).disabled = isFull;
      this.partySpawnCompanionBtn.style.opacity = isFull ? '0.5' : '1';
      this.partySpawnCompanionBtn.style.cursor = isFull ? 'not-allowed' : 'pointer';
    }

    const dataLoader = DataLoader.getInstance();
    const allWeapons = dataLoader.getAllWeapons();
    let html = '';

    const avatarColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'];

    for (let i = 0; i < this.currentParty.length; i++) {
      const member = this.currentParty[i];
      const color = avatarColors[i % avatarColors.length];
      const isDowned = member.state === 'downed';

      const dwStat = member.progression.getProficiencyStat('dual_wielding');
      const isDwUnlocked = member.progression.isDualWieldUnlocked();
      const dwPenaltyPct = Math.round(member.progression.getDualWieldPenalty() * 100);

      let hasAnyRevealed = false;
      let profRowsHtml = '';
      for (const [statId, stat] of member.progression.getAllProficiencyStats().entries()) {
        const isRevealed = stat.level >= 1;
        if (isRevealed) hasAnyRevealed = true;
        const nextExp = LevelingSystem.expForNextLevel(stat.level);
        const displayName = this.getStatDisplayName(statId);
        const statColor = this.getStatColor(statId);
        let legacyAttr = '';
        if (statId === 'short_swords') legacyAttr = `data-party-prof-swords="${i}"`;
        else if (statId === 'daggers') legacyAttr = `data-party-prof-daggers="${i}"`;
        else if (statId === 'dual_wielding') legacyAttr = `data-party-prof-dw="${i}"`;

        profRowsHtml += `
          <div class="party-stat-row" data-party-prof-row="${i}-${statId}" style="display: ${isRevealed ? 'flex' : 'none'};">
            <span>${displayName}:</span>
            <span class="party-stat-val" data-party-prof-val="${i}-${statId}" ${legacyAttr} style="color: ${statColor};">Lv ${stat.level} (${stat.currentExp}/${nextExp})</span>
          </div>
        `;
      }

      // Main weapon options
      let mainOptions = '';
      for (const w of allWeapons) {
        if (!w.twoHanded) {
          const sel = member.equippedWeapon.id === w.id ? 'selected' : '';
          mainOptions += `<option value="${w.id}" ${sel}>${w.name} (Dmg: ${w.baseDamage})</option>`;
        }
      }

      // Offhand options
      let offhandOptions = `<option value="none" ${!member.offhandWeapon ? 'selected' : ''}>None (Single Wield)</option>`;

      // Shields are always available without requiring Dual Wielding
      for (const w of allWeapons) {
        if (w.category === 'offhand' || w.id === 'shields') {
          const sel = member.offhandWeapon?.id === w.id ? 'selected' : '';
          offhandOptions += `<option value="${w.id}" ${sel}>🛡️ ${w.name} (Shield)</option>`;
        }
      }

      // One-handed melee weapons for Dual Wielding (if unlocked)
      if (isDwUnlocked) {
        for (const w of allWeapons) {
          if (!w.twoHanded && w.category === 'melee_1h') {
            const sel = member.offhandWeapon?.id === w.id ? 'selected' : '';
            offhandOptions += `<option value="${w.id}" ${sel}>⚔️ ${w.name} (Offhand - Dmg: ${w.baseDamage})</option>`;
          }
        }
      }

      const isShieldEquipped = typeof member.hasShield === 'function' ? member.hasShield() : false;
      const isDwActive = typeof member.isDualWielding === 'function' ? member.isDualWielding() : false;

      let offhandStatusHtml = '';
      if (isDwActive) {
        offhandStatusHtml = `
          <div data-party-dw-penalty="${i}" style="font-size: 10px; color: ${dwPenaltyPct === 0 ? '#4ade80' : '#fbbf24'}; margin-top: 2px;">
            Dual Wield Penalty: -${dwPenaltyPct}% Hit Rate (DW Lv ${dwStat.level})
          </div>
        `;
      } else if (isShieldEquipped) {
        const shieldStat = member.progression.getProficiencyStat('shields');
        offhandStatusHtml = `
          <div data-party-shield-status="${i}" style="font-size: 10px; color: #38bdf8; margin-top: 2px;">
            Shield Active: Block & Mitigation (Shields Lv ${shieldStat.level})
          </div>
        `;
      } else if (!isDwUnlocked) {
        offhandStatusHtml = `
          <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">
            🔒 Dual Wielding Locked (Requires 2 1H Melee Lv30+)
          </div>
        `;
      }

      const offhandSelectHtml = `
        <select class="party-select party-offhand-select" data-member-idx="${i}">
          ${offhandOptions}
        </select>
        ${offhandStatusHtml}
      `;

      // Skills chips
      let equippedSkillsHtml = '';
      for (const skillId of member.equippedSkillIds) {
        const skillDef = dataLoader.getSkill(skillId);
        const skillName = skillDef?.name || skillId;
        const auto = member.isAutocastEnabled(skillId);
        equippedSkillsHtml += `
          <div class="party-skill-chip">
            <span>${skillName}</span>
            <button class="party-skill-auto-toggle" data-member-idx="${i}" data-skill-id="${skillId}" type="button" style="background: ${auto ? '#059669' : '#4b5563'}; color: white; border: none; border-radius: 3px; padding: 1px 4px; font-size: 9px; cursor: pointer;">
              ${auto ? 'AUTO' : 'MAN'}
            </button>
            <span class="party-skill-unequip" data-member-idx="${i}" data-skill-id="${skillId}" title="Unequip">&times;</span>
          </div>
        `;
      }

      // Available unequipped skills
      const unequippedSkills = member.knownSkillIds.filter((id) => !member.equippedSkillIds.includes(id));
      let availableSkillsHtml = '';
      if (member.equippedSkillIds.length < 5 && unequippedSkills.length > 0) {
        const skillOpts = unequippedSkills.map((id) => {
          const def = dataLoader.getSkill(id);
          return `<option value="${id}">${def?.name || id}</option>`;
        }).join('');
        availableSkillsHtml = `
          <div style="display: flex; gap: 4px; margin-top: 4px;">
            <select class="party-select party-equip-skill-select" data-member-idx="${i}">
              ${skillOpts}
            </select>
            <button class="btn-action party-equip-skill-btn" data-member-idx="${i}" type="button" style="padding: 2px 8px; font-size: 10px; white-space: nowrap;">Equip</button>
          </div>
        `;
      }

      html += `
        <div class="party-card ${isDowned ? 'downed' : ''}" data-party-card-idx="${i}">
          <div class="party-card-header">
            <div class="party-avatar-badge" style="background: ${color};">${member.entityName.charAt(0)}</div>
            <div>
              <div class="party-member-name">${member.entityName}</div>
              <div style="font-size: 10px; color: #9ca3af;">ID: ${member.id}</div>
            </div>
            ${isDowned ? `
              <span class="party-member-status party-status-downed">DOWNED</span>
              <button class="party-revive-btn" data-revive-idx="${i}" type="button">Revive [R]</button>
            ` : `
              <span class="party-member-status party-status-active">ACTIVE</span>
            `}
          </div>

          <div style="display: flex; flex-direction: column; gap: 3px;">
            <div class="party-stat-row">
              <span>Main HP:</span>
              <span class="party-stat-val" data-party-hp="${i}" style="color: ${member.hp === 0 ? '#ef4444' : '#22c55e'};">${Math.ceil(member.hp)} / ${member.maxHp}</span>
            </div>
            <div class="party-stat-row">
              <span>Critical HP:</span>
              <span class="party-stat-val" data-party-crit-hp="${i}" style="color: #a855f7;">${Math.ceil(member.criticalHp)} / ${member.maxCriticalHp}</span>
            </div>
            <div class="party-stat-row">
              <span>Energy:</span>
              <span class="party-stat-val" data-party-energy="${i}" style="color: #3b82f6;">${Math.floor(member.energy)} / ${member.maxEnergy}</span>
            </div>
            <div class="party-stat-row">
              <span>Hunger:</span>
              <span class="party-stat-val" data-party-hunger="${i}" style="color: #fb923c;">${Math.floor(member.hunger)} / ${member.maxHunger}</span>
            </div>
            <div class="party-stat-row">
              <span>Mood:</span>
              <span class="party-stat-val" data-party-mood="${i}" style="color: #34d399;">${Math.floor(member.mood)} / ${member.maxMood}</span>
            </div>
          </div>

          <div class="party-equip-box">
            <div style="font-weight: bold; color: #60a5fa; font-size: 10px; text-transform: uppercase;">Equipment</div>
            <div>
              <span style="color: #9ca3af; font-size: 10px;">Main Weapon:</span>
              <select class="party-select party-main-select" data-member-idx="${i}">
                ${mainOptions}
              </select>
            </div>
            <div>
              <span style="color: #9ca3af; font-size: 10px;">Offhand Weapon:</span>
              ${offhandSelectHtml}
            </div>
          </div>

          <div class="party-equip-box">
            <div style="font-weight: bold; color: #fbbf24; font-size: 10px; text-transform: uppercase;">Proficiencies</div>
            <div data-party-no-prof="${i}" style="color: #6b7280; font-size: 10px; font-style: italic; display: ${hasAnyRevealed ? 'none' : 'block'};">No proficiencies discovered</div>
            ${profRowsHtml}
          </div>

          <div class="party-equip-box">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: bold; color: #a78bfa; font-size: 10px; text-transform: uppercase;">Equipped Skills</span>
              <span style="font-size: 10px; color: #9ca3af;">${member.equippedSkillIds.length} / 5</span>
            </div>
            <div class="party-skills-chip-list">
              ${equippedSkillsHtml || '<span style="color: #6b7280; font-size: 10px;">No skills equipped</span>'}
            </div>
            ${availableSkillsHtml}
          </div>
        </div>
      `;
    }

    this.partyOverviewRosterEl.innerHTML = html;
    this.attachPartyOverviewEvents();
  }

  private attachPartyOverviewEvents(): void {
    if (!this.partyOverviewRosterEl) return;

    this.partyOverviewRosterEl.onchange = (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('party-main-select')) {
        const select = target as HTMLSelectElement;
        const memberIdx = parseInt(select.dataset.memberIdx || '0', 10);
        const member = this.currentParty[memberIdx];
        const weapon = DataLoader.getInstance().getWeapon(select.value);
        if (member && weapon) {
          member.equipWeapon(weapon);
          this.renderPartyOverviewModal(true);
        }
      } else if (target.classList.contains('party-offhand-select')) {
        const select = target as HTMLSelectElement;
        const memberIdx = parseInt(select.dataset.memberIdx || '0', 10);
        const member = this.currentParty[memberIdx];
        if (member) {
          if (select.value === 'none') {
            member.equipOffhandWeapon(null);
          } else {
            const weapon = DataLoader.getInstance().getWeapon(select.value);
            if (weapon) {
              member.equipOffhandWeapon(weapon);
            }
          }
          this.renderPartyOverviewModal(true);
        }
      }
    };

    this.partyOverviewRosterEl.onclick = (e) => {
      const target = e.target as HTMLElement;

      // Revive button
      if (target.classList.contains('party-revive-btn')) {
        const idx = parseInt(target.dataset.reviveIdx || '0', 10);
        const member = this.currentParty[idx];
        if (member && member.state === 'downed') {
          member.revive(this.currentParty[0]);
          this.renderPartyOverviewModal(true);
          this.showToast(`✨ Revived ${member.entityName}!`, 'success');
        }
      }

      // Autocast toggle button (update in place without rebuilding the card DOM)
      if (target.classList.contains('party-skill-auto-toggle')) {
        const memberIdx = parseInt(target.dataset.memberIdx || '0', 10);
        const skillId = target.dataset.skillId;
        const member = this.currentParty[memberIdx];
        if (member && skillId) {
          const current = member.isAutocastEnabled(skillId);
          const nextState = !current;
          member.setAutocast(skillId, nextState);
          target.innerText = nextState ? 'AUTO' : 'MAN';
          (target as HTMLElement).style.background = nextState ? '#059669' : '#4b5563';
        }
      }

      // Unequip skill
      if (target.classList.contains('party-skill-unequip')) {
        const memberIdx = parseInt(target.dataset.memberIdx || '0', 10);
        const skillId = target.dataset.skillId;
        const member = this.currentParty[memberIdx];
        if (member && skillId) {
          member.unequipSkill(skillId);
          this.renderPartyOverviewModal(true);
        }
      }

      // Equip skill button
      if (target.classList.contains('party-equip-skill-btn')) {
        const memberIdx = parseInt(target.dataset.memberIdx || '0', 10);
        const member = this.currentParty[memberIdx];
        const card = target.closest('.party-card');
        const select = card?.querySelector<HTMLSelectElement>('.party-equip-skill-select');
        if (member && select && select.value) {
          member.equipSkill(select.value);
          this.renderPartyOverviewModal(true);
        }
      }
    };
  }

  public showClassUnlockModal(classDef: ClassDef): void {
    if (this.classNameEl) {
      this.classNameEl.innerText = classDef.name;
    }
    if (this.classFantasyEl) {
      this.classFantasyEl.innerText = classDef.fantasy;
    }
    if (this.unlockModalEl) {
      this.unlockModalEl.classList.add('active');

      // Auto-hide modal after 5 seconds
      setTimeout(() => {
        if (this.unlockModalEl) {
          this.unlockModalEl.classList.remove('active');
        }
      }, 5000);
    }
  }

  public showSkillDiscoveredModal(skillDef: { name: string; description?: string; tierEffects?: any[] }): void {
    if (this.discoveredSkillNameEl) {
      this.discoveredSkillNameEl.innerText = skillDef.name;
    }
    if (this.discoveredSkillDescEl) {
      const tier1 = skillDef.tierEffects?.find((t) => t.level === 1);
      this.discoveredSkillDescEl.innerText = tier1
        ? `${tier1.description} — ${skillDef.description || ''}`
        : (skillDef.description || '');
    }
    if (this.skillDiscoveredModalEl) {
      this.skillDiscoveredModalEl.classList.add('active');

      // Auto-hide modal after 5 seconds
      setTimeout(() => {
        if (this.skillDiscoveredModalEl) {
          this.skillDiscoveredModalEl.classList.remove('active');
        }
      }, 5000);
    }
    this.showToast(`✨ Skill Discovered: ${skillDef.name}!`, 'success', 4000);
  }

  // --- RESEARCH TREE MODAL METHODS (Milestone 6) ---

  public openResearchTreeModal(): void {
    if (this.researchTreeModalEl) {
      this.researchTreeModalEl.classList.add('active');
      this.renderResearchTreeModal();
    }
  }

  public closeResearchTreeModal(): void {
    if (this.researchTreeModalEl) {
      this.researchTreeModalEl.classList.remove('active');
    }
  }

  public isResearchTreeModalOpen(): boolean {
    return this.researchTreeModalEl?.classList.contains('active') ?? false;
  }

  public renderResearchTreeModal(): void {
    if (!this.researchTreeModalEl || !this.researchNodesContainerEl) return;

    const dataLoader = DataLoader.getInstance();
    const researchNodes = dataLoader.getResearchNodes();
    const gameState = GameState.getInstance();
    const researchSystem = ResearchSystem.getInstance();

    if (this.researchPointsCountEl) {
      this.researchPointsCountEl.innerText = `🔬 ${gameState.getResearchPoints()}`;
    }

    this.researchNodesContainerEl.innerHTML = '';

    for (const node of researchNodes) {
      const isUnlocked = gameState.isBuildableUnlocked(node.targetBuildableId);
      const canUnlock = researchSystem.canUnlockNode(node);

      const card = document.createElement('div');
      card.style.cssText = 'background: rgba(31, 41, 55, 0.85); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px;';

      let buttonHtml = '';
      if (isUnlocked) {
        buttonHtml = `<span style="font-size: 12px; font-weight: bold; color: #34d399; background: rgba(5, 150, 105, 0.25); border: 1px solid #10b981; border-radius: 4px; padding: 4px 10px;">✓ Unlocked</span>`;
      } else if (canUnlock.canUnlock) {
        buttonHtml = `<button type="button" class="btn-action" style="background: #0284c7; border-color: #38bdf8; font-size: 12px; padding: 6px 12px;" data-unlock-node="${node.id}">🔬 Unlock (${node.cost} Pts)</button>`;
      } else {
        buttonHtml = `<button type="button" disabled style="background: #374151; color: #9ca3af; border: 1px solid #4b5563; border-radius: 6px; font-size: 12px; padding: 6px 12px; cursor: not-allowed;">Locked (${node.cost} Pts)</button>`;
      }

      card.innerHTML = `
        <div style="flex: 1;">
          <div style="font-size: 14px; font-weight: bold; color: #f3f4f6; display: flex; align-items: center; gap: 8px;">
            <span>${node.name}</span>
            <span style="font-size: 11px; color: #38bdf8; font-weight: normal;">Cost: ${node.cost} RP</span>
          </div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 3px;">${node.description}</div>
        </div>
        <div>${buttonHtml}</div>
      `;

      const unlockBtn = card.querySelector<HTMLButtonElement>(`[data-unlock-node="${node.id}"]`);
      if (unlockBtn) {
        unlockBtn.onclick = () => {
          const result = researchSystem.unlockNode(node);
          if (result.success) {
            this.showToast(`✨ Research Complete: ${node.name} unlocked in Build Mode!`, 'success', 3500);
            this.renderResearchTreeModal();
            if (this.currentProgression) {
              const constLevel = this.currentProgression.getProficiencyLevel('construction');
              this.updateBuildOverlay(gameState.getWood(), 0, 'floor', constLevel);
            }
          } else {
            this.showToast(result.reason || 'Could not unlock facility', 'error');
          }
        };
      }

      this.researchNodesContainerEl.appendChild(card);
    }
  }

  // --- ALCHEMY CRAFTING MODAL METHODS (Milestone 6) ---

  public openAlchemyModal(player: Player, progression: ProgressionSystem): void {
    this.currentPlayer = player;
    this.currentProgression = progression;
    if (this.alchemyModalEl) {
      this.alchemyModalEl.classList.add('active');
      this.renderAlchemyModal(player, progression);
    }
  }

  public closeAlchemyModal(): void {
    if (this.alchemyModalEl) {
      this.alchemyModalEl.classList.remove('active');
    }
  }

  public isAlchemyModalOpen(): boolean {
    return this.alchemyModalEl?.classList.contains('active') ?? false;
  }

  public renderAlchemyModal(player: Player, progression: ProgressionSystem): void {
    if (!this.alchemyModalEl) return;

    const dataLoader = DataLoader.getInstance();
    const gameState = GameState.getInstance();
    const alchemyRecipes = dataLoader.getAlchemyRecipes();

    // 1. Alchemy proficiency header
    const alchemyStat = progression.getProficiencyStat('alchemy');
    if (this.alchemyModalProfEl) {
      if (alchemyStat.level >= 1) {
        const nextExp = LevelingSystem.expForNextLevel(alchemyStat.level);
        this.alchemyModalProfEl.innerText = `Level ${alchemyStat.level} (${alchemyStat.currentExp}/${nextExp} EXP)`;
      } else {
        this.alchemyModalProfEl.innerText = 'Untrained';
      }
    }

    // 2. Resource counts
    if (this.alchemyModalWoodEl) {
      this.alchemyModalWoodEl.innerText = `🪵 ${gameState.getWood()}`;
    }
    if (this.alchemyModalBandagesEl) {
      this.alchemyModalBandagesEl.innerText = `🩹 ${gameState.getItemCount('bandage')}`;
    }

    // 2b. Mood Modifier Banner
    const moodTier = dataLoader.getMoodTier(player.mood);
    const yieldQuantity = 1 + moodTier.alchemyYieldBonus;

    if (this.alchemyMoodValueEl && this.alchemyMoodEffectEl) {
      this.alchemyMoodValueEl.innerText = `${moodTier.name} (${Math.ceil(player.mood)}/100)`;
      if (moodTier.alchemyYieldBonus > 0) {
        this.alchemyMoodEffectEl.innerText = `+${moodTier.alchemyYieldBonus * 100}% Crafting Yield (2x Bandages per craft!)`;
        this.alchemyMoodEffectEl.style.color = '#fef08a';
      } else {
        this.alchemyMoodEffectEl.innerText = `Standard Yield (1x Bandage per craft)`;
        this.alchemyMoodEffectEl.style.color = '#9ca3af';
      }
    }

    // 3. Recipes list
    if (this.alchemyRecipesContainerEl) {
      this.alchemyRecipesContainerEl.innerHTML = '';
      for (const recipe of alchemyRecipes) {
        const woodCost = recipe.ingredients.wood || 0;
        const hasWood = gameState.getWood() >= woodCost;

        const card = document.createElement('div');
        card.style.cssText = 'background: rgba(31, 41, 55, 0.85); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px;';

        const craftLabel = yieldQuantity > 1 ? `⚗️ Craft ${yieldQuantity}x (+${recipe.expGranted} EXP)` : `⚗️ Craft (+${recipe.expGranted} EXP)`;
        const btnHtml = hasWood
          ? `<button type="button" class="btn-action" style="background: #059669; border-color: #34d399; font-size: 12px; padding: 6px 14px;" data-craft-recipe="${recipe.id}">${craftLabel}</button>`
          : `<button type="button" disabled style="background: #374151; color: #9ca3af; border: 1px solid #4b5563; border-radius: 6px; font-size: 12px; padding: 6px 14px; cursor: not-allowed;">Needs 🪵 ${woodCost} Wood</button>`;

        const yieldNotice = yieldQuantity > 1 ? `<span style="font-size: 11px; color: #34d399; font-weight: bold;">Yield: ${yieldQuantity}x Bandages</span>` : `<span style="font-size: 11px; color: #9ca3af;">Yield: 1x</span>`;

        card.innerHTML = `
          <div style="flex: 1;">
            <div style="font-size: 14px; font-weight: bold; color: #34d399; display: flex; align-items: center; gap: 8px;">
              <span>${recipe.name}</span>
              <span style="font-size: 11px; color: #fbbf24; font-weight: normal;">Cost: 🪵 ${woodCost} Wood</span>
              ${yieldNotice}
              <span style="font-size: 11px; color: #60a5fa; font-weight: normal;">+${recipe.expGranted} Alchemy EXP</span>
            </div>
            <div style="font-size: 11px; color: #9ca3af; margin-top: 3px;">${recipe.description}</div>
          </div>
          <div>${btnHtml}</div>
        `;

        const craftBtn = card.querySelector<HTMLButtonElement>(`[data-craft-recipe="${recipe.id}"]`);
        if (craftBtn) {
          craftBtn.onclick = () => {
            if (gameState.consumeWood(woodCost)) {
              gameState.addItem(recipe.id, yieldQuantity);
              progression.addProficiencyExp('alchemy', recipe.expGranted);
              const bonusText = yieldQuantity > 1 ? ` (${moodTier.name} ${yieldQuantity}x Bonus!)` : '';
              this.showToast(`⚗️ Crafted ${yieldQuantity}x ${recipe.name}!${bonusText} (+${recipe.expGranted} Alchemy EXP)`, 'success', 2500);
              this.renderAlchemyModal(player, progression);
              this.update(player, progression, 0);
            } else {
              this.showToast(`Not enough wood to craft ${recipe.name}!`, 'error');
            }
          };
        }

        this.alchemyRecipesContainerEl.appendChild(card);
      }
    }

    // 4. Patient treatment section
    const isBleeding = player.activeStatusEffects.has('bleed');
    const bandageCount = gameState.getItemCount('bandage');

    if (this.alchemyPlayerStatusEl) {
      if (isBleeding) {
        this.alchemyPlayerStatusEl.innerText = 'Bleeding (DoT Active)';
        this.alchemyPlayerStatusEl.style.color = '#ef4444';
      } else {
        this.alchemyPlayerStatusEl.innerText = 'Normal (No active wounds)';
        this.alchemyPlayerStatusEl.style.color = '#34d399';
      }
    }

    if (this.alchemyApplyBandageBtn) {
      if (bandageCount > 0 && isBleeding) {
        (this.alchemyApplyBandageBtn as HTMLButtonElement).disabled = false;
        this.alchemyApplyBandageBtn.style.opacity = '1';
        this.alchemyApplyBandageBtn.style.cursor = 'pointer';
        this.alchemyApplyBandageBtn.innerText = `🩹 Apply Bandage (${bandageCount} available) [H]`;
      } else if (bandageCount === 0) {
        (this.alchemyApplyBandageBtn as HTMLButtonElement).disabled = true;
        this.alchemyApplyBandageBtn.style.opacity = '0.5';
        this.alchemyApplyBandageBtn.style.cursor = 'not-allowed';
        this.alchemyApplyBandageBtn.innerText = `🩹 No Bandages Crafted`;
      } else {
        (this.alchemyApplyBandageBtn as HTMLButtonElement).disabled = false;
        this.alchemyApplyBandageBtn.style.opacity = '0.75';
        this.alchemyApplyBandageBtn.style.cursor = 'pointer';
        this.alchemyApplyBandageBtn.innerText = `🩹 Apply Bandage (${bandageCount} avail) [H]`;
      }
    }
  }

  // --- FIRST CURE RECIPE: APPLY BANDAGE (Milestone 6) ---

  public applyBandage(): boolean {
    const now = Date.now();
    if (now - this.lastBandageApplyTime < 200) {
      return false; // Debounce rapid keydown / scene key triggers
    }
    this.lastBandageApplyTime = now;

    const gameState = GameState.getInstance();
    const bandages = gameState.getItemCount('bandage');

    if (bandages <= 0) {
      this.showToast('No Bandages available in stockpile! Craft one at the Alchemy Station.', 'warn', 3000);
      return false;
    }

    if (!this.currentPlayer) {
      return false;
    }

    if (!this.currentPlayer.activeStatusEffects.has('bleed')) {
      this.showToast('Not bleeding — no need to apply Bandage.', 'info', 2500);
      return false;
    }

    const cured = this.currentPlayer.applyBandage();
    if (cured) {
      this.showToast('🩹 Bandage applied! Bleed status effect cleared.', 'success', 3000);
      if (this.currentProgression) {
        this.update(this.currentPlayer, this.currentProgression, 0);
        if (this.isAlchemyModalOpen()) {
          this.renderAlchemyModal(this.currentPlayer, this.currentProgression);
        }
      }
      return true;
    } else {
      this.showToast('No Bandages available in stockpile! Craft one at the Alchemy Station.', 'warn', 3000);
      return false;
    }
  }

  // --- DEBUG TOOLING FOR SKILL BOOKS & RESEARCH (Milestone 6) ---

  public debugGrantSkillBook(bookIdOrSkillId: string): void {
    const dataLoader = DataLoader.getInstance();
    let book = dataLoader.getSkillBook(bookIdOrSkillId);
    if (!book) {
      book = dataLoader.getSkillBookBySkillId(bookIdOrSkillId);
    }
    if (!book) {
      this.showToast(`Unknown Skill Book: ${bookIdOrSkillId}`, 'error');
      return;
    }

    if (!this.currentPlayer) return;

    const result = ResearchSystem.getInstance().consumeSkillBook(book, this.currentPlayer);
    this.showToast(result.message, result.action === 'learned_skill' ? 'success' : 'info', 4000);

    if (this.currentProgression) {
      this.update(this.currentPlayer, this.currentProgression, 0);
      if (this.isResearchTreeModalOpen()) {
        this.renderResearchTreeModal();
      }
      if (this.isLoadoutModalOpen()) {
        this.renderLoadoutModal(this.currentPlayer, this.currentProgression);
      }
    }
  }

  public debugGrantResearchPoints(amount: number = 10): void {
    GameState.getInstance().addResearchPoints(amount);
    const total = GameState.getInstance().getResearchPoints();
    this.showToast(`🔬 Granted +${amount} Research Points! (Total: ${total})`, 'success', 3000);
    if (this.isResearchTreeModalOpen()) {
      this.renderResearchTreeModal();
    }
  }

  public debugApplyBleed(): void {
    if (!this.currentPlayer) return;
    const bleedDef = DataLoader.getInstance().getStatusEffect('bleed');
    if (bleedDef) {
      this.currentPlayer.applyStatusEffect(bleedDef);
      this.showToast(`🩸 Applied Bleed status effect (6s DoT)!`, 'warn', 3000);
      if (this.currentProgression) {
        this.update(this.currentPlayer, this.currentProgression, 0);
        if (this.isAlchemyModalOpen()) {
          this.renderAlchemyModal(this.currentPlayer, this.currentProgression);
        }
      }
    }
  }

  public debugGrantBandage(amount: number = 1): void {
    GameState.getInstance().addItem('bandage', amount);
    this.showToast(`🩹 Granted +${amount} Bandage!`, 'success', 2500);
    if (this.currentPlayer && this.currentProgression) {
      this.update(this.currentPlayer, this.currentProgression, 0);
      if (this.isAlchemyModalOpen()) {
        this.renderAlchemyModal(this.currentPlayer, this.currentProgression);
      }
    }
  }

  // --- DEBUG TOOLING FOR DAY, FOOD & MOOD (Milestone 7) ---

  public debugAdvanceDay(days: number = 1): void {
    const spoiled = GameState.getInstance().advanceGameDay(days);
    const currentDay = GameState.getInstance().getCurrentGameDay();
    if (spoiled > 0) {
      this.showToast(`🌅 Advanced to Day ${currentDay} (⚠️ ${spoiled} Ration(s) spoiled and discarded)`, 'warn', 3500);
    } else {
      this.showToast(`🌅 Advanced to Day ${currentDay}`, 'info', 2000);
    }
    if (this.currentPlayer && this.currentProgression) {
      this.update(this.currentPlayer, this.currentProgression, 0);
    }
  }

  public debugGrantRation(count: number = 1): void {
    GameState.getInstance().addFoodItem('ration', count);
    const currentDay = GameState.getInstance().getCurrentGameDay();
    this.showToast(`🍖 Granted ${count}x Ration (Fresh on Day ${currentDay})`, 'success', 2500);
    if (this.currentPlayer && this.currentProgression) {
      this.update(this.currentPlayer, this.currentProgression, 0);
    }
  }

  public debugCycleHunger(): void {
    if (!this.currentPlayer) return;
    if (this.currentPlayer.hunger > 30) {
      this.currentPlayer.setHunger(25);
      this.showToast('🍽️ Debug Hunger set to 25 (Low / Auto-eat threshold)', 'warn', 2000);
    } else if (this.currentPlayer.hunger > 5) {
      this.currentPlayer.setHunger(0);
      this.showToast('🍽️ Debug Hunger set to 0 (Starving)', 'error', 2000);
    } else {
      this.currentPlayer.setHunger(100);
      this.showToast('🍽️ Debug Hunger set to 100 (Full)', 'success', 2000);
    }
    if (this.currentProgression) {
      this.update(this.currentPlayer, this.currentProgression, 0);
    }
  }

  public debugCycleMood(): void {
    if (!this.currentPlayer) return;
    if (this.currentPlayer.mood >= 70) {
      this.currentPlayer.setMood(50);
      this.showToast('🎭 Debug Mood set to 50 (Content)', 'info', 2000);
    } else if (this.currentPlayer.mood >= 30) {
      this.currentPlayer.setMood(15);
      this.showToast('🎭 Debug Mood set to 15 (Low / Miserable)', 'error', 2000);
    } else {
      this.currentPlayer.setMood(100);
      this.showToast('🎭 Debug Mood set to 100 (High / Ecstatic)', 'success', 2000);
    }
    if (this.currentProgression) {
      this.update(this.currentPlayer, this.currentProgression, 0);
    }
    if (this.isAlchemyModalOpen()) {
      this.renderAlchemyModal(this.currentPlayer, this.currentProgression!);
    }
  }

  public eatRation(): boolean {
    if (!this.currentPlayer) return false;
    const allFood = GameState.getInstance().getFoodItems();
    if (allFood.length <= 0) {
      this.showToast('No food in inventory!', 'error');
      return false;
    }
    const foodToEat = allFood[0];
    const ate = this.currentPlayer.eatFood(foodToEat.id);
    if (ate) {
      const foodDef = DataLoader.getInstance().getFood(foodToEat.id);
      const name = foodDef?.name || 'Food';
      const q = foodToEat.quality && foodToEat.quality !== 'common' ? ` [${foodToEat.quality}]` : '';
      this.showToast(`🍖 Ate ${name}${q}!`, 'success', 2500);
      if (this.currentProgression) {
        this.update(this.currentPlayer, this.currentProgression, 0);
      }
      if (this.isCookingModalOpen()) {
        this.renderCookingModal(this.currentPlayer, this.currentProgression!);
      }
    }
    return ate;
  }

  public eatFood(foodId: string): boolean {
    if (!this.currentPlayer) return false;
    if (GameState.getInstance().getFoodItemCount(foodId) <= 0) {
      this.showToast(`No ${foodId} in inventory!`, 'error');
      return false;
    }
    const ate = this.currentPlayer.eatFood(foodId);
    if (ate) {
      const foodDef = DataLoader.getInstance().getFood(foodId);
      const name = foodDef?.name || 'Food';
      this.showToast(`🍖 Ate ${name}!`, 'success', 2500);
      if (this.currentProgression) {
        this.update(this.currentPlayer, this.currentProgression, 0);
      }
      if (this.isCookingModalOpen()) {
        this.renderCookingModal(this.currentPlayer, this.currentProgression!);
      }
    }
    return ate;
  }

  public getStatDisplayName(statId: string): string {
    const dataLoader = DataLoader.getInstance();
    const statDef = dataLoader.getTrainableStatDef(statId);
    if (statDef?.name) return statDef.name;
    return statId.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  public getStatColor(statId: string): string {
    switch (statId) {
      case 'short_swords': return '#60a5fa';
      case 'daggers': return '#2dd4bf';
      case 'shields': return '#38bdf8';
      case 'dual_wielding': return '#c084fc';
      case 'construction': return '#f59e0b';
      case 'alchemy': return '#10b981';
      case 'foraging': return '#4ade80';
      case 'cooking': return '#f97316';
      default: return '#34d399';
    }
  }

  // --- COOKING STATION & RECIPE DISCOVERY (Milestone 10) ---

  public openCookingModal(player: Player, progression: ProgressionSystem): void {
    this.currentPlayer = player;
    this.currentProgression = progression;
    if (this.cookingModalEl) {
      this.cookingModalEl.classList.add('active');
      this.renderCookingModal(player, progression);
    }
  }

  public closeCookingModal(): void {
    if (this.cookingModalEl) {
      this.cookingModalEl.classList.remove('active');
    }
  }

  public isCookingModalOpen(): boolean {
    return this.cookingModalEl?.classList.contains('active') ?? false;
  }

  public updateCookingStockpileLive(): void {
    const gameState = GameState.getInstance();
    if (this.cookingStockpileHerbsEl) {
      this.setElementTextIfChanged(this.cookingStockpileHerbsEl, `${gameState.getItemCount('wild_herbs')}`);
    }
    if (this.cookingStockpileMonsterMeatEl) {
      this.setElementTextIfChanged(this.cookingStockpileMonsterMeatEl, `${gameState.getItemCount('monster_meat')}`);
    }
    if (this.cookingStockpileWolfMeatEl) {
      this.setElementTextIfChanged(this.cookingStockpileWolfMeatEl, `${gameState.getItemCount('wolf_meat')}`);
    }
  }

  public static calculateDishQuality(cookingLevel: number, maxQuality?: FoodQuality, rollOverride?: number): FoodQuality {
    const roll = rollOverride !== undefined ? rollOverride : Math.random();
    // Quality odds scaling with Cooking proficiency level
    // At Lv 0: Perfect 0%, Excellent 5%, Good 25%, Common 70%
    // At Lv 10: Perfect 6%, Excellent 14%, Good 28%, Common 52%
    // At Lv 30+: Perfect 18%, Excellent 32%, Good 34%, Common 16%
    // At Lv 50+: Perfect 30%, Excellent 45%, Good 20%, Common 5%
    const pPerfect = Math.min(0.35, cookingLevel * 0.006);
    const pExcellent = Math.min(0.45, 0.05 + cookingLevel * 0.009);
    const pGood = Math.min(0.35, 0.25 + cookingLevel * 0.003);

    let determined: FoodQuality = 'common';
    if (roll < pPerfect) {
      determined = 'perfect';
    } else if (roll < pPerfect + pExcellent) {
      determined = 'excellent';
    } else if (roll < pPerfect + pExcellent + pGood) {
      determined = 'good';
    } else {
      determined = 'common';
    }

    // HARD CEILING ENFORCEMENT:
    // Design doc: Monster Meat dishes hard-capped at Excellent; Wolf Meat can reach Perfect.
    if (maxQuality) {
      const tierRanks: Record<FoodQuality, number> = {
        common: 0,
        good: 1,
        excellent: 2,
        perfect: 3
      };
      if (tierRanks[determined] > tierRanks[maxQuality]) {
        determined = maxQuality;
      }
    }

    return determined;
  }

  public handleCookingExperiment(): void {
    if (!this.currentPlayer || !this.currentProgression) return;
    if (!this.cookingExpSlot1El || !this.cookingExpSlot2El) return;

    const slot1 = this.cookingExpSlot1El.value;
    const slot2 = this.cookingExpSlot2El.value;

    const gameState = GameState.getInstance();
    const herbsCount = gameState.getItemCount('wild_herbs');
    const monsterMeatCount = gameState.getItemCount('monster_meat');
    const wolfMeatCount = gameState.getItemCount('wolf_meat');

    const counts: Record<string, number> = {
      wild_herbs: herbsCount,
      monster_meat: monsterMeatCount,
      wolf_meat: wolfMeatCount
    };

    const needed: Record<string, number> = {};
    needed[slot1] = (needed[slot1] || 0) + 1;
    needed[slot2] = (needed[slot2] || 0) + 1;

    for (const [k, v] of Object.entries(needed)) {
      if ((counts[k] || 0) < v) {
        this.showToast(`Not enough ${k.replace(/_/g, ' ')} in stockpile!`, 'error');
        if (this.cookingExpStatusEl) {
          this.cookingExpStatusEl.innerText = `⚠️ Need at least ${v}x ${k.replace(/_/g, ' ')}.`;
          this.cookingExpStatusEl.style.color = '#ef4444';
        }
        return;
      }
    }

    const dataLoader = DataLoader.getInstance();
    const allRecipes = dataLoader.getCookingRecipes();

    // Find recipe matching slot1 + slot2
    const matchedRecipe = allRecipes.find((r) => {
      const keys = Object.keys(r.ingredients);
      if (keys.length !== 2) return false;
      return (
        keys.includes(slot1) &&
        keys.includes(slot2) &&
        r.ingredients[slot1] === 1 &&
        r.ingredients[slot2] === 1
      );
    });

    const cookingStat = this.currentProgression.getProficiencyStat('cooking');
    const cookingLevel = cookingStat.level;

    // Deduct raw ingredients
    gameState.consumeItem(slot1, 1);
    gameState.consumeItem(slot2, 1);

    if (matchedRecipe) {
      const isAlreadyKnown = gameState.isCookingRecipeDiscovered(matchedRecipe.id);

      if (isAlreadyKnown) {
        // RE-COMBINATION SAFETY NET: Already known! Routes straight to cooking without re-rolling discovery.
        const quality = HUD.calculateDishQuality(cookingLevel, matchedRecipe.maxQuality);
        gameState.addFoodItem(matchedRecipe.resultFoodId, 1, quality);
        this.currentProgression.addProficiencyExp('cooking', matchedRecipe.expGranted);

        const qualityBadge = quality.toUpperCase();
        this.showToast(`🍳 You already know how to make ${matchedRecipe.name}! Cooked 1x [${qualityBadge}].`, 'info', 3500);
        if (this.cookingExpStatusEl) {
          this.cookingExpStatusEl.innerText = `ℹ️ You already know how to make ${matchedRecipe.name}! Cooked 1x [${qualityBadge}]. (Use the Known Recipes list below to cook on demand).`;
          this.cookingExpStatusEl.style.color = '#38bdf8';
        }
      } else {
        // Undiscovered recipe: Roll discovery (85% base chance, guaranteed at Cooking Lv 1+)
        const discoveryRoll = Math.random();
        const discoverySuccess = cookingLevel >= 1 || discoveryRoll < 0.85;

        if (discoverySuccess) {
          gameState.discoverCookingRecipe(matchedRecipe.id);
          const quality = HUD.calculateDishQuality(cookingLevel, matchedRecipe.maxQuality);
          gameState.addFoodItem(matchedRecipe.resultFoodId, 1, quality);
          // Discovery bonus EXP
          const exp = matchedRecipe.expGranted + 20;
          this.currentProgression.addProficiencyExp('cooking', exp);

          const qualityBadge = quality.toUpperCase();
          this.showToast(`✨ RECIPE DISCOVERED: ${matchedRecipe.name}! Cooked 1x [${qualityBadge}] (+${exp} Cooking EXP)`, 'success', 4000);
          if (this.cookingExpStatusEl) {
            this.cookingExpStatusEl.innerText = `✨ DISCOVERY! Learned ${matchedRecipe.name} [${qualityBadge}]! Permanently added to Known Recipes below.`;
            this.cookingExpStatusEl.style.color = '#34d399';
          }
        } else {
          // Discovery mishap
          this.currentProgression.addProficiencyExp('cooking', 5);
          this.showToast('Experiment scorched the ingredients, but you gained +5 Cooking EXP.', 'warn', 3000);
          if (this.cookingExpStatusEl) {
            this.cookingExpStatusEl.innerText = '⚠️ Experiment scorched the ingredients. You gained +5 Cooking EXP. Try again!';
            this.cookingExpStatusEl.style.color = '#fbbf24';
          }
        }
      }
    } else {
      // Invalid combination
      this.currentProgression.addProficiencyExp('cooking', 5);
      this.showToast('The ingredients failed to produce a valid dish (+5 Cooking EXP).', 'warn', 3000);
      if (this.cookingExpStatusEl) {
        this.cookingExpStatusEl.innerText = '❌ Failed experiment — these ingredients do not form any known dish (+5 Cooking EXP).';
        this.cookingExpStatusEl.style.color = '#f87171';
      }
    }

    this.renderCookingModal(this.currentPlayer, this.currentProgression);
    this.update(this.currentPlayer, this.currentProgression, 0);
  }

  public renderCookingModal(player: Player, progression: ProgressionSystem): void {
    if (!this.cookingModalEl) return;

    const dataLoader = DataLoader.getInstance();
    const gameState = GameState.getInstance();

    // 1. Cooking proficiency
    const cookingStat = progression.getProficiencyStat('cooking');
    if (this.cookingModalProfEl) {
      if (cookingStat.level >= 1) {
        const nextExp = LevelingSystem.expForNextLevel(cookingStat.level);
        this.cookingModalProfEl.innerText = `Lv ${cookingStat.level} (${cookingStat.currentExp}/${nextExp} EXP)`;
        this.cookingModalProfEl.style.color = '#f97316';
      } else {
        this.cookingModalProfEl.innerText = `Untrained (${cookingStat.currentExp}/50 EXP)`;
        this.cookingModalProfEl.style.color = '#9ca3af';
      }
    }

    // 2. Narrowly scoped live ingredient counts
    const herbs = gameState.getItemCount('wild_herbs');
    const monsterMeat = gameState.getItemCount('monster_meat');
    const wolfMeat = gameState.getItemCount('wolf_meat');

    if (this.cookingStockpileHerbsEl) {
      this.cookingStockpileHerbsEl.innerText = `${herbs}`;
    }
    if (this.cookingStockpileMonsterMeatEl) {
      this.cookingStockpileMonsterMeatEl.innerText = `${monsterMeat}`;
    }
    if (this.cookingStockpileWolfMeatEl) {
      this.cookingStockpileWolfMeatEl.innerText = `${wolfMeat}`;
    }

    // 3. Known / Discovered Recipes
    if (this.cookingRecipesContainerEl) {
      this.cookingRecipesContainerEl.innerHTML = '';
      const allRecipes = dataLoader.getCookingRecipes();
      const discovered = allRecipes.filter((r) => gameState.isCookingRecipeDiscovered(r.id));

      if (discovered.length === 0) {
        this.cookingRecipesContainerEl.innerHTML = `
          <div style="font-size: 11px; color: #6b7280; font-style: italic; background: rgba(31, 41, 55, 0.4); padding: 10px; border-radius: 6px; text-align: center;">
            No recipes discovered yet. Combine raw ingredients in the Experimentation panel above!
          </div>
        `;
      } else {
        for (const recipe of discovered) {
          const card = document.createElement('div');
          card.style.cssText = 'background: rgba(31, 41, 55, 0.85); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px;';

          let canCook = true;
          const ingStrings: string[] = [];
          for (const [item, qty] of Object.entries(recipe.ingredients)) {
            const has = gameState.getItemCount(item);
            if (has < qty) canCook = false;
            const itemLabel = item.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            ingStrings.push(`${itemLabel} (${has}/${qty})`);
          }

          const ceilingBadge = recipe.maxQuality === 'excellent'
            ? `<span style="font-size: 10px; color: #f87171; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; border-radius: 3px; padding: 1px 5px;">Max: Excellent (Monster Meat)</span>`
            : `<span style="font-size: 10px; color: #a855f7; background: rgba(168, 85, 247, 0.2); border: 1px solid #a855f7; border-radius: 3px; padding: 1px 5px;">Max: Perfect (Wolf Meat)</span>`;

          const cookBtnHtml = canCook
            ? `<button type="button" class="btn-action" style="background: #ea580c; border-color: #f97316; font-size: 11px; padding: 5px 12px;" data-cook-recipe="${recipe.id}">🍲 Cook (+${recipe.expGranted} EXP)</button>`
            : `<button type="button" disabled style="background: #374151; color: #9ca3af; border: 1px solid #4b5563; border-radius: 6px; font-size: 11px; padding: 5px 12px; cursor: not-allowed;">Missing Ingredients</button>`;

          card.innerHTML = `
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: bold; color: #f97316;">
                <span>${recipe.name}</span>
                ${ceilingBadge}
                <span style="font-size: 10px; color: #60a5fa; font-weight: normal;">+${recipe.expGranted} Cooking EXP</span>
              </div>
              <div style="font-size: 10px; color: #9ca3af; margin-top: 2px;">${recipe.description}</div>
              <div style="font-size: 11px; color: ${canCook ? '#34d399' : '#fbbf24'}; margin-top: 4px;">
                Ingredients: ${ingStrings.join(', ')}
              </div>
            </div>
            <div>${cookBtnHtml}</div>
          `;

          const btn = card.querySelector<HTMLButtonElement>(`[data-cook-recipe="${recipe.id}"]`);
          if (btn) {
            btn.onclick = () => {
              for (const [item, qty] of Object.entries(recipe.ingredients)) {
                gameState.consumeItem(item, qty);
              }
              const quality = HUD.calculateDishQuality(cookingStat.level, recipe.maxQuality);
              gameState.addFoodItem(recipe.resultFoodId, 1, quality);
              progression.addProficiencyExp('cooking', recipe.expGranted);

              const qBadge = quality.toUpperCase();
              this.showToast(`🍲 Cooked 1x ${recipe.name} [${qBadge}]! (+${recipe.expGranted} Cooking EXP)`, 'success', 2500);
              this.renderCookingModal(player, progression);
              this.update(player, progression, 0);
            };
          }

          this.cookingRecipesContainerEl.appendChild(card);
        }
      }
    }

    // 4. Prepared Dishes In Pack (with Quick-Eat button)
    if (this.cookingDishesContainerEl) {
      this.cookingDishesContainerEl.innerHTML = '';
      const allFood = gameState.getFoodItems();

      if (allFood.length === 0) {
        this.cookingDishesContainerEl.innerHTML = `
          <div style="font-size: 11px; color: #6b7280; font-style: italic; background: rgba(31, 41, 55, 0.4); padding: 8px; border-radius: 6px; text-align: center;">
            No prepared food in pack.
          </div>
        `;
      } else {
        for (const item of allFood) {
          const foodDef = dataLoader.getFood(item.id);
          const name = foodDef?.name || item.id;
          const quality = item.quality || 'common';

          const qualityColors: Record<string, string> = {
            common: '#9ca3af',
            good: '#22c55e',
            excellent: '#3b82f6',
            perfect: '#eab308'
          };
          const color = qualityColors[quality] || '#9ca3af';

          const row = document.createElement('div');
          row.style.cssText = 'background: rgba(31, 41, 55, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 6px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;';

          const qDef = foodDef?.qualities?.[quality];
          const hungerAmt = qDef ? Math.round((foodDef?.hungerRestored || 30) * qDef.hungerMultiplier) : (foodDef?.hungerRestored || 30);
          const regenAmt = qDef ? qDef.hpRegenPerSec : (foodDef?.buff.hpRegenPerSec || 2);
          const durSec = Math.round((qDef ? qDef.buffDurationMs : (foodDef?.buff.durationMs || 15000)) / 1000);

          row.innerHTML = `
            <div>
              <span style="font-weight: bold; color: #f3f4f6;">${name}</span>
              <span style="font-weight: bold; color: ${color}; margin-left: 6px; font-size: 10px; text-transform: uppercase;">[${quality}]</span>
              <span style="color: #9ca3af; margin-left: 8px;">+${hungerAmt} Hunger, Well Fed (+${regenAmt} HP/s for ${durSec}s)</span>
            </div>
            <button type="button" class="btn-action" style="background: #15803d; border-color: #22c55e; font-size: 10px; padding: 3px 10px;" data-eat-food="${item.id}">Eat</button>
          `;

          const eatBtn = row.querySelector<HTMLButtonElement>(`[data-eat-food="${item.id}"]`);
          if (eatBtn) {
            eatBtn.onclick = () => {
              this.eatFood(item.id);
            };
          }

          this.cookingDishesContainerEl.appendChild(row);
        }
      }
    }
  }
}
