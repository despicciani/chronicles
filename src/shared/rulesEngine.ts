import {
  AbilityDef,
  ActionEconomyCost,
  AoETemplate,
  CampaignState,
  Character,
  Combatant,
  ConditionDef,
  DiceSkin,
  EquipSlot,
  ItemDef,
  MapToken,
  MonsterAttack,
  PaperdollArchetype,
  PendingAttackChoice,
  RolledDieVisual,
  StatModifier,
  TacticalMap,
  TerrainCellKind,
  TokenFrameStyle,
  WallCellMeta,
  WallCellShape,
} from './types';

export const DAMAGE_TYPE_OPTIONS = [
  'Corte',
  'Perfuração',
  'Concussão',
  'Fogo',
  'Gelo',
  'Elétrico',
  'Ácido',
  'Veneno',
  'Necrótico',
  'Radiante',
  'Psíquico',
  'Arcano',
  'Trovejante',
  'Cura',
] as const;

export const ATTACK_RANGE_OPTIONS = [
  'Corpo a Corpo (1,5m)',
  'Alcance Corpo a Corpo (3m)',
  'Toque',
  'Pessoal',
  'Distância Curta (9m)',
  'Distância Média (18m)',
  'Distância Longa (36m)',
  'Distância Extrema (60m)',
] as const;

export function getCampaignDamageTypes(campaign?: Pick<CampaignState, 'compendium'> | null): string[] {
  const custom = campaign?.compendium?.customDamageTypes || [];
  return Array.from(new Set([...DAMAGE_TYPE_OPTIONS, ...custom.filter((x) => Boolean(x && x.trim()))]));
}

export function inferPaperdollArchetype(className?: string): PaperdollArchetype {
  const lower = (className || '').toLowerCase();
  if (/mago|feitic|brux|cl[eé]rig|druida|arcan|xam[aã]|sacerdot/.test(lower)) {
    return 'arcane';
  }
  if (/ladin|assass|patrulh|arqueir|ca[çc]ador|bardo|monge|ninja/.test(lower)) {
    return 'rogue';
  }
  return 'warrior';
}

export const EQUIP_SLOT_LABELS: Record<EquipSlot, string> = {
  head: 'Cabeça',
  amulet: 'Pescoço / Manto',
  armor: 'Tronco / Armadura',
  mainHand: 'Mão Principal',
  offHand: 'Mão Secundária',
  ring: 'Anel / Relíquia',
  boots: 'Pés / Botas',
};

export function extractItemDefenseBonus(item: ItemDef): number {
  if (typeof item.defenseBonus === 'number' && item.defenseBonus !== 0) {
    return item.defenseBonus;
  }
  const hasDefModifier = item.modifiers?.some((m) => m.target === 'defense' && m.value !== 0);
  if (hasDefModifier) return 0;
  const text = `${item.name} ${item.description || ''}`;
  const match = text.match(/\+(\d+)\s*(?:na\s+defesa|de\s+defesa|em\s+defesa|ca\b|defesa\b)/i);
  if (match) {
    return Number(match[1]) || 0;
  }
  return 0;
}

export function resolveItemEquipSlot(item: ItemDef): EquipSlot | null {
  if (item.type === 'Consumível') return null;
  if (item.slot) return item.slot;
  if (item.type === 'Armadura') return 'armor';
  if (item.type === 'Escudo') return 'offHand';
  if (item.type === 'Arma') return 'mainHand';
  const k = `${item.name} ${item.description}`.toLowerCase();
  if (/elmo|coroa|capuz|chap[eé]u|tiara|capacete|m[aá]scara/.test(k)) return 'head';
  if (/amuleto|colar|capa|manto|talism[aã]|broche/.test(k)) return 'amulet';
  if (/bota|greva|sand[aá]lia|sapato/.test(k)) return 'boots';
  if (/armadura|cota|peitoral|coura[cç]a|robe|veste|t[uú]nica/.test(k)) return 'armor';
  if (/escudo|broquel|foco|orbe|tomo/.test(k)) return 'offHand';
  if (/espada|machado|adaga|arco|cajado|lan[cç]a|martelo|clava|bast[aã]o/.test(k)) return 'mainHand';
  return 'ring';
}

export const PLAYER_COLOR_PALETTE = [
  '#ef4444', // Rubi
  '#f59e0b', // Ouro Solar
  '#10b981', // Esmeralda
  '#38bdf8', // Safira Celeste
  '#8b5cf6', // Ametista
  '#ec4899', // Rosa Arcano
  '#06b6d4', // Turquesa
  '#f97316', // Chama
];

export function pickRandomPlayerColor(): string {
  return PLAYER_COLOR_PALETTE[Math.floor(Math.random() * PLAYER_COLOR_PALETTE.length)];
}

export function encodeRoomCode(ip: string, port = 3001): string {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) {
    return ip;
  }
  const hexIp = parts.map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join('');
  const hexPort = port.toString(16).padStart(4, '0').toUpperCase();
  return `RUNA-${hexIp.slice(0, 4)}-${hexIp.slice(4, 8)}${port === 3001 ? '' : `-${hexPort}`}`;
}

export function decodeRoomCode(rawCode: string): string | null {
  const trimmed = rawCode.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/+$/, '');
  }
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(trimmed)) {
    return trimmed.includes(':') ? `http://${trimmed}` : `http://${trimmed}:3001`;
  }
  const upper = trimmed.toUpperCase().replace(/^RUNA-/, '');
  const cleanHex = upper.replace(/[^0-9A-F]/g, '');
  if (cleanHex.length === 8 || cleanHex.length === 12) {
    const octets = [
      parseInt(cleanHex.slice(0, 2), 16),
      parseInt(cleanHex.slice(2, 4), 16),
      parseInt(cleanHex.slice(4, 6), 16),
      parseInt(cleanHex.slice(6, 8), 16),
    ];
    const port = cleanHex.length === 12 ? parseInt(cleanHex.slice(8, 12), 16) : 3001;
    return `http://${octets.join('.')}:${port}`;
  }
  return null;
}

export interface ComputedAttribute {
  value: number;
  mod: number;
  breakdown: string[];
}

export interface ComputedSkill {
  total: number;
  trained: boolean;
  isSavingThrow: boolean;
  attrShort: string;
  diceBonuses: string[];
  breakdown: string[];
}

export interface ComputedCharacterStats {
  attributes: Record<string, ComputedAttribute>;
  proficiencyBonus: number;
  halfLevelBonus: number;
  maxHp: number;
  maxHpBreakdown: string[];
  maxMp: number;
  maxMpBreakdown: string[];
  defense: number;
  defenseBreakdown: string[];
  initiative: number;
  initiativeBreakdown: string[];
  speed: number;
  speedBreakdown: string[];
  passivePerception: number;
  attackBonusExtra: number;
  attackBreakdown: string[];
  attackDiceBonuses: string[];
  damageBonusExtra: number;
  damageBreakdown: string[];
  damageDiceBonuses: string[];
  saveDiceBonuses: string[];
  skills: Record<string, ComputedSkill>;
  totalWeight: number;
}

export function parseAbilityDuration(
  durationText?: string,
  fallbackRounds?: number
): { isDiceFormula: true; formula: string } | { isDiceFormula: false; rounds: number } {
  const raw = (durationText || '').trim();
  if (raw) {
    // Check for dice formula like "1d4", "1d6 + 1", "2d4 turnos"
    const diceMatch = raw.match(/(\d*d\d+(?:\s*[+-]\s*(?:\d+|@?[a-z_]+))*)/i);
    if (diceMatch && diceMatch[1]) {
      return { isDiceFormula: true, formula: diceMatch[1].trim() };
    }
    // Check for plain numeric duration (e.g. "5", "5 turnos", "1 minuto")
    const numMatch = raw.match(/(\d+)/);
    if (numMatch && numMatch[1]) {
      const n = Math.max(1, parseInt(numMatch[1], 10));
      const low = raw.toLowerCase();
      if (low.includes('minuto')) return { isDiceFormula: false, rounds: n * 10 };
      if (low.includes('hora')) return { isDiceFormula: false, rounds: n * 600 };
      return { isDiceFormula: false, rounds: n };
    }
  }
  return {
    isDiceFormula: false,
    rounds: fallbackRounds && fallbackRounds > 0 ? fallbackRounds : 3,
  };
}

export function getConditionGrantedAbilities(
  activeConditionIds: string[] | undefined,
  campaign: Pick<CampaignState, 'compendium'>
): Array<{ ability: AbilityDef; condition: ConditionDef }> {
  if (!activeConditionIds || activeConditionIds.length === 0) return [];
  const seen = new Set<string>();
  const result: Array<{ ability: AbilityDef; condition: ConditionDef }> = [];
  for (const cid of activeConditionIds) {
    const cond = campaign.compendium.conditions.find((c) => c.id === cid);
    if (!cond?.grantedAbilityIds || cond.grantedAbilityIds.length === 0) continue;
    for (const aid of cond.grantedAbilityIds) {
      if (seen.has(aid)) continue;
      const ab = campaign.compendium.abilities.find((a) => a.id === aid);
      if (!ab || ab.actionType === 'Passiva') continue;
      seen.add(aid);
      result.push({ ability: ab, condition: cond });
    }
  }
  return result;
}

export function getConditionExtraEconomy(
  activeConditionIds: string[] | undefined,
  campaign: Pick<CampaignState, 'compendium'>
): { extraActions: number; extraBonusActions: number } {
  if (!activeConditionIds || activeConditionIds.length === 0) {
    return { extraActions: 0, extraBonusActions: 0 };
  }
  let extraActions = 0;
  let extraBonusActions = 0;
  for (const cid of activeConditionIds) {
    const cond = campaign.compendium.conditions.find((c) => c.id === cid);
    if (!cond) continue;
    if (cond.extraActions && cond.extraActions > 0) extraActions += cond.extraActions;
    if (cond.extraBonusActions && cond.extraBonusActions > 0) {
      extraBonusActions += cond.extraBonusActions;
    }
  }
  return { extraActions, extraBonusActions };
}

export function getConditionDamageAffinities(
  activeConditionIds: string[] | undefined,
  campaign: Pick<CampaignState, 'compendium'>
): { resistances: string[]; vulnerabilities: string[]; immunities: string[] } {
  const resistances: string[] = [];
  const vulnerabilities: string[] = [];
  const immunities: string[] = [];
  if (!activeConditionIds || activeConditionIds.length === 0) {
    return { resistances, vulnerabilities, immunities };
  }
  for (const cid of activeConditionIds) {
    const cond = campaign.compendium.conditions.find((c) => c.id === cid);
    if (!cond) continue;
    if (cond.resistances?.length) resistances.push(...cond.resistances);
    if (cond.vulnerabilities?.length) vulnerabilities.push(...cond.vulnerabilities);
    if (cond.immunities?.length) immunities.push(...cond.immunities);
  }
  return { resistances, vulnerabilities, immunities };
}

export function getConditionVisualTransform(
  activeConditionIds: string[] | undefined,
  campaign: Pick<CampaignState, 'compendium'>
): { imageUrl?: string; size?: number } {
  if (!activeConditionIds || activeConditionIds.length === 0) return {};
  let imageUrl: string | undefined;
  let size: number | undefined;
  for (const cid of activeConditionIds) {
    const cond = campaign.compendium.conditions.find((c) => c.id === cid);
    if (!cond) continue;
    if (cond.transformImageUrl) imageUrl = cond.transformImageUrl;
    if (cond.transformSize && cond.transformSize >= 1) size = cond.transformSize;
  }
  return { imageUrl, size };
}

export function getHeroInspirationPoints(
  ch: Pick<Character, 'hasInspiration' | 'inspirationPoints'> | undefined | null
): number {
  if (!ch) return 0;
  if (typeof ch.inspirationPoints === 'number' && Number.isFinite(ch.inspirationPoints)) {
    return Math.max(0, Math.min(3, Math.floor(ch.inspirationPoints)));
  }
  return ch.hasInspiration ? 1 : 0;
}

export const BUILTIN_SURFACE_CONDITIONS: Record<'cond-corroido' | 'cond-molhado', ConditionDef> = {
  'cond-corroido': {
    id: 'cond-corroido',
    name: 'Corroído',
    color: '#84cc16',
    icon: '🧪',
    description: 'Ácido corrói a armadura: -2 na Defesa (CA).',
    auraVfx: 'poison',
    modifiers: [{ target: 'defense', value: -2, label: 'Corroído' }],
  },
  'cond-molhado': {
    id: 'cond-molhado',
    name: 'Molhado',
    color: '#38bdf8',
    icon: '💧',
    description: 'Encharcado: vulnerável (2× dano) a Elétrico e Gelo; apaga chamas.',
    auraVfx: 'frost',
    vulnerabilities: ['Elétrico', 'Gelo'],
    modifiers: [],
  },
};

export function ensureSurfaceCondition(
  conditions: ConditionDef[],
  id: 'cond-corroido' | 'cond-molhado'
): ConditionDef[] {
  if (conditions.some((c) => c.id === id)) return conditions;
  return [...conditions, BUILTIN_SURFACE_CONDITIONS[id]];
}

/**
 * Merges static map terrainCells with any closed/locked Door markers acting as walls
 * (blocking movement, Line of Sight, and dynamic Torch/Darkvision light).
 */
export function getEffectiveTerrainCells(
  map: Pick<TacticalMap, 'terrainCells' | 'gmMarkers'> | undefined | null
): Record<string, TerrainCellKind> {
  const merged: Record<string, TerrainCellKind> = { ...(map?.terrainCells || {}) };
  if (map?.gmMarkers) {
    for (const mk of map.gmMarkers) {
      if (mk.kind === 'door') {
        if (mk.doorState === 'open') {
          // Opening a door placed on top of a wall carves an open doorway through the wall!
          delete merged[`${mk.x},${mk.y}`];
        } else {
          merged[`${mk.x},${mk.y}`] = 'wall';
        }
      }
    }
  }
  return merged;
}

/**
 * Returns effective per-cell wall shape/opacity metadata, respecting open/closed doors.
 * Closed/locked doors default to solid full-cell blockers if no custom shape was set on that cell.
 */
export function getEffectiveWallMeta(
  map: Pick<TacticalMap, 'terrainCells' | 'wallMeta' | 'gmMarkers'> | undefined | null
): Record<string, WallCellMeta> {
  const merged: Record<string, WallCellMeta> = { ...(map?.wallMeta || {}) };
  if (map?.gmMarkers) {
    for (const mk of map.gmMarkers) {
      if (mk.kind === 'door') {
        const key = `${mk.x},${mk.y}`;
        if (mk.doorState === 'open') {
          delete merged[key];
        } else if (!merged[key]) {
          merged[key] = { shape: 'full', opacity: 1 };
        }
      }
    }
  }
  return merged;
}

/**
 * Thin edge walls hug 28% of a cell's border, allowing a token to stand inside the open 72%
 * of the square while strictly blocking movement & vision across that wall border.
 */
export function isThinEdgeWall(shape?: WallCellShape): boolean {
  return (
    shape === 'edge-top' ||
    shape === 'edge-bottom' ||
    shape === 'edge-left' ||
    shape === 'edge-right'
  );
}

/**
 * Exact sub-cell geometric containment test for a point (fx, fy) in [0, 1) x [0, 1).
 */
export function isPointInsideWallShape(shape: WallCellShape, fx: number, fy: number): boolean {
  switch (shape) {
    case 'half-top':
      return fy <= 0.5;
    case 'half-bottom':
      return fy >= 0.5;
    case 'half-left':
      return fx <= 0.5;
    case 'half-right':
      return fx >= 0.5;
    case 'edge-top':
      return fy <= 0.28;
    case 'edge-bottom':
      return fy >= 0.72;
    case 'edge-left':
      return fx <= 0.28;
    case 'edge-right':
      return fx >= 0.72;
    case 'bar-h':
      return fy >= 0.36 && fy <= 0.64;
    case 'bar-v':
      return fx >= 0.36 && fx <= 0.64;
    case 'diag-tl':
      return fx + fy <= 1.02;
    case 'diag-tr':
      return 1 - fx + fy <= 1.02;
    case 'diag-bl':
      return fx + (1 - fy) <= 1.02;
    case 'diag-br':
      return 1 - fx + (1 - fy) <= 1.02;
    case 'pillar':
      return fx >= 0.22 && fx <= 0.78 && fy >= 0.22 && fy <= 0.78;
    case 'full':
    default:
      return true;
  }
}

/**
 * Checks whether moving 1 step from (fromX, fromY) to (toX, toY) is blocked by a solid wall
 * OR crosses a thin edge wall border (on either the leaving or entering cell).
 */
export function doesStepCrossWall(
  terrain: Record<string, TerrainCellKind> | undefined,
  wallMeta: Record<string, WallCellMeta> | undefined,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): boolean {
  if (!terrain) return false;
  const toKey = `${toX},${toY}`;
  if (terrain[toKey] === 'wall') {
    const toShape = wallMeta?.[toKey]?.shape || 'full';
    if (!isThinEdgeWall(toShape)) return true;
  }

  const dx = toX - fromX;
  const dy = toY - fromY;
  if (dx === 0 && dy === 0) return false;

  const isEdgeBlockedOrthogonal = (ax: number, ay: number, bx: number, by: number): boolean => {
    const aKey = `${ax},${ay}`;
    const bKey = `${bx},${by}`;
    const aShape = terrain[aKey] === 'wall' ? wallMeta?.[aKey]?.shape || 'full' : undefined;
    const bShape = terrain[bKey] === 'wall' ? wallMeta?.[bKey]?.shape || 'full' : undefined;
    if (bShape && !isThinEdgeWall(bShape)) return true;
    const odx = bx - ax;
    const ody = by - ay;
    if (ody === -1) return aShape === 'edge-top' || bShape === 'edge-bottom';
    if (ody === 1) return aShape === 'edge-bottom' || bShape === 'edge-top';
    if (odx === -1) return aShape === 'edge-left' || bShape === 'edge-right';
    if (odx === 1) return aShape === 'edge-right' || bShape === 'edge-left';
    return false;
  };

  if (dx === 0 || dy === 0) {
    return isEdgeBlockedOrthogonal(fromX, fromY, toX, toY);
  }

  // Diagonal step: blocked if BOTH orthogonal L-paths around the corner are blocked
  const pathXFirstBlocked =
    isEdgeBlockedOrthogonal(fromX, fromY, toX, fromY) ||
    isEdgeBlockedOrthogonal(toX, fromY, toX, toY);
  const pathYFirstBlocked =
    isEdgeBlockedOrthogonal(fromX, fromY, fromX, toY) ||
    isEdgeBlockedOrthogonal(fromX, toY, toX, toY);
  return pathXFirstBlocked && pathYFirstBlocked;
}

/**
 * Continuous fine-step Line of Sight check between two grid-space points (x0, y0) and (x1, y1),
 * honoring exact sub-cell wall shapes (full, half, thin edge, center bar, diagonal, pillar).
 */
export function hasContinuousWallLineOfSight(
  terrain: Record<string, TerrainCellKind> | undefined,
  wallMeta: Record<string, WallCellMeta> | undefined,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): boolean {
  if (!terrain) return true;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist <= 0.15) return true;

  const stepSize = 0.08;
  const steps = Math.max(2, Math.ceil(dist / stepSize));
  let lastGx = Math.floor(x0);
  let lastGy = Math.floor(y0);

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    const gx = Math.floor(px);
    const gy = Math.floor(py);

    // Diagonal corner pinch check between two full walls
    if (gx !== lastGx && gy !== lastGy) {
      const aKey = `${gx},${lastGy}`;
      const bKey = `${lastGx},${gy}`;
      const aFull = terrain[aKey] === 'wall' && (!wallMeta?.[aKey] || wallMeta[aKey].shape === 'full');
      const bFull = terrain[bKey] === 'wall' && (!wallMeta?.[bKey] || wallMeta[bKey].shape === 'full');
      if (aFull && bFull) return false;
    }

    const key = `${gx},${gy}`;
    if (terrain[key] === 'wall') {
      const shape = wallMeta?.[key]?.shape || 'full';
      const isAtEndCell =
        (gx === Math.floor(x1) && gy === Math.floor(y1) && dist - t * dist < 0.25) ||
        (gx === Math.floor(x0) && gy === Math.floor(y0) && t * dist < 0.16);
      if (!isAtEndCell && isPointInsideWallShape(shape, px - gx, py - gy)) {
        return false;
      }
    }
    lastGx = gx;
    lastGy = gy;
  }
  return true;
}

export interface InventoryChargedAbility {
  inventoryEntryId: string;
  itemDef: ItemDef;
  ability: AbilityDef;
  maxCharges: number;
  chargesRemaining: number;
  rechargeType: 'long-rest' | 'short-rest' | 'consumable';
  quantity: number;
}

export function getInventoryChargedAbilities(
  character: Character | undefined | null,
  campaign: Pick<CampaignState, 'compendium'>
): InventoryChargedAbility[] {
  if (!character || !character.inventory?.length) return [];
  const results: InventoryChargedAbility[] = [];
  for (const entry of character.inventory) {
    if ((entry.quantity ?? 1) <= 0) continue;
    const itemDef = campaign.compendium.items.find((i) => i.id === entry.itemId);
    if (!itemDef?.grantedAbilityId) continue;
    const ab = campaign.compendium.abilities.find((a) => a.id === itemDef.grantedAbilityId);
    if (!ab || ab.actionType === 'Passiva') continue;
    const maxCharges = Math.max(0, Math.floor(itemDef.maxCharges ?? 0));
    const chargesRemaining =
      maxCharges > 0
        ? typeof entry.chargesRemaining === 'number'
          ? Math.max(0, Math.min(maxCharges, entry.chargesRemaining))
          : maxCharges
        : 0;
    results.push({
      inventoryEntryId: entry.id,
      itemDef,
      ability: ab,
      maxCharges,
      chargesRemaining,
      rechargeType: itemDef.rechargeType || 'long-rest',
      quantity: entry.quantity ?? 1,
    });
  }
  return results;
}

export function getCombatantActionsRemaining(cb: Pick<Combatant, 'actionAvailable' | 'actionsRemaining'>): number {
  if (typeof cb.actionsRemaining === 'number') return Math.max(0, cb.actionsRemaining);
  return cb.actionAvailable === false ? 0 : 1;
}

export function getCombatantBonusActionsRemaining(
  cb: Pick<Combatant, 'bonusActionAvailable' | 'bonusActionsRemaining'>
): number {
  if (typeof cb.bonusActionsRemaining === 'number') return Math.max(0, cb.bonusActionsRemaining);
  return cb.bonusActionAvailable === false ? 0 : 1;
}

export function normalizeActionEconomyCost(actionType?: string): ActionEconomyCost {
  if (!actionType) return 'Padrão';
  const t = actionType.trim();
  if (/b[oô]nus/i.test(t)) return 'Bônus';
  if (/rea[cç][aã]o/i.test(t)) return 'Reação';
  if (/livre/i.test(t)) return 'Livre';
  return 'Padrão';
}

/**
 * Initiative comparator honoring "Natural 20 always tops initiative, Natural 1 always goes last":
 * - Nat 20 beats all non-20s (ties broken by total initiative, then bonus)
 * - Nat 1 loses to all non-1s (ties broken by total initiative, then bonus)
 * - Normal rolls sort by total descending, then higher d20Roll, then higher initBonus
 */
export function compareInitiativeOrder(
  a: { initiative: number; d20Roll?: number; initBonus?: number },
  b: { initiative: number; d20Roll?: number; initBonus?: number }
): number {
  const aTier = a.d20Roll === 20 ? 2 : a.d20Roll === 1 ? 0 : 1;
  const bTier = b.d20Roll === 20 ? 2 : b.d20Roll === 1 ? 0 : 1;
  if (aTier !== bTier) return bTier - aTier;
  if (b.initiative !== a.initiative) return b.initiative - a.initiative;
  if ((b.d20Roll ?? 0) !== (a.d20Roll ?? 0)) return (b.d20Roll ?? 0) - (a.d20Roll ?? 0);
  return (b.initBonus ?? 0) - (a.initBonus ?? 0);
}

/**
 * D&D 5e Extra Attack count per Attack Action:
 * - Uses GM override (`char.extraAttacksOverride`) if set (1..5)
 * - Otherwise auto-computes from class & level:
 *   - Guerreiro: 2 (Nv 5+), 3 (Nv 11+), 4 (Nv 20)
 *   - Bárbaro / Paladino / Patrulheiro / Monge: 2 (Nv 5+)
 *   - Outras classes: 1
 */
export function getCharacterAttacksPerAction(char?: Character): number {
  if (!char) return 1;
  if (typeof char.extraAttacksOverride === 'number' && char.extraAttacksOverride >= 1) {
    return Math.max(1, Math.min(5, Math.floor(char.extraAttacksOverride)));
  }
  const cid = (char.classId || '').toLowerCase();
  const lvl = char.level || 1;
  if (cid.includes('guerreiro') || cid.includes('fighter')) {
    if (lvl >= 20) return 4;
    if (lvl >= 11) return 3;
    if (lvl >= 5) return 2;
    return 1;
  }
  if (
    lvl >= 5 &&
    (cid.includes('barbaro') ||
      cid.includes('bárbaro') ||
      cid.includes('paladino') ||
      cid.includes('patrulheiro') ||
      cid.includes('ranger') ||
      cid.includes('monge'))
  ) {
    return 2;
  }
  return 1;
}

export function consumeCombatantEconomy(
  cb: Combatant,
  cost: ActionEconomyCost | undefined,
  opts?: {
    isWeaponAttack?: boolean;
    attacksPerAction?: number;
    isReadyReaction?: boolean;
  }
): Combatant {
  if (opts?.isReadyReaction) {
    return { ...cb, reactionAvailable: false, readyAction: null };
  }
  if (!cost || cost === 'Livre') return cb;
  if (cost === 'Padrão') {
    if (opts?.isWeaponAttack && (cb.extraAttacksRemaining ?? 0) > 0) {
      const nextExtra = Math.max(0, (cb.extraAttacksRemaining ?? 0) - 1);
      return { ...cb, extraAttacksRemaining: nextExtra };
    }
    const nextRem = Math.max(0, getCombatantActionsRemaining(cb) - 1);
    const grantedExtra =
      opts?.isWeaponAttack && (opts.attacksPerAction ?? 1) > 1
        ? (cb.extraAttacksRemaining ?? 0) + ((opts.attacksPerAction ?? 1) - 1)
        : cb.extraAttacksRemaining ?? 0;
    return {
      ...cb,
      actionsRemaining: nextRem,
      actionAvailable: nextRem > 0,
      extraAttacksRemaining: grantedExtra,
    };
  }
  if (cost === 'Bônus') {
    const nextRem = Math.max(0, getCombatantBonusActionsRemaining(cb) - 1);
    return { ...cb, bonusActionsRemaining: nextRem, bonusActionAvailable: nextRem > 0 };
  }
  if (cost === 'Reação') {
    return { ...cb, reactionAvailable: false };
  }
  return cb;
}

/**
 * BG3 Revive Rule: when a downed combatant (0 PV) wakes up in combat via healing, Help/Medicine,
 * or Death Save (Nat 20 / 3rd success), they lose their Standard Action (keeping Movement & Bonus Action).
 * - If it is currently their turn, the Standard Action is consumed immediately.
 * - If revived outside their turn, `revivedLostActionPending` is set so their next turn starts without Standard Action.
 */
export function applyBg3ReviveActionPenalty(
  cb: Combatant,
  isCurrentlyActiveTurn: boolean
): Combatant {
  if (isCurrentlyActiveTurn) {
    return {
      ...cb,
      actionsRemaining: 0,
      actionAvailable: false,
      extraAttacksRemaining: 0,
      revivedLostActionPending: false,
    };
  }
  return {
    ...cb,
    revivedLostActionPending: true,
  };
}

export function getAttrMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function getAttributePointsGainedAtLevel(
  level: number,
  settings?: { attributePointsPerGain?: number; attributePointsEveryLevels?: number }
): number {
  if (level <= 1) return 0;
  const pts =
    typeof settings?.attributePointsPerGain === 'number' ? settings.attributePointsPerGain : 2;
  const every =
    typeof settings?.attributePointsEveryLevels === 'number'
      ? settings.attributePointsEveryLevels
      : 4;
  if (pts <= 0 || every <= 0) return 0;
  if (
    settings?.attributePointsPerGain === undefined &&
    settings?.attributePointsEveryLevels === undefined
  ) {
    return [4, 8, 12, 16, 19].includes(level) ? 2 : 0;
  }
  return level % every === 0 ? pts : 0;
}

export function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function getCharacterCustomResourceState(
  char: { level: number; customResourceValues?: Record<string, { current: number; maxOverride?: number }> },
  res: { id: string; baseMax: number; perLevel: number }
): { current: number; max: number } {
  const entry = char.customResourceValues?.[res.id];
  const computedMax = Math.max(1, res.baseMax + Math.max(0, char.level - 1) * res.perLevel);
  const max =
    typeof entry?.maxOverride === 'number' && entry.maxOverride > 0
      ? entry.maxOverride
      : computedMax;
  const current =
    typeof entry?.current === 'number' ? Math.max(0, Math.min(max, entry.current)) : max;
  return { current, max };
}

export const DEFAULT_XP_THRESHOLDS: number[] = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export function getXpThresholds(custom?: number[]): number[] {
  if (!Array.isArray(custom) || custom.length < 2) return DEFAULT_XP_THRESHOLDS;
  const merged = [...DEFAULT_XP_THRESHOLDS];
  for (let i = 0; i < Math.min(20, custom.length); i++) {
    const val = Number(custom[i]);
    if (Number.isFinite(val) && val >= 0) merged[i] = Math.round(val);
  }
  merged[0] = 0;
  return merged;
}

export function computeLevelForXp(xp: number, customThresholds?: number[]): number {
  const thresholds = getXpThresholds(customThresholds);
  let level = 1;
  for (let i = 1; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) level = i + 1;
    else break;
  }
  return Math.max(1, Math.min(20, level));
}

export function getNextLevelXp(level: number, customThresholds?: number[]): number | null {
  const thresholds = getXpThresholds(customThresholds);
  if (level >= 20) return null;
  return thresholds[Math.max(1, level)] ?? null;
}

export function isTokenInsideAoE(
  tok: { x: number; y: number; size?: number },
  shape: 'sphere' | 'cone' | 'line' | 'cube',
  originX: number,
  originY: number,
  radiusSquares: number,
  angleDeg = 0
): boolean {
  const sz = Math.max(1, tok.size || 1);
  // Inset token AABB slightly (0.12 squares) so grazing an outer border pixel doesn't false-trigger
  const minX = tok.x + 0.12;
  const maxX = tok.x + sz - 0.12;
  const minY = tok.y + 0.12;
  const maxY = tok.y + sz - 0.12;

  if (shape === 'sphere') {
    // Exact Circle vs AABB intersection matching drawn circle (radius = radiusSquares)
    const closestX = Math.max(minX, Math.min(originX, maxX));
    const closestY = Math.max(minY, Math.min(originY, maxY));
    return Math.hypot(closestX - originX, closestY - originY) <= radiusSquares;
  }

  if (shape === 'cube') {
    // Exact AABB vs AABB intersection matching drawn square (side = radiusSquares)
    const half = radiusSquares / 2;
    return (
      minX <= originX + half &&
      maxX >= originX - half &&
      minY <= originY + half &&
      maxY >= originY - half
    );
  }

  // For Line and Cone, test each occupied 1x1 sub-cell center of the token against exact SVG geometry
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);

  for (let ox = 0; ox < sz; ox++) {
    for (let oy = 0; oy < sz; oy++) {
      const px = tok.x + ox + 0.5;
      const py = tok.y + oy + 0.5;
      const dx = px - originX;
      const dy = py - originY;
      const along = dx * ux + dy * uy;
      const perp = Math.abs(-dx * uy + dy * ux);

      if (shape === 'line') {
        // Matches SVG rect: x=0..radiusSquares, half-height = 0.5 squares
        if (along >= -0.05 && along <= radiusSquares + 0.05 && perp <= 0.55) {
          return true;
        }
      } else {
        // Matches SVG cone: apex (0,0), radius=radiusSquares, slope=0.52
        const dist = Math.hypot(dx, dy);
        if (along >= 0 && dist <= radiusSquares + 0.05 && perp <= along * 0.52 + 0.12) {
          return true;
        }
      }
    }
  }
  return false;
}

export function parseAttackRangeMeters(range?: string, actionName?: string): number {
  const clean = (range || '').trim();
  if (clean) {
    const mMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:m\b|metros?\b)/i);
    if (mMatch) {
      const val = parseFloat(mMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) return val;
    }
    if (/corpo\s*a\s*corpo|toque|adjacente|melee|pessoal|self/i.test(clean)) return 1.5;
    if (/alcance|reach|haste/i.test(clean)) return 3;
  }

  const label = actionName || '';
  if (/arco|besta|disparo|flecha|azagaia|sopro|raio|fogo|m[ií]sseis|rajada|arremess|dardo|varinha/i.test(label)) {
    return 18;
  }
  if (/curar|b[eê]n[cç][aã]o|palavra|sagrada|grito|segundo/i.test(label)) {
    return 9;
  }
  return 1.5;
}

export function parseAttackRangeSquares(
  range?: string,
  actionName?: string,
  gridSquareMeters = 1.5
): number {
  const meters = parseAttackRangeMeters(range, actionName);
  return Math.max(1, Math.floor((meters + 0.05) / Math.max(0.5, gridSquareMeters)));
}

export function getGridSpanDistance(
  ax: number,
  ay: number,
  aSize: number,
  bx: number,
  by: number,
  bSize: number,
  gridSquareMeters = 1.5
): { squares: number; meters: number } {
  const ax2 = ax + Math.max(1, aSize) - 1;
  const ay2 = ay + Math.max(1, aSize) - 1;
  const bx2 = bx + Math.max(1, bSize) - 1;
  const by2 = by + Math.max(1, bSize) - 1;
  const dx = ax > bx2 ? ax - bx2 : bx > ax2 ? bx - ax2 : 0;
  const dy = ay > by2 ? ay - by2 : by > ay2 ? by - ay2 : 0;
  const squares = Math.max(dx, dy);
  const meters = Math.round(squares * gridSquareMeters * 10) / 10;
  return { squares, meters };
}

const FORMULA_VAR_REGEX = /(^|[^a-zA-Z0-9_])@?(for|des|con|int|sab|car|prof|nivel|metade_nivel)(?![a-zA-Z0-9_])/gi;

export function formatFormulaForDisplay(
  rawFormula: string,
  stats?: ComputedCharacterStats,
  character?: Character
): string {
  const labelMap: Record<string, string> = {
    for: 'FOR',
    des: 'DES',
    con: 'CON',
    int: 'INT',
    sab: 'SAB',
    car: 'CAR',
    prof: 'PROF',
    nivel: 'NÍVEL',
    metade_nivel: '½ NÍVEL',
  };

  return rawFormula
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(FORMULA_VAR_REGEX, (_, prefix: string, token: string) => {
      const key = token.toLowerCase();
      const label = labelMap[key] || token.toUpperCase();
      if (!stats) return `${prefix}${label}`;
      let bonus: number | undefined;
      if (key === 'prof') bonus = stats.proficiencyBonus + stats.halfLevelBonus;
      else if (key === 'nivel' && character) bonus = character.level;
      else if (key === 'metade_nivel' && character) bonus = Math.floor(character.level / 2);
      else if (key in stats.attributes) bonus = stats.attributes[key].mod;

      return bonus !== undefined ? `${prefix}${label} (${formatSigned(bonus)})` : `${prefix}${label}`;
    })
    .trim();
}

export function computeCharacterStats(
  character: Character,
  campaign: CampaignState
): ComputedCharacterStats {
  const { compendium, settings } = campaign;
  const race = compendium.races.find((r) => r.id === character.raceId);
  const charClass = compendium.classes.find((c) => c.id === character.classId);

  const profBonus = settings.useProficiencyBonus
    ? 2 + Math.floor((Math.max(1, character.level) - 1) / 4)
    : 0;
  const halfLevel = settings.useHalfLevelBonus
    ? Math.floor(Math.max(1, character.level) / 2)
    : 0;
  const levelBonus = profBonus + halfLevel;

  // Gather active modifiers from equipped items (strictly max 1 per anatomical body slot) & active conditions
  const activeModifiers: StatModifier[] = [];
  const effectiveEquippedItems: ItemDef[] = [];
  const occupiedSlots = new Set<EquipSlot>();

  for (const inv of character.inventory) {
    if (!inv.equipped) continue;
    const item = compendium.items.find((i) => i.id === inv.itemId);
    if (!item) continue;
    const slot = inv.equippedSlot || resolveItemEquipSlot(item);
    if (!slot || occupiedSlots.has(slot)) continue;
    occupiedSlots.add(slot);
    effectiveEquippedItems.push(item);
    if (item.modifiers) {
      for (const m of item.modifiers) {
        activeModifiers.push({ ...m, label: m.label || item.name });
      }
    }
  }

  for (const condId of character.activeConditionIds) {
    const cond = compendium.conditions.find((c) => c.id === condId);
    if (cond) {
      for (const m of cond.modifiers) {
        activeModifiers.push({ ...m, label: m.label || cond.name });
      }
    }
  }

  // Compute Attributes
  const attributes: Record<string, ComputedAttribute> = {};
  for (const attr of compendium.attributes) {
    const base = character.attributes[attr.id] ?? 10;
    const racial = race?.attributeBonuses?.[attr.id] ?? 0;
    const breakdown: string[] = [`Base ${base}`];
    if (racial !== 0) breakdown.push(`${race?.name} ${formatSigned(racial)}`);

    let modExtra = 0;
    for (const mod of activeModifiers) {
      if (mod.target === 'attribute' && (!mod.targetId || mod.targetId === attr.id)) {
        modExtra += mod.value;
        breakdown.push(`${mod.label ?? 'Efeito'} ${formatSigned(mod.value)}`);
      }
    }

    const finalVal = base + racial + modExtra;
    attributes[attr.id] = {
      value: finalVal,
      mod: getAttrMod(finalVal),
      breakdown,
    };
  }

  const conMod = attributes['con']?.mod ?? 0;
  const desMod = attributes['des']?.mod ?? 0;

  // Compute Max HP
  const maxHpBreakdown: string[] = [];
  let maxHp = 0;
  if (character.maxHpOverride && character.maxHpOverride > 0) {
    maxHp = character.maxHpOverride;
    maxHpBreakdown.push(`Manual: ${maxHp}`);
  } else {
    const hitDie = charClass?.hitDie ?? 8;
    const hpPerLvl = charClass?.hpPerLevel ?? 5;
    const lvl1Hp = hitDie + conMod;
    const otherLvlsHp = Math.max(0, character.level - 1) * (hpPerLvl + conMod);
    maxHp = Math.max(1, lvl1Hp + otherLvlsHp);
    maxHpBreakdown.push(`Nv1 (${hitDie} + CON ${formatSigned(conMod)}) = ${lvl1Hp}`);
    if (character.level > 1) {
      maxHpBreakdown.push(
        `Nvs 2-${character.level} (${character.level - 1}x ${hpPerLvl + conMod}) = ${otherLvlsHp}`
      );
    }
    if (race?.id === 'raca-anao') {
      maxHp += character.level;
      maxHpBreakdown.push(`Anão (+1/nv) +${character.level}`);
    }
  }
  for (const m of activeModifiers) {
    if (m.target === 'maxHp') {
      maxHp += m.value;
      maxHpBreakdown.push(`${m.label} ${formatSigned(m.value)}`);
    }
  }

  // Compute Max MP
  const maxMpBreakdown: string[] = [];
  let maxMp = 0;
  if (typeof character.maxMpOverride === 'number' && Number.isFinite(character.maxMpOverride) && character.maxMpOverride >= 0) {
    maxMp = character.maxMpOverride;
    maxMpBreakdown.push(`Manual: ${maxMp}`);
  } else {
    const mpPerLvl = charClass?.mpPerLevel ?? 3;
    const keyAttr = charClass?.keyAttributeId ?? 'int';
    const keyMod = Math.max(0, attributes[keyAttr]?.mod ?? 0);
    maxMp = Math.max(0, mpPerLvl * character.level + keyMod);
    maxMpBreakdown.push(`${charClass?.name ?? 'Base'} (${mpPerLvl} x Nv${character.level})`);
    if (keyMod > 0) maxMpBreakdown.push(`Attr Chave ${formatSigned(keyMod)}`);
  }
  for (const m of activeModifiers) {
    if (m.target === 'maxMp') {
      maxMp += m.value;
      maxMpBreakdown.push(`${m.label} ${formatSigned(m.value)}`);
    }
  }

  // Compute Defense / CA
  let defense = 0;
  const defenseBreakdown: string[] = [];
  if (typeof character.defenseOverride === 'number' && character.defenseOverride > 0) {
    defense = character.defenseOverride;
    defenseBreakdown.push(`Manual: ${defense}`);
  } else {
    defense = settings.baseDefense;
    defenseBreakdown.push(`Base ${settings.baseDefense}`);
    let hasHeavyArmor = false;
    let hasMediumArmor = false;
    let armorBonus = 0;
    let shieldBonus = 0;

    for (const item of effectiveEquippedItems) {
      const defBonus = extractItemDefenseBonus(item);
      if (!defBonus) continue;
      if (item.type === 'Armadura') {
        armorBonus += defBonus;
        defenseBreakdown.push(`${item.name} +${defBonus}`);
        if (defBonus >= 6 || /placas|completa|cota de malha|tala/i.test(item.name)) {
          hasHeavyArmor = true;
        } else if (defBonus >= 3 || /peitoral|camisa de malha|brunea|meia.?armadura|gib[aã]o/i.test(item.name)) {
          hasMediumArmor = true;
        }
      } else if (item.type === 'Escudo') {
        shieldBonus += defBonus;
        defenseBreakdown.push(`${item.name} +${defBonus}`);
      } else {
        defense += defBonus;
        defenseBreakdown.push(`${item.name} +${defBonus}`);
      }
    }

    defense += armorBonus + shieldBonus;
    // Official D&D 5e AC DEX cap: Heavy = 0 DEX, Medium = max +2 DEX, Light / Unarmored = full DEX
    const effectiveDesForArmor = hasHeavyArmor
      ? 0
      : hasMediumArmor
        ? Math.min(2, desMod)
        : desMod;
    if (effectiveDesForArmor !== 0) {
      defense += effectiveDesForArmor;
      defenseBreakdown.push(
        hasMediumArmor
          ? `Destreza (máx +2 armadura média) ${formatSigned(effectiveDesForArmor)}`
          : `Destreza ${formatSigned(effectiveDesForArmor)}`
      );
    }
  }
  for (const m of activeModifiers) {
    if (m.target === 'defense') {
      defense += m.value;
      defenseBreakdown.push(`${m.label} ${formatSigned(m.value)}`);
    }
  }
  const activeForm =
    character.activeFormId && Array.isArray(character.forms)
      ? character.forms.find((f) => f.id === character.activeFormId)
      : undefined;
  if (activeForm?.bonusAc) {
    defense += activeForm.bonusAc;
    defenseBreakdown.push(`Forma (${activeForm.name}) ${formatSigned(activeForm.bonusAc)}`);
  }

  // Compute Speed
  let speed =
    typeof character.speedOverride === 'number' && character.speedOverride >= 0
      ? character.speedOverride
      : (race?.speed ?? 9);
  const speedBreakdown: string[] = [
    typeof character.speedOverride === 'number' && character.speedOverride >= 0
      ? `Manual ${speed}m`
      : `Raça ${speed}m`,
  ];
  for (const m of activeModifiers) {
    if (m.target === 'speed') {
      speed += m.value;
      speedBreakdown.push(`${m.label} ${formatSigned(m.value)}m`);
    }
  }
  if (activeForm?.bonusSpeed) {
    speed += activeForm.bonusSpeed;
    speedBreakdown.push(`Forma (${activeForm.name}) ${formatSigned(activeForm.bonusSpeed)}m`);
  }
  speed = Math.max(0, speed);

  // Compute Initiative
  let initiative = desMod;
  const initiativeBreakdown: string[] = [`DES ${formatSigned(desMod)}`];
  for (const m of activeModifiers) {
    if (m.target === 'initiative') {
      initiative += m.value;
      initiativeBreakdown.push(`${m.label} ${formatSigned(m.value)}`);
    }
  }

  // Attack / Damage / Save global modifiers
  let attackBonusExtra = 0;
  const attackBreakdown: string[] = [];
  const attackDiceBonuses: string[] = [];
  let damageBonusExtra = 0;
  const damageBreakdown: string[] = [];
  const damageDiceBonuses: string[] = [];
  const saveDiceBonuses: string[] = [];
  let saveBonusExtra = 0;

  for (const m of activeModifiers) {
    const cleanDice = m.diceBonus?.trim();
    if (m.target === 'attack') {
      if (m.value !== 0) {
        attackBonusExtra += m.value;
        attackBreakdown.push(`${m.label} ${formatSigned(m.value)}`);
      }
      if (cleanDice && /\d*d\d+/i.test(cleanDice)) {
        attackDiceBonuses.push(cleanDice);
        attackBreakdown.push(`${m.label} +${cleanDice}`);
      }
    } else if (m.target === 'damage') {
      if (m.value !== 0) {
        damageBonusExtra += m.value;
        damageBreakdown.push(`${m.label} ${formatSigned(m.value)}`);
      }
      if (cleanDice && /\d*d\d+/i.test(cleanDice)) {
        damageDiceBonuses.push(cleanDice);
        damageBreakdown.push(`${m.label} +${cleanDice}`);
      }
    } else if (m.target === 'save') {
      if (m.value !== 0) saveBonusExtra += m.value;
      if (cleanDice && /\d*d\d+/i.test(cleanDice)) saveDiceBonuses.push(cleanDice);
    }
  }

  // Compute Skills
  const skills: Record<string, ComputedSkill> = {};
  for (const skill of compendium.skills) {
    const attrDef = compendium.attributes.find((a) => a.id === skill.defaultAttributeId);
    const attrMod = attributes[skill.defaultAttributeId]?.mod ?? 0;
    const trained = character.trainedSkillIds.includes(skill.id);
    const breakdown: string[] = [`${attrDef?.shortName ?? 'ATR'} ${formatSigned(attrMod)}`];
    const diceBonuses: string[] = [];

    let total = attrMod;
    if (trained && levelBonus > 0) {
      total += levelBonus;
      breakdown.push(`Treino/Prof ${formatSigned(levelBonus)}`);
    }

    if (skill.isSavingThrow && saveBonusExtra !== 0) {
      total += saveBonusExtra;
      breakdown.push(`Efeitos ${formatSigned(saveBonusExtra)}`);
    }
    if (skill.isSavingThrow && saveDiceBonuses.length > 0) {
      diceBonuses.push(...saveDiceBonuses);
      breakdown.push(`Dados ${saveDiceBonuses.map((d) => `+${d}`).join(' ')}`);
    }

    for (const m of activeModifiers) {
      if (m.target === 'skill' && (!m.targetId || m.targetId === skill.id)) {
        if (m.value !== 0) {
          total += m.value;
          breakdown.push(`${m.label} ${formatSigned(m.value)}`);
        }
        const cleanDice = m.diceBonus?.trim();
        if (cleanDice && /\d*d\d+/i.test(cleanDice)) {
          diceBonuses.push(cleanDice);
          breakdown.push(`${m.label} +${cleanDice}`);
        }
      }
    }

    skills[skill.id] = {
      total,
      trained,
      isSavingThrow: Boolean(skill.isSavingThrow),
      attrShort: attrDef?.shortName ?? 'ATR',
      diceBonuses,
      breakdown,
    };
  }

  const perceptionTotal = skills['percepcao']?.total ?? attributes['sab']?.mod ?? 0;
  const passivePerception = 10 + perceptionTotal;

  let totalWeight = 0;
  for (const inv of character.inventory) {
    const item = compendium.items.find((i) => i.id === inv.itemId);
    if (item) totalWeight += item.weight * inv.quantity;
  }

  return {
    attributes,
    proficiencyBonus: profBonus,
    halfLevelBonus: halfLevel,
    maxHp,
    maxHpBreakdown,
    maxMp,
    maxMpBreakdown,
    defense,
    defenseBreakdown,
    initiative,
    initiativeBreakdown,
    speed,
    speedBreakdown,
    passivePerception,
    attackBonusExtra,
    attackBreakdown,
    attackDiceBonuses,
    damageBonusExtra,
    damageBreakdown,
    damageDiceBonuses,
    saveDiceBonuses,
    skills,
    totalWeight: Math.round(totalWeight * 10) / 10,
  };
}

/**
 * Synchronizes every character's derived Defense (CA), MaxHP, MaxMP, and Speed onto their
 * Character record, MapTokens, and Combatants.
 * When `prevCamp` is provided, automatically adjusts current HP/MP when conditions/items
 * increase MaxHP/MaxMP (+delta when gained, clamped down to new max when lost).
 */
export function syncCampaignDerivedCharacterStats(
  camp: CampaignState,
  prevCamp?: CampaignState
): CampaignState {
  if (!camp || !Array.isArray(camp.characters) || !camp.compendium) return camp;
  const statsByCharId = new Map<string, ComputedCharacterStats>();
  for (const ch of camp.characters) {
    statsByCharId.set(ch.id, computeCharacterStats(ch, camp));
  }

  const nextCharacters = camp.characters.map((ch) => {
    const nextStats = statsByCharId.get(ch.id);
    if (!nextStats) return ch;
    let nextHp = ch.hp;
    let nextMp = ch.mp;
    if (prevCamp && Array.isArray(prevCamp.characters) && prevCamp.compendium) {
      const prevCh = prevCamp.characters.find((p) => p.id === ch.id);
      if (prevCh) {
        const prevStats = computeCharacterStats(prevCh, prevCamp);
        const hpMaxDelta = nextStats.maxHp - prevStats.maxHp;
        const mpMaxDelta = nextStats.maxMp - prevStats.maxMp;
        if (hpMaxDelta > 0 && ch.hp === prevCh.hp && ch.hp > 0) {
          nextHp = Math.min(nextStats.maxHp, ch.hp + hpMaxDelta);
        } else if (hpMaxDelta < 0 && nextHp > nextStats.maxHp) {
          nextHp = nextStats.maxHp;
        }
        if (mpMaxDelta > 0 && ch.mp === prevCh.mp) {
          nextMp = Math.min(nextStats.maxMp, ch.mp + mpMaxDelta);
        } else if (mpMaxDelta < 0 && nextMp > nextStats.maxMp) {
          nextMp = nextStats.maxMp;
        }
      }
    }
    // Always clamp HP/MP within [0, max] (Temp HP is tracked separately in tempHp)
    nextHp = Math.max(0, Math.min(nextStats.maxHp, nextHp));
    nextMp = Math.max(0, Math.min(nextStats.maxMp, nextMp));
    if (nextHp !== ch.hp || nextMp !== ch.mp) {
      return { ...ch, hp: nextHp, mp: nextMp };
    }
    return ch;
  });

  const baseMaps = (camp.maps || []).map((m) => ({
    ...m,
    tokens: (m.tokens || []).map((tok) => {
      if (tok.type !== 'character' || !tok.referenceId) return tok;
      const st = statsByCharId.get(tok.referenceId);
      const ch = nextCharacters.find((c) => c.id === tok.referenceId);
      if (!st || !ch) return tok;
      return {
        ...tok,
        hp: ch.hp,
        maxHp: st.maxHp,
        defense: st.defense,
        activeConditionIds: ch.activeConditionIds,
      };
    }),
  }));

  // D&D 5e Grapple Invariant: automatically break grapple if target no longer has cond-agarrado,
  // or if the grappler is gone, at 0 PV, incapacitated, or no longer adjacent (e.g. Shove/Teleport/moved away)
  const sqM = camp.settings?.gridSquareMeters || 1.5;
  const freedGrappledCharIds = new Set<string>();
  const nextMaps = baseMaps.map((m) => {
    const tokensById = new Map(m.tokens.map((t) => [t.id, t]));
    let mapChanged = false;
    const updatedTokens = m.tokens.map((tok) => {
      if (!tok.grappledByTokenId) return tok;
      const hasGrappledCond = (tok.activeConditionIds || []).includes('cond-agarrado');
      const grappler = tokensById.get(tok.grappledByTokenId);
      const grapplerChar =
        grappler?.type === 'character' && grappler.referenceId
          ? nextCharacters.find((c) => c.id === grappler.referenceId)
          : undefined;
      const grapplerStillHolding = Boolean(
        hasGrappledCond &&
          grappler &&
          grappler.hp > 0 &&
          !isTokenIncapacitated(grappler, grapplerChar, camp.compendium.conditions) &&
          getGridSpanDistance(
            tok.x,
            tok.y,
            tok.size || 1,
            grappler.x,
            grappler.y,
            grappler.size || 1,
            sqM
          ).squares <= 1
      );
      if (grapplerStillHolding) return tok;
      mapChanged = true;
      if (tok.type === 'character' && tok.referenceId) {
        freedGrappledCharIds.add(tok.referenceId);
      }
      return {
        ...tok,
        grappledByTokenId: null,
        activeConditionIds: (tok.activeConditionIds || []).filter((cid) => cid !== 'cond-agarrado'),
      };
    });
    return mapChanged ? { ...m, tokens: updatedTokens } : m;
  });

  const finalCharacters =
    freedGrappledCharIds.size > 0
      ? nextCharacters.map((c) =>
          freedGrappledCharIds.has(c.id)
            ? { ...c, activeConditionIds: c.activeConditionIds.filter((cid) => cid !== 'cond-agarrado') }
            : c
        )
      : nextCharacters;

  const allNextTokensById = new Map<string, MapToken>();
  nextMaps.forEach((m) => {
    (m.tokens || []).forEach((t) => allNextTokensById.set(t.id, t));
  });
  const allPrevTokensById = new Map<string, MapToken>();
  (prevCamp?.maps || []).forEach((m) => {
    (m.tokens || []).forEach((t) => allPrevTokensById.set(t.id, t));
  });
  const condByNormalizedName = new Map<string, string>();
  (camp.compendium.conditions || []).forEach((cd) => {
    condByNormalizedName.set(cd.name.trim().toLowerCase(), cd.id);
  });

  const nextCombat = camp.combat
    ? {
        ...camp.combat,
        combatants: (camp.combat.combatants || []).map((cb) => {
          let nextCb = cb;
          const matchedChar =
            cb.type === 'character' && cb.referenceId
              ? finalCharacters.find((c) => c.id === cb.referenceId)
              : undefined;
          const matchedTok = cb.tokenId ? allNextTokensById.get(cb.tokenId) : undefined;

          if (matchedChar && cb.referenceId) {
            const st = statsByCharId.get(cb.referenceId);
            if (st) {
              nextCb = {
                ...nextCb,
                hp: matchedChar.hp,
                maxHp: st.maxHp,
                defense: st.defense,
                speedMeters: st.speed,
              };
            }
          }

          // Keep timed combatant effects strictly synced with the token/character's REAL active conditions:
          // if the GM or a rule removes a condition (e.g. Voando), its timed badge is purged immediately!
          if (nextCb.effects && nextCb.effects.length > 0 && (matchedChar || matchedTok)) {
            const realCondIds = matchedChar
              ? matchedChar.activeConditionIds || []
              : matchedTok?.activeConditionIds || [];
            const realCondSet = new Set(realCondIds);
            const filteredEffects = nextCb.effects.filter((ef) => {
              if (ef.conditionId) {
                return realCondSet.has(ef.conditionId);
              }
              // Legacy timed effect without conditionId: if its label matches a real compendium condition, require it to still be active
              const matchedCondId = condByNormalizedName.get(ef.label.trim().toLowerCase());
              if (matchedCondId) {
                return realCondSet.has(matchedCondId);
              }
              return true;
            });
            if (filteredEffects.length !== nextCb.effects.length) {
              nextCb = { ...nextCb, effects: filteredEffects };
            }
          }

          // Sync mid-turn Extra Actions / Extra Bonus Actions when conditions are gained or removed
          // Never clamp away unrelated temporary grants (e.g. Fighter Action Surge or GM +1 Action)!
          if (prevCamp && prevCamp.combat?.active) {
            const curCondIds =
              cb.type === 'character' && cb.referenceId
                ? finalCharacters.find((c) => c.id === cb.referenceId)?.activeConditionIds || []
                : (cb.tokenId ? allNextTokensById.get(cb.tokenId)?.activeConditionIds : undefined) || [];
            const prevCondIds =
              cb.type === 'character' && cb.referenceId
                ? prevCamp.characters.find((c) => c.id === cb.referenceId)?.activeConditionIds || []
                : (cb.tokenId ? allPrevTokensById.get(cb.tokenId)?.activeConditionIds : undefined) || [];

            const curExtra = getConditionExtraEconomy(curCondIds, camp);
            const prevExtra = getConditionExtraEconomy(prevCondIds, prevCamp);
            const actDelta = curExtra.extraActions - prevExtra.extraActions;
            const bonDelta = curExtra.extraBonusActions - prevExtra.extraBonusActions;

            if (actDelta !== 0 || bonDelta !== 0) {
              const curActs = getCombatantActionsRemaining(nextCb);
              const curBon = getCombatantBonusActionsRemaining(nextCb);
              const nextActs = actDelta !== 0 ? Math.max(0, curActs + actDelta) : curActs;
              const nextBon = bonDelta !== 0 ? Math.max(0, curBon + bonDelta) : curBon;
              nextCb = {
                ...nextCb,
                actionsRemaining: nextActs,
                actionAvailable: nextActs > 0,
                bonusActionsRemaining: nextBon,
                bonusActionAvailable: nextBon > 0,
              };
            }
          }

          return nextCb;
        }),
      }
    : camp.combat;

  return {
    ...camp,
    characters: finalCharacters,
    maps: nextMaps,
    combat: nextCombat,
  };
}

export type RollAdvantageMode = 'normal' | 'advantage' | 'disadvantage';

export interface RollExecutionResult {
  total: number;
  individualRolls: string[];
  rolledDice: RolledDieVisual[];
  d20Natural?: number;
  isCrit: boolean;
  isFumble: boolean;
  resolvedFormula: string;
  details: string;
}

export function evaluateFormula(
  rawFormula: string,
  stats?: ComputedCharacterStats,
  character?: Character,
  options?: {
    advantageMode?: RollAdvantageMode;
    extraFlatBonus?: number;
    extraDiceBonuses?: string[];
    isCritDamage?: boolean;
    critRange?: number;
    critMultiplier?: number;
  }
): RollExecutionResult {
  let formula = rawFormula.trim().toLowerCase();

  // Replace dynamic variables (supports both @for/@prof and intuitive FOR/DES/PROF)
  formula = formula.replace(FORMULA_VAR_REGEX, (_, prefix: string, token: string) => {
    const key = token.toLowerCase();
    if (key === 'prof') {
      const val = stats ? stats.proficiencyBonus + stats.halfLevelBonus : 0;
      return `${prefix}${val}`;
    }
    if (key === 'nivel') {
      return `${prefix}${character?.level ?? 0}`;
    }
    if (key === 'metade_nivel') {
      return `${prefix}${character ? Math.floor(character.level / 2) : 0}`;
    }
    if (stats && key in stats.attributes) {
      return `${prefix}${stats.attributes[key].mod}`;
    }
    return `${prefix}0`;
  });
  // Fallback replace any other custom @ vars with 0
  formula = formula.replace(/@[a-z_]+/g, '0');

  if (options?.extraFlatBonus && options.extraFlatBonus !== 0) {
    formula += options.extraFlatBonus > 0 ? `+${options.extraFlatBonus}` : `${options.extraFlatBonus}`;
  }
  if (options?.extraDiceBonuses && options.extraDiceBonuses.length > 0) {
    for (const db of options.extraDiceBonuses) {
      formula += `+${db}`;
    }
  }

  // Normalize operators (e.g., "+ -2" -> "-2")
  formula = formula
    .replace(/\s+/g, '')
    .replace(/\+\-/g, '-')
    .replace(/\-\+/g, '-')
    .replace(/\-\-/g, '+')
    .replace(/\+\+/g, '+');

  // Tokenize into signed chunks
  const tokens = formula.match(/[+-]?[^+-]+/g) || ['1d20'];

  let total = 0;
  const individualRolls: string[] = [];
  const rolledDice: RolledDieVisual[] = [];
  const detailParts: string[] = [];
  let d20Natural: number | undefined = undefined;
  let isCrit = false;
  let isFumble = false;

  tokens.forEach((token, idx) => {
    const sign = token.startsWith('-') ? -1 : 1;
    const clean = token.replace(/^[+-]/, '');
    const diceMatch = clean.match(/^(\d*)d(\d+)$/);

    if (diceMatch) {
      let count = parseInt(diceMatch[1] || '1', 10);
      const sides = parseInt(diceMatch[2], 10);

      // Multiply dice on critical hit damage if requested (supports x2, x3 weapon critMultiplier!)
      if (options?.isCritDamage) {
        const mult = Math.max(2, Math.min(4, Math.floor(options.critMultiplier || 2)));
        count *= mult;
      }

      const critThreshold = Math.max(15, Math.min(20, Math.floor(options?.critRange || 20)));

      if (idx === 0 && sides === 20 && count === 1 && options?.advantageMode && options.advantageMode !== 'normal') {
        const r1 = Math.floor(Math.random() * 20) + 1;
        const r2 = Math.floor(Math.random() * 20) + 1;
        const isAdv = options.advantageMode === 'advantage';
        const chosen = isAdv ? Math.max(r1, r2) : Math.min(r1, r2);
        const r1Chosen = isAdv ? r1 >= r2 : r1 <= r2;
        d20Natural = chosen;
        if (chosen >= critThreshold) isCrit = true;
        if (chosen === 1) isFumble = true;
        total += sign * chosen;
        const fullLabel = isAdv ? 'Vantagem' : 'Desvantagem';
        rolledDice.push({
          sides: 20,
          value: r1,
          discarded: !r1Chosen,
          label: r1Chosen ? fullLabel : 'Descartado',
        });
        rolledDice.push({
          sides: 20,
          value: r2,
          discarded: r1Chosen,
          label: !r1Chosen ? fullLabel : 'Descartado',
        });
        const modeLabel = isAdv ? 'Vant' : 'Desv';
        individualRolls.push(`2d20(${modeLabel}): [${r1}, ${r2}] -> ${chosen}`);
        detailParts.push(`[${r1},${r2}→${chosen}]`);
      } else {
        const rolls: number[] = [];
        for (let i = 0; i < count; i++) {
          const val = Math.floor(Math.random() * sides) + 1;
          rolls.push(val);
          rolledDice.push({ sides, value: val });
        }
        const sum = rolls.reduce((a, b) => a + b, 0);
        if (idx === 0 && sides === 20 && count === 1) {
          d20Natural = rolls[0];
          if (rolls[0] >= critThreshold) isCrit = true;
          if (rolls[0] === 1) isFumble = true;
        }
        total += sign * sum;
        const signStr = sign < 0 ? '-' : idx > 0 ? '+' : '';
        individualRolls.push(`${signStr}${count}d${sides}: [${rolls.join(', ')}]`);
        detailParts.push(`${signStr}[${rolls.join('+')}]`);
      }
    } else {
      const num = parseInt(clean, 10);
      if (!isNaN(num)) {
        total += sign * num;
        if (num !== 0) {
          detailParts.push(sign * num >= 0 ? `+${num}` : `-${num}`);
        }
      }
    }
  });

  return {
    total,
    individualRolls,
    rolledDice,
    d20Natural,
    isCrit,
    isFumble,
    resolvedFormula: formula,
    details: detailParts.join(' ').replace(/^\+/, ''),
  };
}

/**
 * Ensures any imported or vault-restored Character JSON has complete defaults.
 */
export function normalizeHeroCharacter(
  raw: Partial<Character>,
  fallbackCampaign?: CampaignState
): Character {
  const id = raw.id || `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const vaultId = raw.vaultId || id;
  const fallbackAttrs: Record<string, number> = {};
  (fallbackCampaign?.compendium?.attributes || []).forEach((a) => {
    fallbackAttrs[a.id] = 10;
  });
  const attrs = { ...fallbackAttrs, ...(raw.attributes || {}) };

  const validRace = fallbackCampaign?.compendium?.races?.some((r) => r.id === raw.raceId)
    ? (raw.raceId as string)
    : fallbackCampaign?.compendium?.races?.[0]?.id || raw.raceId || '';
  const validClass = fallbackCampaign?.compendium?.classes?.some((c) => c.id === raw.classId)
    ? (raw.classId as string)
    : fallbackCampaign?.compendium?.classes?.[0]?.id || raw.classId || '';

  return {
    id,
    vaultId,
    lastSyncedAt: raw.lastSyncedAt || new Date().toISOString(),
    ownerPlayerId: raw.ownerPlayerId,
    playerName: raw.playerName || 'Aventureiro',
    playerColor: raw.playerColor || raw.tokenColor || '#38bdf8',
    tokenFrameStyle: raw.tokenFrameStyle || 'gold',
    diceSkin: raw.diceSkin || 'gold',
    themeMusicUrl: raw.themeMusicUrl,
    themeMusicTitle: raw.themeMusicTitle,
    name: raw.name?.trim() || 'Herói Sem Nome',
    raceId: validRace,
    classId: validClass,
    level: typeof raw.level === 'number' && raw.level >= 1 ? raw.level : 1,
    xp: typeof raw.xp === 'number' ? raw.xp : undefined,
    hasInspiration: raw.hasInspiration,
    inspirationPoints: typeof raw.inspirationPoints === 'number' ? raw.inspirationPoints : undefined,
    unspentAttributePoints:
      typeof raw.unspentAttributePoints === 'number' ? raw.unspentAttributePoints : undefined,
    paperdollArchetype: raw.paperdollArchetype,
    extraAttacksOverride:
      typeof raw.extraAttacksOverride === 'number' ? raw.extraAttacksOverride : undefined,
    damageResistances: Array.isArray(raw.damageResistances) ? raw.damageResistances : undefined,
    damageImmunities: Array.isArray(raw.damageImmunities) ? raw.damageImmunities : undefined,
    damageVulnerabilities: Array.isArray(raw.damageVulnerabilities)
      ? raw.damageVulnerabilities
      : undefined,
    attributes: attrs,
    trainedSkillIds: Array.isArray(raw.trainedSkillIds) ? raw.trainedSkillIds : [],
    favoriteSkillIds: Array.isArray(raw.favoriteSkillIds) ? raw.favoriteSkillIds : undefined,
    hp: typeof raw.hp === 'number' ? raw.hp : 12,
    maxHpOverride: raw.maxHpOverride,
    tempHp: typeof raw.tempHp === 'number' ? raw.tempHp : 0,
    mp: typeof raw.mp === 'number' ? raw.mp : 6,
    maxMpOverride: raw.maxMpOverride,
    defenseOverride: raw.defenseOverride,
    speedOverride: raw.speedOverride,
    customResourceValues: raw.customResourceValues,
    knownAbilityIds: Array.isArray(raw.knownAbilityIds) ? raw.knownAbilityIds : [],
    customAttacks: Array.isArray(raw.customAttacks) ? raw.customAttacks : [],
    customAbilities: Array.isArray(raw.customAbilities) ? raw.customAbilities : [],
    abilityUsesRemaining: raw.abilityUsesRemaining || {},
    resourceTrackers: Array.isArray(raw.resourceTrackers) ? raw.resourceTrackers : undefined,
    activeConditionIds: Array.isArray(raw.activeConditionIds) ? raw.activeConditionIds : [],
    inventory: Array.isArray(raw.inventory) ? raw.inventory : [],
    gold: typeof raw.gold === 'number' ? raw.gold : 0,
    portraitUrl: raw.portraitUrl || '',
    tokenColor: raw.tokenColor || raw.playerColor || '#38bdf8',
    forms: Array.isArray(raw.forms) ? raw.forms : undefined,
    activeFormId: raw.activeFormId ?? undefined,
    background: raw.background || '',
    notes: raw.notes || '',
    deathSaves: raw.deathSaves || { successes: 0, failures: 0 },
  };
}

/**
 * Extracts a normalized Character from either a raw Character JSON or a SavedHeroEntry envelope.
 */
export function parseHeroPayloadFromJson(
  parsed: unknown,
  fallbackCampaign?: CampaignState
): Character | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const candidate =
    obj.character && typeof obj.character === 'object'
      ? (obj.character as Partial<Character>)
      : (obj as Partial<Character>);
  if (!candidate.name || typeof candidate.name !== 'string') return null;
  return normalizeHeroCharacter(candidate, fallbackCampaign);
}

/**
 * Checks whether two square footprints [x..x+size-1, y..y+size-1] overlap on the grid.
 */
export function doSquaresOverlap(
  ax: number,
  ay: number,
  aSize: number,
  bx: number,
  by: number,
  bSize: number
): boolean {
  const sA = Math.max(1, aSize);
  const sB = Math.max(1, bSize);
  return ax < bx + sB && ax + sA > bx && ay < by + sB && ay + sA > by;
}

export function doesFootprintHitWall(
  terrainCells: Record<string, TerrainCellKind> | undefined,
  x: number,
  y: number,
  size: number,
  wallMeta?: Record<string, WallCellMeta>
): boolean {
  if (!terrainCells) return false;
  const s = Math.max(1, size);
  for (let dx = 0; dx < s; dx++) {
    for (let dy = 0; dy < s; dy++) {
      const cx = x + dx;
      const cy = y + dy;
      const key = `${cx},${cy}`;
      if (terrainCells[key] === 'wall') {
        const shape = wallMeta?.[key]?.shape || 'full';
        if (!isThinEdgeWall(shape)) {
          return true;
        }
      }
      // For multi-tile footprints (2x2+), forbid straddling across any thin wall seam between adjacent occupied cells!
      if (dx + 1 < s && doesStepCrossWall(terrainCells, wallMeta, cx, cy, cx + 1, cy)) {
        return true;
      }
      if (dy + 1 < s && doesStepCrossWall(terrainCells, wallMeta, cx, cy, cx, cy + 1)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns true if placing a square token of `size` at (x, y) collides with any existing token or wall cell.
 */
export function doesTokenCollideAt(
  tokens: MapToken[],
  x: number,
  y: number,
  size: number,
  ignoreTokenId?: string,
  includeHidden = true,
  terrainCells?: Record<string, TerrainCellKind>,
  wallMeta?: Record<string, WallCellMeta>
): boolean {
  const s = Math.max(1, size);
  if (doesFootprintHitWall(terrainCells, x, y, s, wallMeta)) {
    return true;
  }
  for (const other of tokens) {
    if (ignoreTokenId && other.id === ignoreTokenId) continue;
    if (!includeHidden && other.isHidden) continue;
    if (doSquaresOverlap(x, y, s, other.x, other.y, other.size || 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Clamps a square footprint to the map grid and finds the nearest non-overlapping free cell.
 */
export function findNearestFreeGridCell(
  map: Pick<TacticalMap, 'gridWidth' | 'gridHeight' | 'tokens'> & {
    terrainCells?: Record<string, TerrainCellKind>;
    wallMeta?: Record<string, WallCellMeta>;
    gmMarkers?: TacticalMap['gmMarkers'];
  },
  desiredX: number,
  desiredY: number,
  size = 1,
  ignoreTokenId?: string,
  includeHidden = true
): { x: number; y: number } {
  const s = Math.max(1, size);
  const maxX = Math.max(0, map.gridWidth - s);
  const maxY = Math.max(0, map.gridHeight - s);
  const startX = Math.max(0, Math.min(maxX, Math.round(desiredX)));
  const startY = Math.max(0, Math.min(maxY, Math.round(desiredY)));
  const effTerrain = getEffectiveTerrainCells(map);
  const effWallMeta = getEffectiveWallMeta(map);

  if (
    !doesTokenCollideAt(
      map.tokens,
      startX,
      startY,
      s,
      ignoreTokenId,
      includeHidden,
      effTerrain,
      effWallMeta
    )
  ) {
    return { x: startX, y: startY };
  }

  const maxRadius = Math.max(map.gridWidth, map.gridHeight);
  for (let r = 1; r <= maxRadius; r++) {
    const candidates: Array<{ x: number; y: number; distSq: number }> = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = startX + dx;
        const cy = startY + dy;
        if (cx < 0 || cy < 0 || cx > maxX || cy > maxY) continue;
        if (
          !doesTokenCollideAt(
            map.tokens,
            cx,
            cy,
            s,
            ignoreTokenId,
            includeHidden,
            effTerrain,
            effWallMeta
          )
        ) {
          candidates.push({ x: cx, y: cy, distSq: dx * dx + dy * dy });
        }
      }
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.distSq - b.distSq);
      return { x: candidates[0].x, y: candidates[0].y };
    }
  }

  return { x: startX, y: startY };
}

/**
 * Resolves token movement target during grid dragging, strictly blocking walls and closed/locked doors
 * along the entire drag path (no teleporting through walls or closed doors!) while allowing smooth sliding along walls.
 */
export function resolveDragTargetCell(
  map: Pick<TacticalMap, 'gridWidth' | 'gridHeight' | 'tokens'> & {
    terrainCells?: Record<string, TerrainCellKind>;
    wallMeta?: Record<string, WallCellMeta>;
    gmMarkers?: TacticalMap['gmMarkers'];
  },
  movingToken: MapToken,
  desiredX: number,
  desiredY: number,
  includeHidden = true,
  ignoreWalls = false
): { x: number; y: number } {
  const s = Math.max(1, movingToken.size || 1);
  const maxX = Math.max(0, map.gridWidth - s);
  const maxY = Math.max(0, map.gridHeight - s);
  const clampedX = Math.max(0, Math.min(maxX, desiredX));
  const clampedY = Math.max(0, Math.min(maxY, desiredY));
  const effTerrain = ignoreWalls ? undefined : getEffectiveTerrainCells(map);
  const effWallMeta = ignoreWalls ? undefined : getEffectiveWallMeta(map);

  const isFootprintStepBlocked = (fromX: number, fromY: number, toX: number, toY: number): boolean => {
    if (!effTerrain) return false;
    for (let dx = 0; dx < s; dx++) {
      for (let dy = 0; dy < s; dy++) {
        if (doesStepCrossWall(effTerrain, effWallMeta, fromX + dx, fromY + dy, toX + dx, toY + dy)) {
          return true;
        }
      }
    }
    return false;
  };

  // Walk step-by-step from (movingToken.x, movingToken.y) toward (tx, ty), stopping before any wall/closed door.
  const walkUntilWall = (tx: number, ty: number): { x: number; y: number; hitWall: boolean } => {
    const path = traceGridLine(movingToken.x, movingToken.y, tx, ty);
    let lastValidX = movingToken.x;
    let lastValidY = movingToken.y;
    let hitWall = false;

    for (let i = 1; i < path.length; i++) {
      const step = path[i];
      if (isFootprintStepBlocked(lastValidX, lastValidY, step.x, step.y)) {
        hitWall = true;
        break;
      }
      lastValidX = step.x;
      lastValidY = step.y;
    }

    // Backtrack if final cell collides with another token
    if (
      doesTokenCollideAt(
        map.tokens,
        lastValidX,
        lastValidY,
        s,
        movingToken.id,
        includeHidden,
        effTerrain,
        effWallMeta
      )
    ) {
      for (let i = path.length - 1; i >= 0; i--) {
        const c = path[i];
        if (
          Math.abs(c.x - movingToken.x) <= Math.abs(lastValidX - movingToken.x) &&
          Math.abs(c.y - movingToken.y) <= Math.abs(lastValidY - movingToken.y) &&
          !doesTokenCollideAt(
            map.tokens,
            c.x,
            c.y,
            s,
            movingToken.id,
            includeHidden,
            effTerrain,
            effWallMeta
          )
        ) {
          return { x: c.x, y: c.y, hitWall };
        }
      }
      return { x: movingToken.x, y: movingToken.y, hitWall: true };
    }

    return { x: lastValidX, y: lastValidY, hitWall };
  };

  const direct = walkUntilWall(clampedX, clampedY);
  if (!direct.hitWall && (direct.x !== movingToken.x || direct.y !== movingToken.y)) {
    return { x: direct.x, y: direct.y };
  }

  // Smooth wall-sliding: try sliding along X or Y axis individually without crossing any wall
  const slideX = clampedX !== movingToken.x ? walkUntilWall(clampedX, movingToken.y) : null;
  const slideY = clampedY !== movingToken.y ? walkUntilWall(movingToken.x, clampedY) : null;

  const candidates = [direct, slideX, slideY].filter(
    (c): c is { x: number; y: number; hitWall: boolean } =>
      Boolean(c && (c.x !== movingToken.x || c.y !== movingToken.y))
  );
  if (candidates.length > 0) {
    // Pick candidate closest to desired cursor cell
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - clampedX, a.y - clampedY) - Math.hypot(b.x - clampedX, b.y - clampedY)
    );
    return { x: candidates[0].x, y: candidates[0].y };
  }

  return { x: movingToken.x, y: movingToken.y };
}

/**
 * Bresenham grid raycast returning all integer grid cells from (x0, y0) to (x1, y1) inclusive.
 */
export function traceGridLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  let cx = Math.round(x0);
  let cy = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - cx);
  const dy = Math.abs(ty - cy);
  const sx = cx < tx ? 1 : -1;
  const sy = cy < ty ? 1 : -1;
  let err = dx - dy;

  for (let guard = 0; guard < 256; guard++) {
    cells.push({ x: cx, y: cy });
    if (cx === tx && cy === ty) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
  return cells;
}

export interface LineOfSightCoverResult {
  blockedByWall: boolean;
  coverAcBonus: 0 | 2 | 5;
  coverLabel?: string;
}

/**
 * Returns true if there is an unobstructed grid line between (x0, y0) and (x1, y1)
 * with no 'wall' (including closed/locked doors) on intermediate cells OR diagonal corner-pinches.
 */
export function hasGridCellLineOfSight(
  terrain: Record<string, TerrainCellKind> | undefined,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): boolean {
  if (!terrain) return true;
  const line = traceGridLine(x0, y0, x1, y1);
  for (let i = 1; i < line.length; i++) {
    const prev = line[i - 1];
    const curr = line[i];
    // Diagonal wall pinch: two walls sealing the corner between prev and curr
    if (curr.x !== prev.x && curr.y !== prev.y) {
      if (
        terrain[`${curr.x},${prev.y}`] === 'wall' &&
        terrain[`${prev.x},${curr.y}`] === 'wall'
      ) {
        return false;
      }
    }
    const isEndpoint = i === line.length - 1;
    if (!isEndpoint && terrain[`${curr.x},${curr.y}`] === 'wall') {
      return false;
    }
  }
  return true;
}

/**
 * Evaluates Line of Sight (Walls & Closed Doors block attacks, including sealed diagonal corners)
 * and D&D 5e Cover (+2 Half / +5 Three-Quarters AC).
 */
export function evaluateLineOfSightAndCover(
  map:
    | (Pick<TacticalMap, 'tokens'> & {
        terrainCells?: Record<string, TerrainCellKind>;
        wallMeta?: Record<string, WallCellMeta>;
        gmMarkers?: TacticalMap['gmMarkers'];
      })
    | undefined,
  attackerToken: MapToken | undefined,
  defenderToken: MapToken | undefined,
  isRanged: boolean
): LineOfSightCoverResult {
  if (!map || !attackerToken || !defenderToken || attackerToken.id === defenderToken.id) {
    return { blockedByWall: false, coverAcBonus: 0 };
  }
  const terrain = getEffectiveTerrainCells(map);
  const wallMeta = getEffectiveWallMeta(map);
  const axCenter = attackerToken.x + (attackerToken.size || 1) / 2;
  const ayCenter = attackerToken.y + (attackerToken.size || 1) / 2;
  const bxCenter = defenderToken.x + (defenderToken.size || 1) / 2;
  const byCenter = defenderToken.y + (defenderToken.size || 1) / 2;

  if (!hasContinuousWallLineOfSight(terrain, wallMeta, axCenter, ayCenter, bxCenter, byCenter)) {
    return {
      blockedByWall: true,
      coverAcBonus: 0,
      coverLabel: 'Sem Linha de Visão (Parede)',
    };
  }

  const ax = attackerToken.x + Math.floor((attackerToken.size || 1) / 2);
  const ay = attackerToken.y + Math.floor((attackerToken.size || 1) / 2);
  const bx = defenderToken.x + Math.floor((defenderToken.size || 1) / 2);
  const by = defenderToken.y + Math.floor((defenderToken.size || 1) / 2);

  const line = traceGridLine(ax, ay, bx, by);
  let terrainCoverUnits = 0;
  let creatureCoverUnits = 0;
  const bothHighAirborne =
    (attackerToken.elevationMeters || 0) >= 3 && (defenderToken.elevationMeters || 0) >= 3;

  for (let i = 0; i < line.length; i++) {
    const cell = line[i];
    const insideAttacker = doSquaresOverlap(
      cell.x,
      cell.y,
      1,
      attackerToken.x,
      attackerToken.y,
      attackerToken.size || 1
    );
    const insideDefender = doSquaresOverlap(
      cell.x,
      cell.y,
      1,
      defenderToken.x,
      defenderToken.y,
      defenderToken.size || 1
    );
    if (insideAttacker || insideDefender) continue;

    const cellTerrain = terrain[`${cell.x},${cell.y}`];
    if (cellTerrain === 'cover' && !bothHighAirborne) {
      terrainCoverUnits += 1;
    }
    if (isRanged) {
      const blockingCreature = map.tokens.some(
        (other) =>
          other.id !== attackerToken.id &&
          other.id !== defenderToken.id &&
          !other.isHidden &&
          other.hp > 0 &&
          Math.abs((other.elevationMeters || 0) - Math.min(attackerToken.elevationMeters || 0, defenderToken.elevationMeters || 0)) <= 1.5 &&
          doSquaresOverlap(cell.x, cell.y, 1, other.x, other.y, other.size || 1)
      );
      if (blockingCreature) {
        // D&D 5e: intervening creatures grant Half Cover (+2) max and never stack to +5 on their own
        creatureCoverUnits = 1;
      }
    }
  }

  const coverUnits = terrainCoverUnits + (terrainCoverUnits === 0 ? creatureCoverUnits : 0);

  if (coverUnits >= 2) {
    return {
      blockedByWall: false,
      coverAcBonus: 5,
      coverLabel: 'Cobertura Três-Quartos (+5 CA)',
    };
  }
  if (coverUnits === 1) {
    return {
      blockedByWall: false,
      coverAcBonus: 2,
      coverLabel: 'Meia Cobertura (+2 CA)',
    };
  }
  return { blockedByWall: false, coverAcBonus: 0 };
}

/**
 * Calculates total movement cost in meters along a grid path where 'difficult' cells cost 2x (3m per square).
 */
export function calculateMovementCostMeters(
  origin: { x: number; y: number },
  finalPos: { x: number; y: number },
  terrainCells: Record<string, TerrainCellKind> | undefined,
  sqMeters = 1.5,
  path?: Array<{ x: number; y: number }>,
  tokenSize = 1
): { meters: number; difficultSquares: number } {
  const cells =
    path && path.length > 1
      ? path.slice(1)
      : traceGridLine(origin.x, origin.y, finalPos.x, finalPos.y).slice(1);

  if (cells.length === 0) return { meters: 0, difficultSquares: 0 };

  const sz = Math.max(1, tokenSize || 1);
  let totalMeters = 0;
  let difficultSquares = 0;
  let prev = origin;

  for (const step of cells) {
    const stepSq = Math.max(Math.abs(step.x - prev.x), Math.abs(step.y - prev.y));
    if (stepSq <= 0) continue;
    let isDiff = false;
    if (terrainCells) {
      for (let dx = 0; dx < sz && !isDiff; dx++) {
        for (let dy = 0; dy < sz && !isDiff; dy++) {
          if (terrainCells[`${step.x + dx},${step.y + dy}`] === 'difficult') {
            isDiff = true;
          }
        }
      }
    }
    if (isDiff) {
      difficultSquares += stepSq;
      totalMeters += stepSq * sqMeters * 2;
    } else {
      totalMeters += stepSq * sqMeters;
    }
    prev = step;
  }

  return {
    meters: Math.round(totalMeters * 10) / 10,
    difficultSquares,
  };
}

/**
 * Returns all map tokens inside an AoE Template (Sphere, Cube, Cone, Line).
 * Tests full footprint of multi-tile tokens (2x2+), aligns cone to 60° visual preview,
 * and respects wall Line-of-Sight when map terrain/walls are provided.
 */
export function getTokensInsideTemplate(
  map: Pick<TacticalMap, 'tokens'> & {
    terrainCells?: Record<string, TerrainCellKind>;
    wallMeta?: Record<string, WallCellMeta>;
    gmMarkers?: TacticalMap['gmMarkers'];
  },
  template: AoETemplate
): MapToken[] {
  const tx = template.x + 0.5;
  const ty = template.y + 0.5;
  const rad = Math.max(0.5, template.radiusSquares);
  const angleRad = ((template.angleDeg || 0) * Math.PI) / 180;
  const dirX = Math.cos(angleRad);
  const dirY = Math.sin(angleRad);
  const effTerrain = map.terrainCells || map.gmMarkers ? getEffectiveTerrainCells(map) : undefined;
  const effWallMeta = map.wallMeta || map.gmMarkers ? getEffectiveWallMeta(map) : undefined;

  const isCellInsideShape = (cx: number, cy: number): boolean => {
    const dx = cx - tx;
    const dy = cy - ty;
    const dist = Math.hypot(dx, dy);

    if (template.shape === 'sphere') {
      return dist <= rad + 0.45;
    }
    if (template.shape === 'cube') {
      return Math.abs(dx) <= rad + 0.45 && Math.abs(dy) <= rad + 0.45;
    }
    if (template.shape === 'cone') {
      if (dist > rad + 0.45) return false;
      if (dist < 0.35) return true;
      const dot = (dx * dirX + dy * dirY) / dist;
      return dot >= Math.cos((30 * Math.PI) / 180);
    }
    if (template.shape === 'line') {
      const length = rad * 2;
      const proj = dx * dirX + dy * dirY;
      if (proj < -0.25 || proj > length + 0.45) return false;
      const perp = Math.abs(dx * -dirY + dy * dirX);
      return perp <= 0.75 + 0.45;
    }
    return false;
  };

  return map.tokens.filter((tok) => {
    if (tok.hp <= 0) return false;
    const sz = Math.max(1, tok.size || 1);
    for (let dx = 0; dx < sz; dx++) {
      for (let dy = 0; dy < sz; dy++) {
        const cx = tok.x + dx + 0.5;
        const cy = tok.y + dy + 0.5;
        if (!isCellInsideShape(cx, cy)) continue;
        if (
          effTerrain &&
          !hasContinuousWallLineOfSight(effTerrain, effWallMeta, tx, ty, cx, cy)
        ) {
          continue;
        }
        return true;
      }
    }
    return false;
  });
}

export function computeConcentrationDc(damageTaken: number): number {
  return Math.max(10, Math.floor(Math.abs(damageTaken) / 2));
}

export interface ElementalComboResult {
  triggered: boolean;
  comboName: string;
  affectedCells: Array<{ x: number; y: number }>;
  nextSurface: 'fire' | 'ice' | 'acid' | 'water';
  bonusDamageFormula: string;
  bonusDamageType: string;
  applyConditionId?: string;
  sfx: 'thunder' | 'frost' | 'fireball';
  vfxKind: 'lightning' | 'frost' | 'fireball';
}

/**
 * Baldur's Gate 3 / Divinity: Original Sin 2 style Elemental Surface Chain Reactions.
 * Flood-fills all 4-connected cells of the matching surface starting from seedCells.
 */
export function resolveElementalSurfaceCombo(
  surfaces: Record<string, 'fire' | 'ice' | 'acid' | 'water'> | undefined,
  seedCells: Array<{ x: number; y: number }>,
  damageType: string | undefined
): ElementalComboResult | null {
  if (!surfaces || seedCells.length === 0 || !damageType) return null;
  const dt = damageType
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const isFire = dt.includes('fogo') || dt.includes('chama');
  const isLightning = dt.includes('eletric') || dt.includes('relampago') || dt.includes('raio') || dt.includes('trov');
  const isIce = dt.includes('frio') || dt.includes('gelo') || dt.includes('gelid');
  if (!isFire && !isLightning && !isIce) return null;

  // Determine which surface reaction applies to any seed cell
  let targetSurface: 'water' | 'ice' | 'acid' | null = null;
  let comboConfig: Omit<ElementalComboResult, 'triggered' | 'affectedCells'> | null = null;

  for (const cell of seedCells) {
    const s = surfaces[`${cell.x},${cell.y}`];
    if (!s) continue;
    if (isLightning && s === 'water') {
      targetSurface = 'water';
      comboConfig = {
        comboName: '⚡ Tempestade na Poça (Água Eletrificada)',
        nextSurface: 'water',
        bonusDamageFormula: '2d6',
        bonusDamageType: 'Elétrico',
        applyConditionId: 'cond-atordoado',
        sfx: 'thunder',
        vfxKind: 'lightning',
      };
      break;
    }
    if (isIce && s === 'water') {
      targetSurface = 'water';
      comboConfig = {
        comboName: '❄️ Congelamento em Cadeia (Poça Congelada)',
        nextSurface: 'ice',
        bonusDamageFormula: '1d6',
        bonusDamageType: 'Frio',
        applyConditionId: 'cond-caido',
        sfx: 'frost',
        vfxKind: 'frost',
      };
      break;
    }
    if (isFire && s === 'ice') {
      targetSurface = 'ice';
      comboConfig = {
        comboName: '💨 Explosão de Vapor (Degelo Súbito)',
        nextSurface: 'water',
        bonusDamageFormula: '1d4',
        bonusDamageType: 'Fogo',
        sfx: 'fireball',
        vfxKind: 'fireball',
      };
      break;
    }
    if (isFire && s === 'acid') {
      targetSurface = 'acid';
      comboConfig = {
        comboName: '💥 Detonação Tóxica (Ácido Inflamado)',
        nextSurface: 'fire',
        bonusDamageFormula: '2d6',
        bonusDamageType: 'Fogo',
        sfx: 'fireball',
        vfxKind: 'fireball',
      };
      break;
    }
  }

  if (!targetSurface || !comboConfig) return null;

  // 4-connected BFS flood-fill across connected puddle (capped at 120 cells for safety)
  const visited = new Set<string>();
  const queue: Array<{ x: number; y: number }> = [];
  const affectedCells: Array<{ x: number; y: number }> = [];

  for (const c of seedCells) {
    const k = `${c.x},${c.y}`;
    if (surfaces[k] === targetSurface && !visited.has(k)) {
      visited.add(k);
      queue.push(c);
    }
  }

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (queue.length > 0 && affectedCells.length < 120) {
    const cur = queue.shift()!;
    affectedCells.push(cur);
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = `${nx},${ny}`;
      if (!visited.has(nk) && surfaces[nk] === targetSurface) {
        visited.add(nk);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  if (affectedCells.length === 0) return null;
  return {
    triggered: true,
    affectedCells,
    ...comboConfig,
  };
}

function normalizeDamageKey(val: string): string {
  const clean = val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  // Unify common Portuguese synonyms (Contusão <-> Concussão, Gelo <-> Frio, Elétrico <-> Relâmpago)
  if (clean === 'contusao' || clean === 'impacto' || clean === 'esmagamento') return 'concussao';
  if (clean === 'frio') return 'gelo';
  if (clean === 'relampago' || clean === 'raio') return 'eletrico';
  if (clean === 'perfurante') return 'perfuracao';
  if (clean === 'cortante') return 'corte';
  return clean;
}

export function isHeroFactionToken(tok: Pick<MapToken, 'type' | 'controlledByCharacterId'>): boolean {
  return tok.type === 'character' || Boolean(tok.controlledByCharacterId);
}

export function getTokenFaction(
  tok: MapToken,
  npcs?: Array<{ id: string; disposition?: string }>
): 'ally' | 'enemy' | 'neutral' {
  if (tok.faction === 'ally' || tok.faction === 'enemy' || tok.faction === 'neutral') {
    return tok.faction;
  }
  if (tok.type === 'character' || Boolean(tok.controlledByCharacterId)) {
    return 'ally';
  }
  if (tok.type === 'monster') {
    return 'enemy';
  }
  if (tok.type === 'npc') {
    const npc = tok.referenceId && npcs ? npcs.find((n) => n.id === tok.referenceId) : undefined;
    if (npc?.disposition === 'Hostil') return 'enemy';
    if (npc?.disposition === 'Aliado') return 'ally';
    return 'neutral';
  }
  return 'neutral';
}

export function areTokensAllied(
  a: MapToken,
  b: MapToken,
  npcs?: Array<{ id: string; disposition?: string }>
): boolean {
  const fa = getTokenFaction(a, npcs);
  const fb = getTokenFaction(b, npcs);
  if (fa === 'neutral' || fb === 'neutral') return false;
  return fa === fb;
}

export function isTokenHostileTo(
  a: MapToken,
  b: MapToken,
  npcs?: Array<{ id: string; disposition?: string }>
): boolean {
  const fa = getTokenFaction(a, npcs);
  const fb = getTokenFaction(b, npcs);
  return (fa === 'ally' && fb === 'enemy') || (fa === 'enemy' && fb === 'ally');
}

export function isTokenIncapacitated(
  token: MapToken,
  char?: Character,
  compendiumConditions?: ConditionDef[]
): boolean {
  if (token.hp <= 0) return true;
  const conds = new Set([...(token.activeConditionIds || []), ...(char?.activeConditionIds || [])]);
  if (
    conds.has('cond-atordoado') ||
    conds.has('cond-paralisado') ||
    conds.has('cond-inconsciente') ||
    conds.has('cond-petrificado')
  ) {
    return true;
  }
  if (compendiumConditions && compendiumConditions.length > 0) {
    for (const cid of conds) {
      const def = compendiumConditions.find((c) => c.id === cid);
      if (def && /paralisad|atordoad|petrificad|inconscient|incapacitad/i.test(def.name)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Official D&D 5e rule: checks if any living, visible, conscious hostile enemy is within 1.5m (1 square)
 * AND has clear Line of Sight (not behind a wall or closed door).
 */
export function hasAdjacentHostileEnemy(
  map:
    | (Pick<TacticalMap, 'tokens'> & {
        terrainCells?: Record<string, TerrainCellKind>;
        gmMarkers?: TacticalMap['gmMarkers'];
      })
    | undefined,
  attackerToken: MapToken | undefined,
  sqMeters = 1.5,
  characters?: Character[],
  npcs?: Array<{ id: string; disposition?: string }>
): MapToken | null {
  if (!map || !attackerToken) return null;
  for (const other of map.tokens) {
    if (other.id === attackerToken.id || other.isHidden) continue;
    if (!isTokenHostileTo(attackerToken, other, npcs)) continue;
    const otherChar =
      other.type === 'character' && other.referenceId
        ? characters?.find((c) => c.id === other.referenceId)
        : undefined;
    if (isTokenIncapacitated(other, otherChar)) continue;
    const dist3D = getToken3DDistance(attackerToken, other, sqMeters);
    if (dist3D.squares3D <= 1) {
      if (evaluateLineOfSightAndCover(map, attackerToken, other, false).blockedByWall) continue;
      return other;
    }
  }
  return null;
}

export function getEffectiveFlankingMode(
  settings?: Pick<CampaignState['settings'], 'enableFlanking' | 'flankingMode'>
): 'off' | 'advantage' | 'plus2' {
  if (settings?.flankingMode) return settings.flankingMode;
  return settings?.enableFlanking === false ? 'off' : 'advantage';
}

export function getToken3DDistance(
  a: Pick<MapToken, 'x' | 'y' | 'size' | 'elevationMeters'>,
  b: Pick<MapToken, 'x' | 'y' | 'size' | 'elevationMeters'>,
  gridSquareMeters = 1.5
): {
  horizontalSquares: number;
  horizontalMeters: number;
  verticalMeters: number;
  squares3D: number;
  meters3D: number;
} {
  const horiz = getGridSpanDistance(
    a.x,
    a.y,
    a.size || 1,
    b.x,
    b.y,
    b.size || 1,
    gridSquareMeters
  );
  const verticalMeters = Math.round(
    Math.abs((a.elevationMeters || 0) - (b.elevationMeters || 0)) * 10
  ) / 10;
  const verticalSquares = Math.ceil(verticalMeters / Math.max(0.5, gridSquareMeters));
  const squares3D = Math.max(horiz.squares, verticalSquares);
  const meters3D =
    verticalMeters <= 0
      ? horiz.meters
      : Math.round(Math.hypot(horiz.meters, verticalMeters) * 10) / 10;
  return {
    horizontalSquares: horiz.squares,
    horizontalMeters: horiz.meters,
    verticalMeters,
    squares3D,
    meters3D,
  };
}

export function getTokenPassivePerception(
  tok: MapToken,
  campaign: Pick<CampaignState, 'characters' | 'compendium' | 'npcs' | 'settings'>
): number {
  if (tok.type === 'character' && tok.referenceId) {
    const ch = campaign.characters.find((c) => c.id === tok.referenceId);
    if (ch) {
      const st = computeCharacterStats(ch, campaign as CampaignState);
      return 10 + (st.skills['percepcao']?.total ?? st.attributes['sab']?.mod ?? 0);
    }
  }
  if (tok.type === 'monster' && tok.referenceId) {
    const mon = campaign.compendium.monsters.find((m) => m.id === tok.referenceId);
    const wis = mon?.attributes?.sab ?? mon?.attributes?.SAB ?? 10;
    return 10 + Math.floor((wis - 10) / 2);
  }
  if (tok.type === 'npc' && tok.referenceId) {
    const npc = campaign.npcs.find((n) => n.id === tok.referenceId);
    const wis = npc?.attributes?.sab ?? npc?.attributes?.SAB ?? 10;
    return 10 + Math.floor((wis - 10) / 2);
  }
  return 10;
}

export function doesObserverDetectStealthedToken(
  observer: MapToken,
  stealthedToken: MapToken,
  campaign: Pick<CampaignState, 'characters' | 'compendium' | 'npcs' | 'settings'>
): boolean {
  if (stealthedToken.stealthTotal == null) return true;
  if (observer.id === stealthedToken.id) return true;
  if (areTokensAllied(observer, stealthedToken, campaign.npcs)) return true;
  return getTokenPassivePerception(observer, campaign) >= stealthedToken.stealthTotal;
}

/**
 * D&D 5e Sneak Attack helper: checks whether any conscious ally (other than attacker)
 * is within 1.5m (1 square, including 3D elevation) of the defender.
 */
export function findAdjacentConsciousAlly(
  map:
    | (Pick<TacticalMap, 'tokens'> & {
        terrainCells?: Record<string, TerrainCellKind>;
        gmMarkers?: TacticalMap['gmMarkers'];
      })
    | undefined,
  attackerToken: MapToken | undefined,
  defenderToken: MapToken | undefined,
  sqMeters = 1.5,
  characters?: Character[],
  npcs?: Array<{ id: string; disposition?: string }>
): MapToken | null {
  if (!map || !attackerToken || !defenderToken || attackerToken.id === defenderToken.id) {
    return null;
  }
  if (!isTokenHostileTo(attackerToken, defenderToken, npcs)) return null;

  for (const ally of map.tokens) {
    if (ally.id === attackerToken.id || ally.id === defenderToken.id || ally.isHidden) continue;
    if (!areTokensAllied(ally, attackerToken, npcs)) continue;
    const allyChar =
      ally.type === 'character' && ally.referenceId
        ? characters?.find((c) => c.id === ally.referenceId)
        : undefined;
    if (isTokenIncapacitated(ally, allyChar)) continue;

    const d3 = getToken3DDistance(ally, defenderToken, sqMeters);
    if (d3.squares3D > 1) continue;
    if (evaluateLineOfSightAndCover(map, ally, defenderToken, false).blockedByWall) continue;
    return ally;
  }
  return null;
}

/**
 * Optional D&D 5e Flanking rule: returns the flanking ally if attacker and an opposite-side conscious ally
 * are both adjacent (<= 1 square in 3D) to the defender WITH clear Line of Sight (no wall/closed door between them).
 */
export function isTargetFlankedBy(
  map:
    | (Pick<TacticalMap, 'tokens'> & {
        terrainCells?: Record<string, TerrainCellKind>;
        gmMarkers?: TacticalMap['gmMarkers'];
      })
    | undefined,
  attackerToken: MapToken | undefined,
  defenderToken: MapToken | undefined,
  sqMeters = 1.5,
  characters?: Character[],
  npcs?: Array<{ id: string; disposition?: string }>
): MapToken | null {
  if (!map || !attackerToken || !defenderToken || attackerToken.id === defenderToken.id) {
    return null;
  }
  if (!isTokenHostileTo(attackerToken, defenderToken, npcs)) return null;

  const atkDist = getToken3DDistance(attackerToken, defenderToken, sqMeters);
  if (atkDist.squares3D > 1) return null;
  if (evaluateLineOfSightAndCover(map, attackerToken, defenderToken, false).blockedByWall) {
    return null;
  }

  const defCx = defenderToken.x + (defenderToken.size || 1) / 2;
  const defCy = defenderToken.y + (defenderToken.size || 1) / 2;
  const atkVx = attackerToken.x + (attackerToken.size || 1) / 2 - defCx;
  const atkVy = attackerToken.y + (attackerToken.size || 1) / 2 - defCy;
  const atkLen = Math.hypot(atkVx, atkVy) || 1;

  for (const ally of map.tokens) {
    if (ally.id === attackerToken.id || ally.id === defenderToken.id || ally.isHidden) continue;
    if (!areTokensAllied(ally, attackerToken, npcs)) continue;
    const allyChar =
      ally.type === 'character' && ally.referenceId
        ? characters?.find((c) => c.id === ally.referenceId)
        : undefined;
    if (isTokenIncapacitated(ally, allyChar)) continue;

    const allyDist = getToken3DDistance(ally, defenderToken, sqMeters);
    if (allyDist.squares3D > 1) continue;
    if (evaluateLineOfSightAndCover(map, ally, defenderToken, false).blockedByWall) continue;

    const allyVx = ally.x + (ally.size || 1) / 2 - defCx;
    const allyVy = ally.y + (ally.size || 1) / 2 - defCy;
    const allyLen = Math.hypot(allyVx, allyVy) || 1;
    const dot = (atkVx * allyVx + atkVy * allyVy) / (atkLen * allyLen);
    // Opposite sides of the target (angle >= ~120 degrees -> dot <= -0.5)
    if (dot <= -0.5) {
      return ally;
    }
  }
  return null;
}

export interface TacticalAttackModResult {
  effectiveAdvantageMode: RollAdvantageMode;
  advantages: string[];
  disadvantages: string[];
  autoCritOnHit: boolean;
  summaryBadges: string[];
  gmOverrideUsed?: 'advantage' | 'disadvantage';
  isRangedInMelee: boolean;
  isFlanking: boolean;
  flankingAttackBonus: number;
  flankingAllyName?: string;
  hasAdjacentAllyForSneak: boolean;
  adjacentAllyName?: string;
  stealthAmbushAdvantage: boolean;
}

/**
 * Evaluates all D&D 5e situational attack modifiers:
 * - Ranged attack while adjacent to a conscious hostile enemy (1.5m) -> Disadvantage
 * - GM 1-click next-attack Advantage / Disadvantage
 * - Manual Advantage/Disadvantage toggle
 * - Flanking (configurable: 'off' | 'advantage' | 'plus2')
 * - Adjacent Conscious Ally indicator (Sneak Attack / Pack Tactics helper)
 * - Real Stealth vs Passive Perception (Advantage on ambush / Disadvantage vs unseen target)
 * - 3D Elevation adjacency check
 * - Defender Dodging -> Disadvantage
 * - Attacker & Defender Conditions (Prone, Paralyzed, Stunned, Blinded, Invisible, Poisoned, Frightened)
 * - Official D&D cancellation: any Advantage + any Disadvantage = Normal
 */
export function evaluateTacticalAttackModifiers(params: {
  map?: Pick<TacticalMap, 'tokens'>;
  attackerToken?: MapToken;
  defenderToken?: MapToken;
  attackerChar?: Character;
  defenderChar?: Character;
  characters?: Character[];
  npcs?: Array<{ id: string; disposition?: string }>;
  campaign?: Pick<CampaignState, 'characters' | 'compendium' | 'npcs' | 'settings'>;
  range?: string;
  actionTitle?: string;
  sqMeters?: number;
  enableFlanking?: boolean;
  flankingMode?: 'off' | 'advantage' | 'plus2';
  manualAdvantageMode?: RollAdvantageMode;
  defenderDodging?: boolean;
  isReaction?: boolean;
}): TacticalAttackModResult {
  const {
    map,
    attackerToken,
    defenderToken,
    attackerChar,
    defenderChar,
    characters,
    npcs,
    campaign,
    range,
    actionTitle,
    sqMeters = 1.5,
    enableFlanking = true,
    flankingMode,
    manualAdvantageMode = 'normal',
    defenderDodging = false,
    isReaction = false,
  } = params;

  const resolvedFlankingMode: 'off' | 'advantage' | 'plus2' =
    flankingMode ?? (enableFlanking ? 'advantage' : 'off');

  const advantages: string[] = [];
  const disadvantages: string[] = [];
  let autoCritOnHit = false;
  let gmOverrideUsed: 'advantage' | 'disadvantage' | undefined;
  let isRangedInMelee = false;
  let isFlanking = false;
  let flankingAttackBonus = 0;
  let flankingAllyName: string | undefined;
  let hasAdjacentAllyForSneak = false;
  let adjacentAllyName: string | undefined;
  let stealthAmbushAdvantage = false;

  if (manualAdvantageMode === 'advantage') advantages.push('Vantagem (Manual)');
  if (manualAdvantageMode === 'disadvantage') disadvantages.push('Desvantagem (Manual)');

  if (attackerChar?.nextAttackRollOverride === 'advantage') {
    advantages.push('Vantagem (Mestre)');
    gmOverrideUsed = 'advantage';
  } else if (attackerChar?.nextAttackRollOverride === 'disadvantage') {
    disadvantages.push('Desvantagem (Mestre)');
    gmOverrideUsed = 'disadvantage';
  }

  // D&D 5e: Dodge only applies if the defender is not incapacitated
  if (defenderDodging && !(defenderToken && isTokenIncapacitated(defenderToken, defenderChar))) {
    disadvantages.push('Alvo Esquivando');
  }

  const dist3D =
    attackerToken && defenderToken
      ? getToken3DDistance(attackerToken, defenderToken, sqMeters)
      : null;
  const maxRangeMeters = parseAttackRangeMeters(range, actionTitle);
  const rangeLower = (range || '').toLowerCase();
  const titleLower = (actionTitle || '').toLowerCase();
  const isDualMeleeOrRanged =
    /corpo a corpo.*dist[aâ]ncia|dist[aâ]ncia.*corpo a corpo/.test(rangeLower);
  const isExplicitMelee =
    (isDualMeleeOrRanged && (!dist3D || dist3D.squares3D <= 1)) ||
    (/corpo a corpo|melee|toque|adjacente|pessoal|espada|machado|adaga|ma[çc]a|martelo|lan[çc]a|alabarda|garra|mordida|soco|cajado/.test(
      `${rangeLower} ${titleLower}`
    ) && !/dist[aâ]ncia|ranged|arco|besta|disparo|tiro|arremesso|flecha|virote|raio|bola|m[ií]ssil/.test(`${rangeLower} ${titleLower}`));
  const isExplicitRanged =
    (!isDualMeleeOrRanged || Boolean(dist3D && dist3D.squares3D > 1)) &&
    /dist[aâ]ncia|ranged|arco|besta|disparo|tiro|arremesso|flecha|virote/.test(
      `${rangeLower} ${titleLower}`
    );
  const isRangedAttack =
    !isReaction && !isExplicitMelee && (isExplicitRanged || maxRangeMeters > Math.max(3.05, sqMeters * 2 + 0.05));

  // 1. Official D&D 5e Ranged Attack in Close Combat (any conscious hostile enemy within 1.5m)
  if (isRangedAttack && map && attackerToken) {
    const adjacentEnemy = hasAdjacentHostileEnemy(map, attackerToken, sqMeters, characters, npcs);
    if (adjacentEnemy && getToken3DDistance(attackerToken, adjacentEnemy, sqMeters).squares3D <= 1) {
      isRangedInMelee = true;
      disadvantages.push(`Inimigo Colado (${adjacentEnemy.name} a 1,5m)`);
    }
  }

  // 2. Optional Flanking (Melee attack with opposite-side ally adjacent to defender)
  if (
    resolvedFlankingMode !== 'off' &&
    !isRangedAttack &&
    map &&
    attackerToken &&
    defenderToken
  ) {
    const flankAlly = isTargetFlankedBy(map, attackerToken, defenderToken, sqMeters, characters, npcs);
    if (flankAlly) {
      isFlanking = true;
      flankingAllyName = flankAlly.name;
      if (resolvedFlankingMode === 'advantage') {
        advantages.push(`Flanqueamento (${flankAlly.name})`);
      } else if (resolvedFlankingMode === 'plus2') {
        flankingAttackBonus = 2;
      }
    }
  }

  // 2b. Adjacent Conscious Ally indicator (D&D 5e Sneak Attack / Pack Tactics)
  if (map && attackerToken && defenderToken) {
    const adjAlly = findAdjacentConsciousAlly(map, attackerToken, defenderToken, sqMeters, characters, npcs);
    if (adjAlly) {
      hasAdjacentAllyForSneak = true;
      adjacentAllyName = adjAlly.name;
    }
  }

  // 2c. Real Stealth vs Passive Perception (separate from Invisibility spell!)
  if (attackerToken && defenderToken && campaign) {
    if (
      attackerToken.stealthTotal != null &&
      !doesObserverDetectStealthedToken(defenderToken, attackerToken, campaign)
    ) {
      const defPp = getTokenPassivePerception(defenderToken, campaign);
      stealthAmbushAdvantage = true;
      advantages.push(`Emboscada Furtiva (Furt. ${attackerToken.stealthTotal} > PP ${defPp})`);
    }
    if (
      defenderToken.stealthTotal != null &&
      !doesObserverDetectStealthedToken(attackerToken, defenderToken, campaign)
    ) {
      disadvantages.push(`Alvo Oculto (Furt. ${defenderToken.stealthTotal})`);
    }
  }

  // 3. Attacker Conditions (use Character sheet as single source of truth for heroes to avoid stale token flags)
  const atkConds = new Set(
    attackerChar
      ? attackerChar.activeConditionIds || []
      : attackerToken?.activeConditionIds || []
  );
  if (atkConds.has('cond-invisivel')) advantages.push('Atacante Invisível');
  if (atkConds.has('cond-cego')) disadvantages.push('Atacante Cego');
  if (atkConds.has('cond-envenenado')) disadvantages.push('Atacante Envenenado');
  if (atkConds.has('cond-caido')) disadvantages.push('Atacante Caído');
  if (atkConds.has('cond-amedrontado')) disadvantages.push('Atacante Amedrontado');
  if (atkConds.has('cond-imobilizado')) disadvantages.push('Atacante Imobilizado');

  // 4. Defender Conditions
  const defConds = new Set(
    defenderChar
      ? defenderChar.activeConditionIds || []
      : defenderToken?.activeConditionIds || []
  );
  const isAdjacentToDefender = dist3D ? dist3D.squares3D <= 1 : !isRangedAttack;
  if (defConds.has('cond-caido')) {
    if (isAdjacentToDefender) {
      advantages.push('Alvo Caído (≤ 1,5m)');
    } else {
      disadvantages.push('Alvo Caído (à Distância)');
    }
  }
  if (defConds.has('cond-cego')) advantages.push('Alvo Cego');
  if (defConds.has('cond-atordoado')) advantages.push('Alvo Atordoado');
  if (defConds.has('cond-petrificado')) advantages.push('Alvo Petrificado');
  if (defConds.has('cond-imobilizado')) advantages.push('Alvo Imobilizado');
  if (defConds.has('cond-paralisado')) {
    advantages.push('Alvo Paralisado');
    if (isAdjacentToDefender) {
      autoCritOnHit = true;
    }
  }
  if (defConds.has('cond-inconsciente') || (defenderToken && defenderToken.hp <= 0)) {
    advantages.push('Alvo Inconsciente');
    if (isAdjacentToDefender) {
      autoCritOnHit = true;
    }
  }
  if (defConds.has('cond-invisivel')) disadvantages.push('Alvo Invisível');

  // Official D&D 5e Advantage/Disadvantage cancellation
  let effectiveAdvantageMode: RollAdvantageMode = 'normal';
  if (advantages.length > 0 && disadvantages.length === 0) {
    effectiveAdvantageMode = 'advantage';
  } else if (disadvantages.length > 0 && advantages.length === 0) {
    effectiveAdvantageMode = 'disadvantage';
  }

  const summaryBadges: string[] = [];
  if (advantages.length > 0 && disadvantages.length > 0) {
    summaryBadges.push(`Normal (Vantagem + Desvantagem cancelados)`);
  }
  advantages.forEach((a) => summaryBadges.push(`+Vant: ${a}`));
  disadvantages.forEach((d) => summaryBadges.push(`-Desv: ${d}`));
  if (flankingAttackBonus > 0 && flankingAllyName) {
    summaryBadges.push(`+${flankingAttackBonus} Flanqueamento (${flankingAllyName})`);
  }
  if (hasAdjacentAllyForSneak && adjacentAllyName) {
    summaryBadges.push(`Aliado Adjacente (${adjacentAllyName} • Furtivo)`);
  }
  if (autoCritOnHit) {
    const critReason = defConds.has('cond-paralisado') ? 'Paralisado' : 'Inconsciente';
    summaryBadges.push(`Crítico Automático (Alvo ${critReason} a 1,5m)`);
  }

  return {
    effectiveAdvantageMode,
    advantages,
    disadvantages,
    autoCritOnHit,
    summaryBadges,
    gmOverrideUsed,
    isRangedInMelee,
    isFlanking,
    flankingAttackBonus,
    flankingAllyName,
    hasAdjacentAllyForSneak,
    adjacentAllyName,
    stealthAmbushAdvantage,
  };
}

export interface DamageAffinityResult {
  finalAmount: number;
  affinity: 'normal' | 'immune' | 'resistant' | 'vulnerable';
  modifierLabel?: string;
}

/**
 * Resolves D&D 5e Damage Immunities (0x), Resistances (0.5x floor), and Vulnerabilities (2x).
 */
export function resolveDamageWithAffinities(
  rawAmount: number,
  damageType: string | undefined,
  affinities: {
    immunities?: string[];
    resistances?: string[];
    vulnerabilities?: string[];
    activeConditionIds?: string[];
    compendiumConditions?: ConditionDef[];
  }
): DamageAffinityResult {
  const base = Math.max(0, Math.round(rawAmount));
  if (!damageType || base === 0) {
    return { finalAmount: base, affinity: 'normal' };
  }

  // Support compound types like "Perfuração / Fogo" by checking any segment
  const incomingTypes = damageType
    .split(/[\/,&+]/)
    .map((s) => normalizeDamageKey(s))
    .filter(Boolean);

  if (incomingTypes.length === 0) {
    return { finalAmount: base, affinity: 'normal' };
  }

  const immSet = new Set((affinities.immunities || []).map(normalizeDamageKey));
  const resSet = new Set((affinities.resistances || []).map(normalizeDamageKey));
  const vulSet = new Set((affinities.vulnerabilities || []).map(normalizeDamageKey));

  // Barbarian Rage ("cond-furia") automatically grants resistance to physical weapon damage
  if (affinities.activeConditionIds?.includes('cond-furia')) {
    resSet.add('corte');
    resSet.add('perfuracao');
    resSet.add('concussao');
  }
  // Built-in Wet ("cond-molhado") grants vulnerability to Lightning & Frost
  if (affinities.activeConditionIds?.includes('cond-molhado')) {
    vulSet.add('eletrico');
    vulSet.add('gelo');
  }
  // Merge custom GM-defined resistances, vulnerabilities, and immunities from any active condition
  if (affinities.activeConditionIds?.length && affinities.compendiumConditions?.length) {
    for (const cid of affinities.activeConditionIds) {
      const cond = affinities.compendiumConditions.find((c) => c.id === cid);
      if (!cond) continue;
      cond.immunities?.forEach((d) => immSet.add(normalizeDamageKey(d)));
      cond.resistances?.forEach((d) => resSet.add(normalizeDamageKey(d)));
      cond.vulnerabilities?.forEach((d) => vulSet.add(normalizeDamageKey(d)));
    }
  }

  // Only immune if all incoming damage types are immune (or single type matches)
  const allImmune = incomingTypes.every((t) => immSet.has(t));
  if (allImmune) {
    return {
      finalAmount: 0,
      affinity: 'immune',
      modifierLabel: `Imune a ${damageType}`,
    };
  }

  const hasResistance = incomingTypes.some((t) => resSet.has(t));
  const hasVulnerability = incomingTypes.some((t) => vulSet.has(t));

  if (hasResistance && hasVulnerability) {
    return {
      finalAmount: base,
      affinity: 'normal',
      modifierLabel: `Resistência + Vulnerabilidade (${damageType})`,
    };
  }
  if (hasResistance) {
    return {
      finalAmount: Math.floor(base / 2),
      affinity: 'resistant',
      modifierLabel: `Resistente a ${damageType} (½)`,
    };
  }
  if (hasVulnerability) {
    return {
      finalAmount: base * 2,
      affinity: 'vulnerable',
      modifierLabel: `Vulnerável a ${damageType} (2x!)`,
    };
  }

  return { finalAmount: base, affinity: 'normal' };
}

/**
 * Qualitative wound state shown to players for monsters when enemy exact stats are hidden.
 */
export function getMonsterWoundStatus(
  hp: number,
  maxHp: number
): { label: string; colorClass: string } {
  if (hp <= 0) return { label: 'Derrotado', colorClass: 'text-red-400' };
  const pct = hp / Math.max(1, maxHp);
  if (pct >= 0.99) return { label: 'Ileso', colorClass: 'text-emerald-400' };
  if (pct >= 0.65) return { label: 'Escoriado', colorClass: 'text-lime-300' };
  if (pct >= 0.35) return { label: 'Ferido', colorClass: 'text-amber-300' };
  return { label: 'Muito Ferido', colorClass: 'text-red-400' };
}

/**
 * Extracts preview polyhedral dice shapes from a formula so the manual Click-to-Roll tray
 * displays the exact dice waiting to be rolled before any random numbers are generated.
 */
export function buildPreviewDiceForFormula(
  formula: string,
  mode: 'normal' | 'advantage' | 'disadvantage' = 'normal'
): RolledDieVisual[] {
  const out: RolledDieVisual[] = [];
  const regex = /(\d*)\s*d\s*(\d+)/gi;
  let match: RegExpExecArray | null;
  let handledAdvD20 = false;

  while ((match = regex.exec(formula)) !== null) {
    const rawCount = Math.max(1, Math.min(10, parseInt(match[1] || '1', 10)));
    const sides = Math.max(2, Math.min(100, parseInt(match[2], 10)));
    if (sides === 20 && rawCount === 1 && mode !== 'normal' && !handledAdvD20) {
      handledAdvD20 = true;
      out.push({ sides: 20, value: 20 });
      out.push({ sides: 20, value: 20 });
    } else {
      for (let i = 0; i < rawCount; i++) {
        out.push({ sides, value: sides });
      }
    }
  }
  if (out.length === 0) {
    out.push({ sides: 20, value: 20 });
  }
  return out.slice(0, 10);
}

/**
 * Computes an adaptive grid (columns x rows) from an uploaded map image's natural pixel dimensions
 * so big maps stay big with more squares and preserve the image's exact aspect ratio (zero cropping).
 */
export function computeAdaptiveMapGrid(
  naturalWidth: number,
  naturalHeight: number,
  targetPxPerSquare = 70
): { gridWidth: number; gridHeight: number } {
  const w = Math.max(1, Math.round(naturalWidth || 1056));
  const h = Math.max(1, Math.round(naturalHeight || 672));
  const aspect = h / w;
  const cols = Math.max(12, Math.min(300, Math.round(w / Math.max(24, targetPxPerSquare))));
  const rows = Math.max(8, Math.min(300, Math.round(cols * aspect)));
  return { gridWidth: cols, gridHeight: rows };
}

export interface TeleportValidationResult {
  valid: boolean;
  reason?: string;
  distanceMeters: number;
  distanceSquares: number;
}

/**
 * Validates a D&D 5e Teleportation destination (e.g. Passo Nebuloso / Misty Step, Passo Trovejante, Porta Dimensional):
 * - Works while Grappled or Restrained (does not spend movement and provokes no Opportunity Attacks)
 * - Blocked if caster is Incapacitated (Paralyzed, Stunned, Petrified, Unconscious, 0 PV)
 * - Blocked if caster is Blinded and the spell requires sight
 * - Must be within range (Chebyshev grid distance in meters)
 * - Destination cells must be inside map bounds, not solid walls, and not occupied by another visible token
 * - If requiresSight: unobstructed Line of Sight (no walls or closed doors) and outside unrevealed Fog of War for players
 */
export function validateTeleportDestination(params: {
  map: TacticalMap;
  casterToken: MapToken;
  casterChar?: Character;
  targetX: number;
  targetY: number;
  maxRangeMeters: number;
  sqMeters?: number;
  requiresSight?: boolean;
  isGm?: boolean;
  compendiumConditions?: ConditionDef[];
}): TeleportValidationResult {
  const {
    map,
    casterToken,
    casterChar,
    targetX,
    targetY,
    maxRangeMeters,
    sqMeters = 1.5,
    requiresSight = true,
    isGm = false,
    compendiumConditions,
  } = params;

  const size = Math.max(1, Math.round(casterToken.size || 1));
  const dxSq = Math.max(
    0,
    Math.abs(targetX - casterToken.x),
    Math.abs(targetY - casterToken.y)
  );
  const distanceMeters = Math.round(dxSq * sqMeters * 10) / 10;

  if (isTokenIncapacitated(casterToken, casterChar, compendiumConditions)) {
    return {
      valid: false,
      reason: 'Incapacitado — não pode teletransportar',
      distanceMeters,
      distanceSquares: dxSq,
    };
  }

  const casterConds = new Set([
    ...(casterToken.activeConditionIds || []),
    ...(casterChar?.activeConditionIds || []),
  ]);
  if (requiresSight && casterConds.has('cond-cego')) {
    return {
      valid: false,
      reason: 'Você está Cego e não pode ver o destino',
      distanceMeters,
      distanceSquares: dxSq,
    };
  }

  if (
    targetX < 0 ||
    targetY < 0 ||
    targetX + size > map.gridWidth ||
    targetY + size > map.gridHeight
  ) {
    return {
      valid: false,
      reason: 'Fora dos limites do mapa',
      distanceMeters,
      distanceSquares: dxSq,
    };
  }

  if (targetX === casterToken.x && targetY === casterToken.y) {
    return {
      valid: false,
      reason: 'Você já está neste espaço',
      distanceMeters: 0,
      distanceSquares: 0,
    };
  }

  if (distanceMeters > maxRangeMeters + 0.05) {
    return {
      valid: false,
      reason: `Fora de alcance (${distanceMeters}m / máx. ${maxRangeMeters}m)`,
      distanceMeters,
      distanceSquares: dxSq,
    };
  }

  const effTerrain = getEffectiveTerrainCells(map);
  const effWallMeta = getEffectiveWallMeta(map);
  const revealedSet = new Set(map.revealedCells || []);
  for (let gx = targetX; gx < targetX + size; gx++) {
    for (let gy = targetY; gy < targetY + size; gy++) {
      const key = `${gx},${gy}`;
      if (effTerrain[key] === 'wall' && !isThinEdgeWall(effWallMeta[key]?.shape || 'full')) {
        return {
          valid: false,
          reason: 'Espaço bloqueado por parede/obstáculo',
          distanceMeters,
          distanceSquares: dxSq,
        };
      }
      if (requiresSight && !isGm && map.fogEnabled) {
        if (!revealedSet.has(key)) {
          return {
            valid: false,
            reason: 'Espaço oculto na Névoa de Guerra',
            distanceMeters,
            distanceSquares: dxSq,
          };
        }
      }
    }
  }

  // Occupied space check (skip self; for players skip GM-hidden ambush tokens so they don't leak)
  for (const other of map.tokens) {
    if (other.id === casterToken.id) continue;
    if (!isGm && other.isHidden) continue;
    if (other.hp <= 0) continue;
    const oSize = Math.max(1, Math.round(other.size || 1));
    const overlaps =
      targetX < other.x + oSize &&
      targetX + size > other.x &&
      targetY < other.y + oSize &&
      targetY + size > other.y;
    if (overlaps) {
      const otherLabel = !isGm && other.hideNameFromPlayers ? 'uma criatura' : other.name;
      return {
        valid: false,
        reason: `Espaço ocupado por ${otherLabel}`,
        distanceMeters,
        distanceSquares: dxSq,
      };
    }
  }

  if (requiresSight) {
    const fromCx = casterToken.x + size / 2;
    const fromCy = casterToken.y + size / 2;
    const toCx = targetX + size / 2;
    const toCy = targetY + size / 2;
    if (!hasContinuousWallLineOfSight(effTerrain, effWallMeta, fromCx, fromCy, toCx, toCy)) {
      return {
        valid: false,
        reason: 'Sem linha de visão (parede ou porta fechada)',
        distanceMeters,
        distanceSquares: dxSq,
      };
    }
  }

  return { valid: true, distanceMeters, distanceSquares: dxSq };
}

/**
 * Resolves which map ID the current user should see based on GM's Map View Mode:
 * - GM always views `campaign.activeMapId`
 * - 'follow-gm': all players follow `campaign.activeMapId`
 * - 'token-map': each player views the map where their hero token currently resides (fallback to `playerVisibleMapId` / `activeMapId`)
 * - 'gm-peek': players stay locked on `playerVisibleMapId` while GM browses other maps freely
 */
export function resolveViewedMapId(
  campaign: CampaignState,
  role: 'gm' | 'player',
  myCharacterId?: string
): string {
  const firstId = campaign.maps?.[0]?.id || '';
  if (role === 'gm') {
    return campaign.activeMapId || firstId;
  }
  const mode = campaign.settings?.mapViewMode || 'follow-gm';
  const savedPlayerMapId =
    campaign.settings?.playerVisibleMapId &&
    campaign.maps?.some((m) => m.id === campaign.settings.playerVisibleMapId)
      ? campaign.settings.playerVisibleMapId
      : campaign.activeMapId || firstId;

  if (mode === 'token-map' && myCharacterId) {
    const tokenMap = campaign.maps?.find((m) =>
      (m.tokens || []).some((t) => t.type === 'character' && t.referenceId === myCharacterId)
    );
    if (tokenMap) return tokenMap.id;
    return savedPlayerMapId;
  }
  if (mode === 'gm-peek') {
    return savedPlayerMapId;
  }
  return campaign.activeMapId || firstId;
}

/**
 * Resolves whether a MapToken's real name should be masked as '???' for non-GM players.
 * Checks token override first, then falls back to linked NpcEntry or MonsterDef settings.
 */
export function isTokenNameHiddenFromPlayers(
  tok: MapToken | undefined | null,
  campaign: CampaignState
): boolean {
  if (!tok || (tok.type !== 'npc' && tok.type !== 'monster')) return false;
  if (tok.hideNameFromPlayers !== undefined) return Boolean(tok.hideNameFromPlayers);
  if (tok.type === 'npc' && tok.referenceId) {
    return Boolean(campaign.npcs.find((n) => n.id === tok.referenceId)?.hideNameFromPlayers);
  }
  if (tok.type === 'monster' && tok.referenceId) {
    return Boolean(
      campaign.compendium.monsters.find((m) => m.id === tok.referenceId)?.hideNameFromPlayers
    );
  }
  return false;
}

/**
 * Masks any NPC/monster name that is hidden from players (returns '???' for players,
 * while always returning the real name for the GM).
 */
export function maskHiddenNameForRole(
  name: string | undefined,
  role: 'gm' | 'player',
  campaign: CampaignState,
  tokenId?: string
): string {
  if (!name) return '';
  if (role === 'gm') return name;
  if (tokenId) {
    const tok = campaign.maps.flatMap((m) => m.tokens).find((t) => t.id === tokenId);
    if (tok) {
      return isTokenNameHiddenFromPlayers(tok, campaign) ? '???' : name;
    }
  }
  const needle = name.trim().toLowerCase();
  if (!needle) return name;
  const strippedNeedle = needle.replace(/\s*#\d+$/, '').trim();
  if (
    campaign.characters.some(
      (c) =>
        c.name.trim().toLowerCase() === needle ||
        c.name.split(' ')[0].trim().toLowerCase() === needle
    )
  ) {
    return name;
  }
  if (
    campaign.npcs.some(
      (n) =>
        n.hideNameFromPlayers &&
        (n.name.trim().toLowerCase() === needle || n.name.trim().toLowerCase() === strippedNeedle)
    )
  ) {
    return '???';
  }
  if (
    campaign.compendium.monsters.some(
      (m) =>
        m.hideNameFromPlayers &&
        (m.name.trim().toLowerCase() === needle || m.name.trim().toLowerCase() === strippedNeedle)
    )
  ) {
    return '???';
  }
  for (const m of campaign.maps) {
    for (const t of m.tokens) {
      if (
        (t.type === 'npc' || t.type === 'monster') &&
        t.name.trim().toLowerCase() === needle &&
        isTokenNameHiddenFromPlayers(t, campaign)
      ) {
        return '???';
      }
    }
  }
  return name;
}

/**
 * Replaces occurrences of any hidden NPC/monster names inside free-form text (combat logs, roll titles/details, toasts)
 * with '???' for non-GM players. Uses Unicode word boundaries so short names like "Ar"/"Sol" never corrupt normal words.
 */
export function maskHiddenNamesInText(
  text: string | undefined,
  role: 'gm' | 'player',
  campaign: CampaignState
): string {
  if (!text || role === 'gm') return text || '';
  const heroNames = new Set(
    campaign.characters.flatMap((c) => [
      c.name.trim().toLowerCase(),
      c.name.split(' ')[0].trim().toLowerCase(),
    ])
  );
  const hiddenSet = new Set<string>();
  const addHidden = (raw?: string) => {
    const clean = (raw || '').trim();
    if (clean.length < 2) return;
    if (heroNames.has(clean.toLowerCase())) return;
    hiddenSet.add(clean);
  };
  campaign.npcs.forEach((n) => {
    if (n.hideNameFromPlayers) addHidden(n.name);
  });
  campaign.compendium.monsters.forEach((m) => {
    if (m.hideNameFromPlayers) addHidden(m.name);
  });
  campaign.maps.forEach((mp) => {
    mp.tokens.forEach((t) => {
      if ((t.type === 'npc' || t.type === 'monster') && isTokenNameHiddenFromPlayers(t, campaign)) {
        addHidden(t.name);
        // Also strip trailing " #1" variant if token was spawned from a named monster
        const stripped = t.name.replace(/\s*#\d+$/, '').trim();
        if (stripped.length >= 2) addHidden(stripped);
      }
    });
  });
  if (hiddenSet.size === 0) return text;
  const sorted = Array.from(hiddenSet).sort((a, b) => b.length - a.length);
  let out = text;
  for (const name of sorted) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu'), '???');
  }
  return out;
}

/**
 * Resolves @attr / @prof / @nivel tokens inside a dice formula into clean numeric values
 * without display annotations (so "- @sab" with +3 becomes "- 3", never "- SAB (+3)").
 */
export function resolveFormulaVariablesToRaw(
  rawFormula: string,
  stats?: ComputedCharacterStats,
  character?: Character
): string {
  if (!rawFormula || !stats) return rawFormula || '';
  return rawFormula
    .replace(FORMULA_VAR_REGEX, (_, prefix: string, token: string) => {
      const key = token.toLowerCase();
      let bonus: number | undefined;
      if (key === 'prof') bonus = stats.proficiencyBonus + stats.halfLevelBonus;
      else if (key === 'nivel' && character) bonus = character.level;
      else if (key === 'metade_nivel' && character) bonus = Math.floor(character.level / 2);
      else if (key in stats.attributes) bonus = stats.attributes[key].mod;
      if (bonus === undefined) return `${prefix}0`;
      return `${prefix}${bonus < 0 ? `(${bonus})` : `${bonus}`}`;
    })
    .replace(/\+\s*\(-(\d+)\)/g, '- $1')
    .replace(/-\s*\(-(\d+)\)/g, '+ $1')
    .trim();
}

/**
 * Shared pure D&D 5e Rest engine used by Party Rest, Character Sheet Rest, and Server Request Resolve.
 * - Never recharges 'consumable' items
 * - Never resets 'manual' customResources or resourceTrackers
 * - Resets Fighter Action Surge (`actionSurgeUsed: false`) on both Short & Long Rest
 * - Clears tracked concentration/single-target conditions properly on Long Rest
 * - Recomputes post-rest MaxHP/MaxMP after stripping Exhaustion/Concentration
 */
export function applyCharacterRestToState(
  camp: CampaignState,
  characterId: string,
  mode: 'short' | 'long' | 'full',
  opts?: { shortRestHealedHp?: number }
): { nextState: CampaignState; healedHp: number; maxHp: number; maxMp: number } | null {
  const char = camp.characters.find((c) => c.id === characterId);
  if (!char) return null;
  const isLong = mode === 'long';
  const isShort = mode === 'short';
  const isFull = mode === 'full';

  // Strip tracked concentration/single-target effects from targets on Long Rest
  let working = camp;
  if (isLong && (char.activeTrackedEffects || []).length > 0) {
    const tracked = char.activeTrackedEffects || [];
    const condByChar = new Map<string, Set<string>>();
    const condByTok = new Map<string, Set<string>>();
    tracked.forEach((ef) => {
      if (!ef.conditionId) return;
      (ef.targetCharacterIds || []).forEach((cid) => {
        if (!condByChar.has(cid)) condByChar.set(cid, new Set());
        condByChar.get(cid)!.add(ef.conditionId!);
      });
      (ef.targetTokenIds || []).forEach((tid) => {
        if (!condByTok.has(tid)) condByTok.set(tid, new Set());
        condByTok.get(tid)!.add(ef.conditionId!);
      });
    });
    if (condByChar.size > 0 || condByTok.size > 0) {
      working = {
        ...working,
        characters: working.characters.map((c) => {
          const rem = condByChar.get(c.id);
          if (!rem) return c;
          return { ...c, activeConditionIds: c.activeConditionIds.filter((id) => !rem.has(id)) };
        }),
        maps: working.maps.map((m) => ({
          ...m,
          tokens: m.tokens.map((t) => {
            const remT = condByTok.get(t.id);
            const remC = t.type === 'character' && t.referenceId ? condByChar.get(t.referenceId) : undefined;
            if (!remT && !remC) return t;
            return {
              ...t,
              activeConditionIds: (t.activeConditionIds || []).filter(
                (id) => !remT?.has(id) && !remC?.has(id)
              ),
            };
          }),
        })),
      };
    }
  }

  const liveChar = working.characters.find((c) => c.id === characterId) || char;
  const nextConds = isLong
    ? liveChar.activeConditionIds.filter((id) => id !== 'cond-exausto')
    : liveChar.activeConditionIds;
  const nextConcSpell = isLong ? null : liveChar.concentratingSpell;

  const nextAbilityUses = { ...(liveChar.abilityUsesRemaining || {}) };
  const nextCustomRes = { ...(liveChar.customResourceValues || {}) };
  let nextTrackers = (liveChar.resourceTrackers || []).map((tr) => ({ ...tr }));
  let nextInventory = (liveChar.inventory || []).map((inv) => ({ ...inv }));

  if (isLong || isShort) {
    working.compendium.abilities.forEach((ab) => {
      if (!ab.maxUsesPerRest || ab.maxUsesPerRest <= 0) return;
      const rec = ab.restType || 'longo';
      if (isLong || rec === 'curto') {
        nextAbilityUses[ab.id] = ab.maxUsesPerRest;
      }
    });
    (working.compendium.customResources || []).forEach((cr) => {
      const rec = cr.resetOn || 'long';
      if (rec === 'manual') return;
      if ((isLong && (rec === 'long' || rec === 'short')) || (isShort && rec === 'short')) {
        const prevEntry = nextCustomRes[cr.id];
        const maxVal =
          prevEntry?.maxOverride ??
          Math.max(0, cr.baseMax + cr.perLevel * Math.max(0, (liveChar.level || 1) - 1));
        nextCustomRes[cr.id] = { ...prevEntry, current: maxVal };
      }
    });
    nextTrackers = nextTrackers.map((tr) => {
      if (tr.resetOn === 'manual') return tr;
      if ((isLong && (tr.resetOn === 'long' || tr.resetOn === 'short')) || (isShort && tr.resetOn === 'short')) {
        return { ...tr, current: tr.max };
      }
      return tr;
    });
    nextInventory = nextInventory.map((inv) => {
      const def = working.compendium.items.find((i) => i.id === inv.itemId);
      if (!def?.maxCharges || def.maxCharges <= 0) return inv;
      const rType = def.rechargeType || 'long-rest';
      if (rType === 'consumable') return inv;
      if (
        (isShort && rType === 'short-rest') ||
        (isLong && (rType === 'short-rest' || rType === 'long-rest' || rType === 'dawn'))
      ) {
        return { ...inv, chargesRemaining: def.maxCharges };
      }
      return inv;
    });
  }

  // Recompute MaxHP/MaxMP AFTER stripping Exhaustion/Concentration so rest totals are never stale!
  const draftChar: Character = {
    ...liveChar,
    activeConditionIds: nextConds,
    concentratingSpell: nextConcSpell,
    ...(isLong ? { activeTrackedEffects: [] } : {}),
  };
  const postStats = computeCharacterStats(draftChar, working);

  let nextHp = liveChar.hp;
  let nextMp = liveChar.mp;
  let healedHp = 0;

  if (isLong || isFull) {
    healedHp = Math.max(0, postStats.maxHp - liveChar.hp);
    nextHp = postStats.maxHp;
    nextMp = postStats.maxMp;
  } else if (isShort) {
    const charClass = working.compendium.classes.find((cl) => cl.id === liveChar.classId);
    const healRoll =
      typeof opts?.shortRestHealedHp === 'number'
        ? Math.max(1, opts.shortRestHealedHp)
        : Math.max(
            1,
            evaluateFormula(
              `1d${charClass?.hitDie || 8} + ${postStats.attributes['con']?.mod || 0}`,
              postStats,
              draftChar
            ).total
          );
    nextHp = Math.min(postStats.maxHp, liveChar.hp + healRoll);
    healedHp = Math.max(0, nextHp - liveChar.hp);
    nextMp = Math.min(postStats.maxMp, liveChar.mp + Math.ceil(postStats.maxMp / 3));
  }

  const nextDeathSaves = { successes: 0, failures: 0, stabilized: false, dead: false };
  const nextTempHp = isLong ? 0 : liveChar.tempHp || 0;

  const updatedState: CampaignState = {
    ...working,
    characters: working.characters.map((c) =>
      c.id !== characterId
        ? c
        : {
            ...c,
            hp: nextHp,
            mp: nextMp,
            tempHp: nextTempHp,
            activeConditionIds: nextConds,
            deathSaves: nextDeathSaves,
            abilityUsesRemaining: nextAbilityUses,
            customResourceValues: nextCustomRes,
            resourceTrackers: nextTrackers,
            inventory: nextInventory,
            concentratingSpell: nextConcSpell,
            actionSurgeUsed: isLong || isShort ? false : c.actionSurgeUsed,
            ...(isLong ? { activeTrackedEffects: [] } : {}),
          }
    ),
    maps: working.maps.map((m) => ({
      ...m,
      tokens: m.tokens.map((t) =>
        t.type === 'character' && t.referenceId === characterId
          ? {
              ...t,
              hp: nextHp,
              maxHp: postStats.maxHp,
              activeConditionIds: nextConds,
            }
          : t
      ),
    })),
    combat: {
      ...working.combat,
      combatants: working.combat.combatants.map((cb) =>
        cb.type === 'character' && cb.referenceId === characterId
          ? {
              ...cb,
              hp: nextHp,
              maxHp: postStats.maxHp,
              ...(isLong || isShort ? { actionSurgeUsed: false } : {}),
              ...(isLong ? { concentratingSpell: null } : {}),
            }
          : cb
      ),
    },
  };

  return {
    nextState: syncCampaignDerivedCharacterStats(updatedState, camp),
    healedHp,
    maxHp: postStats.maxHp,
    maxMp: postStats.maxMp,
  };
}

function parseCrNumeric(cr?: string): number {
  if (!cr) return 1;
  const trimmed = cr.trim();
  if (trimmed.includes('/')) {
    const [num, den] = trimmed.split('/').map((s) => Number(s));
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return num / den;
  }
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/**
 * Computes synthetic D&D 5e stats for a Monster or NPC so formula variables
 * (@for, @des, @con, @int, @sab, @car, @prof) evaluate accurately in AoE save DCs and damage.
 */
export function computeSyntheticEntityStats(
  entity: { attributes?: Record<string, number>; cr?: string; maxHp?: number; defense?: number; speed?: number; initiativeBonus?: number } | undefined,
  campaign: CampaignState
): ComputedCharacterStats | undefined {
  if (!entity) return undefined;
  const crVal = parseCrNumeric(entity.cr);
  const proficiencyBonus =
    crVal >= 29 ? 9 : crVal >= 25 ? 8 : crVal >= 21 ? 7 : crVal >= 17 ? 6 : crVal >= 13 ? 5 : crVal >= 9 ? 4 : crVal >= 5 ? 3 : 2;
  const attributes: Record<string, ComputedAttribute> = {};
  const srcAttrs = entity.attributes || {};
  for (const attr of campaign.compendium.attributes) {
    const raw = srcAttrs[attr.id];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : 10;
    attributes[attr.id] = {
      value,
      mod: Math.floor((value - 10) / 2),
      breakdown: [],
    };
  }
  const sabMod = attributes.sab?.mod ?? 0;
  return {
    attributes,
    proficiencyBonus,
    halfLevelBonus: Math.max(0, Math.floor(crVal / 2)),
    maxHp: entity.maxHp || 10,
    maxHpBreakdown: [],
    maxMp: 0,
    maxMpBreakdown: [],
    defense: entity.defense || 10,
    defenseBreakdown: [],
    initiative: entity.initiativeBonus ?? (attributes.des?.mod ?? 0),
    initiativeBreakdown: [],
    speed: entity.speed || 9,
    speedBreakdown: [],
    passivePerception: 10 + sabMod,
    attackBonusExtra: 0,
    attackBreakdown: [],
    attackDiceBonuses: [],
    damageBonusExtra: 0,
    damageBreakdown: [],
    damageDiceBonuses: [],
    saveDiceBonuses: [],
    skills: {},
    totalWeight: 0,
  };
}

/**
 * Converts a Compendium AbilityDef into a MonsterAttack while preserving ALL AoE,
 * Saving Throw, Elemental Surface, Teleport, Condition, SFX and VFX properties.
 */
export function buildMonsterAttackFromAbility(
  ab: AbilityDef,
  defaultAttackBonus: number
): MonsterAttack {
  const hasNoDamage = !ab.damageType;
  const isHeal = ab.damageType?.toLowerCase() === 'cura';
  const cleanDamage = hasNoDamage
    ? ''
    : (ab.damageFormula || '')
        .replace(/@\w+/g, '0')
        .replace(/\+\s*0\b/g, '')
        .replace(/-\s*0\b/g, '')
        .trim() || '1d8';
  return {
    name: ab.name,
    attackBonus: hasNoDamage || isHeal || ab.aoeShape || ab.saveSkillId ? 0 : defaultAttackBonus,
    damageFormula: cleanDamage,
    damageType: ab.damageType || '',
    range: ab.range || (ab.aoeShape ? 'Distância Média (18m)' : 'Pessoal'),
    sourceAbilityId: ab.id,
    actionType: normalizeActionEconomyCost(ab.actionType),
    applyConditionId: ab.applyConditionId,
    conditionDurationRounds: ab.conditionDurationRounds,
    saveSkillId: ab.saveSkillId,
    saveDcFormula: ab.saveDcFormula,
    halfOnSuccess: ab.halfOnSuccess,
    aoeShape: ab.aoeShape,
    aoeSizeMeters: ab.aoeSizeMeters,
    aoeColor: ab.aoeColor,
    aoePersistent: ab.aoePersistent,
    aoeTargetFilter: ab.aoeTargetFilter,
    createsSurface: ab.createsSurface,
    sfxPreset: ab.sfxPreset,
    vfxKind: ab.vfxKind,
    isTeleport: ab.isTeleport,
    teleportRequiresSight: ab.teleportRequiresSight,
    teleportAoeOrigin: ab.teleportAoeOrigin,
  };
}

/**
 * Resolves a Monster/NPC attack (including legacy saves imported before AoE fields existed on MonsterAttack)
 * into a complete PendingAttackChoice ready for single-target duel, AoE placement, or teleportation.
 */
export function buildPendingAttackFromMonsterAttack(params: {
  token: MapToken;
  attack: MonsterAttack;
  campaign: CampaignState;
  diceSkin?: DiceSkin;
  frameFallback?: TokenFrameStyle;
  titlePrefix?: string;
  actionCostOverride?: ActionEconomyCost;
  isLegendaryAction?: boolean;
}): PendingAttackChoice {
  const { token, attack, campaign, diceSkin, frameFallback, titlePrefix, actionCostOverride, isLegendaryAction } =
    params;
  const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const linkedAb =
    (attack.sourceAbilityId
      ? campaign.compendium.abilities.find((a) => a.id === attack.sourceAbilityId)
      : undefined) ||
    campaign.compendium.abilities.find((a) => normName(a.name) === normName(attack.name));

  const resolvedAoeShape = attack.aoeShape || linkedAb?.aoeShape;
  const resolvedAoeSizeMeters =
    attack.aoeSizeMeters ?? linkedAb?.aoeSizeMeters ?? (resolvedAoeShape ? 6 : undefined);
  const resolvedAoeColor = attack.aoeColor || linkedAb?.aoeColor;
  const resolvedAoePersistent =
    attack.aoePersistent !== undefined ? attack.aoePersistent : linkedAb?.aoePersistent;
  const resolvedAoeTargetFilter = attack.aoeTargetFilter || linkedAb?.aoeTargetFilter;
  const resolvedSaveSkillId = attack.saveSkillId || linkedAb?.saveSkillId;
  const resolvedSaveDcFormula = attack.saveDcFormula || linkedAb?.saveDcFormula;
  const resolvedHalfOnSuccess =
    attack.halfOnSuccess !== undefined ? attack.halfOnSuccess : linkedAb?.halfOnSuccess;
  const resolvedCreatesSurface = attack.createsSurface || linkedAb?.createsSurface;
  const resolvedApplyConditionId = attack.applyConditionId || linkedAb?.applyConditionId;
  const resolvedIsTeleport = Boolean(attack.isTeleport ?? linkedAb?.isTeleport);
  const resolvedTeleportRequiresSight =
    attack.teleportRequiresSight ?? linkedAb?.teleportRequiresSight ?? true;
  const resolvedTeleportAoeOrigin =
    attack.teleportAoeOrigin ?? linkedAb?.teleportAoeOrigin ?? 'departure';
  const resolvedDamageType = attack.damageType || linkedAb?.damageType || '';
  const resolvedDamageFormula =
    attack.damageFormula ||
    (resolvedDamageType
      ? (linkedAb?.damageFormula || '')
          .replace(/@\w+/g, '0')
          .replace(/\+\s*0\b/g, '')
          .trim()
      : '');
  const isCondOnly = Boolean(!resolvedDamageType && resolvedApplyConditionId);
  const isHeal = resolvedDamageType.toLowerCase() === 'cura';
  const parsedDur = parseAbilityDuration(
    linkedAb?.duration,
    attack.conditionDurationRounds ?? linkedAb?.conditionDurationRounds
  );
  const resolvedActionCost =
    actionCostOverride ??
    (attack.actionType
      ? normalizeActionEconomyCost(attack.actionType)
      : linkedAb?.actionType
        ? normalizeActionEconomyCost(linkedAb.actionType)
        : 'Padrão');
  const skipAttackRoll = Boolean(
    resolvedAoeShape ||
      resolvedIsTeleport ||
      isCondOnly ||
      isHeal ||
      (resolvedSaveSkillId && (!attack.attackBonus || attack.attackBonus === 0))
  );

  return {
    attackerTokenId: token.id,
    attackerName: token.name,
    attackerColor: token.color || '#dc2626',
    attackerImageUrl: token.imageUrl,
    attackerFrame: token.frameStyle || frameFallback || 'crimson',
    diceSkin: diceSkin || 'blood',
    actionTitle: titlePrefix ? `${titlePrefix}${attack.name}` : attack.name,
    attackFormula: skipAttackRoll ? undefined : `1d20 + ${attack.attackBonus}`,
    damageFormula: isCondOnly ? undefined : resolvedDamageFormula || undefined,
    damageType: resolvedDamageType || undefined,
    range: attack.range || linkedAb?.range || (resolvedAoeShape ? 'Distância Média (18m)' : 'Corpo a Corpo (1,5m)'),
    actionCost: resolvedActionCost,
    isLegendaryAction: isLegendaryAction || undefined,
    applyConditionId: resolvedApplyConditionId,
    conditionDurationRounds: parsedDur.isDiceFormula ? undefined : parsedDur.rounds,
    conditionDurationFormula: parsedDur.isDiceFormula ? parsedDur.formula : undefined,
    requiresConcentration: Boolean(linkedAb?.requiresConcentration),
    singleTargetOnly: Boolean(linkedAb?.singleTargetOnly),
    saveSkillId: resolvedSaveSkillId,
    saveDcFormula: resolvedSaveDcFormula,
    halfOnSuccess: resolvedHalfOnSuccess,
    aoeShape: resolvedAoeShape,
    aoeSizeMeters: resolvedAoeSizeMeters,
    aoeColor: resolvedAoeColor,
    aoePersistent: resolvedAoePersistent,
    aoeTargetFilter: resolvedAoeTargetFilter,
    createsSurface: resolvedCreatesSurface,
    sfxPreset: attack.sfxPreset || linkedAb?.sfxPreset,
    vfxKind: attack.vfxKind || linkedAb?.vfxKind,
    isTeleport: resolvedIsTeleport || undefined,
    teleportRequiresSight: resolvedIsTeleport ? resolvedTeleportRequiresSight : undefined,
    teleportAoeOrigin: resolvedIsTeleport ? resolvedTeleportAoeOrigin : undefined,
  };
}

export function formatMonsterAttackSummary(
  atk: MonsterAttack,
  campaign: CampaignState
): string {
  const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const linkedAb =
    (atk.sourceAbilityId
      ? campaign.compendium.abilities.find((a) => a.id === atk.sourceAbilityId)
      : undefined) ||
    campaign.compendium.abilities.find((a) => normName(a.name) === normName(atk.name));
  const shape = atk.aoeShape || linkedAb?.aoeShape;
  const sizeM = atk.aoeSizeMeters ?? linkedAb?.aoeSizeMeters ?? 6;
  const dmg = atk.damageFormula || linkedAb?.damageFormula || '';
  if (shape) {
    const shapeNames: Record<string, string> = {
      sphere: 'Esfera',
      cone: 'Cone',
      line: 'Linha',
      cube: 'Cubo',
    };
    return `${shapeNames[shape] || 'Área'} ${sizeM}m${dmg ? ` • ${dmg}` : ''}`;
  }
  const saveId = atk.saveSkillId || linkedAb?.saveSkillId;
  if (saveId && (!atk.attackBonus || atk.attackBonus === 0)) {
    return `Salvaguarda${dmg ? ` • ${dmg}` : ''}`;
  }
  if (!atk.damageType && atk.applyConditionId) {
    return 'Condição';
  }
  return `+${atk.attackBonus} • ${atk.damageFormula || '—'}`;
}
