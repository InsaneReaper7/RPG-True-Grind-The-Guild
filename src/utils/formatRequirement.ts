import type { Requirement } from '../types/game.ts';
import { DataLoader } from './DataLoader.ts';

function toTitleCase(id: string): string {
  return id
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function formatRequirement(req: Requirement): string {
  if (req.type === 'anyOf') {
    const subItems = (req.of ?? []).map((sub) => formatRequirement(sub)).join(', ');
    if (req.count !== undefined) {
      return `Any ${req.count} of: (${subItems})`;
    }
    return `One of: (${subItems})`;
  }

  if (req.type === 'oneOf') {
    const subItems = (req.of ?? []).map((sub) => formatRequirement(sub)).join(', ');
    return `One of: (${subItems})`;
  }

  if (req.type === 'discoveredRecipes') {
    return `${req.value ?? 0} Recipes`;
  }

  if (req.type === 'classLevel') {
    const target = req.target ?? '';
    let className: string | undefined;
    try {
      className = DataLoader.getInstance().getClass(target)?.name;
    } catch {
      // Fall back to formatted ID if DataLoader is not ready
    }
    const label = className || toTitleCase(target);
    return `${label} Lv ${req.value ?? 0}`;
  }

  const target = req.target ?? '';
  return `${toTitleCase(target)} ${req.value ?? 0}`;
}
