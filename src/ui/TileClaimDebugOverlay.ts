import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';

export interface OverlayStackReport {
  occupiedStacks: { tile: { x: number; y: number }; units: string[] }[];
  claimDoubleBookings: { tile: { x: number; y: number }; units: string[] }[];
}

export class TileClaimDebugOverlay {
  private scene: Phaser.Scene;
  private party: Player[];
  private enemies: Enemy[];
  private tileSize: number;

  private enabled: boolean = false;
  private graphics: Phaser.GameObjects.Graphics;
  private labelsContainer: Phaser.GameObjects.Container;
  private statusText: Phaser.GameObjects.Text;
  private vKey: Phaser.Input.Keyboard.Key | null = null;

  // Flash animation timer
  private flashState: boolean = false;
  private lastFlashTimeMs: number = 0;

  // Last stack report for programmatic inspection in tests
  public lastReport: OverlayStackReport = {
    occupiedStacks: [],
    claimDoubleBookings: []
  };

  constructor(scene: Phaser.Scene, party: Player[], enemies: Enemy[], tileSize: number) {
    this.scene = scene;
    this.party = party;
    this.enemies = enemies;
    this.tileSize = tileSize;

    // Graphics at depth 9999 so it renders on the tilemap above sprites but under floating UI
    this.graphics = this.scene.add.graphics().setDepth(9999);
    this.labelsContainer = this.scene.add.container(0, 0).setDepth(10000);

    // Fixed screen HUD status indicator
    this.statusText = this.scene.add.text(12, 60, '', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: '#111827dd',
      padding: { x: 8, y: 4 }
    }).setScrollFactor(0).setDepth(10001).setVisible(false);

    if (this.scene.input && this.scene.input.keyboard) {
      this.vKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V);
      this.vKey.on('down', () => {
        this.toggle();
      });
    }
  }


  public setParty(party: Player[]): void {
    this.party = party;
  }

  public setEnemies(enemies: Enemy[]): void {
    this.enemies = enemies;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    this.statusText.setVisible(this.enabled);
    if (!this.enabled) {
      this.clearVisuals();
    }
    console.log(`[TileClaimDebugOverlay] Toggled: ${this.enabled ? 'ENABLED' : 'DISABLED'}`);
    return this.enabled;
  }

  public setEnabled(val: boolean): void {
    if (this.enabled !== val) {
      this.toggle();
    }
  }

  public clearVisuals(): void {
    this.graphics.clear();
    this.labelsContainer.removeAll(true);
  }

  public update(time: number): void {
    // Key toggle listener
    if (this.vKey && Phaser.Input.Keyboard.JustDown(this.vKey)) {
      this.toggle();
    }

    if (!this.enabled) return;

    // Toggle flash state every 250ms for alert visibility
    if (time - this.lastFlashTimeMs >= 250) {
      this.flashState = !this.flashState;
      this.lastFlashTimeMs = time;
    }

    this.renderOverlay();
  }

  private renderOverlay(): void {
    this.graphics.clear();
    this.labelsContainer.removeAll(true);

    const ts = this.tileSize;

    // 1. Group live unit positions by tile
    const occupiedMap = new Map<string, { x: number; y: number; units: { name: string; isParty: boolean }[] }>();
    
    for (const m of this.party) {
      if (m.state === 'dead' || m.state === 'downed') continue;
      const key = `${m.gridPos.x},${m.gridPos.y}`;
      if (!occupiedMap.has(key)) {
        occupiedMap.set(key, { x: m.gridPos.x, y: m.gridPos.y, units: [] });
      }
      occupiedMap.get(key)!.units.push({ name: m.entityName, isParty: true });
    }

    for (const e of this.enemies) {
      if (e.state === 'dead' || e.state === 'downed') continue;
      const key = `${e.gridPos.x},${e.gridPos.y}`;
      if (!occupiedMap.has(key)) {
        occupiedMap.set(key, { x: e.gridPos.x, y: e.gridPos.y, units: [] });
      }
      occupiedMap.get(key)!.units.push({ name: e.entityName, isParty: false });
    }

    // 2. Group claimed destinations by tile
    const claimedMap = new Map<string, { x: number; y: number; units: { name: string; origin: { x: number; y: number } }[] }>();

    for (const m of this.party) {
      if (m.state === 'dead' || m.state === 'downed' || !m.claimedDestination) continue;
      const key = `${m.claimedDestination.x},${m.claimedDestination.y}`;
      if (!claimedMap.has(key)) {
        claimedMap.set(key, { x: m.claimedDestination.x, y: m.claimedDestination.y, units: [] });
      }
      claimedMap.get(key)!.units.push({ name: m.entityName, origin: { x: m.x, y: m.y } });
    }

    for (const e of this.enemies) {
      if (e.state === 'dead' || e.state === 'downed' || !e.claimedDestination) continue;
      const key = `${e.claimedDestination.x},${e.claimedDestination.y}`;
      if (!claimedMap.has(key)) {
        claimedMap.set(key, { x: e.claimedDestination.x, y: e.claimedDestination.y, units: [] });
      }
      claimedMap.get(key)!.units.push({ name: e.entityName, origin: { x: e.x, y: e.y } });
    }

    // Reset stack report
    const occupiedStacks: { tile: { x: number; y: number }; units: string[] }[] = [];
    const claimDoubleBookings: { tile: { x: number; y: number }; units: string[] }[] = [];

    // 3. Render Claimed Destinations
    for (const [, claim] of claimedMap) {
      const px = claim.x * ts;
      const py = claim.y * ts;
      const hasDoubleBooking = claim.units.length > 1;

      if (hasDoubleBooking) {
        claimDoubleBookings.push({
          tile: { x: claim.x, y: claim.y },
          units: claim.units.map(u => u.name)
        });

        // High-contrast flashing amber/red for double-booking claim!
        const fillColor = this.flashState ? 0xdc2626 : 0xf97316;
        this.graphics.fillStyle(fillColor, 0.5);
        this.graphics.fillRect(px, py, ts, ts);
        this.graphics.lineStyle(3, 0xff0000, 1);
        this.graphics.strokeRect(px + 1, py + 1, ts - 2, ts - 2);

        const alertText = this.scene.add.text(px + ts / 2, py - 6, `⚠️ DBL-CLAIM: ${claim.units.map(u => u.name).join(' + ')}`, {
          fontSize: '10px',
          fontStyle: 'bold',
          color: '#ffffff',
          backgroundColor: '#dc2626ee',
          padding: { x: 3, y: 1 }
        }).setOrigin(0.5, 1);
        this.labelsContainer.add(alertText);
      } else {
        // Normal single claim: Emerald green with dotted/dashed interior
        this.graphics.fillStyle(0x10b981, 0.22);
        this.graphics.fillRect(px + 2, py + 2, ts - 4, ts - 4);
        this.graphics.lineStyle(2, 0x10b981, 0.9);
        this.graphics.strokeRect(px + 2, py + 2, ts - 4, ts - 4);

        const claimText = this.scene.add.text(px + ts / 2, py + ts / 2, `🎯 ${claim.units[0].name.slice(0, 4)}`, {
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#6ee7b7'
        }).setOrigin(0.5);
        this.labelsContainer.add(claimText);
      }

      // Draw trajectory line from origin to destination
      for (const u of claim.units) {
        this.graphics.lineStyle(1.5, hasDoubleBooking ? 0xef4444 : 0x34d399, 0.7);
        this.graphics.lineBetween(u.origin.x, u.origin.y, px + ts / 2, py + ts / 2);
      }
    }

    // 4. Render Live Occupied Positions
    for (const [, occ] of occupiedMap) {
      const px = occ.x * ts;
      const py = occ.y * ts;
      const hasStack = occ.units.length > 1;

      if (hasStack) {
        occupiedStacks.push({
          tile: { x: occ.x, y: occ.y },
          units: occ.units.map(u => u.name)
        });

        // Flashing crimson alarm for physical tile stacking!
        const fillColor = this.flashState ? 0xff0044 : 0x7f1d1d;
        this.graphics.fillStyle(fillColor, 0.75);
        this.graphics.fillRect(px, py, ts, ts);
        this.graphics.lineStyle(3, 0xffff00, 1);
        this.graphics.strokeRect(px + 1, py + 1, ts - 2, ts - 2);

        const alertText = this.scene.add.text(px + ts / 2, py + ts + 2, `⚠️ STACK: ${occ.units.map(u => u.name).join(' + ')}`, {
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#ffffff',
          backgroundColor: '#b91c1cff',
          padding: { x: 4, y: 2 }
        }).setOrigin(0.5, 0);
        this.labelsContainer.add(alertText);
      } else {
        const unit = occ.units[0];
        if (unit.isParty) {
          // Party Member: Blue box with initials
          this.graphics.fillStyle(0x3b82f6, 0.25);
          this.graphics.fillRect(px + 1, py + 1, ts - 2, ts - 2);
          this.graphics.lineStyle(2, 0x60a5fa, 0.95);
          this.graphics.strokeRect(px + 1, py + 1, ts - 2, ts - 2);

          const nameTag = this.scene.add.text(px + ts / 2, py - 4, unit.name.slice(0, 5), {
            fontSize: '9px',
            fontStyle: 'bold',
            color: '#bfdbfe',
            backgroundColor: '#1e3a8acc',
            padding: { x: 2, y: 1 }
          }).setOrigin(0.5, 1);
          this.labelsContainer.add(nameTag);
        } else {
          // Enemy: Red outline with name
          this.graphics.fillStyle(0xef4444, 0.25);
          this.graphics.fillRect(px + 1, py + 1, ts - 2, ts - 2);
          this.graphics.lineStyle(2, 0xf87171, 0.95);
          this.graphics.strokeRect(px + 1, py + 1, ts - 2, ts - 2);

          const nameTag = this.scene.add.text(px + ts / 2, py - 4, unit.name.slice(0, 5), {
            fontSize: '9px',
            fontStyle: 'bold',
            color: '#fecaca',
            backgroundColor: '#7f1d1dcc',
            padding: { x: 2, y: 1 }
          }).setOrigin(0.5, 1);
          this.labelsContainer.add(nameTag);
        }
      }
    }

    this.lastReport = {
      occupiedStacks,
      claimDoubleBookings
    };

    // Update screen HUD text
    const totalStacks = occupiedStacks.length + claimDoubleBookings.length;
    const stackAlert = totalStacks > 0 ? ` ⚠️ STACKS DETECTED: ${totalStacks}!` : ' ✔ ZERO STACKS';
    this.statusText.setText(
      `[DEBUG OVERLAY: ON] (Press V to hide)\nOccupied: ${occupiedMap.size} | Active Claims: ${claimedMap.size} |${stackAlert}`
    );
    this.statusText.setColor(totalStacks > 0 ? '#ef4444' : '#22c55e');
  }

  public destroy(): void {
    if (this.vKey) {
      this.vKey.removeAllListeners();
    }
    this.graphics.destroy();
    this.labelsContainer.destroy();
    this.statusText.destroy();
  }
}
