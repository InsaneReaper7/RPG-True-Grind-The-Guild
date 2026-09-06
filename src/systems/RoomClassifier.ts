import type { GridPos, RoomRuleDef } from '../types/game';

export interface ClassifiedRoom {
  name: string;
  ruleId?: string;
  matchedTags: string[];
  enclosedTiles: GridPos[];
}

export class RoomClassifier {
  private rules: RoomRuleDef[] = [];

  constructor(rules: RoomRuleDef[] = []) {
    this.setRules(rules);
  }

  public setRules(rules: RoomRuleDef[]): void {
    // Sort descending by priority so higher priority (e.g. combination rules) match first
    this.rules = [...rules].sort((a, b) => b.priority - a.priority);
  }

  public getRules(): RoomRuleDef[] {
    return [...this.rules];
  }

  /**
   * Evaluates tags against prioritized rules.
   * Matches the highest priority rule whose requiredTags are all present in the supplied tags array.
   * Returns 'Enclosed Room' if enclosed but no tags match.
   */
  public classify(tags: string[], enclosedTiles: GridPos[] = []): ClassifiedRoom {
    const tagSet = new Set(tags);

    for (const rule of this.rules) {
      const matches = rule.requiredTags.length > 0 && rule.requiredTags.every((t) => tagSet.has(t));
      if (matches) {
        return {
          name: rule.name,
          ruleId: rule.id,
          matchedTags: [...rule.requiredTags],
          enclosedTiles
        };
      }
    }

    return {
      name: 'Enclosed Room',
      matchedTags: [],
      enclosedTiles
    };
  }
}
