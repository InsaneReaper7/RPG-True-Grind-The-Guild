import { GameState } from './GameState.ts';

export interface TutorialStepDef {
  id: string;
  stepNumber: number; // 1-indexed for display
  totalSteps: number;
  title: string;
  objective: string;
  instruction: string;
  valerieQuote: string;
  location: 'outpost' | 'dungeon' | 'any';
}

export const TUTORIAL_STEPS: TutorialStepDef[] = [
  {
    id: 'guild_roster',
    stepNumber: 1,
    totalSteps: 10,
    title: 'Guild Roster',
    objective: 'Summon recruit Kaelen from Guild HQ',
    instruction: 'Select a starting weapon kit for Kaelen and confirm to expand your starting party to 3.',
    valerieQuote: 'Welcome to the Outpost! Exploring the dungeon as a pair is reckless. Summon our third recruit from HQ before we step through!',
    location: 'outpost'
  },
  {
    id: 'movement',
    stepNumber: 2,
    totalSteps: 10,
    title: 'Movement & Formation',
    objective: 'Left-Click ground to move party',
    instruction: 'Left-click anywhere to move. Notice our rigid 2×2 block formation! Pan camera with WASD/mouse drag; zoom with scroll wheel.',
    valerieQuote: 'Kaelen has joined us. Notice our tight 2×2 block formation! Move by clicking anywhere on the ground. Pan camera with WASD and zoom with the scroll wheel.',
    location: 'outpost'
  },
  {
    id: 'first_expedition',
    stepNumber: 3,
    totalSteps: 10,
    title: 'First Expedition',
    objective: 'Enter the Dungeon Portal',
    instruction: 'Walk onto the glowing portal crystal in the center of the Outpost to plunge into Dungeon Floor 1.',
    valerieQuote: 'Our trio is ready and in formation. Step into the portal to begin our expedition into Dungeon Floor 1!',
    location: 'outpost'
  },
  {
    id: 'basic_combat',
    stepNumber: 4,
    totalSteps: 10,
    title: 'Basic Combat & Autocast',
    objective: 'Left-Click an enemy to engage & defeat it',
    instruction: 'Left-click an enemy to attack. Skills autocast on cooldown. (Tip: Downed allies carry no penalty — standard difficulty wipes safely return home with all loot).',
    valerieQuote: 'Enemy in sight! Left-click to engage. Skills autocast automatically on cooldown. If someone drops to 0 Critical HP, they enter Downed state — party wipes carry zero penalty and return us safely home.',
    location: 'dungeon'
  },
  {
    id: 'safe_gathering',
    stepNumber: 5,
    totalSteps: 10,
    title: 'Safe Gathering',
    objective: 'Left-Click an Ore vein or Tree to channel and harvest',
    instruction: 'Approach a resource node and left-click to harvest. Taking damage interrupts channeling, but genuinely cleared rooms are completely safe.',
    valerieQuote: 'Room clear! Genuinely cleared rooms are completely safe from ambushes. Approach a resource node and left-click to channel. Taking damage interrupts the harvest, but here we are safe.',
    location: 'dungeon'
  },
  {
    id: 'return_outpost',
    stepNumber: 6,
    totalSteps: 10,
    title: 'Return to Outpost',
    objective: 'Return to base with gathered Ore and Research Points',
    instruction: 'Use the dungeon portal, teleporter crystal, or Escape Stone [T] to return to the Outpost with your materials and RP.',
    valerieQuote: 'Great harvest! Monster kills and discoveries earn Research Points (RP), while nodes yield crafting materials. When you are ready, use the portal or Escape Stone [T] to return to base.',
    location: 'any'
  },
  {
    id: 'research_station',
    stepNumber: 7,
    totalSteps: 10,
    title: 'Outpost Loop: Research',
    objective: 'Unlock the Blacksmithing Station in Research Tree',
    instruction: 'Open the Research Tree (click "Research Tree" in Outpost controls or click the Research Station) and unlock Blacksmithing Station for 10 RP.',
    valerieQuote: 'Now for the core Outpost loop: earn RP → research blueprints → build stations → forge gear! Open Research and unlock the Blacksmithing Station blueprint with your earned RP.',
    location: 'outpost'
  },
  {
    id: 'construct_station',
    stepNumber: 8,
    totalSteps: 10,
    title: 'Outpost Loop: Build Mode',
    objective: 'Press [B] and place the Blacksmithing Station',
    instruction: 'Press [B] or click "Build Mode", select the Blacksmithing Station from the palette, and click a valid floor tile to build it with Wood.',
    valerieQuote: 'Blueprint unlocked! Press [B] to enter Build Mode, select your new Blacksmithing Station, and place it in the Outpost using your gathered Wood.',
    location: 'outpost'
  },
  {
    id: 'forge_upgrade',
    stepNumber: 9,
    totalSteps: 10,
    title: 'Outpost Loop: Forge Upgrade',
    objective: 'Interact with Blacksmithing Station & forge an upgrade',
    instruction: 'Exit Build Mode [B], click your Blacksmithing Station, and forge an upgrade (like Iron Shortsword or Shield) using gathered Ore.',
    valerieQuote: 'Station built! Walk over, click your Blacksmithing Station to open the forge, and craft your first equipment upgrade using your gathered Ore!',
    location: 'outpost'
  },
  {
    id: 'knowledge_base',
    stepNumber: 10,
    totalSteps: 10,
    title: 'Codex & Beyond',
    objective: 'Press [K] to consult the Guild Knowledge Base',
    instruction: 'You have mastered the core game loop! For deep references on all 130+ classes, weapons, hidden skills, recipes, and bestiary records, open the Knowledge Base with [K].',
    valerieQuote: 'Outstanding work! You have mastered the entire loop: fight, gather, research, build, and forge. For everything deeper — classes, proficiencies, hidden arts — consult the Guild Knowledge Base anytime with [K].',
    location: 'any'
  }
];

export class TutorialSystem {
  private static instance: TutorialSystem;

  private currentStepIndex: number = 0;
  private isCompleted: boolean = false;
  private isDismissed: boolean = false;
  private isMinimized: boolean = false;
  private stepChangeListeners: Array<(step: TutorialStepDef | null) => void> = [];

  private constructor() {}

  public static getInstance(): TutorialSystem {
    if (!TutorialSystem.instance) {
      TutorialSystem.instance = new TutorialSystem();
    }
    return TutorialSystem.instance;
  }

  public getCurrentStep(): TutorialStepDef | null {
    if (this.isCompleted) return null;
    return TUTORIAL_STEPS[this.currentStepIndex] || null;
  }

  public getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  public getIsCompleted(): boolean {
    return this.isCompleted;
  }

  public getIsDismissed(): boolean {
    return this.isDismissed;
  }

  public getIsMinimized(): boolean {
    return this.isMinimized;
  }

  public onStepChange(listener: (step: TutorialStepDef | null) => void): () => void {
    this.stepChangeListeners.push(listener);
    return () => {
      this.stepChangeListeners = this.stepChangeListeners.filter(l => l !== listener);
    };
  }

  private notifyStepChange(): void {
    const step = this.getCurrentStep();
    for (const listener of this.stepChangeListeners) {
      listener(step);
    }
  }

  /**
   * Advances from current step to next step, if matching current or expected step.
   */
  public advanceStep(fromIndex?: number): boolean {
    if (this.isCompleted) return false;
    if (fromIndex !== undefined && fromIndex !== this.currentStepIndex) {
      return false;
    }

    if (this.currentStepIndex < TUTORIAL_STEPS.length - 1) {
      this.currentStepIndex++;
      console.log(`[TutorialSystem] 🧭 Advanced to step ${this.currentStepIndex + 1}/${TUTORIAL_STEPS.length}: ${TUTORIAL_STEPS[this.currentStepIndex].title}`);
      this.notifyStepChange();
      this.syncToGameState();
      return true;
    } else {
      this.completeTutorial();
      return true;
    }
  }

  /**
   * Advances if currently on the specified step ID.
   */
  public completeStepId(stepId: string): boolean {
    const current = this.getCurrentStep();
    if (current && current.id === stepId) {
      return this.advanceStep(this.currentStepIndex);
    }
    return false;
  }

  public completeTutorial(): void {
    if (this.isCompleted) return;
    this.isCompleted = true;
    console.log('[TutorialSystem] 🎓 Guild Onboarding & Tutorial COMPLETED! Full loop verified.');
    this.notifyStepChange();
    this.syncToGameState();
  }

  public dismiss(): void {
    this.isDismissed = true;
    console.log('[TutorialSystem] 🧭 Tutorial widget dismissed by player.');
    this.notifyStepChange();
    this.syncToGameState();
  }

  public undismiss(): void {
    this.isDismissed = false;
    this.notifyStepChange();
    this.syncToGameState();
  }

  public toggleMinimize(): boolean {
    this.isMinimized = !this.isMinimized;
    this.notifyStepChange();
    return this.isMinimized;
  }

  public setMinimized(val: boolean): void {
    this.isMinimized = val;
    this.notifyStepChange();
  }

  public reset(): void {
    this.currentStepIndex = 0;
    this.isCompleted = false;
    this.isDismissed = false;
    this.isMinimized = false;
    console.log('[TutorialSystem] 🧭 Tutorial reset to default beginning (Step 1: Guild Roster).');
    this.notifyStepChange();
    this.syncToGameState();
  }

  public syncToGameState(): void {
    const gs = GameState.getInstance();
    gs.setTutorialState({
      step: this.currentStepIndex,
      completed: this.isCompleted,
      dismissed: this.isDismissed
    });
  }

  public loadFromState(step?: number, completed?: boolean, dismissed?: boolean): void {
    this.currentStepIndex = typeof step === 'number' ? Math.max(0, Math.min(step, TUTORIAL_STEPS.length - 1)) : 0;
    this.isCompleted = !!completed;
    this.isDismissed = !!dismissed;
    this.notifyStepChange();
  }
}
