import { Player } from '../entities/Player';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { ClassDef } from '../types/game';

export class HUD {
  private playerHpEl: HTMLElement | null;
  private weaponEl: HTMLElement | null;
  private profEl: HTMLElement | null;
  private unlockModalEl: HTMLElement | null;
  private classNameEl: HTMLElement | null;
  private classFantasyEl: HTMLElement | null;

  constructor() {
    this.playerHpEl = document.getElementById('player-hp-text');
    this.weaponEl = document.getElementById('equipped-weapon-text');
    this.profEl = document.getElementById('proficiency-text');
    this.unlockModalEl = document.getElementById('unlock-modal');
    this.classNameEl = document.getElementById('unlocked-class-name');
    this.classFantasyEl = document.getElementById('unlocked-class-fantasy');
  }

  public update(player: Player, progression: ProgressionSystem): void {
    if (this.playerHpEl) {
      this.playerHpEl.innerText = `${player.hp} / ${player.maxHp}`;
    }

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
