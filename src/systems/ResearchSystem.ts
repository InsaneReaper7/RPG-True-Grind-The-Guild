import type { Player } from '../entities/Player.ts';
import { GameState } from './GameState.ts';
import type { ResearchNodeDef, SkillBookDef } from '../types/game.ts';

export interface SkillBookConsumptionResult {
  action: 'learned_skill' | 'converted_points';
  skillId: string;
  pointsGained?: number;
  message: string;
}

export interface NodeUnlockResult {
  success: boolean;
  reason?: string;
  buildableId?: string;
}

export class ResearchSystem {
  private static instance: ResearchSystem;

  private constructor() {}

  public static getInstance(): ResearchSystem {
    if (!ResearchSystem.instance) {
      ResearchSystem.instance = new ResearchSystem();
    }
    return ResearchSystem.instance;
  }

  /**
   * Consumes a Skill Book according to Section 12.0:
   * - If player does not know the skill: learned immediately, usable regardless of equipped class.
   * - If player already knows the skill: converts into research points.
   */
  public consumeSkillBook(book: SkillBookDef, player: Player): SkillBookConsumptionResult {
    const gameState = GameState.getInstance();

    if (!player.knownSkillIds.includes(book.skillId)) {
      player.learnSkill(book.skillId, true);
      gameState.recordBookLearnedSkill(book.skillId);
      const msg = `📖 Learned new skill: ${book.skillId.replace(/_/g, ' ').toUpperCase()}! Usable across all classes.`;
      console.log(`[ResearchSystem] ${msg}`);
      return {
        action: 'learned_skill',
        skillId: book.skillId,
        message: msg
      };
    } else {
      gameState.addResearchPoints(book.researchPoints);
      const total = gameState.getResearchPoints();
      const msg = `🔬 ${book.name} already known! Converted to +${book.researchPoints} Research Points. (Total: ${total})`;
      console.log(`[ResearchSystem] ${msg}`);
      return {
        action: 'converted_points',
        skillId: book.skillId,
        pointsGained: book.researchPoints,
        message: msg
      };
    }
  }

  /**
   * Checks whether a research tree node can be unlocked.
   */
  public canUnlockNode(node: ResearchNodeDef): { canUnlock: boolean; reason?: string } {
    const gameState = GameState.getInstance();

    if (gameState.isBuildableUnlocked(node.targetBuildableId)) {
      return { canUnlock: false, reason: 'Already unlocked' };
    }

    // Check prerequisites
    if (node.prerequisites && node.prerequisites.length > 0) {
      for (const prereqId of node.prerequisites) {
        if (!gameState.isBuildableUnlocked(prereqId)) {
          return { canUnlock: false, reason: `Requires prerequisite: ${prereqId}` };
        }
      }
    }

    const currentPoints = gameState.getResearchPoints();
    if (currentPoints < node.cost) {
      return {
        canUnlock: false,
        reason: `Requires ${node.cost} Research Points (have ${currentPoints})`
      };
    }

    return { canUnlock: true };
  }

  /**
   * Unlocks a research tree node by consuming the required research points.
   */
  public unlockNode(node: ResearchNodeDef): NodeUnlockResult {
    const check = this.canUnlockNode(node);
    if (!check.canUnlock) {
      return { success: false, reason: check.reason };
    }

    const gameState = GameState.getInstance();
    const consumed = gameState.consumeResearchPoints(node.cost);
    if (!consumed) {
      return { success: false, reason: 'Failed to consume research points' };
    }

    gameState.unlockBuildable(node.targetBuildableId);
    console.log(`[ResearchSystem] ✨ Unlocked ${node.name} (${node.targetBuildableId}) for ${node.cost} Research Points!`);

    return {
      success: true,
      buildableId: node.targetBuildableId
    };
  }
}
