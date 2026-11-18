import { CampaignState, Character, RolledDieVisual, StatModifier } from './types';

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
  saveDiceBonuses: string[];
  skills: Record<string, ComputedSkill>;
  totalWeight: number;
}

export function getAttrMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function parseAttackRangeMeters(range?: string, actionName?: string): number {
  const clean = (range || '').trim();
  if (clean) {
    const mMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*m\b/i);
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
  return Math.max(1, Math.round(meters / Math.max(0.5, gridSquareMeters)));
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

  // Gather active modifiers from equipped items & active conditions
  const activeModifiers: StatModifier[] = [];

  for (const inv of character.inventory) {
    if (!inv.equipped) continue;
    const item = compendium.items.find((i) => i.id === inv.itemId);
    if (item?.modifiers) {
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
      if (mod.target === 'attribute' && mod.targetId === attr.id) {
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
  if (character.maxMpOverride && character.maxMpOverride > 0) {
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
  let defense = settings.baseDefense;
  const defenseBreakdown: string[] = [`Base ${settings.baseDefense}`];
  let hasHeavyArmor = false;
  let armorBonus = 0;
  let shieldBonus = 0;

  for (const inv of character.inventory) {
    if (!inv.equipped) continue;
    const item = compendium.items.find((i) => i.id === inv.itemId);
    if (!item || !item.defenseBonus) continue;
    if (item.type === 'Armadura') {
      armorBonus += item.defenseBonus;
      defenseBreakdown.push(`${item.name} +${item.defenseBonus}`);
      if (item.defenseBonus >= 6) hasHeavyArmor = true;
    } else if (item.type === 'Escudo') {
      shieldBonus += item.defenseBonus;
      defenseBreakdown.push(`${item.name} +${item.defenseBonus}`);
    } else {
      defense += item.defenseBonus;
      defenseBreakdown.push(`${item.name} +${item.defenseBonus}`);
    }
  }

  defense += armorBonus + shieldBonus;
  const effectiveDesForArmor = hasHeavyArmor ? Math.min(2, desMod) : desMod;
  if (effectiveDesForArmor !== 0) {
    defense += effectiveDesForArmor;
    defenseBreakdown.push(
      hasHeavyArmor
        ? `Destreza (máx +2 armadura pesada) ${formatSigned(effectiveDesForArmor)}`
        : `Destreza ${formatSigned(effectiveDesForArmor)}`
    );
  }
  for (const m of activeModifiers) {
    if (m.target === 'defense') {
      defense += m.value;
      defenseBreakdown.push(`${m.label} ${formatSigned(m.value)}`);
    }
  }

  // Compute Speed
  let speed = race?.speed ?? 9;
  const speedBreakdown: string[] = [`Raça ${speed}m`];
  for (const m of activeModifiers) {
    if (m.target === 'speed') {
      speed += m.value;
      speedBreakdown.push(`${m.label} ${formatSigned(m.value)}m`);
    }
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
  const saveDiceBonuses: string[] = [];
  let saveBonusExtra = 0;

  for (const m of activeModifiers) {
    if (m.target === 'attack') {
      if (m.value !== 0) {
        attackBonusExtra += m.value;
        attackBreakdown.push(`${m.label} ${formatSigned(m.value)}`);
      }
      if (m.diceBonus) attackDiceBonuses.push(m.diceBonus);
    } else if (m.target === 'damage') {
      if (m.value !== 0) {
        damageBonusExtra += m.value;
        damageBreakdown.push(`${m.label} ${formatSigned(m.value)}`);
      }
    } else if (m.target === 'save') {
      if (m.value !== 0) saveBonusExtra += m.value;
      if (m.diceBonus) saveDiceBonuses.push(m.diceBonus);
    }
  }

  // Compute Skills
  const skills: Record<string, ComputedSkill> = {};
  for (const skill of compendium.skills) {
    const attrDef = compendium.attributes.find((a) => a.id === skill.defaultAttributeId);
    const attrMod = attributes[skill.defaultAttributeId]?.mod ?? 0;
    const trained = character.trainedSkillIds.includes(skill.id);
    const breakdown: string[] = [`${attrDef?.shortName ?? 'ATR'} ${formatSigned(attrMod)}`];

    let total = attrMod;
    if (trained && levelBonus > 0) {
      total += levelBonus;
      breakdown.push(`Treino/Prof ${formatSigned(levelBonus)}`);
    }

    if (skill.isSavingThrow && saveBonusExtra !== 0) {
      total += saveBonusExtra;
      breakdown.push(`Efeitos ${formatSigned(saveBonusExtra)}`);
    }

    for (const m of activeModifiers) {
      if (m.target === 'skill' && (!m.targetId || m.targetId === skill.id)) {
        total += m.value;
        breakdown.push(`${m.label} ${formatSigned(m.value)}`);
      }
    }

    skills[skill.id] = {
      total,
      trained,
      isSavingThrow: Boolean(skill.isSavingThrow),
      attrShort: attrDef?.shortName ?? 'ATR',
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
    saveDiceBonuses,
    skills,
    totalWeight: Math.round(totalWeight * 10) / 10,
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

      // Double dice on critical hit damage if requested
      if (options?.isCritDamage) {
        count *= 2;
      }

      if (idx === 0 && sides === 20 && count === 1 && options?.advantageMode && options.advantageMode !== 'normal') {
        const r1 = Math.floor(Math.random() * 20) + 1;
        const r2 = Math.floor(Math.random() * 20) + 1;
        const isAdv = options.advantageMode === 'advantage';
        const chosen = isAdv ? Math.max(r1, r2) : Math.min(r1, r2);
        const r1Chosen = isAdv ? r1 >= r2 : r1 <= r2;
        d20Natural = chosen;
        if (chosen === 20) isCrit = true;
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
          if (rolls[0] === 20) isCrit = true;
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
