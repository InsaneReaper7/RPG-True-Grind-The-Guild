import Phaser from 'phaser';
import { DataLoader } from './utils/DataLoader';
import { MainScene } from './scenes/MainScene';

async function bootstrap() {
  // Load JSON schemas first
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#1f2937',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [MainScene]
  };

  new Phaser.Game(config);
}

bootstrap().catch((err) => {
  console.error('Failed to initialize game:', err);
});
