import Phaser from 'phaser';
import { DataLoader } from './utils/DataLoader';
import { GameState } from './systems/GameState';
import { ResearchSystem } from './systems/ResearchSystem';
import { TutorialSystem } from './systems/TutorialSystem';
import { MainScene } from './scenes/MainScene';
import { OutpostScene } from './scenes/OutpostScene';
import { HUD } from './ui/HUD';
import { initKeyboardGuards } from './utils/inputGuard';
import { EventLog } from './systems/EventLog';
import { BugReportModal } from './ui/BugReportModal';

// Install error handlers early to capture any startup issues
EventLog.getInstance().installErrorHandlers();

// Intercept Phaser keyboard captures and hotkeys early before any scene boots
initKeyboardGuards(Phaser);

async function bootstrap() {
  // Load JSON schemas first
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // Initialize persistent GameState from player.json boot seed once
  GameState.getInstance().initFromPlayerData(dataLoader.getPlayer());

  // Log session startup
  let version = 'unknown';
  let buildDate = new Date().toISOString();
  try {
    if (typeof __APP_VERSION__ !== 'undefined') version = __APP_VERSION__;
    if (typeof __BUILD_DATE__ !== 'undefined') buildDate = __BUILD_DATE__;
  } catch {
    // fallback
  }
  EventLog.getInstance().add(
    'session',
    `Session started: version ${version}, hunger=${dataLoader.isHungerEnabled()}, mood=${dataLoader.isMoodEnabled()}`,
    { version, buildDate, hunger: dataLoader.isHungerEnabled(), mood: dataLoader.isMoodEnabled() }
  );

  // Initialize BugReportModal singleton
  BugReportModal.getInstance();

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
  (window as any).HUD = HUD;
  (window as any).GameState = GameState;
  (window as any).DataLoader = DataLoader;
  (window as any).ResearchSystem = ResearchSystem;
  (window as any).TutorialSystem = TutorialSystem;
  (window as any).EventLog = EventLog;
  (window as any).BugReportModal = BugReportModal;

  // Window helpers for persistent saves
  (window as any).hasSavedGame = () => GameState.getInstance().hasSave();
  (window as any).continueGame = () => {
    if ((HUD as any).activeInstance) {
      (HUD as any).activeInstance.handleTitleContinue();
    } else {
      GameState.getInstance().loadFromDisk();
    }
  };
  (window as any).startNewGame = (confirmed: boolean = true, kitId?: string, heroName?: string) => {
    if (kitId && heroName) {
      if ((HUD as any).activeInstance) {
        (HUD as any).activeInstance.startNewGameWithConfig(heroName, kitId);
      } else {
        GameState.getInstance().resetToDefault(dataLoader.getPlayer(), kitId, heroName);
      }
    } else if ((HUD as any).activeInstance) {
      (HUD as any).activeInstance.handleTitleNewGame(confirmed);
    } else {
      GameState.getInstance().resetToDefault(dataLoader.getPlayer(), kitId, heroName);
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
