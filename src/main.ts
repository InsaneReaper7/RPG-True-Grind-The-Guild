import Phaser from 'phaser';
import { DataLoader } from './utils/DataLoader';
import { GameState } from './systems/GameState';
import { MainScene } from './scenes/MainScene';
import { OutpostScene } from './scenes/OutpostScene';

async function bootstrap() {
  // Load JSON schemas first
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // Initialize persistent GameState from player.json boot seed once
  GameState.getInstance().initFromPlayerData(dataLoader.getPlayer());

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
    scene: [OutpostScene, MainScene]
  };

  const game = new Phaser.Game(config);
  (window as any).game = game;

  window.addEventListener('resize', () => {
    game.scale.refresh();
  });
}

bootstrap().catch((err) => {
  console.error('Failed to initialize game:', err);
});
