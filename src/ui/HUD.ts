import { Player } from '../entities/Player';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { ClassDef } from '../types/game';
import { DataLoader } from '../utils/DataLoader';

export class HUD {
  private playerHpEl: HTMLElement | null;
  private playerCritHpEl: HTMLElement | null;
  private playerEnergyEl: HTMLElement | null;
  private weaponEl: HTMLElement | null;
  private profEl: HTMLElement | null;
  private skillStatusEl: HTMLElement | null;
  private playerStatusEl: HTMLElement | null;
  private unlockModalEl: HTMLElement | null;
  private classNameEl: HTMLElement | null;
  private classFantasyEl: HTMLElement | null;
  private downedBannerEl: HTMLElement | null;

  constructor() {
    this.playerHpEl = document.getElementById('player-hp-text');
    this.playerCritHpEl = document.getElementById('player-crit-hp-text');
    this.playerEnergyEl = document.getElementById('player-energy-text');
    this.weaponEl = document.getElementById('equipped-weapon-text');
    this.profEl = document.getElementById('proficiency-text');
    this.skillStatusEl = document.getElementById('skill-status-text');
    this.playerStatusEl = document.getElementById('player-status-text');
    this.unlockModalEl = document.getElementById('unlock-modal');
    this.classNameEl = document.getElementById('unlocked-class-name');
    this.classFantasyEl = document.getElementById('unlocked-class-fantasy');
    this.downedBannerEl = document.getElementById('downed-banner');
  }

  public update(player: Player, progression: ProgressionSystem, time: number): void {
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

    // 5. Skill Status (Power Strike)
    if (this.skillStatusEl) {
      const powerStrikeDef = DataLoader.getInstance().getSkill('power_strike');
      if (powerStrikeDef && progression.isSkillUnlocked(powerStrikeDef)) {
        const lastUsed = player.lastSkillUseTimes.get('power_strike') || 0;
        const elapsed = time - lastUsed;
        const cooldownMs = powerStrikeDef.cooldownMs;

        if (elapsed < cooldownMs) {
          const remainingSec = ((cooldownMs - elapsed) / 1000).toFixed(1);
          this.skillStatusEl.innerText = `Cooldown (${remainingSec}s)`;
          this.skillStatusEl.style.color = '#f59e0b'; // Amber
        } else if (player.energy < powerStrikeDef.energyCost) {
          this.skillStatusEl.innerText = `Low Energy (${powerStrikeDef.energyCost} required)`;
          this.skillStatusEl.style.color = '#9ca3af'; // Grey
        } else {
          this.skillStatusEl.innerText = 'Ready (Auto-Cast)';
          this.skillStatusEl.style.color = '#22c55e'; // Green
        }
      } else {
        this.skillStatusEl.innerText = 'Locked (Requires Fencer)';
        this.skillStatusEl.style.color = '#6b7280'; // Darker Grey
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
