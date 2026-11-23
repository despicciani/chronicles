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
  Swords,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { triggerHeroJsonDownload, useCampaign } from '../context/CampaignContext';
import {
  ATTACK_RANGE_OPTIONS,
  computeCharacterStats,
  DAMAGE_TYPE_OPTIONS,
  EQUIP_SLOT_LABELS,
  evaluateFormula,
  extractItemDefenseBonus,
  formatFormulaForDisplay,
  formatSigned,
  getCampaignDamageTypes,
  getCharacterCustomResourceState,
  getNextLevelXp,
  parseHeroPayloadFromJson,
  PLAYER_COLOR_PALETTE,
  resolveItemEquipSlot,
} from '../shared/rulesEngine';
import {
  ActionEconomyCost,
  CardRarity,
  Character,
  CharacterCustomAbility,
  CharacterCustomAttack,
  DiceSkin,
  TokenFrameStyle,
} from '../shared/types';
import { DraggablePanel, DragGripBadge } from './DraggablePanel';
import { EquipmentPaperdoll } from './EquipmentPaperdoll';
import { FileUploadButton } from './FileUploadButton';
import { FormulaBuilderInput } from './FormulaBuilderInput';
import { OrnateFrame, SculptedHealthBar } from './OrnateFrame';
import { openAlertDialog, openConfirmDialog, openTextPrompt } from './PromptDialog';
import { TokenPortrait } from './TokenPortrait';

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
    sendRoll,
    grantCardReward,
    playCharacterTheme,
    sendPlayerRequest,
    saveCharacterToVault,
    importSavedHeroIntoCampaign,
    savedHeroes,
    lastSavedHeroFeedback,
    resolveAssetUrl,
    setCharacterConcentration,
  } = useCampaign();

  const heroFileInputRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<'combat' | 'abilities' | 'inventory' | 'bio'>('combat');
  const [addAbilityId, setAddAbilityId] = useState(
    campaign.compendium.abilities[0]?.id || ''
  );
  const [addItemId, setAddItemId] = useState(
    campaign.compendium.items[0]?.id || ''
  );

  // GM Custom Attack / Ability Forging State
  const [forgeMode, setForgeMode] = useState<'attack' | 'ability'>('attack');
  const [forgeName, setForgeName] = useState('');
  const [forgeAttack, setForgeAttack] = useState('1d20 + FOR + PROF');
  const [forgeDamage, setForgeDamage] = useState('1d8 + FOR');
  const [forgeDamageType, setForgeDamageType] = useState('Corte');
  const [forgeRange, setForgeRange] = useState('Corpo a Corpo (1,5m)');
  const [forgeCostMp, setForgeCostMp] = useState(2);
  const [forgeActionType, setForgeActionType] = useState<CharacterCustomAbility['actionType']>('Padrão');
  const [forgeRarity, setForgeRarity] = useState<CardRarity>('raro');
  const [forgeDesc, setForgeDesc] = useState('');
  const [forgeImageUrl, setForgeImageUrl] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingAbilityId, setEditingAbilityId] = useState<string | null>(null);
  const [editingAttackId, setEditingAttackId] = useState<string | null>(null);
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
    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => (c.id === character.id ? updater(c) : c)),
    }));
  };

  const ASI_LEVELS = [4, 8, 12, 16, 19];

  const getAvailableAttributePoints = (c: Character): number => {
    if (typeof c.unspentAttributePoints === 'number') {
      return Math.max(0, c.unspentAttributePoints);
    }
    const budget = campaign.settings.attributePointBudget ?? 15;
    const spent = campaign.compendium.attributes.reduce(
      (sum, a) => sum + Math.max(0, (c.attributes[a.id] ?? 10) - 10),
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
    const gainedAsi = ASI_LEVELS.includes(nextLevel) ? 2 : 0;

    const nextCharDraft: Character = {
      ...character,
      level: nextLevel,
      unspentAttributePoints: getAvailableAttributePoints(character) + gainedAsi,
      knownAbilityIds: Array.from(new Set([...character.knownAbilityIds, ...newAbilities])),
    };
    const nextStats = computeCharacterStats(nextCharDraft, campaign);

    updateChar(() => ({
      ...nextCharDraft,
      hp: nextStats.maxHp,
      mp: nextStats.maxMp,
    }));

    const featureNames = unlockedFeatures.map((f) => f.featureName).join(', ');
    openAlertDialog(
      `${character.name} subiu para o Nível ${nextLevel}!\nPV Máx: ${nextStats.maxHp} | ${campaign.settings.resourceShort} Máx: ${nextStats.maxMp}${
        gainedAsi > 0 ? `\n✨ +${gainedAsi} Pontos de Atributo (ASI D&D 5e) disponíveis para distribuir na Ficha!` : ''
      }${featureNames ? `\nNovos Recursos: ${featureNames}` : ''}`,
      'Level Up!'
    );
  };

  const handleLevelDown = () => {
    if (character.level <= 1) return;
    const lostAsi = ASI_LEVELS.includes(character.level) ? 2 : 0;
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
    const nextHp = Math.min(stats.maxHp, character.hp + healed);
    const nextMp = Math.min(stats.maxMp, character.mp + Math.ceil(stats.maxMp / 3));

    const resetUses: Record<string, number> = { ...character.abilityUsesRemaining };
    character.knownAbilityIds.forEach((aid) => {
      const ab = campaign.compendium.abilities.find((a) => a.id === aid);
      if (ab?.maxUsesPerRest && ab.restType === 'curto') {
        resetUses[aid] = ab.maxUsesPerRest;
      }
    });

    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id !== character.id
          ? c
          : {
              ...c,
              hp: nextHp,
              mp: nextMp,
              abilityUsesRemaining: resetUses,
              resourceTrackers: (c.resourceTrackers || []).map((tr) =>
                tr.resetOn === 'short' ? { ...tr, current: tr.max } : tr
              ),
              customResourceValues: (() => {
                const next = { ...(c.customResourceValues || {}) };
                (prev.compendium.customResources || []).forEach((resDef) => {
                  if (resDef.resetOn === 'short') {
                    const st = getCharacterCustomResourceState(c, resDef);
                    next[resDef.id] = { ...(next[resDef.id] || {}), current: st.max };
                  }
                });
                return next;
              })(),
              deathSaves: { successes: 0, failures: 0 },
            }
      ),
      maps: prev.maps.map((m) => ({
        ...m,
        tokens: m.tokens.map((t) =>
          t.type === 'character' && t.referenceId === character.id
            ? { ...t, hp: Math.min(t.maxHp, nextHp) }
            : t
        ),
      })),
      combat: {
        ...prev.combat,
        combatants: prev.combat.combatants.map((cb) =>
          cb.referenceId === character.id ? { ...cb, hp: Math.min(cb.maxHp, nextHp) } : cb
        ),
      },
    }));

    quickRollFormula('Descanso Curto (Dado de Vida)', healFormula, character.name);
  };

  const handleLongRest = () => {
    if (character.hp <= 0 || character.deathSaves?.dead || (character.deathSaves?.failures || 0) >= 3) {
      return;
    }
    const resetUses: Record<string, number> = {};
    character.knownAbilityIds.forEach((aid) => {
      const ab = campaign.compendium.abilities.find((a) => a.id === aid);
      if (ab?.maxUsesPerRest) {
        resetUses[aid] = ab.maxUsesPerRest;
      }
    });
    if (character.concentratingSpell) {
      setCharacterConcentration(character.id, null);
    }
    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id !== character.id
          ? c
          : {
              ...c,
              hp: stats.maxHp,
              mp: stats.maxMp,
              tempHp: 0,
              abilityUsesRemaining: resetUses,
              resourceTrackers: (c.resourceTrackers || []).map((tr) =>
                tr.resetOn === 'short' || tr.resetOn === 'long' ? { ...tr, current: tr.max } : tr
              ),
              customResourceValues: (() => {
                const next = { ...(c.customResourceValues || {}) };
                (prev.compendium.customResources || []).forEach((resDef) => {
                  if (resDef.resetOn === 'short' || resDef.resetOn === 'long') {
                    const st = getCharacterCustomResourceState(c, resDef);
                    next[resDef.id] = { ...(next[resDef.id] || {}), current: st.max };
                  }
                });
                return next;
              })(),
              activeConditionIds: c.activeConditionIds.filter((id) => id !== 'cond-exausto'),
              deathSaves: { successes: 0, failures: 0 },
            }
      ),
      maps: prev.maps.map((m) => ({
        ...m,
        tokens: m.tokens.map((t) =>
          t.type === 'character' && t.referenceId === character.id
            ? {
                ...t,
                hp: stats.maxHp,
                maxHp: stats.maxHp,
                activeConditionIds: (t.activeConditionIds || []).filter(
                  (id) => id !== 'cond-exausto'
                ),
              }
            : t
        ),
      })),
      combat: {
        ...prev.combat,
        combatants: prev.combat.combatants.map((cb) =>
          cb.referenceId === character.id
            ? { ...cb, hp: stats.maxHp, maxHp: stats.maxHp }
            : cb
        ),
      },
    }));
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

  const handleForgeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgeName.trim()) return;

    if (forgeMode === 'attack') {
      const atk: CharacterCustomAttack = {
        id: `catk-${Date.now()}`,
        name: forgeName.trim(),
        attackBonusFormula: forgeAttack.trim() || '1d20 + @for + @prof',
        damageFormula: forgeDamage.trim() || '1d8 + @for',
        damageType: forgeDamageType.trim() || 'Corte',
        range: forgeRange.trim() || 'Corpo a Corpo',
        rarity: forgeRarity,
        notes: forgeDesc.trim(),
        imageUrl: forgeImageUrl.trim() || undefined,
      };
      updateChar((c) => ({
        ...c,
        customAttacks: [...(c.customAttacks || []), atk],
      }));
      grantCardReward({
        targetCharacterId: character.id,
        characterName: character.name,
        cardTitle: atk.name,
        cardSubtitle: `Ataque: ${atk.attackBonusFormula} | Dano: ${atk.damageFormula} (${atk.damageType})`,
        rarity: atk.rarity,
        description: atk.notes || 'Novo ataque forjado pelo Mestre para sua ficha!',
      });
    } else {
      const abil: CharacterCustomAbility = {
        id: `cabil-${Date.now()}`,
        name: forgeName.trim(),
        actionType: forgeActionType,
        costMp: forgeActionType === 'Passiva' ? 0 : forgeCostMp,
        attackFormula: forgeAttack.trim() || undefined,
        damageFormula: forgeDamage.trim() || undefined,
        damageType: forgeDamageType.trim() || 'Arcano',
        range: forgeRange.trim() || '18m',
        rarity: forgeRarity,
        description: forgeDesc.trim() || 'Poder especial concedido pelo Mestre.',
        imageUrl: forgeImageUrl.trim() || undefined,
      };
      updateChar((c) => ({
        ...c,
        customAbilities: [...(c.customAbilities || []), abil],
      }));
      grantCardReward({
        targetCharacterId: character.id,
        characterName: character.name,
        cardTitle: abil.name,
        cardSubtitle: `${abil.actionType} • ${abil.costMp > 0 ? `${abil.costMp} ${campaign.settings.resourceShort}` : 'Sem Custo'} • ${abil.damageFormula || 'Efeito'}`,
        rarity: abil.rarity,
        description: abil.description,
      });
    }

    setForgeName('');
    setForgeDesc('');
    setForgeImageUrl('');
  };

  const toggleCondition = (condId: string) => {
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
    updateChar((c) => ({
      ...c,
      trainedSkillIds: c.trainedSkillIds.includes(skillId)
        ? c.trainedSkillIds.filter((id) => id !== skillId)
        : [...c.trainedSkillIds, skillId],
    }));
  };

  const equippedWeapons = character.inventory
    .filter((inv) => inv.equipped)
    .map((inv) => ({
      inv,
      item: campaign.compendium.items.find((i) => i.id === inv.itemId),
    }))
    .filter((x) => x.item && x.item.attackFormula);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 md:p-6">
      <DraggablePanel
        storageKey="character-sheet-modal"
        className="w-full max-w-6xl h-[92vh] flex flex-col"
      >
        <OrnateFrame
          accentColor={charColor}
          className="rpg-glass-panel rounded-lg w-full h-full flex flex-col overflow-hidden animate-modal-unfurl"
        >
        {/* Modal Header (Close X permanently pinned top-right!) */}
        <div
          className="px-4 py-3 border-b relative shrink-0 space-y-2.5"
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
            <DragGripBadge label="Mover" />
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
                      disabled={role !== 'gm' && myCharacter?.id !== character.id}
                      onClick={() => {
                        const nextSucc = i + 1 === (ds.successes || 0) ? i : i + 1;
                        setDeathSaveManual(character.id, {
                          successes: nextSucc,
                          stabilized: nextSucc >= 3,
                        });
                      }}
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
                      disabled={role !== 'gm' && myCharacter?.id !== character.id}
                      onClick={() => {
                        const nextFail = i + 1 === (ds.failures || 0) ? i : i + 1;
                        setDeathSaveManual(character.id, {
                          failures: nextFail,
                          dead: nextFail >= 3,
                        });
                      }}
                      className={`w-4 h-4 rounded-full border cursor-pointer disabled:cursor-default ${
                        i < (ds.failures || 0)
                          ? 'bg-red-500 border-red-200 shadow-[0_0_8px_#ef4444]'
                          : 'border-red-500/40 bg-black/40'
                      }`}
                    />
                  ))}
                </div>

                {!isCharDead && !isCharStabilized && (role === 'gm' || myCharacter?.id === character.id) && (
                  <button
                    onClick={handleDeathSaveRoll}
                    className="rpg-btn-crimson px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Dices className="w-4 h-4" />
                    <span>{ds.assistedBy ? 'Rolar com Vantagem (2d20)' : 'Rolar Destino (d20)'}</span>
                  </button>
                )}

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
          </div>

          <span className="h-3.5 w-px bg-white/15 mx-0.5 shrink-0" />

          <span className="text-[11px] font-semibold uppercase tracking-wider mr-1 shrink-0" style={{ color: 'var(--text-muted)' }}>
            Condições:
          </span>
          {campaign.compendium.conditions.map((cond) => {
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
          })}
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
                    <div className="flex items-center justify-between">
                      {role === 'gm' ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={character.hp}
                              onChange={(e) => updateChar((c) => ({ ...c, hp: Number(e.target.value) }))}
                              className="rpg-input w-16 text-center font-bold text-base"
                            />
                            <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                              / {stats.maxHp}
                            </span>
                          </div>
                          <div className="flex gap-1">
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
                            {character.hp} <span className="text-xs font-normal opacity-75">/ {stats.maxHp} PV</span>
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
                    <div className="flex items-center justify-between">
                      {role === 'gm' ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={character.mp}
                              onChange={(e) => updateChar((c) => ({ ...c, mp: Number(e.target.value) }))}
                              className="rpg-input w-16 text-center font-bold text-base"
                            />
                            <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                              / {stats.maxMp}
                            </span>
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
                            {role === 'gm' && (
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
                    <div className="font-display font-extrabold text-xl" style={{ color: 'var(--accent-primary)' }}>
                      {stats.defense}
                    </div>
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
                    <div className="font-display font-extrabold text-xl">{stats.speed}m</div>
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
                                value={character.attributes[attr.id] ?? 10}
                                onChange={(e) =>
                                  updateChar((c) => ({
                                    ...c,
                                    attributes: {
                                      ...c.attributes,
                                      [attr.id]: Number(e.target.value),
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

              {/* Right Column: Skills */}
              <div className="lg:col-span-7 rpg-card rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display font-bold text-sm">
                    Perícias &amp; Testes de Resistência
                  </h3>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {role === 'gm'
                      ? 'Marque quais perícias são treinadas • Clique para rolar'
                      : 'Clique em qualquer perícia para rolar'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {campaign.compendium.skills.map((sk) => {
                    const computed = stats.skills[sk.id];
                    return (
                      <div
                        key={sk.id}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition ${
                          computed.trained ? 'bg-amber-500/8 border-amber-500/35' : 'hover:bg-black/15'
                        }`}
                        style={!computed.trained ? { borderColor: 'var(--border-subtle)' } : undefined}
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
                                computed.trained ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]' : 'bg-white/15'
                              }`}
                              title={computed.trained ? 'Perícia Treinada' : 'Não treinada'}
                            />
                          )}
                          <button
                            onClick={() =>
                              quickRollFormula(
                                sk.isSavingThrow ? `Resistência: ${sk.name}` : `Perícia: ${sk.name}`,
                                `1d20 + ${computed.total}`,
                                character.name
                              )
                            }
                            className="text-left text-xs font-medium truncate cursor-pointer hover:underline"
                          >
                            {sk.name}{' '}
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              ({computed.attrShort})
                            </span>
                          </button>
                        </div>

                        <button
                          onClick={() =>
                            quickRollFormula(
                              sk.isSavingThrow ? `Resistência: ${sk.name}` : `Perícia: ${sk.name}`,
                              `1d20 + ${computed.total}`,
                              character.name
                            )
                          }
                          className="font-mono-dice text-xs font-bold px-2 py-0.5 rounded bg-black/25 cursor-pointer flex items-center gap-1"
                          style={{ color: computed.trained ? 'var(--accent-primary)' : 'var(--text-primary)' }}
                        >
                          <span>{formatSigned(computed.total)}</span>
                          <Dices className="w-3 h-3 opacity-60" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'abilities' && (
            <div className="space-y-5">
              {/* GM-ONLY: FORGE CUSTOM ATTACK / ABILITY FOR THIS PLAYER */}
              {role === 'gm' && (
                <form
                  onSubmit={handleForgeSubmit}
                  className="rpg-glass-panel rounded-xl p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-display font-bold text-sm" style={{ color: 'var(--accent-primary)' }}>
                      <Crown className="w-4 h-4" />
                      <span>Forjar Carta de Ataque ou Habilidade para {character.name} (Exclusivo do Mestre)</span>
                    </div>
                    <div className="flex rounded overflow-hidden border" style={{ borderColor: 'var(--border-subtle)' }}>
                      <button
                        type="button"
                        onClick={() => setForgeMode('attack')}
                        className={`px-3 py-1 cursor-pointer ${forgeMode === 'attack' ? 'rpg-btn-crimson' : 'rpg-card'}`}
                      >
                        Carta de Ataque
                      </button>
                      <button
                        type="button"
                        onClick={() => setForgeMode('ability')}
                        className={`px-3 py-1 cursor-pointer ${forgeMode === 'ability' ? 'rpg-btn-primary' : 'rpg-card'}`}
                      >
                        Carta de Habilidade / Magia
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                    <div className="col-span-2">
                      <label className="block mb-1">Nome da Carta *</label>
                      <input
                        required
                        value={forgeName}
                        onChange={(e) => setForgeName(e.target.value)}
                        placeholder={forgeMode === 'attack' ? 'Ex: Espada Flamejante' : 'Ex: Golpe Trovejante'}
                        className="rpg-input w-full"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Fórmula Acerto</label>
                      <FormulaBuilderInput
                        value={forgeAttack}
                        onChange={setForgeAttack}
                        stats={stats}
                        character={character}
                        placeholder="1d20 + FOR + PROF"
                        showQuickPills={false}
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Dano / Cura (d4/d6/d8...)</label>
                      <FormulaBuilderInput
                        value={forgeDamage}
                        onChange={setForgeDamage}
                        stats={stats}
                        character={character}
                        placeholder="2d6 + FOR"
                        showQuickPills={false}
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Tipo de Dano</label>
                      <select
                        value={forgeDamageType}
                        onChange={(e) => setForgeDamageType(e.target.value)}
                        className="rpg-input w-full"
                      >
                        {campaignDamageTypes.map((dt) => (
                          <option key={dt} value={dt}>
                            {dt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1">Raridade</label>
                      <select
                        value={forgeRarity}
                        onChange={(e) => setForgeRarity(e.target.value as CardRarity)}
                        className="rpg-input w-full"
                      >
                        <option value="comum">Comum (Ferro)</option>
                        <option value="raro">Raro (Safira)</option>
                        <option value="epico">Épico (Ametista)</option>
                        <option value="lendario">Lendário (Ouro)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end">
                    {forgeMode === 'ability' && (
                      <>
                        <div>
                          <label className="block mb-1">Tipo de Ação</label>
                          <select
                            value={forgeActionType}
                            onChange={(e) =>
                              setForgeActionType(
                                e.target.value as CharacterCustomAbility['actionType']
                              )
                            }
                            className="rpg-input w-full"
                          >
                            <option value="Padrão">Padrão</option>
                            <option value="Bônus">Bônus</option>
                            <option value="Reação">Reação</option>
                            <option value="Movimento">Movimento</option>
                            <option value="Livre">Livre</option>
                            <option value="Passiva">Passiva</option>
                          </select>
                        </div>
                        {forgeActionType !== 'Passiva' && (
                          <div>
                            <label className="block mb-1">Custo ({campaign.settings.resourceShort})</label>
                            <input
                              type="number"
                              value={forgeCostMp}
                              onChange={(e) => setForgeCostMp(Number(e.target.value))}
                              className="rpg-input w-full"
                            />
                          </div>
                        )}
                      </>
                    )}
                    <div>
                      <label className="block mb-1">Alcance</label>
                      <select
                        value={forgeRange}
                        onChange={(e) => setForgeRange(e.target.value)}
                        className="rpg-input w-full"
                      >
                        {ATTACK_RANGE_OPTIONS.map((rng) => (
                          <option key={rng} value={rng}>
                            {rng}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div
                      className={
                        forgeMode === 'ability'
                          ? forgeActionType === 'Passiva'
                            ? 'sm:col-span-3'
                            : 'sm:col-span-2'
                          : 'sm:col-span-4'
                      }
                    >
                      <label className="block mb-1">Descrição / Efeito Especial</label>
                      <input
                        value={forgeDesc}
                        onChange={(e) => setForgeDesc(e.target.value)}
                        placeholder="Descreva o efeito..."
                        className="rpg-input w-full"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rpg-btn-primary py-2 px-3 rounded-lg font-bold cursor-pointer"
                    >
                      ✨ Forjar &amp; Entregar
                    </button>
                  </div>

                  {/* Optional Artwork Upload for Attack/Ability Card */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <FileUploadButton
                      label={forgeImageUrl ? 'Trocar Imagem da Carta' : 'Subir Imagem da Carta (Opcional)'}
                      accept="image/*"
                      className="rpg-card px-2.5 py-1 rounded text-[11px]"
                      onUploaded={(url) => setForgeImageUrl(url)}
                    />
                    {forgeImageUrl && (
                      <>
                        <img
                          src={resolveAssetUrl(forgeImageUrl)}
                          alt="Prévia da carta"
                          className="w-8 h-8 rounded object-cover border border-amber-400/50"
                        />
                        <button
                          type="button"
                          onClick={() => setForgeImageUrl('')}
                          className="text-[11px] text-red-400 underline cursor-pointer"
                        >
                          Remover
                        </button>
                      </>
                    )}
                  </div>
                </form>
              )}

              {/* CUSTOM ATTACKS AS COLLECTIBLE MAGIC CARDS (#2) */}
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
                  {(character.customAttacks || []).map((atk) => (
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
                            <div className="text-[10px] uppercase tracking-widest opacity-70">
                              Ataque • {atk.rarity}
                            </div>
                            <h4 className="font-display font-bold text-base leading-tight">
                              {atk.name}
                            </h4>
                          </div>
                          {role === 'gm' && (
                            <div className="flex items-center gap-1">
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
                            </div>
                          )}
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
                          });
                          onClose();
                        }}
                        className="rpg-btn-crimson w-full py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Swords className="w-3.5 h-3.5" />
                        Selecionar Alvo &amp; Atacar
                      </button>
                    </div>
                  ))}

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
                  {(character.customAbilities || []).map((ab) => (
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
                            {ab.costMp > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">
                                {ab.costMp} {campaign.settings.resourceShort}
                              </span>
                            )}
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
                      </div>

                      {ab.actionType !== 'Passiva' && (
                        <button
                          onClick={() => {
                            const cost: ActionEconomyCost =
                              ab.actionType === 'Bônus'
                                ? 'Bônus'
                                : ab.actionType === 'Reação'
                                ? 'Reação'
                                : ab.actionType === 'Livre'
                                ? 'Livre'
                                : 'Padrão';
                            rollCharacterAction({
                              characterId: character.id,
                              title: ab.name,
                              attackFormula: ab.attackFormula,
                              damageFormula: ab.damageFormula,
                              damageType: ab.damageType,
                              range: ab.range,
                              actionCost: cost,
                              costMp: ab.costMp,
                            });
                            if (ab.attackFormula || (ab.damageFormula && ab.damageType?.toLowerCase() !== 'cura')) {
                              onClose();
                            }
                          }}
                          className="rpg-btn-primary w-full py-2 rounded-lg text-xs cursor-pointer"
                        >
                          Usar Habilidade {ab.costMp > 0 ? `(-${ab.costMp} ${campaign.settings.resourceShort})` : ''}
                        </button>
                      )}
                    </div>
                  ))}

                  {character.knownAbilityIds.map((aid) => {
                    const ab = campaign.compendium.abilities.find((a) => a.id === aid);
                    if (!ab) return null;
                    return (
                      <div
                        key={aid}
                        className="rpg-card rpg-magic-card rarity-raro rounded-xl p-3.5 flex flex-col justify-between gap-2.5"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[10px] uppercase tracking-widest opacity-70">
                                {ab.category} • {ab.actionType}
                              </div>
                              <h4 className="font-display font-bold text-base">{ab.name}</h4>
                            </div>
                            <div className="flex items-center gap-1">
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
                              const cost: ActionEconomyCost =
                                ab.actionType === 'Bônus'
                                  ? 'Bônus'
                                  : ab.actionType === 'Reação'
                                  ? 'Reação'
                                  : ab.actionType === 'Livre'
                                  ? 'Livre'
                                  : 'Padrão';
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
                              });
                              if (ab.aoeShape || ab.attackFormula || ab.damageFormula) {
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

                        {item.type === 'Consumível' ? (
                          <button
                            onClick={() => {
                              if (item.damageFormula) {
                                rollCharacterAction({
                                  characterId: character.id,
                                  title: `Usou ${item.name}`,
                                  damageFormula: item.damageFormula,
                                  damageType: item.damageType || 'Cura',
                                });
                              } else {
                                quickRollFormula(`Usou ${item.name}`, '2d4', character.name);
                              }
                              updateChar((c) => ({
                                ...c,
                                inventory:
                                  inv.quantity > 1
                                    ? c.inventory.map((x) =>
                                        x.id === inv.id ? { ...x, quantity: x.quantity - 1 } : x
                                      )
                                    : c.inventory.filter((x) => x.id !== inv.id),
                              }));
                            }}
                            className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] cursor-pointer"
                          >
                            Consumir
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleEquipInventoryEntry(inv.id)}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                              inv.equipped ? 'rpg-btn-primary' : 'rpg-card border'
                            }`}
                          >
                            {inv.equipped ? '✓ Vestido' : 'Equipar'}
                          </button>
                        )}
                      </div>
                      </div>

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
                          {DAMAGE_TYPE_OPTIONS.map((dt) => {
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
      </DraggablePanel>
    </div>
  );
};
