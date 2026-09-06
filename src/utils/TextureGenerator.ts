import Phaser from 'phaser';

export class TextureGenerator {
  public static generatePlaceholderTextures(scene: Phaser.Scene, tileSize: number = 32): void {
    // 1. Walkable Tile Texture
    if (!scene.textures.exists('tile-walkable')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x374151, 1); // Dark Slate
      g.fillRect(0, 0, tileSize, tileSize);
      g.lineStyle(1, 0x4b5563, 0.5); // Grid line border
      g.strokeRect(0, 0, tileSize, tileSize);
      g.generateTexture('tile-walkable', tileSize, tileSize);
      g.destroy();
    }

    // 2. Obstacle Tile Texture
    if (!scene.textures.exists('tile-obstacle')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x1f2937, 1);
      g.fillRect(0, 0, tileSize, tileSize);
      g.lineStyle(2, 0xd1d5db, 0.4);
      g.strokeRect(2, 2, tileSize - 4, tileSize - 4);
      g.lineBetween(4, 4, tileSize - 4, tileSize - 4);
      g.generateTexture('tile-obstacle', tileSize, tileSize);
      g.destroy();
    }

    // 3. Player Avatar Texture (Blue Circle with Sword indicator)
    if (!scene.textures.exists('player-avatar')) {
      const size = 28;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x3b82f6, 1); // Bright Blue
      g.fillCircle(size / 2, size / 2, size / 2 - 2);
      g.lineStyle(2, 0x60a5fa, 1);
      g.strokeCircle(size / 2, size / 2, size / 2 - 2);
      // Sword icon
      g.lineStyle(2, 0xffffff, 1);
      g.lineBetween(size / 2 - 4, size / 2 + 4, size / 2 + 4, size / 2 - 4);
      g.generateTexture('player-avatar', size, size);
      g.destroy();
    }

    // 4. Wolf Avatar Texture (Red/Amber Diamond)
    if (!scene.textures.exists('wolf-avatar')) {
      const size = 28;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xef4444, 1); // Red
      g.beginPath();
      g.moveTo(size / 2, 2);
      g.lineTo(size - 2, size / 2);
      g.lineTo(size / 2, size - 2);
      g.lineTo(2, size / 2);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, 0xfca5a5, 1);
      g.strokePath();
      g.generateTexture('wolf-avatar', size, size);
      g.destroy();
    }

    // 5. Target Selection Reticle
    if (!scene.textures.exists('target-reticle')) {
      const size = 32;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.lineStyle(2, 0xf59e0b, 0.9);
      g.strokeRect(2, 2, size - 4, size - 4);
      g.generateTexture('target-reticle', size, size);
      g.destroy();
    }

    // 6. Bleed Status Indicator Texture (Red Blood Drop)
    if (!scene.textures.exists('bleed-icon')) {
      const size = 12;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xd97706, 1); // Darker Amber / Blood Red
      g.fillCircle(size / 2, size / 2 + 2, 4);
      g.beginPath();
      g.moveTo(size / 2, 1);
      g.lineTo(size / 2 - 4, size / 2 + 2);
      g.lineTo(size / 2 + 4, size / 2 + 2);
      g.closePath();
      g.fillPath();
      g.fillStyle(0xd97706, 1);
      g.generateTexture('bleed-icon', size, size);
      g.destroy();
    }
  }
}
