import type { Player } from '../entities/Player.ts';
import { ProgressionSystem } from '../systems/ProgressionSystem.ts';
import type { ClassDef, HiddenSkillDef, TrainableStat, FoodQuality, ExpTransaction, ArmorSlot, ResearchNodeDef, KnowledgeBaseTab } from '../types/game.ts';
import { getArmorHpSplit } from '../types/game.ts';
import { DataLoader } from '../utils/DataLoader.ts';
import { GameState } from '../systems/GameState.ts';
import { BuildingSystem } from '../systems/BuildingSystem.ts';
import { LevelingSystem } from '../systems/LevelingSystem.ts';
import { ResearchSystem } from '../systems/ResearchSystem.ts';

export interface AnnouncementItem {
  type: 'class' | 'skill';
  data: any;
  memberName: string;
  durationMs: number;
}

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
  private hudEnergyPotionRowEl: HTMLElement | null;
  private playerEnergyPotionTextEl: HTMLElement | null;
  private hudDrinkEnergyPotionBtn: HTMLElement | null;
  private hudManaPotionRowEl: HTMLElement | null;
  private playerManaPotionTextEl: HTMLElement | null;
  private hudDrinkManaPotionBtn: HTMLElement | null;
  private hudRevivePotionRowEl: HTMLElement | null;
  private playerRevivePotionTextEl: HTMLElement | null;
  private hudEscapeStoneRowEl: HTMLElement | null;
  private playerEscapeStoneTextEl: HTMLElement | null;
  private hudUseEscapeStoneBtn: HTMLElement | null;
  private alchemyModalEscapeStonesEl: HTMLElement | null;

  // Milestone 40: Teleporter Crystal Modal Elements
  private teleporterCrystalModalEl: HTMLElement | null;
  private crystalModalTitleEl: HTMLElement | null;
  private crystalModalSubtitleEl: HTMLElement | null;
  private crystalContinueLabelEl: HTMLElement | null;
  private crystalBtnContinue: HTMLElement | null;
  private crystalBtnReturn: HTMLElement | null;
  private crystalBtnStay: HTMLElement | null;
  private closeCrystalBtn: HTMLElement | null;
  private onCrystalContinueCallback?: () => void;
  private onCrystalReturnCallback?: () => void;

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
  private debugMemberSelectEl: HTMLSelectElement | null = null;
  private debugExpLogListEl: HTMLElement | null = null;
  private debugClearExpLogBtn: HTMLElement | null = null;
  private selectedDebugMemberIndex: number = 0;
  private renderedPartyMemberCount: number = 0;
  private lastPartyKey: string = '';
  private unsubscribeExpListener: (() => void) | null = null;
  private static isDebugSkillsVisible: boolean = false;
  private renderedDebugSkillsKey: string = '';
  private loadoutMemberSelectEl: HTMLSelectElement | null = null;
  private selectedLoadoutMemberIndex: number = 0;
  private lastRenderedLoadoutKey: string = '';

  // Announcement Queue
  private announcementQueue: AnnouncementItem[] = [];
  private isAnnouncementActive: boolean = false;
  private announcementTimer: any = null;
  private announcementTransitionTimer: any = null;
  private activeAnnouncementItem: AnnouncementItem | null = null;

  // Milestone 6 Modal Elements
  private researchTreeModalEl: HTMLElement | null;
  private closeResearchBtn: HTMLElement | null;
  private researchPointsCountEl: HTMLElement | null;
  private researchNodesContainerEl: HTMLElement | null;
  private handleResearchTreeResize: (() => void) | null = null;
  private alchemyModalEl: HTMLElement | null;
  private closeAlchemyBtn: HTMLElement | null;
  private alchemyModalProfEl: HTMLElement | null;
  private alchemyModalWoodEl: HTMLElement | null;
  private alchemyModalBandagesEl: HTMLElement | null;
  private alchemyModalEnergyPotionsEl: HTMLElement | null;
  private alchemyModalManaPotionsEl: HTMLElement | null;
  private alchemyModalRevivePotionsEl: HTMLElement | null;
  private alchemyRecipesContainerEl: HTMLElement | null;
  private alchemyPlayerStatusEl: HTMLElement | null;
  private alchemyApplyBandageBtn: HTMLElement | null;
  private alchemyApplyAntidoteBtn: HTMLElement | null;
  private alchemyModalAntidotesEl: HTMLElement | null;
  private debugBtnPoisonSelf: HTMLElement | null;
  private debugBtnGrantAntidote: HTMLElement | null;
  private lastAntidoteApplyTime: number = 0;

  // Milestone 19 & 31 Debug Buttons
  private debugBtnGrantEnergyPotion: HTMLElement | null;
  private debugBtnGrantManaPotion: HTMLElement | null;
  private debugBtnGrantRevivePotion: HTMLElement | null;
  private debugBtnDrainEnergy: HTMLElement | null;
  private debugBtnRestoreEnergy: HTMLElement | null;

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
  private static lastRenderedPartyRosterKey: string = '';
  private lastPartyStatsUpdateTime: number = 0;

  // Milestone 35 Elements (Paperdoll & Equipment Stash)
  private partyOverviewInventoryEl: HTMLElement | null;
  private partyInventoryItemListEl: HTMLElement | null;
  private partyInventoryFilter: 'all' | 'weapons' | 'armor' | 'jewelry' | 'items' = 'all';
  public activeDragPayload: { itemId: string; itemType: 'weapon' | 'armor'; itemSlot: string; sourceSlot?: string; sourceMemberIdx?: number } | null = null;

  // Milestone 8 Debug Buttons
  private debugBtnSpawnCompanion: HTMLElement | null;
  private debugBtnLv30SwordsDaggers: HTMLElement | null;
  private debugBtnGrantDaggersExp: HTMLElement | null;
  private debugBtnGrantDualWieldExp: HTMLElement | null;
  private debugBtnGrantWeapon680Exp: HTMLElement | null;

  // Milestone 14 Elements (Active Class & Debug Buttons)
  private activeClassContainerEl: HTMLElement | null;
  private activeClassCurrentBadgeEl: HTMLElement | null;
  private debugBtnActiveFencer: HTMLElement | null;
  private debugBtnActiveGuardian: HTMLElement | null;
  private debugBtnActiveVanguard: HTMLElement | null;
  private debugBtnActiveNone: HTMLElement | null;
  private debugBtnSetupVanguardReqs: HTMLElement | null;
  private debugBtnVanguardLv40: HTMLElement | null;
  private debugBtnGrantClassExp: HTMLElement | null;

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

  // Milestone 21 Modal Elements (Blacksmithing Station)
  private blacksmithingModalEl: HTMLElement | null;
  private closeBlacksmithingBtn: HTMLElement | null;
  private blacksmithingModalProfEl: HTMLElement | null;
  private blacksmithingStockpileOreEl: HTMLElement | null;
  private blacksmithingStockpileSteelScrapEl: HTMLElement | null;
  private blacksmithingStockpileOrcHeavyHideEl: HTMLElement | null;
  private blacksmithingRecipesContainerEl: HTMLElement | null;
  private blacksmithingStatusMsgEl: HTMLElement | null;

  // Milestone 28 Modal Elements (Armorsmithing Bench)
  private armorsmithingModalEl: HTMLElement | null;
  private closeArmorsmithingBtn: HTMLElement | null;
  private armorsmithingModalProfEl: HTMLElement | null;
  private armorsmithingStockpileWolfPeltEl: HTMLElement | null;
  private armorsmithingStockpileSpiderSilkEl: HTMLElement | null;
  private armorsmithingRecipesContainerEl: HTMLElement | null;
  private armorsmithingStatusMsgEl: HTMLElement | null;

  // Milestone 36 Elements (Bowyer Station)
  private bowyerModalEl: HTMLElement | null;
  private closeBowyerBtn: HTMLElement | null;
  private bowyerModalProfEl: HTMLElement | null;
  private bowyerStockpileWoodEl: HTMLElement | null;
  private bowyerStockpileSpiderSilkEl: HTMLElement | null;
  private bowyerStockpileBoneClawEl: HTMLElement | null;
  private bowyerRecipesContainerEl: HTMLElement | null;
  private bowyerStatusMsgEl: HTMLElement | null;

  // Milestone 16 Elements (Floor Timer & Respawn Debug)
  private floorTimerBadgeEl: HTMLElement | null;
  private debugBtnFastForwardFloorTimer: HTMLElement | null;
  private debugBtnTriggerFloorRespawn: HTMLElement | null;
  private debugBtnRespawnAllEnemies: HTMLElement | null;
  private debugBtnToggleAutoRespawn: HTMLElement | null;

  // Stockpile Overview Elements
  private stockpileModalEl: HTMLElement | null = null;
  private openStockpileBtn: HTMLElement | null = null;
  private closeStockpileBtn: HTMLElement | null = null;
  private stockpileSearchInputEl: HTMLInputElement | null = null;
  private stockpileClearSearchBtn: HTMLElement | null = null;
  private stockpileFilterTabsEl: HTMLElement | null = null;
  private stockpileToggleHeldBtn: HTMLElement | null = null;
  private stockpileToggleHeldLabelEl: HTMLElement | null = null;
  private stockpileToggleHeldIndicatorEl: HTMLElement | null = null;
  private stockpileItemsContainerEl: HTMLElement | null = null;
  private stockpileMetricDistinctEl: HTMLElement | null = null;
  private stockpileMetricTotalEl: HTMLElement | null = null;
  private stockpileMetricRpEl: HTMLElement | null = null;
  private stockpileMetricWoodEl: HTMLElement | null = null;
  private stockpileMetricOreEl: HTMLElement | null = null;
  private currentStockpileCategory: string = 'all';
  private stockpileSearchQuery: string = '';
  private showHeldOnly: boolean = false;
  private lastStockpileUpdateTime: number = 0;
  private renderedStockpileStructureKey: string = '';
  private static lastRenderedStockpileStructureKey: string = '';

  // Knowledge Base (Guild Codex) Elements & State (Milestone 50)
  private knowledgeBaseModalEl: HTMLElement | null = null;
  private openKnowledgeBtn: HTMLElement | null = null;
  private closeKnowledgeBtn: HTMLElement | null = null;
  private knowledgeSearchInputEl: HTMLInputElement | null = null;
  private knowledgeClearSearchBtn: HTMLElement | null = null;
  private knowledgeEntriesContainerEl: HTMLElement | null = null;
  private debugBtnDealDamage: HTMLElement | null = null;
  private knowledgeActiveTab: KnowledgeBaseTab = 'weapons';
  private knowledgeSearchQuery: string = '';
  private lastKnowledgeUpdateTime: number = 0;
  private lastKnowledgeStructureKey: string = '';

  public static readonly MAX_EXP_LOG_DOM_ENTRIES: number = 50;

  private static activeInstance: HUD | null = null;
  private static hasGlobalListeners: boolean = false;

  private isOutpost: boolean = false;
  private currentPlayer: Player | null = null;
  private currentProgression: ProgressionSystem | null = null;
  // Milestone 25: Party Portrait Selection
  private partyPortraitsHudEl: HTMLElement | null = null;
  private partyReselectAllBtn: HTMLElement | null = null;
  private portraitCardEls: (HTMLElement | null)[] = [];
  private portraitNameEls: (HTMLElement | null)[] = [];
  private portraitAvatarEls: (HTMLElement | null)[] = [];
  private portraitHpBarEls: (HTMLElement | null)[] = [];
  private portraitCritBarEls: (HTMLElement | null)[] = [];
  private portraitEnergyBarEls: (HTMLElement | null)[] = [];
  private portraitStatusEls: (HTMLElement | null)[] = [];
  private portraitHotkeyEls: (HTMLElement | null)[] = [];
  private gatheringModeBannerEl: HTMLElement | null = null;
  private gatheringModeBtnEl: HTMLElement | null = null;
  private selectedMemberIndices: Set<number> = new Set([0, 1, 2, 3]);
  private onSelectMemberCallback?: (index: number, multiSelect: boolean) => void;
  private onSelectAllMembersCallback?: () => void;
  private onBuildModeToggleCallback?: () => void;
  private onSelectBuildableCallback?: (id: string) => void;
  private onSetLeaderCallback?: (index: number) => void;
  private lastBandageApplyTime: number = 0;
  private hasSeenBandages: boolean = false;

  constructor() {
    this.renderedPartyRosterKey = HUD.lastRenderedPartyRosterKey;
    this.renderedStockpileStructureKey = HUD.lastRenderedStockpileStructureKey;

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
    this.debugMemberSelectEl = document.getElementById('debug-member-select') as HTMLSelectElement | null;
    this.debugExpLogListEl = document.getElementById('debug-exp-log-list');
    this.debugClearExpLogBtn = document.getElementById('debug-clear-exp-log-btn');

    // Milestone 25: Party Portrait Dock
    this.partyPortraitsHudEl = document.getElementById('party-portraits-hud');
    this.partyReselectAllBtn = document.getElementById('party-reselect-all-btn');

    this.gatheringModeBannerEl = document.getElementById('gathering-mode-banner');
    this.gatheringModeBtnEl = document.getElementById('gathering-mode-toggle-btn');

    this.portraitCardEls = [];
    this.portraitNameEls = [];
    this.portraitAvatarEls = [];
    this.portraitHpBarEls = [];
    this.portraitCritBarEls = [];
    this.portraitEnergyBarEls = [];
    this.portraitStatusEls = [];
    this.portraitHotkeyEls = [];

    for (let i = 0; i < 4; i++) {
      const card = document.getElementById(`party-portrait-${i}`);
      this.portraitCardEls.push(card);
      this.portraitNameEls.push(document.getElementById(`party-portrait-name-${i}`));
      this.portraitAvatarEls.push(document.getElementById(`party-portrait-avatar-${i}`));
      this.portraitHpBarEls.push(document.getElementById(`party-portrait-hp-bar-${i}`));
      this.portraitCritBarEls.push(document.getElementById(`party-portrait-crit-bar-${i}`));
      this.portraitEnergyBarEls.push(document.getElementById(`party-portrait-energy-bar-${i}`));
      this.portraitStatusEls.push(document.getElementById(`party-portrait-status-${i}`));
      this.portraitHotkeyEls.push(document.getElementById(`party-portrait-hotkey-${i}`));

      if (card) {
        card.onclick = (e: MouseEvent) => {
          e.stopPropagation();
          this.selectMemberByIndex(i, e.shiftKey);
        };
      }
    }

    // Click to dismiss modals early (cancels auto-dismiss timer immediately)
    if (this.unlockModalEl) {
      this.unlockModalEl.onclick = () => {
        this.dismissCurrentAnnouncement();
      };
    }
    if (this.skillDiscoveredModalEl) {
      this.skillDiscoveredModalEl.onclick = () => {
        this.dismissCurrentAnnouncement();
      };
    }

    // Party member selector in debug panel
    if (this.debugMemberSelectEl) {
      this.debugMemberSelectEl.onchange = () => {
        if (this.debugMemberSelectEl) {
          this.selectedDebugMemberIndex = parseInt(this.debugMemberSelectEl.value, 10) || 0;
          this.renderedDebugSkillsKey = '';
          const targetMember = (this.currentParty && this.currentParty[this.selectedDebugMemberIndex]) || this.currentPlayer;
          if (targetMember) {
            this.updateDebugSkillsPanel(targetMember.progression, targetMember.entityName);
          }
        }
      };
    }

    this.loadoutMemberSelectEl = document.getElementById('loadout-member-select') as HTMLSelectElement | null;
    if (this.loadoutMemberSelectEl) {
      this.loadoutMemberSelectEl.onchange = () => {
        if (this.loadoutMemberSelectEl) {
          this.selectedLoadoutMemberIndex = parseInt(this.loadoutMemberSelectEl.value, 10) || 0;
          const targetMember = (this.currentParty && this.currentParty[this.selectedLoadoutMemberIndex]) || this.currentPlayer;
          if (targetMember) {
            this.renderLoadoutModal(targetMember, targetMember.progression);
          }
        }
      };
    }

    // Clear EXP Log button
    if (this.debugClearExpLogBtn) {
      this.debugClearExpLogBtn.onclick = () => {
        ProgressionSystem.clearExpLog();
        if (this.debugExpLogListEl) {
          this.debugExpLogListEl.innerHTML = '';
        }
      };
    }

    // Subscribe to live EXP transactions
    this.unsubscribeExpListener = ProgressionSystem.onExpGranted((tx) => {
      this.appendExpLogEntry(tx);
    });

    // Hydrate existing EXP log transactions if any exist
    if (this.debugExpLogListEl) {
      this.debugExpLogListEl.innerHTML = '';
    }
    const existingLogs = ProgressionSystem.getExpLog();
    const recentLogs = existingLogs.slice(-HUD.MAX_EXP_LOG_DOM_ENTRIES);
    for (const tx of recentLogs) {
      this.appendExpLogEntry(tx);
    }

    this.hudAlchemyRowEl = document.getElementById('hud-alchemy-row');
    this.alchemyProfTextEl = document.getElementById('alchemy-prof-text');
    this.hudBandageRowEl = document.getElementById('hud-bandage-row');
    this.playerBandageTextEl = document.getElementById('player-bandage-text');
    this.hudApplyBandageBtn = document.getElementById('hud-apply-bandage-btn');
    this.hudEnergyPotionRowEl = document.getElementById('hud-energy-potion-row');
    this.playerEnergyPotionTextEl = document.getElementById('player-energy-potion-text');
    this.hudDrinkEnergyPotionBtn = document.getElementById('hud-drink-energy-potion-btn');
    this.hudManaPotionRowEl = document.getElementById('hud-mana-potion-row');
    this.playerManaPotionTextEl = document.getElementById('player-mana-potion-text');
    this.hudDrinkManaPotionBtn = document.getElementById('hud-drink-mana-potion-btn');
    this.hudRevivePotionRowEl = document.getElementById('hud-revive-potion-row');
    this.playerRevivePotionTextEl = document.getElementById('player-revive-potion-text');
    this.hudEscapeStoneRowEl = document.getElementById('hud-escape-stone-row');
    this.playerEscapeStoneTextEl = document.getElementById('player-escape-stone-text');
    this.hudUseEscapeStoneBtn = document.getElementById('hud-use-escape-stone-btn');

    this.teleporterCrystalModalEl = document.getElementById('teleporter-crystal-modal');
    this.crystalModalTitleEl = document.getElementById('crystal-modal-title');
    this.crystalModalSubtitleEl = document.getElementById('crystal-modal-subtitle');
    this.crystalContinueLabelEl = document.getElementById('crystal-continue-label');
    this.crystalBtnContinue = document.getElementById('crystal-btn-continue');
    this.crystalBtnReturn = document.getElementById('crystal-btn-return');
    this.crystalBtnStay = document.getElementById('crystal-btn-stay');
    this.closeCrystalBtn = document.getElementById('close-crystal-btn');

    this.researchTreeModalEl = document.getElementById('research-tree-modal');
    this.closeResearchBtn = document.getElementById('close-research-btn');
    this.researchPointsCountEl = document.getElementById('research-points-count');
    this.researchNodesContainerEl = document.getElementById('research-nodes-container');

    this.alchemyModalEl = document.getElementById('alchemy-modal');
    this.closeAlchemyBtn = document.getElementById('close-alchemy-btn');
    this.alchemyModalProfEl = document.getElementById('alchemy-modal-prof');
    this.alchemyModalWoodEl = document.getElementById('alchemy-modal-wood');
    this.alchemyModalBandagesEl = document.getElementById('alchemy-modal-bandages');
    this.alchemyModalEnergyPotionsEl = document.getElementById('alchemy-modal-energy-potions');
    this.alchemyModalManaPotionsEl = document.getElementById('alchemy-modal-mana-potions');
    this.alchemyModalRevivePotionsEl = document.getElementById('alchemy-modal-revive-potions');
    this.alchemyModalEscapeStonesEl = document.getElementById('alchemy-modal-escape-stones');
    this.alchemyRecipesContainerEl = document.getElementById('alchemy-recipes-container');
    this.alchemyPlayerStatusEl = document.getElementById('alchemy-player-status');
    this.alchemyApplyBandageBtn = document.getElementById('alchemy-apply-bandage-btn');
    this.alchemyApplyAntidoteBtn = document.getElementById('alchemy-apply-antidote-btn');
    this.alchemyModalAntidotesEl = document.getElementById('alchemy-modal-antidotes');
    this.debugBtnPoisonSelf = document.getElementById('debug-btn-poison-self');
    this.debugBtnGrantAntidote = document.getElementById('debug-btn-grant-antidote');

    // Milestone 19 & 31 Debug Buttons
    this.debugBtnGrantEnergyPotion = document.getElementById('debug-btn-grant-energy-potion');
    this.debugBtnGrantManaPotion = document.getElementById('debug-btn-grant-mana-potion');
    this.debugBtnGrantRevivePotion = document.getElementById('debug-btn-grant-revive-potion');
    this.debugBtnDrainEnergy = document.getElementById('debug-btn-drain-energy');
    this.debugBtnRestoreEnergy = document.getElementById('debug-btn-restore-energy');

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

    // Milestone 8 & Milestone 35 Elements
    this.partyOverviewModalEl = document.getElementById('party-overview-modal');
    this.closePartyBtn = document.getElementById('close-party-btn');
    this.partySpawnCompanionBtn = document.getElementById('party-spawn-companion-btn');
    this.partyOverviewRosterEl = document.getElementById('party-overview-roster');
    this.partyOverviewInventoryEl = document.getElementById('party-overview-inventory');
    this.partyInventoryItemListEl = document.getElementById('party-inventory-item-list');
    this.openPartyBtn = document.getElementById('open-party-btn');
    this.initPartyInventoryFilterTabs();

    this.debugBtnSpawnCompanion = document.getElementById('debug-btn-spawn-companion');
    this.debugBtnLv30SwordsDaggers = document.getElementById('debug-btn-lv30-swords-daggers');
    this.debugBtnGrantDaggersExp = document.getElementById('debug-btn-grant-daggers-exp');
    this.debugBtnGrantDualWieldExp = document.getElementById('debug-btn-grant-dual-wield-exp');
    this.debugBtnGrantWeapon680Exp = document.getElementById('debug-btn-grant-weapon-680-exp');

    // Milestone 14 Elements
    this.activeClassContainerEl = document.getElementById('active-class-container');
    this.activeClassCurrentBadgeEl = document.getElementById('active-class-current-badge');
    this.debugBtnActiveFencer = document.getElementById('debug-btn-active-fencer');
    this.debugBtnActiveGuardian = document.getElementById('debug-btn-active-guardian');
    this.debugBtnActiveVanguard = document.getElementById('debug-btn-active-vanguard');
    this.debugBtnActiveNone = document.getElementById('debug-btn-active-none');
    this.debugBtnSetupVanguardReqs = document.getElementById('debug-btn-setup-vanguard-reqs');
    this.debugBtnVanguardLv40 = document.getElementById('debug-btn-vanguard-lv40');
    this.debugBtnGrantClassExp = document.getElementById('debug-btn-grant-class-exp');

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

    // Milestone 21 Elements (Blacksmithing Station)
    this.blacksmithingModalEl = document.getElementById('blacksmithing-modal');
    this.closeBlacksmithingBtn = document.getElementById('close-blacksmithing-btn');
    this.blacksmithingModalProfEl = document.getElementById('blacksmithing-modal-prof');
    this.blacksmithingStockpileOreEl = document.getElementById('blacksmithing-stockpile-ore');
    this.blacksmithingStockpileSteelScrapEl = document.getElementById('blacksmithing-stockpile-steel-scrap');
    this.blacksmithingStockpileOrcHeavyHideEl = document.getElementById('blacksmithing-stockpile-orc-heavy-hide');
    this.blacksmithingRecipesContainerEl = document.getElementById('blacksmithing-recipes-container');
    this.blacksmithingStatusMsgEl = document.getElementById('blacksmithing-status-msg');

    if (this.closeBlacksmithingBtn) {
      this.closeBlacksmithingBtn.onclick = () => {
        HUD.activeInstance?.closeBlacksmithingModal();
      };
    }

    // Milestone 28 Elements (Armorsmithing Bench)
    this.armorsmithingModalEl = document.getElementById('armorsmithing-modal');
    this.closeArmorsmithingBtn = document.getElementById('close-armorsmithing-btn');
    this.armorsmithingModalProfEl = document.getElementById('armorsmithing-modal-prof');
    this.armorsmithingStockpileWolfPeltEl = document.getElementById('armorsmithing-stockpile-wolf-pelt');
    this.armorsmithingStockpileSpiderSilkEl = document.getElementById('armorsmithing-stockpile-spider-silk');
    this.armorsmithingRecipesContainerEl = document.getElementById('armorsmithing-recipes-container');
    this.armorsmithingStatusMsgEl = document.getElementById('armorsmithing-status-msg');

    if (this.closeArmorsmithingBtn) {
      this.closeArmorsmithingBtn.onclick = () => {
        HUD.activeInstance?.closeArmorsmithingModal();
      };
    }

    // Milestone 36 Elements (Bowyer Station)
    this.bowyerModalEl = document.getElementById('bowyer-modal');
    this.closeBowyerBtn = document.getElementById('close-bowyer-btn');
    this.bowyerModalProfEl = document.getElementById('bowyer-modal-prof');
    this.bowyerStockpileWoodEl = document.getElementById('bowyer-stockpile-wood');
    this.bowyerStockpileSpiderSilkEl = document.getElementById('bowyer-stockpile-spider-silk');
    this.bowyerStockpileBoneClawEl = document.getElementById('bowyer-stockpile-bone-claw');
    this.bowyerRecipesContainerEl = document.getElementById('bowyer-recipes-container');
    this.bowyerStatusMsgEl = document.getElementById('bowyer-status-msg');

    if (this.closeBowyerBtn) {
      this.closeBowyerBtn.onclick = () => {
        HUD.activeInstance?.closeBowyerModal();
      };
    }

    // Milestone 16 Elements
    this.floorTimerBadgeEl = document.getElementById('floor-timer-badge');
    this.debugBtnFastForwardFloorTimer = document.getElementById('debug-btn-fast-forward-floor-timer');
    this.debugBtnTriggerFloorRespawn = document.getElementById('debug-btn-trigger-floor-respawn');
    this.debugBtnRespawnAllEnemies = document.getElementById('debug-btn-respawn-all-enemies');
    this.debugBtnToggleAutoRespawn = document.getElementById('debug-btn-toggle-auto-respawn');

    // Stockpile Overview Elements
    this.stockpileModalEl = document.getElementById('stockpile-modal');
    this.openStockpileBtn = document.getElementById('open-stockpile-btn');
    this.closeStockpileBtn = document.getElementById('close-stockpile-btn');
    this.stockpileSearchInputEl = document.getElementById('stockpile-search-input') as HTMLInputElement | null;
    this.stockpileClearSearchBtn = document.getElementById('stockpile-clear-search-btn');
    this.stockpileFilterTabsEl = typeof document?.querySelector === 'function'
      ? document.querySelector('.stockpile-filter-tabs')
      : null;
    this.stockpileToggleHeldBtn = document.getElementById('stockpile-toggle-held-btn');
    this.stockpileToggleHeldLabelEl = document.getElementById('stockpile-toggle-held-label');
    this.stockpileToggleHeldIndicatorEl = document.getElementById('stockpile-toggle-held-indicator');
    this.stockpileItemsContainerEl = document.getElementById('stockpile-items-container');
    this.stockpileMetricDistinctEl = document.getElementById('stockpile-metric-distinct');
    this.stockpileMetricTotalEl = document.getElementById('stockpile-metric-total');
    this.stockpileMetricRpEl = document.getElementById('stockpile-metric-rp');
    this.stockpileMetricWoodEl = document.getElementById('stockpile-metric-wood');
    this.stockpileMetricOreEl = document.getElementById('stockpile-metric-ore');

    try {
      if (this.stockpileItemsContainerEl && !this.stockpileItemsContainerEl.children.length) {
        this.renderStockpileModal(false);
      }
    } catch {
      // DataLoader may not be initialized yet in test harnesses
    }

    if (this.openStockpileBtn) {
      this.openStockpileBtn.onclick = () => {
        HUD.activeInstance?.toggleStockpileModal();
      };
    }
    if (this.closeStockpileBtn) {
      this.closeStockpileBtn.onclick = () => {
        HUD.activeInstance?.closeStockpileModal();
      };
    }
    if (this.stockpileClearSearchBtn && this.stockpileSearchInputEl) {
      this.stockpileClearSearchBtn.onclick = () => {
        if (this.stockpileSearchInputEl) {
          this.stockpileSearchInputEl.value = '';
          this.stockpileSearchQuery = '';
          HUD.activeInstance?.renderStockpileModal(true);
        }
      };
    }
    if (this.stockpileSearchInputEl) {
      this.stockpileSearchInputEl.oninput = (e) => {
        this.stockpileSearchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
        HUD.activeInstance?.renderStockpileModal(true);
      };
    }
    if (this.stockpileToggleHeldBtn) {
      this.stockpileToggleHeldBtn.onclick = () => {
        this.showHeldOnly = !this.showHeldOnly;
        this.updateHeldToggleUI();
        HUD.activeInstance?.renderStockpileModal(true);
      };
    }
    this.initStockpileFilterTabs();

    // Knowledge Base Elements (Milestone 50)
    this.knowledgeBaseModalEl = document.getElementById('knowledge-base-modal');
    this.openKnowledgeBtn = document.getElementById('open-knowledge-btn');
    this.closeKnowledgeBtn = document.getElementById('close-knowledge-btn');
    this.knowledgeSearchInputEl = document.getElementById('knowledge-search-input') as HTMLInputElement | null;
    this.knowledgeClearSearchBtn = document.getElementById('knowledge-clear-search-btn');
    this.knowledgeEntriesContainerEl = document.getElementById('knowledge-entries-container');
    this.debugBtnDealDamage = document.getElementById('debug-btn-deal-damage');

    try {
      if (this.knowledgeEntriesContainerEl && !this.knowledgeEntriesContainerEl.children.length) {
        this.renderKnowledgeBaseModal(false);
      }
    } catch {
      // DataLoader may not be initialized yet in test harnesses
    }

    if (this.openKnowledgeBtn) {
      this.openKnowledgeBtn.onclick = () => {
        HUD.activeInstance?.toggleKnowledgeBaseModal();
      };
    }
    if (this.closeKnowledgeBtn) {
      this.closeKnowledgeBtn.onclick = () => {
        HUD.activeInstance?.closeKnowledgeBaseModal();
      };
    }
    if (this.knowledgeClearSearchBtn && this.knowledgeSearchInputEl) {
      this.knowledgeClearSearchBtn.onclick = () => {
        if (this.knowledgeSearchInputEl) {
          this.knowledgeSearchInputEl.value = '';
          this.knowledgeSearchQuery = '';
          HUD.activeInstance?.renderKnowledgeBaseModal(true);
        }
      };
    }
    if (this.knowledgeSearchInputEl) {
      this.knowledgeSearchInputEl.oninput = (e) => {
        this.knowledgeSearchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
        HUD.activeInstance?.renderKnowledgeBaseModal(true);
      };
    }
    if (this.debugBtnDealDamage) {
      this.debugBtnDealDamage.onclick = () => {
        (window as any).__dealDebugDamage?.(5);
      };
    }
    this.initKnowledgeTabButtons();

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

    if (HUD.activeInstance && HUD.activeInstance !== this) {
      HUD.activeInstance.destroy();
    }
    HUD.activeInstance = this;
    this.setupListeners();
  }

  private setupListeners(): void {
    if (this.partyReselectAllBtn) {
      this.partyReselectAllBtn.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        HUD.activeInstance?.triggerGroupReselect();
      };
    }

    if (this.gatheringModeBtnEl) {
      this.gatheringModeBtnEl.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        HUD.activeInstance?.triggerGatheringModeToggle();
      };
    }

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

    if (this.alchemyApplyAntidoteBtn) {
      this.alchemyApplyAntidoteBtn.onclick = () => {
        HUD.activeInstance?.applyAntidote();
      };
    }

    if (this.hudApplyBandageBtn) {
      this.hudApplyBandageBtn.onclick = () => {
        HUD.activeInstance?.applyBandage();
      };
    }

    // Debug Actions in Debug Panel
    if (this.debugBtnPoisonSelf) {
      this.debugBtnPoisonSelf.onclick = () => {
        HUD.activeInstance?.debugApplyPoison();
      };
    }
    if (this.debugBtnGrantAntidote) {
      this.debugBtnGrantAntidote.onclick = () => {
        HUD.activeInstance?.debugGrantAntidote(1);
      };
    }
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
    if (this.debugBtnGrantWeapon680Exp) {
      this.debugBtnGrantWeapon680Exp.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          const weaponId = hero.equippedWeapon?.id || 'short_swords';
          const weaponName = hero.equippedWeapon?.name || 'Weapon';
          hero.progression.addProficiencyExp(weaponId, 680);
          HUD.activeInstance?.showToast(`+680 ${weaponName} EXP (Level 10 Fencer Gate)`, 'success', 3000);
          if (HUD.activeInstance) {
            HUD.activeInstance.update(hero, hero.progression, 0, HUD.activeInstance.currentParty);
          }
        }
      };
    }

    // Milestone 14 Debug Actions: 4 Explicit Active Class buttons + Vanguard Setup & Class EXP
    if (this.debugBtnActiveFencer) {
      this.debugBtnActiveFencer.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          hero.setActiveClass('fencer');
          HUD.activeInstance?.showToast('🎯 Hero Active Class set to Fencer', 'success');
          if (HUD.activeInstance) {
            HUD.activeInstance.update(hero, hero.progression, 0, HUD.activeInstance.currentParty);
            if (HUD.activeInstance.isLoadoutModalOpen()) {
              HUD.activeInstance.renderLoadoutModal(hero, hero.progression);
            }
          }
        }
      };
    }
    if (this.debugBtnActiveGuardian) {
      this.debugBtnActiveGuardian.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          hero.setActiveClass('guardian');
          HUD.activeInstance?.showToast('🎯 Hero Active Class set to Guardian', 'success');
          if (HUD.activeInstance) {
            HUD.activeInstance.update(hero, hero.progression, 0, HUD.activeInstance.currentParty);
            if (HUD.activeInstance.isLoadoutModalOpen()) {
              HUD.activeInstance.renderLoadoutModal(hero, hero.progression);
            }
          }
        }
      };
    }
    if (this.debugBtnActiveVanguard) {
      this.debugBtnActiveVanguard.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          hero.setActiveClass('vanguard');
          HUD.activeInstance?.showToast('🎯 Hero Active Class set to Vanguard', 'success');
          if (HUD.activeInstance) {
            HUD.activeInstance.update(hero, hero.progression, 0, HUD.activeInstance.currentParty);
            if (HUD.activeInstance.isLoadoutModalOpen()) {
              HUD.activeInstance.renderLoadoutModal(hero, hero.progression);
            }
          }
        }
      };
    }
    if (this.debugBtnActiveNone) {
      this.debugBtnActiveNone.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          hero.setActiveClass(null);
          HUD.activeInstance?.showToast('🎯 Hero Active Class cleared (None)', 'info');
          if (HUD.activeInstance) {
            HUD.activeInstance.update(hero, hero.progression, 0, HUD.activeInstance.currentParty);
            if (HUD.activeInstance.isLoadoutModalOpen()) {
              HUD.activeInstance.renderLoadoutModal(hero, hero.progression);
            }
          }
        }
      };
    }
    if (this.debugBtnSetupVanguardReqs) {
      this.debugBtnSetupVanguardReqs.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          hero.progression.getProficiencyStat('short_swords').level = 30;
          hero.progression.getProficiencyStat('short_swords').currentExp = 0;
          hero.progression.getProficiencyStat('shields').level = 30;
          hero.progression.getProficiencyStat('shields').currentExp = 0;
          hero.progression.setClassLevel('fencer', 5);
          hero.progression.setClassLevel('guardian', 5);
          hero.progression.checkClassUnlocks();
          hero.checkSkillUnlocks();
          HUD.activeInstance?.showToast('🛡️ Vanguard Requirements Fulfilled! Class UNLOCKED!', 'success', 4000);
          if (HUD.activeInstance) {
            HUD.activeInstance.update(hero, hero.progression, 0, HUD.activeInstance.currentParty);
            if (HUD.activeInstance.isLoadoutModalOpen()) {
              HUD.activeInstance.renderLoadoutModal(hero, hero.progression);
            }
          }
        }
      };
    }
    if (this.debugBtnVanguardLv40) {
      this.debugBtnVanguardLv40.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          hero.progression.setClassLevel('vanguard', 40);
          hero.setActiveClass('vanguard');
          hero.checkSkillUnlocks();
          HUD.activeInstance?.showToast('🛡️ Vanguard set to Lv40 (All 5 Vanguard Skills Unlocked)!', 'success', 4000);
          if (HUD.activeInstance) {
            HUD.activeInstance.update(hero, hero.progression, 0, HUD.activeInstance.currentParty);
            if (HUD.activeInstance.isLoadoutModalOpen()) {
              HUD.activeInstance.renderLoadoutModal(hero, hero.progression);
            }
          }
        }
      };
    }
    if (this.debugBtnGrantClassExp) {
      this.debugBtnGrantClassExp.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          if (hero.activeClass) {
            hero.progression.addClassExp(hero.activeClass, 25);
            HUD.activeInstance?.showToast(`✨ +25 Class EXP granted to ${hero.activeClass}`, 'success');
            hero.checkSkillUnlocks();
          } else {
            HUD.activeInstance?.showToast('Hero has no active class equipped!', 'error');
          }
          if (HUD.activeInstance) {
            HUD.activeInstance.update(hero, hero.progression, 0, HUD.activeInstance.currentParty);
            if (HUD.activeInstance.isLoadoutModalOpen()) {
              HUD.activeInstance.renderLoadoutModal(hero, hero.progression);
            }
          }
        }
      };
    }

    // Milestone 16 Debug Buttons
    if (this.debugBtnFastForwardFloorTimer) {
      this.debugBtnFastForwardFloorTimer.onclick = () => {
        if (typeof (window as any).__fastForwardFloorTimer === 'function') {
          (window as any).__fastForwardFloorTimer(60);
        }
      };
    }
    if (this.debugBtnTriggerFloorRespawn) {
      this.debugBtnTriggerFloorRespawn.onclick = () => {
        if (typeof (window as any).__triggerFloorRespawn === 'function') {
          (window as any).__triggerFloorRespawn();
        }
      };
    }
    if (this.debugBtnRespawnAllEnemies) {
      this.debugBtnRespawnAllEnemies.onclick = () => {
        if (typeof (window as any).__respawnEnemies === 'function') {
          (window as any).__respawnEnemies();
          HUD.activeInstance?.showToast('💀 All enemies respawned and reset.', 'warn', 2500);
        }
      };
    }
    if (this.debugBtnToggleAutoRespawn) {
      this.debugBtnToggleAutoRespawn.onclick = () => {
        if (typeof (window as any).__toggleAutoRespawn === 'function') {
          (window as any).__toggleAutoRespawn();
        }
      };
    }

    // Milestone 19 Potion HUD Button Handlers
    if (this.hudDrinkEnergyPotionBtn) {
      this.hudDrinkEnergyPotionBtn.onclick = () => {
        HUD.activeInstance?.drinkEnergyPotion();
      };
    }
    if (this.hudDrinkManaPotionBtn) {
      this.hudDrinkManaPotionBtn.onclick = () => {
        HUD.activeInstance?.drinkManaPotion();
      };
    }
    if (this.hudUseEscapeStoneBtn) {
      this.hudUseEscapeStoneBtn.onclick = () => {
        HUD.activeInstance?.useEscapeStone();
      };
    }

    // Milestone 40: Teleporter Crystal Modal Button Handlers
    if (this.crystalBtnContinue) {
      this.crystalBtnContinue.onclick = () => {
        const active = HUD.activeInstance;
        const cb = active?.onCrystalContinueCallback;
        active?.closeTeleporterCrystalModal();
        cb?.();
      };
    }
    if (this.crystalBtnReturn) {
      this.crystalBtnReturn.onclick = () => {
        const active = HUD.activeInstance;
        const cb = active?.onCrystalReturnCallback;
        active?.closeTeleporterCrystalModal();
        cb?.();
      };
    }
    if (this.crystalBtnStay) {
      this.crystalBtnStay.onclick = () => {
        HUD.activeInstance?.closeTeleporterCrystalModal();
      };
    }
    if (this.closeCrystalBtn) {
      this.closeCrystalBtn.onclick = () => {
        HUD.activeInstance?.closeTeleporterCrystalModal();
      };
    }

    // Milestone 19 Debug Buttons
    if (this.debugBtnGrantEnergyPotion) {
      this.debugBtnGrantEnergyPotion.onclick = () => {
        GameState.getInstance().addItem('energy_potion', 1);
        HUD.activeInstance?.showToast('🧪 Granted +1 Energy Potion', 'success');
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero && HUD.activeInstance?.currentProgression) {
          HUD.activeInstance.update(hero, HUD.activeInstance.currentProgression, 0, HUD.activeInstance.currentParty);
          if (HUD.activeInstance.isAlchemyModalOpen()) {
            HUD.activeInstance.renderAlchemyModal(hero, HUD.activeInstance.currentProgression);
          }
        }
      };
    }
    if (this.debugBtnGrantManaPotion) {
      this.debugBtnGrantManaPotion.onclick = () => {
        GameState.getInstance().addItem('mana_potion', 1);
        HUD.activeInstance?.showToast('🧪 Granted +1 Mana Potion', 'success');
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero && HUD.activeInstance?.currentProgression) {
          HUD.activeInstance.update(hero, HUD.activeInstance.currentProgression, 0, HUD.activeInstance.currentParty);
          if (HUD.activeInstance.isAlchemyModalOpen()) {
            HUD.activeInstance.renderAlchemyModal(hero, HUD.activeInstance.currentProgression);
          }
        }
      };
    }
    if (this.debugBtnGrantRevivePotion) {
      this.debugBtnGrantRevivePotion.onclick = () => {
        GameState.getInstance().addItem('revive_potion', 1);
        HUD.activeInstance?.showToast('💛 Granted +1 Revive Potion', 'success');
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero && HUD.activeInstance?.currentProgression) {
          HUD.activeInstance.update(hero, HUD.activeInstance.currentProgression, 0, HUD.activeInstance.currentParty);
          if (HUD.activeInstance.isAlchemyModalOpen()) {
            HUD.activeInstance.renderAlchemyModal(hero, HUD.activeInstance.currentProgression);
          }
        }
      };
    }
    if (this.debugBtnDrainEnergy) {
      this.debugBtnDrainEnergy.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          hero.energy = 0;
          HUD.activeInstance?.showToast('⚡ Hero Energy drained to 0', 'warn');
          if (HUD.activeInstance?.currentProgression) {
            HUD.activeInstance.update(hero, HUD.activeInstance.currentProgression, 0, HUD.activeInstance.currentParty);
          }
        }
      };
    }
    if (this.debugBtnRestoreEnergy) {
      this.debugBtnRestoreEnergy.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          hero.energy = hero.maxEnergy;
          HUD.activeInstance?.showToast('⚡ Hero Energy restored to full', 'success');
          if (HUD.activeInstance?.currentProgression) {
            HUD.activeInstance.update(hero, HUD.activeInstance.currentProgression, 0, HUD.activeInstance.currentParty);
          }
        }
      };
    }

    // Milestone 38 Debug Buttons: Lockpicking & Locked Box
    const debugBtnGrantLockedBox = document.getElementById('debug-btn-grant-locked-box');
    if (debugBtnGrantLockedBox) {
      debugBtnGrantLockedBox.onclick = () => {
        GameState.getInstance().addItem('locked_box', 1);
        HUD.activeInstance?.showToast('📦 Granted +1 Locked Box', 'success');
        HUD.activeInstance?.renderPartyInventoryPanel();
      };
    }

    const debugBtnGrant5LockedBoxes = document.getElementById('debug-btn-grant-5-locked-boxes');
    if (debugBtnGrant5LockedBoxes) {
      debugBtnGrant5LockedBoxes.onclick = () => {
        GameState.getInstance().addItem('locked_box', 5);
        HUD.activeInstance?.showToast('📦 Granted +5 Locked Boxes', 'success');
        HUD.activeInstance?.renderPartyInventoryPanel();
      };
    }

    const debugBtnGrantLockpickingExp = document.getElementById('debug-btn-grant-lockpicking-exp');
    if (debugBtnGrantLockpickingExp) {
      debugBtnGrantLockpickingExp.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          hero.progression.addProficiencyExp('lockpicking', 25);
          HUD.activeInstance?.showToast('🗝️ Granted +25 Lockpicking EXP to Hero', 'success');
          HUD.activeInstance?.updatePartyOverviewLiveStats();
        }
      };
    }

    const debugBtnSetLockpickingLv10 = document.getElementById('debug-btn-set-lockpicking-lv10');
    if (debugBtnSetLockpickingLv10) {
      debugBtnSetLockpickingLv10.onclick = () => {
        const hero = HUD.activeInstance?.currentParty[0] || HUD.activeInstance?.currentPlayer;
        if (hero) {
          const stat = hero.progression.getProficiencyStat('lockpicking');
          stat.level = 10;
          stat.currentExp = 0;
          hero.progression.checkClassUnlocks();
          HUD.activeInstance?.showToast('🗝️ Set Hero Lockpicking to Level 10!', 'success');
          HUD.activeInstance?.updatePartyOverviewLiveStats();
        }
      };
    }

    const debugBtnGrantLockpick = document.getElementById('debug-btn-grant-lockpick');
    if (debugBtnGrantLockpick) {
      debugBtnGrantLockpick.onclick = () => {
        GameState.getInstance().addItem('lockpick', 3);
        HUD.activeInstance?.showToast('🗝️ Granted +3 Lockpicks', 'success');
        HUD.activeInstance?.renderPartyInventoryPanel();
      };
    }

    // Expose debug helpers globally on window for console testing
    (window as any).debugGrantLockpick = (count: number = 3) => {
      GameState.getInstance().addItem('lockpick', count);
      HUD.activeInstance?.renderPartyInventoryPanel();
    };
    (window as any).debugGrantLockedBox = (count: number = 1) => {
      GameState.getInstance().addItem('locked_box', count);
      HUD.activeInstance?.renderPartyInventoryPanel();
    };
    (window as any).debugAttemptLockpick = (memberIndex?: number) => {
      HUD.activeInstance?.handleLockpickBox(memberIndex);
    };
    (window as any).debugGrantSkillBook = (id: string = 'book_power_strike') => HUD.activeInstance?.debugGrantSkillBook(id);
    (window as any).debugGrantResearchPoints = (amount: number = 10) => HUD.activeInstance?.debugGrantResearchPoints(amount);
    (window as any).debugApplyBleed = () => HUD.activeInstance?.debugApplyBleed();
    (window as any).debugApplyBandage = () => HUD.activeInstance?.applyBandage();
    (window as any).debugApplyPoison = () => HUD.activeInstance?.debugApplyPoison();
    (window as any).debugApplyAntidote = () => HUD.activeInstance?.applyAntidote();
    (window as any).debugGrantAntidote = (count: number = 1) => HUD.activeInstance?.debugGrantAntidote(count);
    (window as any).debugDrinkEnergyPotion = () => HUD.activeInstance?.drinkEnergyPotion();
    (window as any).debugDrinkManaPotion = () => HUD.activeInstance?.drinkManaPotion();
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
      // Key listeners: Tab (toggle HUD panel), L (toggle Loadout modal), B (toggle Build mode), H (apply bandage), E (drink energy potion), P (drink mana potion), O (toggle Party modal), Escape (close modals)
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
          const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
          if (targetTag !== 'input' && targetTag !== 'textarea' && targetTag !== 'select') {
            if (active.isOutpost) {
              active.onBuildModeToggleCallback?.();
            }
          }
        } else if (e.key === 'h' || e.key === 'H') {
          active.applyBandage();
        } else if (e.key === 'j' || e.key === 'J') {
          active.applyAntidote();
        } else if (e.key === 'e' || e.key === 'E') {
          // If not typing in input or select element
          const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
          if (targetTag !== 'input' && targetTag !== 'textarea' && targetTag !== 'select') {
            active.drinkEnergyPotion();
          }
        } else if (e.key === 'p' || e.key === 'P' || e.code === 'KeyP') {
          const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
          if (targetTag !== 'input' && targetTag !== 'textarea' && targetTag !== 'select') {
            active.drinkManaPotion();
          }
        } else if (e.key === 'o' || e.key === 'O' || e.code === 'KeyO') {
          active.togglePartyOverviewModal();
        } else if (e.key === 'i' || e.key === 'I' || e.code === 'KeyI') {
          const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
          if (targetTag !== 'input' && targetTag !== 'textarea' && targetTag !== 'select') {
            active.toggleStockpileModal();
          }
        } else if (e.key === 'k' || e.key === 'K' || e.code === 'KeyK') {
          const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
          if (targetTag !== 'input' && targetTag !== 'textarea' && targetTag !== 'select') {
            active.toggleKnowledgeBaseModal();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          active.debugAdvanceDay(1);
        } else if (e.key === 'u' || e.key === 'U') {
          active.debugCycleHunger();
        } else if (e.key === 'm' || e.key === 'M') {
          active.debugCycleMood();
        } else if (e.key === 'g' || e.key === 'G' || e.code === 'KeyG') {
          const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
          if (targetTag !== 'input' && targetTag !== 'textarea' && targetTag !== 'select') {
            active.triggerGroupReselect();
          }
        } else if (e.key === 'f' || e.key === 'F' || e.code === 'KeyF') {
          const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
          if (targetTag !== 'input' && targetTag !== 'textarea' && targetTag !== 'select') {
            active.triggerGatheringModeToggle();
          }
        } else if (e.key >= '1' && e.key <= '4') {
          const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
          if (targetTag !== 'input' && targetTag !== 'textarea' && targetTag !== 'select') {
            const idx = parseInt(e.key, 10) - 1;
            active.selectMemberByIndex(idx, e.shiftKey);
          }
        } else if (e.key === 't' || e.key === 'T' || e.code === 'KeyT') {
          const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
          if (targetTag !== 'input' && targetTag !== 'textarea' && targetTag !== 'select') {
            active.useEscapeStone();
          }
        } else if (e.key === 'Escape') {
          active.triggerGatheringModeToggle(false);
          if (active.isAnnouncementShowing()) {
            active.dismissCurrentAnnouncement();
          }
          active.closeStockpileModal();
          active.closeKnowledgeBaseModal();
          active.closeTeleporterCrystalModal();
          active.closeLoadoutModal();
          active.closeResearchTreeModal();
          active.closeAlchemyModal();
          active.closeCookingModal?.();
          active.closeBlacksmithingModal?.();
          active.closeArmorsmithingModal?.();
          active.closeBowyerModal?.();
          active.closePartyOverviewModal();
          if (active.isBuildOverlayVisible()) {
            active.onBuildModeToggleCallback?.();
          }
        } else if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
          if (active.isAnnouncementShowing()) {
            e.preventDefault();
            active.dismissCurrentAnnouncement();
          }
        }
      });
    }
  }

  public triggerGatheringModeToggle(forceState?: boolean): boolean {
    if (!this.isOutpost) {
      const scene = (window as any).game?.scene?.getScene('MainScene');
      if (scene && typeof scene.toggleGatheringMode === 'function') {
        return scene.toggleGatheringMode(forceState);
      }
    }
    return false;
  }

  public setGatheringModeActive(active: boolean): void {
    if (this.gatheringModeBannerEl) {
      this.gatheringModeBannerEl.style.display = active ? 'block' : 'none';
    }
    if (this.gatheringModeBtnEl) {
      if (active) {
        this.gatheringModeBtnEl.classList.add('active');
      } else {
        this.gatheringModeBtnEl.classList.remove('active');
      }
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
          if (b.requiredProficiency) {
            const currentLevel = this.currentProgression ? this.currentProgression.getProficiencyLevel(b.requiredProficiency.proficiency) : 0;
            if (currentLevel < b.requiredProficiency.level) {
              continue; // Gated behind profession level (e.g. Seed Maker @ Gardening 25)!
            }
          }
          const effCost = BuildingSystem.getEffectiveBuildCost(b.woodCost, constructionLevel);
          const isActive = b.id === selectedId;
          const displayName = b.name.replace('Wood ', '');
          const costBadgeHtml = (b.clayCost && b.clayCost > 0) ? `🏺 ${b.clayCost} Clay` : `🪵 ${effCost}`;
          html += `
            <div class="palette-item ${isActive ? 'active' : ''}" data-buildable-id="${b.id}">
              <span class="palette-name">${displayName}</span>
              <span class="palette-cost" id="cost-badge-${b.id}">${costBadgeHtml}</span>
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
        const targetMember = (this.currentParty && this.currentParty[this.selectedDebugMemberIndex]) || this.currentPlayer;
        if (targetMember) {
          this.updateDebugSkillsPanel(targetMember.progression, targetMember.entityName);
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
        const targetMember = (this.currentParty && this.currentParty[this.selectedDebugMemberIndex]) || this.currentPlayer;
        if (targetMember) {
          this.updateDebugSkillsPanel(targetMember.progression, targetMember.entityName);
        }
      } else {
        this.debugSkillsPanelEl.classList.remove('active');
      }
    }
  }

  public updateDebugSkillsPanel(progression: ProgressionSystem, memberName?: string): void {
    if (!HUD.isDebugSkillsVisible || !this.debugSkillsListEl) return;

    const name = memberName || progression.ownerName || 'Guild Hero';
    const stats = progression.getAllProficiencyStats();
    const classStats = progression.getAllClassStats();
    let key = `${name}:`;
    for (const [id, stat] of stats.entries()) {
      key += `${id}:${stat.level}:${stat.currentExp},`;
    }
    for (const [id, stat] of classStats.entries()) {
      key += `cls_${id}:${stat.level}:${stat.currentExp},`;
    }

    if (this.renderedDebugSkillsKey !== key) {
      this.renderedDebugSkillsKey = key;
      let html = '';
      for (const [id, stat] of stats.entries()) {
        const nextExp = LevelingSystem.expForNextLevel(stat.level);
        html += `<div class="debug-skill-row"><span class="debug-skill-id">${id}:</span> Level ${stat.level} (${stat.currentExp}/${nextExp} EXP)</div>`;
      }
      if (classStats.size > 0) {
        html += `<div style="font-size: 10px; color: #f59e0b; font-weight: bold; margin-top: 4px; border-top: 1px solid rgba(245,158,11,0.2); padding-top: 2px;">CLASSES</div>`;
        for (const [id, stat] of classStats.entries()) {
          const nextExp = LevelingSystem.expForNextLevel(stat.level);
          const clsDef = DataLoader.getInstance().getClass(id);
          const clsName = clsDef?.name ?? id;
          const isUnlocked = progression.isClassUnlocked(id);
          const status = isUnlocked ? `Level ${stat.level} (${stat.currentExp}/${nextExp} EXP)` : `Locked`;
          html += `<div class="debug-skill-row"><span class="debug-skill-id" style="color: #34d399;">${clsName}:</span> ${status}</div>`;
        }
      }
      this.debugSkillsListEl.innerHTML = html;
    }
  }

  public appendExpLogEntry(tx: ExpTransaction): void {
    if (!this.debugExpLogListEl) return;
    const entry = document.createElement('div');
    entry.className = 'debug-exp-entry';
    entry.innerHTML = `<span class="exp-amount">+${tx.amount} EXP</span> <span class="exp-id">${tx.id}</span> <span class="exp-member">(${tx.memberName})</span>`;
    this.debugExpLogListEl.appendChild(entry);
    while (this.debugExpLogListEl.children.length > HUD.MAX_EXP_LOG_DOM_ENTRIES) {
      this.debugExpLogListEl.removeChild(this.debugExpLogListEl.firstChild!);
    }
    this.debugExpLogListEl.scrollTop = this.debugExpLogListEl.scrollHeight;
  }

  public setLocation(name: string, isOutpost: boolean, customColor?: string): void {
    this.isOutpost = isOutpost;
    HUD.activeInstance = this;

    if (this.locationBadgeEl) {
      this.locationBadgeEl.innerText = name.toUpperCase();
      this.locationBadgeEl.style.color = customColor ? customColor : (isOutpost ? '#34d399' : '#a78bfa');
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
    } else if (this.floorTimerBadgeEl) {
      this.floorTimerBadgeEl.style.display = 'none';
    }

    if (this.partyPortraitsHudEl) {
      this.partyPortraitsHudEl.style.display = isOutpost ? 'none' : 'flex';
    }
  }

  public updateFloorTimer(remainingMs: number, _totalDurationMs: number): void {
    if (this.isOutpost) {
      if (this.floorTimerBadgeEl) {
        this.floorTimerBadgeEl.style.display = 'none';
      }
      return;
    }

    if (this.floorTimerBadgeEl) {
      this.floorTimerBadgeEl.style.display = 'block';
      const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
      this.floorTimerBadgeEl.innerText = `⏳ Floor Respawn: ${formatted}`;
      this.floorTimerBadgeEl.style.color = totalSec <= 30 ? '#ef4444' : totalSec <= 60 ? '#f59e0b' : '#f87171';
    }
  }

  public updateDebugAutoRespawnBtn(enabled: boolean): void {
    if (this.debugBtnToggleAutoRespawn) {
      this.debugBtnToggleAutoRespawn.innerText = `🔄 Toggle Debug 3s Respawn: ${enabled ? 'ON' : 'OFF'}`;
      this.debugBtnToggleAutoRespawn.style.background = enabled ? '#b45309' : '#374151';
      this.debugBtnToggleAutoRespawn.style.borderColor = enabled ? '#f59e0b' : '#4b5563';
      this.debugBtnToggleAutoRespawn.style.color = enabled ? '#fef08a' : '#d1d5db';
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

    const activeMember = (this.currentParty && this.currentParty[this.selectedLoadoutMemberIndex]) || player;
    this.renderLoadoutModal(activeMember, activeMember.progression);

    if (this.loadoutModalEl) {
      this.loadoutModalEl.classList.add('active');
    }
  }

  private renderLoadoutModal(player: Player, progression: ProgressionSystem): void {
    if (!this.equipSlotsContainerEl || !this.knownSkillsContainerEl) return;

    const dataLoader = DataLoader.getInstance();
    const equipped = player.equippedSkillIds;
    const known = player.knownSkillIds;

    // Populate Loadout member selector
    if (this.loadoutMemberSelectEl) {
      const party = (this.currentParty && this.currentParty.length > 0) ? this.currentParty : [player];
      let optionsHtml = '';
      for (let i = 0; i < party.length; i++) {
        const m = party[i];
        const label = i === 0 ? `${m.entityName || 'Leader'} (Leader)` : `${m.entityName || `Companion ${i}`}`;
        optionsHtml += `<option value="${i}">${label}</option>`;
      }
      this.loadoutMemberSelectEl.innerHTML = optionsHtml;
      if (this.selectedLoadoutMemberIndex < party.length) {
        this.loadoutMemberSelectEl.value = this.selectedLoadoutMemberIndex.toString();
      } else {
        this.selectedLoadoutMemberIndex = 0;
        this.loadoutMemberSelectEl.value = '0';
      }
    }

    if (this.slotsCountBadgeEl) {
      this.slotsCountBadgeEl.innerText = `${equipped.length} / 5 Slots`;
    }

    // 0. Render Active Class Selection Shelf (Milestone 14)
    if (this.activeClassCurrentBadgeEl) {
      if (player.activeClass) {
        const clsDef = dataLoader.getClass(player.activeClass);
        const clsLvl = progression.getClassLevel(player.activeClass);
        this.activeClassCurrentBadgeEl.innerText = `Active: ${clsDef?.name ?? player.activeClass} (Lv ${clsLvl})`;
      } else {
        this.activeClassCurrentBadgeEl.innerText = 'Active: None';
      }
    }

    if (this.activeClassContainerEl) {
      this.activeClassContainerEl.innerHTML = '';
      const classes = dataLoader.getClasses();
      for (const cls of classes) {
        const isUnlocked = progression.isClassUnlocked(cls.id);
        // Hidden-Until-Earned: locked classes DO NOT render at all (zero cards, zero placeholders)
        if (!isUnlocked) continue;

        const isActive = player.activeClass === cls.id;
        const clsStat = progression.getClassStat(cls.id);
        const nextExp = LevelingSystem.expForNextLevel(clsStat.level);

        const card = document.createElement('div');
        card.className = `active-class-card ${isActive ? 'active-selected' : ''}`;

        const badgeHtml = isActive
          ? `<span class="active-class-badge badge-active">ACTIVE</span>`
          : `<span class="active-class-badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981;">UNLOCKED</span>`;

        let actionBtnHtml = '';
        if (isActive) {
          actionBtnHtml = `<button type="button" class="active-class-btn btn-unequip" data-unequip-class="${cls.id}">Unequip</button>`;
        } else {
          actionBtnHtml = `<button type="button" class="active-class-btn btn-equip" data-equip-class="${cls.id}">Set Active</button>`;
        }

        card.innerHTML = `
          <div class="active-class-card-header">
            <span class="active-class-name">${cls.name}</span>
            ${badgeHtml}
          </div>
          <div class="active-class-info">
            <span>Level ${clsStat.level} (${clsStat.currentExp}/${nextExp} EXP)</span>
          </div>
          <div style="font-size: 10px; color: #9ca3af; font-style: italic;">${cls.fantasy}</div>
          <div style="margin-top: auto; display: flex; justify-content: flex-end;">
            ${actionBtnHtml}
          </div>
        `;

        const equipBtn = card.querySelector(`[data-equip-class="${cls.id}"]`) as HTMLElement;
        if (equipBtn) {
          equipBtn.onclick = () => {
            player.setActiveClass(cls.id);
            this.showToast(`🎯 Active Class set to ${cls.name}`, 'success');
            this.renderLoadoutModal(player, progression);
            this.update(player, progression, 0, this.currentParty);
          };
        }

        const unequipBtn = card.querySelector(`[data-unequip-class="${cls.id}"]`) as HTMLElement;
        if (unequipBtn) {
          unequipBtn.onclick = () => {
            player.setActiveClass(null);
            this.showToast('🎯 Active Class cleared (None)', 'info');
            this.renderLoadoutModal(player, progression);
            this.update(player, progression, 0, this.currentParty);
          };
        }

        this.activeClassContainerEl.appendChild(card);
      }
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
          ? skillDef.shieldAmount
            ? `${skillDef.energyCost} EN | ${skillDef.cooldownMs / 1000}s CD | +${skillDef.shieldAmount} Shield`
            : skillDef.healPerTick
            ? `${skillDef.energyCost} EN | ${skillDef.cooldownMs / 1000}s CD | +${skillDef.healPerTick} HP/s HoT`
            : skillDef.healAmount && skillDef.damageMultiplier
            ? `${skillDef.energyCost} EN | ${skillDef.cooldownMs / 1000}s CD | ${(skillDef.damageMultiplier * 100).toFixed(0)}% DMG / +${skillDef.healAmount} HP`
            : skillDef.healAmount
            ? `${skillDef.energyCost} EN | ${skillDef.cooldownMs / 1000}s CD | +${skillDef.healAmount} HP`
            : skillDef.damageMultiplier
            ? `${skillDef.energyCost} EN | ${skillDef.cooldownMs / 1000}s CD | ${(skillDef.damageMultiplier * 100).toFixed(0)}% DMG`
            : `${skillDef.energyCost} EN | ${skillDef.cooldownMs / 1000}s CD`
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
      // Hidden-Until-Earned: locked skills DO NOT render at all (zero cards, no "(Requires Class)" preview)
      if (!isUnlocked) continue;

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
        : `<button type="button" style="background: #2563eb; color: #fff; border: none; border-radius: 4px; padding: 3px 10px; font-size: 11px; font-weight: bold; cursor: pointer;" data-equip="${skillId}">+ Equip</button>`;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div class="skill-name">${skillDef.name}</div>
          <div>${statusBadge}</div>
        </div>
        <div class="skill-desc">${skillDef.description || 'Deals weapon damage.'}</div>
        <div class="skill-stats">
          <span>Cost: ${skillDef.energyCost} Energy</span>
          <span>Cooldown: ${skillDef.cooldownMs / 1000}s</span>
          <span>${
            skillDef.shieldAmount
              ? `Shield: +${skillDef.shieldAmount}`
              : skillDef.healPerTick
              ? `HoT: +${skillDef.healPerTick} HP/s`
              : skillDef.healAmount && skillDef.damageMultiplier
              ? `Nova: ${(skillDef.damageMultiplier * 100).toFixed(0)}% DMG / +${skillDef.healAmount} HP`
              : skillDef.healAmount
              ? `Heal: +${skillDef.healAmount} HP`
              : skillDef.damageMultiplier
              ? `Damage: ${(skillDef.damageMultiplier * 100).toFixed(0)}%`
              : `Support`
          }</span>
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

    // Keep party overview structural DOM in sync with roster changes
    try {
      const rosterKey = this.getPartyRosterKey();
      if (this.partyOverviewRosterEl && this.renderedPartyRosterKey !== rosterKey && this.currentParty.length > 0) {
        this.renderPartyOverviewModal(false);
      }
    } catch {
      // DataLoader may not be initialized yet in test harnesses
    }

    // Milestone 25: Update party portrait dock
    this.updatePartyPortraits(this.currentParty);

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

    const weaponDef = player.equippedWeapon;
    const weaponId = weaponDef.id;
    const profId = weaponDef.proficiencyId ?? ((weaponId.endsWith('_staff') || weaponId === 'staff') ? 'staff' : weaponId);
    const stat = progression.getProficiencyStat(profId);
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
          let classSuffix = '';
          if (player.activeClass) {
            const clsDef = DataLoader.getInstance().getClass(player.activeClass);
            const clsLvl = progression.getClassLevel(player.activeClass);
            classSuffix = ` [${clsDef?.name ?? player.activeClass} Lv ${clsLvl}]`;
          }
          this.profEl.innerText = `Level ${stat.level} (${stat.currentExp}/${nextExp} EXP) [${tierText}]${classSuffix}`;
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

    // 4b4. Energy Potion Stockpile
    if (this.hudEnergyPotionRowEl && this.playerEnergyPotionTextEl) {
      const energyPotCount = GameState.getInstance().getItemCount('energy_potion');
      const isAlchemyUnlocked = GameState.getInstance().isBuildableUnlocked('alchemy_station');
      if (energyPotCount > 0 || isAlchemyUnlocked) {
        this.hudEnergyPotionRowEl.style.display = 'flex';
        this.playerEnergyPotionTextEl.innerText = `${energyPotCount}`;
      } else {
        this.hudEnergyPotionRowEl.style.display = 'none';
      }
    }

    // 4b5. Mana Potion Stockpile
    if (this.hudManaPotionRowEl && this.playerManaPotionTextEl) {
      const manaPotCount = GameState.getInstance().getItemCount('mana_potion');
      const isAlchemyUnlocked = GameState.getInstance().isBuildableUnlocked('alchemy_station');
      if (manaPotCount > 0 || isAlchemyUnlocked) {
        this.hudManaPotionRowEl.style.display = 'flex';
        this.playerManaPotionTextEl.innerText = `${manaPotCount}`;
      } else {
        this.hudManaPotionRowEl.style.display = 'none';
      }
    }

    // 4b6. Revive Potion Stockpile
    if (this.hudRevivePotionRowEl && this.playerRevivePotionTextEl) {
      const revivePotCount = GameState.getInstance().getItemCount('revive_potion');
      const isAlchemyUnlocked = GameState.getInstance().isBuildableUnlocked('alchemy_station');
      if (revivePotCount > 0 || isAlchemyUnlocked) {
        this.hudRevivePotionRowEl.style.display = 'flex';
        this.playerRevivePotionTextEl.innerText = `${revivePotCount}`;
      } else {
        this.hudRevivePotionRowEl.style.display = 'none';
      }
    }

    // 4b7. Escape Stone Stockpile (Milestone 40)
    if (this.hudEscapeStoneRowEl && this.playerEscapeStoneTextEl) {
      const escapeStoneCount = GameState.getInstance().getItemCount('escape_stone');
      const isAlchemyUnlocked = GameState.getInstance().isBuildableUnlocked('alchemy_station');
      if (escapeStoneCount > 0 || isAlchemyUnlocked) {
        this.hudEscapeStoneRowEl.style.display = 'flex';
        this.playerEscapeStoneTextEl.innerText = `${escapeStoneCount}`;
      } else {
        this.hudEscapeStoneRowEl.style.display = 'none';
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
      const equipped = player.equippedSkillIds || [];
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
      } else if (player.activeStatusEffects.has('burn')) {
        this.playerStatusEl.innerText = 'Burning (DoT)';
        this.playerStatusEl.style.color = '#f97316';
      } else if (player.activeStatusEffects.has('poison')) {
        this.playerStatusEl.innerText = 'Poisoned (Persistent DoT)';
        this.playerStatusEl.style.color = '#16a34a';
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

    // Sync Debug Member Select dropdown options
    if (this.debugMemberSelectEl && this.currentParty) {
      const party = this.currentParty;
      const partyKey = party.map(m => m.entityName).join('|');
      if (this.lastPartyKey !== partyKey || this.renderedPartyMemberCount !== party.length) {
        this.lastPartyKey = partyKey;
        this.renderedPartyMemberCount = party.length;
        let optionsHtml = '';
        for (let i = 0; i < party.length; i++) {
          const m = party[i];
          const label = i === 0 ? `${m.entityName || 'Leader'} (Leader)` : `${m.entityName || `Companion ${i}`}`;
          optionsHtml += `<option value="${i}">${label}</option>`;
        }
        const prevVal = this.selectedDebugMemberIndex;
        this.debugMemberSelectEl.innerHTML = optionsHtml;
        if (prevVal < party.length) {
          this.debugMemberSelectEl.value = prevVal.toString();
        } else {
          this.selectedDebugMemberIndex = 0;
          this.debugMemberSelectEl.value = '0';
        }
      }
    }

    // 9. Live All-Skills Debug Overview Panel (Backtick toggle)
    const targetMember = (this.currentParty && this.currentParty[this.selectedDebugMemberIndex]) || player;
    this.updateDebugSkillsPanel(targetMember.progression, targetMember.entityName);

    // 10. Update Party Overview modal if open
    if (this.isPartyOverviewModalOpen()) {
      this.updatePartyOverview(time);
    }

    // 10b. Update Stockpile Overview modal live if open
    if (this.isStockpileModalOpen()) {
      this.updateStockpile(time);
    }

    // 10c. Update Knowledge Base modal live if open
    if (this.isKnowledgeBaseModalOpen()) {
      this.updateKnowledgeBase(time);
    }

    // 11. Update Cooking Station modal live if open
    if (this.isCookingModalOpen()) {
      this.updateCookingStockpileLive();
    }

    // 12. Update Skill Loadout modal live if open
    if (this.isLoadoutModalOpen()) {
      const activeMember = (this.currentParty && this.currentParty[this.selectedLoadoutMemberIndex]) || player;
      if (activeMember) {
        const loadoutKey = `${activeMember.entityName}:${activeMember.activeClass}:${activeMember.progression.getSnapshotData().unlockedClasses.join(',')}:${activeMember.knownSkillIds.join(',')}:${activeMember.equippedSkillIds.join(',')}`;
        if (this.lastRenderedLoadoutKey !== loadoutKey) {
          this.lastRenderedLoadoutKey = loadoutKey;
          this.renderLoadoutModal(activeMember, activeMember.progression);
        }
      }
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
      const helmet = m.equippedHelmet?.id || 'none';
      const bodyArmor = m.equippedBodyArmor?.id || 'none';
      const necklace = m.equippedNecklace?.id || 'none';
      const ring = m.equippedRing?.id || 'none';
      const accessory = m.equippedAccessory?.id || 'none';
      const equippedSkills = m.equippedSkillIds.join(',');
      const knownSkills = m.knownSkillIds.join(',');
      const invKey = Array.from(m.inventory?.entries() || []).map(([k, v]) => `${k}:${v}`).sort().join(';');
      const encKey = `${m.isEncumbered}:${m.getTotalWeight()}`;
      return `${m.id}:${m.entityName}:${m.state}:${mainWpn}:${offWpn}:${helmet}:${bodyArmor}:${necklace}:${ring}:${accessory}:${isDw}:${equippedSkills}:${knownSkills}:${invKey}:${encKey}`;
    }).join('|');
  }

  public openPartyOverviewModal(): void {
    this.renderPartyOverviewModal(false);
    if (this.partyOverviewModalEl) {
      this.partyOverviewModalEl.classList.add('active');
    }
  }

  public closePartyOverviewModal(): void {
    if (this.partyOverviewModalEl) {
      this.partyOverviewModalEl.classList.remove('active');
    }
  }

  // --- PARTY PORTRAIT SELECTION (Milestone 25) ---

  public setPartySelectionHandler(
    onSelect: (index: number, multiSelect: boolean) => void,
    onSelectAll: () => void
  ): void {
    this.onSelectMemberCallback = onSelect;
    this.onSelectAllMembersCallback = onSelectAll;
  }

  public setPartyLeaderChangeHandler(onSetLeader: (index: number) => void): void {
    this.onSetLeaderCallback = onSetLeader;
  }

  public setSelectedMemberIndices(indices: Set<number> | number[]): void {
    this.selectedMemberIndices = new Set(indices);
    this.renderPartyPortraitSelection();
  }

  public getSelectedMemberIndices(): Set<number> {
    return new Set(this.selectedMemberIndices);
  }

  public triggerGroupReselect(): void {
    this.selectedMemberIndices.clear();
    const count = Math.max(1, this.currentParty.length);
    for (let i = 0; i < count; i++) {
      this.selectedMemberIndices.add(i);
    }
    this.renderPartyPortraitSelection();
    this.onSelectAllMembersCallback?.();
  }

  public selectMemberByIndex(index: number, multiSelect: boolean = false): void {
    if (index >= this.currentParty.length) return; // Ignore clicks on empty slots

    if (!multiSelect) {
      this.selectedMemberIndices.clear();
      this.selectedMemberIndices.add(index);
    } else {
      if (this.selectedMemberIndices.has(index)) {
        if (this.selectedMemberIndices.size > 1) {
          this.selectedMemberIndices.delete(index);
        }
      } else {
        this.selectedMemberIndices.add(index);
      }
    }
    this.renderPartyPortraitSelection();
    this.onSelectMemberCallback?.(index, multiSelect);
  }

  public renderPartyPortraitSelection(): void {
    for (let i = 0; i < 4; i++) {
      const card = this.portraitCardEls[i];
      const statusEl = this.portraitStatusEls[i];
      if (!card) continue;

      const isOccupied = i < this.currentParty.length;
      if (!isOccupied) {
        card.classList.remove('selected', 'downed');
        card.classList.add('empty');
        if (statusEl) statusEl.innerText = 'EMPTY';
        continue;
      }

      card.classList.remove('empty');
      const member = this.currentParty[i];
      const isDowned = member.state === 'downed';

      if (isDowned) {
        card.classList.add('downed');
      } else {
        card.classList.remove('downed');
      }

      if (this.selectedMemberIndices.has(i)) {
        card.classList.add('selected');
        if (statusEl) {
          statusEl.innerText = isDowned ? 'DOWNED' : (member.isEncumbered ? '⚠️ ENC' : '✓ ACTIVE');
        }
      } else {
        card.classList.remove('selected');
        if (statusEl) {
          statusEl.innerText = isDowned ? 'DOWNED' : (member.isEncumbered ? '⚠️ ENC' : `[${i + 1}]`);
        }
      }
    }
  }

  public updatePartyPortraits(party?: Player[]): void {
    if (party && party.length > 0) {
      this.currentParty = party;
    }
    const currentList = this.currentParty;

    // Prune any selection indices that exceed the current party size
    for (const idx of Array.from(this.selectedMemberIndices)) {
      if (idx >= currentList.length) {
        this.selectedMemberIndices.delete(idx);
      }
    }
    if (this.selectedMemberIndices.size === 0 && currentList.length > 0) {
      for (let i = 0; i < currentList.length; i++) {
        this.selectedMemberIndices.add(i);
      }
    }

    if (this.partyPortraitsHudEl) {
      this.partyPortraitsHudEl.style.display = this.isOutpost ? 'none' : 'flex';
    }

    for (let i = 0; i < 4; i++) {
      const card = this.portraitCardEls[i];
      const nameEl = this.portraitNameEls[i];
      const avatarEl = this.portraitAvatarEls[i];
      const hpBarEl = this.portraitHpBarEls[i];
      const critBarEl = this.portraitCritBarEls[i];
      const energyBarEl = this.portraitEnergyBarEls[i];
      const statusEl = this.portraitStatusEls[i];
      const hotkeyEl = this.portraitHotkeyEls[i];

      if (!card) continue;

      if (i < currentList.length) {
        const member = currentList[i];
        card.classList.remove('empty');

        if (nameEl) nameEl.innerText = member.entityName || (i === 0 ? 'Leader' : `Comp ${i}`);

        if (avatarEl) {
          const roleIcon = i === 0 ? '👑' : i === 1 ? '🗡️' : i === 2 ? '⚔️' : '🔨';
          avatarEl.innerText = roleIcon;
        }

        if (hotkeyEl) hotkeyEl.innerText = `[${i + 1}]`;

        const maxHp = Math.max(1, member.maxHp);
        const hpPct = Math.max(0, Math.min(100, (member.hp / maxHp) * 100));
        if (hpBarEl) hpBarEl.style.width = `${hpPct}%`;

        const maxCrit = Math.max(1, member.maxCriticalHp);
        const critPct = Math.max(0, Math.min(100, (member.criticalHp / maxCrit) * 100));
        if (critBarEl) critBarEl.style.width = `${critPct}%`;

        const maxEnergy = Math.max(1, member.maxEnergy);
        const energyPct = Math.max(0, Math.min(100, (member.energy / maxEnergy) * 100));
        if (energyBarEl) energyBarEl.style.width = `${energyPct}%`;

        const isDowned = member.state === 'downed';
        if (isDowned) {
          card.classList.add('downed');
        } else {
          card.classList.remove('downed');
        }

        if (this.selectedMemberIndices.has(i)) {
          card.classList.add('selected');
          if (statusEl) statusEl.innerText = isDowned ? 'DOWNED' : (member.isEncumbered ? '⚠️ ENC' : '✓ ACTIVE');
        } else {
          card.classList.remove('selected');
          if (statusEl) statusEl.innerText = isDowned ? 'DOWNED' : (member.isEncumbered ? '⚠️ ENC' : `[${i + 1}]`);
        }
      } else {
        // Unoccupied slot
        card.classList.remove('selected', 'downed');
        card.classList.add('empty');
        if (nameEl) nameEl.innerText = '(Empty)';
        if (avatarEl) avatarEl.innerText = '👤';
        if (hotkeyEl) hotkeyEl.innerText = `[${i + 1}]`;
        if (hpBarEl) hpBarEl.style.width = '0%';
        if (critBarEl) critBarEl.style.width = '0%';
        if (energyBarEl) energyBarEl.style.width = '0%';
        if (statusEl) statusEl.innerText = 'EMPTY';
      }
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

      // 5b. Carry Weight & Encumbrance (Milestone 51)
      const totalWeight = member.getTotalWeight();
      const carryCap = member.getEffectiveCarryCapacity();
      const isEncumbered = member.isEncumbered;
      const weightPct = carryCap > 0 ? (totalWeight / carryCap) * 100 : 0;
      const weightColor = isEncumbered ? '#ef4444' : (weightPct >= 80 ? '#f59e0b' : '#38bdf8');

      const weightTextEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-weight="${i}"]`);
      if (weightTextEl) {
        this.setElementTextIfChanged(weightTextEl, `${totalWeight.toFixed(1)} / ${carryCap.toFixed(1)} kg`);
        if (weightTextEl.style.color !== weightColor) weightTextEl.style.color = weightColor;
      }

      const weightBarEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-weight-bar="${i}"]`);
      if (weightBarEl) {
        const widthStr = `${Math.min(100, weightPct)}%`;
        if (weightBarEl.style.width !== widthStr) weightBarEl.style.width = widthStr;
        if (weightBarEl.style.backgroundColor !== weightColor) weightBarEl.style.backgroundColor = weightColor;
      }

      const weightBadgeEl = this.partyOverviewRosterEl.querySelector<HTMLElement>(`[data-party-weight-badge="${i}"]`);
      if (weightBadgeEl) {
        const badgeText = isEncumbered ? '⚠️ ENCUMBERED (-80% Spd)' : (weightPct >= 80 ? 'Heavy (Near Limit)' : 'Unencumbered');
        this.setElementTextIfChanged(weightBadgeEl, badgeText);
        if (weightBadgeEl.style.color !== weightColor) weightBadgeEl.style.color = weightColor;
        weightBadgeEl.style.fontWeight = isEncumbered ? 'bold' : 'normal';
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
    HUD.lastRenderedPartyRosterKey = currentKey;

    if (this.partySpawnCompanionBtn) {
      const isFull = this.currentParty.length >= 4;
      (this.partySpawnCompanionBtn as HTMLButtonElement).disabled = isFull;
      this.partySpawnCompanionBtn.style.opacity = isFull ? '0.5' : '1';
      this.partySpawnCompanionBtn.style.cursor = isFull ? 'not-allowed' : 'pointer';
    }

    const dataLoader = DataLoader.getInstance();
    let html = '';

    const avatarColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'];

    for (let i = 0; i < this.currentParty.length; i++) {
      const member = this.currentParty[i];
      const color = avatarColors[i % avatarColors.length];
      const isDowned = member.state === 'downed';
      const isLeader = i === 0;
      const canSetLeader = this.isOutpost && !isLeader && !isDowned && member.state !== 'dead';

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

      // Visual Paperdoll Slots (Milestone 35)
      const isOutpost = this.isOutpost;
      const isTwoHandedMain = member.equippedWeapon?.twoHanded ?? false;
      const isDwActive = typeof member.isDualWielding === 'function' ? member.isDualWielding() : false;
      const isShieldEquipped = typeof member.hasShield === 'function' ? member.hasShield() : false;

      // 1. Helmet
      const helmet = member.equippedHelmet;
      const helmetHtml = `
        <div class="equip-slot-box ${helmet ? 'equipped' : ''}" data-slot="helmet" data-member-idx="${i}" style="grid-column: 2; grid-row: 1;">
          <div class="slot-label">
            <span>🪖 Helmet</span>
            ${!isOutpost ? '<span style="font-size: 8px; color: #f59e0b;">🔒 Outpost</span>' : ''}
          </div>
          <div class="slot-item-info">
            <span class="slot-item-icon">🪖</span>
            <div>
              <div class="slot-item-text" title="${helmet?.name || 'Empty'}">${helmet ? helmet.name : '<span class="slot-empty-text">Empty Helmet</span>'}</div>
              ${helmet ? `<div class="slot-item-stat">+${helmet.hpBonus} HP · ${helmet.weight ?? 1.0}kg</div>` : ''}
            </div>
          </div>
          ${helmet ? `<button class="slot-unequip-btn" data-slot="helmet" data-member-idx="${i}" type="button" title="Unequip Helmet">&times;</button>` : ''}
        </div>
      `;

      // 2. Main-hand
      const mainWpn = member.equippedWeapon;
      const isBarehanded = !mainWpn || mainWpn.id === 'fist';
      const mainIcon = isBarehanded ? '👊' : '⚔️';
      const mainName = isBarehanded ? 'Fist (Unarmed)' : (mainWpn?.name || 'Empty');
      const mainHtml = `
        <div class="equip-slot-box equipped" data-slot="main" data-member-idx="${i}" style="grid-column: 1; grid-row: 2;">
          <div class="slot-label">
            <span>${mainIcon} Main Hand</span>
            ${!isOutpost ? '<span style="font-size: 8px; color: #f59e0b;">🔒 Outpost</span>' : ''}
          </div>
          <div class="slot-item-info">
            <span class="slot-item-icon">${mainIcon}</span>
            <div>
              <div class="slot-item-text" title="${mainName}">${mainName}</div>
              <div class="slot-item-stat">${mainWpn?.twoHanded ? '2H' : '1H'} - Dmg: ${mainWpn?.baseDamage ?? 4} · ${mainWpn?.weight ?? 0}kg</div>
            </div>
          </div>
          ${!isBarehanded ? `<button class="slot-unequip-btn" data-slot="main" data-member-idx="${i}" type="button" title="Unequip Weapon (Fight Barehanded)">&times;</button>` : ''}
        </div>
      `;

      // 3. Necklace
      const necklace = member.equippedNecklace;
      const necklaceHtml = `
        <div class="equip-slot-box ${necklace ? 'equipped' : ''}" data-slot="necklace" data-member-idx="${i}" style="grid-column: 2; grid-row: 2;">
          <div class="slot-label">
            <span>📿 Necklace</span>
            ${!isOutpost ? '<span style="font-size: 8px; color: #f59e0b;">🔒 Outpost</span>' : ''}
          </div>
          <div class="slot-item-info">
            <span class="slot-item-icon">📿</span>
            <div>
              <div class="slot-item-text" title="${necklace?.name || 'Empty'}">${necklace ? necklace.name : '<span class="slot-empty-text">Empty Necklace</span>'}</div>
              ${necklace ? `<div class="slot-item-stat">+${necklace.hpBonus} HP · ${necklace.weight ?? 0.3}kg</div>` : ''}
            </div>
          </div>
          ${necklace ? `<button class="slot-unequip-btn" data-slot="necklace" data-member-idx="${i}" type="button" title="Unequip Necklace">&times;</button>` : ''}
        </div>
      `;

      // 4. Off-hand
      const offWpn = member.offhandWeapon;
      let offhandHtml = '';
      if (isTwoHandedMain) {
        offhandHtml = `
          <div class="equip-slot-box locked" data-slot="offhand" data-member-idx="${i}" style="grid-column: 3; grid-row: 2;">
            <div class="slot-label">
              <span>🛡️ Off-Hand</span>
            </div>
            <div class="slot-item-info">
              <span class="slot-item-icon">⚠️</span>
              <div>
                <div class="slot-item-text" style="color: #ef4444;">Blocked (2H)</div>
                <div style="font-size: 8px; color: #9ca3af;">2H prevents offhand</div>
              </div>
            </div>
          </div>
        `;
      } else {
        offhandHtml = `
          <div class="equip-slot-box ${offWpn ? 'equipped' : ''}" data-slot="offhand" data-member-idx="${i}" style="grid-column: 3; grid-row: 2;">
            <div class="slot-label">
              <span>🛡️ Off-Hand</span>
            </div>
            <div class="slot-item-info">
              <span class="slot-item-icon">${isShieldEquipped ? '🛡️' : (offWpn ? '⚔️' : '🛡️')}</span>
              <div>
                <div class="slot-item-text" title="${offWpn?.name || 'Empty'}">${offWpn ? offWpn.name : '<span class="slot-empty-text">Empty Off-Hand</span>'}</div>
                ${offWpn ? `<div class="slot-item-stat">${isShieldEquipped ? 'Shield Block' : `Dmg: ${offWpn.baseDamage}`} · ${offWpn.weight ?? 0}kg</div>` : ''}
              </div>
            </div>
            ${offWpn ? `<button class="slot-unequip-btn" data-slot="offhand" data-member-idx="${i}" type="button" title="Unequip Off-Hand">&times;</button>` : ''}
          </div>
        `;
      }

      // 5. Ring
      const ring = member.equippedRing;
      const ringHtml = `
        <div class="equip-slot-box ${ring ? 'equipped' : ''}" data-slot="ring" data-member-idx="${i}" style="grid-column: 1; grid-row: 3;">
          <div class="slot-label">
            <span>💍 Ring</span>
            ${!isOutpost ? '<span style="font-size: 8px; color: #f59e0b;">🔒 Outpost</span>' : ''}
          </div>
          <div class="slot-item-info">
            <span class="slot-item-icon">💍</span>
            <div>
              <div class="slot-item-text" title="${ring?.name || 'Empty'}">${ring ? ring.name : '<span class="slot-empty-text">Empty Ring</span>'}</div>
              ${ring ? `<div class="slot-item-stat">+${ring.hpBonus} HP · ${ring.weight ?? 0.2}kg</div>` : ''}
            </div>
          </div>
          ${ring ? `<button class="slot-unequip-btn" data-slot="ring" data-member-idx="${i}" type="button" title="Unequip Ring">&times;</button>` : ''}
        </div>
      `;

      // 6. Body Armor
      const bodyArmor = member.equippedBodyArmor;
      const bodyHtml = `
        <div class="equip-slot-box ${bodyArmor ? 'equipped' : ''}" data-slot="body" data-member-idx="${i}" style="grid-column: 2; grid-row: 3;">
          <div class="slot-label">
            <span>🛡️ Body Armor</span>
            ${!isOutpost ? '<span style="font-size: 8px; color: #f59e0b;">🔒 Outpost</span>' : ''}
          </div>
          <div class="slot-item-info">
            <span class="slot-item-icon">🛡️</span>
            <div>
              <div class="slot-item-text" title="${bodyArmor?.name || 'Empty'}">${bodyArmor ? bodyArmor.name : '<span class="slot-empty-text">Empty Body</span>'}</div>
              ${bodyArmor ? `<div class="slot-item-stat">+${bodyArmor.hpBonus} HP · ${bodyArmor.weight ?? 4.0}kg</div>` : ''}
            </div>
          </div>
          ${bodyArmor ? `<button class="slot-unequip-btn" data-slot="body" data-member-idx="${i}" type="button" title="Unequip Body Armor">&times;</button>` : ''}
        </div>
      `;

      // 7. Accessory
      const accessory = member.equippedAccessory;
      const accessoryHtml = `
        <div class="equip-slot-box ${accessory ? 'equipped' : ''}" data-slot="accessory" data-member-idx="${i}" style="grid-column: 3; grid-row: 3;">
          <div class="slot-label">
            <span>🔮 Accessory</span>
            ${!isOutpost ? '<span style="font-size: 8px; color: #f59e0b;">🔒 Outpost</span>' : ''}
          </div>
          <div class="slot-item-info">
            <span class="slot-item-icon">🔮</span>
            <div>
              <div class="slot-item-text" title="${accessory?.name || 'Empty'}">${accessory ? accessory.name : '<span class="slot-empty-text">Empty Accessory</span>'}</div>
              ${accessory ? `<div class="slot-item-stat">+${accessory.hpBonus} HP · ${accessory.weight ?? 0.5}kg</div>` : ''}
            </div>
          </div>
          ${accessory ? `<button class="slot-unequip-btn" data-slot="accessory" data-member-idx="${i}" type="button" title="Unequip Accessory">&times;</button>` : ''}
        </div>
      `;

      let offhandStatusHtml = '';
      if (isDwActive) {
        offhandStatusHtml = `
          <div data-party-dw-penalty="${i}" style="font-size: 10px; color: ${dwPenaltyPct === 0 ? '#4ade80' : '#fbbf24'}; margin-top: 3px;">
            Dual Wield Penalty: -${dwPenaltyPct}% Hit Rate (DW Lv ${dwStat.level})
          </div>
        `;
      } else if (isShieldEquipped) {
        const shieldStat = member.progression.getProficiencyStat('shields');
        offhandStatusHtml = `
          <div data-party-shield-status="${i}" style="font-size: 10px; color: #38bdf8; margin-top: 3px;">
            Shield Active: Block & Mitigation (Shields Lv ${shieldStat.level})
          </div>
        `;
      } else if (!isDwUnlocked) {
        offhandStatusHtml = `
          <div style="font-size: 10px; color: #6b7280; margin-top: 3px;">
            🔒 Dual Wielding Locked (Requires 2 1H Melee Lv30+)
          </div>
        `;
      }

      const paperdollHtml = `
        <div class="paperdoll-container">
          <div class="paperdoll-header">
            <span>Visual Equipment Paperdoll</span>
            <span style="font-size: 9px; color: ${isOutpost ? '#4ade80' : '#f59e0b'};">
              ${isOutpost ? '🏠 Outpost Equippable' : '🔒 Armor Outpost Only'}
            </span>
          </div>
          <div class="paperdoll-grid">
            ${helmetHtml}
            ${mainHtml}
            ${necklaceHtml}
            ${offhandHtml}
            ${ringHtml}
            ${bodyHtml}
            ${accessoryHtml}
          </div>
          ${offhandStatusHtml}
        </div>
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
      const unequippedSkills = member.knownSkillIds.filter((id) => {
        if (member.equippedSkillIds.includes(id)) return false;
        const def = dataLoader.getSkill(id);
        return def ? member.progression.isSkillUnlocked(def, member) : false;
      });
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

      // Milestone 51: Personal Inventory & Weight System
      const totalWeight = member.getTotalWeight();
      const carryCap = member.getEffectiveCarryCapacity();
      const isEncumbered = member.isEncumbered;
      const weightPct = carryCap > 0 ? (totalWeight / carryCap) * 100 : 0;
      const invWeight = member.getInventoryWeight();

      const invMap = member.getInventoryMap();
      let personalItemsHtml = '';
      let personalItemCount = 0;
      for (const [itemId, count] of invMap.entries()) {
        if (count <= 0) continue;
        personalItemCount += count;
        const itemWeight = dataLoader.getItemWeight(itemId);
        const itemDef = dataLoader.getItem(itemId) || dataLoader.getWeapon(itemId) || dataLoader.getArmor(itemId) || dataLoader.getFood(itemId);
        const itemName = itemDef?.name || itemId;
        const itemIcon = (itemDef as any)?.icon || '📦';

        let transferOptionsHtml = '';
        if (this.currentParty.length > 1) {
          const otherOptions = this.currentParty
            .map((p, idx) => idx !== i ? `<option value="${idx}">To ${p.entityName}</option>` : '')
            .filter(Boolean)
            .join('');
          transferOptionsHtml = `
            <select class="party-item-transfer-select" data-from-idx="${i}" data-item-id="${itemId}" style="background: rgba(30, 41, 59, 0.8); color: #e2e8f0; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 3px; font-size: 9px; padding: 1px 2px; max-width: 85px;">
              <option value="" disabled selected>Transfer ➡️</option>
              ${otherOptions}
            </select>
          `;
        }

        personalItemsHtml += `
          <div class="personal-inv-row" style="display: flex; justify-content: space-between; align-items: center; background: rgba(17, 24, 39, 0.6); padding: 3px 6px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.05); font-size: 10px;">
            <div style="display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1;">
              <span>${itemIcon}</span>
              <span style="color: #f3f4f6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80px;" title="${itemName}">${itemName}</span>
              <span style="color: #a78bfa; font-weight: bold;">x${count}</span>
              <span style="color: #9ca3af; font-size: 9px;">(${(itemWeight * count).toFixed(1)} kg)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 3px;">
              ${transferOptionsHtml}
              <button class="party-item-discard-btn btn-action" data-member-idx="${i}" data-item-id="${itemId}" type="button" title="Discard 1 item to shed weight" style="padding: 1px 5px; font-size: 9px; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; border-radius: 3px; cursor: pointer;">Drop</button>
            </div>
          </div>
        `;
      }

      html += `
        <div class="party-card ${isDowned ? 'downed' : ''}" data-party-card-idx="${i}">
          <div class="party-card-header">
            <div class="party-avatar-badge" style="background: ${color};">${member.entityName.charAt(0)}</div>
            <div style="flex: 1; min-width: 0;">
              <div class="party-member-name" style="display: flex; align-items: center; gap: 6px;">
                <span>${member.entityName}</span>
                ${isLeader ? `<span class="party-leader-badge" style="background: #fbbf24; color: #78350f; font-size: 9px; font-weight: bold; padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;">👑 LEADER</span>` : ''}
              </div>
              <div style="font-size: 10px; color: #9ca3af;">ID: ${member.id}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              ${canSetLeader ? `<button class="btn-action party-set-leader-btn" data-leader-idx="${i}" type="button" style="padding: 2px 8px; font-size: 10px; white-space: nowrap; background: #0284c7; border: 1px solid #38bdf8; border-radius: 4px; color: white; cursor: pointer;">👑 Make Leader</button>` : ''}
              ${isDowned ? `
                <span class="party-member-status party-status-downed">DOWNED</span>
                <button class="party-revive-btn" data-revive-idx="${i}" type="button">Revive [R]</button>
              ` : `
                <span class="party-member-status party-status-active">ACTIVE</span>
              `}
            </div>
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
            <div class="party-stat-row party-weight-box" style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 3px;">
              <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span style="font-weight: 600; color: #cbd5e1;">⚖️ Weight:</span>
                <span class="party-stat-val" data-party-weight="${i}" style="color: ${isEncumbered ? '#ef4444' : (weightPct >= 80 ? '#f59e0b' : '#38bdf8')}; font-weight: bold;">
                  ${totalWeight.toFixed(1)} / ${carryCap.toFixed(1)} kg
                </span>
              </div>
              <div style="width: 100%; height: 5px; background: rgba(31, 41, 55, 0.8); border-radius: 3px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.05);">
                <div data-party-weight-bar="${i}" style="height: 100%; width: ${Math.min(100, weightPct)}%; background: ${isEncumbered ? '#ef4444' : (weightPct >= 80 ? '#f59e0b' : '#38bdf8')}; transition: width 0.2s ease, background-color 0.2s ease;"></div>
              </div>
              <div data-party-weight-badge="${i}" style="font-size: 9px; text-align: right; color: ${isEncumbered ? '#ef4444' : (weightPct >= 80 ? '#f59e0b' : '#9ca3af')}; font-weight: ${isEncumbered ? 'bold' : 'normal'};">
                ${isEncumbered ? '⚠️ ENCUMBERED (-80% Spd)' : (weightPct >= 80 ? 'Heavy (Near Limit)' : 'Unencumbered')}
              </div>
            </div>
          </div>

          ${paperdollHtml}

          <div class="party-equip-box party-personal-inv-box">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: bold; color: #38bdf8; font-size: 10px; text-transform: uppercase;">🎒 Personal Bag</span>
              <span data-party-inv-count="${i}" style="font-size: 10px; color: #9ca3af;">${personalItemCount} items (${invWeight.toFixed(1)} kg)</span>
            </div>
            <div class="party-personal-inv-list" data-party-inv-list="${i}" style="display: flex; flex-direction: column; gap: 4px; max-height: 110px; overflow-y: auto; margin-top: 4px;">
              ${personalItemsHtml || '<div style="color: #6b7280; font-size: 10px; font-style: italic; padding: 4px 0;">Bag is empty</div>'}
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
    this.renderPartyInventoryPanel();
    this.attachPartyOverviewEvents();
  }

  public initPartyInventoryFilterTabs(): void {
    const filterBtns = typeof document.querySelectorAll === 'function'
      ? document.querySelectorAll<HTMLButtonElement>('.inv-filter-btn')
      : [];
    filterBtns.forEach(btn => {
      btn.onclick = () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.partyInventoryFilter = (btn.dataset.filter as any) || 'all';
        this.renderPartyInventoryPanel();
      };
    });
  }

  public renderPartyInventoryPanel(): void {
    if (!this.partyInventoryItemListEl) {
      this.partyInventoryItemListEl = document.getElementById('party-inventory-item-list');
    }
    if (!this.partyOverviewInventoryEl) {
      this.partyOverviewInventoryEl = document.getElementById('party-overview-inventory');
    }
    const listEl = this.partyInventoryItemListEl;
    if (!listEl) return;
    if (this.partyOverviewInventoryEl) {
      this.partyOverviewInventoryEl.style.display = 'flex';
    }

    const dataLoader = DataLoader.getInstance();
    const gameState = GameState.getInstance();
    const allWeapons = dataLoader.getAllWeapons();
    const allArmors = dataLoader.getAllArmors();

    interface InventoryDisplayItem {
      id: string;
      name: string;
      type: 'weapon' | 'armor';
      slot: string;
      displaySlot: string;
      icon: string;
      statText: string;
      count: number;
    }

    const items: InventoryDisplayItem[] = [];

    if (this.partyInventoryFilter === 'all' || this.partyInventoryFilter === 'weapons') {
      for (const w of allWeapons) {
        if (w.category !== 'magic' || w.conduitWeaponId || w.spellWeaponId || w.baseDamage > 0) {
          const isShield = w.category === 'offhand' || w.id === 'shields';
          const icon = isShield ? '🛡️' : (w.category === 'ranged' ? '🏹' : (w.category === 'magic' ? '✨' : '⚔️'));
          const slot = isShield ? 'offhand' : 'main';
          const displaySlot = isShield ? 'Shield / Off-Hand' : (w.twoHanded ? '2H Weapon' : '1H Weapon');
          const count = gameState.getItemCount(w.id);
          items.push({
            id: w.id,
            name: w.name,
            type: 'weapon',
            slot,
            displaySlot,
            icon,
            statText: `Dmg: ${w.baseDamage}` + (w.baseBlock ? ` | Block: ${Math.round(w.baseBlock * 100)}%` : '') + ` · ${w.weight || 0} kg`,
            count
          });
        }
      }
    }

    if (this.partyInventoryFilter === 'all' || this.partyInventoryFilter === 'armor') {
      for (const a of allArmors) {
        if (a.slot === 'helmet' || a.slot === 'body') {
          const icon = a.slot === 'helmet' ? '🪖' : '🛡️';
          const count = gameState.getItemCount(a.id);
          items.push({
            id: a.id,
            name: a.name,
            type: 'armor',
            slot: a.slot,
            displaySlot: a.slot === 'helmet' ? 'Helmet' : 'Body Armor',
            icon,
            statText: `+${a.hpBonus} HP · ${a.weight || 0} kg`,
            count
          });
        }
      }
    }

    if (this.partyInventoryFilter === 'all' || this.partyInventoryFilter === 'jewelry') {
      for (const a of allArmors) {
        if (a.slot === 'necklace' || a.slot === 'ring' || a.slot === 'accessory') {
          const icon = a.slot === 'necklace' ? '📿' : (a.slot === 'ring' ? '💍' : '🔮');
          const count = gameState.getItemCount(a.id);
          items.push({
            id: a.id,
            name: a.name,
            type: 'armor',
            slot: a.slot,
            displaySlot: a.slot.charAt(0).toUpperCase() + a.slot.slice(1),
            icon,
            statText: `+${a.hpBonus} HP · ${a.weight || 0} kg`,
            count
          });
        }
      }
    }

    if (this.partyInventoryFilter === 'all' || this.partyInventoryFilter === 'items') {
      const lockpickCount = gameState.getItemCount('lockpick');
      if (lockpickCount > 0 || this.partyInventoryFilter === 'items') {
        items.push({
          id: 'lockpick',
          name: 'Lockpick',
          type: 'item' as any,
          slot: 'none',
          displaySlot: 'Tool',
          icon: '🗝️',
          statText: `Required to Pick Locks · ${dataLoader.getItemWeight('lockpick')} kg`,
          count: lockpickCount
        } as any);
      }

      const brokenCount = gameState.getItemCount('broken_lockbox');
      if (brokenCount > 0 || this.partyInventoryFilter === 'items') {
        items.push({
          id: 'broken_lockbox',
          name: 'Broken Lockbox',
          type: 'item' as any,
          slot: 'none',
          displaySlot: 'Damaged Container',
          icon: '🗃️',
          statText: `Smelt for 2 Steel Scrap · ${dataLoader.getItemWeight('broken_lockbox')} kg`,
          count: brokenCount
        } as any);
      }

      const boxCount = gameState.getItemCount('locked_box');
      if (boxCount > 0 || this.partyInventoryFilter === 'items') {
        items.push({
          id: 'locked_box',
          name: 'Locked Box',
          type: 'item' as any,
          slot: 'none',
          displaySlot: 'Locked Container',
          icon: '📦',
          statText: `Requires Lockpick (${lockpickCount} on hand) · ${dataLoader.getItemWeight('locked_box')} kg`,
          count: boxCount,
          isBox: true
        } as any);
      }
    }

    let html = '';
    for (const item of items) {
      const countBadge = item.count > 0 ? `<span style="font-size: 9px; color: #a78bfa; background: rgba(139, 92, 246, 0.2); padding: 1px 5px; border-radius: 3px; font-weight: bold;">x${item.count}</span>` : '';
      if ((item as any).isBox) {
        html += `
        <div class="inventory-item-card" data-item-id="${item.id}" data-item-type="item" data-item-slot="none" draggable="false">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 16px;">${item.icon}</span>
            <div>
              <div style="font-size: 11px; font-weight: 600; color: #fef08a;">${item.name}</div>
              <div style="font-size: 9px; color: #9ca3af;">${item.displaySlot} · <span style="color: #f59e0b;">${item.statText}</span></div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            ${countBadge}
            <button class="inv-pick-lock-btn btn-action" data-item-id="${item.id}" type="button" style="background: #b45309; border-color: #f59e0b; padding: 3px 8px; font-size: 10px; cursor: pointer; color: #fef08a; border-radius: 4px;" ${item.count <= 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>🗝️ Pick Lock</button>
          </div>
        </div>
        `;
      } else {
        html += `
        <div class="inventory-item-card" draggable="true" data-item-id="${item.id}" data-item-type="${item.type}" data-item-slot="${item.slot}">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 14px;">${item.icon}</span>
            <div>
              <div style="font-size: 11px; font-weight: 600; color: #f3f4f6;">${item.name}</div>
              <div style="font-size: 9px; color: #9ca3af;">${item.displaySlot} · <span style="color: #86efac;">${item.statText}</span></div>
            </div>
          </div>
          <div>${countBadge}</div>
        </div>
        `;
      }
    }

    listEl.innerHTML = html;
    this.attachInventoryDragEvents();

    const pickButtons = listEl.querySelectorAll<HTMLButtonElement>('.inv-pick-lock-btn');
    pickButtons.forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this.handleLockpickBox();
      };
    });
  }

  private attachInventoryDragEvents(): void {
    const listEl = document.getElementById('party-inventory-item-list');
    if (!listEl) return;

    const cards = listEl.querySelectorAll<HTMLElement>('.inventory-item-card');
    cards.forEach(card => {
      card.ondragstart = (e: DragEvent) => {
        const itemId = card.dataset.itemId || '';
        const itemType = (card.dataset.itemType || 'weapon') as 'weapon' | 'armor';
        const itemSlot = card.dataset.itemSlot || '';
        this.activeDragPayload = { itemId, itemType, itemSlot };
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'copyMove';
          e.dataTransfer.setData('text/plain', JSON.stringify(this.activeDragPayload));
        }
        card.classList.add('is-dragging');
      };

      card.ondragend = () => {
        card.classList.remove('is-dragging');
        this.activeDragPayload = null;
        if (this.partyOverviewRosterEl) {
          this.partyOverviewRosterEl.querySelectorAll('.equip-slot-box').forEach(slot => {
            slot.classList.remove('drag-over-valid', 'drag-over-invalid');
          });
        }
      };
    });
  }

  public checkSlotCompatibility(
    targetSlot: string,
    payload: { itemId: string; itemType: 'weapon' | 'armor'; itemSlot: string },
    member: Player
  ): boolean {
    const dataLoader = DataLoader.getInstance();

    if (payload.itemType === 'armor') {
      const armor = dataLoader.getArmor(payload.itemId);
      if (!armor) return false;
      return armor.slot === targetSlot;
    }

    if (payload.itemType === 'weapon') {
      const weapon = dataLoader.getWeapon(payload.itemId);
      if (!weapon) return false;

      if (targetSlot === 'main') {
        return weapon.category !== 'offhand' && weapon.id !== 'shields';
      }

      if (targetSlot === 'offhand') {
        if (member.equippedWeapon?.twoHanded) return false;
        if (weapon.category === 'offhand' || weapon.id === 'shields') return true;
        if (weapon.category === 'melee_1h' && !weapon.twoHanded && member.progression.isDualWieldUnlocked()) return true;
        return false;
      }
    }

    return false;
  }

  public handleSlotDrop(
    targetSlot: string,
    payload: { itemId: string; itemType: 'weapon' | 'armor'; itemSlot: string },
    member: Player
  ): boolean {
    const dataLoader = DataLoader.getInstance();

    // 1. Incompatible slot assignment
    if (['helmet', 'body', 'necklace', 'ring', 'accessory'].includes(targetSlot)) {
      if (payload.itemType !== 'armor') {
        this.showToast(`❌ Incompatible slot! Only armor can be equipped in ${targetSlot}.`, 'error');
        return false;
      }
      const armor = dataLoader.getArmor(payload.itemId);
      if (!armor || armor.slot !== targetSlot) {
        this.showToast(`❌ Incompatible slot! Cannot equip ${armor?.name || payload.itemId} in ${targetSlot} slot.`, 'error');
        return false;
      }

      // Outpost restriction check (calls underlying method which strictly checks this)
      if (!this.isOutpost) {
        this.showToast('⚠️ Armor can only be equipped at the Outpost!', 'warn');
        return false;
      }

      const success = member.equipArmorSlot(targetSlot as ArmorSlot, armor, this.isOutpost);
      if (success) {
        this.showToast(`🛡️ Equipped ${armor.name} in ${targetSlot}!`, 'success');
        this.renderPartyOverviewModal(true);
        if (this.currentPlayer && this.currentProgression) {
          this.update(this.currentPlayer, this.currentProgression, 0);
        }
      }
      return success;
    }

    if (targetSlot === 'main') {
      if (payload.itemType !== 'weapon') {
        this.showToast(`❌ Incompatible slot! Only weapons can be equipped in Main Hand.`, 'error');
        return false;
      }
      const weapon = dataLoader.getWeapon(payload.itemId);
      if (!weapon || weapon.category === 'offhand' || weapon.id === 'shields') {
        this.showToast(`❌ Shields must be equipped in the Off-Hand!`, 'error');
        return false;
      }

      if (!this.isOutpost) {
        this.showToast('⚠️ Weapons can only be equipped at the Outpost!', 'warn');
        return false;
      }

      const success = member.equipWeapon(weapon, this.isOutpost);
      if (success) {
        this.showToast(`⚔️ Equipped ${weapon.name} in Main Hand!`, 'success');
        this.renderPartyOverviewModal(true);
        if (this.currentPlayer && this.currentProgression) {
          this.update(this.currentPlayer, this.currentProgression, 0);
        }
      }
      return success;
    }

    if (targetSlot === 'offhand') {
      if (payload.itemType !== 'weapon') {
        this.showToast(`❌ Incompatible slot! Only shields and offhand weapons can be equipped in Off-Hand.`, 'error');
        return false;
      }
      const weapon = dataLoader.getWeapon(payload.itemId);
      if (!weapon) return false;

      if (!this.isOutpost) {
        this.showToast('⚠️ Off-hand gear can only be equipped at the Outpost!', 'warn');
        return false;
      }

      if (member.equippedWeapon?.twoHanded) {
        this.showToast('⚠️ Cannot equip offhand while wielding a two-handed weapon!', 'warn');
        return false;
      }

      const isShield = weapon.category === 'offhand' || weapon.id === 'shields';
      if (!isShield && !member.progression.isDualWieldUnlocked()) {
        this.showToast('🔒 Dual Wielding locked! Requires two 1H melee weapon proficiencies Lv 30+.', 'warn');
        return false;
      }

      const success = member.equipOffhandWeapon(weapon, this.isOutpost);
      if (success) {
        this.showToast(`${isShield ? '🛡️' : '⚔️'} Equipped ${weapon.name} in Off-Hand!`, 'success');
        this.renderPartyOverviewModal(true);
        if (this.currentPlayer && this.currentProgression) {
          this.update(this.currentPlayer, this.currentProgression, 0);
        }
      } else {
        this.showToast(`❌ Cannot equip ${weapon.name} in Off-Hand!`, 'error');
      }
      return success;
    }

    return false;
  }

  private attachPartyOverviewEvents(): void {
    if (!this.partyOverviewRosterEl) return;

    // Slot Drag and Drop Events
    const slotBoxes = this.partyOverviewRosterEl.querySelectorAll<HTMLElement>('.equip-slot-box');
    slotBoxes.forEach(slotBox => {
      const targetSlot = slotBox.dataset.slot || '';
      const memberIdx = parseInt(slotBox.dataset.memberIdx || '0', 10);
      const member = this.currentParty[memberIdx];

      slotBox.ondragover = (e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';

        const payload = this.activeDragPayload;
        if (!payload || !member) return;

        const isCompatible = this.checkSlotCompatibility(targetSlot, payload, member);
        if (isCompatible) {
          slotBox.classList.add('drag-over-valid');
          slotBox.classList.remove('drag-over-invalid');
        } else {
          slotBox.classList.add('drag-over-invalid');
          slotBox.classList.remove('drag-over-valid');
        }
      };

      slotBox.ondragleave = () => {
        slotBox.classList.remove('drag-over-valid', 'drag-over-invalid');
      };

      slotBox.ondrop = (e: DragEvent) => {
        e.preventDefault();
        slotBox.classList.remove('drag-over-valid', 'drag-over-invalid');

        let payload = this.activeDragPayload;
        if (!payload && e.dataTransfer) {
          try {
            const raw = e.dataTransfer.getData('text/plain');
            if (raw) payload = JSON.parse(raw);
          } catch (_) {}
        }
        this.activeDragPayload = null;

        if (!payload || !member) return;

        this.handleSlotDrop(targetSlot, payload, member);
      };
    });

    // Slot Unequip Button Events
    const unequipBtns = this.partyOverviewRosterEl.querySelectorAll<HTMLElement>('.slot-unequip-btn');
    unequipBtns.forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const slot = btn.dataset.slot || '';
        const memberIdx = parseInt(btn.dataset.memberIdx || '0', 10);
        const member = this.currentParty[memberIdx];
        if (!member) return;

        if (slot === 'main') {
          if (!this.isOutpost) {
            this.showToast('⚠️ Weapons can only be unequipped at the Outpost!', 'warn');
            return;
          }
          const success = member.equipWeapon(null, this.isOutpost);
          if (success) {
            this.showToast('Unequipped weapon — fighting barehanded with Fist!', 'info');
            this.renderPartyOverviewModal(true);
            if (this.currentPlayer && this.currentProgression) {
              this.update(this.currentPlayer, this.currentProgression, 0);
            }
          }
          return;
        }

        if (slot === 'offhand') {
          if (!this.isOutpost) {
            this.showToast('⚠️ Off-hand gear can only be unequipped at the Outpost!', 'warn');
            return;
          }
          const success = member.equipOffhandWeapon(null, this.isOutpost);
          if (success) {
            this.showToast('Unequipped offhand gear', 'info');
            this.renderPartyOverviewModal(true);
            if (this.currentPlayer && this.currentProgression) {
              this.update(this.currentPlayer, this.currentProgression, 0);
            }
          }
          return;
        }

        if (['helmet', 'body', 'necklace', 'ring', 'accessory'].includes(slot)) {
          if (!this.isOutpost) {
            this.showToast('⚠️ Armor can only be unequipped at the Outpost!', 'warn');
            return;
          }
          const success = member.equipArmorSlot(slot as ArmorSlot, null, this.isOutpost);
          if (success) {
            this.showToast(`Unequipped ${slot}`, 'info');
            this.renderPartyOverviewModal(true);
            if (this.currentPlayer && this.currentProgression) {
              this.update(this.currentPlayer, this.currentProgression, 0);
            }
          }
        }
      };
    });

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

      // Leader Promote button
      if (target.classList.contains('party-set-leader-btn')) {
        const idx = parseInt(target.dataset.leaderIdx || '0', 10);
        if (!this.isOutpost) {
          this.showToast('⚠️ Leadership can only be changed at the Outpost!', 'warn');
          return;
        }
        const member = this.currentParty[idx];
        if (member && (member.state === 'downed' || member.state === 'dead')) {
          this.showToast('⚠️ Cannot designate a downed party member as Leader!', 'warn');
          return;
        }
        if (this.onSetLeaderCallback) {
          this.onSetLeaderCallback(idx);
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

      // Milestone 51: Discard personal item button
      if (target.classList.contains('party-item-discard-btn') || target.closest('.party-item-discard-btn')) {
        const btn = (target.classList.contains('party-item-discard-btn') ? target : target.closest('.party-item-discard-btn')) as HTMLButtonElement;
        const memberIdx = parseInt(btn.dataset.memberIdx || '-1', 10);
        const itemId = btn.dataset.itemId || '';
        if (memberIdx >= 0 && memberIdx < this.currentParty.length && itemId) {
          const member = this.currentParty[memberIdx];
          const success = GameState.getInstance().discardItem(member, itemId, 1);
          if (success) {
            const dataLoader = DataLoader.getInstance();
            const itemDef = dataLoader.getItem(itemId) || dataLoader.getWeapon(itemId) || dataLoader.getArmor(itemId) || dataLoader.getFood(itemId);
            this.showToast(`Dropped 1 ${itemDef?.name || itemId} from ${member.entityName}`, 'info');
            this.renderPartyOverviewModal(true);
          }
        }
      }
    };

    // Milestone 51: Transfer personal item select
    this.partyOverviewRosterEl.onchange = (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('party-item-transfer-select')) {
        const sel = target as HTMLSelectElement;
        const fromIdx = parseInt(sel.dataset.fromIdx || '-1', 10);
        const toIdx = parseInt(sel.value, 10);
        const itemId = sel.dataset.itemId || '';
        if (fromIdx >= 0 && fromIdx < this.currentParty.length && toIdx >= 0 && toIdx < this.currentParty.length && itemId) {
          const fromMember = this.currentParty[fromIdx];
          const toMember = this.currentParty[toIdx];
          const success = GameState.getInstance().transferItem(fromMember, toMember, itemId, 1);
          if (success) {
            const dataLoader = DataLoader.getInstance();
            const itemDef = dataLoader.getItem(itemId) || dataLoader.getWeapon(itemId) || dataLoader.getArmor(itemId) || dataLoader.getFood(itemId);
            this.showToast(`Transferred 1 ${itemDef?.name || itemId} to ${toMember.entityName}`, 'success');
            this.renderPartyOverviewModal(true);
          }
        }
      }
    };
  }

  public showClassUnlockModal(
    classDef: ClassDef,
    memberName: string = 'Guild Hero',
    durationMs: number = 4000
  ): void {
    if (this.isLoadoutModalOpen()) {
      const activeMember = (this.currentParty && this.currentParty[this.selectedLoadoutMemberIndex]) || this.currentPlayer;
      if (activeMember) {
        this.renderLoadoutModal(activeMember, activeMember.progression);
      }
    }
    this.announcementQueue.push({
      type: 'class',
      data: classDef,
      memberName,
      durationMs
    });
    this.processAnnouncementQueue();
  }

  public showSkillDiscoveredModal(
    skillDef: { name: string; description?: string; tierEffects?: any[] },
    memberName: string = 'Guild Hero',
    durationMs: number = 4000
  ): void {
    if (this.isLoadoutModalOpen()) {
      const activeMember = (this.currentParty && this.currentParty[this.selectedLoadoutMemberIndex]) || this.currentPlayer;
      if (activeMember) {
        this.renderLoadoutModal(activeMember, activeMember.progression);
      }
    }
    this.announcementQueue.push({
      type: 'skill',
      data: skillDef,
      memberName,
      durationMs
    });
    this.processAnnouncementQueue();
  }

  public processAnnouncementQueue(): void {
    if (this.isAnnouncementActive || this.announcementQueue.length === 0) {
      return;
    }

    const item = this.announcementQueue.shift()!;
    this.isAnnouncementActive = true;
    this.activeAnnouncementItem = item;

    // Safety: ensure any previous timers are cancelled
    if (this.announcementTimer) {
      clearTimeout(this.announcementTimer);
      this.announcementTimer = null;
    }
    if (this.announcementTransitionTimer) {
      clearTimeout(this.announcementTransitionTimer);
      this.announcementTransitionTimer = null;
    }

    if (item.type === 'class') {
      const classDef = item.data as ClassDef;
      if (this.classNameEl) {
        this.classNameEl.innerText = `${item.memberName} unlocked ${classDef.name}!`;
      }
      if (this.classFantasyEl) {
        this.classFantasyEl.innerText = classDef.fantasy || '';
      }
      if (this.skillDiscoveredModalEl) {
        this.skillDiscoveredModalEl.classList.remove('active');
      }
      if (this.unlockModalEl) {
        this.unlockModalEl.classList.add('active');
      }
      this.showToast(`✨ ${item.memberName} unlocked ${classDef.name}!`, 'success', item.durationMs);
    } else if (item.type === 'skill') {
      const skillDef = item.data;
      if (this.discoveredSkillNameEl) {
        this.discoveredSkillNameEl.innerText = `${item.memberName} discovered ${skillDef.name}!`;
      }
      if (this.discoveredSkillDescEl) {
        const tier1 = skillDef.tierEffects?.find((t: any) => t.level === 1);
        this.discoveredSkillDescEl.innerText = tier1
          ? `${tier1.description} — ${skillDef.description || ''}`
          : (skillDef.description || '');
      }
      if (this.unlockModalEl) {
        this.unlockModalEl.classList.remove('active');
      }
      if (this.skillDiscoveredModalEl) {
        this.skillDiscoveredModalEl.classList.add('active');
      }
      this.showToast(`✨ ${item.memberName} discovered ${skillDef.name}!`, 'success', item.durationMs);
    }

    // Auto-dismiss timeout (guaranteed anti-stall)
    this.announcementTimer = setTimeout(() => {
      this.announcementTimer = null;
      this.dismissCurrentAnnouncement();
    }, item.durationMs);
  }

  public dismissCurrentAnnouncement(): void {
    // CRITICAL: Cancel the auto-dismiss timer immediately so it cannot fire later
    if (this.announcementTimer) {
      clearTimeout(this.announcementTimer);
      this.announcementTimer = null;
    }
    if (this.announcementTransitionTimer) {
      clearTimeout(this.announcementTransitionTimer);
      this.announcementTransitionTimer = null;
    }

    if (!this.isAnnouncementActive) {
      return;
    }

    if (this.unlockModalEl) {
      this.unlockModalEl.classList.remove('active');
    }
    if (this.skillDiscoveredModalEl) {
      this.skillDiscoveredModalEl.classList.remove('active');
    }
    this.activeAnnouncementItem = null;

    // Brief 200ms transition delay before showing next queued modal
    this.announcementTransitionTimer = setTimeout(() => {
      this.announcementTransitionTimer = null;
      this.isAnnouncementActive = false;
      this.processAnnouncementQueue();
    }, 200);
  }

  public getPendingAnnouncementCount(): number {
    return this.announcementQueue.length;
  }

  public isAnnouncementShowing(): boolean {
    return this.isAnnouncementActive;
  }

  public getActiveAnnouncement(): AnnouncementItem | null {
    return this.activeAnnouncementItem;
  }

  public clearAnnouncementQueue(): void {
    this.announcementQueue = [];
    if (this.announcementTimer) {
      clearTimeout(this.announcementTimer);
      this.announcementTimer = null;
    }
    if (this.announcementTransitionTimer) {
      clearTimeout(this.announcementTransitionTimer);
      this.announcementTransitionTimer = null;
    }
    this.isAnnouncementActive = false;
    this.activeAnnouncementItem = null;
    this.unlockModalEl?.classList.remove('active');
    this.skillDiscoveredModalEl?.classList.remove('active');
  }

  public destroy(): void {
    if (this.unsubscribeExpListener) {
      this.unsubscribeExpListener();
      this.unsubscribeExpListener = null;
    }
    if (this.handleResearchTreeResize) {
      window.removeEventListener('resize', this.handleResearchTreeResize);
      this.handleResearchTreeResize = null as any;
    }
    if (HUD.activeInstance === this) {
      if (this.gatheringModeBtnEl) {
        this.gatheringModeBtnEl.onclick = null;
      }
      if (this.partyReselectAllBtn) {
        this.partyReselectAllBtn.onclick = null;
      }
      HUD.activeInstance = null;
    }
  }

  // --- RESEARCH TREE MODAL METHODS (Milestone 6 & 4X Visual Overhaul) ---

  public openResearchTreeModal(): void {
    if (this.researchTreeModalEl) {
      this.researchTreeModalEl.classList.add('active');
      this.renderResearchTreeModal();

      if (!this.handleResearchTreeResize) {
        this.handleResearchTreeResize = () => {
          if (this.isResearchTreeModalOpen()) {
            this.drawResearchTreeConnectors();
          }
        };
        window.addEventListener('resize', this.handleResearchTreeResize);
      }
    }
  }

  public closeResearchTreeModal(): void {
    if (this.researchTreeModalEl) {
      this.researchTreeModalEl.classList.remove('active');
      if (this.handleResearchTreeResize) {
        window.removeEventListener('resize', this.handleResearchTreeResize);
        this.handleResearchTreeResize = null;
      }
    }
  }

  public isResearchTreeModalOpen(): boolean {
    return this.researchTreeModalEl?.classList.contains('active') ?? false;
  }

  /**
   * Computes genuine graph depth (longest path from any root) for research tree nodes.
   * Root nodes with no prerequisites have depth 0.
   * Dependent nodes have depth = 1 + max(depth of all prerequisites).
   */
  public computeResearchTiers(nodes: ResearchNodeDef[]): Map<string, number> {
    const nodeMap = new Map<string, ResearchNodeDef>();
    for (const n of nodes) {
      nodeMap.set(n.id, n);
    }

    const memo = new Map<string, number>();

    const getDepth = (nodeId: string, visited: Set<string>): number => {
      if (memo.has(nodeId)) {
        return memo.get(nodeId)!;
      }
      if (visited.has(nodeId)) {
        // Cycle protection fallback
        return 0;
      }
      const node = nodeMap.get(nodeId);
      if (!node || !node.prerequisites || node.prerequisites.length === 0) {
        memo.set(nodeId, 0);
        return 0;
      }

      visited.add(nodeId);
      let maxPrereqDepth = -1;
      for (const prereqId of node.prerequisites) {
        const prereqDepth = getDepth(prereqId, new Set(visited));
        if (prereqDepth > maxPrereqDepth) {
          maxPrereqDepth = prereqDepth;
        }
      }
      visited.delete(nodeId);

      const depth = maxPrereqDepth + 1;
      memo.set(nodeId, depth);
      return depth;
    };

    const depths = new Map<string, number>();
    for (const n of nodes) {
      depths.set(n.id, getDepth(n.id, new Set()));
    }
    return depths;
  }

  public renderResearchTreeModal(): void {
    if (!this.researchTreeModalEl || !this.researchNodesContainerEl) return;

    const dataLoader = DataLoader.getInstance();
    const researchNodes = dataLoader.getResearchNodes();
    const gameState = GameState.getInstance();
    const researchSystem = ResearchSystem.getInstance();

    const currentPoints = gameState.getResearchPoints();
    if (this.researchPointsCountEl) {
      this.researchPointsCountEl.innerText = `🔬 ${currentPoints}`;
    }

    const nodeMap = new Map<string, ResearchNodeDef>();
    researchNodes.forEach((n) => nodeMap.set(n.id, n));

    let completedCount = 0;
    for (const node of researchNodes) {
      const isCompleted = gameState.isResearchCompleted(node.id) || (node.targetBuildableId ? gameState.isBuildableUnlocked(node.targetBuildableId) : false);
      if (isCompleted) completedCount++;
    }

    const progressSummaryEl = document.getElementById('research-progress-summary');
    if (progressSummaryEl) {
      progressSummaryEl.innerText = `${completedCount} / ${researchNodes.length} Researched`;
    }

    this.researchNodesContainerEl.innerHTML = '';

    // Canvas wrapper that houses both the SVG connectors and the node cards
    const canvas = document.createElement('div');
    canvas.id = 'research-tree-canvas';
    canvas.className = 'research-tree-canvas';

    // SVG overlay for dependency lines
    const svg = (typeof document.createElementNS === 'function')
      ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      : document.createElement('svg') as any;
    svg.id = 'research-tree-svg';
    svg.setAttribute('class', 'research-tree-svg');
    canvas.appendChild(svg);

    // Columns container
    const columnsContainer = document.createElement('div');
    columnsContainer.className = 'research-tier-columns';

    // Compute topological tier depths
    const tierMap = this.computeResearchTiers(researchNodes);
    let maxTier = 0;
    tierMap.forEach((t) => {
      if (t > maxTier) maxTier = t;
    });

    const tierGroups: ResearchNodeDef[][] = [];
    for (let i = 0; i <= maxTier; i++) {
      tierGroups.push([]);
    }
    for (const node of researchNodes) {
      const t = tierMap.get(node.id) ?? 0;
      tierGroups[t].push(node);
    }

    // Heuristic layout optimization:
    // Sort Tier 0 so nodes with dependents in Tier 1 appear first (e.g. Skinning, Butchering).
    // Sort Tier 1 so dependent nodes align opposite to their prerequisites.
    if (tierGroups.length > 1) {
      const tier1Prereqs = new Set<string>();
      for (const t1Node of tierGroups[1]) {
        for (const p of (t1Node.prerequisites || [])) {
          tier1Prereqs.add(p);
        }
      }

      tierGroups[0].sort((a, b) => {
        const aHasDep = tier1Prereqs.has(a.id) ? 1 : 0;
        const bHasDep = tier1Prereqs.has(b.id) ? 1 : 0;
        return bHasDep - aHasDep;
      });

      const tier0Indices = new Map<string, number>();
      tierGroups[0].forEach((node, idx) => {
        tier0Indices.set(node.id, idx);
      });

      tierGroups[1].sort((a, b) => {
        const aPrereqIdx = Math.min(...(a.prerequisites || []).map((p: string) => tier0Indices.get(p) ?? 999));
        const bPrereqIdx = Math.min(...(b.prerequisites || []).map((p: string) => tier0Indices.get(p) ?? 999));
        return aPrereqIdx - bPrereqIdx;
      });
    }

    const NODE_ICONS: Record<string, string> = {
      research_skinning: '🔪',
      research_butchering: '🥩',
      research_armorsmithing_bench: '🛡️',
      research_cooking_station: '🍳',
      research_blacksmithing_station: '⚒️',
      research_bowyer_station: '🏹',
      research_alchemy_station: '⚗️',
      research_digging: '⛏️',
      research_gardening: '🌱'
    };

    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    const tierSubtitles = ['Foundational Disciplines', 'Advanced Specializations', 'Mastery & Expansion'];

    for (let t = 0; t <= maxTier; t++) {
      const colEl = document.createElement('div');
      colEl.className = 'research-tier-column';

      const tierHeader = document.createElement('div');
      tierHeader.className = 'research-tier-header';
      const roman = romanNumerals[t] || `${t + 1}`;
      const subtitle = tierSubtitles[t] || 'Research Tier';
      tierHeader.innerHTML = `<span>TIER ${roman} • ${subtitle}</span><span style="color: #64748b; font-size: 10px;">${tierGroups[t].length} Technologies</span>`;
      colEl.appendChild(tierHeader);

      for (const node of tierGroups[t]) {
        const isCompleted = gameState.isResearchCompleted(node.id) || (node.targetBuildableId ? gameState.isBuildableUnlocked(node.targetBuildableId) : false);
        const canUnlockCheck = researchSystem.canUnlockNode(node);

        const prerequisites = node.prerequisites || [];
        const missingPrereqs = prerequisites.filter((p: string) => !gameState.isResearchCompleted(p) && !gameState.isBuildableUnlocked(p));
        const isLocked = !isCompleted && missingPrereqs.length > 0;
        const isAvailable = !isCompleted && !isLocked;

        const card = document.createElement('div');
        card.id = `research-card-${node.id}`;
        card.dataset.nodeId = node.id;
        card.className = `research-node-card ${isCompleted ? 'node-completed' : (isAvailable ? 'node-available' : 'node-locked')}`;

        // Left socket (input anchor) if node has prerequisites
        if (prerequisites.length > 0) {
          const socketLeft = document.createElement('div');
          socketLeft.className = `node-socket node-socket-left ${isCompleted ? 'socket-completed' : (isAvailable ? 'socket-available' : 'socket-locked')}`;
          card.appendChild(socketLeft);
        }

        // Right socket (output anchor) if node is a prerequisite for any other node
        const isPrereqForAny = researchNodes.some((other) => (other.prerequisites || []).includes(node.id));
        if (isPrereqForAny) {
          const socketRight = document.createElement('div');
          socketRight.className = `node-socket node-socket-right ${isCompleted ? 'socket-completed' : (isAvailable ? 'socket-available' : 'socket-locked')}`;
          card.appendChild(socketRight);
        }

        // Status badge
        let badgeHtml = '';
        if (isCompleted) {
          badgeHtml = `<span class="node-status-badge badge-completed">✓ Researched</span>`;
        } else if (isAvailable) {
          badgeHtml = `<span class="node-status-badge badge-available">⚡ Available</span>`;
        } else {
          badgeHtml = `<span class="node-status-badge badge-locked">🔒 Locked</span>`;
        }

        // Prerequisite alert box (if locked)
        let prereqAlertHtml = '';
        if (isLocked) {
          const pills = prerequisites.map((pId: string) => {
            const pNode = nodeMap.get(pId);
            const pName = pNode?.name || pId;
            const pDone = gameState.isResearchCompleted(pId) || gameState.isBuildableUnlocked(pId);
            return pDone
              ? `<span class="node-prereq-pill pill-met" data-prereq-target="${pId}">✓ ${pName}</span>`
              : `<span class="node-prereq-pill pill-missing" data-prereq-target="${pId}">🔒 Requires: ${pName}</span>`;
          }).join('');

          prereqAlertHtml = `
            <div class="node-prereq-alert">
              <div class="node-prereq-alert-title">🔒 Prerequisite Needed:</div>
              <div class="node-prereq-pills">${pills}</div>
            </div>
          `;
        }

        // Action button / status indicator
        let buttonHtml = '';
        if (isCompleted) {
          buttonHtml = `<span style="font-size: 11px; font-weight: bold; color: #34d399; background: rgba(5, 150, 105, 0.25); border: 1px solid #10b981; border-radius: 4px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 4px;">✓ Complete</span>`;
        } else if (isAvailable && canUnlockCheck.canUnlock) {
          buttonHtml = `<button type="button" class="btn-research-action btn-unlock-ready" data-unlock-node="${node.id}">🔬 Unlock (${node.cost} Pts)</button>`;
        } else if (isAvailable) {
          const lockTitle = canUnlockCheck.reason || `Need ${node.cost} RP`;
          buttonHtml = `<button type="button" disabled class="btn-research-action btn-unlock-disabled" data-unlock-node="${node.id}" title="${lockTitle}">Need ${node.cost} RP (${currentPoints})</button>`;
        } else {
          const missingNames = missingPrereqs.map((p: string) => nodeMap.get(p)?.name || p).join(', ');
          buttonHtml = `<button type="button" disabled class="btn-research-action btn-unlock-disabled" data-unlock-node="${node.id}" title="Locked: Requires ${missingNames}">🔒 Locked</button>`;
        }

        const icon = NODE_ICONS[node.id] || '🔬';

        card.innerHTML += `
          <div class="node-card-header">
            <div class="node-icon-title">
              <span class="node-icon">${icon}</span>
              <span class="node-title-text" title="${node.name}">${node.name}</span>
            </div>
            ${badgeHtml}
          </div>
          <div class="node-description-text">${node.description}</div>
          ${prereqAlertHtml}
          <div class="node-card-footer">
            <span class="node-cost-label">Cost: <strong>${node.cost} RP</strong></span>
            <div>${buttonHtml}</div>
          </div>
        `;

        // Attach unlock click handler
        const unlockBtn = card.querySelector<HTMLButtonElement>(`[data-unlock-node="${node.id}"]`);
        if (unlockBtn && !unlockBtn.disabled) {
          unlockBtn.onclick = () => {
            const result = researchSystem.unlockNode(node);
            if (result.success) {
              if (node.id === 'research_digging' || node.id.includes('digging')) {
                this.showToast(`✨ Research Complete: ${node.name} unlocked! Dig spots will now appear in dungeons.`, 'success', 3500);
              } else if (node.id === 'research_skinning' || node.id.includes('skinning')) {
                this.showToast(`✨ Research Complete: Harvest Enemy Skin unlocked! Animal corpses can now be skinned in dungeons.`, 'success', 3500);
              } else if (node.id === 'research_butchering' || node.id.includes('butchering')) {
                this.showToast(`✨ Research Complete: Harvest Enemy Meat unlocked! Eligible monster corpses can now be butchered in dungeons.`, 'success', 3500);
              } else {
                this.showToast(`✨ Research Complete: ${node.name} unlocked in Build Mode!`, 'success', 3500);
              }
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

        colEl.appendChild(card);
      }

      columnsContainer.appendChild(colEl);
    }

    canvas.appendChild(columnsContainer);
    this.researchNodesContainerEl.appendChild(canvas);

    // Draw SVG dependency lines & attach hover handlers
    this.drawResearchTreeConnectors();
    this.attachResearchTreeHoverHandlers();

    // Re-draw in next frame for accurate browser bounding rect calculations
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        this.drawResearchTreeConnectors();
      });
    }
  }

  /**
   * Draws smooth Bezier connector lines with directional arrowheads between prerequisite nodes
   * and dependent nodes on the research tree SVG overlay.
   */
  public drawResearchTreeConnectors(): void {
    const canvas = document.getElementById('research-tree-canvas');
    const svg = document.getElementById('research-tree-svg') as SVGSVGElement | null;
    if (!canvas || !svg) return;

    // Define SVG filters and arrow markers
    svg.innerHTML = `
      <defs>
        <marker id="arrow-completed" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
        </marker>
        <marker id="arrow-available" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
        </marker>
        <marker id="arrow-locked" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
        </marker>
        <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="#38bdf8" flood-opacity="0.6"/>
        </filter>
        <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="#10b981" flood-opacity="0.6"/>
        </filter>
      </defs>
    `;

    const dataLoader = DataLoader.getInstance();
    const researchNodes = dataLoader.getResearchNodes();
    const gameState = GameState.getInstance();

    const canvasRect = (typeof canvas.getBoundingClientRect === 'function')
      ? canvas.getBoundingClientRect()
      : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };

    for (const node of researchNodes) {
      if (!node.prerequisites || node.prerequisites.length === 0) continue;

      const targetCard = document.getElementById(`research-card-${node.id}`);
      if (!targetCard) continue;

      const targetRect = (typeof targetCard.getBoundingClientRect === 'function')
        ? targetCard.getBoundingClientRect()
        : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };

      const endX = targetRect.left - canvasRect.left;
      const endY = (targetRect.top + targetRect.height / 2) - canvasRect.top;

      const isChildCompleted = gameState.isResearchCompleted(node.id) || (node.targetBuildableId ? gameState.isBuildableUnlocked(node.targetBuildableId) : false);

      for (const prereqId of node.prerequisites) {
        const sourceCard = document.getElementById(`research-card-${prereqId}`);
        if (!sourceCard) continue;

        const sourceRect = (typeof sourceCard.getBoundingClientRect === 'function')
          ? sourceCard.getBoundingClientRect()
          : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };

        const startX = sourceRect.right - canvasRect.left;
        const startY = (sourceRect.top + sourceRect.height / 2) - canvasRect.top;

        const prereqDef = dataLoader.getResearchNode(prereqId);
        const isPrereqCompleted = gameState.isResearchCompleted(prereqId) || (prereqDef?.targetBuildableId ? gameState.isBuildableUnlocked(prereqDef.targetBuildableId) : false);

        const dx = Math.max(30, (endX - startX) * 0.5);
        const d = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

        const path = (typeof document.createElementNS === 'function')
          ? document.createElementNS('http://www.w3.org/2000/svg', 'path')
          : document.createElement('path') as any;

        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('data-source-node', prereqId);
        path.setAttribute('data-target-node', node.id);
        path.classList.add('research-connector-line');

        if (isPrereqCompleted) {
          if (isChildCompleted) {
            path.setAttribute('stroke', '#10b981');
            path.setAttribute('stroke-width', '2.5');
            path.setAttribute('filter', 'url(#glow-green)');
            path.setAttribute('marker-end', 'url(#arrow-completed)');
          } else {
            path.setAttribute('stroke', '#38bdf8');
            path.setAttribute('stroke-width', '2.5');
            path.setAttribute('filter', 'url(#glow-cyan)');
            path.setAttribute('marker-end', 'url(#arrow-available)');
          }
        } else {
          path.setAttribute('stroke', '#64748b');
          path.setAttribute('stroke-width', '2');
          path.setAttribute('stroke-dasharray', '5 4');
          path.setAttribute('marker-end', 'url(#arrow-locked)');
        }

        svg.appendChild(path);
      }
    }
  }

  /**
   * Attaches interactive hover highlighting:
   * - Hovering a prerequisite badge highlights the prerequisite card and connector line.
   * - Hovering a tech card highlights all its incoming and outgoing connector lines and connected cards.
   */
  private attachResearchTreeHoverHandlers(): void {
    const canvas = document.getElementById('research-tree-canvas');
    if (!canvas) return;

    // Prerequisite pill hover
    const pills = canvas.querySelectorAll<HTMLElement>('.node-prereq-pill');
    pills.forEach((pill) => {
      const targetId = pill.dataset.prereqTarget;
      if (!targetId) return;

      const parentCard = pill.closest('.research-node-card') as HTMLElement | null;
      const parentNodeId = parentCard?.dataset.nodeId;

      pill.onmouseenter = () => {
        const targetCard = document.getElementById(`research-card-${targetId}`);
        targetCard?.classList.add('highlight-node');

        if (parentNodeId) {
          const line = canvas.querySelector(`.research-connector-line[data-source-node="${targetId}"][data-target-node="${parentNodeId}"]`);
          line?.classList.add('line-highlight');
        }
      };

      pill.onmouseleave = () => {
        const targetCard = document.getElementById(`research-card-${targetId}`);
        targetCard?.classList.remove('highlight-node');

        if (parentNodeId) {
          const line = canvas.querySelector(`.research-connector-line[data-source-node="${targetId}"][data-target-node="${parentNodeId}"]`);
          line?.classList.remove('line-highlight');
        }
      };
    });

    // Card hover
    const cards = canvas.querySelectorAll<HTMLElement>('.research-node-card');
    cards.forEach((card) => {
      const nodeId = card.dataset.nodeId;
      if (!nodeId) return;

      card.onmouseenter = () => {
        const outgoingLines = canvas.querySelectorAll(`.research-connector-line[data-source-node="${nodeId}"]`);
        outgoingLines.forEach((l) => {
          l.classList.add('line-highlight');
          const targetId = (l as SVGElement).dataset.targetNode;
          if (targetId) document.getElementById(`research-card-${targetId}`)?.classList.add('highlight-node');
        });

        const incomingLines = canvas.querySelectorAll(`.research-connector-line[data-target-node="${nodeId}"]`);
        incomingLines.forEach((l) => {
          l.classList.add('line-highlight');
          const sourceId = (l as SVGElement).dataset.sourceNode;
          if (sourceId) document.getElementById(`research-card-${sourceId}`)?.classList.add('highlight-node');
        });
      };

      card.onmouseleave = () => {
        const outgoingLines = canvas.querySelectorAll(`.research-connector-line[data-source-node="${nodeId}"]`);
        outgoingLines.forEach((l) => {
          l.classList.remove('line-highlight');
          const targetId = (l as SVGElement).dataset.targetNode;
          if (targetId) document.getElementById(`research-card-${targetId}`)?.classList.remove('highlight-node');
        });

        const incomingLines = canvas.querySelectorAll(`.research-connector-line[data-target-node="${nodeId}"]`);
        incomingLines.forEach((l) => {
          l.classList.remove('line-highlight');
          const sourceId = (l as SVGElement).dataset.sourceNode;
          if (sourceId) document.getElementById(`research-card-${sourceId}`)?.classList.remove('highlight-node');
        });
      };
    });
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
    if (this.alchemyModalEnergyPotionsEl) {
      this.alchemyModalEnergyPotionsEl.innerText = `⚡ ${gameState.getItemCount('energy_potion')}`;
    }
    if (this.alchemyModalManaPotionsEl) {
      this.alchemyModalManaPotionsEl.innerText = `✨ ${gameState.getItemCount('mana_potion')}`;
    }
    if (this.alchemyModalRevivePotionsEl) {
      this.alchemyModalRevivePotionsEl.innerText = `💛 ${gameState.getItemCount('revive_potion')}`;
    }
    if (this.alchemyModalEscapeStonesEl) {
      this.alchemyModalEscapeStonesEl.innerText = `🌀 ${gameState.getItemCount('escape_stone')}`;
    }
    if (this.alchemyModalAntidotesEl) {
      this.alchemyModalAntidotesEl.innerText = `🧪 ${gameState.getItemCount('antidote')}`;
    }

    // 2b. Mood Modifier Banner
    const moodTier = dataLoader.getMoodTier(player.mood);
    const yieldQuantity = 1 + moodTier.alchemyYieldBonus;

    if (this.alchemyMoodValueEl && this.alchemyMoodEffectEl) {
      this.alchemyMoodValueEl.innerText = `${moodTier.name} (${Math.ceil(player.mood)}/100)`;
      if (moodTier.alchemyYieldBonus > 0) {
        this.alchemyMoodEffectEl.innerText = `+${moodTier.alchemyYieldBonus * 100}% Crafting Yield (${yieldQuantity}x per craft!)`;
        this.alchemyMoodEffectEl.style.color = '#fef08a';
      } else {
        this.alchemyMoodEffectEl.innerText = `Standard Yield (1x per craft)`;
        this.alchemyMoodEffectEl.style.color = '#9ca3af';
      }
    }

    // Helper for ingredient name and icons
    const getIngredientLabel = (ingId: string, count: number): string => {
      switch (ingId) {
        case 'wood': return `🪵 ${count} Wood`;
        case 'wild_herbs': return `🌿 ${count} Wild Herbs`;
        case 'ectoplasm': return `👻 ${count} Ectoplasm`;
        default: return `${count} ${ingId}`;
      }
    };

    const hasIngredient = (ingId: string, count: number): boolean => {
      if (ingId === 'wood') {
        return gameState.getWood() >= count;
      }
      return gameState.getItemCount(ingId) >= count;
    };

    // 3. Recipes list
    if (this.alchemyRecipesContainerEl) {
      this.alchemyRecipesContainerEl.innerHTML = '';
      for (const recipe of alchemyRecipes) {
        const ingredients = recipe.ingredients || {};
        const ingredientEntries = Object.entries(ingredients);

        // Check affordability across all ingredients
        const canAffordAll = ingredientEntries.every(([ingId, cost]) => hasIngredient(ingId, cost));

        const costLabelParts = ingredientEntries.map(([ingId, cost]) => getIngredientLabel(ingId, cost));
        const costLabel = `Cost: ${costLabelParts.join(' + ')}`;

        const card = document.createElement('div');
        card.style.cssText = 'background: rgba(31, 41, 55, 0.85); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px;';

        const craftLabel = yieldQuantity > 1 ? `⚗️ Craft ${yieldQuantity}x (+${recipe.expGranted} EXP)` : `⚗️ Craft (+${recipe.expGranted} EXP)`;
        const missingIng = ingredientEntries.find(([ingId, cost]) => !hasIngredient(ingId, cost));
        const missingLabel = missingIng ? `Needs ${getIngredientLabel(missingIng[0], missingIng[1])}` : 'Missing items';

        const btnHtml = canAffordAll
          ? `<button type="button" class="btn-action" style="background: #059669; border-color: #34d399; font-size: 12px; padding: 6px 14px;" data-craft-recipe="${recipe.id}">${craftLabel}</button>`
          : `<button type="button" disabled style="background: #374151; color: #9ca3af; border: 1px solid #4b5563; border-radius: 6px; font-size: 12px; padding: 6px 14px; cursor: not-allowed;">${missingLabel}</button>`;

        const yieldNotice = yieldQuantity > 1 ? `<span style="font-size: 11px; color: #34d399; font-weight: bold;">Yield: ${yieldQuantity}x</span>` : `<span style="font-size: 11px; color: #9ca3af;">Yield: 1x</span>`;

        card.innerHTML = `
          <div style="flex: 1;">
            <div style="font-size: 14px; font-weight: bold; color: #34d399; display: flex; align-items: center; gap: 8px;">
              <span>${recipe.name}</span>
              <span style="font-size: 11px; color: #fbbf24; font-weight: normal;">${costLabel}</span>
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
            // Re-verify all ingredients before consuming
            const stillAffordable = ingredientEntries.every(([ingId, cost]) => hasIngredient(ingId, cost));
            if (stillAffordable) {
              for (const [ingId, cost] of ingredientEntries) {
                if (ingId === 'wood') {
                  gameState.consumeWood(cost);
                } else {
                  gameState.consumeItem(ingId, cost);
                }
              }
              gameState.addItem(recipe.id, yieldQuantity);
              progression.addProficiencyExp('alchemy', recipe.expGranted);
              const bonusText = yieldQuantity > 1 ? ` (${moodTier.name} ${yieldQuantity}x Bonus!)` : '';
              this.showToast(`⚗️ Crafted ${yieldQuantity}x ${recipe.name}!${bonusText} (+${recipe.expGranted} Alchemy EXP)`, 'success', 2500);
              this.renderAlchemyModal(player, progression);
              this.update(player, progression, 0);
            } else {
              this.showToast(`Not enough ingredients to craft ${recipe.name}!`, 'error');
            }
          };
        }

        this.alchemyRecipesContainerEl.appendChild(card);
      }
    }

    // 4. Patient treatment section
    const isBleeding = player.activeStatusEffects.has('bleed');
    const isPoisoned = player.activeStatusEffects.has('poison');
    const bandageCount = gameState.getItemCount('bandage');
    const antidoteCount = gameState.getItemCount('antidote');

    if (this.alchemyPlayerStatusEl) {
      if (isBleeding && isPoisoned) {
        this.alchemyPlayerStatusEl.innerText = 'Bleeding & Poisoned (Active Afflictions)';
        this.alchemyPlayerStatusEl.style.color = '#ef4444';
      } else if (isBleeding) {
        this.alchemyPlayerStatusEl.innerText = 'Bleeding (DoT Active)';
        this.alchemyPlayerStatusEl.style.color = '#ef4444';
      } else if (isPoisoned) {
        this.alchemyPlayerStatusEl.innerText = 'Poisoned (Persistent DoT Active)';
        this.alchemyPlayerStatusEl.style.color = '#16a34a';
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

    if (this.alchemyApplyAntidoteBtn) {
      if (antidoteCount > 0 && isPoisoned) {
        (this.alchemyApplyAntidoteBtn as HTMLButtonElement).disabled = false;
        this.alchemyApplyAntidoteBtn.style.opacity = '1';
        this.alchemyApplyAntidoteBtn.style.cursor = 'pointer';
        this.alchemyApplyAntidoteBtn.innerText = `🧪 Apply Antidote (${antidoteCount} available) [J]`;
      } else if (antidoteCount === 0) {
        (this.alchemyApplyAntidoteBtn as HTMLButtonElement).disabled = true;
        this.alchemyApplyAntidoteBtn.style.opacity = '0.5';
        this.alchemyApplyAntidoteBtn.style.cursor = 'not-allowed';
        this.alchemyApplyAntidoteBtn.innerText = `🧪 No Antidotes Crafted`;
      } else {
        (this.alchemyApplyAntidoteBtn as HTMLButtonElement).disabled = false;
        this.alchemyApplyAntidoteBtn.style.opacity = '0.75';
        this.alchemyApplyAntidoteBtn.style.cursor = 'pointer';
        this.alchemyApplyAntidoteBtn.innerText = `🧪 Apply Antidote (${antidoteCount} avail) [J]`;
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

  // --- SECOND CURE RECIPE: APPLY ANTIDOTE (Milestone 42) ---

  public applyAntidote(): boolean {
    const now = Date.now();
    if (now - this.lastAntidoteApplyTime < 200) {
      return false; // Debounce rapid keydown / scene key triggers
    }
    this.lastAntidoteApplyTime = now;

    const gameState = GameState.getInstance();
    const antidotes = gameState.getItemCount('antidote');

    if (antidotes <= 0) {
      this.showToast('No Antidotes available in stockpile! Craft one at the Alchemy Station.', 'warn', 3000);
      return false;
    }

    if (!this.currentPlayer) {
      return false;
    }

    if (!this.currentPlayer.activeStatusEffects.has('poison')) {
      this.showToast('Not poisoned — no need to apply Antidote.', 'info', 2500);
      return false;
    }

    const cured = this.currentPlayer.applyAntidote();
    if (cured) {
      this.showToast('🧪 Antidote applied! Persistent Poison cured.', 'success', 3000);
      if (this.currentProgression) {
        this.update(this.currentPlayer, this.currentProgression, 0);
        if (this.isAlchemyModalOpen()) {
          this.renderAlchemyModal(this.currentPlayer, this.currentProgression);
        }
      }
      return true;
    } else {
      this.showToast('No Antidotes available in stockpile! Craft one at the Alchemy Station.', 'warn', 3000);
      return false;
    }
  }

  public debugApplyPoison(): void {
    if (!this.currentPlayer) return;
    const poisonDef = DataLoader.getInstance().getStatusEffect('poison');
    if (poisonDef) {
      this.currentPlayer.applyStatusEffect(poisonDef);
      this.showToast(`🧪 Applied Poison status effect (Persistent DoT)!`, 'warn', 3000);
      if (this.currentProgression) {
        this.update(this.currentPlayer, this.currentProgression, 0);
        if (this.isAlchemyModalOpen()) {
          this.renderAlchemyModal(this.currentPlayer, this.currentProgression);
        }
      }
    }
  }

  public debugGrantAntidote(amount: number = 1): void {
    GameState.getInstance().addItem('antidote', amount);
    this.showToast(`🧪 Granted +${amount} Antidote!`, 'success', 2500);
    if (this.currentPlayer && this.currentProgression) {
      this.update(this.currentPlayer, this.currentProgression, 0);
      if (this.isAlchemyModalOpen()) {
        this.renderAlchemyModal(this.currentPlayer, this.currentProgression);
      }
    }
  }

  // --- DRINK POTIONS (Milestone 19) ---

  public drinkEnergyPotion(): boolean {
    const hero = this.currentParty[0] || this.currentPlayer;
    if (!hero) return false;

    const success = hero.drinkPotion('energy_potion');
    if (success) {
      this.showToast('⚡ Drank Energy Potion! +35 Energy & +2 EN/s buff (15s)', 'success', 3000);
      if (this.currentProgression) {
        this.update(hero, this.currentProgression, 0, this.currentParty);
        if (this.isAlchemyModalOpen()) {
          this.renderAlchemyModal(hero, this.currentProgression);
        }
      }
      return true;
    } else {
      this.showToast('No Energy Potions available in stockpile!', 'warn', 2500);
      return false;
    }
  }

  public drinkManaPotion(): boolean {
    const hero = this.currentParty[0] || this.currentPlayer;
    if (!hero) return false;

    const success = hero.drinkPotion('mana_potion');
    if (success) {
      this.showToast('✨ Drank Mana Potion! +35 Energy & +2 EN/s buff (15s)', 'success', 3000);
      if (this.currentProgression) {
        this.update(hero, this.currentProgression, 0, this.currentParty);
        if (this.isAlchemyModalOpen()) {
          this.renderAlchemyModal(hero, this.currentProgression);
        }
      }
      return true;
    } else {
      this.showToast('No Mana Potions available in stockpile!', 'warn', 2500);
      return false;
    }
  }

  // --- MILESTONE 40: TELEPORTER CRYSTAL & ESCAPE STONE ---

  public showTeleporterCrystalModal(
    currentFloor: number,
    onContinue: () => void,
    onReturn: () => void,
    currentRegionName?: string,
    nextRegionName?: string
  ): void {
    this.onCrystalContinueCallback = onContinue;
    this.onCrystalReturnCallback = onReturn;

    const currentRegionLabel = currentRegionName ? `${currentRegionName} — ` : '';
    const nextRegionLabel = nextRegionName ? ` (${nextRegionName})` : '';

    if (this.crystalModalTitleEl) {
      this.crystalModalTitleEl.innerText = `Teleporter Crystal (${currentRegionLabel}Floor ${currentFloor})`;
    }
    if (this.crystalModalSubtitleEl) {
      this.crystalModalSubtitleEl.innerText = `Current run depth: Floor ${currentFloor}. Reaching floor 5 will awaken the Boss chamber.`;
    }
    if (this.crystalContinueLabelEl) {
      this.crystalContinueLabelEl.innerText = `Continue Descent (Floor ${currentFloor + 1}${nextRegionLabel})`;
    }

    if (this.teleporterCrystalModalEl) {
      this.teleporterCrystalModalEl.style.display = 'flex';
    }
  }

  public closeTeleporterCrystalModal(): void {
    if (this.teleporterCrystalModalEl) {
      this.teleporterCrystalModalEl.style.display = 'none';
    }
    this.onCrystalContinueCallback = undefined;
    this.onCrystalReturnCallback = undefined;
  }

  public isTeleporterCrystalModalOpen(): boolean {
    return this.teleporterCrystalModalEl?.style.display === 'flex';
  }

  public useEscapeStone(): boolean {
    if (this.isOutpost) {
      this.showToast('Already safe at the Outpost!', 'info', 2500);
      return false;
    }
    const scene = this.currentPlayer?.scene as any;
    if (scene && typeof scene.useEscapeStone === 'function') {
      return scene.useEscapeStone();
    }
    const mainScene = (window as any).game?.scene?.getScene('MainScene');
    if (mainScene && typeof mainScene.useEscapeStone === 'function') {
      return mainScene.useEscapeStone();
    }
    return false;
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

  public handleLockpickBox(memberIndex?: number): void {
    const gameState = GameState.getInstance();
    if (gameState.getItemCount('locked_box') <= 0) {
      this.showToast('⚠️ No Locked Box in inventory to pick!', 'error');
      return;
    }

    if (gameState.getItemCount('lockpick') <= 0) {
      this.showToast('⚠️ No Lockpicks in inventory! Craft Lockpicks at the Blacksmithing Bench (1 Steel Scrap).', 'warn');
      return;
    }

    const activeMember = (memberIndex !== undefined && this.currentParty[memberIndex])
      ? this.currentParty[memberIndex]
      : (this.currentParty[0] || this.currentPlayer);

    if (!activeMember) return;

    const memberName = activeMember.name || 'Guild Hero';
    const result = gameState.attemptLockpick(activeMember.progression, memberName, Math.random, activeMember);

    if (result.success) {
      const lootSummary = result.rewards.map((r) => `${r.name} x${r.count}`).join(', ');
      this.showToast(`✨ Success! ${memberName} picked the lock (Roll ${result.rollsAttempted}, +${result.expGained} EXP)!\nFound: ${lootSummary}`, 'success', 4000);
    } else if (result.boxBroken) {
      this.showToast(`💥 Box shattered! All 3 lockpicks failed and the lock jammed into a Broken Lockbox! ${memberName} (+${result.expGained} EXP gamble bonus)`, 'error', 3500);
    } else {
      this.showToast(`⚠️ Lockpicking stopped! Spent ${result.lockpicksConsumed} lockpick${result.lockpicksConsumed === 1 ? '' : 's'}. Locked Box preserved intact! ${memberName} (+${result.expGained} EXP)`, 'warn', 3000);
    }

    this.renderPartyInventoryPanel();
    this.renderPartyOverviewModal();
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
      case 'woodcutting': return '#ca8a04';
      case 'mining': return '#94a3b8';
      case 'cooking': return '#f97316';
      case 'blacksmithing': return '#94a3b8';
      case 'armorsmithing': return '#a3e635';
      case 'digging': return '#b45309';
      case 'skinning': return '#eab308';
      case 'butchering': return '#ef4444';
      case 'mace': return '#cbd5e1';
      case 'staff': return '#fbbf24';
      case 'healing_magic': return '#4ade80';
      case 'fire_magic': return '#f97316';
      case 'lightning_magic': return '#38bdf8';
      case 'ice_magic': return '#67e8f9';
      case 'holy_magic': return '#facc15';
      case 'dark_magic': return '#a855f7';
      case 'energy_regen': return '#38bdf8';
      case 'mana_regen': return '#818cf8';
      case 'lockpicking': return '#f59e0b';
      case 'gardening': return '#22c55e';
      case 'fist': return '#f97316';
      case 'longswords': return '#818cf8';
      case 'spears': return '#06b6d4';
      case 'katana': return '#e11d48';
      case 'throwing_weapons': return '#10b981';
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

  // --- BLACKSMITHING STATION & WEAPON FORGING (Milestone 21) ---

  public openBlacksmithingModal(player: Player, progression: ProgressionSystem): void {
    this.currentPlayer = player;
    this.currentProgression = progression;
    if (this.blacksmithingModalEl) {
      this.blacksmithingModalEl.classList.add('active');
      this.renderBlacksmithingModal(player, progression);
    }
  }

  public closeBlacksmithingModal(): void {
    if (this.blacksmithingModalEl) {
      this.blacksmithingModalEl.classList.remove('active');
    }
  }

  public isBlacksmithingModalOpen(): boolean {
    return this.blacksmithingModalEl?.classList.contains('active') ?? false;
  }

  public renderBlacksmithingModal(player: Player, progression: ProgressionSystem): void {
    const gameState = GameState.getInstance();
    const dataLoader = DataLoader.getInstance();

    // 1. Proficiency Bar & Materials Stockpile
    const bsStat = progression.getProficiencyStat('blacksmithing');
    if (this.blacksmithingModalProfEl) {
      const nextExp = LevelingSystem.expForNextLevel(bsStat.level);
      this.blacksmithingModalProfEl.innerText = `Level ${bsStat.level} (${bsStat.currentExp}/${nextExp} EXP)`;
    }

    if (this.blacksmithingStockpileOreEl) {
      this.setElementTextIfChanged(this.blacksmithingStockpileOreEl, `${gameState.getItemCount('ore')}`);
    }
    if (this.blacksmithingStockpileSteelScrapEl) {
      this.setElementTextIfChanged(this.blacksmithingStockpileSteelScrapEl, `${gameState.getItemCount('steel_scrap')}`);
    }
    if (this.blacksmithingStockpileOrcHeavyHideEl) {
      this.setElementTextIfChanged(this.blacksmithingStockpileOrcHeavyHideEl, `${gameState.getItemCount('orc_heavy_hide')}`);
    }

    if (this.blacksmithingStatusMsgEl) {
      this.blacksmithingStatusMsgEl.innerText = '';
    }

    // 2. Render Recipes
    if (this.blacksmithingRecipesContainerEl) {
      this.blacksmithingRecipesContainerEl.innerHTML = '';
      const recipes = dataLoader.getBlacksmithRecipes();

      for (const recipe of recipes) {
        const isLevelUnlocked = bsStat.level >= recipe.requiredLevel;
        let canAfford = true;
        for (const [item, qty] of Object.entries(recipe.ingredients)) {
          if (gameState.getItemCount(item) < qty) {
            canAfford = false;
            break;
          }
        }

        const weaponDef = recipe.resultWeaponId ? dataLoader.getWeapon(recipe.resultWeaponId) : undefined;
        const card = document.createElement('div');
        card.style.cssText = `background: rgba(31, 41, 55, ${isLevelUnlocked ? '0.75' : '0.4'}); border: 1px solid ${isLevelUnlocked ? (canAfford ? 'rgba(148, 163, 184, 0.4)' : 'rgba(107, 114, 128, 0.3)') : 'rgba(239, 68, 68, 0.3)'}; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;`;

        // Ingredients formatting
        const ingDetails = Object.entries(recipe.ingredients).map(([item, qty]) => {
          const have = gameState.getItemCount(item);
          const ok = have >= qty;
          const label = item.replace(/_/g, ' ');
          return `<span style="color: ${ok ? '#4ade80' : '#f87171'}; font-weight: ${ok ? '500' : 'bold'};">${qty}x ${label} (${have}/${qty})</span>`;
        }).join(', ');

        const stunPct = weaponDef?.stunChance ? (weaponDef.stunChance * 100).toFixed(0) : '0';
        const weaponStats = weaponDef
          ? `Base Dmg: ${weaponDef.baseDamage} | Stun: ${stunPct}% | Speed: ${weaponDef.attackIntervalMs}ms`
          : (recipe.resultItemId === 'steel_scrap'
              ? 'Smelting · Yields 2x Steel Scrap'
              : (recipe.resultItemId === 'lockpick' ? 'Tool · Required for Lockpicking' : ''));

        let actionBtnHtml = '';
        if (!isLevelUnlocked) {
          actionBtnHtml = `<span style="font-size: 11px; color: #ef4444; font-weight: bold; padding: 6px 12px; background: rgba(239, 68, 68, 0.1); border-radius: 4px;">🔒 Req. Blacksmithing Lv ${recipe.requiredLevel}</span>`;
        } else if (!canAfford) {
          actionBtnHtml = `<button type="button" class="btn-action" style="background: #374151; border-color: #4b5563; color: #9ca3af; cursor: not-allowed; font-size: 11px; padding: 6px 14px;" disabled>Insufficient Mats</button>`;
        } else {
          const btnLabel = recipe.id === 'smelt_broken_lockbox'
            ? '🔥 Smelt Box'
            : (weaponDef ? '🔨 Forge Weapon' : '🔨 Craft Tool');
          actionBtnHtml = `<button type="button" class="btn-action" style="background: #334155; border-color: #64748b; font-size: 11px; padding: 6px 14px; font-weight: bold; color: #f8fafc;" data-forge-recipe="${recipe.id}">${btnLabel}</button>`;
        }

        card.innerHTML = `
          <div style="flex: 1; padding-right: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
              <span style="font-weight: bold; color: ${isLevelUnlocked ? '#f8fafc' : '#9ca3af'}; font-size: 13px;">${recipe.name}</span>
              <span style="font-size: 10px; color: #cbd5e1; background: rgba(148, 163, 184, 0.2); padding: 2px 6px; border-radius: 4px;">+${recipe.expGranted} EXP</span>
              <span style="font-size: 10px; color: #94a3b8;">${weaponStats}</span>
            </div>
            <div style="font-size: 11px; color: #9ca3af; margin-bottom: 6px;">${recipe.description}</div>
            <div style="font-size: 11px; color: #d1d5db;">Cost: ${ingDetails}</div>
          </div>
          <div>${actionBtnHtml}</div>
        `;

        const btn = card.querySelector<HTMLButtonElement>(`[data-forge-recipe="${recipe.id}"]`);
        if (btn) {
          btn.onclick = () => {
            // Consume materials
            for (const [item, qty] of Object.entries(recipe.ingredients)) {
              gameState.consumeItem(item, qty);
            }
            // Add forged weapon or crafted item to inventory
            const resultId = recipe.resultItemId || recipe.resultWeaponId || recipe.id;
            const resultQty = recipe.resultCount ?? 1;
            gameState.addItem(resultId, resultQty);
            // Award Blacksmithing EXP
            progression.addProficiencyExp('blacksmithing', recipe.expGranted);

            const actionVerb = recipe.id === 'smelt_broken_lockbox' ? 'Smelted' : (weaponDef ? 'Forged' : 'Crafted');
            this.showToast(`🔨 ${actionVerb} ${resultQty}x ${recipe.name}! (+${recipe.expGranted} Blacksmithing EXP)`, 'success', 2500);
            this.renderBlacksmithingModal(player, progression);
            this.update(player, progression, 0);
          };
        }

        this.blacksmithingRecipesContainerEl.appendChild(card);
      }
    }
  }

  // --- ARMORSMITHING BENCH & ARMOR CRAFTING (Milestone 28) ---

  public openArmorsmithingModal(player: Player, progression: ProgressionSystem): void {
    this.currentPlayer = player;
    this.currentProgression = progression;
    if (this.armorsmithingModalEl) {
      this.armorsmithingModalEl.classList.add('active');
      this.renderArmorsmithingModal(player, progression);
    }
  }

  public closeArmorsmithingModal(): void {
    if (this.armorsmithingModalEl) {
      this.armorsmithingModalEl.classList.remove('active');
    }
  }

  public isArmorsmithingModalOpen(): boolean {
    return this.armorsmithingModalEl?.classList.contains('active') ?? false;
  }

  public renderArmorsmithingModal(player: Player, progression: ProgressionSystem): void {
    const gameState = GameState.getInstance();
    const dataLoader = DataLoader.getInstance();

    // 1. Proficiency Bar & Materials Stockpile
    const asStat = progression.getProficiencyStat('armorsmithing');
    if (this.armorsmithingModalProfEl) {
      const nextExp = LevelingSystem.expForNextLevel(asStat.level);
      this.armorsmithingModalProfEl.innerText = `Level ${asStat.level} (${asStat.currentExp}/${nextExp} EXP)`;
    }

    if (this.armorsmithingStockpileWolfPeltEl) {
      this.setElementTextIfChanged(this.armorsmithingStockpileWolfPeltEl, `${gameState.getItemCount('wolf_pelt')}`);
    }
    if (this.armorsmithingStockpileSpiderSilkEl) {
      this.setElementTextIfChanged(this.armorsmithingStockpileSpiderSilkEl, `${gameState.getItemCount('spider_silk')}`);
    }

    if (this.armorsmithingStatusMsgEl) {
      this.armorsmithingStatusMsgEl.innerText = '';
    }

    // 2. Render Recipes
    if (this.armorsmithingRecipesContainerEl) {
      this.armorsmithingRecipesContainerEl.innerHTML = '';
      const recipes = dataLoader.getArmorsmithRecipes();

      for (const recipe of recipes) {
        const isLevelUnlocked = asStat.level >= recipe.requiredLevel;
        let canAfford = true;
        for (const [item, qty] of Object.entries(recipe.ingredients)) {
          if (gameState.getItemCount(item) < qty) {
            canAfford = false;
            break;
          }
        }

        const armorDef = dataLoader.getArmor(recipe.resultArmorId);
        const card = document.createElement('div');
        card.style.cssText = `background: rgba(31, 41, 55, ${isLevelUnlocked ? '0.75' : '0.4'}); border: 1px solid ${isLevelUnlocked ? (canAfford ? 'rgba(163, 230, 53, 0.4)' : 'rgba(107, 114, 128, 0.3)') : 'rgba(239, 68, 68, 0.3)'}; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;`;

        // Ingredients formatting
        const ingDetails = Object.entries(recipe.ingredients).map(([item, qty]) => {
          const have = gameState.getItemCount(item);
          const ok = have >= qty;
          const label = item.replace(/_/g, ' ');
          return `<span style="color: ${ok ? '#4ade80' : '#f87171'}; font-weight: ${ok ? '500' : 'bold'};">${qty}x ${label} (${have}/${qty})</span>`;
        }).join(', ');

        const slotNameMap: Record<string, string> = {
          helmet: 'Helmet',
          body: 'Body Armor',
          necklace: 'Necklace',
          ring: 'Ring',
          accessory: 'Accessory'
        };
        const slotName = armorDef ? (slotNameMap[armorDef.slot] || 'Armor') : 'Armor';
        const split = armorDef ? getArmorHpSplit(armorDef) : { mainHpBonus: 0, criticalHpBonus: 0 };
        const armorStats = armorDef ? `Slot: ${slotName} | +${armorDef.hpBonus} HP (+${split.mainHpBonus} Main / +${split.criticalHpBonus} Crit)` : '';

        let actionBtnHtml = '';
        if (!isLevelUnlocked) {
          actionBtnHtml = `<span style="font-size: 11px; color: #ef4444; font-weight: bold; padding: 6px 12px; background: rgba(239, 68, 68, 0.1); border-radius: 4px;">🔒 Req. Armorsmithing Lv ${recipe.requiredLevel}</span>`;
        } else if (!canAfford) {
          actionBtnHtml = `<button type="button" class="btn-action" style="background: #374151; border-color: #4b5563; color: #9ca3af; cursor: not-allowed; font-size: 11px; padding: 6px 14px;" disabled>Insufficient Mats</button>`;
        } else {
          actionBtnHtml = `<button type="button" class="btn-action" style="background: #365314; border-color: #65a30d; font-size: 11px; padding: 6px 14px; font-weight: bold; color: #f7fee7;" data-armor-recipe="${recipe.id}">🛡️ Craft Armor</button>`;
        }

        card.innerHTML = `
          <div style="flex: 1; padding-right: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
              <span style="font-weight: bold; color: ${isLevelUnlocked ? '#f8fafc' : '#9ca3af'}; font-size: 13px;">${recipe.name}</span>
              <span style="font-size: 10px; color: #bef264; background: rgba(163, 230, 53, 0.2); padding: 2px 6px; border-radius: 4px;">+${recipe.expGranted} EXP</span>
              <span style="font-size: 10px; color: #86efac;">${armorStats}</span>
            </div>
            <div style="font-size: 11px; color: #9ca3af; margin-bottom: 6px;">${recipe.description}</div>
            <div style="font-size: 11px; color: #d1d5db;">Cost: ${ingDetails}</div>
          </div>
          <div>${actionBtnHtml}</div>
        `;

        const btn = card.querySelector<HTMLButtonElement>(`[data-armor-recipe="${recipe.id}"]`);
        if (btn) {
          btn.onclick = () => {
            // Consume materials
            for (const [item, qty] of Object.entries(recipe.ingredients)) {
              gameState.consumeItem(item, qty);
            }
            // Add crafted armor to inventory
            gameState.addItem(recipe.resultArmorId, 1);
            // Award Armorsmithing EXP
            progression.addProficiencyExp('armorsmithing', recipe.expGranted);

            this.showToast(`🛡️ Crafted 1x ${recipe.name}! (+${recipe.expGranted} Armorsmithing EXP)`, 'success', 2500);
            this.renderArmorsmithingModal(player, progression);
            this.update(player, progression, 0);
          };
        }

        this.armorsmithingRecipesContainerEl.appendChild(card);
      }
    }
  }

  // --- BOWYER STATION & BOW CRAFTING (Milestone 36) ---

  public openBowyerModal(player: Player, progression: ProgressionSystem): void {
    this.currentPlayer = player;
    this.currentProgression = progression;
    if (this.bowyerModalEl) {
      this.bowyerModalEl.classList.add('active');
      this.renderBowyerModal(player, progression);
    }
  }

  public closeBowyerModal(): void {
    if (this.bowyerModalEl) {
      this.bowyerModalEl.classList.remove('active');
    }
  }

  public isBowyerModalOpen(): boolean {
    return this.bowyerModalEl?.classList.contains('active') ?? false;
  }

  public renderBowyerModal(player: Player, progression: ProgressionSystem): void {
    const gameState = GameState.getInstance();
    const dataLoader = DataLoader.getInstance();

    // 1. Proficiency Bar & Materials Stockpile
    const byStat = progression.getProficiencyStat('bowyer');
    if (this.bowyerModalProfEl) {
      const nextExp = LevelingSystem.expForNextLevel(byStat.level);
      this.bowyerModalProfEl.innerText = `Level ${byStat.level} (${byStat.currentExp}/${nextExp} EXP)`;
    }

    if (this.bowyerStockpileWoodEl) {
      this.setElementTextIfChanged(this.bowyerStockpileWoodEl, `${gameState.getItemCount('wood')}`);
    }
    if (this.bowyerStockpileSpiderSilkEl) {
      this.setElementTextIfChanged(this.bowyerStockpileSpiderSilkEl, `${gameState.getItemCount('spider_silk')}`);
    }
    if (this.bowyerStockpileBoneClawEl) {
      const bones = gameState.getItemCount('bone');
      const claws = gameState.getItemCount('wolf_claw');
      this.setElementTextIfChanged(this.bowyerStockpileBoneClawEl, `${bones} Bones / ${claws} Claws`);
    }

    if (this.bowyerStatusMsgEl) {
      this.bowyerStatusMsgEl.innerText = '';
    }

    // 2. Render Recipes
    if (this.bowyerRecipesContainerEl) {
      this.bowyerRecipesContainerEl.innerHTML = '';
      const recipes = dataLoader.getBowyerRecipes();

      for (const recipe of recipes) {
        const isLevelUnlocked = byStat.level >= recipe.requiredLevel;
        let canAfford = true;
        for (const [item, qty] of Object.entries(recipe.ingredients)) {
          if (gameState.getItemCount(item) < qty) {
            canAfford = false;
            break;
          }
        }

        const weaponDef = dataLoader.getWeapon(recipe.resultWeaponId);
        const card = document.createElement('div');
        card.style.cssText = `background: rgba(31, 41, 55, ${isLevelUnlocked ? '0.75' : '0.4'}); border: 1px solid ${isLevelUnlocked ? (canAfford ? 'rgba(251, 191, 36, 0.4)' : 'rgba(107, 114, 128, 0.3)') : 'rgba(239, 68, 68, 0.3)'}; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;`;

        // Ingredients formatting
        const ingDetails = Object.entries(recipe.ingredients).map(([item, qty]) => {
          const have = gameState.getItemCount(item);
          const ok = have >= qty;
          const label = item.replace(/_/g, ' ');
          return `<span style="color: ${ok ? '#4ade80' : '#f87171'}; font-weight: ${ok ? '500' : 'bold'};">${qty}x ${label} (${have}/${qty})</span>`;
        }).join(', ');

        const weaponStats = weaponDef ? `Range: ${weaponDef.attackRangeTiles ?? 4} | Dmg: ${weaponDef.baseDamage} | Spd: ${weaponDef.attackIntervalMs}ms | Acc: ${Math.round((weaponDef.baseAccuracy ?? 0.6) * 100)}%` : '';

        let actionBtnHtml = '';
        if (!isLevelUnlocked) {
          actionBtnHtml = `<span style="font-size: 11px; color: #ef4444; font-weight: bold; padding: 6px 12px; background: rgba(239, 68, 68, 0.1); border-radius: 4px;">🔒 Req. Bowyer Lv ${recipe.requiredLevel}</span>`;
        } else if (!canAfford) {
          actionBtnHtml = `<button type="button" class="btn-action" style="background: #374151; border-color: #4b5563; color: #9ca3af; cursor: not-allowed; font-size: 11px; padding: 6px 14px;" disabled>Insufficient Mats</button>`;
        } else {
          actionBtnHtml = `<button type="button" class="btn-action" style="background: #78350f; border-color: #b45309; font-size: 11px; padding: 6px 14px; font-weight: bold; color: #fef3c7;" data-bow-recipe="${recipe.id}">🏹 Craft Bow</button>`;
        }

        card.innerHTML = `
          <div style="flex: 1; padding-right: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
              <span style="font-weight: bold; color: ${isLevelUnlocked ? '#f8fafc' : '#9ca3af'}; font-size: 13px;">${recipe.name}</span>
              <span style="font-size: 10px; color: #fde68a; background: rgba(245, 158, 11, 0.2); padding: 2px 6px; border-radius: 4px;">+${recipe.expGranted} EXP</span>
              <span style="font-size: 10px; color: #fbbf24;">${weaponStats}</span>
            </div>
            <div style="font-size: 11px; color: #9ca3af; margin-bottom: 6px;">${recipe.description}</div>
            <div style="font-size: 11px; color: #d1d5db;">Cost: ${ingDetails}</div>
          </div>
          <div>${actionBtnHtml}</div>
        `;

        const btn = card.querySelector<HTMLButtonElement>(`[data-bow-recipe="${recipe.id}"]`);
        if (btn) {
          btn.onclick = () => {
            // Consume materials
            for (const [item, qty] of Object.entries(recipe.ingredients)) {
              gameState.consumeItem(item, qty);
            }
            // Add crafted bow to inventory
            gameState.addItem(recipe.resultWeaponId, 1);
            // Award Bowyer EXP
            progression.addProficiencyExp('bowyer', recipe.expGranted);

            this.showToast(`🏹 Crafted 1x ${recipe.name}! (+${recipe.expGranted} Bowyer EXP)`, 'success', 2500);
            this.renderBowyerModal(player, progression);
            this.update(player, progression, 0);
          };
        }

        this.bowyerRecipesContainerEl.appendChild(card);
      }
    }
  }

  // --- STOCKPILE OVERVIEW MODAL SYSTEM ---

  private initStockpileFilterTabs(): void {
    if (!this.stockpileFilterTabsEl) return;
    this.stockpileFilterTabsEl.onclick = (e) => {
      const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.stockpile-tab-btn');
      if (!target) return;
      const cat = target.getAttribute('data-stockpile-category') || 'all';
      this.currentStockpileCategory = cat;

      const tabs = this.stockpileFilterTabsEl?.querySelectorAll('.stockpile-tab-btn') || [];
      tabs.forEach((t) => t.classList.remove('active'));
      target.classList.add('active');

      this.renderStockpileModal(true);
    };
  }

  private updateHeldToggleUI(): void {
    if (this.stockpileToggleHeldLabelEl) {
      this.stockpileToggleHeldLabelEl.innerText = this.showHeldOnly ? 'Showing: Held Only (> 0)' : 'Showing: All Items';
    }
    if (this.stockpileToggleHeldIndicatorEl) {
      this.stockpileToggleHeldIndicatorEl.innerText = this.showHeldOnly ? '✅' : '👁️';
    }
    if (this.stockpileToggleHeldBtn) {
      if (this.showHeldOnly) {
        this.stockpileToggleHeldBtn.style.borderColor = '#2dd4bf';
        this.stockpileToggleHeldBtn.style.background = 'rgba(13, 148, 136, 0.3)';
        this.stockpileToggleHeldBtn.style.color = '#2dd4bf';
      } else {
        this.stockpileToggleHeldBtn.style.borderColor = 'rgba(148, 163, 184, 0.3)';
        this.stockpileToggleHeldBtn.style.background = 'rgba(30, 41, 59, 0.8)';
        this.stockpileToggleHeldBtn.style.color = '#e2e8f0';
      }
    }
  }

  public openStockpileModal(): void {
    this.renderStockpileModal(false);
    if (this.stockpileModalEl) {
      this.stockpileModalEl.classList.add('active');
    }
  }

  public closeStockpileModal(): void {
    if (this.stockpileModalEl) {
      this.stockpileModalEl.classList.remove('active');
    }
  }

  public toggleStockpileModal(): void {
    if (this.isStockpileModalOpen()) {
      this.closeStockpileModal();
    } else {
      this.openStockpileModal();
    }
  }

  public isStockpileModalOpen(): boolean {
    return this.stockpileModalEl?.classList.contains('active') ?? false;
  }

  public getStockpileCatalog(): { id: string; name: string; category: 'currencies' | 'gathering' | 'reagents' | 'consumables' | 'equipment'; icon: string }[] {
    const dataLoader = DataLoader.getInstance();
    const gameState = GameState.getInstance();
    const registry = new Map<string, { id: string; name: string; category: 'currencies' | 'gathering' | 'reagents' | 'consumables' | 'equipment'; icon: string }>();

    const registerItem = (id: string, name: string, category: 'currencies' | 'gathering' | 'reagents' | 'consumables' | 'equipment', icon: string) => {
      if (!registry.has(id)) {
        registry.set(id, { id, name, category, icon });
      }
    };

    // 1. Currencies & Special Items
    registerItem('research_points', 'Research Points', 'currencies', '🔬');
    registerItem('locked_box', 'Locked Box', 'currencies', '📦');
    registerItem('lockpick', 'Lockpick', 'currencies', '🗝️');
    registerItem('broken_lockbox', 'Broken Lockbox', 'currencies', '🧰');

    // 2. Gathering & Raw Materials
    registerItem('wood', 'Wood', 'gathering', '🪵');
    registerItem('ore', 'Iron Ore', 'gathering', '⛏️');
    registerItem('dirt', 'Dirt', 'gathering', '🟤');
    registerItem('clay', 'Clay', 'gathering', '🏺');
    registerItem('seeds', 'Seeds', 'gathering', '🌱');
    registerItem('wild_herbs', 'Wild Herbs', 'gathering', '🌿');

    // Dynamically discover gathering node yields
    const gatheringConfig = dataLoader.getGatheringNodesConfig();
    if (gatheringConfig?.nodes) {
      for (const node of Object.values(gatheringConfig.nodes)) {
        if (node.resourceId && !registry.has(node.resourceId)) {
          registerItem(node.resourceId, node.name || node.resourceId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 'gathering', '🌿');
        }
        if (node.lootTable) {
          for (const loot of node.lootTable) {
            if (loot.itemId && !registry.has(loot.itemId)) {
              registerItem(loot.itemId, loot.name || loot.itemId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 'gathering', '🟤');
            }
          }
        }
      }
    }

    // 3. Crafting Reagents & Monster Salvage
    registerItem('monster_meat', 'Monster Meat', 'reagents', '🥩');
    registerItem('wolf_meat', 'Wolf Meat', 'reagents', '🥩');
    registerItem('wolf_pelt', 'Wolf Pelt', 'reagents', '🐺');
    registerItem('wolf_claw', 'Wolf Claw', 'reagents', '🐾');
    registerItem('spider_silk', 'Spider Silk', 'reagents', '🕸️');
    registerItem('spider_venom', 'Spider Venom', 'reagents', '🧪');
    registerItem('bone', 'Monster Bone', 'reagents', '🦴');
    registerItem('ectoplasm', 'Ectoplasm', 'reagents', '👻');
    registerItem('slime_gel', 'Slime Gel', 'reagents', '🧪');
    registerItem('goblin_ear', 'Goblin Ear', 'reagents', '👂');
    registerItem('bowstring', 'Bowstring', 'reagents', '🏹');
    registerItem('feather', 'Feather', 'reagents', '🪶');
    registerItem('steel_scrap', 'Steel Scrap', 'reagents', '⚙️');
    registerItem('orc_heavy_hide', 'Orc Heavy Hide', 'reagents', '🛡️');
    registerItem('orc_emblem', 'Orc Emblem', 'reagents', '🎖️');
    registerItem('void_plate', 'Void Plate', 'reagents', '⬛');
    registerItem('void_essence', 'Void Essence', 'reagents', '🌌');
    registerItem('void_core', 'Void Core', 'reagents', '🔮');
    registerItem('colossus_core', 'Colossus Core', 'reagents', '🌋');
    registerItem('abyssal_ingot', 'Abyssal Ingot', 'reagents', '⬛');
    registerItem('dread_essence', 'Dread Essence', 'reagents', '☠️');
    registerItem('heart_of_the_colossus', 'Heart of the Colossus', 'reagents', '💖');

    // Dynamically discover enemy harvest & corpse drops
    const enemiesData = dataLoader.getEnemiesData();
    if (enemiesData?.enemies) {
      for (const enemy of enemiesData.enemies) {
        if (enemy.harvest) {
          for (const h of enemy.harvest) {
            if (h.item && !registry.has(h.item)) {
              registerItem(h.item, h.item.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 'reagents', '📦');
            }
          }
        }
        if (enemy.corpseHarvest) {
          if (enemy.corpseHarvest.skinning?.item && !registry.has(enemy.corpseHarvest.skinning.item)) {
            registerItem(enemy.corpseHarvest.skinning.item, enemy.corpseHarvest.skinning.name || enemy.corpseHarvest.skinning.item, 'reagents', '🐺');
          }
          if (enemy.corpseHarvest.butchering?.item && !registry.has(enemy.corpseHarvest.butchering.item)) {
            registerItem(enemy.corpseHarvest.butchering.item, enemy.corpseHarvest.butchering.name || enemy.corpseHarvest.butchering.item, 'reagents', '🥩');
          }
        }
      }
    }

    // Dynamically discover recipe ingredients
    const recipesLists = [
      dataLoader.getAlchemyRecipes(),
      dataLoader.getCookingRecipes(),
      dataLoader.getBlacksmithRecipes(),
      dataLoader.getBowyerRecipes(),
      dataLoader.getArmorsmithRecipes()
    ];
    for (const rList of recipesLists) {
      if (Array.isArray(rList)) {
        for (const recipe of rList) {
          if (recipe.ingredients) {
            for (const ingId of Object.keys(recipe.ingredients)) {
              if (!registry.has(ingId)) {
                registerItem(ingId, ingId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 'reagents', '📦');
              }
            }
          }
        }
      }
    }

    // 4. Consumables & Food
    registerItem('bandage', 'Bandage', 'consumables', '🩹');
    registerItem('energy_potion', 'Energy Potion', 'consumables', '⚡');
    registerItem('mana_potion', 'Mana Potion', 'consumables', '✨');
    registerItem('revive_potion', 'Revive Potion', 'consumables', '💛');
    registerItem('escape_stone', 'Escape Stone', 'consumables', '🌀');
    registerItem('ration', 'Field Ration', 'consumables', '🍖');
    registerItem('vegetable', 'Fresh Vegetable', 'consumables', '🥕');
    registerItem('herb_stew', 'Herb Stew', 'consumables', '🍲');
    registerItem('beast_stew', 'Hearty Beast Stew', 'consumables', '🍲');

    // Dynamically discover foods
    const foods = dataLoader.getFoods ? dataLoader.getFoods() : [];
    for (const food of foods) {
      if (!registry.has(food.id)) {
        registerItem(food.id, food.name || food.id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 'consumables', '🍲');
      }
    }

    // 5. Equipment & Stash from GameState inventory
    const allCounts = gameState.getAllStockpileCounts();
    for (const key of Object.keys(allCounts)) {
      if (!registry.has(key)) {
        const weaponDef = dataLoader.getWeapon(key);
        const armorDef = dataLoader.getArmor(key);
        const skillBookDef = dataLoader.getSkillBook(key);
        if (weaponDef) {
          registerItem(key, weaponDef.name, 'equipment', '⚔️');
        } else if (armorDef) {
          const icon = armorDef.slot === 'helmet' ? '🪖' : armorDef.slot === 'body' ? '🛡️' : '💍';
          registerItem(key, armorDef.name, 'equipment', icon);
        } else if (skillBookDef || key.startsWith('book_')) {
          registerItem(key, skillBookDef?.name || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 'equipment', '📖');
        } else if (key.endsWith('_potion') || key.endsWith('_stew')) {
          registerItem(key, key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 'consumables', '🧪');
        } else {
          registerItem(key, key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 'reagents', '📦');
        }
      }
    }

    return Array.from(registry.values());
  }

  public renderStockpileModal(forceRebuild: boolean = false): void {
    if (!this.stockpileItemsContainerEl) return;
    const gameState = GameState.getInstance();
    const catalog = this.getStockpileCatalog();
    const counts = gameState.getAllStockpileCounts();

    // Summary metrics calculation
    let distinctHeldCount = 0;
    let totalUnits = 0;
    for (const [, v] of Object.entries(counts)) {
      if (v > 0) {
        distinctHeldCount++;
        totalUnits += v;
      }
    }

    this.setElementTextIfChanged(this.stockpileMetricDistinctEl, `${distinctHeldCount}`);
    this.setElementTextIfChanged(this.stockpileMetricTotalEl, totalUnits.toLocaleString());
    this.setElementTextIfChanged(this.stockpileMetricRpEl, `🔬 ${(counts['research_points'] || 0).toLocaleString()}`);
    this.setElementTextIfChanged(this.stockpileMetricWoodEl, `🪵 ${(counts['wood'] || 0).toLocaleString()}`);
    this.setElementTextIfChanged(this.stockpileMetricOreEl, `⛏️ ${(counts['ore'] || 0).toLocaleString()}`);

    const categoryDefs: { id: 'gathering' | 'reagents' | 'consumables' | 'currencies' | 'equipment'; title: string; icon: string }[] = [
      { id: 'gathering', title: 'Gathering & Raw Materials', icon: '🪵' },
      { id: 'reagents', title: 'Crafting Reagents & Monster Salvage', icon: '🧪' },
      { id: 'consumables', title: 'Consumables & Prepared Food', icon: '🩹' },
      { id: 'currencies', title: 'Currencies & Special Items', icon: '🔬' },
      { id: 'equipment', title: 'Crafted Equipment & Stash', icon: '⚔️' }
    ];

    const query = this.stockpileSearchQuery;
    const activeCategory = this.currentStockpileCategory;
    const heldOnly = this.showHeldOnly;

    const filtered = catalog.filter((item) => {
      const count = counts[item.id] || 0;
      if (heldOnly && count <= 0) return false;
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (query && !item.name.toLowerCase().includes(query) && !item.id.toLowerCase().includes(query)) return false;
      return true;
    });

    const structureKey = `${activeCategory}|${query}|${heldOnly}|${filtered.map((f) => `${f.id}:${(counts[f.id] || 0) > 0 ? 1 : 0}`).join(',')}`;
    if (!forceRebuild && this.renderedStockpileStructureKey === structureKey) {
      this.updateStockpileLiveStats();
      return;
    }
    this.renderedStockpileStructureKey = structureKey;
    HUD.lastRenderedStockpileStructureKey = structureKey;

    if (filtered.length === 0) {
      this.stockpileItemsContainerEl.innerHTML = `
        <div class="stockpile-empty-state">
          <span style="font-size: 32px;">📭</span>
          <div style="font-size: 14px; font-weight: 600; color: #cbd5e1;">No matching resources found</div>
          <div style="font-size: 11px; color: #64748b;">Try adjusting your filter category, search term, or toggle 'Showing: All Items'.</div>
        </div>
      `;
      return;
    }

    const grouped = new Map<string, typeof catalog>();
    for (const catDef of categoryDefs) {
      grouped.set(catDef.id, []);
    }
    for (const item of filtered) {
      const list = grouped.get(item.category) || [];
      list.push(item);
      grouped.set(item.category, list);
    }

    let html = '';
    for (const catDef of categoryDefs) {
      const items = grouped.get(catDef.id) || [];
      if (items.length === 0) continue;

      let categoryTotalHeld = 0;
      for (const it of items) {
        if ((counts[it.id] || 0) > 0) categoryTotalHeld++;
      }

      html += `
        <div class="stockpile-category-section">
          <div class="stockpile-category-header">
            <span>${catDef.icon} ${catDef.title}</span>
            <span class="stockpile-category-count-badge">${categoryTotalHeld} / ${items.length} held</span>
          </div>
          <div class="stockpile-grid">
      `;

      for (const item of items) {
        const count = counts[item.id] || 0;
        const isHeld = count > 0;
        const countStr = count.toLocaleString();

        html += `
          <div class="stockpile-card ${isHeld ? 'card-held' : 'card-empty'}" data-stockpile-card="${item.id}">
            <div class="stockpile-card-left">
              <span class="stockpile-card-icon">${item.icon}</span>
              <div class="stockpile-card-info">
                <span class="stockpile-card-name" title="${item.name}">${item.name}</span>
                <span class="stockpile-card-cat">${item.id}</span>
              </div>
            </div>
            <span class="stockpile-card-count ${isHeld ? 'count-positive' : 'count-zero'}" data-stockpile-count-id="${item.id}">
              ${countStr}
            </span>
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    }

    this.stockpileItemsContainerEl.innerHTML = html;
  }

  public updateStockpile(time: number): void {
    if (!this.isStockpileModalOpen()) return;
    if (time - this.lastStockpileUpdateTime < 100) return;
    this.lastStockpileUpdateTime = time;
    this.updateStockpileLiveStats();
  }

  public updateStockpileLiveStats(): void {
    if (!this.stockpileItemsContainerEl || !this.isStockpileModalOpen()) return;
    const gameState = GameState.getInstance();
    const counts = gameState.getAllStockpileCounts();

    // Summary metrics calculation
    let distinctHeldCount = 0;
    let totalUnits = 0;
    for (const [, v] of Object.entries(counts)) {
      if (v > 0) {
        distinctHeldCount++;
        totalUnits += v;
      }
    }

    this.setElementTextIfChanged(this.stockpileMetricDistinctEl, `${distinctHeldCount}`);
    this.setElementTextIfChanged(this.stockpileMetricTotalEl, totalUnits.toLocaleString());
    this.setElementTextIfChanged(this.stockpileMetricRpEl, `🔬 ${(counts['research_points'] || 0).toLocaleString()}`);
    this.setElementTextIfChanged(this.stockpileMetricWoodEl, `🪵 ${(counts['wood'] || 0).toLocaleString()}`);
    this.setElementTextIfChanged(this.stockpileMetricOreEl, `⛏️ ${(counts['ore'] || 0).toLocaleString()}`);

    // Update in-place counts
    const countEls = this.stockpileItemsContainerEl.querySelectorAll<HTMLElement>('[data-stockpile-count-id]');
    let needsStructuralRebuild = false;

    countEls.forEach((el) => {
      const id = el.getAttribute('data-stockpile-count-id');
      if (!id) return;
      const count = counts[id] || 0;
      const isPositive = count > 0;
      this.setElementTextIfChanged(el, count.toLocaleString());

      if (isPositive) {
        el.classList.remove('count-zero');
        el.classList.add('count-positive');
      } else {
        el.classList.remove('count-positive');
        el.classList.add('count-zero');
      }

      const card = el.closest<HTMLElement>('.stockpile-card');
      if (card) {
        if (isPositive) {
          card.classList.remove('card-empty');
          card.classList.add('card-held');
        } else {
          card.classList.remove('card-held');
          card.classList.add('card-empty');
          if (this.showHeldOnly) {
            needsStructuralRebuild = true;
          }
        }
      }
    });

    if (needsStructuralRebuild) {
      this.renderStockpileModal(true);
    }
  }

  // ==========================================
  // Milestone 50: Knowledge Base / Guild Codex
  // ==========================================

  public openKnowledgeBaseModal(): void {
    this.renderKnowledgeBaseModal(false);
    if (this.knowledgeBaseModalEl) {
      this.knowledgeBaseModalEl.classList.add('active');
    }
  }

  public closeKnowledgeBaseModal(): void {
    if (this.knowledgeBaseModalEl) {
      this.knowledgeBaseModalEl.classList.remove('active');
    }
  }

  public toggleKnowledgeBaseModal(): void {
    if (this.isKnowledgeBaseModalOpen()) {
      this.closeKnowledgeBaseModal();
    } else {
      this.openKnowledgeBaseModal();
    }
  }

  public isKnowledgeBaseModalOpen(): boolean {
    return this.knowledgeBaseModalEl?.classList.contains('active') ?? false;
  }

  public setKnowledgeBaseTab(tab: KnowledgeBaseTab): void {
    this.knowledgeActiveTab = tab;
    if (typeof document !== 'undefined') {
      const tabBtns = document.querySelectorAll<HTMLElement>('.knowledge-tab-btn');
      tabBtns.forEach((btn) => {
        if (btn.getAttribute('data-tab') === tab) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
    this.renderKnowledgeBaseModal(true);
  }

  private initKnowledgeTabButtons(): void {
    if (typeof document === 'undefined') return;
    const tabBtns = document.querySelectorAll<HTMLElement>('.knowledge-tab-btn');
    tabBtns.forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.getAttribute('data-tab') as KnowledgeBaseTab;
        if (tab) {
          HUD.activeInstance?.setKnowledgeBaseTab(tab);
        }
      };
    });
  }

  public updateKnowledgeBase(time: number): void {
    if (!this.isKnowledgeBaseModalOpen()) return;
    if (time - this.lastKnowledgeUpdateTime < 250) return;
    this.lastKnowledgeUpdateTime = time;
    this.renderKnowledgeBaseModal(false);
  }

  private escapeKnowledgeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  public renderKnowledgeBaseModal(forceRebuild: boolean = false): void {
    if (!this.knowledgeEntriesContainerEl) return;
    const dataLoader = DataLoader.getInstance();
    const gameState = GameState.getInstance();
    const party = this.currentParty || [];

    // Helper to test if any party member has training in a stat/proficiency
    const hasPartyProficiency = (statId: string): boolean => {
      if (gameState.isProficiencyDiscovered(statId)) return true;
      for (const member of party) {
        const stat = member.progression?.getProficiencyStat(statId);
        if (stat && (stat.level >= 1 || stat.currentExp > 0)) return true;
        if (member.equippedWeapon?.id === statId || member.equippedWeapon?.proficiencyId === statId) return true;
        if (member.offhandWeapon?.id === statId || member.offhandWeapon?.proficiencyId === statId) return true;
      }
      return false;
    };

    // Helper to get highest level in party for a stat
    const getPartyMaxLevel = (statId: string): number => {
      let maxLvl = 0;
      for (const member of party) {
        const stat = member.progression?.getProficiencyStat(statId);
        if (stat && stat.level > maxLvl) maxLvl = stat.level;
      }
      return maxLvl;
    };

    // 1. WEAPONS
    const weaponDefs = dataLoader.getAllWeapons() || [];
    const discoveredWeapons: {
      id: string;
      name: string;
      badge: string;
      description: string;
      stats: { label: string; value: string }[];
    }[] = [];

    for (const w of weaponDefs) {
      const isDiscovered =
        gameState.isProficiencyDiscovered(w.id) ||
        (w.proficiencyId && gameState.isProficiencyDiscovered(w.proficiencyId)) ||
        hasPartyProficiency(w.id) ||
        (w.proficiencyId ? hasPartyProficiency(w.proficiencyId) : false);

      if (isDiscovered) {
        const statDef = dataLoader.getTrainableStatDef(w.proficiencyId || w.id);
        const stats: { label: string; value: string }[] = [
          { label: 'Category', value: (w.category || 'weapon').replace('_', ' ').toUpperCase() },
          { label: 'Base Damage', value: `${w.baseDamage ?? 0}` },
          { label: 'Attack Speed', value: w.attackIntervalMs ? `${(w.attackIntervalMs / 1000).toFixed(1)}s` : '1.0s' },
          { label: 'Range', value: `${w.attackRangeTiles ?? 1} Tile(s)` },
        ];
        if (w.baseAccuracy !== undefined) {
          stats.push({ label: 'Base Accuracy', value: `${(w.baseAccuracy * 100).toFixed(0)}%` });
        }
        if (w.bleedChance) {
          stats.push({ label: 'Bleed Chance', value: `${(w.bleedChance * 100).toFixed(0)}%` });
        }
        if (w.stunChance) {
          stats.push({ label: 'Stun Chance', value: `${(w.stunChance * 100).toFixed(0)}%` });
        }
        if (w.burnChance) {
          stats.push({ label: 'Burn Chance', value: `${(w.burnChance * 100).toFixed(0)}%` });
        }
        if (w.slowChance) {
          stats.push({ label: 'Slow Chance', value: `${(w.slowChance * 100).toFixed(0)}%` });
        }
        if (w.shockChance) {
          stats.push({ label: 'Shock Chance', value: `${(w.shockChance * 100).toFixed(0)}%` });
        }
        if (w.baseBlock) {
          stats.push({ label: 'Base Block', value: `${(w.baseBlock * 100).toFixed(0)}%` });
        }
        if (w.baseHealAmount) {
          stats.push({ label: 'Heal Amount', value: `${w.baseHealAmount} HP` });
        }

        discoveredWeapons.push({
          id: w.id,
          name: w.name,
          badge: (w.category || 'WEAPON').replace('_', ' ').toUpperCase(),
          description: statDef?.description || `Proficiency with ${w.name.toLowerCase()} in combat.`,
          stats
        });
      }
    }

    // 2. CLASSES
    const classDefs = dataLoader.getClasses() || [];
    const discoveredClasses: {
      id: string;
      name: string;
      badge: string;
      description: string;
      stats: { label: string; value: string }[];
    }[] = [];

    for (const c of classDefs) {
      let isUnlocked = false;
      for (const m of party) {
        if (m.progression?.isClassUnlocked(c.id) || m.activeClass === c.id) {
          isUnlocked = true;
          break;
        }
      }
      if (isUnlocked) {
        const stats: { label: string; value: string }[] = [
          { label: 'Tier', value: (c.tier || 'Novice').toUpperCase() }
        ];
        if (c.requirements && c.requirements.length > 0) {
          const reqStr = c.requirements
            .map((r: any) => `${r.target.replace('_', ' ')} Lv${r.value}`)
            .join(', ');
          stats.push({ label: 'Prerequisites', value: reqStr });
        }
        if (c.hiddenSkillBonuses) {
          const bonuses = Object.entries(c.hiddenSkillBonuses)
            .map(([k, v]) => `+${((v as number) * 100).toFixed(0)}% ${k.replace('_', ' ')}`)
            .join(', ');
          stats.push({ label: 'Class Passives', value: bonuses });
        }

        discoveredClasses.push({
          id: c.id,
          name: c.name,
          badge: `${(c.tier || 'NOVICE').toUpperCase()} CLASS`,
          description: c.fantasy || 'Guild combat specialization with unique synergies and stat bonuses.',
          stats
        });
      }
    }

    // 3. HIDDEN SKILLS
    const hiddenDefs = dataLoader.getHiddenSkills() || [];
    const discoveredHiddenSkills: {
      id: string;
      name: string;
      badge: string;
      description: string;
      stats: { label: string; value: string }[];
    }[] = [];

    for (const h of hiddenDefs) {
      const isDiscovered = gameState.isProficiencyDiscovered(h.id) || hasPartyProficiency(h.id);
      if (isDiscovered) {
        const maxLvl = getPartyMaxLevel(h.id);
        const stats: { label: string; value: string }[] = [
          { label: 'Guild Mastery', value: maxLvl > 0 ? `Level ${maxLvl}` : 'Discovered' },
          { label: 'Trigger Type', value: h.triggerType?.replace(/([A-Z])/g, ' $1').trim() || 'Passive Art' }
        ];
        if (h.tierEffects && h.tierEffects.length > 0) {
          for (const t of h.tierEffects) {
            stats.push({ label: `Milestone Lv${t.level}`, value: t.description });
          }
        }

        discoveredHiddenSkills.push({
          id: h.id,
          name: h.name,
          badge: 'SECRET ART',
          description: h.description || 'Rare discipline unlocked through specific combat techniques.',
          stats
        });
      }
    }

    // 4. GATHERING
    const gatheringNodesConfig = dataLoader.getGatheringNodesConfig()?.nodes || {};
    const discoveredGathering: {
      id: string;
      name: string;
      badge: string;
      description: string;
      stats: { label: string; value: string }[];
    }[] = [];

    // Check nodes
    for (const [nodeId, node] of Object.entries<any>(gatheringNodesConfig)) {
      if (gameState.isGatheringNodeDiscovered(nodeId)) {
        discoveredGathering.push({
          id: nodeId,
          name: node.name || nodeId,
          badge: (node.actionVerb || node.skillId || 'HARVEST').toUpperCase(),
          description: `Natural gathering resource discovered in dungeons and wilderness. Yields ${node.yieldCount ?? 1}x ${node.resourceId?.replace('_', ' ')}.`,
          stats: [
            { label: 'Discipline', value: (node.skillId || 'foraging').toUpperCase() },
            { label: 'Harvest Yield', value: `${node.yieldCount ?? 1}x ${node.resourceId?.replace('_', ' ')}` },
            { label: 'Channel Duration', value: `${((node.channelDurationMs || 2500) / 1000).toFixed(1)}s` },
            { label: 'Respawn Period', value: `${((node.respawnTimeMs || 15000) / 1000).toFixed(0)}s` },
            { label: 'Discipline EXP', value: `+${node.expGranted ?? 15} EXP` }
          ]
        });
      }
    }

    // Check gathering proficiencies
    const gatherStats = ['foraging', 'woodcutting', 'mining', 'digging', 'skinning', 'butchering', 'gardening'];
    for (const gs of gatherStats) {
      if (hasPartyProficiency(gs)) {
        const def = dataLoader.getTrainableStatDef(gs);
        const lvl = getPartyMaxLevel(gs);
        discoveredGathering.push({
          id: `prof_${gs}`,
          name: def?.name || gs,
          badge: 'GATHERING DISCIPLINE',
          description: def?.description || 'Gathering proficiency.',
          stats: [
            { label: 'Guild Mastery', value: lvl > 0 ? `Level ${lvl}` : 'Practicing' },
            { label: 'Discipline Type', value: 'Wilderness & Dungeon Harvesting' }
          ]
        });
      }
    }

    // 5. CRAFTING & RECIPES
    const discoveredCrafting: {
      id: string;
      name: string;
      badge: string;
      description: string;
      stats: { label: string; value: string }[];
    }[] = [];

    // Alchemy
    const alchemyRecipes = dataLoader.getAlchemyRecipes() || [];
    const alchemyLvl = getPartyMaxLevel('alchemy');
    for (const r of alchemyRecipes) {
      const isDiscovered = alchemyLvl >= 1 || gameState.getItemCount(r.id) > 0;
      if (isDiscovered) {
        const ingStr = Object.entries(r.ingredients || {})
          .map(([k, v]) => `${v}x ${k.replace('_', ' ')}`)
          .join(', ');
        const stats: { label: string; value: string }[] = [
          { label: 'Station', value: 'Alchemy Station' },
          { label: 'Ingredients', value: ingStr || 'None' }
        ];
        if (r.cures && r.cures.length > 0) {
          stats.push({ label: 'Cures', value: r.cures.join(', ') });
        }
        if (r.energyRestored) {
          stats.push({ label: 'Restores', value: `${r.energyRestored} Energy` });
        }
        stats.push({ label: 'Crafting EXP', value: `+${r.expGranted ?? 25} Alchemy EXP` });

        discoveredCrafting.push({
          id: `alchemy_${r.id}`,
          name: r.name,
          badge: 'ALCHEMY',
          description: r.description || 'Remedy brewed at an outpost alchemy station.',
          stats
        });
      }
    }

    // Cooking
    const cookingRecipes = dataLoader.getCookingRecipes() || [];
    const cookingLvl = getPartyMaxLevel('cooking');
    for (const r of cookingRecipes) {
      const isDiscovered = gameState.isCookingRecipeDiscovered(r.id) || cookingLvl >= 1;
      if (isDiscovered) {
        const ingStr = Object.entries(r.ingredients || {})
          .map(([k, v]) => `${v}x ${k.replace('_', ' ')}`)
          .join(', ');
        const stats: { label: string; value: string }[] = [
          { label: 'Station', value: 'Cooking Station' },
          { label: 'Max Quality', value: (r.maxQuality || 'Masterpiece').toUpperCase() },
          { label: 'Ingredients', value: ingStr || 'None' },
          { label: 'Crafting EXP', value: `+${r.expGranted ?? 20} Cooking EXP` }
        ];

        discoveredCrafting.push({
          id: `cooking_${r.id}`,
          name: r.name,
          badge: 'COOKING',
          description: r.description || 'Nutritious meal prepared at an outpost cooking station.',
          stats
        });
      }
    }

    // Blacksmithing
    const blacksmithRecipes = dataLoader.getBlacksmithRecipes() || [];
    const blacksmithLvl = getPartyMaxLevel('blacksmithing');
    for (const r of blacksmithRecipes) {
      if (blacksmithLvl >= (r.requiredLevel || 1) || gameState.getItemCount(r.id) > 0) {
        const ingStr = Object.entries(r.ingredients || {})
          .map(([k, v]) => `${v}x ${k.replace('_', ' ')}`)
          .join(', ');
        discoveredCrafting.push({
          id: `smith_${r.id}`,
          name: r.name,
          badge: 'BLACKSMITHING',
          description: r.description || 'Forged metallic armaments crafted at a forge.',
          stats: [
            { label: 'Station', value: 'Blacksmith Forge' },
            { label: 'Required Smithing', value: `Lv ${r.requiredLevel || 1}` },
            { label: 'Ingredients', value: ingStr || 'None' }
          ]
        });
      }
    }

    // Armorsmithing
    const armorsmithRecipes = dataLoader.getArmorsmithRecipes() || [];
    const armorLvl = getPartyMaxLevel('armorsmithing');
    for (const r of armorsmithRecipes) {
      if (armorLvl >= (r.requiredLevel || 1) || gameState.getItemCount(r.id) > 0) {
        const ingStr = Object.entries(r.ingredients || {})
          .map(([k, v]) => `${v}x ${k.replace('_', ' ')}`)
          .join(', ');
        discoveredCrafting.push({
          id: `armor_${r.id}`,
          name: r.name,
          badge: 'ARMORSMITHING',
          description: r.description || 'Protective gear tailored at an armorsmith workbench.',
          stats: [
            { label: 'Station', value: 'Armorsmith Workbench' },
            { label: 'Required Armorsmithing', value: `Lv ${r.requiredLevel || 1}` },
            { label: 'Ingredients', value: ingStr || 'None' }
          ]
        });
      }
    }

    // Bowyer
    const bowyerRecipes = dataLoader.getBowyerRecipes() || [];
    const bowyerLvl = getPartyMaxLevel('bowyer');
    for (const r of bowyerRecipes) {
      if (bowyerLvl >= (r.requiredLevel || 1) || gameState.getItemCount(r.id) > 0) {
        const ingStr = Object.entries(r.ingredients || {})
          .map(([k, v]) => `${v}x ${k.replace('_', ' ')}`)
          .join(', ');
        discoveredCrafting.push({
          id: `bowyer_${r.id}`,
          name: r.name,
          badge: 'BOWYER',
          description: r.description || 'Ranged bows shaped from seasoned wood.',
          stats: [
            { label: 'Station', value: 'Bowyer Bench' },
            { label: 'Required Bowyer', value: `Lv ${r.requiredLevel || 1}` },
            { label: 'Ingredients', value: ingStr || 'None' }
          ]
        });
      }
    }

    // 6. STATUS EFFECTS
    const effectDefs = dataLoader.getStatusEffectsData()?.statusEffects || [];
    const discoveredStatusEffects: {
      id: string;
      name: string;
      badge: string;
      description: string;
      stats: { label: string; value: string }[];
    }[] = [];

    for (const e of effectDefs) {
      if (gameState.isStatusEffectDiscovered(e.id)) {
        const stats: { label: string; value: string }[] = [
          { label: 'Nature', value: e.isHarmful ? 'Harmful Affliction' : 'Beneficial Boon' },
          { label: 'Duration', value: `${((e.durationMs || 0) / 1000).toFixed(1)}s` },
          { label: 'Tick Rate', value: `${((e.tickIntervalMs || 1000) / 1000).toFixed(1)}s` },
        ];
        if (e.damagePerTick) {
          stats.push({ label: 'Tick Damage', value: `${e.damagePerTick} damage/s` });
        }
        if (e.disablesActions) {
          stats.push({ label: 'Impairment', value: 'Disables Combat Actions' });
        }
        if (e.disablesMovement) {
          stats.push({ label: 'Mobility', value: 'Immobilizes Target' });
        }
        if (e.interruptsAttack) {
          stats.push({ label: 'Interruption', value: 'Interrupts Attacks & Casts' });
        }
        if (e.moveSpeedMultiplier !== undefined) {
          stats.push({ label: 'Move Speed', value: `${(e.moveSpeedMultiplier * 100).toFixed(0)}%` });
        }
        if (e.id === 'bleed') {
          stats.push({ label: 'Known Remedy', value: 'Apply Bandage [E]' });
        } else if (e.id === 'poison') {
          stats.push({ label: 'Known Remedy', value: 'Drink Antidote' });
        }

        discoveredStatusEffects.push({
          id: e.id,
          name: e.name,
          badge: e.isHarmful ? 'AFFLICTION' : 'BLESSING',
          description: e.isHarmful
            ? `Harmful combat status affliction. Deals ongoing damage or impedes combat capability.`
            : `Beneficial combat blessing. Enhances survivability or combat potency.`,
          stats
        });
      }
    }

    // 7. BESTIARY
    const enemyDefs = dataLoader.getEnemiesData()?.enemies || [];
    const discoveredBestiary: {
      id: string;
      name: string;
      badge: string;
      description: string;
      stats: { label: string; value: string }[];
    }[] = [];

    for (const e of enemyDefs) {
      if (gameState.isEnemyEncountered(e.id)) {
        const stats: { label: string; value: string }[] = [
          { label: 'Threat Tier', value: (e.tier || 'Common').toUpperCase() },
          { label: 'Maximum Health', value: `${e.hp} HP` },
          { label: 'Critical Threshold', value: `${e.criticalHpMax ?? Math.floor(e.hp / 2)} HP` },
          { label: 'Melee Strike', value: `${e.meleeDamage ?? 0} DMG` },
          { label: 'Attack Cadence', value: e.attackIntervalMs ? `${(e.attackIntervalMs / 1000).toFixed(1)}s` : '1.2s' },
          { label: 'Movement Speed', value: `${e.moveSpeed ?? 80}` },
          { label: 'Perception Range', value: `${e.aggroRadius ?? 5} Tiles` }
        ];

        if (e.harvest && e.harvest.length > 0) {
          const drops = e.harvest.map((h: any) => h.item.replace('_', ' ')).join(', ');
          stats.push({ label: 'Drop Loot', value: drops });
        }
        if (e.corpseHarvest) {
          const corpseYields: string[] = [];
          if (e.corpseHarvest.skinning) {
            corpseYields.push(`Skinning: ${e.corpseHarvest.skinning.name}`);
          }
          if (e.corpseHarvest.butchering) {
            corpseYields.push(`Butchering: ${e.corpseHarvest.butchering.name}`);
          }
          if (corpseYields.length > 0) {
            stats.push({ label: 'Corpse Carving', value: corpseYields.join(' | ') });
          }
        }

        discoveredBestiary.push({
          id: e.id,
          name: e.name,
          badge: `${(e.tier || 'COMMON').toUpperCase()} ENEMY`,
          description: `Hostile entity encountered in dungeon depths. Behavior: aggressive patrol within ${e.aggroRadius ?? 5} tiles.`,
          stats
        });
      }
    }

    // Update live count badges on each tab header
    const updateCountBadge = (id: string, count: number) => {
      const el = document.getElementById(id);
      if (el && el.innerText !== count.toString()) {
        el.innerText = count.toString();
      }
    };
    updateCountBadge('knowledge-count-weapons', discoveredWeapons.length);
    updateCountBadge('knowledge-count-classes', discoveredClasses.length);
    updateCountBadge('knowledge-count-hidden_skills', discoveredHiddenSkills.length);
    updateCountBadge('knowledge-count-gathering', discoveredGathering.length);
    updateCountBadge('knowledge-count-crafting', discoveredCrafting.length);
    updateCountBadge('knowledge-count-status_effects', discoveredStatusEffects.length);
    updateCountBadge('knowledge-count-bestiary', discoveredBestiary.length);

    // Pick active tab entries
    let activeEntries: {
      id: string;
      name: string;
      badge: string;
      description: string;
      stats: { label: string; value: string }[];
    }[] = [];

    switch (this.knowledgeActiveTab) {
      case 'weapons': activeEntries = discoveredWeapons; break;
      case 'classes': activeEntries = discoveredClasses; break;
      case 'hidden_skills': activeEntries = discoveredHiddenSkills; break;
      case 'gathering': activeEntries = discoveredGathering; break;
      case 'crafting': activeEntries = discoveredCrafting; break;
      case 'status_effects': activeEntries = discoveredStatusEffects; break;
      case 'bestiary': activeEntries = discoveredBestiary; break;
    }

    // Apply search query filter if set
    const query = this.knowledgeSearchQuery.toLowerCase().trim();
    if (query) {
      activeEntries = activeEntries.filter((item) =>
        item.name.toLowerCase().includes(query) ||
        item.badge.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.stats.some((s) => s.label.toLowerCase().includes(query) || s.value.toLowerCase().includes(query))
      );
    }

    // Cache structure key to avoid unnecessary re-renders
    const structureKey = `${this.knowledgeActiveTab}:${query}:${activeEntries.map((e) => e.id).join(',')}:${activeEntries.length}`;
    if (!forceRebuild && this.lastKnowledgeStructureKey === structureKey) {
      return;
    }
    this.lastKnowledgeStructureKey = structureKey;

    // Render entries
    if (activeEntries.length === 0) {
      if (query) {
        this.knowledgeEntriesContainerEl.innerHTML = `
          <div class="knowledge-empty-state">
            <div style="font-size: 32px; opacity: 0.7;">🔍</div>
            <div style="font-size: 15px; font-weight: 600; color: #f1f5f9;">No matching records found</div>
            <div>No discovered entries match &quot;${this.escapeKnowledgeHtml(query)}&quot;.</div>
          </div>
        `;
      } else {
        this.knowledgeEntriesContainerEl.innerHTML = `
          <div class="knowledge-empty-state">
            <div style="font-size: 32px; opacity: 0.7;">📜</div>
            <div style="font-size: 15px; font-weight: 600; color: #f1f5f9;">No entries recorded yet</div>
            <div style="max-width: 440px; line-height: 1.5;">Venture into dungeons, encounter foes, train arts, and unlock disciplines to discover and record entries in the Guild Codex.</div>
          </div>
        `;
      }
      return;
    }

    let html = '';
    for (const entry of activeEntries) {
      html += `
        <div class="knowledge-card" data-entry-id="${this.escapeKnowledgeHtml(entry.id)}">
          <div class="knowledge-card-header">
            <span class="knowledge-card-title">${this.escapeKnowledgeHtml(entry.name)}</span>
            <span class="knowledge-badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35);">${this.escapeKnowledgeHtml(entry.badge)}</span>
          </div>
          <div style="font-size: 12px; color: #cbd5e1; line-height: 1.4;">${this.escapeKnowledgeHtml(entry.description)}</div>
          <div class="knowledge-stats-grid">
            ${entry.stats
              .map(
                (s) => `
              <div class="knowledge-stat-item">
                <span style="color: #94a3b8;">${this.escapeKnowledgeHtml(s.label)}:</span>
                <span style="color: #f1f5f9; font-weight: 600; text-align: right; margin-left: 6px;">${this.escapeKnowledgeHtml(s.value)}</span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `;
    }

    this.knowledgeEntriesContainerEl.innerHTML = html;
  }
}
