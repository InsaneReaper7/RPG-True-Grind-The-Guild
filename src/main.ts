import Phaser from 'phaser';
import { DataLoader } from './utils/DataLoader';
import { GameState } from './systems/GameState';
import { ResearchSystem } from './systems/ResearchSystem';
import { TutorialSystem } from './systems/TutorialSystem';
import { MainScene } from './scenes/MainScene';
import { OutpostScene } from './scenes/OutpostScene';
import { HUD } from './ui/HUD';

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
  (window as any).GameState = GameState;
  (window as any).DataLoader = DataLoader;
  (window as any).ResearchSystem = ResearchSystem;
  (window as any).TutorialSystem = TutorialSystem;

  // Window helpers for persistent saves
  (window as any).hasSavedGame = () => GameState.getInstance().hasSave();
  (window as any).continueGame = () => {
    if ((HUD as any).activeInstance) {
      (HUD as any).activeInstance.handleTitleContinue();
    } else {
      GameState.getInstance().loadFromDisk();
    }
  };
  (window as any).startNewGame = (confirmed: boolean = true) => {
    if ((HUD as any).activeInstance) {
      (HUD as any).activeInstance.handleTitleNewGame(confirmed);
    } else {
      GameState.getInstance().resetToDefault(dataLoader.getPlayer());
    }
  };
  (window as any).resetSave = () => {
    if ((HUD as any).activeInstance) {
      (HUD as any).activeInstance.handleResetSave();
    } else {
      GameState.getInstance().clearSave();
    }
  };

  window.addEventListener('resize', () => {
    game.scale.refresh();
  });
}

bootstrap().catch((err) => {
  console.error('Failed to initialize game:', err);
});
