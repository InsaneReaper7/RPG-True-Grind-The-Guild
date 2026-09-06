import { Player } from '../entities/Player';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { ClassDef } from '../types/game';
import { DataLoader } from '../utils/DataLoader';
import { GameState } from '../systems/GameState';

export class HUD {
  private playerHpEl: HTMLElement | null;
  private playerCritHpEl: HTMLElement | null;
  private playerEnergyEl: HTMLElement | null;
  private weaponEl: HTMLElement | null;
  private profEl: HTMLElement | null;
  private playerStatusEl: HTMLElement | null;
  private locationBadgeEl: HTMLElement | null;
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
  private buildRotationBadgeEl: HTMLElement | null;
  private exitBuildBtn: HTMLElement | null;
  private buildPaletteContainerEl: HTMLElement | null;
  private buildFeedbackToastEl: HTMLElement | null;
  private toastTimer: any = null;
  private static isHudCardVisible: boolean = true;
  private renderedSkillsKey: string = '';

  private static activeInstance: HUD | null = null;
  private static hasGlobalListeners: boolean = false;

  private isOutpost: boolean = false;
  private currentPlayer: Player | null = null;
  private currentProgression: ProgressionSystem | null = null;
  private onBuildModeToggleCallback?: () => void;
  private onSelectBuildableCallback?: (id: string) => void;

  constructor() {
    this.hudCardEl = document.getElementById('hud-card');
    this.playerHpEl = document.getElementById('player-hp-text');
    this.playerCritHpEl = document.getElementById('player-crit-hp-text');
    this.playerEnergyEl = document.getElementById('player-energy-text');
    this.weaponEl = document.getElementById('equipped-weapon-text');
    this.profEl = document.getElementById('proficiency-text');
    this.playerStatusEl = document.getElementById('player-status-text');
    this.hudWoodRowEl = document.getElementById('hud-wood-row');
    this.playerWoodEl = document.getElementById('player-wood-text');
    this.locationBadgeEl = document.getElementById('location-badge');
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
    this.buildRotationBadgeEl = document.getElementById('build-rotation-badge');
    this.exitBuildBtn = document.getElementById('exit-build-btn');
    this.buildPaletteContainerEl = document.getElementById('build-palette-container');
    this.buildFeedbackToastEl = document.getElementById('build-feedback-toast');

    if (this.hudCardEl) {
      this.hudCardEl.style.display = HUD.isHudCardVisible ? 'block' : 'none';
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

    if (!HUD.hasGlobalListeners) {
      HUD.hasGlobalListeners = true;
      // Key listeners: Tab (toggle HUD panel), L (toggle Loadout modal), B (toggle Build mode), Escape (close modals)
      window.addEventListener('keydown', (e) => {
        const active = HUD.activeInstance;
        if (!active) return;

        if (e.key === 'Tab') {
          e.preventDefault(); // Prevent default focus navigation
          active.toggleHudCard();
        } else if (e.key === 'l' || e.key === 'L') {
          if (active.isOutpost && active.currentPlayer && active.currentProgression) {
            active.toggleLoadoutModal(active.currentPlayer, active.currentProgression);
          }
        } else if (e.key === 'b' || e.key === 'B') {
          if (active.isOutpost) {
            active.onBuildModeToggleCallback?.();
          }
        } else if (e.key === 'Escape') {
          active.closeLoadoutModal();
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

  public updateBuildOverlay(wood: number, rotation: number, selectedId: string): void {
    if (this.buildOverlayWoodEl) {
      this.buildOverlayWoodEl.innerText = `🪵 Wood: ${wood}`;
    }
    if (this.playerWoodEl) {
      this.playerWoodEl.innerText = `🪵 ${wood}`;
    }
    if (this.buildRotationBadgeEl) {
      this.buildRotationBadgeEl.innerText = `Rotation: ${rotation}° [R]`;
    }
    if (this.buildPaletteContainerEl) {
      const items = this.buildPaletteContainerEl.querySelectorAll<HTMLElement>('.palette-item');
      items.forEach((item) => {
        if (item.dataset.buildableId === selectedId) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
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

  public setLocation(name: string, isOutpost: boolean): void {
    this.isOutpost = isOutpost;
    HUD.activeInstance = this;

    if (this.locationBadgeEl) {
      this.locationBadgeEl.innerText = name.toUpperCase();
      this.locationBadgeEl.style.color = isOutpost ? '#34d399' : '#a78bfa';
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
      const isUnlocked = progression.isSkillUnlocked(skillDef);

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
      const currentProf = progression.getProficiency(weaponId);
      const isFencerUnlocked = progression.isClassUnlocked('fencer');
      const tierText = isFencerUnlocked ? 'Novice' : 'Unranked';
      this.profEl.innerText = `${currentProf} / 10 (${tierText})`;
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

        const isUnlocked = progression.isSkillUnlocked(skillDef);
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
}
