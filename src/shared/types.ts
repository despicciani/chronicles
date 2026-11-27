export type ThemeMode = 'dark-fantasy' | 'bright-fantasy';
export type UserRole = 'gm' | 'player';

export type CardRarity = 'comum' | 'raro' | 'epico' | 'lendario';
export type DiceSkin = 'gold' | 'fire' | 'ice' | 'emerald' | 'amethyst' | 'blood';
export type TokenFrameStyle = 'gold' | 'runic' | 'emerald' | 'crimson' | 'arcane';
export type ActionEconomyCost = 'Padrão' | 'Bônus' | 'Reação' | 'Livre';
export type PaperdollArchetype = 'warrior' | 'arcane' | 'rogue';
export type EquipSlot =
  | 'head'
  | 'amulet'
  | 'armor'
  | 'mainHand'
  | 'offHand'
  | 'ring'
  | 'boots';

export type MapViewMode = 'follow-gm' | 'token-map' | 'gm-peek';

export interface CampaignSettings {
  systemName: string;
  resourceName: string;
  resourceShort: string;
  baseDefense: number;
  useProficiencyBonus: boolean;
  useHalfLevelBonus: boolean;
  gridSquareMeters: number;
  attributePointBudget: number;
  maxTrainedSkills: number;
  attributePointsPerGain?: number;
  attributePointsEveryLevels?: number;
  showEnemyAcToPlayers?: boolean;
  enableFlanking?: boolean;
  /** Configurable D&D 5e Flanking rule: 'off', 'advantage' (DMG), or 'plus2' (+2 attack bonus house rule) */
  flankingMode?: 'off' | 'advantage' | 'plus2';
  xpThresholds?: number[];
  /** GM map visibility control: 'follow-gm' (all follow GM), 'token-map' (each player sees their token's map), 'gm-peek' (GM browses freely without pulling players) */
  mapViewMode?: MapViewMode;
  /** The map ID players stay on while the GM is in 'gm-peek' mode (or fallback in 'token-map') */
  playerVisibleMapId?: string;
}

export interface AttributeDef {
  id: string;
  code: string;
  name: string;
  shortName: string;
  description: string;
}

export interface SkillDef {
  id: string;
  name: string;
  defaultAttributeId: string;
  isSavingThrow?: boolean;
  description?: string;
}

export interface StatModifier {
  target:
    | 'attribute'
    | 'defense'
    | 'attack'
    | 'damage'
    | 'skill'
    | 'speed'
    | 'maxHp'
    | 'maxMp'
    | 'initiative'
    | 'save';
  targetId?: string;
  value: number;
  diceBonus?: string;
  label?: string;
}

export type LightEmissionMode = 'none' | 'shared' | 'personal-darkvision';

export type ConditionAuraVfx =
  | 'auto'
  | 'none'
  | 'fire'
  | 'blood'
  | 'holy'
  | 'poison'
  | 'frost'
  | 'shadow'
  | 'arcane'
  | 'lightning';

export interface ConditionDef {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  publicToPlayers?: boolean;
  preventsOpportunityAttacks?: boolean;
  lightMode?: LightEmissionMode;
  lightRadiusMeters?: number;
  auraVfx?: ConditionAuraVfx;
  grantedAbilityIds?: string[];
  extraActions?: number;
  extraBonusActions?: number;
  tickEffect?: {
    mode: 'damage' | 'heal';
    formula: string;
    damageType?: string;
    trigger: 'start' | 'end';
  };
  endOfTurnSave?: {
    skillId: string;
    dc: number;
  };
  resistances?: string[];
  vulnerabilities?: string[];
  immunities?: string[];
  transformImageUrl?: string;
  transformSize?: number;
  modifiers: StatModifier[];
}

export interface RaceDef {
  id: string;
  name: string;
  description: string;
  publicToPlayers?: boolean;
  speed: number;
  size: 'Pequeno' | 'Médio' | 'Grande';
  vision: string;
  attributeBonuses: Record<string, number>;
  customTraits: string[];
  abilityIds: string[];
}

export interface ClassLevelFeature {
  level: number;
  featureName: string;
  description: string;
  abilityIds?: string[];
}

export interface ClassDef {
  id: string;
  name: string;
  description: string;
  publicToPlayers?: boolean;
  hitDie: number;
  hpPerLevel: number;
  mpPerLevel: number;
  keyAttributeId: string;
  proficiencies: string[];
  numTrainedSkills: number;
  color: string;
  paperdollArchetype?: PaperdollArchetype;
  levelFeatures: ClassLevelFeature[];
}

export interface CustomResourceDef {
  id: string;
  name: string;
  shortName: string;
  color: string;
  baseMax: number;
  perLevel: number;
  resetOn: 'short' | 'long' | 'manual';
}

export interface AbilityDef {
  id: string;
  name: string;
  category: 'Habilidade de Classe' | 'Poder Racial' | 'Magia' | 'Talento' | 'Ataque Especial';
  actionType: 'Padrão' | 'Movimento' | 'Bônus' | 'Reação' | 'Livre' | 'Passiva';
  costMp: number;
  costResourceId?: string;
  maxUsesPerRest?: number;
  restType?: 'curto' | 'longo';
  range: string;
  duration: string;
  description: string;
  attackFormula?: string;
  damageFormula?: string;
  damageType?: string;
  saveSkillId?: string;
  saveDcFormula?: string;
  /** When false (e.g. Chama Sagrada / cantrips), a passed saving throw deals 0 damage instead of half */
  halfOnSuccess?: boolean;
  applyConditionId?: string;
  conditionDurationRounds?: number;
  conditionDurationFormula?: string;
  requiresConcentration?: boolean;
  singleTargetOnly?: boolean;
  sfxPreset?: string;
  vfxKind?: ProjectileVfxKind;
  aoeShape?: 'sphere' | 'cone' | 'line' | 'cube';
  aoeSizeMeters?: number;
  aoeColor?: string;
  aoePersistent?: boolean;
  aoeTargetFilter?: 'all' | 'exclude-caster' | 'exclude-allies';
  createsSurface?: ElementalSurfaceKind;
  isTeleport?: boolean;
  teleportRequiresSight?: boolean;
  teleportAoeOrigin?: 'departure' | 'arrival';
  /** Marks this ability as an anime-style Ultimate Technique (triggers synchronized full-screen Cut-In!) */
  isUltimate?: boolean;
  ultimateCatchphrase?: string;
  ultimateColor?: string;
  ultimateImageUrl?: string;
  ultimateStyle?: CutInStylePreset;
  ultimateSfxPreset?: UltimateSfxPreset;
  ultimateSfxUrl?: string;
  /** Marks this Ultimate as a Domain Expansion / Field Atmosphere that transforms the battlemap while active */
  isDomainExpansion?: boolean;
  domainTheme?: DomainThemePreset;
  domainDurationRounds?: number;
  domainMusicUrl?: string;
  publicToPlayers?: boolean;
  lightMode?: LightEmissionMode;
  lightRadiusMeters?: number;
  imageUrl?: string;
}

export interface BossPhaseDef {
  id: string;
  hpThresholdPct: number;
  title: string;
  description?: string;
  restoreLegendaryActions?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  type: 'Arma' | 'Armadura' | 'Escudo' | 'Consumível' | 'Item Mágico' | 'Equipamento' | 'Carta';
  slot?: EquipSlot;
  rarity?: CardRarity;
  weight: number;
  valueGold: number;
  description: string;
  letterText?: string;
  attackFormula?: string;
  damageFormula?: string;
  damageType?: string;
  range?: string;
  critRange?: number;
  critMultiplier?: number;
  grantedAbilityId?: string;
  maxCharges?: number;
  rechargeType?: 'long-rest' | 'short-rest' | 'consumable';
  defenseBonus?: number;
  modifiers?: StatModifier[];
  publicToPlayers?: boolean;
  lightMode?: LightEmissionMode;
  lightRadiusMeters?: number;
  imageUrl?: string;
}

export interface MonsterAttack {
  name: string;
  attackBonus: number;
  damageFormula: string;
  damageType: string;
  range?: string;
  notes?: string;
  sourceAbilityId?: string;
  sourceItemId?: string;
  actionType?: ActionEconomyCost;
  applyConditionId?: string;
  conditionDurationRounds?: number;
  saveSkillId?: string;
  saveDcFormula?: string;
  halfOnSuccess?: boolean;
  aoeShape?: 'sphere' | 'cone' | 'line' | 'cube';
  aoeSizeMeters?: number;
  aoeColor?: string;
  aoePersistent?: boolean;
  aoeTargetFilter?: 'all' | 'exclude-caster' | 'exclude-allies';
  createsSurface?: ElementalSurfaceKind;
  sfxPreset?: string;
  vfxKind?: ProjectileVfxKind;
  isTeleport?: boolean;
  teleportRequiresSight?: boolean;
  teleportAoeOrigin?: 'departure' | 'arrival';
}

export interface MonsterDef {
  id: string;
  name: string;
  type: string;
  size: 'Pequeno' | 'Médio' | 'Grande' | 'Enorme' | 'Colossal';
  gridSize?: number;
  cr: string;
  maxHp: number;
  defense: number;
  speed: number;
  initiativeBonus: number;
  attributes: Record<string, number>;
  saves: { fort: number; ref: number; von: number; for?: number; int?: number; car?: number };
  attacks: MonsterAttack[];
  abilities: string[];
  damageResistances?: string[];
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  skills?: string[];
  loot?: string;
  lootGoldFormula?: string;
  lootItems?: Array<{ itemId: string; quantity: number }>;
  secretNotes?: string;
  description: string;
  tokenColor: string;
  imageUrl?: string;
  hideAcFromPlayers?: boolean;
  hideHpFromPlayers?: boolean;
  hideNameFromPlayers?: boolean;
  lightSource?: string;
  lightMode?: LightEmissionMode;
  lightRadiusMeters?: number;
  lightLabel?: string;
  isBoss?: boolean;
  bossTitle?: string;
  bossPhase2HpPct?: number;
  bossPhase2Title?: string;
  bossPhases?: BossPhaseDef[];
  triggeredBossPhaseIds?: string[];
  legendaryActionsMax?: number;
  legendaryResistancesMax?: number;
}

export interface InventoryEntry {
  id: string;
  itemId: string;
  quantity: number;
  equipped: boolean;
  equippedSlot?: EquipSlot;
  chargesRemaining?: number;
  customNotes?: string;
}

export interface CharacterCustomAttack {
  id: string;
  name: string;
  attackBonusFormula: string;
  damageFormula: string;
  damageType: string;
  range: string;
  rarity: CardRarity;
  notes?: string;
  imageUrl?: string;
}

export type DomainThemePreset = 'sonic' | 'void' | 'crimson' | 'frost' | 'solar' | 'emerald';
export type CutInStylePreset =
  | 'anime-impact'
  | 'persona-slash'
  | 'dimension-rift'
  | 'blood-eclipse'
  | 'divine-judgment'
  | 'storm-overdrive'
  | 'shattered-mirror';
export type UltimateSfxPreset =
  | 'bass-drop'
  | 'sonic-boom'
  | 'anime-slash'
  | 'dimension-rift'
  | 'demonic-roar'
  | 'time-stop'
  | 'celestial-choir'
  | 'inferno-nova';

export const CUT_IN_STYLE_OPTIONS: Array<{ value: CutInStylePreset; label: string; shortLabel: string }> = [
  { value: 'anime-impact', label: 'Impacto Anime (Lâmina + Impact Frame)', shortLabel: 'Impacto Anime' },
  { value: 'persona-slash', label: 'Rasgo Diagonal (Estilo Persona 5)', shortLabel: 'Rasgo Persona' },
  { value: 'dimension-rift', label: 'Fenda Dimensional (Rachadura + Selo)', shortLabel: 'Fenda Dimensional' },
  { value: 'blood-eclipse', label: 'Eclipse Demoníaco (Corona + Brasas)', shortLabel: 'Eclipse Demoníaco' },
  { value: 'divine-judgment', label: 'Juízo Divino (Pilares de Luz + Halo)', shortLabel: 'Juízo Divino' },
  { value: 'storm-overdrive', label: 'Tempestade (Sobrecarga de Raios)', shortLabel: 'Tempestade' },
  { value: 'shattered-mirror', label: 'Espelho Estilhaçado (Tempo Parado)', shortLabel: 'Espelho / Tempo' },
];

export const ULTIMATE_SFX_OPTIONS: Array<{ value: UltimateSfxPreset; label: string; shortLabel: string }> = [
  { value: 'bass-drop', label: 'Bass Drop / Domínio (Sub-grave épico)', shortLabel: 'Bass Drop' },
  { value: 'sonic-boom', label: 'Pulso Sônico / Ressonância', shortLabel: 'Pulso Sônico' },
  { value: 'anime-slash', label: 'Corte / Trovão Anime (Katana dupla)', shortLabel: 'Corte Anime' },
  { value: 'dimension-rift', label: 'Ruptura Dimensional (Estilhaço)', shortLabel: 'Ruptura' },
  { value: 'demonic-roar', label: 'Rugido Abissal / Despertar Demoníaco', shortLabel: 'Rugido Abissal' },
  { value: 'time-stop', label: 'Parada Temporal (Relógio + Distorção)', shortLabel: 'Parada Temporal' },
  { value: 'celestial-choir', label: 'Coro Celestial / Julgamento Divino', shortLabel: 'Coro Celestial' },
  { value: 'inferno-nova', label: 'Supernova / Explosão Infernal', shortLabel: 'Supernova' },
];

export interface CharacterForm {
  id: string;
  name: string;
  portraitUrl: string;
  tokenColor?: string;
  frameStyle?: TokenFrameStyle;
  auraColor?: string;
  catchphrase?: string;
  bonusAc?: number;
  bonusSpeed?: number;
  cinematicTransform?: boolean;
  isDefault?: boolean;
}

export interface CutInCinematicEvent {
  id: string;
  kind: 'ultimate' | 'domain' | 'domain-clash' | 'transform';
  actorName: string;
  techniqueName: string;
  catchphrase?: string;
  color: string;
  portraitUrl?: string;
  style?: CutInStylePreset;
  sfxPreset?: UltimateSfxPreset;
  sfxUrl?: string;
  casterTokenId?: string;
  mapId?: string;
  domainTheme?: DomainThemePreset;
  createdAt: number;
}

export interface ActiveDomainState {
  id: string;
  mapId: string;
  name: string;
  catchphrase?: string;
  casterName: string;
  casterCharacterId?: string;
  casterTokenId?: string;
  color: string;
  theme: DomainThemePreset;
  portraitUrl?: string;
  musicUrl?: string;
  remainingRounds?: number;
}

export type RpSpotlightTone = 'normal' | 'serious' | 'intense' | 'whisper' | 'epic';

export interface RpSpotlightEntry {
  id: string;
  slot: 'left' | 'right';
  speakerName: string;
  subtitle?: string;
  characterId?: string;
  tokenId?: string;
  portraitUrl?: string;
  color: string;
  frameStyle?: TokenFrameStyle;
  dialogue: string;
  tone: RpSpotlightTone;
  updatedAt: number;
}

export interface RpSpotlightState {
  left: RpSpotlightEntry | null;
  right: RpSpotlightEntry | null;
}

export interface CharacterCustomAbility {
  id: string;
  name: string;
  actionType: 'Padrão' | 'Movimento' | 'Bônus' | 'Reação' | 'Livre' | 'Passiva';
  costMp: number;
  costResourceId?: string;
  attackFormula?: string;
  damageFormula?: string;
  damageType?: string;
  range: string;
  rarity: CardRarity;
  description: string;
  isTeleport?: boolean;
  teleportRequiresSight?: boolean;
  isUltimate?: boolean;
  ultimateCatchphrase?: string;
  ultimateColor?: string;
  ultimateImageUrl?: string;
  ultimateStyle?: CutInStylePreset;
  ultimateSfxPreset?: UltimateSfxPreset;
  ultimateSfxUrl?: string;
  isDomainExpansion?: boolean;
  domainTheme?: DomainThemePreset;
  domainDurationRounds?: number;
  domainMusicUrl?: string;
  imageUrl?: string;
}

export interface ActiveTrackedAbilityEffect {
  abilityKey: string;
  abilityName: string;
  conditionId?: string;
  targetTokenIds: string[];
  targetCharacterIds: string[];
  targetNames: string[];
  isConcentration?: boolean;
  singleTargetOnly?: boolean;
}

export interface Character {
  id: string;
  vaultId?: string;
  lastSyncedAt?: string;
  ownerPlayerId?: string;
  playerName: string;
  playerColor: string;
  tokenFrameStyle?: TokenFrameStyle;
  diceSkin?: DiceSkin;
  paperdollArchetype?: PaperdollArchetype;
  nextAttackRollOverride?: 'advantage' | 'disadvantage' | null;
  damageResistances?: string[];
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  concentratingSpell?: string | null;
  /** Optional GM override for Extra Attack count per Attack Action (defaults to D&D 5e class/level) */
  extraAttacksOverride?: number;
  activeTrackedEffects?: ActiveTrackedAbilityEffect[];
  themeMusicUrl?: string;
  themeMusicTitle?: string;
  name: string;
  raceId: string;
  classId: string;
  level: number;
  xp?: number;
  hasInspiration?: boolean;
  inspirationPoints?: number;
  unspentAttributePoints?: number;
  attributes: Record<string, number>;
  trainedSkillIds: string[];
  /** Up to 6 player-pinned favorite skills shown for 1-click rolling on the Player HUD */
  favoriteSkillIds?: string[];
  hp: number;
  maxHpOverride?: number;
  tempHp: number;
  mp: number;
  maxMpOverride?: number;
  defenseOverride?: number;
  speedOverride?: number;
  customResourceValues?: Record<string, { current: number; maxOverride?: number }>;
  knownAbilityIds: string[];
  customAttacks: CharacterCustomAttack[];
  customAbilities: CharacterCustomAbility[];
  abilityUsesRemaining: Record<string, number>;
  resourceTrackers?: Array<{
    id: string;
    name: string;
    current: number;
    max: number;
    resetOn: 'short' | 'long' | 'manual';
  }>;
  activeConditionIds: string[];
  inventory: InventoryEntry[];
  gold: number;
  portraitUrl: string;
  tokenColor: string;
  /** Alternate visual/mechanical forms or transformations (Base, Awakened, Disguised, Injured, etc.) */
  forms?: CharacterForm[];
  activeFormId?: string | null;
  /** Tracks Fighter Action Surge (Surto de Ação) across combats until next Short or Long Rest */
  actionSurgeUsed?: boolean;
  background: string;
  notes: string;
  deathSaves: {
    successes: number;
    failures: number;
    stabilized?: boolean;
    dead?: boolean;
    assistedBy?: string;
  };
}

export interface MapToken {
  id: string;
  name: string;
  type: 'character' | 'monster' | 'npc';
  referenceId?: string;
  x: number;
  y: number;
  size: number;
  hp: number;
  maxHp: number;
  defense: number;
  activeConditionIds: string[];
  isHidden: boolean;
  faction?: 'ally' | 'enemy' | 'neutral';
  visibleToCharacterIds?: string[];
  controlledByCharacterId?: string;
  /** Token ID of the creature currently grappling this token (D&D 5e Grapple tracking) */
  grappledByTokenId?: string | null;
  /** Real 3D elevation in meters above ground (0 or undefined = ground; increments of 1.5m) */
  elevationMeters?: number;
  /** Active Hide (Stealth) roll total stored separately from Invisibility spell */
  stealthTotal?: number | null;
  lootDropped?: boolean;
  color: string;
  frameStyle?: TokenFrameStyle;
  imageUrl?: string;
  hideAcFromPlayers?: boolean;
  hideHpFromPlayers?: boolean;
  hideNameFromPlayers?: boolean;
  lightSource?: string;
  lightMode?: LightEmissionMode;
  lightRadiusMeters?: number;
  lightLabel?: string;
  isBoss?: boolean;
  bossTitle?: string;
  bossPhase?: number;
  bossPhase2HpPct?: number;
  bossPhase2Title?: string;
  bossPhases?: BossPhaseDef[];
  triggeredBossPhaseIds?: string[];
  legendaryActionsMax?: number;
  legendaryActionsRemaining?: number;
  legendaryResistancesMax?: number;
  legendaryResistancesRemaining?: number;
}

export interface AoETemplate {
  id: string;
  shape: 'sphere' | 'cone' | 'line' | 'cube';
  x: number;
  y: number;
  radiusSquares: number;
  angleDeg: number;
  color: string;
  label: string;
}

export type GmMarkerKind = 'chest' | 'item' | 'trap' | 'secret' | 'door' | 'light';
export type TerrainCellKind = 'wall' | 'cover' | 'difficult';
export type ElementalSurfaceKind = 'fire' | 'ice' | 'acid' | 'water';

export type WallCellShape =
  | 'full'
  | 'half-top'
  | 'half-bottom'
  | 'half-left'
  | 'half-right'
  | 'edge-top'
  | 'edge-bottom'
  | 'edge-left'
  | 'edge-right'
  | 'bar-h'
  | 'bar-v'
  | 'diag-tl'
  | 'diag-tr'
  | 'diag-bl'
  | 'diag-br'
  | 'pillar';

export interface WallCellMeta {
  shape: WallCellShape;
  /** 0..1 opacity (1 = solid masonry, 0.5 = semi-transparent, 0 = invisible to players / ghost outline for GM) */
  opacity?: number;
}

export interface ElementalSurfaceConfig {
  fireDamageFormula?: string;
  acidDamageFormula?: string;
  iceSaveDc?: number;
}

export interface GmMapMarker {
  id: string;
  x: number;
  y: number;
  kind: GmMarkerKind;
  title: string;
  description?: string;
  revealed: boolean;
  visibleToCharacterIds?: string[];
  perceptionDc?: number;
  doorState?: 'open' | 'closed' | 'locked';
  lockDc?: number;
  lightRadiusMeters?: number;
  lightColor?: string;
  lightEnabled?: boolean;
  lootItems?: Array<{ itemId: string; quantity: number }>;
  lootGold?: number;
  trapDc?: number;
  trapSaveSkillId?: string;
  trapDamageFormula?: string;
  trapDamageType?: string;
  trapTriggered?: boolean;
  targetMapId?: string;
  targetMarkerId?: string;
}

export interface SecretPassageAlert {
  id: string;
  markerId: string;
  markerTitle: string;
  markerDescription?: string;
  sourceMapId: string;
  targetMapId?: string;
  targetMapName?: string;
  targetMarkerId?: string;
  targetMarkerTitle?: string;
  tokenId?: string;
  tokenName?: string;
  revealed: boolean;
  visibleToCharacterIds?: string[];
}

export interface MapDrawingStroke {
  id: string;
  mapId: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  authorName: string;
  permanent?: boolean;
  createdAt: number;
}

export interface TokenSpeechEvent {
  id: string;
  mapId: string;
  tokenId: string;
  speakerName: string;
  color: string;
  text?: string;
  reaction?: 'alert' | 'question' | 'thinking' | 'combat' | 'skull' | 'heart';
  createdAt: number;
}

export type MapThemePreset =
  | 'crypt'
  | 'tavern'
  | 'forest'
  | 'desert'
  | 'castle'
  | 'void'
  | 'volcano'
  | 'glacier'
  | 'swamp'
  | 'arena'
  | 'abyss'
  | 'city'
  | 'ocean'
  | 'sanctuary';

export type BattleScarKind =
  | 'black-flash'
  | 'blood-slash'
  | 'crater'
  | 'scorch'
  | 'frost-shatter'
  | 'acid-pool';

export interface BattleScar {
  id: string;
  x: number;
  y: number;
  size: number;
  kind: BattleScarKind;
  rotation: number;
  color?: string;
  createdAt: number;
}

export interface BlackFlashCinematicEvent {
  id: string;
  attackerName: string;
  attackerColor?: string;
  targetName?: string;
  targetTokenId?: string;
  mapId?: string;
  damageTotal?: number;
  createdAt: number;
}

export interface ExecutionCinematicEvent {
  id: string;
  killerName: string;
  killerColor?: string;
  killerPortraitUrl?: string;
  victimName: string;
  victimTokenId?: string;
  isBoss?: boolean;
  damageType?: string;
  mapId?: string;
  createdAt: number;
}

export interface TacticalMap {
  id: string;
  name: string;
  mode: 'tactical' | 'scene';
  backgroundUrl: string;
  backgroundNaturalWidth?: number;
  backgroundNaturalHeight?: number;
  themePreset: MapThemePreset;
  gridWidth: number;
  gridHeight: number;
  gridSizePx: number;
  fogEnabled: boolean;
  darknessEnabled?: boolean;
  revealedCells: string[];
  terrainCells?: Record<string, TerrainCellKind>;
  wallMeta?: Record<string, WallCellMeta>;
  elementalSurfaces?: Record<string, ElementalSurfaceKind>;
  surfaceConfig?: ElementalSurfaceConfig;
  weather: 'none' | 'rain' | 'embers' | 'snow' | 'mist';
  weatherEffectsEnabled?: boolean;
  timeOfDay?: 'none' | 'dawn' | 'day' | 'dusk' | 'night' | 'bloodmoon' | 'toxic';
  sceneNpcIds: string[];
  tokens: MapToken[];
  templates: AoETemplate[];
  gmMarkers?: GmMapMarker[];
  drawings?: MapDrawingStroke[];
  battleScars?: BattleScar[];
}

export interface ActiveCombatEffect {
  id: string;
  label: string;
  conditionId?: string;
  remainingRounds: number;
  sourceName?: string;
}

export interface Combatant {
  id: string;
  tokenId?: string;
  referenceId?: string;
  controlledByCharacterId?: string;
  type: 'character' | 'monster';
  name: string;
  initiative: number;
  d20Roll?: number;
  initBonus?: number;
  hp: number;
  maxHp: number;
  defense: number;
  speedMeters: number;
  remainingMoveMeters: number;
  actionAvailable: boolean;
  actionsRemaining?: number;
  bonusActionAvailable: boolean;
  bonusActionsRemaining?: number;
  reactionAvailable: boolean;
  disengaged?: boolean;
  dodging?: boolean;
  /** Remaining weapon/shove/grapple attacks granted by Extra Attack from the current Attack Action */
  extraAttacksRemaining?: number;
  /** D&D 5e Ready Action (Preparar Ação): spends Action on turn, lets combatant trigger a Standard action off-turn as a Reaction */
  readyAction?: { trigger?: string; preparedAtRound: number } | null;
  /** Tracks whether Fighter Action Surge (Surto de Ação) was already used since last rest */
  actionSurgeUsed?: boolean;
  /** BG3 Opening Strike Rule: preserves opening attack cost until this combatant's actual Round 1 turn begins */
  pendingOpeningCost?: ActionEconomyCost | null;
  /** Preserves whether the opening strike was a weapon attack so Extra Attack unlocks on Round 1 */
  pendingOpeningIsWeaponAttack?: boolean;
  /** BG3 Revive Rule: when revived off-turn from 0 PV (heal/Help/Death Save), loses Standard Action on next turn */
  revivedLostActionPending?: boolean;
  /** Prevents rolling more than 1 Death Save in the same turn even when Extra Actions (Haste) exist */
  deathSaveRolledThisTurn?: boolean;
  concentratingSpell?: string | null;
  isHidden: boolean;
  color: string;
  effects: ActiveCombatEffect[];
}

export interface CombatState {
  active: boolean;
  round: number;
  currentTurnIndex: number;
  combatants: Combatant[];
}

export interface RolledDieVisual {
  sides: number;
  value: number;
  discarded?: boolean;
  label?: string;
}

export interface PlayerRequest {
  id: string;
  characterId: string;
  characterName: string;
  characterPortraitUrl?: string;
  playerColor: string;
  requesterPlayerId?: string;
  requesterPlayerName?: string;
  type: 'short-rest' | 'long-rest' | 'heal-mp' | 'claim-hero' | 'import-hero' | 'custom';
  label: string;
  note?: string;
  heroPayload?: Character;
  createdAt: string;
}

export interface PendingAttackChoice {
  attackerTokenId?: string;
  attackerName: string;
  attackerColor: string;
  attackerImageUrl?: string;
  attackerFrame?: TokenFrameStyle;
  attackerCharacterId?: string;
  diceSkin: DiceSkin;
  actionTitle: string;
  attackFormula?: string;
  damageFormula?: string;
  damageType?: string;
  range?: string;
  actionCost?: ActionEconomyCost;
  costMp?: number;
  costResourceId?: string;
  chargedInventoryEntryId?: string;
  applyConditionId?: string;
  conditionDurationRounds?: number;
  conditionDurationFormula?: string;
  requiresConcentration?: boolean;
  singleTargetOnly?: boolean;
  sfxPreset?: string;
  vfxKind?: ProjectileVfxKind;
  isShoveManeuver?: boolean;
  isGrappleManeuver?: boolean;
  /** True for weapon attacks, custom attacks, Shove & Grapple (eligible for D&D 5e Extra Attack) */
  isWeaponAttack?: boolean;
  /** True when triggered off-turn via D&D 5e Ready Action (spends Reaction & clears readyAction) */
  isReadyReactionTrigger?: boolean;
  /** True when launched from Boss Legendary Action bar (deducts 1 Legendary Action upon execution, not before targeting) */
  isLegendaryAction?: boolean;
  critRange?: number;
  critMultiplier?: number;
  saveSkillId?: string;
  saveDcFormula?: string;
  halfOnSuccess?: boolean;
  aoeShape?: 'sphere' | 'cone' | 'line' | 'cube';
  aoeSizeMeters?: number;
  aoeColor?: string;
  aoePersistent?: boolean;
  aoeTargetFilter?: 'all' | 'exclude-caster' | 'exclude-allies';
  createsSurface?: ElementalSurfaceKind;
  isTeleport?: boolean;
  teleportRequiresSight?: boolean;
  teleportAoeOrigin?: 'departure' | 'arrival';
  isUltimate?: boolean;
  ultimateCatchphrase?: string;
  ultimateColor?: string;
  ultimateImageUrl?: string;
  ultimateStyle?: CutInStylePreset;
  ultimateSfxPreset?: UltimateSfxPreset;
  ultimateSfxUrl?: string;
  isDomainExpansion?: boolean;
  domainTheme?: DomainThemePreset;
  domainDurationRounds?: number;
  domainMusicUrl?: string;
}

export interface OpportunityAttackPrompt {
  id: string;
  reactorTokenId: string;
  reactorName: string;
  reactorColor: string;
  reactorType: 'character' | 'monster';
  reactorReferenceId?: string;
  targetTokenId: string;
  targetName: string;
  attacks: PendingAttackChoice[];
}

export interface CombatDuelState {
  id: string;
  attackerTokenId?: string;
  attackerCharacterId?: string;
  attackerName: string;
  attackerColor: string;
  attackerImageUrl?: string;
  attackerFrame?: TokenFrameStyle;
  defenderTokenId: string;
  defenderCharacterId?: string;
  defenderType?: 'character' | 'monster' | 'npc';
  defenderName: string;
  defenderColor: string;
  defenderImageUrl?: string;
  defenderFrame?: TokenFrameStyle;
  defenderDefense: number;
  defenderHpBefore: number;
  defenderMaxHp: number;
  actionTitle: string;
  diceSkin: DiceSkin;
  rawAttackFormula?: string;
  attackFormula?: string;
  attackRolledDice: RolledDieVisual[];
  attackTotal?: number;
  d20Natural?: number;
  isCrit: boolean;
  isFumble: boolean;
  hitSuccess: boolean;
  damageFormula?: string;
  damageType?: string;
  damageRolledDice?: RolledDieVisual[];
  damageTotal?: number;
  damageApplied?: boolean;
  situationalModifiers?: string[];
  effectiveAdvantageMode?: 'normal' | 'advantage' | 'disadvantage';
  flankingAttackBonus?: number;
  hasAdjacentAllyForSneak?: boolean;
  adjacentAllyName?: string;
  defenderCanShieldReaction?: boolean;
  reactionShieldApplied?: boolean;
  defenderCanUncannyDodge?: boolean;
  reactionUncannyDodgeApplied?: boolean;
  defenderReactionDismissed?: boolean;
  applyConditionId?: string;
  conditionDurationRounds?: number;
  conditionDurationFormula?: string;
  sfxPreset?: string;
  vfxKind?: ProjectileVfxKind;
  autoCritOnHit?: boolean;
  critRange?: number;
  critMultiplier?: number;
  actionCost?: ActionEconomyCost;
  autoStartCombatOnClose?: boolean;
  /** Preserves original attack choice metadata so canceling in ready-attack can refund deferred costs cleanly */
  deferredCostCommitted?: boolean;
  isLegendaryAction?: boolean;
  costMp?: number;
  costResourceId?: string;
  chargedInventoryEntryId?: string;
  isWeaponAttack?: boolean;
  isReadyReactionTrigger?: boolean;
  requiresConcentration?: boolean;
  singleTargetOnly?: boolean;
  phase: 'ready-attack' | 'rolling-attack' | 'attack-result' | 'rolling-damage' | 'damage-result';
}

export interface PendingManualRoll {
  id: string;
  title: string;
  subtitle?: string;
  formula: string;
  displayFormula?: string;
  previewDice: RolledDieVisual[];
  rollerName: string;
  rollerColor: string;
  diceSkin: DiceSkin;
  allowAdvantageToggle?: boolean;
  advantageMode: 'normal' | 'advantage' | 'disadvantage';
  onExecute: (chosenMode: 'normal' | 'advantage' | 'disadvantage') => void;
  onCancel?: () => void;
}

export interface InitiativeCeremonyEntry {
  id: string;
  name: string;
  type: 'character' | 'monster';
  color: string;
  imageUrl?: string;
  frameStyle?: TokenFrameStyle;
  d20Roll: number;
  bonus: number;
  total: number;
}

export interface InitiativeCeremonyState {
  id: string;
  entries: InitiativeCeremonyEntry[];
}

export interface RollLogEntry {
  id: string;
  timestamp: string;
  rollerName: string;
  rollerRole: UserRole;
  rollerPlayerId?: string;
  rollerColor?: string;
  diceSkin?: DiceSkin;
  title: string;
  formula: string;
  individualRolls: string[];
  rolledDice?: RolledDieVisual[];
  d20Natural?: number;
  total: number;
  isCrit?: boolean;
  isFumble?: boolean;
  /** True only for combat attack rolls (used to scope Black Flash strictly to Natural 20 attack rolls) */
  isAttackRoll?: boolean;
  damageTotal?: number;
  damageType?: string;
  targetName?: string;
  targetTokenId?: string;
  targetDefense?: number;
  hitStatus?: 'hit' | 'miss' | null;
  isSecret: boolean;
  details: string;
  applied?: boolean;
}

export interface Quest {
  id: string;
  title: string;
  category: 'Principal' | 'Secundária' | 'Pessoal';
  status: 'Ativa' | 'Concluída' | 'Falhou';
  description: string;
  reward: string;
  giverName: string;
}

export interface NpcEntry {
  id: string;
  name: string;
  role: string;
  location: string;
  imageUrl: string;
  tokenColor?: string;
  publicBio: string;
  secretNotes: string;
  sharedPartyNotes: string;
  revealedToPlayers: boolean;
  hideNameFromPlayers?: boolean;
  hideAcFromPlayers?: boolean;
  hideHpFromPlayers?: boolean;
  disposition: 'Aliado' | 'Neutro' | 'Hostil' | 'Desconhecido';
  combatEnabled?: boolean;
  level?: number;
  maxHp?: number;
  defense?: number;
  speed?: number;
  initiativeBonus?: number;
  attributes?: Record<string, number>;
  saves?: { fort: number; ref: number; von: number; for?: number; int?: number; car?: number };
  skills?: string[];
  abilities?: string[];
  attacks?: MonsterAttack[];
  damageResistances?: string[];
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  loot?: string;
  personality?: string;
}

export interface GmNote {
  id: string;
  title: string;
  folder: 'Trama' | 'Locais' | 'Facções' | 'Segredos' | 'Encontros';
  content: string;
  updatedAt: string;
}

export interface SharedLootItem {
  id: string;
  name: string;
  quantity: number;
  notes: string;
}

export interface HandoutPayload {
  id: string;
  title: string;
  imageUrl?: string;
  text?: string;
  targetPlayerName?: string;
  recipientCharacterIds?: string[];
  sentAt: string;
}

export interface CustomMusicTrack {
  id: string;
  title: string;
  url: string;
  category: 'ambient' | 'theme' | 'boss' | 'combat' | 'tavern' | 'drama';
}

export interface BossBannerState {
  id: string;
  tokenId?: string;
  monsterId?: string;
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  imageUrl?: string;
  color: string;
  active: boolean;
  legendaryActionsMax?: number;
  legendaryActionsRemaining?: number;
}

export interface MapPointerState {
  playerId: string;
  playerName: string;
  color: string;
  mapId: string;
  xPct: number;
  yPct: number;
  active: boolean;
  updatedAt: number;
}

export interface ConnectedPlayerInfo {
  socketId: string;
  playerId: string;
  playerName: string;
  playerColor: string;
  role: UserRole;
  characterId?: string;
  characterName?: string;
}

export interface SkillCheckRequest {
  id: string;
  skillOrAttrId: string;
  label: string;
  dc: number;
  /** Optional targeted hero IDs; if empty/omitted, applies to the active map/party */
  targetCharacterIds?: string[];
  /** Human-readable scope label shown on the banner (e.g. 'Todos', 'Mapa Atual', '2 Heróis') */
  targetScopeLabel?: string;
  /** When true, only the GM sees the DC and pass/fail verdict */
  hideDc?: boolean;
  /** Official D&D 5e Group Check: succeeds if at least 50% of participants pass */
  isGroupCheck?: boolean;
  createdAt: string;
  results: Array<{
    characterId: string;
    characterName: string;
    playerColor: string;
    total: number;
    d20?: number;
    passed: boolean;
  }>;
}

export interface FallDamagePrompt {
  id: string;
  mapId: string;
  tokenId: string;
  characterId?: string;
  name: string;
  color: string;
  heightMeters: number;
  diceCount: number;
  canFeatherFall: boolean;
  featherFallMpCost?: number;
  reason?: string;
}

export interface CounterspellReactorEntry {
  tokenId: string;
  characterId?: string;
  name: string;
  color: string;
  mpCost: number;
  spellcastingMod: number;
}

export interface CounterspellPrompt {
  id: string;
  casterName: string;
  casterTokenId?: string;
  casterColor: string;
  spellName: string;
  spellLevel: number;
  reactors: CounterspellReactorEntry[];
  resolved?: {
    countered: boolean;
    reactorName: string;
    summary: string;
  } | null;
}

export interface CardRewardNotification {
  id: string;
  targetCharacterId?: string;
  characterName: string;
  cardTitle: string;
  cardSubtitle: string;
  rarity: CardRarity;
  description: string;
}

export interface TacticalSaveTargetEntry {
  tokenId: string;
  characterId?: string;
  name: string;
  type: 'character' | 'monster' | 'npc';
  color: string;
  imageUrl?: string;
  status: 'pending' | 'passed' | 'failed';
  d20?: number;
  bonus?: number;
  total?: number;
  damageToApply: number;
  /** Exact HP snapshot when the save prompt began (prevents Legendary Resistance overkill refund exploits) */
  hpBeforeSave?: number;
  applied?: boolean;
}

export interface TacticalSavePrompt {
  id: string;
  kind: 'trap' | 'aoe' | 'concentration' | 'condition-save';
  title: string;
  subtitle?: string;
  saveSkillId: string;
  saveLabel: string;
  dc: number;
  damageFormula?: string;
  damageType?: string;
  halfOnSuccess?: boolean;
  rolledRawDamage?: number;
  applyConditionId?: string;
  removeConditionOnPassId?: string;
  conditionDurationRounds?: number;
  casterCharacterId?: string;
  casterName?: string;
  requiresConcentration?: boolean;
  singleTargetOnly?: boolean;
  targets: TacticalSaveTargetEntry[];
}

export interface ChatMessageEntry {
  id: string;
  timestamp: string;
  senderName: string;
  senderRole: UserRole;
  senderColor: string;
  senderPlayerId?: string;
  characterName?: string;
  recipientName?: string;
  recipientPlayerId?: string;
  isWhisper: boolean;
  text: string;
  imageUrl?: string;
  speakerTokenId?: string;
}

export interface SavedHeroEntry {
  id: string;
  character: Character;
  savedAt: string;
  updatedAt: string;
  originCampaignId?: string;
  originCampaignName?: string;
}

export interface CampaignSummary {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  gmName: string;
  updatedAt: string;
  characterCount: number;
}

export interface Compendium {
  attributes: AttributeDef[];
  skills: SkillDef[];
  conditions: ConditionDef[];
  races: RaceDef[];
  classes: ClassDef[];
  abilities: AbilityDef[];
  items: ItemDef[];
  monsters: MonsterDef[];
  customDamageTypes?: string[];
  customResources?: CustomResourceDef[];
}

export type ProjectileVfxKind =
  | 'arrow'
  | 'fireball'
  | 'lightning'
  | 'frost'
  | 'arcane'
  | 'heal'
  | 'curse'
  | 'blessing'
  | 'slash'
  | 'radiant'
  | 'necrotic'
  | 'poison'
  | 'blood'
  | 'thunder';

export interface MapProjectileVfx {
  id: string;
  mapId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  kind: ProjectileVfxKind;
  color?: string;
  isCrit?: boolean;
  label?: string;
}

export interface QuestObjective {
  id: string;
  text: string;
  completed: boolean;
}

export interface QuestEntry {
  id: string;
  title: string;
  giver?: string;
  category: 'principal' | 'secundaria' | 'guilda';
  status: 'active' | 'completed' | 'failed';
  description: string;
  objectives: QuestObjective[];
  rewardXp?: number;
  rewardGold?: number;
  rewardsDelivered?: boolean;
  createdAt: string;
}

export interface CombatMvpSummary {
  id: string;
  rounds: number;
  totalDamageDealt: number;
  totalHealingDone: number;
  enemiesDefeated: number;
  topDamageDealer?: { name: string; color: string; value: number };
  topHealer?: { name: string; color: string; value: number };
  topCrits?: { name: string; color: string; value: number };
  participants: Array<{
    name: string;
    color: string;
    damage: number;
    healing: number;
    crits: number;
  }>;
}

export interface CombatLogEntry {
  id: string;
  timestamp: string;
  category:
    | 'attack'
    | 'damage'
    | 'heal'
    | 'condition'
    | 'death'
    | 'revive'
    | 'xp'
    | 'levelup'
    | 'spell'
    | 'system';
  actorName: string;
  actorKind: 'hero' | 'monster' | 'npc' | 'system';
  actorColor?: string;
  targetName?: string;
  targetKind?: 'hero' | 'monster' | 'npc' | 'system';
  targetColor?: string;
  summary: string;
  detail?: string;
}

export interface SavedEncounter {
  id: string;
  name: string;
  description?: string;
  entries: Array<{ monsterId: string; count: number }>;
}

export interface ActiveLootChest {
  id: string;
  title: string;
  gold: number;
  goldClaimedBy?: string;
  items: Array<{
    id: string;
    itemId: string;
    quantity: number;
    claimedBy?: string;
  }>;
  open: boolean;
}

export interface CampaignState {
  id: string;
  name: string;
  description: string;
  coverUrl?: string;
  gmName?: string;
  updatedAt?: string;
  settings: CampaignSettings;
  compendium: Compendium;
  characters: Character[];
  maps: TacticalMap[];
  activeMapId: string;
  combat: CombatState;
  rollLog: RollLogEntry[];
  chatLog?: ChatMessageEntry[];
  combatLog?: CombatLogEntry[];
  savedEncounters?: SavedEncounter[];
  activeLootChest?: ActiveLootChest | null;
  quests: Quest[];
  questLog?: QuestEntry[];
  npcs: NpcEntry[];
  gmNotes: GmNote[];
  customMusicTracks: CustomMusicTrack[];
  activeBoss?: BossBannerState | null;
  /** Currently expanded Domain / Atmospheric Field on a map (persisted & synced to all players) */
  activeDomain?: ActiveDomainState | null;
  groupTreasury: {
    gold: number;
    items: SharedLootItem[];
  };
}
