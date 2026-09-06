import { Player } from '../entities/Player';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { ClassDef, HiddenSkillDef, TrainableStat } from '../types/game';
import { DataLoader } from '../utils/DataLoader';
import { GameState } from '../systems/GameState';
import { BuildingSystem } from '../systems/BuildingSystem';
import { LevelingSystem } from '../systems/LevelingSystem';
import { ResearchSystem } from '../systems/ResearchSystem';

export class HUD {
  private playerHpEl: HTMLElement | null;
  private playerCritHpEl: HTMLElement | null;
  private playerEnergyEl: HTMLElement | null;
  private weaponEl: HTMLElement | null;
  private profEl: HTMLElement | null;
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
    this.profEl = document.getElementById('proficiency-text');
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
        if (!btn) return;
        e.stopPropagation();

        const skillId = btn.getAttribute('data-hud-skill');
        const active = HUD.activeInstance;
        if (!skillId || !active || !active.currentPlayer) return;

        const currentVal = active.currentPlayer.isAutocastEnabled(skillId);
        const newVal = !currentVal;
        active.currentPlayer.setAutocast(skillId, newVal);

        // Immediate visual state update on the button
        btn.className = `hud-autocast-btn ${newVal ? 'autocast-on' : 'autocast-off'}`;
        btn.innerText = newVal ? 'AUTO: ON' : 'AUTO: OFF';

        // Also update Outpost loadout modal if open
        if (active.isLoadoutModalOpen() && active.currentProgression) {
          active.renderLoadoutModal(active.currentPlayer, active.currentProgression);
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

    // Expose debug helpers globally on window for console testing
    (window as any).debugGrantSkillBook = (id: string = 'book_power_strike') => HUD.activeInstance?.debugGrantSkillBook(id);
    (window as any).debugGrantResearchPoints = (amount: number = 10) => HUD.activeInstance?.debugGrantResearchPoints(amount);
    (window as any).debugApplyBleed = () => HUD.activeInstance?.debugApplyBleed();
    (window as any).debugApplyBandage = () => HUD.activeInstance?.applyBandage();
    (window as any).debugCraftBandage = () => {
      const gs = GameState.getInstance();
      if (gs.consumeWood(5)) {
        gs.addItem('bandage', 1);
        HUD.activeInstance?.currentProgression?.addProficiencyExp('alchemy', 25);
        HUD.activeInstance?.showToast('⚗️ Crafted Bandage! (+25 Alchemy EXP)', 'success');
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
      // Key listeners: Tab (toggle HUD panel), L (toggle Loadout modal), B (toggle Build mode), H (apply bandage), Escape (close modals)
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
        } else if (e.key === 'Escape') {
          active.closeLoadoutModal();
          active.closeResearchTreeModal();
          active.closeAlchemyModal();
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
          ? `${skillDef.energyCost} EN | ${skillDef.cooldownMs / 1000}s CD | ${skillDef.damageMultiplier * 100}% DMG`
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
          <span>Damage: ${skillDef.damageMultiplier * 100}%</span>
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

  public update(player: Player, progression: ProgressionSystem, time: number): void {
    this.currentPlayer = player;
    this.currentProgression = progression;

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

    if (this.profEl) {
      const weaponId = player.equippedWeapon.id;
      const stat = progression.getProficiencyStat(weaponId);
      const nextExp = LevelingSystem.expForNextLevel(stat.level);
      const isFencerUnlocked = progression.isClassUnlocked('fencer');
      const tierText = isFencerUnlocked ? 'Novice' : 'Unranked';
      this.profEl.innerText = `Level ${stat.level} (${stat.currentExp}/${nextExp} EXP) [${tierText}]`;
    }

    // 4b. Construction Proficiency
    if (this.constructionProfEl) {
      const constStat = progression.getProficiencyStat('construction');
      const constTier = progression.getConstructionTier();
      const nextExp = LevelingSystem.expForNextLevel(constStat.level);
      this.constructionProfEl.innerText = `Level ${constStat.level} (${constStat.currentExp}/${nextExp} EXP) (${constTier.name})`;
    }

    // 4b2. Alchemy Proficiency
    if (this.alchemyProfTextEl && this.hudAlchemyRowEl) {
      const alchemyStat = progression.getProficiencyStat('alchemy');
      const isAlchemyUnlocked = GameState.getInstance().isBuildableUnlocked('alchemy_station');
      if (isAlchemyUnlocked || alchemyStat.level > 0 || alchemyStat.currentExp > 0) {
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

    // 9. Live All-Skills Debug Overview Panel (Backtick toggle)
    this.updateDebugSkillsPanel(progression);
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

  public showSkillDiscoveredModal(skillDef: HiddenSkillDef): void {
    if (this.discoveredSkillNameEl) {
      this.discoveredSkillNameEl.innerText = skillDef.name;
    }
    if (this.discoveredSkillDescEl) {
      const tier1 = skillDef.tierEffects?.find((t) => t.level === 1);
      this.discoveredSkillDescEl.innerText = tier1
        ? `${tier1.description} — ${skillDef.description}`
        : skillDef.description;
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
    const nextExp = LevelingSystem.expForNextLevel(alchemyStat.level);
    if (this.alchemyModalProfEl) {
      this.alchemyModalProfEl.innerText = `Level ${alchemyStat.level} (${alchemyStat.currentExp}/${nextExp} EXP)`;
    }

    // 2. Resource counts
    if (this.alchemyModalWoodEl) {
      this.alchemyModalWoodEl.innerText = `🪵 ${gameState.getWood()}`;
    }
    if (this.alchemyModalBandagesEl) {
      this.alchemyModalBandagesEl.innerText = `🩹 ${gameState.getItemCount('bandage')}`;
    }

    // 3. Recipes list
    if (this.alchemyRecipesContainerEl) {
      this.alchemyRecipesContainerEl.innerHTML = '';
      for (const recipe of alchemyRecipes) {
        const woodCost = recipe.ingredients.wood || 0;
        const hasWood = gameState.getWood() >= woodCost;

        const card = document.createElement('div');
        card.style.cssText = 'background: rgba(31, 41, 55, 0.85); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px;';

        const btnHtml = hasWood
          ? `<button type="button" class="btn-action" style="background: #059669; border-color: #34d399; font-size: 12px; padding: 6px 14px;" data-craft-recipe="${recipe.id}">⚗️ Craft (+${recipe.expGranted} EXP)</button>`
          : `<button type="button" disabled style="background: #374151; color: #9ca3af; border: 1px solid #4b5563; border-radius: 6px; font-size: 12px; padding: 6px 14px; cursor: not-allowed;">Needs 🪵 ${woodCost} Wood</button>`;

        card.innerHTML = `
          <div style="flex: 1;">
            <div style="font-size: 14px; font-weight: bold; color: #34d399; display: flex; align-items: center; gap: 8px;">
              <span>${recipe.name}</span>
              <span style="font-size: 11px; color: #fbbf24; font-weight: normal;">Cost: 🪵 ${woodCost} Wood</span>
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
              gameState.addItem(recipe.id, 1);
              progression.addProficiencyExp('alchemy', recipe.expGranted);
              this.showToast(`⚗️ Crafted ${recipe.name}! (+${recipe.expGranted} Alchemy EXP)`, 'success', 2500);
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
}
