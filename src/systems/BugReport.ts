import { GameState } from './GameState';
import { EventLog } from './EventLog';
import { Player } from '../entities/Player';
import { ProgressionSystem } from './ProgressionSystem';
import { BugReportBundle, BugReportCategory, CharacterSnapshot, PlayerSnapshot } from '../types/game';

export function generateReportId(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let rand = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 6; i++) {
      rand += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 6; i++) {
      rand += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return `TG-${rand}`;
}

/**
 * Builds a live snapshot strictly read-only WITHOUT mutating GameState.
 */
export function buildLiveSnapshot(
  party?: Player[],
  progression?: ProgressionSystem,
  sceneTime: number = 0
): PlayerSnapshot {
  const gs = GameState.getInstance();

  let partySnapshots: CharacterSnapshot[] = [];
  if (party && party.length > 0) {
    partySnapshots = party.map((p) => p.getSnapshot(sceneTime));
  } else {
    partySnapshots = gs.getPartySnapshots().map((s) => ({ ...s }));
  }

  const leader = party && party.length > 0 ? party[0] : null;
  const leaderSnap = partySnapshots[0] || null;

  let progData = progression
    ? progression.getSnapshotData()
    : (leader?.progression ? leader.progression.getSnapshotData() : null);

  if (!progData && leaderSnap) {
    progData = {
      proficiencies: { ...leaderSnap.proficiencies },
      classLevels: { ...leaderSnap.classLevels },
      unlockedClasses: [...leaderSnap.unlockedClasses],
      classStats: leaderSnap.classStats ? { ...leaderSnap.classStats } : {},
      activityCounts: {}
    };
  }

  const existingSnapshot = gs.getSnapshot();

  const snapshot: PlayerSnapshot = {
    hp: leader ? leader.hp : (leaderSnap?.hp ?? existingSnapshot?.hp ?? 50),
    criticalHp: leader ? leader.criticalHp : (leaderSnap?.criticalHp ?? existingSnapshot?.criticalHp ?? 25),
    energy: leader ? leader.energy : (leaderSnap?.energy ?? existingSnapshot?.energy ?? 100),
    knownSkillIds: leader ? [...leader.knownSkillIds] : (leaderSnap ? [...leaderSnap.knownSkillIds] : [...(existingSnapshot?.knownSkillIds ?? [])]),
    equippedSkillIds: leader ? [...leader.equippedSkillIds] : (leaderSnap ? [...leaderSnap.equippedSkillIds] : [...(existingSnapshot?.equippedSkillIds ?? [])]),
    autocastMap: leader
      ? Object.fromEntries(leader.autocastMap)
      : (leaderSnap ? { ...leaderSnap.autocastMap } : { ...(existingSnapshot?.autocastMap ?? {}) }),
    skillCooldownsRemainingMs: leaderSnap ? { ...leaderSnap.skillCooldownsRemainingMs } : { ...(existingSnapshot?.skillCooldownsRemainingMs ?? {}) },
    proficiencies: progData?.proficiencies ? { ...progData.proficiencies } : { ...(existingSnapshot?.proficiencies ?? {}) },
    classLevels: progData?.classLevels ? { ...progData.classLevels } : { ...(existingSnapshot?.classLevels ?? {}) },
    unlockedClasses: progData?.unlockedClasses ? [...progData.unlockedClasses] : [...(existingSnapshot?.unlockedClasses ?? [])],
    classStats: progData?.classStats ? { ...progData.classStats } : (existingSnapshot?.classStats ? { ...existingSnapshot.classStats } : undefined),
    activeClass: leader ? leader.activeClass : (leaderSnap?.activeClass ?? existingSnapshot?.activeClass ?? null),
    activityCounts: progData?.activityCounts ? { ...progData.activityCounts } : (existingSnapshot?.activityCounts ? { ...existingSnapshot.activityCounts } : undefined),
    resources: {
      wood: gs.getWood(),
      ore: gs.getOre()
    },
    placedBuildables: (gs as any).placedBuildables ? [...(gs as any).placedBuildables] : [...(existingSnapshot?.placedBuildables ?? [])],
    researchPoints: gs.getResearchPoints(),
    unlockedBuildables: Array.from((gs as any).unlockedBuildables ?? existingSnapshot?.unlockedBuildables ?? []),
    completedResearchIds: Array.from(gs.getCompletedResearch?.() ?? (gs as any).completedResearch ?? existingSnapshot?.completedResearchIds ?? []),
    inventory: Object.fromEntries((gs as any).inventory ?? new Map()),
    bookLearnedSkills: leader ? Array.from(leader.bookLearnedSkills) : (leaderSnap?.bookLearnedSkills ? [...leaderSnap.bookLearnedSkills] : [...(existingSnapshot?.bookLearnedSkills ?? [])]),
    hunger: leader ? leader.hunger : (leaderSnap?.hunger ?? existingSnapshot?.hunger ?? 100),
    mood: leader ? leader.mood : (leaderSnap?.mood ?? existingSnapshot?.mood ?? 80),
    currentGameDay: gs.getCurrentGameDay(),
    dayProgressMs: gs.getDayProgressMs(),
    foodItems: [...(gs as any).foodItems ?? existingSnapshot?.foodItems ?? []],
    equippedWeaponId: leader ? leader.equippedWeapon.id : (leaderSnap?.equippedWeaponId ?? existingSnapshot?.equippedWeaponId ?? 'fist'),
    offhandWeaponId: leader ? (leader.offhandWeapon?.id ?? null) : (leaderSnap?.offhandWeaponId ?? existingSnapshot?.offhandWeaponId ?? null),
    equippedHelmetId: leader ? (leader.equippedHelmet?.id ?? null) : (leaderSnap?.equippedHelmetId ?? existingSnapshot?.equippedHelmetId ?? null),
    equippedBodyArmorId: leader ? (leader.equippedBodyArmor?.id ?? null) : (leaderSnap?.equippedBodyArmorId ?? existingSnapshot?.equippedBodyArmorId ?? null),
    equippedNecklaceId: leader ? (leader.equippedNecklace?.id ?? null) : (leaderSnap?.equippedNecklaceId ?? existingSnapshot?.equippedNecklaceId ?? null),
    equippedRingId: leader ? (leader.equippedRing?.id ?? null) : (leaderSnap?.equippedRingId ?? existingSnapshot?.equippedRingId ?? null),
    equippedAccessoryId: leader ? (leader.equippedAccessory?.id ?? null) : (leaderSnap?.equippedAccessoryId ?? existingSnapshot?.equippedAccessoryId ?? null),
    party: partySnapshots,
    discoveredCookingRecipes: Array.from((gs as any).discoveredCookingRecipes ?? existingSnapshot?.discoveredCookingRecipes ?? []),
    discoveredAlchemyRecipes: Array.from((gs as any).discoveredAlchemyRecipes ?? existingSnapshot?.discoveredAlchemyRecipes ?? []),
    dungeonFloorCount: gs.getDungeonFloorCount(),
    lifetimeDungeonFloorCount: gs.getLifetimeDungeonFloorCount(),
    encounteredEnemies: Array.from((gs as any).encounteredEnemies ?? existingSnapshot?.encounteredEnemies ?? []),
    discoveredProficiencies: Array.from((gs as any).discoveredProficiencies ?? existingSnapshot?.discoveredProficiencies ?? []),
    discoveredStatusEffects: Array.from((gs as any).discoveredStatusEffects ?? existingSnapshot?.discoveredStatusEffects ?? []),
    discoveredGatheringNodes: Array.from((gs as any).discoveredGatheringNodes ?? existingSnapshot?.discoveredGatheringNodes ?? []),
    defeatedAreaBosses: Array.from((gs as any).defeatedAreaBosses ?? existingSnapshot?.defeatedAreaBosses ?? []),
    gearInstances: Object.fromEntries((gs as any).gearInstances ?? new Map()),
    quickSlots: [...(gs as any).quickSlots ?? existingSnapshot?.quickSlots ?? []],
    worldFlags: { ...((gs as any).worldFlags ?? existingSnapshot?.worldFlags ?? {}) },
    grovePityCounter: gs.getGrovePityCounter(),
    tutorialStep: (gs as any).tutorialStep ?? existingSnapshot?.tutorialStep,
    tutorialStepId: (gs as any).tutorialStepId ?? existingSnapshot?.tutorialStepId,
    tutorialCompleted: (gs as any).tutorialCompleted ?? existingSnapshot?.tutorialCompleted,
    tutorialDismissed: (gs as any).tutorialDismissed ?? existingSnapshot?.tutorialDismissed,
    hasReceivedTutorialSupplyCrate: (gs as any).hasReceivedTutorialSupplyCrate ?? existingSnapshot?.hasReceivedTutorialSupplyCrate
  };

  return snapshot;
}

export interface BuildBugReportOptions {
  whatHappened: string;
  whatExpected?: string;
  category: BugReportCategory;
  reportId?: string;
  party?: Player[];
  progression?: ProgressionSystem;
  sceneTime?: number;
}

export function buildBugReportBundle(options: BuildBugReportOptions): BugReportBundle {
  const reportId = options.reportId || generateReportId();
  const eventLog = EventLog.getInstance();

  let version = 'unknown';
  let buildDate = new Date().toISOString();
  try {
    if (typeof __APP_VERSION__ !== 'undefined') {
      version = __APP_VERSION__;
    }
  } catch {
    // fallback
  }
  try {
    if (typeof __BUILD_DATE__ !== 'undefined') {
      buildDate = __BUILD_DATE__;
    }
  } catch {
    // fallback
  }

  const browser = typeof navigator !== 'undefined' ? navigator.userAgent : `Node ${process.version}`;
  const screenSize = typeof window !== 'undefined'
    ? `${window.innerWidth}x${window.innerHeight}`
    : 'headless';

  const sessionLengthMs = Date.now() - eventLog.getSessionStartTime();

  // Read raw storage exactly as it sits
  let lastSavedFile: string | null = null;
  try {
    if (typeof localStorage !== 'undefined') {
      lastSavedFile = localStorage.getItem('RPG_TRUE_GRIND_SAVE_V1');
    }
  } catch {
    lastSavedFile = null;
  }

  const liveSnapshot = buildLiveSnapshot(options.party, options.progression, options.sceneTime ?? 0);

  const bundle: BugReportBundle = {
    reportId,
    timestamp: new Date().toISOString(),
    version,
    buildDate,
    browser,
    screenSize,
    sessionLengthMs,
    playerText: {
      whatHappened: options.whatHappened,
      whatExpected: options.whatExpected || '',
      category: options.category
    },
    whatHappened: options.whatHappened,
    whatExpected: options.whatExpected || '',
    category: options.category,
    liveSnapshot,
    lastSavedFile,
    eventLog: {
      entries: eventLog.getEntries(),
      text: eventLog.toText()
    }
  };

  return bundle;
}
