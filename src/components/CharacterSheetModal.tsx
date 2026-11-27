import React, { useRef, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Backpack,
  BookOpen,
  Check,
  Coffee,
  Crown,
  Dices,
  Download,
  Flame,
  Heart,
  Info,
  Moon,
  Music,
  Plus,
  Save,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { triggerHeroJsonDownload, useCampaign } from '../context/CampaignContext';
import {
  applyCharacterRestToState,
  ATTACK_RANGE_OPTIONS,
  computeCharacterStats,
  EQUIP_SLOT_LABELS,
  evaluateFormula,
  extractItemDefenseBonus,
  formatFormulaForDisplay,
  formatSigned,
  getAttributePointsGainedAtLevel,
  getCampaignDamageTypes,
  getCharacterAttacksPerAction,
  getConditionGrantedAbilities,
  getCharacterCustomResourceState,
  getHeroInspirationPoints,
  getInventoryChargedAbilities,
  getNextLevelXp,
  normalizeActionEconomyCost,
  parseHeroPayloadFromJson,
  PLAYER_COLOR_PALETTE,
  resolveItemEquipSlot,
} from '../shared/rulesEngine';
import {
  ActionEconomyCost,
  Character,
  CharacterCustomAbility,
  CharacterForm,
  DiceSkin,
  DomainThemePreset,
  TokenFrameStyle,
} from '../shared/types';
import { EquipmentPaperdoll } from './EquipmentPaperdoll';
import { FileUploadButton } from './FileUploadButton';
import { OrnateFrame, SculptedHealthBar } from './OrnateFrame';
import { openAlertDialog, openConfirmDialog, openTextPrompt } from './PromptDialog';
import { TokenPortrait } from './TokenPortrait';
import { soundEngine } from '../utils/soundEngine';

interface CharacterSheetModalProps {
  onClose: () => void;
}

export const CharacterSheetModal: React.FC<CharacterSheetModalProps> = ({ onClose }) => {
  const {
    campaign,
    role,
    myCharacter,
    activeCharacterId,
    setActiveCharacterId,
    setMyPlayerColor,
    updateCampaign,
    deleteCharacter,
    rollDeathSave,
    setDeathSaveManual,
    assistDeathSave,
    gmResolveDeathSave,
    quickRollFormula,
    rollCharacterAction,
    awardXp,
    adjustHeroInspiration,
    spendHeroInspiration,
    useChargedItemAbility,
    useConsumable,
    sendRoll,
    playCharacterTheme,
    sendPlayerRequest,
    saveCharacterToVault,
    importSavedHeroIntoCampaign,
    savedHeroes,
    lastSavedHeroFeedback,
    resolveAssetUrl,
    setCharacterConcentration,
    pushCombatLog,
    switchCharacterForm,
    triggerUltimateCutIn,
  } = useCampaign();

  const heroFileInputRef = useRef<HTMLInputElement | null>(null);
  const [readingLetterItem, setReadingLetterItem] = useState<{
    name: string;
    text: string;
    imageUrl?: string;
  } | null>(null);
  const [transferInvId, setTransferInvId] = useState<string | null>(null);

  const [tab, setTab] = useState<'combat' | 'abilities' | 'inventory' | 'bio'>('combat');
  const [addAbilityId, setAddAbilityId] = useState(
    campaign.compendium.abilities[0]?.id || ''
  );
  const [addItemId, setAddItemId] = useState(
    campaign.compendium.items[0]?.id || ''
  );

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingAbilityId, setEditingAbilityId] = useState<string | null>(null);
  const [editingCutInAbilityId, setEditingCutInAbilityId] = useState<string | null>(null);
  const [editingAttackId, setEditingAttackId] = useState<string | null>(null);
  // Alternate Forms / Transformations creator state
  const [newFormName, setNewFormName] = useState('');
  const [newFormPortrait, setNewFormPortrait] = useState('');
  const [newFormColor, setNewFormColor] = useState('#38bdf8');
  const [newFormFrame, setNewFormFrame] = useState<TokenFrameStyle>('arcane');
  const [newFormCatchphrase, setNewFormCatchphrase] = useState('');
  const [newFormBonusAc, setNewFormBonusAc] = useState(0);
  const [newFormBonusSpeed, setNewFormBonusSpeed] = useState(0);
  const campaignDamageTypes = getCampaignDamageTypes(campaign);

  const handleCreateCharacter = async () => {
    const name = await openTextPrompt('Nome do novo Personagem:', 'Novo Aventureiro');
    if (!name) return;
    const defaultAttrs: Record<string, number> = {};
    campaign.compendium.attributes.forEach((a) => {
      defaultAttrs[a.id] = 10;
    });
    const newChar: Character = {
      id: `char-${Date.now()}`,
      playerName: 'Jogador',
      playerColor: '#38bdf8',
      tokenFrameStyle: 'gold',
      diceSkin: 'gold',
      name,
      raceId: campaign.compendium.races[0]?.id || '',
      classId: campaign.compendium.classes[0]?.id || '',
      level: 1,
      attributes: defaultAttrs,
      unspentAttributePoints: campaign.settings.attributePointBudget ?? 15,
      trainedSkillIds: [],
      hp: 12,
      tempHp: 0,
      mp: 6,
      knownAbilityIds: [],
      customAttacks: [],
      customAbilities: [],
      abilityUsesRemaining: {},
      activeConditionIds: [],
      inventory: [],
      gold: 50,
      portraitUrl: '',
      tokenColor: '#38bdf8',
      background: '',
      notes: '',
      deathSaves: { successes: 0, failures: 0 },
    };
    updateCampaign((prev) => ({
      ...prev,
      characters: [...prev.characters, newChar],
    }));
    setActiveCharacterId(newChar.id);
  };

  const character =
    role === 'player'
      ? myCharacter
      : campaign.characters.find((c) => c.id === activeCharacterId) ||
        campaign.characters[0];

  if (!character) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="rpg-glass-panel rounded-lg max-w-md w-full p-6 text-center space-y-4">
          <h3 className="font-chronicle font-bold text-xl chronicle-gold-text">
            Nenhum Herói na Campanha
          </h3>
          <p className="font-lore text-base" style={{ color: 'var(--text-secondary)' }}>
            Ainda não há fichas de personagem cadastradas nesta campanha.
          </p>
          <div className="flex items-center justify-center gap-3">
            {role === 'gm' && (
              <button
                onClick={handleCreateCharacter}
                className="rpg-btn-primary px-4 py-2 rounded-md text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" /> Criar Personagem
              </button>
            )}
            <button
              onClick={onClose}
              className="rpg-card px-4 py-2 rounded-md text-xs cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stats = computeCharacterStats(character, campaign);
  const race = campaign.compendium.races.find((r) => r.id === character.raceId);
  const charClass = campaign.compendium.classes.find((c) => c.id === character.classId);
  const charColor = character.playerColor || character.tokenColor || '#e0b84c';

  const updateChar = (updater: (c: Character) => Character) => {
    updateCampaign((prev) => {
      let updatedChar: Character | undefined;
      const nextChars = prev.characters.map((c) => {
        if (c.id !== character.id) return c;
        updatedChar = updater(c);
        return updatedChar;
      });
      if (!updatedChar) return prev;
      const nextDraft = { ...prev, characters: nextChars };
      const derived = computeCharacterStats(updatedChar, nextDraft);
      const nextColor = updatedChar.playerColor || updatedChar.tokenColor;
      const nextFrame = updatedChar.tokenFrameStyle || 'gold';
      return {
        ...nextDraft,
        maps: prev.maps.map((m) => ({
          ...m,
          tokens: m.tokens.map((t) =>
            t.type === 'character' && t.referenceId === updatedChar!.id
              ? {
                  ...t,
                  name: updatedChar!.name.split(' ')[0] || updatedChar!.name,
                  hp: Math.min(derived.maxHp, updatedChar!.hp),
                  maxHp: derived.maxHp,
                  defense: derived.defense,
                  color: nextColor,
                  frameStyle: nextFrame,
                  imageUrl: updatedChar!.portraitUrl,
                  activeConditionIds: updatedChar!.activeConditionIds,
                }
              : t
          ),
        })),
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((cb) =>
            cb.type === 'character' && cb.referenceId === updatedChar!.id
              ? {
                  ...cb,
                  name: updatedChar!.name,
                  hp: Math.min(derived.maxHp, updatedChar!.hp),
                  maxHp: derived.maxHp,
                  defense: derived.defense,
                  speedMeters: derived.speed,
                  color: nextColor,
                }
              : cb
          ),
        },
      };
    });
  };

  const getAvailableAttributePoints = (c: Character): number => {
    if (typeof c.unspentAttributePoints === 'number') {
      return Math.max(0, c.unspentAttributePoints);
    }
    const budget = campaign.settings.attributePointBudget ?? 15;
    const spent = campaign.compendium.attributes.reduce(
      (sum, a) => sum + ((c.attributes[a.id] ?? 10) - 10),
      0
    );
    return Math.max(0, budget - spent);
  };

  const availableAttrPoints = getAvailableAttributePoints(character);

  const handleLevelUp = () => {
    const nextLevel = Math.min(20, character.level + 1);
    const unlockedFeatures =
      charClass?.levelFeatures.filter((f) => f.level === nextLevel) || [];
    const newAbilities = unlockedFeatures.flatMap((f) => f.abilityIds || []);
    const gainedAsi = getAttributePointsGainedAtLevel(nextLevel, campaign.settings);

    const nextCharDraft: Character = {
      ...character,
      level: nextLevel,
      unspentAttributePoints: getAvailableAttributePoints(character) + gainedAsi,
      knownAbilityIds: Array.from(new Set([...character.knownAbilityIds, ...newAbilities])),
    };
    const nextStats = computeCharacterStats(nextCharDraft, campaign);

    const isDeadOrDowned =
      character.hp <= 0 ||
      Boolean(character.deathSaves?.dead || (character.deathSaves?.failures ?? 0) >= 3);
    updateChar(() => ({
      ...nextCharDraft,
      hp: isDeadOrDowned ? character.hp : nextStats.maxHp,
      mp: nextStats.maxMp,
    }));

    const featureNames = unlockedFeatures.map((f) => f.featureName).join(', ');
    openAlertDialog(
      `${character.name} subiu para o Nível ${nextLevel}!\nPV Máx: ${nextStats.maxHp} | ${campaign.settings.resourceShort} Máx: ${nextStats.maxMp}${
        gainedAsi > 0 ? `\n✨ +${gainedAsi} Pontos de Atributo disponíveis para distribuir na Ficha!` : ''
      }${featureNames ? `\nNovos Recursos: ${featureNames}` : ''}`,
      'Level Up!'
    );
  };

  const handleLevelDown = () => {
    if (character.level <= 1) return;
    const lostAsi = getAttributePointsGainedAtLevel(character.level, campaign.settings);
    const prevLevel = Math.max(1, character.level - 1);
    const nextCharDraft: Character = {
      ...character,
      level: prevLevel,
      unspentAttributePoints: Math.max(0, getAvailableAttributePoints(character) - lostAsi),
    };
    const nextStats = computeCharacterStats(nextCharDraft, campaign);

    updateChar(() => ({
      ...nextCharDraft,
      hp: Math.min(character.hp, nextStats.maxHp),
      mp: Math.min(character.mp, nextStats.maxMp),
    }));
  };

  const handleShortRest = () => {
    if (character.hp <= 0 || character.deathSaves?.dead || (character.deathSaves?.failures || 0) >= 3) {
      return;
    }
    const healFormula = `1d${charClass?.hitDie || 8} + ${stats.attributes['con']?.mod || 0}`;
    const res = evaluateFormula(healFormula, stats, character);
    const healed = Math.max(1, res.total);

    updateCampaign((prev) => {
      const restResult = applyCharacterRestToState(prev, character.id, 'short', {
        shortRestHealedHp: healed,
      });
      return restResult ? restResult.nextState : prev;
    });

    sendRoll({
      rollerName: character.name,
      rollerRole: role,
      rollerColor: charColor,
      diceSkin: character.diceSkin || 'emerald',
      title: 'Descanso Curto (Dado de Vida)',
      formula: res.resolvedFormula,
      individualRolls: res.individualRolls,
      rolledDice: res.rolledDice,
      total: healed,
      isCrit: false,
      isFumble: false,
      isSecret: false,
      details: `Recuperou +${healed} PV (${res.details}) e recarregou recursos de Descanso Curto.`,
    });
  };

  const handleLongRest = () => {
    if (character.hp <= 0 || character.deathSaves?.dead || (character.deathSaves?.failures || 0) >= 3) {
      return;
    }
    updateCampaign((prev) => {
      const restResult = applyCharacterRestToState(prev, character.id, 'long');
      return restResult ? restResult.nextState : prev;
    });
  };

  const handleDeathSaveRoll = () => {
    rollDeathSave(character.id);
  };

  const toggleEquipInventoryEntry = (invId: string) => {
    updateChar((c) => {
      const targetInv = c.inventory.find((x) => x.id === invId);
      if (!targetInv) return c;
      const targetItem = campaign.compendium.items.find((i) => i.id === targetInv.itemId);
      if (!targetItem) return c;
      const targetSlot = targetInv.equippedSlot || resolveItemEquipSlot(targetItem);
      if (!targetSlot) return c;

      const willEquip = !targetInv.equipped;
      return {
        ...c,
        inventory: c.inventory.map((x) => {
          if (x.id === invId) {
            return {
              ...x,
              equipped: willEquip,
              equippedSlot: willEquip ? targetSlot : undefined,
            };
          }
          if (willEquip && x.equipped) {
            const otherItem = campaign.compendium.items.find((i) => i.id === x.itemId);
            const otherSlot =
              x.equippedSlot || (otherItem ? resolveItemEquipSlot(otherItem) : null);
            if (otherSlot === targetSlot) {
              return { ...x, equipped: false, equippedSlot: undefined };
            }
          }
          return x;
        }),
      };
    });
  };

  const toggleCondition = (condId: string) => {
    if (role !== 'gm') return;
    const isRemoving = character.activeConditionIds.includes(condId);
    const nextConds = isRemoving
      ? character.activeConditionIds.filter((id) => id !== condId)
      : [...character.activeConditionIds, condId];
    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id === character.id ? { ...c, activeConditionIds: nextConds } : c
      ),
      maps: prev.maps.map((m) => ({
        ...m,
        tokens: m.tokens.map((t) =>
          t.type === 'character' && t.referenceId === character.id
            ? { ...t, activeConditionIds: nextConds }
            : t
        ),
      })),
    }));
  };

  const toggleSkillTrained = (skillId: string) => {
    if (role !== 'gm') return;
    updateChar((c) => ({
      ...c,
      trainedSkillIds: c.trainedSkillIds.includes(skillId)
        ? c.trainedSkillIds.filter((id) => id !== skillId)
        : [...c.trainedSkillIds, skillId],
    }));
  };

  const toggleSkillFavorite = (skillId: string) => {
    updateChar((c) => {
      const validRegularSkillIds = new Set(
        campaign.compendium.skills.filter((s) => !s.isSavingThrow).map((s) => s.id)
      );
      const current = (c.favoriteSkillIds || []).filter((id) => validRegularSkillIds.has(id));
      if (current.includes(skillId)) {
        return { ...c, favoriteSkillIds: current.filter((id) => id !== skillId) };
      }
      if (current.length >= 6) return c;
      return { ...c, favoriteSkillIds: [...current, skillId] };
    });
  };

  const equippedWeapons = character.inventory
    .filter((inv) => inv.equipped)
    .map((inv) => ({
      inv,
      item: campaign.compendium.items.find((i) => i.id === inv.itemId),
    }))
    .filter((x) => x.item && x.item.attackFormula);

  return (
    <div
      data-modal-overlay="true"
      className="fixed inset-0 z-50 bg-[#040508]/80 backdrop-blur-[3px] flex items-center justify-center p-3 md:p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-6xl h-[90vh] flex flex-col">
        <OrnateFrame
          accentColor={charColor}
          cornerSize={16}
          className="rpg-panel rpg-grain rounded-lg w-full h-full flex flex-col overflow-hidden animate-modal-unfurl"
        >
        {/* Modal Header (Close X permanently pinned top-right!) */}
        <div
          className="px-4 sm:px-5 py-3 border-b relative shrink-0 space-y-2.5 bg-[#0d0f16]"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              <TokenPortrait
                name={character.name}
                imageUrl={character.portraitUrl}
                playerColor={charColor}
                frameStyle={character.tokenFrameStyle || 'gold'}
                sizePx={50}
                isDead={character.hp <= 0}
              />

              <div className="min-w-0">
                {role === 'gm' ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={character.id}
                      onChange={(e) => setActiveCharacterId(e.target.value)}
                      className="rpg-input font-display font-bold text-base py-1"
                    >
                      {campaign.characters.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.name} — Nível {ch.level}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleCreateCharacter}
                      className="rpg-card px-2.5 py-1.5 rounded text-xs flex items-center gap-1 cursor-pointer hover:opacity-85"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Novo
                    </button>
                    <button
                      onClick={async () => {
                        if (
                          await openConfirmDialog(
                            `Excluir permanentemente o personagem "${character.name}" da campanha?`,
                            'Excluir Personagem'
                          )
                        ) {
                          deleteCharacter(character.id);
                        }
                      }}
                      className="px-2.5 py-1.5 rounded bg-red-950/80 border border-red-500/40 text-red-200 hover:bg-red-900 text-xs flex items-center gap-1 cursor-pointer"
                      title="Excluir este personagem da campanha"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Excluir
                    </button>
                  </div>
                ) : (
                  <h2 className="font-display font-extrabold text-lg leading-tight" style={{ color: charColor }}>
                    {character.name} — Nível {character.level}
                  </h2>
                )}

                <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                  <span>{race?.name || 'Sem Raça'} • {charClass?.name || 'Sem Classe'} • Jogador: {character.playerName}</span>
                  {character.themeMusicUrl && role === 'gm' && (
                    <button
                      onClick={() => playCharacterTheme(character)}
                      className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[11px] flex items-center gap-1 cursor-pointer hover:bg-amber-500/35"
                    >
                      <Music className="w-3 h-3" /> Tocar Tema
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rpg-card p-1.5 rounded-md hover:border-amber-400 cursor-pointer shrink-0"
              title="Fechar ficha"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(() => {
              const inspPts = getHeroInspirationPoints(character);
              return (
                <div
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-display font-bold border ${
                    inspPts > 0
                      ? 'bg-[#241d11] border-[#d4ad5c]/70 text-[#e8c683]'
                      : 'rpg-card text-[#8c8374]'
                  }`}
                  title="Pontos de Inspiração Heroica (0 a 3) — Use para ganhar Vantagem ou re-rolar um d20 ruim!"
                >
                  {role === 'gm' && (
                    <button
                      type="button"
                      disabled={inspPts <= 0}
                      onClick={() => adjustHeroInspiration(character.id, -1)}
                      className="px-1 rounded hover:bg-black/30 disabled:opacity-30 cursor-pointer"
                      title="Remover 1 Ponto de Inspiração"
                    >
                      −
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={inspPts <= 0}
                    onClick={() => {
                      if (inspPts > 0) spendHeroInspiration(character.id, 'advantage');
                    }}
                    className="cursor-pointer disabled:cursor-default"
                    title={
                      inspPts > 0
                        ? 'Clique para gastar 1 Ponto de Inspiração e ativar Vantagem na próxima rolagem'
                        : 'Sem pontos de Inspiração disponíveis'
                    }
                  >
                    {'★'.repeat(inspPts)}
                    {'☆'.repeat(3 - inspPts)} {inspPts}/3
                  </button>
                  {role === 'gm' && (
                    <button
                      type="button"
                      disabled={inspPts >= 3}
                      onClick={() => adjustHeroInspiration(character.id, 1)}
                      className="px-1 rounded hover:bg-black/30 disabled:opacity-30 cursor-pointer"
                      title="Conceder +1 Ponto de Inspiração (máx. 3)"
                    >
                      +
                    </button>
                  )}
                </div>
              );
            })()}
            <button
              type="button"
              onClick={() => saveCharacterToVault(character)}
              className={`px-2.5 py-1.5 rounded text-xs font-display font-bold flex items-center gap-1 cursor-pointer transition border ${
                lastSavedHeroFeedback?.id === (character.vaultId || character.id)
                  ? 'bg-emerald-950/85 border-emerald-400/70 text-emerald-200'
                  : 'rpg-btn-primary border-transparent'
              }`}
              title="Salvar e sincronizar este personagem no Cofre (Desktop + Online)"
            >
              {lastSavedHeroFeedback?.id === (character.vaultId || character.id) ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Salvo ✓</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {character.vaultId ||
                    savedHeroes.some((h) => h.id === (character.vaultId || character.id))
                      ? 'Sincronizar Herói'
                      : 'Salvar Herói'}
                  </span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => triggerHeroJsonDownload(character)}
              className="rpg-card px-2 py-1.5 rounded text-xs flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
              title="Baixar ficha do personagem (.hero.json)"
            >
              <Download className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden lg:inline">.json</span>
            </button>
            {role === 'gm' && (
              <>
                <button
                  type="button"
                  onClick={() => heroFileInputRef.current?.click()}
                  className="rpg-card px-2 py-1.5 rounded text-xs flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
                  title="Importar ficha de personagem (.json) para a mesa"
                >
                  <Upload className="w-3.5 h-3.5 text-sky-300" />
                </button>
                <input
                  ref={heroFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        const parsed = JSON.parse(String(reader.result));
                        const imported = parseHeroPayloadFromJson(parsed, campaign);
                        if (!imported) {
                          openAlertDialog('Arquivo de herói inválido.');
                          return;
                        }
                        importSavedHeroIntoCampaign(imported);
                      } catch {
                        openAlertDialog('Erro ao ler arquivo JSON do personagem.');
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </>
            )}
            {/* Prominent Level & XP Progress Pill — visible to BOTH Player and GM */}
            {(() => {
              const curXp = character.xp ?? 0;
              const nextXp = getNextLevelXp(character.level, campaign.settings.xpThresholds);
              const prevLevelXp =
                character.level > 1
                  ? getNextLevelXp(character.level - 1, campaign.settings.xpThresholds) ?? 0
                  : 0;
              const xpPct =
                nextXp && nextXp > prevLevelXp
                  ? Math.max(0, Math.min(100, ((curXp - prevLevelXp) / (nextXp - prevLevelXp)) * 100))
                  : 100;
              return (
                <div
                  className="inline-flex flex-col justify-center px-2.5 py-1 rounded bg-[#141722] border border-[#b89146]/45 min-w-[142px]"
                  title={`Nível ${character.level} • Experiência: ${curXp}${nextXp ? ` / ${nextXp} XP para o Nível ${character.level + 1}` : ' XP (Nível Máximo)'}`}
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] font-display font-bold leading-none">
                    <span className="text-[#f0cf7b]">Nível {character.level}</span>
                    <span className="font-mono-dice text-[#cfc5b4]">
                      {curXp} / {nextXp ?? 'MAX'} XP
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-black/70 overflow-hidden mt-1">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${xpPct}%`,
                        background: 'linear-gradient(90deg, #b88928 0%, #f5d47a 100%)',
                      }}
                    />
                  </div>
                </div>
              );
            })()}
            {/* D&D 5e Attacks per Action (Extra Attack) pill — auto from class/level, GM-editable */}
            {(() => {
              const attacksPerAct = getCharacterAttacksPerAction(character);
              const isCustom = typeof character.extraAttacksOverride === 'number';
              return (
                <div
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#141722] border border-[#b89146]/40 text-[10px] font-display font-bold"
                  title={
                    role === 'gm'
                      ? `Ataques por Ação Padrão (Ataque Extra D&D 5e). Atual: ${attacksPerAct}${isCustom ? ' (customizado)' : ' (automático pela classe/nível)'}. Use -/+ para ajustar.`
                      : `Ataques por Ação Padrão (Ataque Extra D&D 5e): ${attacksPerAct}`
                  }
                >
                  <Swords className="w-3 h-3 text-[#e8c683]" />
                  <span className="text-[#cfc5b4]">Atq/Ação:</span>
                  {role === 'gm' && (
                    <button
                      type="button"
                      onClick={() =>
                        updateChar((c) => ({
                          ...c,
                          extraAttacksOverride: Math.max(1, attacksPerAct - 1),
                        }))
                      }
                      disabled={attacksPerAct <= 1}
                      className="px-1 rounded bg-black/40 hover:bg-black/70 text-[#e8c683] disabled:opacity-30 cursor-pointer"
                    >
                      −
                    </button>
                  )}
                  <span className="font-mono-dice text-[#f0cf7b] px-0.5">{attacksPerAct}</span>
                  {role === 'gm' && (
                    <button
                      type="button"
                      onClick={() =>
                        updateChar((c) => ({
                          ...c,
                          extraAttacksOverride: Math.min(5, attacksPerAct + 1),
                        }))
                      }
                      disabled={attacksPerAct >= 5}
                      className="px-1 rounded bg-black/40 hover:bg-black/70 text-[#e8c683] disabled:opacity-30 cursor-pointer"
                    >
                      +
                    </button>
                  )}
                </div>
              );
            })()}
            {role === 'gm' ? (
              <>
                <button
                  onClick={async () => {
                    const raw = await openTextPrompt(`Dar XP para ${character.name} (Atual: ${character.xp ?? 0} XP):`, '150');
                    const val = Number(raw);
                    if (raw && Number.isFinite(val) && val !== 0) {
                      awardXp([character.id], val);
                    }
                  }}
                  className="rpg-card px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer text-amber-300 hover:border-amber-400/70"
                  title="Conceder XP (sobe de nível automaticamente ao atingir o limite)"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  +XP ({character.xp ?? 0}/{getNextLevelXp(character.level, campaign.settings.xpThresholds) ?? 'MAX'})
                </button>
                <button
                  onClick={handleLevelUp}
                  disabled={character.level >= 20}
                  className="rpg-card px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer text-amber-400 hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed"
                  title="Subir 1 nível"
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  Level Up
                </button>
                <button
                  onClick={handleLevelDown}
                  disabled={character.level <= 1}
                  className="rpg-card px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer text-rose-300 hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed"
                  title="Reduzir 1 nível"
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  Level Down
                </button>
                <button
                  disabled={character.hp <= 0}
                  onClick={handleShortRest}
                  className="rpg-card px-2.5 py-1.5 rounded text-xs flex items-center gap-1 cursor-pointer hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed"
                  title={character.hp <= 0 ? 'Personagens caídos (0 PV) não podem fazer descanso' : 'Descanso Curto'}
                >
                  <Coffee className="w-3.5 h-3.5" />
                  Desc. Curto
                </button>
                <button
                  disabled={character.hp <= 0}
                  onClick={handleLongRest}
                  className="rpg-card px-2.5 py-1.5 rounded text-xs flex items-center gap-1 cursor-pointer text-sky-400 hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed"
                  title={character.hp <= 0 ? 'Personagens caídos (0 PV) não podem fazer descanso' : 'Descanso Longo'}
                >
                  <Moon className="w-3.5 h-3.5" />
                  Desc. Longo
                </button>
              </>
            ) : (
              <>
                <button
                  disabled={character.hp <= 0}
                  onClick={() => {
                    sendPlayerRequest('short-rest', 'Descanso Curto');
                  }}
                  className="rpg-card px-2.5 py-1.5 rounded text-xs flex items-center gap-1 cursor-pointer hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed"
                  title={
                    character.hp <= 0
                      ? 'Personagens caídos (0 PV) não podem pedir descanso'
                      : 'Enviar solicitação de Descanso Curto ao Mestre'
                  }
                >
                  <Coffee className="w-3.5 h-3.5 text-amber-400" />
                  Pedir Desc. Curto
                </button>
                <button
                  disabled={character.hp <= 0}
                  onClick={() => {
                    sendPlayerRequest('long-rest', 'Descanso Longo');
                  }}
                  className="rpg-card px-2.5 py-1.5 rounded text-xs flex items-center gap-1 cursor-pointer text-sky-300 hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed"
                  title={
                    character.hp <= 0
                      ? 'Personagens caídos (0 PV) não podem pedir descanso'
                      : 'Enviar solicitação de Descanso Longo ao Mestre'
                  }
                >
                  <Moon className="w-3.5 h-3.5" />
                  Pedir Desc. Longo
                </button>
              </>
            )}
          </div>
        </div>

        {/* DEATH'S DOOR DRAMATIC MODE (#5) */}
        {character.hp <= 0 && (() => {
          const ds = character.deathSaves || { successes: 0, failures: 0 };
          const isCharDead = Boolean(ds.dead || (ds.failures || 0) >= 3);
          const isCharStabilized = !isCharDead && Boolean(ds.stabilized || (ds.successes || 0) >= 3);
          const canAllyAssist =
            role === 'player' &&
            myCharacter &&
            myCharacter.id !== character.id &&
            myCharacter.hp > 0 &&
            !isCharDead &&
            !isCharStabilized;
          return (
            <div className="px-4 py-2.5 bg-red-950/85 border-b border-red-500/60 flex flex-wrap items-center justify-between gap-3 shrink-0 animate-death-pulse">
              <div className="flex items-center gap-2.5">
                <Skull className="w-6 h-6 text-red-400" />
                <div>
                  <div className="font-display font-extrabold text-sm text-red-200 tracking-wider flex items-center gap-2">
                    <span>
                      {isCharDead
                        ? 'MORTO EM COMBATE'
                        : isCharStabilized
                          ? 'ESTABILIZADO (0 PV)'
                          : 'À BEIRA DA MORTE — PORTÕES DA MORTE'}
                    </span>
                    {ds.assistedBy && !isCharDead && (
                      <span className="px-2 py-0.5 rounded bg-emerald-900/80 border border-emerald-400/50 text-[10px] text-emerald-200">
                        Ajuda de {ds.assistedBy} (Vantagem 2d20)
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-red-300/85">
                    {isCharDead
                      ? 'Atingiu 3 falhas contra a Morte. Apenas o Mestre ou magia de ressurreição pode trazê-lo de volta.'
                      : isCharStabilized
                        ? 'Com 3 sucessos, está fora de risco imediato (aguarda cura ou descanso).'
                        : 'Role 1d20 no início do seu turno (10+ = Sucesso, 20 = Levanta com 1 PV, 1 = 2 Falhas).'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-emerald-300 font-semibold mr-1">Vida:</span>
                  {[0, 1, 2].map((i) => (
                    <button
                      key={i}
                      disabled={role !== 'gm'}
                      onClick={() => {
                        if (role !== 'gm') return;
                        const nextSucc = i + 1 === (ds.successes || 0) ? i : i + 1;
                        setDeathSaveManual(character.id, {
                          successes: nextSucc,
                          stabilized: nextSucc >= 3,
                        });
                      }}
                      title={role === 'gm' ? 'Ajustar sucessos contra a Morte (Mestre)' : 'Apenas o Mestre pode ajustar manualmente'}
                      className={`w-4 h-4 rounded-full border cursor-pointer disabled:cursor-default ${
                        i < (ds.successes || 0)
                          ? 'bg-emerald-400 border-emerald-200 shadow-[0_0_8px_#34d399]'
                          : 'border-emerald-500/40 bg-black/40'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-red-300 font-semibold mr-1">Morte:</span>
                  {[0, 1, 2].map((i) => (
                    <button
                      key={i}
                      disabled={role !== 'gm'}
                      onClick={() => {
                        if (role !== 'gm') return;
                        const nextFail = i + 1 === (ds.failures || 0) ? i : i + 1;
                        setDeathSaveManual(character.id, {
                          failures: nextFail,
                          dead: nextFail >= 3,
                        });
                      }}
                      title={role === 'gm' ? 'Ajustar falhas contra a Morte (Mestre)' : 'Apenas o Mestre pode ajustar manualmente'}
                      className={`w-4 h-4 rounded-full border cursor-pointer disabled:cursor-default ${
                        i < (ds.failures || 0)
                          ? 'bg-red-500 border-red-200 shadow-[0_0_8px_#ef4444]'
                          : 'border-red-500/40 bg-black/40'
                      }`}
                    />
                  ))}
                </div>

                {!isCharDead && !isCharStabilized && (role === 'gm' || myCharacter?.id === character.id) && (() => {
                  const charCb = campaign.combat.active
                    ? campaign.combat.combatants.find(
                        (cb) => cb.type === 'character' && cb.referenceId === character.id
                      )
                    : undefined;
                  const activeTurnCb = campaign.combat.active
                    ? campaign.combat.combatants[campaign.combat.currentTurnIndex]
                    : undefined;
                  const notMyTurnInCombat =
                    role !== 'gm' &&
                    Boolean(
                      campaign.combat.active &&
                        charCb &&
                        activeTurnCb &&
                        activeTurnCb.id !== charCb.id
                    );
                  const actionSpentInCombat =
                    role !== 'gm' &&
                    Boolean(campaign.combat.active && charCb && charCb.actionAvailable === false);
                  const locked = notMyTurnInCombat || actionSpentInCombat;
                  return (
                    <button
                      onClick={handleDeathSaveRoll}
                      disabled={locked}
                      title={
                        notMyTurnInCombat
                          ? `Aguarde seu turno na iniciativa (${activeTurnCb?.name || 'outro combatente'})`
                          : actionSpentInCombat
                            ? 'Você já rolou o Teste contra a Morte (Ação Padrão gasta) neste turno. Encerre o turno.'
                            : campaign.combat.active
                              ? 'Rola 1 Teste contra a Morte (1x por turno, gasta sua Ação Padrão)'
                              : 'Rolar Teste contra a Morte (1d20)'
                      }
                      className="rpg-btn-crimson px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <Dices className="w-4 h-4" />
                      <span>
                        {notMyTurnInCombat
                          ? 'Aguarde seu Turno'
                          : actionSpentInCombat
                            ? 'Feito neste Turno'
                            : ds.assistedBy
                              ? 'Rolar com Vantagem (2d20)'
                              : 'Rolar Destino (d20)'}
                      </span>
                    </button>
                  );
                })()}

                {canAllyAssist && myCharacter && (
                  <button
                    onClick={() => assistDeathSave(myCharacter.id, character.id)}
                    className="rpg-btn-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Heart className="w-4 h-4" />
                    <span>Ajudar (Medicina CD 10)</span>
                  </button>
                )}

                {role === 'gm' && (
                  <div className="flex items-center gap-1.5">
                    {isCharDead ? (
                      <>
                        <button
                          onClick={() => gmResolveDeathSave(character.id, 'revive-1')}
                          className="px-2.5 py-1.5 rounded-md bg-amber-800/80 hover:bg-amber-700 border border-amber-400/60 text-amber-100 text-xs font-display font-bold cursor-pointer"
                        >
                          Reviver (1 PV)
                        </button>
                        <button
                          onClick={() => gmResolveDeathSave(character.id, 'revive-full')}
                          className="rpg-btn-primary px-2.5 py-1.5 rounded-md text-xs cursor-pointer"
                        >
                          Reviver Total (100% PV)
                        </button>
                      </>
                    ) : (
                      <>
                        {!isCharStabilized && (
                          <button
                            onClick={() => gmResolveDeathSave(character.id, 'stabilize')}
                            className="px-2.5 py-1.5 rounded-md bg-sky-900/80 hover:bg-sky-800 border border-sky-400/50 text-sky-100 text-xs font-display font-bold cursor-pointer"
                          >
                            Estabilizar
                          </button>
                        )}
                        <button
                          onClick={() => gmResolveDeathSave(character.id, 'save-full')}
                          className="rpg-btn-primary px-2.5 py-1.5 rounded-md text-xs cursor-pointer"
                        >
                          Salvar Totalmente
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Active Conditions & Concentration Strip */}
        <div
          className="px-4 py-2 border-b flex items-center gap-1.5 overflow-x-auto shrink-0"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'rgba(0,0,0,0.14)' }}
        >
          <div className="flex items-center gap-1 shrink-0">
            <Sparkles className="w-3 h-3 text-sky-400 shrink-0" />
            {role === 'gm' ? (
              <select
                value={character.concentratingSpell || ''}
                onChange={(e) =>
                  setCharacterConcentration(character.id, e.target.value ? e.target.value : null)
                }
                title="Concentração D&D 5e: selecione uma magia/habilidade da ficha para manter em concentração"
                className={`px-2 py-0.5 rounded-md text-[11px] font-display font-bold border transition cursor-pointer bg-[#0c0e16] ${
                  character.concentratingSpell
                    ? 'border-sky-400/80 text-sky-200'
                    : 'border-white/15 text-slate-300 hover:border-sky-400/50'
                }`}
              >
                <option value="">Sem Concentração</option>
                {Array.from(
                  new Set([
                    ...(character.knownAbilityIds || [])
                      .map((id) => campaign.compendium.abilities.find((a) => a.id === id)?.name)
                      .filter((n): n is string => Boolean(n)),
                    ...(character.customAbilities || []).map((a) => a.name),
                    ...(character.concentratingSpell ? [character.concentratingSpell] : []),
                  ])
                ).map((spName) => (
                  <option key={spName} value={spName}>
                    Conc: {spName}
                  </option>
                ))}
              </select>
            ) : character.concentratingSpell ? (
              <button
                type="button"
                onClick={() => setCharacterConcentration(character.id, null)}
                title="Clique para encerrar sua Concentração voluntariamente"
                className="px-2 py-0.5 rounded-md text-[11px] font-display font-bold border border-sky-400/80 text-sky-200 bg-[#0c0e16] hover:bg-red-950/60 hover:border-red-400/70 cursor-pointer transition"
              >
                ✨ Conc: {character.concentratingSpell} ✕
              </button>
            ) : (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-display border border-white/10 text-slate-400 bg-black/30">
                Sem Concentração
              </span>
            )}
          </div>

          <span className="h-3.5 w-px bg-white/15 mx-0.5 shrink-0" />

          <span className="text-[11px] font-semibold uppercase tracking-wider mr-1 shrink-0" style={{ color: 'var(--text-muted)' }}>
            Condições:
          </span>
          {role === 'gm' ? (
            campaign.compendium.conditions.map((cond) => {
              const active = character.activeConditionIds.includes(cond.id);
              return (
                <button
                  key={cond.id}
                  onClick={() => toggleCondition(cond.id)}
                  title={cond.description}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1 shrink-0 border transition cursor-pointer ${
                    active ? 'shadow-sm scale-[1.03]' : 'opacity-55 hover:opacity-90'
                  }`}
                  style={{
                    borderColor: active ? cond.color : 'var(--border-subtle)',
                    backgroundColor: active ? `${cond.color}25` : 'transparent',
                  }}
                >
                  <span>{cond.icon}</span>
                  <span>{cond.name}</span>
                </button>
              );
            })
          ) : (() => {
            const activeConds = campaign.compendium.conditions.filter((cond) =>
              character.activeConditionIds.includes(cond.id)
            );
            if (activeConds.length === 0) {
              return (
                <span className="text-[11px] opacity-60 italic">
                  Nenhuma condição ativa (controlado pelo Mestre e habilidades)
                </span>
              );
            }
            return activeConds.map((cond) => (
              <span
                key={cond.id}
                title={`${cond.description} (Aplicada pelo Mestre ou habilidade)`}
                className="px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1 shrink-0 border shadow-sm"
                style={{
                  borderColor: cond.color,
                  backgroundColor: `${cond.color}25`,
                }}
              >
                <span>{cond.icon}</span>
                <span>{cond.name}</span>
              </span>
            ));
          })()}
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 pt-2 border-b flex items-center gap-2 shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          {[
            { id: 'combat', label: 'Atributos, Vitals & Perícias', icon: <Shield className="w-4 h-4" /> },
            { id: 'abilities', label: 'Cartas de Ataque & Habilidades', icon: <Swords className="w-4 h-4" /> },
            { id: 'inventory', label: 'Mochila & Equipamentos', icon: <Backpack className="w-4 h-4" /> },
            { id: 'bio', label: 'Foto, Cor, Música & História', icon: <BookOpen className="w-4 h-4" /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
                tab === t.id ? 'border-amber-400' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
              style={tab === t.id ? { color: 'var(--accent-primary)' } : undefined}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {tab === 'combat' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Column */}
              <div className="lg:col-span-5 space-y-4">
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Ghost-Drain Sculpted HP Card */}
                  <div className="rpg-card rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-display font-semibold text-emerald-400 flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5" /> Pontos de Vida
                      </span>
                      <span title={stats.maxHpBreakdown.join('\n')} className="cursor-help opacity-70">
                        <Info className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <SculptedHealthBar hp={character.hp} maxHp={stats.maxHp} heightClass="h-3" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {role === 'gm' ? (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <input
                              type="number"
                              min={0}
                              max={stats.maxHp}
                              value={character.hp}
                              onChange={(e) =>
                                updateChar((c) => ({
                                  ...c,
                                  hp: Math.max(0, Math.min(stats.maxHp, Number(e.target.value) || 0)),
                                }))
                              }
                              className="rpg-input w-14 text-center font-bold text-base py-0.5"
                              title="PV Atual"
                            />
                            <span className="text-sm font-semibold opacity-70">/</span>
                            <input
                              type="number"
                              min={1}
                              value={character.maxHpOverride ?? stats.maxHp}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value) || 1);
                                updateChar((c) => ({ ...c, maxHpOverride: val }));
                              }}
                              className={`rpg-input w-14 text-center font-bold text-sm py-0.5 ${
                                character.maxHpOverride ? 'border-amber-400/70 text-amber-200' : ''
                              }`}
                              title="PV Máximo Base (editável livremente pelo Mestre; condições somam por cima)"
                            />
                            {character.maxHpOverride !== undefined && (
                              <button
                                type="button"
                                onClick={() => updateChar((c) => ({ ...c, maxHpOverride: undefined }))}
                                className="rpg-card px-1.5 py-0.5 rounded text-[10px] text-amber-300 cursor-pointer"
                                title="Voltar ao PV Máximo automático da classe/CON"
                              >
                                ↺
                              </button>
                            )}
                            {stats.maxHp !== (character.maxHpOverride ?? stats.maxHp) && (
                              <span className="text-[10px] font-mono-dice text-emerald-300" title="Total final com bônus de condições/itens">
                                (Total {stats.maxHp})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-sky-300/85">Temp:</span>
                            <input
                              type="number"
                              min={0}
                              value={character.tempHp || 0}
                              onChange={(e) =>
                                updateChar((c) => ({
                                  ...c,
                                  tempHp: Math.max(0, Number(e.target.value) || 0),
                                }))
                              }
                              className="rpg-input w-12 text-center font-mono-dice text-xs py-0.5 text-sky-200"
                              title="PV Temporário (absorve dano primeiro)"
                            />
                            <button
                              onClick={() => updateChar((c) => ({ ...c, hp: Math.max(0, c.hp - 1) }))}
                              className="rpg-card px-2 py-0.5 rounded text-xs cursor-pointer"
                            >
                              -1
                            </button>
                            <button
                              onClick={() =>
                                updateChar((c) => ({ ...c, hp: Math.min(stats.maxHp, c.hp + 1) }))
                              }
                              className="rpg-card px-2 py-0.5 rounded text-xs cursor-pointer"
                            >
                              +1
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <span className="font-display font-black text-xl text-emerald-400">
                            {character.hp}{' '}
                            <span className="text-xs font-normal opacity-75">/ {stats.maxHp} PV</span>
                            {(character.tempHp || 0) > 0 && (
                              <span className="ml-1.5 text-xs font-mono-dice text-sky-300">
                                (+{character.tempHp} Temp)
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] opacity-60">Controlado pelo Mestre</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sculpted MP Card */}
                  <div className="rpg-card rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-display font-semibold text-sky-400 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" /> {campaign.settings.resourceName}
                      </span>
                      <span title={stats.maxMpBreakdown.join('\n')} className="cursor-help opacity-70">
                        <Info className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <SculptedHealthBar
                      hp={character.mp}
                      maxHp={stats.maxMp}
                      variant="mana"
                      heightClass="h-3"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {role === 'gm' ? (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <input
                              type="number"
                              min={0}
                              value={character.mp}
                              onChange={(e) =>
                                updateChar((c) => ({ ...c, mp: Math.max(0, Number(e.target.value) || 0) }))
                              }
                              className="rpg-input w-14 text-center font-bold text-base py-0.5"
                              title={`${campaign.settings.resourceName} Atual`}
                            />
                            <span className="text-sm font-semibold opacity-70">/</span>
                            <input
                              type="number"
                              min={0}
                              value={character.maxMpOverride ?? stats.maxMp}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                updateChar((c) => ({ ...c, maxMpOverride: val }));
                              }}
                              className={`rpg-input w-14 text-center font-bold text-sm py-0.5 ${
                                character.maxMpOverride !== undefined ? 'border-amber-400/70 text-amber-200' : ''
                              }`}
                              title={`${campaign.settings.resourceName} Máximo Base (editável livremente pelo Mestre)`}
                            />
                            {character.maxMpOverride !== undefined && (
                              <button
                                type="button"
                                onClick={() => updateChar((c) => ({ ...c, maxMpOverride: undefined }))}
                                className="rpg-card px-1.5 py-0.5 rounded text-[10px] text-amber-300 cursor-pointer"
                                title="Voltar ao PM Máximo automático"
                              >
                                ↺
                              </button>
                            )}
                            {stats.maxMp !== (character.maxMpOverride ?? stats.maxMp) && (
                              <span className="text-[10px] font-mono-dice text-sky-300" title="Total final com bônus de condições/itens">
                                (Total {stats.maxMp})
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => updateChar((c) => ({ ...c, mp: Math.max(0, c.mp - 1) }))}
                              className="rpg-card px-2 py-0.5 rounded text-xs cursor-pointer"
                            >
                              -1
                            </button>
                            <button
                              onClick={() =>
                                updateChar((c) => ({ ...c, mp: Math.min(stats.maxMp, c.mp + 1) }))
                              }
                              className="rpg-card px-2 py-0.5 rounded text-xs cursor-pointer"
                            >
                              +1
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <span className="font-display font-black text-xl text-sky-400">
                            {character.mp} <span className="text-xs font-normal opacity-75">/ {stats.maxMp} {campaign.settings.resourceShort}</span>
                          </span>
                          <button
                            onClick={() => sendPlayerRequest('heal-mp', 'Cura / Restaurar Vitais')}
                            className="text-[11px] underline text-sky-300 cursor-pointer"
                          >
                            Pedir Ajuste
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Custom Resource Bars (Estamina, Ki, Sanidade, etc.) */}
                {(campaign.compendium.customResources || []).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(campaign.compendium.customResources || []).map((res) => {
                      const st = getCharacterCustomResourceState(character, res);
                      const pct = Math.max(0, Math.min(100, (st.current / Math.max(1, st.max)) * 100));
                      const setResVal = (nextCur: number, nextMaxOverride?: number) =>
                        updateChar((c) => ({
                          ...c,
                          customResourceValues: {
                            ...(c.customResourceValues || {}),
                            [res.id]: {
                              ...(c.customResourceValues?.[res.id] || {}),
                              current: Math.max(0, Math.min(nextMaxOverride ?? st.max, nextCur)),
                              ...(nextMaxOverride !== undefined ? { maxOverride: nextMaxOverride } : {}),
                            },
                          },
                        }));
                      return (
                        <div key={res.id} className="rpg-card rounded-lg p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-display font-bold" style={{ color: res.color }}>
                              {res.name} ({res.shortName})
                            </span>
                            <span className="font-mono-dice text-[11px] font-bold">
                              {st.current} / {st.max}
                            </span>
                          </div>
                          <div className="w-full h-2.5 rounded-full bg-black/70 border border-white/10 overflow-hidden">
                            <div
                              className="h-full transition-all duration-300"
                              style={{ width: `${pct}%`, backgroundColor: res.color }}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-1 text-[10px]">
                            {role === 'gm' ? (
                              <>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setResVal(st.current - 5)}
                                    className="rpg-card px-1.5 py-0.5 rounded cursor-pointer"
                                  >
                                    -5
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setResVal(st.current - 1)}
                                    className="rpg-card px-1.5 py-0.5 rounded cursor-pointer"
                                  >
                                    -1
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setResVal(st.current + 1)}
                                    className="rpg-card px-1.5 py-0.5 rounded cursor-pointer"
                                  >
                                    +1
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setResVal(st.current + 5)}
                                    className="rpg-card px-1.5 py-0.5 rounded cursor-pointer"
                                  >
                                    +5
                                  </button>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="opacity-65">Máx:</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={st.max}
                                    onChange={(e) =>
                                      setResVal(st.current, Math.max(1, Number(e.target.value) || 1))
                                    }
                                    className="rpg-input w-12 py-0 px-1 text-center font-mono-dice text-[10px]"
                                  />
                                </div>
                              </>
                            ) : (
                              <span className="opacity-60 italic">Controlado pelo Mestre / Habilidades</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Defense, Initiative, Speed, Passive Perception */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rpg-card rounded-xl p-2.5 cursor-help" title={stats.defenseBreakdown.join('\n')}>
                    <div className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
                      Defesa (CA)
                    </div>
                    {role === 'gm' ? (
                      <div className="flex items-center justify-center gap-1 mt-0.5">
                        <input
                          type="number"
                          min={1}
                          value={character.defenseOverride ?? stats.defense}
                          onChange={(e) =>
                            updateChar((c) => ({
                              ...c,
                              defenseOverride: Math.max(1, Number(e.target.value) || 1),
                            }))
                          }
                          className={`rpg-input w-12 text-center font-display font-extrabold text-base py-0 px-1 ${
                            character.defenseOverride ? 'border-amber-400/70 text-amber-200' : ''
                          }`}
                          title="CA Base (editável livremente pelo Mestre)"
                        />
                        {character.defenseOverride !== undefined && (
                          <button
                            type="button"
                            onClick={() => updateChar((c) => ({ ...c, defenseOverride: undefined }))}
                            className="text-[10px] text-amber-300 cursor-pointer"
                            title="Voltar à CA automática"
                          >
                            ↺
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="font-display font-extrabold text-xl" style={{ color: 'var(--accent-primary)' }}>
                        {stats.defense}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      quickRollFormula('Iniciativa', `1d20 + ${stats.initiative}`, character.name)
                    }
                    className="rpg-card rounded-xl p-2.5 cursor-pointer hover:opacity-85"
                  >
                    <div className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
                      Iniciativa 🎲
                    </div>
                    <div className="font-display font-extrabold text-xl">
                      {formatSigned(stats.initiative)}
                    </div>
                  </button>
                  <div className="rpg-card rounded-xl p-2.5 cursor-help" title={stats.speedBreakdown.join('\n')}>
                    <div className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
                      Desloc.
                    </div>
                    {role === 'gm' ? (
                      <div className="flex items-center justify-center gap-1 mt-0.5">
                        <input
                          type="number"
                          min={0}
                          step={1.5}
                          value={character.speedOverride ?? stats.speed}
                          onChange={(e) =>
                            updateChar((c) => ({
                              ...c,
                              speedOverride: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className={`rpg-input w-12 text-center font-display font-extrabold text-base py-0 px-1 ${
                            character.speedOverride !== undefined ? 'border-amber-400/70 text-amber-200' : ''
                          }`}
                          title="Deslocamento base em metros (editável livremente pelo Mestre)"
                        />
                        {character.speedOverride !== undefined && (
                          <button
                            type="button"
                            onClick={() => updateChar((c) => ({ ...c, speedOverride: undefined }))}
                            className="text-[10px] text-amber-300 cursor-pointer"
                            title="Voltar ao deslocamento automático da raça"
                          >
                            ↺
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="font-display font-extrabold text-xl">{stats.speed}m</div>
                    )}
                  </div>
                  <div className="rpg-card rounded-xl p-2.5">
                    <div className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
                      Perc. Pass.
                    </div>
                    <div className="font-display font-extrabold text-xl">
                      {stats.passivePerception}
                    </div>
                  </div>
                </div>

                {/* Octagonal Bronze & Obsidian Attribute Medallions */}
                <div className="rpg-card rounded-lg p-3">
                  <h3 className="font-display font-bold text-sm mb-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span>Atributos (Clique para testar)</span>
                    <div className="flex items-center gap-2">
                      {(availableAttrPoints > 0 || role === 'gm') && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-display font-bold border ${
                            availableAttrPoints > 0
                              ? 'bg-amber-500/20 border-amber-400/70 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.28)]'
                              : 'bg-black/40 border-white/15 text-slate-300'
                          }`}
                          title="Pontos de atributo salvos disponíveis para distribuir"
                        >
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          <span>Pontos disponíveis: {availableAttrPoints}</span>
                          {role === 'gm' && (
                            <span className="inline-flex items-center gap-0.5 ml-1">
                              <button
                                type="button"
                                onClick={() =>
                                  updateChar((c) => ({
                                    ...c,
                                    unspentAttributePoints: Math.max(0, getAvailableAttributePoints(c) - 1),
                                  }))
                                }
                                className="px-1 rounded bg-black/50 hover:bg-black/80 text-amber-200 cursor-pointer"
                                title="Remover 1 ponto disponível"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateChar((c) => ({
                                    ...c,
                                    unspentAttributePoints: getAvailableAttributePoints(c) + 1,
                                  }))
                                }
                                className="px-1 rounded bg-black/50 hover:bg-black/80 text-amber-200 cursor-pointer"
                                title="Conceder +1 ponto disponível"
                              >
                                +
                              </button>
                            </span>
                          )}
                        </span>
                      )}
                      <span className="text-xs font-mono-dice" style={{ color: 'var(--accent-primary)' }}>
                        Prof: +{stats.proficiencyBonus}
                      </span>
                    </div>
                  </h3>
                  <div className="grid grid-cols-3 gap-2.5">
                    {campaign.compendium.attributes.map((attr) => {
                      const comp = stats.attributes[attr.id];
                      return (
                        <div
                          key={attr.id}
                          className="relative rpg-socket rounded-md p-2.5 text-center flex flex-col items-center justify-between group hover:border-amber-400/75 transition"
                          title={comp.breakdown.join(' | ')}
                        >
                          {/* Engraved Octagonal Brass Trim SVG */}
                          <svg
                            viewBox="0 0 100 100"
                            className="absolute inset-1 w-[calc(100%-8px)] h-[calc(100%-8px)] pointer-events-none opacity-35 group-hover:opacity-75 transition"
                            style={{ color: 'var(--border-ornate)' }}
                          >
                            <polygon
                              points="28,3 72,3 97,28 97,72 72,97 28,97 3,72 3,28"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            />
                          </svg>

                          <button
                            onClick={() =>
                              quickRollFormula(`Teste de ${attr.name}`, `1d20 + ${comp.mod}`, character.name)
                            }
                            className="relative z-10 w-full cursor-pointer hover:brightness-115 py-0.5"
                          >
                            <div
                              className="text-[10px] font-display font-bold uppercase tracking-widest"
                              style={{ color: 'var(--accent-primary)' }}
                            >
                              {attr.shortName}
                            </div>
                            <div className="font-chronicle font-black text-2xl sm:text-3xl leading-tight my-1 chronicle-gold-text">
                              {formatSigned(comp.mod)}
                            </div>
                          </button>

                          {role === 'gm' ? (
                            <div className="relative z-10 mt-0.5 flex items-center justify-center gap-1">
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                Base:
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={30}
                                value={character.attributes[attr.id] ?? 10}
                                onChange={(e) =>
                                  updateChar((c) => ({
                                    ...c,
                                    attributes: {
                                      ...c.attributes,
                                      [attr.id]: Math.max(0, Math.min(30, Number(e.target.value) || 0)),
                                    },
                                  }))
                                }
                                className="rpg-input w-12 text-center text-xs py-0 px-1"
                              />
                            </div>
                          ) : (
                            <div className="relative z-10 flex items-center justify-center gap-1 mt-0.5">
                              <div
                                className="text-[10px] font-display font-bold px-2 py-0.5 rounded-xs bg-black/55 border border-amber-500/30 inline-block"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                Valor {comp.value}
                              </div>
                              {availableAttrPoints > 0 &&
                                myCharacter?.id === character.id &&
                                comp.value < 20 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateChar((c) => {
                                        const pts = getAvailableAttributePoints(c);
                                        if (pts <= 0) return c;
                                        const curBase = c.attributes[attr.id] ?? 10;
                                        return {
                                          ...c,
                                          unspentAttributePoints: pts - 1,
                                          attributes: {
                                            ...c.attributes,
                                            [attr.id]: curBase + 1,
                                          },
                                        };
                                      })
                                    }
                                    className="px-1.5 py-0.5 rounded bg-amber-500/90 hover:bg-amber-400 text-[#140e04] font-display font-black text-[10px] cursor-pointer shadow"
                                    title={`Gastar 1 ponto de atributo em ${attr.name} (Restantes: ${availableAttrPoints})`}
                                  >
                                    +1
                                  </button>
                                )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Saving Throws (Salvaguardas) & Skills (Perícias) — clearly separated! */}
              <div className="lg:col-span-7 space-y-3">
                {(() => {
                  const attrOrder = ['for', 'des', 'con', 'int', 'sab', 'car'];
                  const savingThrows = [...campaign.compendium.skills]
                    .filter((s) => s.isSavingThrow)
                    .sort(
                      (a, b) =>
                        (attrOrder.indexOf(a.defaultAttributeId) === -1
                          ? 99
                          : attrOrder.indexOf(a.defaultAttributeId)) -
                        (attrOrder.indexOf(b.defaultAttributeId) === -1
                          ? 99
                          : attrOrder.indexOf(b.defaultAttributeId))
                    );
                  const regularSkills = campaign.compendium.skills.filter((s) => !s.isSavingThrow);
                  const regularSkillIdSet = new Set(regularSkills.map((s) => s.id));
                  const favIds = (character.favoriteSkillIds || []).filter((id) =>
                    regularSkillIdSet.has(id)
                  );

                  return (
                    <>
                      {/* Dedicated Saving Throws (Salvaguardas) Card */}
                      {savingThrows.length > 0 && (
                        <div className="rpg-card rounded-xl p-3 border border-sky-500/30 bg-sky-950/10">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h3 className="font-display font-bold text-sm text-sky-200 flex items-center gap-1.5">
                              <Shield className="w-4 h-4 text-sky-400" />
                              <span>Testes de Resistência (Salvaguardas)</span>
                            </h3>
                            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              {role === 'gm'
                                ? 'Proficiência independente de perícias • Clique para rolar'
                                : 'Clique para rolar 1d20 + bônus'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                            {savingThrows.map((sk) => {
                              const computed = stats.skills[sk.id];
                              if (!computed) return null;
                              return (
                                <div
                                  key={sk.id}
                                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition ${
                                    computed.trained
                                      ? 'bg-sky-500/12 border-sky-400/45'
                                      : 'hover:bg-black/15'
                                  }`}
                                  style={
                                    !computed.trained
                                      ? { borderColor: 'var(--border-subtle)' }
                                      : undefined
                                  }
                                  title={computed.breakdown.join(' | ')}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {role === 'gm' ? (
                                      <input
                                        type="checkbox"
                                        checked={computed.trained}
                                        onChange={() => toggleSkillTrained(sk.id)}
                                        className="accent-sky-400 cursor-pointer"
                                      />
                                    ) : (
                                      <span
                                        className={`w-2 h-2 rounded-full shrink-0 ${
                                          computed.trained
                                            ? 'bg-sky-400 shadow-[0_0_6px_#38bdf8]'
                                            : 'bg-white/15'
                                        }`}
                                        title={
                                          computed.trained
                                            ? 'Salvaguarda Proficiente'
                                            : 'Sem proficiência'
                                        }
                                      />
                                    )}
                                    <button
                                      onClick={() =>
                                        quickRollFormula(
                                          `Salvaguarda: ${computed.attrShort} • ${sk.name}`,
                                          `1d20 + ${computed.total}${computed.diceBonuses.length > 0 ? ` + ${computed.diceBonuses.join(' + ')}` : ''}`,
                                          character.name
                                        )
                                      }
                                      className="text-left text-xs font-medium truncate cursor-pointer hover:underline"
                                    >
                                      <span className="font-mono-dice text-[10px] font-bold text-sky-300 mr-1">
                                        {computed.attrShort}
                                      </span>
                                      <span>{sk.name}</span>
                                    </button>
                                  </div>
                                  <button
                                    onClick={() =>
                                      quickRollFormula(
                                        `Salvaguarda: ${computed.attrShort} • ${sk.name}`,
                                        `1d20 + ${computed.total}${computed.diceBonuses.length > 0 ? ` + ${computed.diceBonuses.join(' + ')}` : ''}`,
                                        character.name
                                      )
                                    }
                                    className="font-mono-dice text-xs font-bold px-2 py-0.5 rounded bg-black/30 cursor-pointer flex items-center gap-1 shrink-0"
                                    style={{
                                      color: computed.trained ? '#7dd3fc' : 'var(--text-primary)',
                                    }}
                                  >
                                    <span>
                                      {formatSigned(computed.total)}
                                      {computed.diceBonuses.length > 0
                                        ? ` +${computed.diceBonuses.join('+')}`
                                        : ''}
                                    </span>
                                    <Dices className="w-3 h-3 opacity-60" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Dedicated Regular Skills (Perícias) Card */}
                      <div className="rpg-card rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-display font-bold text-sm">Perícias</h3>
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {role === 'gm'
                              ? `Treinadas • Estrela fixa no HUD (${favIds.length}/6) • Clique para rolar`
                              : `Clique na estrela para fixar no HUD (${favIds.length}/6) • Clique para rolar`}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {regularSkills.map((sk) => {
                            const computed = stats.skills[sk.id];
                            if (!computed) return null;
                            const isFavorite = favIds.includes(sk.id);
                            const favLimitReached = !isFavorite && favIds.length >= 6;
                            return (
                              <div
                                key={sk.id}
                                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition ${
                                  computed.trained
                                    ? 'bg-amber-500/8 border-amber-500/35'
                                    : 'hover:bg-black/15'
                                }`}
                                style={
                                  !computed.trained
                                    ? { borderColor: 'var(--border-subtle)' }
                                    : undefined
                                }
                                title={computed.breakdown.join(' | ')}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {role === 'gm' ? (
                                    <input
                                      type="checkbox"
                                      checked={computed.trained}
                                      onChange={() => toggleSkillTrained(sk.id)}
                                      className="accent-amber-500 cursor-pointer"
                                    />
                                  ) : (
                                    <span
                                      className={`w-2 h-2 rounded-full shrink-0 ${
                                        computed.trained
                                          ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
                                          : 'bg-white/15'
                                      }`}
                                      title={computed.trained ? 'Perícia Treinada' : 'Não treinada'}
                                    />
                                  )}
                                  <button
                                    onClick={() =>
                                      quickRollFormula(
                                        `Perícia: ${sk.name}`,
                                        `1d20 + ${computed.total}${computed.diceBonuses.length > 0 ? ` + ${computed.diceBonuses.join(' + ')}` : ''}`,
                                        character.name
                                      )
                                    }
                                    className="text-left text-xs font-medium truncate cursor-pointer hover:underline"
                                  >
                                    {sk.name}{' '}
                                    <span
                                      className="text-[10px]"
                                      style={{ color: 'var(--text-muted)' }}
                                    >
                                      ({computed.attrShort})
                                    </span>
                                  </button>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={favLimitReached}
                                    onClick={() => toggleSkillFavorite(sk.id)}
                                    className={`p-1 rounded transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                      isFavorite
                                        ? 'text-amber-300 hover:text-amber-200'
                                        : 'text-white/30 hover:text-amber-300/80'
                                    }`}
                                    title={
                                      isFavorite
                                        ? 'Remover das Perícias Favoritas do HUD'
                                        : favLimitReached
                                          ? 'Limite de 6 perícias favoritas no HUD atingido'
                                          : 'Fixar nas Perícias Favoritas do HUD (1 clique)'
                                    }
                                  >
                                    <Star
                                      className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-400' : ''}`}
                                    />
                                  </button>

                                  <button
                                    onClick={() =>
                                      quickRollFormula(
                                        `Perícia: ${sk.name}`,
                                        `1d20 + ${computed.total}${computed.diceBonuses.length > 0 ? ` + ${computed.diceBonuses.join(' + ')}` : ''}`,
                                        character.name
                                      )
                                    }
                                    className="font-mono-dice text-xs font-bold px-2 py-0.5 rounded bg-black/25 cursor-pointer flex items-center gap-1"
                                    style={{
                                      color: computed.trained
                                        ? 'var(--accent-primary)'
                                        : 'var(--text-primary)',
                                    }}
                                  >
                                    <span>
                                      {formatSigned(computed.total)}
                                      {computed.diceBonuses.length > 0
                                        ? ` +${computed.diceBonuses.join('+')}`
                                        : ''}
                                    </span>
                                    <Dices className="w-3 h-3 opacity-60" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {tab === 'abilities' && (
            <div className="space-y-5">
              {/* EQUIPPED WEAPONS & LEGACY ATTACK CARDS */}
              {((character.customAttacks || []).length > 0 || equippedWeapons.length > 0) && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display font-bold text-sm flex items-center gap-1.5">
                    <Swords className="w-4 h-4 text-red-400" />
                    Cartas de Ataque ({(character.customAttacks || []).length + equippedWeapons.length})
                  </h3>
                  {role === 'player' && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Valores definidos pelo Mestre
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(character.customAttacks || []).map((atk, atkIdx, atkArr) => {
                    const hotkeyPreview = atkIdx + 1;
                    const moveCustomAttack = (dir: -1 | 1) => {
                      const nextIdx = atkIdx + dir;
                      if (nextIdx < 0 || nextIdx >= atkArr.length) return;
                      updateChar((c) => {
                        const list = [...(c.customAttacks || [])];
                        const [moved] = list.splice(atkIdx, 1);
                        list.splice(nextIdx, 0, moved);
                        return { ...c, customAttacks: list };
                      });
                    };
                    return (
                    <div
                      key={atk.id}
                      className={`rpg-card rpg-magic-card rarity-${atk.rarity} rounded-xl p-3.5 flex flex-col justify-between gap-2.5`}
                    >
                      <div>
                        {atk.imageUrl && (
                          <div className="mb-2.5 rounded-lg overflow-hidden border border-white/10 h-28 bg-black/40">
                            <img
                              src={resolveAssetUrl(atk.imageUrl)}
                              alt={atk.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[10px] uppercase tracking-widest opacity-70 flex items-center gap-1.5">
                              {hotkeyPreview <= 9 && (
                                <span className="px-1 py-0.2 rounded bg-black/70 border border-amber-500/50 text-[9px] font-mono-dice font-bold text-amber-300">
                                  {hotkeyPreview}
                                </span>
                              )}
                              <span>Ataque • {atk.rarity}</span>
                            </div>
                            <h4 className="font-display font-bold text-base leading-tight">
                              {atk.name}
                            </h4>
                          </div>
                          <div className="flex items-center gap-1">
                            {atkArr.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  disabled={atkIdx === 0}
                                  onClick={() => moveCustomAttack(-1)}
                                  className="rpg-card px-1 py-0.5 rounded text-[10px] text-amber-200 cursor-pointer disabled:opacity-30"
                                  title="Mover para antes (muda a ordem dos atalhos 1-9)"
                                >
                                  ◀
                                </button>
                                <button
                                  type="button"
                                  disabled={atkIdx === atkArr.length - 1}
                                  onClick={() => moveCustomAttack(1)}
                                  className="rpg-card px-1 py-0.5 rounded text-[10px] text-amber-200 cursor-pointer disabled:opacity-30"
                                  title="Mover para depois (muda a ordem dos atalhos 1-9)"
                                >
                                  ▶
                                </button>
                              </>
                            )}
                          {role === 'gm' && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingAttackId((curr) => (curr === atk.id ? null : atk.id))
                                }
                                className="rpg-card px-1.5 py-0.5 rounded text-[10px] text-amber-200 cursor-pointer"
                              >
                                {editingAttackId === atk.id ? 'Fechar' : 'Editar'}
                              </button>
                              <FileUploadButton
                                label={atk.imageUrl ? 'Foto' : '+ Foto'}
                                accept="image/*"
                                className="rpg-card px-1.5 py-0.5 rounded text-[10px]"
                                onUploaded={(url) =>
                                  updateChar((c) => ({
                                    ...c,
                                    customAttacks: c.customAttacks.map((x) =>
                                      x.id === atk.id ? { ...x, imageUrl: url } : x
                                    ),
                                  }))
                                }
                              />
                              <button
                                onClick={() =>
                                  updateChar((c) => ({
                                    ...c,
                                    customAttacks: c.customAttacks.filter((x) => x.id !== atk.id),
                                  }))
                                }
                                className="text-red-400 opacity-70 hover:opacity-100 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          </div>
                        </div>
                        <div className="mt-2 text-xs font-mono-dice space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                          <div>Acerto: <strong>{formatFormulaForDisplay(atk.attackBonusFormula, stats, character)}</strong></div>
                          <div>Dano: <strong className="text-red-300">{formatFormulaForDisplay(atk.damageFormula, stats, character)}</strong> ({atk.damageType})</div>
                          <div>Alcance: {atk.range}</div>
                        </div>
                        {atk.notes && (
                          <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                            {atk.notes}
                          </p>
                        )}
                        {role === 'gm' && editingAttackId === atk.id && (
                          <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1.5 text-[11px]">
                            <input
                              maxLength={32}
                              value={atk.name}
                              onChange={(e) =>
                                updateChar((c) => ({
                                  ...c,
                                  customAttacks: c.customAttacks.map((x) =>
                                    x.id === atk.id ? { ...x, name: e.target.value } : x
                                  ),
                                }))
                              }
                              className="rpg-input w-full py-1"
                              placeholder="Nome do ataque"
                            />
                            <div className="grid grid-cols-2 gap-1.5">
                              <input
                                value={atk.attackBonusFormula}
                                onChange={(e) =>
                                  updateChar((c) => ({
                                    ...c,
                                    customAttacks: c.customAttacks.map((x) =>
                                      x.id === atk.id ? { ...x, attackBonusFormula: e.target.value } : x
                                    ),
                                  }))
                                }
                                className="rpg-input w-full py-1 font-mono-dice"
                                placeholder="Acerto"
                              />
                              <input
                                value={atk.damageFormula}
                                onChange={(e) =>
                                  updateChar((c) => ({
                                    ...c,
                                    customAttacks: c.customAttacks.map((x) =>
                                      x.id === atk.id ? { ...x, damageFormula: e.target.value } : x
                                    ),
                                  }))
                                }
                                className="rpg-input w-full py-1 font-mono-dice"
                                placeholder="Dano"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <select
                                value={atk.damageType}
                                onChange={(e) =>
                                  updateChar((c) => ({
                                    ...c,
                                    customAttacks: c.customAttacks.map((x) =>
                                      x.id === atk.id ? { ...x, damageType: e.target.value } : x
                                    ),
                                  }))
                                }
                                className="rpg-input w-full py-1"
                              >
                                {campaignDamageTypes.map((dt) => (
                                  <option key={dt} value={dt}>
                                    {dt}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={atk.range}
                                onChange={(e) =>
                                  updateChar((c) => ({
                                    ...c,
                                    customAttacks: c.customAttacks.map((x) =>
                                      x.id === atk.id ? { ...x, range: e.target.value } : x
                                    ),
                                  }))
                                }
                                className="rpg-input w-full py-1"
                              >
                                {ATTACK_RANGE_OPTIONS.map((rng) => (
                                  <option key={rng} value={rng}>
                                    {rng}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          rollCharacterAction({
                            characterId: character.id,
                            title: atk.name,
                            attackFormula: atk.attackBonusFormula,
                            damageFormula: atk.damageFormula,
                            damageType: atk.damageType,
                            range: atk.range,
                            actionCost: 'Padrão',
                            isWeaponAttack: true,
                          });
                          onClose();
                        }}
                        className="rpg-btn-crimson w-full py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Swords className="w-3.5 h-3.5" />
                        Selecionar Alvo &amp; Atacar
                      </button>
                    </div>
                    );
                  })}

                  {equippedWeapons.map(({ inv, item }) => (
                    <div
                      key={inv.id}
                      className="rpg-card rpg-magic-card rarity-comum rounded-xl p-3.5 flex flex-col justify-between gap-2.5"
                    >
                      <div>
                        <div className="text-[10px] uppercase tracking-widest opacity-70">
                          Arma Equipada
                        </div>
                        <h4 className="font-display font-bold text-base">{item!.name}</h4>
                        <div className="mt-2 text-xs font-mono-dice space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                          <div>Acerto: {formatFormulaForDisplay(item!.attackFormula || '', stats, character)}</div>
                          <div>Dano: {formatFormulaForDisplay(item!.damageFormula || '', stats, character)} ({item!.damageType})</div>
                          <div>Alcance: {item!.range || 'Corpo a Corpo (1,5m)'}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          rollCharacterAction({
                            characterId: character.id,
                            title: item!.name,
                            attackFormula: item!.attackFormula,
                            damageFormula: item!.damageFormula,
                            damageType: item!.damageType,
                            range: item!.range,
                            actionCost: 'Padrão',
                            isWeaponAttack: true,
                            critRange: item!.critRange,
                            critMultiplier: item!.critMultiplier,
                          });
                          onClose();
                        }}
                        className="rpg-btn-crimson w-full py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Swords className="w-3.5 h-3.5" /> Atacar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* CUSTOM ABILITIES + COMPENDIUM ABILITIES */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <h3 className="font-display font-bold text-sm flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-orange-400" />
                    Cartas de Habilidades &amp; Magias
                  </h3>
                  {role === 'gm' && (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={addAbilityId}
                        onChange={(e) => setAddAbilityId(e.target.value)}
                        className="rpg-input text-xs py-1"
                      >
                        {campaign.compendium.abilities.map((ab) => (
                          <option key={ab.id} value={ab.id}>
                            {ab.name} ({ab.category})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          if (!addAbilityId) return;
                          if (character.knownAbilityIds.includes(addAbilityId)) return;
                          updateChar((c) => ({
                            ...c,
                            knownAbilityIds: [...c.knownAbilityIds, addAbilityId],
                          }));
                        }}
                        className="rpg-btn-primary px-2.5 py-1 rounded text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Do Compêndio
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {getInventoryChargedAbilities(character, campaign).map(
                    ({
                      inventoryEntryId,
                      itemDef,
                      ability: ab,
                      maxCharges,
                      chargesRemaining,
                      rechargeType,
                    }) => (
                      <div
                        key={`sheet-item-chg-${inventoryEntryId}`}
                        className="rpg-card rounded-xl p-3.5 flex flex-col justify-between gap-2.5 border-2"
                        style={{
                          borderColor: '#a855f7',
                          backgroundColor: 'rgba(168, 85, 247, 0.1)',
                        }}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display font-bold text-sm text-purple-100">
                              ⚡ {ab.name}
                            </span>
                            <span className="text-[10px] font-mono-dice px-1.5 py-0.5 rounded bg-purple-950/90 border border-purple-400/50 text-purple-200">
                              {maxCharges > 0 ? `${chargesRemaining}/${maxCharges} cargas` : 'Ilimitado'}
                            </span>
                          </div>
                          <div className="text-[10px] text-purple-200/80">
                            Item: <strong>{itemDef.name}</strong> • {ab.actionType} •{' '}
                            {rechargeType === 'consumable'
                              ? 'Consumível'
                              : rechargeType === 'short-rest'
                                ? 'Desc. Curto/Longo'
                                : 'Desc. Longo'}
                          </div>
                          {ab.description && (
                            <p className="text-[11px] opacity-80 line-clamp-2">{ab.description}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={maxCharges > 0 && chargesRemaining <= 0}
                          onClick={() => useChargedItemAbility(character.id, inventoryEntryId)}
                          className="w-full rpg-btn-primary py-1.5 rounded text-xs font-display font-bold cursor-pointer disabled:opacity-40"
                        >
                          ⚡ Usar via {itemDef.name} (0 PM)
                        </button>
                      </div>
                    )
                  )}
                  {getConditionGrantedAbilities(character.activeConditionIds, campaign).map(
                    ({ ability: ab, condition: cond }) => (
                      <div
                        key={`sheet-cond-${cond.id}-${ab.id}`}
                        className="rpg-card rounded-xl p-3.5 flex flex-col justify-between gap-2.5 border-2"
                        style={{
                          borderColor: cond.color || '#f59e0b',
                          boxShadow: `0 0 18px ${cond.color || '#f59e0b'}35`,
                        }}
                      >
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-display font-bold flex items-center gap-1" style={{ color: cond.color || '#f59e0b' }}>
                            <span>{cond.icon}</span>
                            <span>Liberada por: {cond.name}</span>
                          </div>
                          <h4 className="font-display font-bold text-base mt-0.5">{ab.name}</h4>
                          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                            {ab.description}
                          </p>
                          {ab.damageFormula && (
                            <div className="text-[11px] mt-1.5 font-mono-dice text-amber-300">
                              Efeito: {formatFormulaForDisplay(ab.damageFormula, stats, character)} ({ab.damageType})
                            </div>
                          )}
                        </div>
                        <button
                          disabled={role !== 'gm' && character.hp <= 0}
                          onClick={() => {
                            const cost: ActionEconomyCost = normalizeActionEconomyCost(ab.actionType);
                            rollCharacterAction({
                              characterId: character.id,
                              title: ab.name,
                              attackFormula: ab.attackFormula,
                              damageFormula: ab.damageFormula,
                              damageType: ab.damageType,
                              range: ab.range,
                              actionCost: cost,
                              saveSkillId: ab.saveSkillId,
                              saveDcFormula: ab.saveDcFormula,
                              costMp: ab.costMp,
                              costResourceId: ab.costResourceId,
                              applyConditionId: ab.applyConditionId,
                              conditionDurationRounds: ab.conditionDurationRounds,
                              aoeShape: ab.aoeShape,
                              aoeSizeMeters: ab.aoeSizeMeters,
                              aoeColor: ab.aoeColor,
                              aoePersistent: ab.aoePersistent,
                              isTeleport: ab.isTeleport,
                              teleportRequiresSight: ab.teleportRequiresSight,
                              teleportAoeOrigin: ab.teleportAoeOrigin,
                            });
                            onClose();
                          }}
                          className="rpg-btn-primary w-full py-2 rounded-lg text-xs cursor-pointer disabled:opacity-40"
                        >
                          {cond.icon} Usar {ab.name}
                        </button>
                      </div>
                    )
                  )}

                  {(character.customAbilities || []).map((ab, abIdx, abArr) => {
                    const moveCustomAbility = (dir: -1 | 1) => {
                      const nextIdx = abIdx + dir;
                      if (nextIdx < 0 || nextIdx >= abArr.length) return;
                      updateChar((c) => {
                        const list = [...(c.customAbilities || [])];
                        const [moved] = list.splice(abIdx, 1);
                        list.splice(nextIdx, 0, moved);
                        return { ...c, customAbilities: list };
                      });
                    };
                    return (
                    <div
                      key={ab.id}
                      className={`rpg-card rpg-magic-card rarity-${ab.rarity} rounded-xl p-3.5 flex flex-col justify-between gap-2.5`}
                    >
                      <div>
                        {ab.imageUrl && (
                          <div className="mb-2.5 rounded-lg overflow-hidden border border-white/10 h-28 bg-black/40">
                            <img
                              src={resolveAssetUrl(ab.imageUrl)}
                              alt={ab.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[10px] uppercase tracking-widest opacity-70">
                              {ab.actionType} • {ab.rarity}
                            </div>
                            <h4 className="font-display font-bold text-base">{ab.name}</h4>
                          </div>
                          <div className="flex items-center gap-1">
                            {abArr.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  disabled={abIdx === 0}
                                  onClick={() => moveCustomAbility(-1)}
                                  className="rpg-card px-1 py-0.5 rounded text-[10px] text-amber-200 cursor-pointer disabled:opacity-30"
                                  title="Mover para antes (muda a ordem na aba de ações)"
                                >
                                  ◀
                                </button>
                                <button
                                  type="button"
                                  disabled={abIdx === abArr.length - 1}
                                  onClick={() => moveCustomAbility(1)}
                                  className="rpg-card px-1 py-0.5 rounded text-[10px] text-amber-200 cursor-pointer disabled:opacity-30"
                                  title="Mover para depois (muda a ordem na aba de ações)"
                                >
                                  ▶
                                </button>
                              </>
                            )}
                            {ab.costMp > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">
                                {ab.costMp} {campaign.settings.resourceShort}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setEditingCutInAbilityId((curr) => (curr === ab.id ? null : ab.id))
                              }
                              className={`px-1.5 py-0.5 rounded text-[10px] border cursor-pointer transition ${
                                ab.isUltimate || ab.isDomainExpansion
                                  ? 'bg-sky-950/85 border-sky-400/65 text-sky-200 font-bold'
                                  : 'rpg-card text-[#c7bda9] hover:text-sky-200'
                              }`}
                              title="Configurar Cut-In de Técnica Suprema / Expansão de Domínio nesta habilidade"
                            >
                              {ab.isDomainExpansion
                                ? 'Domínio'
                                : ab.isUltimate
                                  ? 'Cut-In ★'
                                  : 'Cut-In'}
                            </button>
                            {role === 'gm' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingAbilityId((curr) => (curr === ab.id ? null : ab.id))
                                  }
                                  className="rpg-card px-1.5 py-0.5 rounded text-[10px] text-amber-200 cursor-pointer"
                                >
                                  {editingAbilityId === ab.id ? 'Fechar' : 'Editar'}
                                </button>
                                <FileUploadButton
                                  label={ab.imageUrl ? 'Foto' : '+ Foto'}
                                  accept="image/*"
                                  className="rpg-card px-1.5 py-0.5 rounded text-[10px]"
                                  onUploaded={(url) =>
                                    updateChar((c) => ({
                                      ...c,
                                      customAbilities: c.customAbilities.map((x) =>
                                        x.id === ab.id ? { ...x, imageUrl: url } : x
                                      ),
                                    }))
                                  }
                                />
                                <button
                                  onClick={() =>
                                    updateChar((c) => ({
                                      ...c,
                                      customAbilities: c.customAbilities.filter((x) => x.id !== ab.id),
                                    }))
                                  }
                                  className="text-red-400 opacity-70 hover:opacity-100 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                          {ab.description}
                        </p>
                        {ab.damageFormula && (
                          <div className="text-[11px] mt-1.5 font-mono-dice text-amber-300">
                            Efeito: {formatFormulaForDisplay(ab.damageFormula, stats, character)} ({ab.damageType})
                          </div>
                        )}
                        {role === 'gm' && editingAbilityId === ab.id && (
                          <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1.5 text-[11px]">
                            <input
                              maxLength={32}
                              value={ab.name}
                              onChange={(e) =>
                                updateChar((c) => ({
                                  ...c,
                                  customAbilities: c.customAbilities.map((x) =>
                                    x.id === ab.id ? { ...x, name: e.target.value } : x
                                  ),
                                }))
                              }
                              className="rpg-input w-full py-1"
                              placeholder="Nome da habilidade"
                            />
                            <div className="grid grid-cols-2 gap-1.5">
                              <select
                                value={ab.actionType}
                                onChange={(e) =>
                                  updateChar((c) => ({
                                    ...c,
                                    customAbilities: c.customAbilities.map((x) =>
                                      x.id === ab.id
                                        ? {
                                            ...x,
                                            actionType: e.target
                                              .value as CharacterCustomAbility['actionType'],
                                          }
                                        : x
                                    ),
                                  }))
                                }
                                className="rpg-input w-full py-1"
                              >
                                <option value="Padrão">Padrão</option>
                                <option value="Bônus">Bônus</option>
                                <option value="Reação">Reação</option>
                                <option value="Movimento">Movimento</option>
                                <option value="Livre">Livre</option>
                                <option value="Passiva">Passiva</option>
                              </select>
                              <input
                                type="number"
                                min={0}
                                value={ab.costMp}
                                onChange={(e) =>
                                  updateChar((c) => ({
                                    ...c,
                                    customAbilities: c.customAbilities.map((x) =>
                                      x.id === ab.id ? { ...x, costMp: Math.max(0, Number(e.target.value) || 0) } : x
                                    ),
                                  }))
                                }
                                className="rpg-input w-full py-1 text-center"
                                title="Custo de PM"
                              />
                            </div>
                            <input
                              value={ab.damageFormula || ''}
                              onChange={(e) =>
                                updateChar((c) => ({
                                  ...c,
                                  customAbilities: c.customAbilities.map((x) =>
                                    x.id === ab.id ? { ...x, damageFormula: e.target.value } : x
                                  ),
                                }))
                              }
                              className="rpg-input w-full py-1 font-mono-dice"
                              placeholder="Fórmula dano/cura"
                            />
                            <div className="grid grid-cols-2 gap-1.5">
                              <select
                                value={ab.damageType || campaignDamageTypes[0]}
                                onChange={(e) =>
                                  updateChar((c) => ({
                                    ...c,
                                    customAbilities: c.customAbilities.map((x) =>
                                      x.id === ab.id ? { ...x, damageType: e.target.value } : x
                                    ),
                                  }))
                                }
                                className="rpg-input w-full py-1"
                              >
                                {campaignDamageTypes.map((dt) => (
                                  <option key={dt} value={dt}>
                                    {dt}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={ab.range}
                                onChange={(e) =>
                                  updateChar((c) => ({
                                    ...c,
                                    customAbilities: c.customAbilities.map((x) =>
                                      x.id === ab.id ? { ...x, range: e.target.value } : x
                                    ),
                                  }))
                                }
                                className="rpg-input w-full py-1"
                              >
                                {ATTACK_RANGE_OPTIONS.map((rng) => (
                                  <option key={rng} value={rng}>
                                    {rng}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[11px]">
                              <label className="flex items-center gap-1.5 cursor-pointer select-none text-cyan-200">
                                <input
                                  type="checkbox"
                                  checked={Boolean(ab.isTeleport)}
                                  onChange={(e) =>
                                    updateChar((c) => ({
                                      ...c,
                                      customAbilities: c.customAbilities.map((x) =>
                                        x.id === ab.id
                                          ? {
                                              ...x,
                                              isTeleport: e.target.checked || undefined,
                                              teleportRequiresSight: e.target.checked
                                                ? x.teleportRequiresSight ?? true
                                                : undefined,
                                            }
                                          : x
                                      ),
                                    }))
                                  }
                                  className="accent-cyan-400"
                                />
                                <span>Teletransporte (sem Atq. Oportunidade)</span>
                              </label>
                              {ab.isTeleport && (
                                <label className="flex items-center gap-1.5 cursor-pointer select-none text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={ab.teleportRequiresSight !== false}
                                    onChange={(e) =>
                                      updateChar((c) => ({
                                        ...c,
                                        customAbilities: c.customAbilities.map((x) =>
                                          x.id === ab.id
                                            ? { ...x, teleportRequiresSight: e.target.checked }
                                            : x
                                        ),
                                      }))
                                    }
                                    className="accent-cyan-400"
                                  />
                                  <span>Exige Linha de Visão</span>
                                </label>
                              )}
                            </div>
                            <textarea
                              rows={2}
                              value={ab.description}
                              onChange={(e) =>
                                updateChar((c) => ({
                                  ...c,
                                  customAbilities: c.customAbilities.map((x) =>
                                    x.id === ab.id ? { ...x, description: e.target.value } : x
                                  ),
                                }))
                              }
                              className="rpg-input w-full py-1"
                            />
                          </div>
                        )}

                        {/* Cut-In / Domain Expansion Config Panel (usable by BOTH Player & GM!) */}
                        {editingCutInAbilityId === ab.id && (
                          <div className="mt-2 p-2.5 rounded-lg bg-[#0d1424]/90 border border-sky-400/45 space-y-2 text-[11px]">
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="flex items-center gap-1.5 cursor-pointer text-sky-200 font-semibold">
                                <input
                                  type="checkbox"
                                  checked={Boolean(ab.isUltimate)}
                                  onChange={(e) =>
                                    updateChar((c) => ({
                                      ...c,
                                      customAbilities: c.customAbilities.map((x) =>
                                        x.id === ab.id
                                          ? {
                                              ...x,
                                              isUltimate: e.target.checked || undefined,
                                              ultimateColor: x.ultimateColor || charColor,
                                            }
                                          : x
                                      ),
                                    }))
                                  }
                                  className="accent-sky-400 cursor-pointer"
                                />
                                <span>Ativar Cut-In</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer text-purple-200 font-semibold">
                                <input
                                  type="checkbox"
                                  checked={Boolean(ab.isDomainExpansion)}
                                  onChange={(e) =>
                                    updateChar((c) => ({
                                      ...c,
                                      customAbilities: c.customAbilities.map((x) =>
                                        x.id === ab.id
                                          ? {
                                              ...x,
                                              isDomainExpansion: e.target.checked || undefined,
                                              isUltimate: e.target.checked ? true : x.isUltimate,
                                              domainTheme: x.domainTheme || 'sonic',
                                              ultimateColor: x.ultimateColor || charColor,
                                            }
                                          : x
                                      ),
                                    }))
                                  }
                                  className="accent-purple-400 cursor-pointer"
                                />
                                <span>Expansão de Domínio</span>
                              </label>
                            </div>
                            <input
                              type="text"
                              value={ab.ultimateCatchphrase || ''}
                              onChange={(e) =>
                                updateChar((c) => ({
                                  ...c,
                                  customAbilities: c.customAbilities.map((x) =>
                                    x.id === ab.id
                                      ? { ...x, ultimateCatchphrase: e.target.value }
                                      : x
                                  ),
                                }))
                              }
                              placeholder="Frase de impacto no Cut-In..."
                              className="rpg-input w-full py-1 text-[11px]"
                            />
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={ab.ultimateColor || charColor || '#38bdf8'}
                                onChange={(e) =>
                                  updateChar((c) => ({
                                    ...c,
                                    customAbilities: c.customAbilities.map((x) =>
                                      x.id === ab.id ? { ...x, ultimateColor: e.target.value } : x
                                    ),
                                  }))
                                }
                                className="w-7 h-7 rounded bg-transparent border border-white/20 cursor-pointer shrink-0"
                                title="Cor da aura do Cut-In"
                              />
                              {ab.isDomainExpansion && (
                                <select
                                  value={ab.domainTheme || 'sonic'}
                                  onChange={(e) =>
                                    updateChar((c) => ({
                                      ...c,
                                      customAbilities: c.customAbilities.map((x) =>
                                        x.id === ab.id
                                          ? { ...x, domainTheme: e.target.value as DomainThemePreset }
                                          : x
                                      ),
                                    }))
                                  }
                                  className="rpg-input flex-1 py-1 text-[11px]"
                                >
                                  <option value="sonic">Tema: Sônico</option>
                                  <option value="void">Tema: Vazio</option>
                                  <option value="crimson">Tema: Carmesim</option>
                                  <option value="frost">Tema: Glacial</option>
                                  <option value="solar">Tema: Solar</option>
                                  <option value="emerald">Tema: Esmeralda</option>
                                </select>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  triggerUltimateCutIn({
                                    actorName: character.name,
                                    techniqueName: ab.name,
                                    catchphrase: ab.ultimateCatchphrase,
                                    color: ab.ultimateColor || charColor,
                                    portraitUrl: ab.ultimateImageUrl || ab.imageUrl || character.portraitUrl,
                                    style: ab.ultimateStyle,
                                    sfxPreset: ab.ultimateSfxPreset,
                                    sfxUrl: ab.ultimateSfxUrl,
                                    activateDomain: Boolean(ab.isDomainExpansion),
                                    domainTheme: ab.domainTheme || 'sonic',
                                    domainDurationRounds: ab.domainDurationRounds,
                                    domainMusicUrl: ab.domainMusicUrl,
                                    casterCharacterId: character.id,
                                  })
                                }
                                className="px-2 py-1 rounded bg-sky-900/75 hover:bg-sky-800/80 border border-sky-400/60 text-sky-100 text-[10px] font-display font-bold cursor-pointer shrink-0"
                              >
                                Testar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {ab.actionType !== 'Passiva' && (
                        <button
                          onClick={() => {
                            const cost: ActionEconomyCost = normalizeActionEconomyCost(ab.actionType);
                            rollCharacterAction({
                              characterId: character.id,
                              title: ab.name,
                              attackFormula: ab.attackFormula,
                              damageFormula: ab.damageFormula,
                              damageType: ab.damageType,
                              range: ab.range,
                              actionCost: cost,
                              costMp: ab.costMp,
                              costResourceId: ab.costResourceId,
                              isTeleport: ab.isTeleport,
                              teleportRequiresSight: ab.teleportRequiresSight,
                            });
                            const isRangedTargeted = Boolean(
                              ab.range && !ab.range.toLowerCase().includes('pessoal')
                            );
                            if (
                              ab.isTeleport ||
                              ab.attackFormula ||
                              isRangedTargeted ||
                              (ab.damageFormula && ab.damageType?.toLowerCase() !== 'cura')
                            ) {
                              onClose();
                            }
                          }}
                          className="rpg-btn-primary w-full py-2 rounded-lg text-xs cursor-pointer"
                        >
                          Usar Habilidade {ab.costMp > 0 ? `(-${ab.costMp} ${campaign.settings.resourceShort})` : ''}
                        </button>
                      )}
                    </div>
                    );
                  })}

                  {character.knownAbilityIds.map((aid, knownIdx, knownArr) => {
                    const ab = campaign.compendium.abilities.find((a) => a.id === aid);
                    if (!ab) return null;
                    const moveKnownAbility = (dir: -1 | 1) => {
                      const nextIdx = knownIdx + dir;
                      if (nextIdx < 0 || nextIdx >= knownArr.length) return;
                      updateChar((c) => {
                        const list = [...c.knownAbilityIds];
                        const [moved] = list.splice(knownIdx, 1);
                        list.splice(nextIdx, 0, moved);
                        return { ...c, knownAbilityIds: list };
                      });
                    };
                    return (
                      <div
                        key={aid}
                        className="rpg-card rpg-magic-card rarity-raro rounded-xl p-3.5 flex flex-col justify-between gap-2.5"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[10px] uppercase tracking-widest opacity-70 flex items-center gap-1.5 flex-wrap">
                                <span>{ab.category} • {ab.actionType}</span>
                                {(ab.isDomainExpansion || ab.isUltimate) && (
                                  <span
                                    className="px-1.5 py-0.2 rounded text-[9px] font-display font-bold border"
                                    style={{
                                      borderColor: `${ab.ultimateColor || '#38bdf8'}88`,
                                      color: ab.ultimateColor || '#38bdf8',
                                      backgroundColor: `${ab.ultimateColor || '#38bdf8'}18`,
                                    }}
                                  >
                                    {ab.isDomainExpansion ? 'DOMÍNIO' : 'SUPREMA'}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-display font-bold text-base">{ab.name}</h4>
                            </div>
                            <div className="flex items-center gap-1">
                              {knownArr.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    disabled={knownIdx === 0}
                                    onClick={() => moveKnownAbility(-1)}
                                    className="rpg-card px-1 py-0.5 rounded text-[10px] text-amber-200 cursor-pointer disabled:opacity-30"
                                    title="Mover para antes (muda a ordem dos atalhos 1-9)"
                                  >
                                    ◀
                                  </button>
                                  <button
                                    type="button"
                                    disabled={knownIdx === knownArr.length - 1}
                                    onClick={() => moveKnownAbility(1)}
                                    className="rpg-card px-1 py-0.5 rounded text-[10px] text-amber-200 cursor-pointer disabled:opacity-30"
                                    title="Mover para depois (muda a ordem dos atalhos 1-9)"
                                  >
                                    ▶
                                  </button>
                                </>
                              )}
                              {ab.costMp > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">
                                  {ab.costMp} {campaign.settings.resourceShort}
                                </span>
                              )}
                              {role === 'gm' && (
                                <button
                                  onClick={() =>
                                    updateChar((c) => ({
                                      ...c,
                                      knownAbilityIds: c.knownAbilityIds.filter((x) => x !== aid),
                                    }))
                                  }
                                  className="text-red-400 opacity-60 hover:opacity-100 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                            {ab.description}
                          </p>
                          <div className="text-[11px] mt-1.5 font-mono-dice" style={{ color: 'var(--text-muted)' }}>
                            Alcance: {ab.range} • Duração: {ab.duration}
                          </div>
                        </div>

                        {ab.actionType !== 'Passiva' && (
                          <button
                            onClick={() => {
                              const cost: ActionEconomyCost = normalizeActionEconomyCost(ab.actionType);
                              rollCharacterAction({
                                characterId: character.id,
                                title: ab.name,
                                attackFormula: ab.attackFormula,
                                damageFormula: ab.damageFormula,
                                damageType: ab.damageType,
                                range: ab.range,
                                actionCost: cost,
                                saveSkillId: ab.saveSkillId,
                                saveDcFormula: ab.saveDcFormula,
                                costMp: ab.costMp,
                                costResourceId: ab.costResourceId,
                                applyConditionId: ab.applyConditionId,
                                conditionDurationRounds: ab.conditionDurationRounds,
                                aoeShape: ab.aoeShape,
                                aoeSizeMeters: ab.aoeSizeMeters,
                                aoeColor: ab.aoeColor,
                                aoePersistent: ab.aoePersistent,
                                isTeleport: ab.isTeleport,
                                teleportRequiresSight: ab.teleportRequiresSight,
                                teleportAoeOrigin: ab.teleportAoeOrigin,
                              });
                              const isRangedTargeted = Boolean(
                                ab.range && !ab.range.toLowerCase().includes('pessoal')
                              );
                              if (
                                ab.isTeleport ||
                                ab.aoeShape ||
                                ab.attackFormula ||
                                ab.damageFormula ||
                                isRangedTargeted
                              ) {
                                onClose();
                              }
                            }}
                            className="rpg-btn-primary w-full py-2 rounded-lg text-xs cursor-pointer"
                          >
                            Conjurar / Usar {ab.costMp > 0 ? `(-${ab.costMp} ${campaign.settings.resourceShort})` : ''}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'inventory' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rpg-card rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold">Ouro (PO):</span>
                  {role === 'gm' ? (
                    <input
                      type="number"
                      value={character.gold}
                      onChange={(e) => updateChar((c) => ({ ...c, gold: Number(e.target.value) }))}
                      className="rpg-input w-24 text-xs font-bold"
                    />
                  ) : (
                    <span className="font-display font-bold text-sm text-amber-400">
                      {character.gold} PO
                    </span>
                  )}
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Peso Total: <strong>{stats.totalWeight} kg</strong>
                  </span>
                </div>

                {role === 'gm' && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={addItemId}
                      onChange={(e) => setAddItemId(e.target.value)}
                      className="rpg-input text-xs py-1"
                    >
                      {campaign.compendium.items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name} ({it.type})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (!addItemId) return;
                        updateChar((c) => {
                          const existing = c.inventory.find((x) => x.itemId === addItemId);
                          if (existing) {
                            return {
                              ...c,
                              inventory: c.inventory.map((x) =>
                                x.id === existing.id ? { ...x, quantity: x.quantity + 1 } : x
                              ),
                            };
                          }
                          return {
                            ...c,
                            inventory: [
                              ...c.inventory,
                              { id: `inv-${Date.now()}`, itemId: addItemId, quantity: 1, equipped: false },
                            ],
                          };
                        });
                      }}
                      className="rpg-btn-primary px-3 py-1 rounded text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Entregar Item
                    </button>
                  </div>
                )}
              </div>

              {/* AAA DARK-FANTASY ILLUSTRATED ANATOMICAL RELIQUARY PAPERDOLL (Class-Bound, 7 Slots) */}
              <EquipmentPaperdoll
                character={character}
                campaign={campaign}
                stats={stats}
                charClassName={charClass?.name}
                classPaperdollArchetype={charClass?.paperdollArchetype}
                charColor={charColor}
                resolveAssetUrl={resolveAssetUrl}
                onToggleEquip={toggleEquipInventoryEntry}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {character.inventory.map((inv) => {
                  const item = campaign.compendium.items.find((i) => i.id === inv.itemId);
                  if (!item) return null;
                  const itemSlot = inv.equippedSlot || resolveItemEquipSlot(item);
                  return (
                    <div key={inv.id} className="rpg-card rounded-xl p-3 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-start gap-2.5">
                        {item.imageUrl && (
                          <img
                            src={resolveAssetUrl(item.imageUrl)}
                            alt={item.name}
                            className="w-11 h-11 rounded-md object-cover border border-amber-400/45 shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-sm truncate">{item.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/25">
                            {item.type}
                          </span>
                          {itemSlot && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-500/30 text-amber-200">
                              {EQUIP_SLOT_LABELS[itemSlot]}
                            </span>
                          )}
                          {(() => {
                            const b =
                              extractItemDefenseBonus(item) +
                              (item.modifiers
                                ?.filter((m) => m.target === 'defense')
                                .reduce((a, m) => a + m.value, 0) || 0);
                            return b > 0 ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-400/50 text-emerald-300 font-mono-dice font-bold">
                                +{b} CA
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                          {item.description}
                        </p>
                        {inv.customNotes && (
                          <p className="text-[11px] mt-1 italic text-amber-200/80">
                            Nota: {inv.customNotes}
                          </p>
                        )}
                        <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                          Peso: {item.weight}kg • Valor: {item.valueGold} PO
                        </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingItemId((curr) => (curr === inv.id ? null : inv.id))
                            }
                            className="rpg-card px-2 py-0.5 rounded text-[10px] font-display font-bold text-amber-200 hover:border-amber-400/60 cursor-pointer"
                            title="Editar item / notas"
                          >
                            {editingItemId === inv.id ? 'Fechar' : 'Editar'}
                          </button>
                          {role === 'gm' ? (
                            <>
                              <input
                                type="number"
                                min={1}
                                value={inv.quantity}
                                onChange={(e) =>
                                  updateChar((c) => ({
                                    ...c,
                                    inventory: c.inventory.map((x) =>
                                      x.id === inv.id ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x
                                    ),
                                  }))
                                }
                                className="rpg-input w-12 text-center text-xs py-0.5"
                              />
                              <button
                                onClick={() =>
                                  updateChar((c) => ({
                                    ...c,
                                    inventory: c.inventory.filter((x) => x.id !== inv.id),
                                  }))
                                }
                                className="p-1 text-red-400 hover:opacity-80 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs font-bold opacity-80">x{inv.quantity}</span>
                          )}
                        </div>

                        {item.type === 'Carta' ? (
                          <button
                            type="button"
                            onClick={() =>
                              setReadingLetterItem({
                                name: item.name,
                                text: item.letterText || item.description || 'Pergaminho em branco.',
                                imageUrl: item.imageUrl,
                              })
                            }
                            className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] font-display font-bold cursor-pointer"
                            title="Abrir e ler esta carta (visível apenas para você)"
                          >
                            📜 Ler Carta
                          </button>
                        ) : item.type === 'Consumível' ? (
                          <button
                            disabled={role !== 'gm' && character.hp <= 0}
                            onClick={() => useConsumable(character.id, inv.id, item.id)}
                            title={
                              role !== 'gm' && character.hp <= 0
                                ? 'Você está caído (0 PV) e não pode usar consumíveis'
                                : 'Consumir este item'
                            }
                            className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Consumir
                          </button>
                        ) : (
                          <button
                            disabled={role !== 'gm' && character.hp <= 0}
                            onClick={() => toggleEquipInventoryEntry(inv.id)}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              inv.equipped ? 'rpg-btn-primary' : 'rpg-card border'
                            }`}
                          >
                            {inv.equipped ? '✓ Vestido' : 'Equipar'}
                          </button>
                        )}
                        {campaign.characters.length > 1 && (role === 'gm' || character.hp > 0) && (
                          <button
                            type="button"
                            onClick={() =>
                              setTransferInvId((curr) => (curr === inv.id ? null : inv.id))
                            }
                            className="rpg-card px-2 py-1 rounded text-[11px] hover:border-amber-400 cursor-pointer"
                            title="Entregar este item para outro jogador"
                          >
                            🎁 Dar
                          </button>
                        )}
                      </div>
                      </div>

                      {transferInvId === inv.id && (
                        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="text-amber-300/90 font-display font-bold">
                            Entregar 1× {item.name} para:
                          </span>
                          {campaign.characters
                            .filter((other) => other.id !== character.id)
                            .map((other) => (
                              <button
                                key={other.id}
                                type="button"
                                onClick={async () => {
                                  const ok = await openConfirmDialog(
                                    `Entregar 1× "${item.name}" de ${character.name} para ${other.name}?`,
                                    'Entregar Item',
                                    { confirmLabel: 'Entregar', cancelLabel: 'Cancelar' }
                                  );
                                  if (!ok) return;
                                  updateCampaign((prev) => ({
                                    ...prev,
                                    characters: prev.characters.map((c) => {
                                      if (c.id === character.id) {
                                        return {
                                          ...c,
                                          inventory:
                                            inv.quantity > 1
                                              ? c.inventory.map((x) =>
                                                  x.id === inv.id
                                                    ? { ...x, quantity: x.quantity - 1 }
                                                    : x
                                                )
                                              : c.inventory.filter((x) => x.id !== inv.id),
                                        };
                                      }
                                      if (c.id === other.id) {
                                        const existing = c.inventory.find(
                                          (x) => x.itemId === inv.itemId && !x.equipped
                                        );
                                        return {
                                          ...c,
                                          inventory: existing
                                            ? c.inventory.map((x) =>
                                                x.id === existing.id
                                                  ? { ...x, quantity: x.quantity + 1 }
                                                  : x
                                              )
                                            : [
                                                ...c.inventory,
                                                {
                                                  id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                                                  itemId: inv.itemId,
                                                  quantity: 1,
                                                  equipped: false,
                                                },
                                              ],
                                        };
                                      }
                                      return c;
                                    }),
                                  }));
                                  soundEngine.playSfxPreset('coin');
                                  pushCombatLog({
                                    category: 'system',
                                    actorName: character.name,
                                    actorKind: 'hero',
                                    actorColor: character.playerColor || character.tokenColor,
                                    targetName: other.name,
                                    targetKind: 'hero',
                                    summary: `entregou 1× ${item.name} para`,
                                  });
                                  setTransferInvId(null);
                                }}
                                className="rpg-card px-2 py-0.5 rounded hover:border-amber-400 text-amber-100 cursor-pointer"
                              >
                                {other.name}
                              </button>
                            ))}
                        </div>
                      )}

                      {editingItemId === inv.id && (
                        <div className="pt-2.5 border-t border-white/10 space-y-2 text-[11px]">
                          {role === 'gm' && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <label className="block">
                                  <span className="opacity-70 block mb-0.5">Nome do Item</span>
                                  <input
                                    maxLength={40}
                                    value={item.name}
                                    onChange={(e) =>
                                      updateCampaign((prev) => ({
                                        ...prev,
                                        compendium: {
                                          ...prev.compendium,
                                          items: prev.compendium.items.map((it) =>
                                            it.id === item.id ? { ...it, name: e.target.value } : it
                                          ),
                                        },
                                      }))
                                    }
                                    className="rpg-input w-full py-1"
                                  />
                                </label>
                                <label className="block">
                                  <span className="opacity-70 block mb-0.5">Dano / Efeito</span>
                                  <input
                                    value={item.damageFormula || ''}
                                    onChange={(e) =>
                                      updateCampaign((prev) => ({
                                        ...prev,
                                        compendium: {
                                          ...prev.compendium,
                                          items: prev.compendium.items.map((it) =>
                                            it.id === item.id
                                              ? { ...it, damageFormula: e.target.value }
                                              : it
                                          ),
                                        },
                                      }))
                                    }
                                    placeholder="Ex: 1d8 + @for"
                                    className="rpg-input w-full py-1 font-mono-dice"
                                  />
                                </label>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <label className="block">
                                  <span className="opacity-70 block mb-0.5">Bônus CA</span>
                                  <input
                                    type="number"
                                    value={item.defenseBonus ?? 0}
                                    onChange={(e) =>
                                      updateCampaign((prev) => ({
                                        ...prev,
                                        compendium: {
                                          ...prev.compendium,
                                          items: prev.compendium.items.map((it) =>
                                            it.id === item.id
                                              ? { ...it, defenseBonus: Number(e.target.value) || 0 }
                                              : it
                                          ),
                                        },
                                      }))
                                    }
                                    className="rpg-input w-full py-1 text-center"
                                  />
                                </label>
                                <label className="block">
                                  <span className="opacity-70 block mb-0.5">Peso (kg)</span>
                                  <input
                                    type="number"
                                    step={0.1}
                                    min={0}
                                    value={item.weight}
                                    onChange={(e) =>
                                      updateCampaign((prev) => ({
                                        ...prev,
                                        compendium: {
                                          ...prev.compendium,
                                          items: prev.compendium.items.map((it) =>
                                            it.id === item.id
                                              ? { ...it, weight: Math.max(0, Number(e.target.value) || 0) }
                                              : it
                                          ),
                                        },
                                      }))
                                    }
                                    className="rpg-input w-full py-1 text-center"
                                  />
                                </label>
                                <label className="block">
                                  <span className="opacity-70 block mb-0.5">Valor (PO)</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={item.valueGold}
                                    onChange={(e) =>
                                      updateCampaign((prev) => ({
                                        ...prev,
                                        compendium: {
                                          ...prev.compendium,
                                          items: prev.compendium.items.map((it) =>
                                            it.id === item.id
                                              ? { ...it, valueGold: Math.max(0, Number(e.target.value) || 0) }
                                              : it
                                          ),
                                        },
                                      }))
                                    }
                                    className="rpg-input w-full py-1 text-center"
                                  />
                                </label>
                              </div>
                              <label className="block">
                                <span className="opacity-70 block mb-0.5">Descrição do Item</span>
                                <textarea
                                  rows={2}
                                  value={item.description}
                                  onChange={(e) =>
                                    updateCampaign((prev) => ({
                                      ...prev,
                                      compendium: {
                                        ...prev.compendium,
                                        items: prev.compendium.items.map((it) =>
                                          it.id === item.id ? { ...it, description: e.target.value } : it
                                        ),
                                      },
                                    }))
                                  }
                                  className="rpg-input w-full py-1"
                                />
                              </label>
                              <div className="flex items-center gap-2 pt-0.5">
                                <FileUploadButton
                                  label={item.imageUrl ? 'Trocar Imagem do Item' : 'Subir Imagem do Item'}
                                  accept="image/*"
                                  className="rpg-card px-2 py-1 rounded text-[10px]"
                                  onUploaded={(url) =>
                                    updateCampaign((prev) => ({
                                      ...prev,
                                      compendium: {
                                        ...prev.compendium,
                                        items: prev.compendium.items.map((it) =>
                                          it.id === item.id ? { ...it, imageUrl: url } : it
                                        ),
                                      },
                                    }))
                                  }
                                />
                              </div>
                            </>
                          )}
                          <label className="block">
                            <span className="opacity-70 block mb-0.5">Anotações Pessoais deste Item</span>
                            <input
                              value={inv.customNotes || ''}
                              onChange={(e) =>
                                updateChar((c) => ({
                                  ...c,
                                  inventory: c.inventory.map((x) =>
                                    x.id === inv.id ? { ...x, customNotes: e.target.value } : x
                                  ),
                                }))
                              }
                              placeholder="Ex: Presente do ferreiro, 2 cargas restantes..."
                              className="rpg-input w-full py-1"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'bio' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="rpg-card rounded-xl p-4 space-y-3">
                <h3 className="font-display font-bold text-sm">Foto, Cor, Moldura &amp; Identidade</h3>

                <div className="flex items-center gap-4">
                  <TokenPortrait
                    name={character.name}
                    imageUrl={character.portraitUrl}
                    playerColor={charColor}
                    frameStyle={character.tokenFrameStyle || 'gold'}
                    sizePx={72}
                  />
                  <div className="space-y-2 flex-1">
                    <FileUploadButton
                      accept="image/*"
                      label="Subir Foto do PC"
                      onUploaded={(url) => updateChar((c) => ({ ...c, portraitUrl: url }))}
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {PLAYER_COLOR_PALETTE.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => {
                            if (role === 'player') setMyPlayerColor(col);
                            updateChar((c) => ({ ...c, playerColor: col, tokenColor: col }));
                          }}
                          className={`w-5 h-5 rounded-full border cursor-pointer ${
                            charColor === col ? 'border-white scale-115' : 'border-transparent opacity-75'
                          }`}
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block mb-1">Nome do Personagem</label>
                    <input
                      type="text"
                      maxLength={28}
                      value={character.name}
                      onChange={(e) => {
                        const nextName = e.target.value;
                        updateCampaign((prev) => ({
                          ...prev,
                          characters: prev.characters.map((c) =>
                            c.id === character.id ? { ...c, name: nextName } : c
                          ),
                          maps: prev.maps.map((m) => ({
                            ...m,
                            tokens: m.tokens.map((t) =>
                              t.type === 'character' && t.referenceId === character.id
                                ? { ...t, name: nextName || t.name }
                                : t
                            ),
                          })),
                          combat: {
                            ...prev.combat,
                            combatants: prev.combat.combatants.map((cb) =>
                              cb.type === 'character' && cb.referenceId === character.id
                                ? { ...cb, name: nextName || cb.name }
                                : cb
                            ),
                          },
                        }));
                      }}
                      className="rpg-input w-full"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Nome do Jogador</label>
                    <input
                      type="text"
                      value={character.playerName}
                      onChange={(e) => updateChar((c) => ({ ...c, playerName: e.target.value }))}
                      className="rpg-input w-full"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Raça</label>
                    <select
                      disabled={role !== 'gm'}
                      value={character.raceId}
                      onChange={(e) => updateChar((c) => ({ ...c, raceId: e.target.value }))}
                      className="rpg-input w-full disabled:opacity-65"
                    >
                      {campaign.compendium.races.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1">Classe</label>
                    <select
                      disabled={role !== 'gm'}
                      value={character.classId}
                      onChange={(e) => updateChar((c) => ({ ...c, classId: e.target.value }))}
                      className="rpg-input w-full disabled:opacity-65"
                    >
                      {campaign.compendium.classes.map((cl) => (
                        <option key={cl.id} value={cl.id}>
                          {cl.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1">Moldura do Token</label>
                    <select
                      value={character.tokenFrameStyle || 'gold'}
                      onChange={(e) =>
                        updateChar((c) => ({
                          ...c,
                          tokenFrameStyle: e.target.value as TokenFrameStyle,
                        }))
                      }
                      className="rpg-input w-full"
                    >
                      <option value="gold">Ouro Imperial</option>
                      <option value="runic">Prata Rúnica</option>
                      <option value="crimson">Rubi Carmesim</option>
                      <option value="arcane">Safira Arcana</option>
                      <option value="emerald">Esmeralda Feérica</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1">Skin dos Dados (d4–d20)</label>
                    <select
                      value={character.diceSkin || 'gold'}
                      onChange={(e) =>
                        updateChar((c) => ({ ...c, diceSkin: e.target.value as DiceSkin }))
                      }
                      className="rpg-input w-full"
                    >
                      <option value="gold">Ouro Imperial</option>
                      <option value="fire">Chama Dracônica</option>
                      <option value="ice">Gelo Astral</option>
                      <option value="emerald">Esmeralda</option>
                      <option value="amethyst">Ametista</option>
                      <option value="blood">Sangue Rubro</option>
                    </select>
                  </div>
                </div>

                {/* GM Theme Song Binding */}
                {role === 'gm' && (
                  <div className="p-3 rounded-lg bg-black/25 border border-amber-500/30 space-y-2">
                    <div className="font-bold flex items-center gap-1.5 text-amber-300">
                      <Music className="w-3.5 h-3.5" /> Música Tema do Personagem (Subir MP3/Áudio do PC)
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={character.themeMusicTitle || ''}
                        onChange={(e) =>
                          updateChar((c) => ({ ...c, themeMusicTitle: e.target.value }))
                        }
                        placeholder="Título da Música Tema"
                        className="rpg-input flex-1"
                      />
                      <FileUploadButton
                        accept="audio/*"
                        label="Subir Áudio"
                        onUploaded={(url, fname) =>
                          updateChar((c) => ({
                            ...c,
                            themeMusicUrl: url,
                            themeMusicTitle: c.themeMusicTitle || fname,
                          }))
                        }
                      />
                    </div>
                    {character.themeMusicUrl && (
                      <button
                        type="button"
                        onClick={() => playCharacterTheme(character)}
                        className="rpg-btn-primary px-3 py-1 rounded text-[11px] cursor-pointer"
                      >
                        ▶ Tocar Tema de {character.name} para Todos
                      </button>
                    )}
                  </div>
                )}

                {/* Alternate Forms & Transformations Manager */}
                <div className="p-3 rounded-lg bg-black/30 border border-sky-400/30 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-display font-bold text-xs text-sky-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                        <span>Formas &amp; Transformações ({(character.forms || []).length})</span>
                      </div>
                      <div className="text-[10px] opacity-75">
                        Crie estados alternativos (Modo Desperto, Ferido, Disfarce) para trocar retrato, token e aura em 1 clique!
                      </div>
                    </div>
                  </div>

                  {(character.forms || []).length > 0 && (
                    <div className="space-y-1.5">
                      {(character.forms || []).map((fm) => {
                        const isAct = character.activeFormId === fm.id;
                        return (
                          <div
                            key={fm.id}
                            className={`p-2 rounded-md border flex items-center justify-between gap-2 ${
                              isAct
                                ? 'bg-[#1a2233] border-sky-400/70'
                                : 'bg-black/35 border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <TokenPortrait
                                name={fm.name}
                                imageUrl={fm.portraitUrl || character.portraitUrl}
                                playerColor={fm.tokenColor || charColor}
                                frameStyle={fm.frameStyle || character.tokenFrameStyle || 'gold'}
                                sizePx={36}
                              />
                              <div className="min-w-0">
                                <div className="font-display font-bold text-xs text-[#f4ead7] truncate">
                                  {fm.name} {fm.isDefault ? '(Base)' : ''}
                                </div>
                                <div className="text-[10px] text-[#9b9180] truncate">
                                  {[
                                    fm.bonusAc ? `${fm.bonusAc > 0 ? '+' : ''}${fm.bonusAc} CA` : '',
                                    fm.bonusSpeed ? `${fm.bonusSpeed > 0 ? '+' : ''}${fm.bonusSpeed}m` : '',
                                    fm.catchphrase ? `"${fm.catchphrase}"` : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' • ') || 'Visual / Retrato'}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={isAct}
                                onClick={() => switchCharacterForm(character.id, fm.id)}
                                className={`px-2 py-1 rounded text-[10px] font-display font-bold cursor-pointer transition ${
                                  isAct
                                    ? 'bg-emerald-950/80 border border-emerald-400/55 text-emerald-200 cursor-default'
                                    : 'rpg-btn-primary'
                                }`}
                              >
                                {isAct ? 'Ativa' : 'Ativar'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateChar((c) => ({
                                    ...c,
                                    forms: (c.forms || []).filter((x) => x.id !== fm.id),
                                    activeFormId: c.activeFormId === fm.id ? null : c.activeFormId,
                                  }))
                                }
                                className="p-1 rounded bg-black/45 border border-white/10 text-red-400/80 hover:text-red-200 cursor-pointer"
                                title="Excluir forma"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add New Form Sub-Form */}
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={newFormName}
                        onChange={(e) => setNewFormName(e.target.value)}
                        placeholder="Nome da forma (ex: Modo Desperto)"
                        className="rpg-input py-1 text-xs"
                      />
                      <input
                        type="text"
                        value={newFormCatchphrase}
                        onChange={(e) => setNewFormCatchphrase(e.target.value)}
                        placeholder="Frase ao transformar (opcional)"
                        className="rpg-input py-1 text-xs"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <FileUploadButton
                        accept="image/*"
                        label={newFormPortrait ? 'Trocar Retrato' : 'Subir Retrato da Forma'}
                        className="rpg-card px-2 py-1 rounded text-[11px]"
                        onUploaded={(url) => setNewFormPortrait(url)}
                      />
                      {newFormPortrait && (
                        <img
                          src={resolveAssetUrl(newFormPortrait)}
                          alt="Prévia da forma"
                          className="w-7 h-7 rounded object-cover border border-sky-400/60"
                        />
                      )}
                      <input
                        type="color"
                        value={newFormColor}
                        onChange={(e) => setNewFormColor(e.target.value)}
                        className="w-7 h-7 rounded bg-transparent border border-white/20 cursor-pointer"
                        title="Cor e aura desta forma"
                      />
                      <select
                        value={newFormFrame}
                        onChange={(e) => setNewFormFrame(e.target.value as TokenFrameStyle)}
                        className="rpg-input py-1 text-[11px]"
                      >
                        <option value="gold">Moldura: Ouro</option>
                        <option value="arcane">Moldura: Arcana</option>
                        <option value="crimson">Moldura: Carmesim</option>
                        <option value="emerald">Moldura: Esmeralda</option>
                        <option value="runic">Moldura: Rúnica</option>
                      </select>
                      {role === 'gm' && (
                        <>
                          <input
                            type="number"
                            value={newFormBonusAc}
                            onChange={(e) => setNewFormBonusAc(Number(e.target.value) || 0)}
                            className="rpg-input w-14 py-1 text-center font-mono-dice text-[11px]"
                            title="Bônus de CA nesta forma (Mestre)"
                            placeholder="+CA"
                          />
                          <input
                            type="number"
                            step={1.5}
                            value={newFormBonusSpeed}
                            onChange={(e) => setNewFormBonusSpeed(Number(e.target.value) || 0)}
                            className="rpg-input w-14 py-1 text-center font-mono-dice text-[11px]"
                            title="Bônus de Deslocamento em metros nesta forma (Mestre)"
                            placeholder="+m"
                          />
                        </>
                      )}
                      <button
                        type="button"
                        disabled={!newFormName.trim()}
                        onClick={() => {
                          const existing = character.forms || [];
                          const baseSeed: CharacterForm[] =
                            existing.length === 0
                              ? [
                                  {
                                    id: `form-base-${Date.now()}`,
                                    name: 'Forma Base',
                                    portraitUrl: character.portraitUrl,
                                    tokenColor: charColor,
                                    frameStyle: character.tokenFrameStyle || 'gold',
                                    isDefault: true,
                                    cinematicTransform: false,
                                  },
                                ]
                              : [];
                          const added: CharacterForm = {
                            id: `form-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                            name: newFormName.trim(),
                            portraitUrl: newFormPortrait || character.portraitUrl,
                            tokenColor: newFormColor,
                            auraColor: newFormColor,
                            frameStyle: newFormFrame,
                            catchphrase: newFormCatchphrase.trim() || undefined,
                            bonusAc: role === 'gm' && newFormBonusAc ? newFormBonusAc : undefined,
                            bonusSpeed:
                              role === 'gm' && newFormBonusSpeed ? newFormBonusSpeed : undefined,
                            cinematicTransform: true,
                          };
                          updateChar((c) => ({
                            ...c,
                            forms: [...existing, ...baseSeed, added],
                            activeFormId: c.activeFormId || baseSeed[0]?.id || existing[0]?.id,
                          }));
                          setNewFormName('');
                          setNewFormPortrait('');
                          setNewFormCatchphrase('');
                          setNewFormBonusAc(0);
                          setNewFormBonusSpeed(0);
                        }}
                        className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] font-display font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 ml-auto"
                      >
                        <Plus className="w-3 h-3" /> Adicionar Forma
                      </button>
                    </div>
                  </div>
                </div>

                {/* Character Damage Resistances / Immunities / Vulnerabilities */}
                <div className="p-3 rounded-lg bg-black/25 border border-amber-500/25 space-y-2">
                  <div className="font-display font-bold text-xs text-amber-200">
                    Afinidades de Dano (Resistência ½ • Imunidade 0 • Vulnerabilidade 2x)
                  </div>
                  {(
                    [
                      {
                        key: 'damageResistances' as const,
                        label: 'Resistente (½)',
                        activeCls: 'bg-sky-950/90 border-sky-400/70 text-sky-200',
                      },
                      {
                        key: 'damageImmunities' as const,
                        label: 'Imune (0)',
                        activeCls: 'bg-emerald-950/90 border-emerald-400/70 text-emerald-200',
                      },
                      {
                        key: 'damageVulnerabilities' as const,
                        label: 'Vulnerável (2x)',
                        activeCls: 'bg-red-950/90 border-red-400/70 text-red-200',
                      },
                    ] as const
                  ).map((group) => {
                    const list = character[group.key] || [];
                    return (
                      <div key={group.key} className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wider opacity-75">
                          {group.label}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {campaignDamageTypes.map((dt) => {
                            const active = list.includes(dt);
                            return (
                              <button
                                key={dt}
                                type="button"
                                disabled={role !== 'gm'}
                                onClick={() => {
                                  const nextList = active
                                    ? list.filter((x) => x !== dt)
                                    : [...list, dt];
                                  updateChar((c) => ({ ...c, [group.key]: nextList }));
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer transition disabled:cursor-default ${
                                  active
                                    ? group.activeCls
                                    : 'rpg-card opacity-65 hover:opacity-100'
                                }`}
                              >
                                {dt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <label className="block mb-1">História / Origem</label>
                  <textarea
                    rows={3}
                    value={character.background}
                    onChange={(e) => updateChar((c) => ({ ...c, background: e.target.value }))}
                    className="rpg-input w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1">Anotações Pessoais</label>
                  <textarea
                    rows={2}
                    value={character.notes}
                    onChange={(e) => updateChar((c) => ({ ...c, notes: e.target.value }))}
                    className="rpg-input w-full"
                  />
                </div>
              </div>

              <div className="rpg-card rounded-xl p-4 space-y-3">
                <h3 className="font-display font-bold text-sm">
                  Progressão da Classe ({charClass?.name || 'Personalizada'})
                </h3>
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {charClass?.levelFeatures.map((feat, idx) => {
                    const unlocked = character.level >= feat.level;
                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded border text-xs ${
                          unlocked ? 'border-amber-500/40 bg-amber-500/5' : 'opacity-50'
                        }`}
                        style={!unlocked ? { borderColor: 'var(--border-subtle)' } : undefined}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span>
                            Nível {feat.level}: {feat.featureName}
                          </span>
                          <span>{unlocked ? '✓ Desbloqueado' : 'Bloqueado'}</span>
                        </div>
                        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
                          {feat.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
        </OrnateFrame>
      </div>

      {/* Personal Letter / Scroll Reader Modal (Visible ONLY to the owner reading it!) */}
      {readingLetterItem && (
        <div
          className="fixed inset-0 z-[80] bg-[#040508]/82 backdrop-blur-[3px] flex items-center justify-center p-4"
          onClick={() => setReadingLetterItem(null)}
        >
          <div
            className="max-w-xl w-full animate-modal-unfurl"
            onClick={(e) => e.stopPropagation()}
          >
            <OrnateFrame
              accentColor="#b89146"
              cornerSize={16}
              className="rpg-panel rpg-grain rounded-lg p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <div>
                  <div className="text-[10px] font-display uppercase tracking-[0.16em] text-[#a69b88]">
                    Carta Pessoal — Visível apenas para você
                  </div>
                  <h3 className="font-display font-bold text-lg chronicle-gold-text mt-0.5">
                    {readingLetterItem.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setReadingLetterItem(null)}
                  className="rpg-card w-8 h-8 rounded flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {readingLetterItem.imageUrl && (
                <div className="rounded overflow-hidden border border-[#b89146]/30 bg-black/40">
                  <img
                    src={resolveAssetUrl(readingLetterItem.imageUrl)}
                    alt={readingLetterItem.name}
                    className="w-full max-h-[40vh] object-contain"
                  />
                </div>
              )}
              <div className="rpg-well rounded p-4 max-h-[45vh] overflow-y-auto text-base font-lore leading-relaxed whitespace-pre-wrap text-[#ece4d5]">
                {readingLetterItem.text}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setReadingLetterItem(null)}
                  className="rpg-btn-primary px-4 py-1.5 rounded text-xs cursor-pointer"
                >
                  Guardar Carta
                </button>
              </div>
            </OrnateFrame>
          </div>
        </div>
      )}
    </div>
  );
};
