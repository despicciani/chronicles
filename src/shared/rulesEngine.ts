import {
  AoETemplate,
  CampaignState,
  Character,
  EquipSlot,
  ItemDef,
  MapToken,
  PaperdollArchetype,
  RolledDieVisual,
  StatModifier,
  TacticalMap,
  TerrainCellKind,
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
] as const;

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

  for (const item of effectiveEquippedItems) {
    const defBonus = extractItemDefenseBonus(item);
    if (!defBonus) continue;
    if (item.type === 'Armadura') {
      armorBonus += defBonus;
      defenseBreakdown.push(`${item.name} +${defBonus}`);
      if (defBonus >= 6) hasHeavyArmor = true;
    } else if (item.type === 'Escudo') {
      shieldBonus += defBonus;
      defenseBreakdown.push(`${item.name} +${defBonus}`);
    } else {
      defense += defBonus;
      defenseBreakdown.push(`${item.name} +${defBonus}`);
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

/**
 * Synchronizes every character's derived Defense (CA), MaxHP, and Speed onto their
 * MapTokens and Combatants so equipping/unequipping items immediately updates CA everywhere.
 */
export function syncCampaignDerivedCharacterStats(camp: CampaignState): CampaignState {
  if (!camp || !Array.isArray(camp.characters) || !camp.compendium) return camp;
  const statsByCharId = new Map<string, ComputedCharacterStats>();
  for (const ch of camp.characters) {
    statsByCharId.set(ch.id, computeCharacterStats(ch, camp));
  }

  const nextMaps = (camp.maps || []).map((m) => ({
    ...m,
    tokens: (m.tokens || []).map((tok) => {
      if (tok.type !== 'character' || !tok.referenceId) return tok;
      const st = statsByCharId.get(tok.referenceId);
      const ch = camp.characters.find((c) => c.id === tok.referenceId);
      if (!st || !ch) return tok;
      return {
        ...tok,
        hp: ch.hp,
        maxHp: st.maxHp,
        defense: st.defense,
      };
    }),
  }));

  const nextCombat = camp.combat
    ? {
        ...camp.combat,
        combatants: (camp.combat.combatants || []).map((cb) => {
          if (cb.type !== 'character' || !cb.referenceId) return cb;
          const st = statsByCharId.get(cb.referenceId);
          const ch = camp.characters.find((c) => c.id === cb.referenceId);
          if (!st || !ch) return cb;
          return {
            ...cb,
            hp: ch.hp,
            maxHp: st.maxHp,
            defense: st.defense,
            speedMeters: st.speed,
          };
        }),
      }
    : camp.combat;

  return {
    ...camp,
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
    attributes: attrs,
    trainedSkillIds: Array.isArray(raw.trainedSkillIds) ? raw.trainedSkillIds : [],
    hp: typeof raw.hp === 'number' ? raw.hp : 12,
    maxHpOverride: raw.maxHpOverride,
    tempHp: typeof raw.tempHp === 'number' ? raw.tempHp : 0,
    mp: typeof raw.mp === 'number' ? raw.mp : 6,
    maxMpOverride: raw.maxMpOverride,
    knownAbilityIds: Array.isArray(raw.knownAbilityIds) ? raw.knownAbilityIds : [],
    customAttacks: Array.isArray(raw.customAttacks) ? raw.customAttacks : [],
    customAbilities: Array.isArray(raw.customAbilities) ? raw.customAbilities : [],
    abilityUsesRemaining: raw.abilityUsesRemaining || {},
    activeConditionIds: Array.isArray(raw.activeConditionIds) ? raw.activeConditionIds : [],
    inventory: Array.isArray(raw.inventory) ? raw.inventory : [],
    gold: typeof raw.gold === 'number' ? raw.gold : 0,
    portraitUrl: raw.portraitUrl || '',
    tokenColor: raw.tokenColor || raw.playerColor || '#38bdf8',
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
  size: number
): boolean {
  if (!terrainCells) return false;
  const s = Math.max(1, size);
  for (let dx = 0; dx < s; dx++) {
    for (let dy = 0; dy < s; dy++) {
      if (terrainCells[`${x + dx},${y + dy}`] === 'wall') {
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
  terrainCells?: Record<string, TerrainCellKind>
): boolean {
  const s = Math.max(1, size);
  if (doesFootprintHitWall(terrainCells, x, y, s)) {
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

  if (
    !doesTokenCollideAt(
      map.tokens,
      startX,
      startY,
      s,
      ignoreTokenId,
      includeHidden,
      map.terrainCells
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
            map.terrainCells
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
 * Resolves token movement target during grid dragging with smooth single-axis sliding around occupied squares & walls.
 */
export function resolveDragTargetCell(
  map: Pick<TacticalMap, 'gridWidth' | 'gridHeight' | 'tokens'> & {
    terrainCells?: Record<string, TerrainCellKind>;
  },
  movingToken: MapToken,
  desiredX: number,
  desiredY: number,
  includeHidden = true
): { x: number; y: number } {
  const s = Math.max(1, movingToken.size || 1);
  const maxX = Math.max(0, map.gridWidth - s);
  const maxY = Math.max(0, map.gridHeight - s);
  const clampedX = Math.max(0, Math.min(maxX, desiredX));
  const clampedY = Math.max(0, Math.min(maxY, desiredY));

  if (
    !doesTokenCollideAt(
      map.tokens,
      clampedX,
      clampedY,
      s,
      movingToken.id,
      includeHidden,
      map.terrainCells
    )
  ) {
    return { x: clampedX, y: clampedY };
  }
  if (
    clampedX !== movingToken.x &&
    !doesTokenCollideAt(
      map.tokens,
      clampedX,
      movingToken.y,
      s,
      movingToken.id,
      includeHidden,
      map.terrainCells
    )
  ) {
    return { x: clampedX, y: movingToken.y };
  }
  if (
    clampedY !== movingToken.y &&
    !doesTokenCollideAt(
      map.tokens,
      movingToken.x,
      clampedY,
      s,
      movingToken.id,
      includeHidden,
      map.terrainCells
    )
  ) {
    return { x: movingToken.x, y: clampedY };
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
 * Evaluates Line of Sight (Walls block attacks) and D&D 5e Cover (+2 Half / +5 Three-Quarters AC).
 */
export function evaluateLineOfSightAndCover(
  map: Pick<TacticalMap, 'tokens'> & { terrainCells?: Record<string, TerrainCellKind> } | undefined,
  attackerToken: MapToken | undefined,
  defenderToken: MapToken | undefined,
  isRanged: boolean
): LineOfSightCoverResult {
  if (!map || !attackerToken || !defenderToken || attackerToken.id === defenderToken.id) {
    return { blockedByWall: false, coverAcBonus: 0 };
  }
  const terrain = map.terrainCells || {};
  const ax = attackerToken.x + Math.floor((attackerToken.size || 1) / 2);
  const ay = attackerToken.y + Math.floor((attackerToken.size || 1) / 2);
  const bx = defenderToken.x + Math.floor((defenderToken.size || 1) / 2);
  const by = defenderToken.y + Math.floor((defenderToken.size || 1) / 2);

  const line = traceGridLine(ax, ay, bx, by);
  let coverUnits = 0;

  for (const cell of line) {
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
    if (cellTerrain === 'wall') {
      return {
        blockedByWall: true,
        coverAcBonus: 0,
        coverLabel: 'Sem Linha de Visão (Parede)',
      };
    }
    if (cellTerrain === 'cover') {
      coverUnits += 1;
    }
    if (isRanged) {
      const blockingCreature = map.tokens.some(
        (other) =>
          other.id !== attackerToken.id &&
          other.id !== defenderToken.id &&
          !other.isHidden &&
          other.hp > 0 &&
          doSquaresOverlap(cell.x, cell.y, 1, other.x, other.y, other.size || 1)
      );
      if (blockingCreature) {
        coverUnits += 1;
      }
    }
  }

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
  path?: Array<{ x: number; y: number }>
): { meters: number; difficultSquares: number } {
  const cells =
    path && path.length > 1
      ? path.slice(1)
      : traceGridLine(origin.x, origin.y, finalPos.x, finalPos.y).slice(1);

  if (cells.length === 0) return { meters: 0, difficultSquares: 0 };

  let totalMeters = 0;
  let difficultSquares = 0;
  let prev = origin;

  for (const step of cells) {
    const stepSq = Math.max(Math.abs(step.x - prev.x), Math.abs(step.y - prev.y));
    if (stepSq <= 0) continue;
    const isDiff = terrainCells?.[`${step.x},${step.y}`] === 'difficult';
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
 */
export function getTokensInsideTemplate(
  map: Pick<TacticalMap, 'tokens'>,
  template: AoETemplate
): MapToken[] {
  const tx = template.x + 0.5;
  const ty = template.y + 0.5;
  const rad = Math.max(0.5, template.radiusSquares);
  const angleRad = ((template.angleDeg || 0) * Math.PI) / 180;
  const dirX = Math.cos(angleRad);
  const dirY = Math.sin(angleRad);

  return map.tokens.filter((tok) => {
    if (tok.hp <= 0) return false;
    const cx = tok.x + (tok.size || 1) / 2;
    const cy = tok.y + (tok.size || 1) / 2;
    const dx = cx - tx;
    const dy = cy - ty;
    const dist = Math.hypot(dx, dy);
    const tokRad = (tok.size || 1) * 0.45;

    if (template.shape === 'sphere') {
      return dist <= rad + tokRad;
    }
    if (template.shape === 'cube') {
      return Math.abs(dx) <= rad + tokRad && Math.abs(dy) <= rad + tokRad;
    }
    if (template.shape === 'cone') {
      if (dist > rad + tokRad) return false;
      if (dist < 0.35) return true;
      const dot = (dx * dirX + dy * dirY) / dist;
      return dot >= Math.cos((34 * Math.PI) / 180);
    }
    if (template.shape === 'line') {
      const length = rad * 2;
      const proj = dx * dirX + dy * dirY;
      if (proj < -0.25 || proj > length + tokRad) return false;
      const perp = Math.abs(dx * -dirY + dy * dirX);
      return perp <= 0.75 + tokRad;
    }
    return false;
  });
}

export function computeConcentrationDc(damageTaken: number): number {
  return Math.max(10, Math.floor(Math.abs(damageTaken) / 2));
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

export function isTokenHostileTo(a: MapToken, b: MapToken): boolean {
  return (
    (a.type === 'character' && b.type === 'monster') ||
    (a.type === 'monster' && b.type === 'character')
  );
}

export function isTokenIncapacitated(token: MapToken, char?: Character): boolean {
  if (token.hp <= 0) return true;
  const conds = new Set([...(token.activeConditionIds || []), ...(char?.activeConditionIds || [])]);
  return (
    conds.has('cond-atordoado') ||
    conds.has('cond-paralisado') ||
    conds.has('cond-inconsciente')
  );
}

/**
 * Official D&D 5e rule: checks if any living, visible, conscious hostile enemy is within 1.5m (1 square) of the attacker.
 */
export function hasAdjacentHostileEnemy(
  map: Pick<TacticalMap, 'tokens'> | undefined,
  attackerToken: MapToken | undefined,
  sqMeters = 1.5,
  characters?: Character[]
): MapToken | null {
  if (!map || !attackerToken) return null;
  for (const other of map.tokens) {
    if (other.id === attackerToken.id || other.isHidden) continue;
    if (!isTokenHostileTo(attackerToken, other)) continue;
    const otherChar =
      other.type === 'character' && other.referenceId
        ? characters?.find((c) => c.id === other.referenceId)
        : undefined;
    if (isTokenIncapacitated(other, otherChar)) continue;
    const dist = getGridSpanDistance(
      attackerToken.x,
      attackerToken.y,
      attackerToken.size || 1,
      other.x,
      other.y,
      other.size || 1,
      sqMeters
    );
    if (dist.squares <= 1) {
      return other;
    }
  }
  return null;
}

/**
 * Optional D&D 5e Flanking rule: returns the flanking ally if attacker and an opposite-side conscious ally
 * are both adjacent (<= 1 square) to the defender.
 */
export function isTargetFlankedBy(
  map: Pick<TacticalMap, 'tokens'> | undefined,
  attackerToken: MapToken | undefined,
  defenderToken: MapToken | undefined,
  sqMeters = 1.5,
  characters?: Character[]
): MapToken | null {
  if (!map || !attackerToken || !defenderToken || attackerToken.id === defenderToken.id) {
    return null;
  }
  if (!isTokenHostileTo(attackerToken, defenderToken)) return null;

  const atkDist = getGridSpanDistance(
    attackerToken.x,
    attackerToken.y,
    attackerToken.size || 1,
    defenderToken.x,
    defenderToken.y,
    defenderToken.size || 1,
    sqMeters
  );
  if (atkDist.squares > 1) return null;

  const defCx = defenderToken.x + (defenderToken.size || 1) / 2;
  const defCy = defenderToken.y + (defenderToken.size || 1) / 2;
  const atkVx = attackerToken.x + (attackerToken.size || 1) / 2 - defCx;
  const atkVy = attackerToken.y + (attackerToken.size || 1) / 2 - defCy;
  const atkLen = Math.hypot(atkVx, atkVy) || 1;

  for (const ally of map.tokens) {
    if (ally.id === attackerToken.id || ally.id === defenderToken.id || ally.isHidden) continue;
    if (ally.type !== attackerToken.type) continue;
    const allyChar =
      ally.type === 'character' && ally.referenceId
        ? characters?.find((c) => c.id === ally.referenceId)
        : undefined;
    if (isTokenIncapacitated(ally, allyChar)) continue;

    const allyDist = getGridSpanDistance(
      ally.x,
      ally.y,
      ally.size || 1,
      defenderToken.x,
      defenderToken.y,
      defenderToken.size || 1,
      sqMeters
    );
    if (allyDist.squares > 1) continue;

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
}

/**
 * Evaluates all D&D 5e situational attack modifiers:
 * - Ranged attack while adjacent to a conscious hostile enemy (1.5m) -> Disadvantage
 * - GM 1-click next-attack Advantage / Disadvantage
 * - Manual Advantage/Disadvantage toggle
 * - Flanking (optional campaign setting) -> Advantage
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
  range?: string;
  actionTitle?: string;
  sqMeters?: number;
  enableFlanking?: boolean;
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
    range,
    actionTitle,
    sqMeters = 1.5,
    enableFlanking = true,
    manualAdvantageMode = 'normal',
    defenderDodging = false,
    isReaction = false,
  } = params;

  const advantages: string[] = [];
  const disadvantages: string[] = [];
  let autoCritOnHit = false;
  let gmOverrideUsed: 'advantage' | 'disadvantage' | undefined;
  let isRangedInMelee = false;
  let isFlanking = false;

  if (manualAdvantageMode === 'advantage') advantages.push('Vantagem (Manual)');
  if (manualAdvantageMode === 'disadvantage') disadvantages.push('Desvantagem (Manual)');

  if (attackerChar?.nextAttackRollOverride === 'advantage') {
    advantages.push('Vantagem (Mestre)');
    gmOverrideUsed = 'advantage';
  } else if (attackerChar?.nextAttackRollOverride === 'disadvantage') {
    disadvantages.push('Desvantagem (Mestre)');
    gmOverrideUsed = 'disadvantage';
  }

  if (defenderDodging) {
    disadvantages.push('Alvo Esquivando');
  }

  const maxRangeMeters = parseAttackRangeMeters(range, actionTitle);
  const isRangedAttack = !isReaction && maxRangeMeters > sqMeters + 0.05;
  const distInfo =
    attackerToken && defenderToken
      ? getGridSpanDistance(
          attackerToken.x,
          attackerToken.y,
          attackerToken.size || 1,
          defenderToken.x,
          defenderToken.y,
          defenderToken.size || 1,
          sqMeters
        )
      : null;

  // 1. Official D&D 5e Ranged Attack in Close Combat (any conscious hostile enemy within 1.5m)
  if (isRangedAttack && map && attackerToken) {
    const adjacentEnemy = hasAdjacentHostileEnemy(map, attackerToken, sqMeters, characters);
    if (adjacentEnemy) {
      isRangedInMelee = true;
      disadvantages.push(`Inimigo Colado (${adjacentEnemy.name} a 1,5m)`);
    }
  }

  // 2. Optional Flanking (Melee attack with opposite-side ally adjacent to defender)
  if (
    enableFlanking &&
    !isRangedAttack &&
    map &&
    attackerToken &&
    defenderToken
  ) {
    const flankAlly = isTargetFlankedBy(map, attackerToken, defenderToken, sqMeters, characters);
    if (flankAlly) {
      isFlanking = true;
      advantages.push(`Flanqueamento (${flankAlly.name})`);
    }
  }

  // 3. Attacker Conditions
  const atkConds = new Set([
    ...(attackerToken?.activeConditionIds || []),
    ...(attackerChar?.activeConditionIds || []),
  ]);
  if (atkConds.has('cond-invisivel')) advantages.push('Atacante Invisível');
  if (atkConds.has('cond-cego')) disadvantages.push('Atacante Cego');
  if (atkConds.has('cond-envenenado')) disadvantages.push('Atacante Envenenado');
  if (atkConds.has('cond-caido')) disadvantages.push('Atacante Caído');
  if (atkConds.has('cond-amedrontado')) disadvantages.push('Atacante Amedrontado');

  // 4. Defender Conditions
  const defConds = new Set([
    ...(defenderToken?.activeConditionIds || []),
    ...(defenderChar?.activeConditionIds || []),
  ]);
  const isAdjacentToDefender = distInfo ? distInfo.squares <= 1 : !isRangedAttack;
  if (defConds.has('cond-caido')) {
    if (isAdjacentToDefender) {
      advantages.push('Alvo Caído (≤ 1,5m)');
    } else {
      disadvantages.push('Alvo Caído (à Distância)');
    }
  }
  if (defConds.has('cond-cego')) advantages.push('Alvo Cego');
  if (defConds.has('cond-atordoado')) advantages.push('Alvo Atordoado');
  if (defConds.has('cond-paralisado')) {
    advantages.push('Alvo Paralisado');
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
  if (autoCritOnHit) {
    summaryBadges.push('Crítico Automático (Alvo Paralisado a 1,5m)');
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
