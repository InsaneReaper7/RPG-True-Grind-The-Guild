import { ClassDef, Requirement, ClassesData } from '../types/game';

export interface UnlockEvent {
  classDef: ClassDef;
}

export class ProgressionSystem {
  private proficiencies: Map<string, number> = new Map();
  private classLevels: Map<string, number> = new Map();
  private unlockedClasses: Set<string> = new Set();
  private classesData: ClassesData;
  private onUnlockCallbacks: ((event: UnlockEvent) => void)[] = [];

  constructor(classesData: ClassesData) {
    this.classesData = classesData;
    // Default proficiencies
    this.proficiencies.set('short_swords', 0);
  }

  public onClassUnlocked(callback: (event: UnlockEvent) => void): void {
    this.onUnlockCallbacks.push(callback);
  }

  public getProficiency(weaponId: string): number {
    return this.proficiencies.get(weaponId) || 0;
  }

  public getClassLevel(classId: string): number {
    return this.classLevels.get(classId) || 0;
  }

  public addProficiencyExp(weaponId: string, amount: number): void {
    const current = this.getProficiency(weaponId);
    const updated = current + amount;
    this.proficiencies.set(weaponId, updated);
    console.log(`[Progression] +${amount} Prof Exp for '${weaponId}'. Total: ${updated}`);

    this.checkClassUnlocks();
  }

  /**
   * Generic Requirement Evaluator Engine
   * Evaluates any class definition's requirements array (ANDed) dynamically.
   */
  public evaluateRequirements(classDef: ClassDef): boolean {
    if (this.unlockedClasses.has(classDef.id)) {
      return false; // Already unlocked
    }

    return classDef.requirements.every((req: Requirement) => {
      if (req.type === 'proficiency') {
        const currentProf = this.getProficiency(req.target);
        return currentProf >= req.value;
      } else if (req.type === 'classLevel') {
        const currentLevel = this.getClassLevel(req.target);
        return currentLevel >= req.value;
      }
      return false;
    });
  }

  public checkClassUnlocks(): void {
    for (const classDef of this.classesData.classes) {
      if (this.evaluateRequirements(classDef)) {
        this.unlockedClasses.add(classDef.id);
        console.log(`[Progression] Class Unlocked: ${classDef.name} (${classDef.id})!`);

        for (const cb of this.onUnlockCallbacks) {
          cb({ classDef });
        }
      }
    }
  }

  public isClassUnlocked(classId: string): boolean {
    return this.unlockedClasses.has(classId);
  }
}
