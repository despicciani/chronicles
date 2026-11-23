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
  showEnemyAcToPlayers?: boolean;
  enableFlanking?: boolean;
  xpThresholds?: number[];
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

export interface ConditionDef {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  preventsOpportunityAttacks?: boolean;
  modifiers: StatModifier[];
}

export interface RaceDef {
  id: string;
  name: string;
  description: string;
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
  applyConditionId?: string;
  conditionDurationRounds?: number;
  requiresConcentration?: boolean;
  singleTargetOnly?: boolean;
  sfxPreset?: string;
  aoeShape?: 'sphere' | 'cone' | 'line' | 'cube';
  aoeSizeMeters?: number;
  aoeColor?: string;
  aoePersistent?: boolean;
  aoeTargetFilter?: 'all' | 'exclude-caster' | 'exclude-allies';
  createsSurface?: ElementalSurfaceKind;
  imageUrl?: string;
}

export interface ItemDef {
  id: string;
  name: string;
  type: 'Arma' | 'Armadura' | 'Escudo' | 'Consumível' | 'Item Mágico' | 'Equipamento';
  slot?: EquipSlot;
  rarity?: CardRarity;
  weight: number;
  valueGold: number;
  description: string;
  attackFormula?: string;
  damageFormula?: string;
  damageType?: string;
  range?: string;
  critRange?: number;
  critMultiplier?: number;
  defenseBonus?: number;
  modifiers?: StatModifier[];
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
  applyConditionId?: string;
  conditionDurationRounds?: number;
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
  secretNotes?: string;
  description: string;
  tokenColor: string;
  imageUrl?: string;
  hideAcFromPlayers?: boolean;
  lightSource?: 'none' | 'torch' | 'lantern' | 'darkvision';
  lightRadiusMeters?: number;
  isBoss?: boolean;
  bossTitle?: string;
  bossPhase2HpPct?: number;
  bossPhase2Title?: string;
  legendaryActionsMax?: number;
  legendaryResistancesMax?: number;
}

export interface InventoryEntry {
  id: string;
  itemId: string;
  quantity: number;
  equipped: boolean;
  equippedSlot?: EquipSlot;
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
  activeTrackedEffects?: ActiveTrackedAbilityEffect[];
  themeMusicUrl?: string;
  themeMusicTitle?: string;
  name: string;
  raceId: string;
  classId: string;
  level: number;
  xp?: number;
  hasInspiration?: boolean;
  unspentAttributePoints?: number;
  attributes: Record<string, number>;
  trainedSkillIds: string[];
  hp: number;
  maxHpOverride?: number;
  tempHp: number;
  mp: number;
  maxMpOverride?: number;
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
  color: string;
  frameStyle?: TokenFrameStyle;
  imageUrl?: string;
  hideAcFromPlayers?: boolean;
  lightSource?: 'none' | 'torch' | 'lantern' | 'darkvision';
  lightRadiusMeters?: number;
  isBoss?: boolean;
  bossTitle?: string;
  bossPhase?: number;
  bossPhase2HpPct?: number;
  bossPhase2Title?: string;
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

export type GmMarkerKind = 'chest' | 'item' | 'trap' | 'secret';
export type TerrainCellKind = 'wall' | 'cover' | 'difficult';
export type ElementalSurfaceKind = 'fire' | 'ice' | 'acid' | 'water';

export interface GmMapMarker {
  id: string;
  x: number;
  y: number;
  kind: GmMarkerKind;
  title: string;
  description?: string;
  revealed: boolean;
  lootItems?: Array<{ itemId: string; quantity: number }>;
  lootGold?: number;
  trapDc?: number;
  trapSaveSkillId?: string;
  trapDamageFormula?: string;
  trapDamageType?: string;
  trapTriggered?: boolean;
  targetMapId?: string;
}

export interface SecretPassageAlert {
  id: string;
  markerId: string;
  markerTitle: string;
  markerDescription?: string;
  sourceMapId: string;
  targetMapId?: string;
  targetMapName?: string;
  tokenId?: string;
  tokenName?: string;
  revealed: boolean;
}

export interface TacticalMap {
  id: string;
  name: string;
  mode: 'tactical' | 'scene';
  backgroundUrl: string;
  backgroundNaturalWidth?: number;
  backgroundNaturalHeight?: number;
  themePreset: 'crypt' | 'tavern' | 'forest' | 'desert' | 'castle' | 'void';
  gridWidth: number;
  gridHeight: number;
  gridSizePx: number;
  fogEnabled: boolean;
  revealedCells: string[];
  terrainCells?: Record<string, TerrainCellKind>;
  elementalSurfaces?: Record<string, ElementalSurfaceKind>;
  weather: 'none' | 'rain' | 'embers' | 'snow' | 'mist';
  sceneNpcIds: string[];
  tokens: MapToken[];
  templates: AoETemplate[];
  gmMarkers?: GmMapMarker[];
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
  type: 'character' | 'monster';
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  defense: number;
  speedMeters: number;
  remainingMoveMeters: number;
  actionAvailable: boolean;
  bonusActionAvailable: boolean;
  reactionAvailable: boolean;
  disengaged?: boolean;
  dodging?: boolean;
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
  applyConditionId?: string;
  conditionDurationRounds?: number;
  requiresConcentration?: boolean;
  singleTargetOnly?: boolean;
  sfxPreset?: string;
  isShoveManeuver?: boolean;
  saveSkillId?: string;
  saveDcFormula?: string;
  aoeShape?: 'sphere' | 'cone' | 'line' | 'cube';
  aoeSizeMeters?: number;
  aoeColor?: string;
  aoePersistent?: boolean;
  aoeTargetFilter?: 'all' | 'exclude-caster' | 'exclude-allies';
  createsSurface?: ElementalSurfaceKind;
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
  attackerCharacterId?: string;
  attackerName: string;
  attackerColor: string;
  attackerImageUrl?: string;
  attackerFrame?: TokenFrameStyle;
  defenderTokenId: string;
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
  defenderCanShieldReaction?: boolean;
  reactionShieldApplied?: boolean;
  applyConditionId?: string;
  sfxPreset?: string;
  autoCritOnHit?: boolean;
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
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  imageUrl?: string;
  color: string;
  active: boolean;
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
  applied?: boolean;
}

export interface TacticalSavePrompt {
  id: string;
  kind: 'trap' | 'aoe' | 'concentration';
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
  | 'slash';

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
  groupTreasury: {
    gold: number;
    items: SharedLootItem[];
  };
}
