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
    totalSteps: 13,
    title: 'Guild Roster',
    objective: 'Summon recruit Kaelen from Guild HQ',
    instruction: 'Select a starting weapon kit for Kaelen and confirm to expand your starting party to 3.',
    valerieQuote: 'Welcome to the Outpost! Exploring the dungeon as a pair is reckless. Summon our third recruit from HQ before we step through!',
    location: 'outpost'
  },
  {
    id: 'movement',
    stepNumber: 2,
    totalSteps: 13,
    title: 'Movement & Formation',
    objective: 'Left-Click ground to move party',
    instruction: 'Left-click anywhere to move. Notice our rigid 2×2 block formation! Pan camera with WASD/mouse drag; zoom with scroll wheel.',
    valerieQuote: 'Kaelen has joined us. Notice our tight 2×2 block formation! Move by clicking anywhere on the ground. Pan camera with WASD and zoom with the scroll wheel.',
    location: 'outpost'
  },
  {
    id: 'first_expedition',
    stepNumber: 3,
    totalSteps: 13,
    title: 'First Expedition',
    objective: 'Enter the Dungeon Portal',
    instruction: 'Walk onto the glowing portal crystal in the center of the Outpost to plunge into Dungeon Floor 1.',
    valerieQuote: 'Our trio is ready and in formation. Step into the portal to begin our expedition into Dungeon Floor 1!',
    location: 'outpost'
  },
  {
    id: 'basic_combat',
    stepNumber: 4,
    totalSteps: 13,
    title: 'Basic Combat & Autocast',
    objective: 'Left-Click an enemy to engage & defeat it',
    instruction: 'Left-click an enemy to attack. Skills autocast on cooldown. (Tip: Downed allies carry no penalty — standard difficulty wipes safely return home with all loot).',
    valerieQuote: 'Enemy in sight! Left-click to engage. Skills autocast automatically on cooldown. If someone drops to 0 Critical HP, they enter Downed state — party wipes carry zero penalty and return us safely home.',
    location: 'dungeon'
  },
  {
    id: 'safe_gathering',
    stepNumber: 5,
    totalSteps: 13,
    title: 'Safe Gathering',
    objective: 'Left-Click an Ore vein or Tree to channel and harvest',
    instruction: 'Approach a resource node and left-click to harvest. Taking damage interrupts channeling, but genuinely cleared rooms are completely safe.',
    valerieQuote: 'Room clear! Genuinely cleared rooms are completely safe from ambushes. Approach a resource node and left-click to channel. Taking damage interrupts the harvest, but here we are safe.',
    location: 'dungeon'
  },
  {
    id: 'return_outpost',
    stepNumber: 6,
    totalSteps: 13,
    title: 'Return to Outpost',
    objective: 'Return to base with gathered Ore and Research Points',
    instruction: 'Interact with the Teleporter Crystal to return to the Outpost with your materials and RP (or use an Escape Stone [T], once you can craft one).',
    valerieQuote: 'Great harvest! Monster kills and discoveries earn Research Points (RP), while nodes yield crafting materials. When you are ready, interact with the Teleporter Crystal to return to base — or an Escape Stone, once you can craft one.',
    location: 'any'
  },
  {
    id: 'research_station',
    stepNumber: 7,
    totalSteps: 13,
    title: 'Outpost Loop: Research',
    objective: 'Unlock the Blacksmithing Station in Research Tree',
    instruction: 'Open the Research Tree (click "Research Tree" in Outpost controls or click the Research Station) and unlock Blacksmithing Station for 5 RP.',
    valerieQuote: 'Now for the core Outpost loop: earn RP → research blueprints → build stations → forge gear! Open Research and unlock the Blacksmithing Station blueprint with your earned RP.',
    location: 'outpost'
  },
  {
    id: 'construct_station',
    stepNumber: 8,
    totalSteps: 13,
    title: 'Outpost Loop: Build Mode',
    objective: 'Press [B] and place the Blacksmithing Station',
    instruction: 'Press [B] or click "Build Mode", select the Blacksmithing Station from the palette, and click a valid floor tile to build it with Wood.',
    valerieQuote: 'Blueprint unlocked! Press [B] to enter Build Mode, select your new Blacksmithing Station, and place it in the Outpost using your gathered Wood.',
    location: 'outpost'
  },
  {
    id: 'forge_upgrade',
    stepNumber: 9,
    totalSteps: 13,
    title: 'Outpost Loop: Forge Upgrade',
    objective: 'Interact with Blacksmithing Station & forge an upgrade',
    instruction: 'Exit Build Mode [B], click your Blacksmithing Station, and forge an upgrade (like Iron Shortsword or Shield) using gathered Ore.',
    valerieQuote: 'Station built! Walk over, click your Blacksmithing Station to open the forge, and craft your first equipment upgrade using your gathered Ore!',
    location: 'outpost'
  },
  {
    id: 'alchemy_station',
    stepNumber: 10,
    totalSteps: 13,
    title: 'Outpost Loop: Alchemy Station',
    objective: 'Research Alchemy Station (5 RP) ☐ / Place it in the Outpost ☐',
    instruction: 'Unlock the Alchemy Station in the Research Tree for 5 RP, then enter Build Mode [B] and place it in an enclosed room.',
    valerieQuote: 'Potions and restoratives are essential for deep expeditions. Unlock the Alchemy Station blueprint in Research and construct it in our Outpost.',
    location: 'outpost'
  },
  {
    id: 'alchemy_crafting',
    stepNumber: 11,
    totalSteps: 13,
    title: 'Alchemy: Brewing Potions',
    objective: 'Health Potion ☐ / Mana Potion ☐ / Revive Potion ☐',
    instruction: 'Open the Alchemy Station to brew 1 Health Potion, 1 Mana Potion, and 1 Revive Potion (craft Bone Meal first).',
    valerieQuote: 'The guild sent a supply crate to top up our missing reagents. Brew our first restorative drafts: Health, Mana, and Revive Potions!',
    location: 'outpost'
  },
  {
    id: 'knowledge_base',
    stepNumber: 12,
    totalSteps: 13,
    title: 'Codex & Knowledge Base',
    objective: 'Press [K] to consult the Guild Knowledge Base',
    instruction: 'You have mastered the core game loop! For deep references on all classes, weapons, proficiencies, recipes, and bestiary records, open the Knowledge Base with [K].',
    valerieQuote: 'Outstanding work! You have mastered the entire loop: fight, gather, research, build, and brew. For everything deeper, consult the Guild Knowledge Base anytime with [K].',
    location: 'any'
  },
  {
    id: 'summon_fourth_member',
    stepNumber: 13,
    totalSteps: 13,
    title: 'Guild Roster: Final Member',
    objective: 'Summon your fourth party member from Guild HQ',
    instruction: 'Open Party Overview [O] and click "+ Summon Recruit" to summon our fourth party member equipped with a Healing Staff.',
    valerieQuote: 'Our outpost is fully equipped and our supplies are stocked. Summon our fourth recruit from HQ to complete our full expedition party!',
    location: 'outpost'
  }
];

export class TutorialSystem {
  private static instance: TutorialSystem;

  private currentStepIndex: number = 0;
  private isCompleted: boolean = false;
  private isDismissed: boolean = false;
  private isMinimized: boolean = false;
  private craftedPotions: Set<string> = new Set();
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
    const stepDef = TUTORIAL_STEPS[this.currentStepIndex];
    if (!stepDef) return null;

    if (stepDef.id === 'alchemy_station') {
      const gs = GameState.getInstance();
      const isResearched = gs.isBuildableUnlocked('alchemy_station') || gs.isResearchCompleted('research_alchemy_station');
      const isPlaced = gs.hasPlacedBuildable('alchemy_station');
      const rp = gs.getResearchPoints();
      const hint = (!isResearched && rp < 5) ? ' Earn more Research Points in the dungeon.' : '';
      return {
        ...stepDef,
        objective: `Research Alchemy Station (5 RP) ${isResearched ? '✓' : '☐'} / Place it in the Outpost ${isPlaced ? '✓' : '☐'}`,
        instruction: stepDef.instruction + (hint ? ` (Tip: ${hint})` : '')
      };
    }

    if (stepDef.id === 'alchemy_crafting') {
      const hasHealth = this.craftedPotions.has('health_potion');
      const hasMana = this.craftedPotions.has('mana_potion');
      const hasRevive = this.craftedPotions.has('revive_potion');
      return {
        ...stepDef,
        objective: `Health Potion ${hasHealth ? '✓' : '☐'} / Mana Potion ${hasMana ? '✓' : '☐'} / Revive Potion ${hasRevive ? '✓' : '☐'}`
      };
    }

    return stepDef;
  }

  public getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  public getIsCompleted(): boolean {
    return this.isCompleted;
  }

  public isTutorialCompleted(): boolean {
    return this.isCompleted;
  }

  public getIsDismissed(): boolean {
    return this.isDismissed;
  }

  public isTutorialDismissed(): boolean {
    return this.isDismissed;
  }

  public getIsMinimized(): boolean {
    return this.isMinimized;
  }

  public getCraftedPotions(): string[] {
    return Array.from(this.craftedPotions);
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

  public notifyResearchUnlocked(nodeId: string): void {
    if (nodeId === 'research_alchemy_station' || nodeId === 'alchemy_station') {
      this.checkAlchemyStationProgress();
    }
  }

  public notifyBuildablePlaced(buildableId: string): void {
    if (buildableId === 'alchemy_station') {
      this.checkAlchemyStationProgress();
    }
  }

  public checkAlchemyStationProgress(): void {
    const current = this.getCurrentStep();
    if (current && current.id === 'alchemy_station') {
      const gs = GameState.getInstance();
      const isResearched = gs.isBuildableUnlocked('alchemy_station') || gs.isResearchCompleted('research_alchemy_station');
      const isPlaced = gs.hasPlacedBuildable('alchemy_station');
      this.notifyStepChange();
      if (isResearched && isPlaced) {
        this.advanceStep();
      }
    }
  }

  public onItemCrafted(itemId: string, _count: number = 1, _crafter?: any): void {
    const current = this.getCurrentStep();
    if (current && current.id === 'alchemy_crafting') {
      if (['health_potion', 'mana_potion', 'revive_potion'].includes(itemId)) {
        this.craftedPotions.add(itemId);
        this.notifyStepChange();
        if (
          this.craftedPotions.has('health_potion') &&
          this.craftedPotions.has('mana_potion') &&
          this.craftedPotions.has('revive_potion')
        ) {
          this.advanceStep();
        }
      }
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
      const nextStep = TUTORIAL_STEPS[this.currentStepIndex];
      console.log(`[TutorialSystem] 🧭 Advanced to step ${this.currentStepIndex + 1}/${TUTORIAL_STEPS.length}: ${nextStep.title}`);

      // Check Guild Supply Crate trigger upon entering alchemy_crafting
      if (nextStep.id === 'alchemy_crafting') {
        const crateRes = GameState.getInstance().checkAndGrantTutorialSupplyCrate();
        if (crateRes.granted) {
          const hud = (globalThis as any).window?.activeHUD || (globalThis as any).activeHUD;
          hud?.showToast('📦 Guild Supply Crate received! Missing alchemy reagents delivered to Outpost stockpile.', 'success', 6000);
        }
      }

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
    this.craftedPotions.clear();
    console.log('[TutorialSystem] 🧭 Tutorial reset to default beginning (Step 1: Guild Roster).');
    this.notifyStepChange();
    this.syncToGameState();
  }

  public syncToGameState(): void {
    const gs = GameState.getInstance();
    gs.setTutorialState({
      step: this.currentStepIndex,
      stepId: this.getCurrentStep()?.id,
      completed: this.isCompleted,
      dismissed: this.isDismissed
    });
  }

  public loadFromState(
    stepOrObj?: number | { currentStepIndex?: number; step?: number; isCompleted?: boolean; completed?: boolean; isDismissed?: boolean; dismissed?: boolean; tutorialStepId?: string; stepId?: string },
    completed?: boolean,
    dismissed?: boolean,
    stepId?: string
  ): void {
    const actualStep = typeof stepOrObj === 'number' ? stepOrObj : (stepOrObj?.currentStepIndex ?? stepOrObj?.step);
    const actualCompleted = typeof stepOrObj === 'object' && stepOrObj !== null ? (stepOrObj.isCompleted ?? stepOrObj.completed ?? completed) : completed;
    const actualDismissed = typeof stepOrObj === 'object' && stepOrObj !== null ? (stepOrObj.isDismissed ?? stepOrObj.dismissed ?? dismissed) : dismissed;
    const actualStepId = typeof stepOrObj === 'object' && stepOrObj !== null ? (stepOrObj.tutorialStepId ?? stepOrObj.stepId ?? stepId) : stepId;

    this.isCompleted = !!actualCompleted;
    this.isDismissed = !!actualDismissed;

    if (actualStepId) {
      const idx = TUTORIAL_STEPS.findIndex(s => s.id === actualStepId);
      if (idx !== -1) {
        this.currentStepIndex = idx;
        if (this.getCurrentStep()?.id === 'alchemy_crafting') {
          const crateRes = GameState.getInstance().checkAndGrantTutorialSupplyCrate();
          if (crateRes.granted) {
            const hud = (globalThis as any).window?.activeHUD || (globalThis as any).activeHUD;
            hud?.showToast('📦 Guild Supply Crate received! Missing alchemy reagents delivered to Outpost stockpile.', 'success', 6000);
          }
        }
        this.notifyStepChange();
        return;
      }
    }

    if (typeof actualStep === 'number') {
      if (actualStep < 9) {
        // Steps 0..8 map to the same IDs: guild_roster .. forge_upgrade
        this.currentStepIndex = Math.max(0, Math.min(actualStep, TUTORIAL_STEPS.length - 1));
      } else if (actualStep === 9) {
        // Old step 9 was 'knowledge_base', which is now step index 11 (Step 12)
        const kbIdx = TUTORIAL_STEPS.findIndex(s => s.id === 'knowledge_base');
        this.currentStepIndex = kbIdx !== -1 ? kbIdx : 11;
      } else {
        this.currentStepIndex = Math.max(0, Math.min(actualStep, TUTORIAL_STEPS.length - 1));
      }
    } else {
      this.currentStepIndex = 0;
    }

    if (this.getCurrentStep()?.id === 'alchemy_crafting') {
      const crateRes = GameState.getInstance().checkAndGrantTutorialSupplyCrate();
      if (crateRes.granted) {
        const hud = (globalThis as any).window?.activeHUD || (globalThis as any).activeHUD;
        hud?.showToast('📦 Guild Supply Crate received! Missing alchemy reagents delivered to Outpost stockpile.', 'success', 6000);
      }
    }

    this.notifyStepChange();
  }
}
