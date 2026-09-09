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

    // 3b. Companion Avatar Texture (Purple Circle with Dual Daggers icon)
    if (!scene.textures.exists('companion-avatar')) {
      const size = 28;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x8b5cf6, 1); // Violet / Purple
      g.fillCircle(size / 2, size / 2, size / 2 - 2);
      g.lineStyle(2, 0xc4b5fd, 1);
      g.strokeCircle(size / 2, size / 2, size / 2 - 2);
      // Dual Dagger crossing icon
      g.lineStyle(2, 0xffffff, 1);
      g.lineBetween(size / 2 - 4, size / 2 + 4, size / 2 + 4, size / 2 - 4);
      g.lineBetween(size / 2 - 4, size / 2 - 4, size / 2 + 4, size / 2 + 4);
      g.generateTexture('companion-avatar', size, size);
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

    // 4b. Goblin Avatar Texture (Green Diamond with pointed ear accents)
    if (!scene.textures.exists('goblin-avatar')) {
      const size = 28;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x16a34a, 1); // Forest/Goblin Green
      g.beginPath();
      g.moveTo(size / 2, 3);
      g.lineTo(size - 2, size / 2);
      g.lineTo(size / 2, size - 3);
      g.lineTo(2, size / 2);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, 0x86efac, 1);
      g.strokePath();
      // Pointed ear notches
      g.fillStyle(0x4ade80, 1);
      g.fillTriangle(2, size / 2, 0, size / 2 - 4, 4, size / 2 - 2);
      g.fillTriangle(size - 2, size / 2, size, size / 2 - 4, size - 4, size / 2 - 2);
      // Small feral eyes
      g.fillStyle(0xfef08a, 1);
      g.fillCircle(size / 2 - 4, size / 2 - 2, 2);
      g.fillCircle(size / 2 + 4, size / 2 - 2, 2);
      g.generateTexture('goblin-avatar', size, size);
      g.destroy();
    }

    // 4c. Skeleton Avatar Texture (Bone Ivory with Skull & Crossbone accents)
    if (!scene.textures.exists('skeleton-avatar')) {
      const size = 28;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xe2e8f0, 1); // Bone Ivory
      g.fillCircle(size / 2, size / 2, size / 2 - 3);
      g.lineStyle(2, 0x94a3b8, 1);
      g.strokeCircle(size / 2, size / 2, size / 2 - 3);
      // Dark eye sockets
      g.fillStyle(0x0f172a, 1);
      g.fillCircle(size / 2 - 4, size / 2 - 2, 3);
      g.fillCircle(size / 2 + 4, size / 2 - 2, 3);
      // Nasal cavity / teeth line
      g.lineStyle(2, 0x0f172a, 1);
      g.lineBetween(size / 2 - 3, size / 2 + 5, size / 2 + 3, size / 2 + 5);
      g.generateTexture('skeleton-avatar', size, size);
      g.destroy();
    }

    // 4d. Undead Avatar Texture (Rotting Teal / Decaying Ghoul)
    if (!scene.textures.exists('undead-avatar')) {
      const size = 28;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x0f766e, 1); // Dark Rot Teal
      g.beginPath();
      g.moveTo(size / 2, 2);
      g.lineTo(size - 3, size / 2);
      g.lineTo(size / 2, size - 2);
      g.lineTo(3, size / 2);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, 0x2dd4bf, 1);
      g.strokePath();
      // Glowing eerie eyes
      g.fillStyle(0xc084fc, 1); // Eerie Violet
      g.fillCircle(size / 2 - 4, size / 2 - 2, 2.5);
      g.fillCircle(size / 2 + 4, size / 2 - 2, 2.5);
      g.generateTexture('undead-avatar', size, size);
      g.destroy();
    }

    // 4e. Slime Avatar Texture (Vibrant emerald gelatinous blob)
    if (!scene.textures.exists('slime-avatar')) {
      const size = 28;
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Gelatinous droplet blob base
      g.fillStyle(0x10b981, 0.85); // Emerald Green
      g.fillEllipse(size / 2, size / 2 + 2, 11, 9);
      g.fillCircle(size / 2, size / 2 - 2, 8);
      g.lineStyle(2, 0x34d399, 1);
      g.strokeEllipse(size / 2, size / 2 + 2, 11, 9);
      // Jelly highlight glints
      g.fillStyle(0xa7f3d0, 0.9);
      g.fillCircle(size / 2 - 4, size / 2 - 4, 3);
      g.fillCircle(size / 2 + 3, size / 2 - 6, 1.5);
      // Jelly core nucleus
      g.fillStyle(0x047857, 0.7);
      g.fillCircle(size / 2 + 1, size / 2 + 1, 3.5);
      g.generateTexture('slime-avatar', size, size);
      g.destroy();
    }

    // 4f. Goblin Archer Avatar Texture (Green Diamond with Hunting Bow)
    if (!scene.textures.exists('goblin_archer-avatar')) {
      const size = 28;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x15803d, 1); // Darker Ranger Goblin Green
      g.beginPath();
      g.moveTo(size / 2, 3);
      g.lineTo(size - 2, size / 2);
      g.lineTo(size / 2, size - 3);
      g.lineTo(2, size / 2);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, 0x86efac, 1);
      g.strokePath();
      // Pointed ear notches
      g.fillStyle(0x4ade80, 1);
      g.fillTriangle(2, size / 2, 0, size / 2 - 4, 4, size / 2 - 2);
      g.fillTriangle(size - 2, size / 2, size, size / 2 - 4, size - 4, size / 2 - 2);
      // Feral eyes
      g.fillStyle(0xfef08a, 1);
      g.fillCircle(size / 2 - 4, size / 2 - 3, 1.5);
      g.fillCircle(size / 2 + 4, size / 2 - 3, 1.5);
      // Curved wooden hunting bow across chest
      g.lineStyle(2, 0xb45309, 1); // Wood bow
      g.beginPath();
      g.arc(size / 2, size / 2 + 2, 7, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false);
      g.strokePath();
      // Bowstring
      g.lineStyle(1, 0xfef08a, 0.9);
      g.lineBetween(size / 2 - 6, size / 2 + 2, size / 2 + 6, size / 2 + 2);
      // Arrow shaft
      g.lineStyle(1.5, 0xffffff, 1);
      g.lineBetween(size / 2, size / 2 - 4, size / 2, size / 2 + 5);
      g.generateTexture('goblin_archer-avatar', size, size);
      g.destroy();
    }

    // 4g. Skeleton Archer Avatar Texture (Ivory Skull with Strung Recurve Bow)
    if (!scene.textures.exists('skeleton_archer-avatar')) {
      const size = 28;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xe2e8f0, 1); // Bone Ivory
      g.fillCircle(size / 2, size / 2, size / 2 - 3);
      g.lineStyle(2, 0x94a3b8, 1);
      g.strokeCircle(size / 2, size / 2, size / 2 - 3);
      // Dark eye sockets
      g.fillStyle(0x0f172a, 1);
      g.fillCircle(size / 2 - 4, size / 2 - 2, 2.5);
      g.fillCircle(size / 2 + 4, size / 2 - 2, 2.5);
      // Archer headband / bone notch
      g.fillStyle(0x78350f, 1);
      g.fillRect(size / 2 - 7, size / 2 - 8, 14, 2.5);
      // Strung Bow
      g.lineStyle(2, 0xd97706, 1);
      g.beginPath();
      g.arc(size / 2 + 2, size / 2 + 2, 6, Phaser.Math.DegToRad(120), Phaser.Math.DegToRad(280), false);
      g.strokePath();
      // Arrow
      g.lineStyle(1.5, 0x38bdf8, 1); // Cyan bone arrow
      g.lineBetween(size / 2 - 6, size / 2 + 2, size / 2 + 6, size / 2 + 2);
      g.generateTexture('skeleton_archer-avatar', size, size);
      g.destroy();
    }

    // 4h. Giant Spider Avatar Texture (Obsidian with Multi-legs and Ruby Eyes)
    if (!scene.textures.exists('spider-avatar')) {
      const size = 28;
      const g = scene.make.graphics({ x: 0, y: 0 });
      // 8 Arachnid legs
      g.lineStyle(2, 0x4c1d95, 1); // Deep violet chitin legs
      // Left legs
      g.lineBetween(size / 2 - 4, size / 2 - 3, 2, size / 2 - 8);
      g.lineBetween(size / 2 - 5, size / 2, 1, size / 2);
      g.lineBetween(size / 2 - 5, size / 2 + 3, 2, size / 2 + 8);
      g.lineBetween(size / 2 - 3, size / 2 + 5, 4, size / 2 + 11);
      // Right legs
      g.lineBetween(size / 2 + 4, size / 2 - 3, size - 2, size / 2 - 8);
      g.lineBetween(size / 2 + 5, size / 2, size - 1, size / 2);
      g.lineBetween(size / 2 + 5, size / 2 + 3, size - 2, size / 2 + 8);
      g.lineBetween(size / 2 + 3, size / 2 + 5, size - 4, size / 2 + 11);
      // Abdomen and Cephalothorax
      g.fillStyle(0x18181b, 1); // Obsidian black body
      g.fillCircle(size / 2, size / 2 + 3, 6);
      g.fillCircle(size / 2, size / 2 - 3, 4);
      g.lineStyle(1.5, 0x7c3aed, 0.8);
      g.strokeCircle(size / 2, size / 2 + 3, 6);
      // Ruby cluster eyes
      g.fillStyle(0xef4444, 1);
      g.fillCircle(size / 2 - 2, size / 2 - 4, 1.2);
      g.fillCircle(size / 2 + 2, size / 2 - 4, 1.2);
      g.fillCircle(size / 2 - 3, size / 2 - 2, 1);
      g.fillCircle(size / 2 + 3, size / 2 - 2, 1);
      g.generateTexture('spider-avatar', size, size);
      g.destroy();
    }

    // 4i. Orc Warrior Avatar Texture (First Elite Tier - Blood Red War Diamond with Tusks & Iron Horns)
    if (!scene.textures.exists('orc_warrior-avatar')) {
      const size = 30;
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Bulky blood-red war diamond
      g.fillStyle(0x991b1b, 1); // Dark Crimson Red
      g.beginPath();
      g.moveTo(size / 2, 2);
      g.lineTo(size - 2, size / 2);
      g.lineTo(size / 2, size - 2);
      g.lineTo(2, size / 2);
      g.closePath();
      g.fillPath();
      // Heavy iron plate border
      g.lineStyle(2.5, 0x374151, 1);
      g.strokePath();
      // Inner war rune
      g.lineStyle(1.5, 0xf59e0b, 1);
      g.lineBetween(size / 2 - 5, size / 2, size / 2 + 5, size / 2);
      g.lineBetween(size / 2, size / 2 - 5, size / 2, size / 2 + 5);
      // Iron Horned Spikes
      g.fillStyle(0x475569, 1);
      g.fillTriangle(size / 2 - 7, 6, size / 2 - 11, 0, size / 2 - 4, 4);
      g.fillTriangle(size / 2 + 7, 6, size / 2 + 11, 0, size / 2 + 4, 4);
      // Ivory war tusks curving upward
      g.fillStyle(0xf8fafc, 1);
      g.fillTriangle(size / 2 - 5, size / 2 + 4, size / 2 - 7, size / 2 - 1, size / 2 - 3, size / 2 + 2);
      g.fillTriangle(size / 2 + 5, size / 2 + 4, size / 2 + 7, size / 2 - 1, size / 2 + 3, size / 2 + 2);
      // Piercing glowing amber eyes
      g.fillStyle(0xfbbf24, 1);
      g.fillCircle(size / 2 - 4, size / 2 - 3, 1.8);
      g.fillCircle(size / 2 + 4, size / 2 - 3, 1.8);
      g.generateTexture('orc_warrior-avatar', size, size);
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

    // 6b. Burn Status Indicator Texture (Orange Flame)
    if (!scene.textures.exists('burn-icon')) {
      const size = 12;
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Outer bright orange flame
      g.fillStyle(0xf97316, 1);
      g.beginPath();
      g.moveTo(size / 2, 0);
      g.lineTo(size - 1, size / 2 + 2);
      g.lineTo(size * 0.75, size);
      g.lineTo(size * 0.25, size);
      g.lineTo(1, size / 2 + 2);
      g.closePath();
      g.fillPath();
      // Inner hot yellow flame tongue
      g.fillStyle(0xfde047, 1);
      g.beginPath();
      g.moveTo(size / 2, 3);
      g.lineTo(size - 3, size / 2 + 3);
      g.lineTo(size / 2, size - 1);
      g.lineTo(3, size / 2 + 3);
      g.closePath();
      g.fillPath();
      g.generateTexture('burn-icon', size, size);
      g.destroy();
    }

    // 7. Outpost Grass Tile
    if (!scene.textures.exists('tile-outpost-grass')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x2d4a22, 1); // Lush green
      g.fillRect(0, 0, tileSize, tileSize);
      g.lineStyle(1, 0x3f6212, 0.4);
      g.strokeRect(0, 0, tileSize, tileSize);
      // Small decorative grass blade dots
      g.fillStyle(0x4ade80, 0.4);
      g.fillRect(8, 8, 2, 4);
      g.fillRect(20, 18, 2, 4);
      g.generateTexture('tile-outpost-grass', tileSize, tileSize);
      g.destroy();
    }

    // 8. Outpost Timber Wood Tile
    if (!scene.textures.exists('tile-outpost-wood')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x5c4033, 1); // Timber brown
      g.fillRect(0, 0, tileSize, tileSize);
      g.lineStyle(1, 0x3e2723, 0.6);
      g.strokeRect(0, 0, tileSize, tileSize);
      g.lineBetween(0, tileSize / 2, tileSize, tileSize / 2);
      g.generateTexture('tile-outpost-wood', tileSize, tileSize);
      g.destroy();
    }

    // 9. Outpost Wall Obstacle Tile
    if (!scene.textures.exists('tile-outpost-wall')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x271c19, 1); // Dark timber wall
      g.fillRect(0, 0, tileSize, tileSize);
      g.lineStyle(2, 0x8d6e63, 0.8);
      g.strokeRect(2, 2, tileSize - 4, tileSize - 4);
      g.lineBetween(4, 4, tileSize - 4, tileSize - 4);
      g.lineBetween(tileSize - 4, 4, 4, tileSize - 4);
      g.generateTexture('tile-outpost-wall', tileSize, tileSize);
      g.destroy();
    }

    // 10. Portal to Outpost (Mystic Purple Swirl in Dungeon)
    if (!scene.textures.exists('portal-to-outpost')) {
      const size = 32;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xa855f7, 0.85); // Purple core
      g.fillCircle(size / 2, size / 2, 12);
      g.lineStyle(2, 0xe9d5ff, 1);
      g.strokeCircle(size / 2, size / 2, 12);
      g.lineStyle(1.5, 0xd8b4fe, 0.8);
      g.strokeCircle(size / 2, size / 2, 8);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(size / 2, size / 2, 4);
      g.generateTexture('portal-to-outpost', size, size);
      g.destroy();
    }

    // 11. Portal to Dungeon (Cyan Beacon in Outpost)
    if (!scene.textures.exists('portal-to-dungeon')) {
      const size = 32;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x06b6d4, 0.85); // Cyan core
      g.fillCircle(size / 2, size / 2, 12);
      g.lineStyle(2, 0xa5f3fc, 1);
      g.strokeCircle(size / 2, size / 2, 12);
      g.lineStyle(1.5, 0x67e8f9, 0.8);
      g.strokeCircle(size / 2, size / 2, 8);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(size / 2, size / 2, 4);
      g.generateTexture('portal-to-dungeon', size, size);
      g.destroy();
    }

    // 12. Buildable Wood Floor (Clean timber planks)
    if (!scene.textures.exists('buildable-wood-floor')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x6b4f3b, 1);
      g.fillRect(0, 0, tileSize, tileSize);
      g.lineStyle(1, 0x4a3525, 0.8);
      g.strokeRect(0, 0, tileSize, tileSize);
      g.lineBetween(0, 10, tileSize, 10);
      g.lineBetween(0, 21, tileSize, 21);
      // Small wood grain nails
      g.fillStyle(0x2e1c0c, 0.6);
      g.fillRect(3, 4, 1, 2);
      g.fillRect(tileSize - 4, 4, 1, 2);
      g.fillRect(14, 15, 1, 2);
      g.fillRect(6, 26, 1, 2);
      g.generateTexture('buildable-wood-floor', tileSize, tileSize);
      g.destroy();
    }

    // 13. Buildable Walls (Auto-Orienting Timber Walls)
    // 13a. Single / standalone wall
    if (!scene.textures.exists('buildable-wood-wall-single')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x3e2723, 1);
      g.fillRect(4, 4, tileSize - 8, tileSize - 8);
      g.lineStyle(2, 0x8d6e63, 1);
      g.strokeRect(4, 4, tileSize - 8, tileSize - 8);
      g.fillStyle(0xd7ccc8, 0.9);
      g.fillCircle(tileSize / 2, tileSize / 2, 3);
      g.generateTexture('buildable-wood-wall-single', tileSize, tileSize);
      g.destroy();
    }

    // 13b. Horizontal wall (East-West)
    if (!scene.textures.exists('buildable-wood-wall-h')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x3e2723, 1);
      g.fillRect(0, 6, tileSize, tileSize - 12);
      g.lineStyle(2, 0x8d6e63, 1);
      g.lineBetween(0, 6, tileSize, 6);
      g.lineBetween(0, tileSize - 6, tileSize, tileSize - 6);
      g.lineStyle(1, 0x5d4037, 0.9);
      g.lineBetween(0, tileSize / 2, tileSize, tileSize / 2);
      g.generateTexture('buildable-wood-wall-h', tileSize, tileSize);
      g.destroy();
    }

    // 13c. Vertical wall (North-South)
    if (!scene.textures.exists('buildable-wood-wall-v')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x3e2723, 1);
      g.fillRect(6, 0, tileSize - 12, tileSize);
      g.lineStyle(2, 0x8d6e63, 1);
      g.lineBetween(6, 0, 6, tileSize);
      g.lineBetween(tileSize - 6, 0, tileSize - 6, tileSize);
      g.lineStyle(1, 0x5d4037, 0.9);
      g.lineBetween(tileSize / 2, 0, tileSize / 2, tileSize);
      g.generateTexture('buildable-wood-wall-v', tileSize, tileSize);
      g.destroy();
    }

    // 13d. Corner NW (connects South & East)
    if (!scene.textures.exists('buildable-wood-wall-corner-nw')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x3e2723, 1);
      g.fillRect(6, 6, tileSize - 6, tileSize - 12); // East arm
      g.fillRect(6, 6, tileSize - 12, tileSize - 6); // South arm
      g.lineStyle(2, 0x8d6e63, 1);
      g.strokeRect(6, 6, tileSize - 12, tileSize - 12);
      g.generateTexture('buildable-wood-wall-corner-nw', tileSize, tileSize);
      g.destroy();
    }

    // 13e. Corner NE (connects South & West)
    if (!scene.textures.exists('buildable-wood-wall-corner-ne')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x3e2723, 1);
      g.fillRect(0, 6, tileSize - 6, tileSize - 12); // West arm
      g.fillRect(6, 6, tileSize - 12, tileSize - 6); // South arm
      g.lineStyle(2, 0x8d6e63, 1);
      g.strokeRect(6, 6, tileSize - 12, tileSize - 12);
      g.generateTexture('buildable-wood-wall-corner-ne', tileSize, tileSize);
      g.destroy();
    }

    // 13f. Corner SW (connects North & East)
    if (!scene.textures.exists('buildable-wood-wall-corner-sw')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x3e2723, 1);
      g.fillRect(6, 6, tileSize - 6, tileSize - 12); // East arm
      g.fillRect(6, 0, tileSize - 12, tileSize - 6); // North arm
      g.lineStyle(2, 0x8d6e63, 1);
      g.strokeRect(6, 6, tileSize - 12, tileSize - 12);
      g.generateTexture('buildable-wood-wall-corner-sw', tileSize, tileSize);
      g.destroy();
    }

    // 13g. Corner SE (connects North & West)
    if (!scene.textures.exists('buildable-wood-wall-corner-se')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x3e2723, 1);
      g.fillRect(0, 6, tileSize - 6, tileSize - 12); // West arm
      g.fillRect(6, 0, tileSize - 12, tileSize - 6); // North arm
      g.lineStyle(2, 0x8d6e63, 1);
      g.strokeRect(6, 6, tileSize - 12, tileSize - 12);
      g.generateTexture('buildable-wood-wall-corner-se', tileSize, tileSize);
      g.destroy();
    }

    // 13h. Junction / Cross
    if (!scene.textures.exists('buildable-wood-wall-junction')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x3e2723, 1);
      g.fillRect(0, 6, tileSize, tileSize - 12);
      g.fillRect(6, 0, tileSize - 12, tileSize);
      g.lineStyle(2, 0x8d6e63, 1);
      g.strokeRect(6, 6, tileSize - 12, tileSize - 12);
      g.generateTexture('buildable-wood-wall-junction', tileSize, tileSize);
      g.destroy();
    }

    // 14. Wood Door Horizontal (Passable door in horizontal wall)
    if (!scene.textures.exists('buildable-wood-door-h')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Floor backing
      g.fillStyle(0x6b4f3b, 1);
      g.fillRect(0, 0, tileSize, tileSize);
      // Wall posts on left & right
      g.fillStyle(0x3e2723, 1);
      g.fillRect(0, 4, 6, tileSize - 8);
      g.fillRect(tileSize - 6, 4, 6, tileSize - 8);
      // Door plank
      g.fillStyle(0xb45309, 1); // Warm timber door
      g.fillRect(6, 11, tileSize - 12, 10);
      g.lineStyle(1, 0x78350f, 1);
      g.strokeRect(6, 11, tileSize - 12, 10);
      // Brass handle
      g.fillStyle(0xfef08a, 1);
      g.fillCircle(tileSize / 2 + 4, 16, 2);
      g.generateTexture('buildable-wood-door-h', tileSize, tileSize);
      g.destroy();
    }

    // 15. Wood Door Vertical (Passable door in vertical wall)
    if (!scene.textures.exists('buildable-wood-door-v')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Floor backing
      g.fillStyle(0x6b4f3b, 1);
      g.fillRect(0, 0, tileSize, tileSize);
      // Wall posts top & bottom
      g.fillStyle(0x3e2723, 1);
      g.fillRect(4, 0, tileSize - 8, 6);
      g.fillRect(4, tileSize - 6, tileSize - 8, 6);
      // Door plank
      g.fillStyle(0xb45309, 1);
      g.fillRect(11, 6, 10, tileSize - 12);
      g.lineStyle(1, 0x78350f, 1);
      g.strokeRect(11, 6, 10, tileSize - 12);
      // Brass handle
      g.fillStyle(0xfef08a, 1);
      g.fillCircle(16, tileSize / 2 + 4, 2);
      g.generateTexture('buildable-wood-door-v', tileSize, tileSize);
      g.destroy();
    }

    // 16. Research Station (Crafting Station with Workbench, Spellbook & Flask)
    if (!scene.textures.exists('buildable-research-station')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Heavy oak worktable
      g.fillStyle(0x451a03, 1); // Dark walnut
      g.fillRect(2, 4, tileSize - 4, tileSize - 8);
      g.lineStyle(1, 0x9a3412, 1);
      g.strokeRect(2, 4, tileSize - 4, tileSize - 8);

      // Desk cloth / parchment
      g.fillStyle(0xfef3c7, 0.9);
      g.fillRect(5, 7, 10, 8);

      // Open grimoire / spellbook
      g.fillStyle(0x1e3a8a, 1); // Blue tome
      g.fillRect(6, 18, 9, 7);
      g.fillStyle(0xffffff, 0.8);
      g.lineBetween(10, 18, 10, 24);

      // Glowing alchemy flask (Cyan)
      g.fillStyle(0x06b6d4, 0.95);
      g.fillCircle(tileSize - 8, 12, 4);
      g.fillStyle(0xa5f3fc, 1);
      g.fillCircle(tileSize - 9, 10, 1.5); // highlight
      // Flask neck & cork
      g.fillStyle(0x78350f, 1);
      g.fillRect(tileSize - 9, 6, 2, 3);

      g.generateTexture('buildable-research-station', tileSize, tileSize);
      g.destroy();
    }

    // 17. Guild Bed (Comfortable wooden bed frame, mattress, pillow & guild blanket)
    if (!scene.textures.exists('buildable-bed')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Outer wooden bed frame / headboard
      g.fillStyle(0x3e2723, 1); // Dark walnut wood
      g.fillRect(3, 2, tileSize - 6, tileSize - 4);
      g.lineStyle(1, 0x1b110e, 1);
      g.strokeRect(3, 2, tileSize - 6, tileSize - 4);

      // Headboard plank
      g.fillStyle(0x5c4033, 1);
      g.fillRect(3, 2, tileSize - 6, 5);

      // Mattress / base sheet (Crisp linen cream)
      g.fillStyle(0xf8fafc, 1);
      g.fillRect(5, 7, tileSize - 10, tileSize - 11);

      // Fluffy pillow
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(6, 8, tileSize - 12, 6, 2);
      g.lineStyle(1, 0xe2e8f0, 1);
      g.strokeRoundedRect(6, 8, tileSize - 12, 6, 2);

      // Guild blanket / duvet (Rich royal blue with gold trim)
      g.fillStyle(0x1e3a8a, 1);
      g.fillRect(5, 15, tileSize - 10, tileSize - 19);
      // Gold trim on blanket fold
      g.fillStyle(0xf59e0b, 1);
      g.fillRect(5, 15, tileSize - 10, 2);

      g.generateTexture('buildable-bed', tileSize, tileSize);
      g.destroy();
    }

    // 17b. Alchemy Station (Oak bench with brass alembic, emerald vials & mortar)
    if (!scene.textures.exists('buildable-alchemy-station')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Oak workbench
      g.fillStyle(0x451a03, 1);
      g.fillRect(2, 4, tileSize - 4, tileSize - 8);
      g.lineStyle(1, 0x9a3412, 1);
      g.strokeRect(2, 4, tileSize - 4, tileSize - 8);

      // Stone slab work area
      g.fillStyle(0x64748b, 0.9);
      g.fillRect(5, 7, 12, 10);

      // Mortar and pestle (Grey stone with wooden pestle)
      g.fillStyle(0x334155, 1);
      g.fillCircle(10, 20, 4);
      g.fillStyle(0xd97706, 1);
      g.fillRect(11, 16, 2, 6);

      // Brass retort / alembic coil
      g.fillStyle(0xd97706, 1);
      g.fillCircle(tileSize - 9, 10, 4);
      g.fillStyle(0xb45309, 1);
      g.fillRect(tileSize - 11, 6, 4, 3);

      // Bubbling emerald potion flask
      g.fillStyle(0x10b981, 0.95);
      g.fillCircle(tileSize - 9, 21, 4.5);
      g.fillStyle(0x6ee7b7, 1);
      g.fillCircle(tileSize - 10, 19, 1.5);
      // Flask neck & cork
      g.fillStyle(0x78350f, 1);
      g.fillRect(tileSize - 10, 14, 2, 3);

      g.generateTexture('buildable-alchemy-station', tileSize, tileSize);
      g.destroy();
    }

    // 18. Valid Tile Placement Highlight (Soft Green/White frame)
    if (!scene.textures.exists('tile-highlight-valid')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x22c55e, 0.25);
      g.fillRect(0, 0, tileSize, tileSize);
      g.lineStyle(2, 0x86efac, 0.9);
      g.strokeRect(1, 1, tileSize - 2, tileSize - 2);
      g.generateTexture('tile-highlight-valid', tileSize, tileSize);
      g.destroy();
    }

    // 18. Invalid Tile Placement Highlight (Soft Red frame)
    if (!scene.textures.exists('tile-highlight-invalid')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xef4444, 0.3);
      g.fillRect(0, 0, tileSize, tileSize);
      g.lineStyle(2, 0xfca5a5, 0.9);
      g.strokeRect(1, 1, tileSize - 2, tileSize - 2);
      g.lineBetween(4, 4, tileSize - 4, tileSize - 4);
      g.lineBetween(tileSize - 4, 4, 4, tileSize - 4);
      g.generateTexture('tile-highlight-invalid', tileSize, tileSize);
      g.destroy();
    }

    // 19. Buildable Cooking Station (Hearth, pot, firewood)
    if (!scene.textures.exists('buildable-cooking-station')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Stone hearth table/base
      g.fillStyle(0x374151, 1);
      g.fillRoundedRect(3, 3, tileSize - 6, tileSize - 6, 4);
      g.lineStyle(1.5, 0x1f2937, 1);
      g.strokeRoundedRect(3, 3, tileSize - 6, tileSize - 6, 4);

      // Firebox opening with glowing hearth flames
      g.fillStyle(0x111827, 1);
      g.fillRoundedRect(7, 13, 18, 12, 2);
      g.fillStyle(0xd97706, 0.9); // Warm orange
      g.fillCircle(16, 21, 5);
      g.fillStyle(0xfbbf24, 0.95); // Bright gold flame
      g.fillCircle(16, 20, 3);
      g.fillStyle(0xffedd5, 1); // Flame core
      g.fillCircle(16, 19, 1.5);

      // Firewood logs underneath
      g.fillStyle(0x78350f, 1);
      g.fillRect(8, 23, 16, 2);

      // Cast iron cooking pot on top
      g.fillStyle(0x1f2937, 1);
      g.fillRoundedRect(9, 6, 14, 7, 2);
      // Pot rim and handles
      g.fillStyle(0x111827, 1);
      g.fillRect(7, 7, 2, 2);
      g.fillRect(23, 7, 2, 2);
      // Stew inside pot
      g.fillStyle(0xb45309, 1);
      g.fillEllipse(16, 7, 5, 2);
      // Wooden spoon handle sticking out
      g.lineStyle(1.5, 0xd97706, 1);
      g.lineBetween(18, 7, 22, 3);

      g.generateTexture('buildable-cooking-station', tileSize, tileSize);
      g.destroy();
    }

    // 20. Foraging Bush (Lush with wild herbs and berries)
    if (!scene.textures.exists('foraging-bush')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Base dark green shadow foliage
      g.fillStyle(0x14532d, 0.9);
      g.fillCircle(tileSize / 2, tileSize / 2 + 2, 12);

      // Mid vibrant leafy lobes
      g.fillStyle(0x15803d, 1);
      g.fillCircle(tileSize / 2 - 5, tileSize / 2 - 2, 7);
      g.fillCircle(tileSize / 2 + 5, tileSize / 2 - 2, 7);
      g.fillCircle(tileSize / 2, tileSize / 2 - 6, 8);
      g.fillCircle(tileSize / 2 - 6, tileSize / 2 + 3, 6);
      g.fillCircle(tileSize / 2 + 6, tileSize / 2 + 3, 6);

      // Top highlighted green foliage
      g.fillStyle(0x22c55e, 1);
      g.fillCircle(tileSize / 2 - 2, tileSize / 2 - 4, 5);
      g.fillCircle(tileSize / 2 + 3, tileSize / 2 - 1, 4.5);
      g.fillCircle(tileSize / 2 - 3, tileSize / 2 + 2, 4);

      // Bright wild herb leaves (cyan-tinted mint green)
      g.fillStyle(0x6ee7b7, 1);
      g.fillCircle(12, 10, 2);
      g.fillCircle(20, 11, 2);
      g.fillCircle(15, 17, 2);

      // Small wild berries (bright ruby/gold)
      g.fillStyle(0xf43f5e, 1);
      g.fillCircle(10, 15, 1.5);
      g.fillCircle(22, 16, 1.5);
      g.fillCircle(17, 8, 1.5);
      g.fillStyle(0xfbbf24, 1);
      g.fillCircle(14, 21, 1.5);

      g.generateTexture('foraging-bush', tileSize, tileSize);
      g.destroy();
    }

    // 21. Foraging Bush Depleted (Harvested / leaves stripped)
    if (!scene.textures.exists('foraging-bush-depleted')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Sparsely leafy base in muted sage
      g.fillStyle(0x374151, 0.5);
      g.fillCircle(tileSize / 2, tileSize / 2 + 3, 9);

      g.fillStyle(0x365314, 0.85); // Muted olive green
      g.fillCircle(tileSize / 2 - 3, tileSize / 2 + 1, 6);
      g.fillCircle(tileSize / 2 + 3, tileSize / 2 + 1, 6);
      g.fillCircle(tileSize / 2, tileSize / 2 - 2, 5);

      // Bare twigs/stems
      g.lineStyle(1.5, 0x78350f, 0.9);
      g.lineBetween(16, 24, 16, 12);
      g.lineBetween(16, 18, 10, 14);
      g.lineBetween(16, 16, 22, 12);

      g.generateTexture('foraging-bush-depleted', tileSize, tileSize);
      g.destroy();
    }

    // 22. Woodcutting Tree (Lush tree with timber trunk)
    if (!scene.textures.exists('woodcutting-tree')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Ground shadow
      g.fillStyle(0x14532d, 0.5);
      g.fillEllipse(tileSize / 2, tileSize - 4, 14, 6);

      // Tree trunk
      g.fillStyle(0x78350f, 1);
      g.fillRect(tileSize / 2 - 3, 16, 6, 13);
      g.lineStyle(1, 0x451a03, 0.7);
      g.lineBetween(tileSize / 2, 17, tileSize / 2, 28);

      // Deep canopy shadow
      g.fillStyle(0x166534, 0.95);
      g.fillCircle(tileSize / 2, 12, 11);

      // Mid vibrant canopy layers
      g.fillStyle(0x15803d, 1);
      g.fillCircle(tileSize / 2 - 5, 13, 7);
      g.fillCircle(tileSize / 2 + 5, 13, 7);
      g.fillCircle(tileSize / 2, 7, 8);

      // Top sun-kissed foliage highlights
      g.fillStyle(0x22c55e, 1);
      g.fillCircle(tileSize / 2 - 3, 6, 4.5);
      g.fillCircle(tileSize / 2 + 3, 7, 4);
      g.fillCircle(tileSize / 2, 11, 4);

      g.generateTexture('woodcutting-tree', tileSize, tileSize);
      g.destroy();
    }

    // 23. Woodcutting Tree Depleted (Harvested timber stump)
    if (!scene.textures.exists('woodcutting-tree-depleted')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Ground shadow
      g.fillStyle(0x1f2937, 0.5);
      g.fillEllipse(tileSize / 2, tileSize - 5, 13, 5);

      // Stump base
      g.fillStyle(0x78350f, 1);
      g.fillRect(tileSize / 2 - 4, 19, 8, 8);
      g.lineStyle(1, 0x451a03, 0.8);
      g.lineBetween(tileSize / 2 - 1, 20, tileSize / 2 - 1, 26);

      // Cut top face showing wood rings
      g.fillStyle(0xd97706, 1);
      g.fillEllipse(tileSize / 2, 19, 7.5, 3.5);
      g.lineStyle(1, 0x92400e, 0.9);
      g.strokeEllipse(tileSize / 2, 19, 4.5, 2);

      // Scattered woodchips
      g.fillStyle(0xf59e0b, 0.9);
      g.fillCircle(tileSize / 2 - 7, 24, 1);
      g.fillCircle(tileSize / 2 + 6, 25, 1.2);
      g.fillCircle(tileSize / 2 + 8, 22, 1);

      g.generateTexture('woodcutting-tree-depleted', tileSize, tileSize);
      g.destroy();
    }

    // 24. Mining Rock (Ore vein boulder with visible mineral glints)
    if (!scene.textures.exists('mining-rock')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Base shadow
      g.fillStyle(0x0f172a, 0.6);
      g.fillEllipse(tileSize / 2, tileSize - 4, 14, 6);

      // Rugged stone base
      g.fillStyle(0x475569, 1);
      g.fillCircle(tileSize / 2, tileSize / 2 + 3, 10);
      g.fillCircle(tileSize / 2 - 4, tileSize / 2 + 1, 7);
      g.fillCircle(tileSize / 2 + 4, tileSize / 2 + 2, 8);

      // Highlighted stone facets
      g.fillStyle(0x64748b, 1);
      g.fillCircle(tileSize / 2 - 2, tileSize / 2 - 2, 6);
      g.fillCircle(tileSize / 2 + 3, tileSize / 2 - 1, 5);

      // Embedded raw ore veins (golden amber & iron/silver glints)
      g.fillStyle(0xf59e0b, 1);
      g.fillCircle(tileSize / 2 - 3, tileSize / 2 + 1, 2);
      g.fillCircle(tileSize / 2 + 4, tileSize / 2, 1.8);
      g.fillStyle(0xfbbf24, 1);
      g.fillCircle(tileSize / 2 + 1, tileSize / 2 + 4, 1.5);
      g.fillCircle(tileSize / 2 - 4, tileSize / 2 - 3, 1.5);

      // Metallic sparkle glint
      g.fillStyle(0x38bdf8, 1);
      g.fillCircle(tileSize / 2 + 2, tileSize / 2 - 3, 1.5);

      g.generateTexture('mining-rock', tileSize, tileSize);
      g.destroy();
    }

    // 25. Mining Rock Depleted (Mined rubble & cracked stone fragments)
    if (!scene.textures.exists('mining-rock-depleted')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Ground shadow
      g.fillStyle(0x1e293b, 0.4);
      g.fillEllipse(tileSize / 2, tileSize - 4, 11, 4);

      // Chipped small rubble stones
      g.fillStyle(0x334155, 0.9);
      g.fillCircle(tileSize / 2 - 4, tileSize / 2 + 5, 4);
      g.fillCircle(tileSize / 2 + 3, tileSize / 2 + 6, 3.5);
      g.fillCircle(tileSize / 2, tileSize / 2 + 7, 2.5);

      g.fillStyle(0x475569, 0.85);
      g.fillCircle(tileSize / 2 - 2, tileSize / 2 + 4, 2);
      g.fillCircle(tileSize / 2 + 5, tileSize / 2 + 5, 1.5);

      g.generateTexture('mining-rock-depleted', tileSize, tileSize);
      g.destroy();
    }
  }
}

