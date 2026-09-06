import Phaser from 'phaser';
import { Entity } from './Entity';
import { EnemyDef } from '../types/game';

export class Enemy extends Entity {
  public enemyData: EnemyDef;
  public lastAttackTime: number = 0;
  public isAggroed: boolean = false;
  public targetEntity: Entity | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    enemyData: EnemyDef,
    textureKey: string = 'wolf-avatar',
    tileSize: number = 32
  ) {
    super(scene, x, y, textureKey, enemyData.name, enemyData.hp, tileSize);

    this.enemyData = enemyData;
    this.moveSpeed = enemyData.moveSpeed;
  }
}
