import React, { useRef, useState } from 'react';
import {
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
  computeCharacterStats,
  DAMAGE_TYPE_OPTIONS,
  EQUIP_SLOT_LABELS,
  evaluateFormula,
  extractItemDefenseBonus,
  formatFormulaForDisplay,
  formatSigned,
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
    assistDeathSave,
    gmResolveDeathSave,
    quickRollFormula,
    rollCharacterAction,
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
  const [forgeRarity, setForgeRarity] = useState<CardRarity>('raro');
  const [forgeDesc, setForgeDesc] = useState('');

  const handleCreateCharacter = () => {
    const name = window.prompt('Nome do novo Personagem:', 'Novo Aventureiro');
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

  const handleLevelUp = () => {
    const nextLevel = Math.min(20, character.level + 1);
    const unlockedFeatures =
      charClass?.levelFeatures.filter((f) => f.level === nextLevel) || [];
    const newAbilities = unlockedFeatures.flatMap((f) => f.abilityIds || []);

    const nextCharDraft: Character = {
      ...character,
      level: nextLevel,
      knownAbilityIds: Array.from(new Set([...character.knownAbilityIds, ...newAbilities])),
    };
    const nextStats = computeCharacterStats(nextCharDraft, campaign);

    updateChar(() => ({
      ...nextCharDraft,
      hp: nextStats.maxHp,
      mp: nextStats.maxMp,
    }));

    const featureNames = unlockedFeatures.map((f) => f.featureName).join(', ');
    window.alert(
      `${character.name} subiu para o Nível ${nextLevel}!\nPV Máx: ${nextStats.maxHp} | ${campaign.settings.resourceShort} Máx: ${nextStats.maxMp}${
        featureNames ? `\nNovos Recursos: ${featureNames}` : ''
      }`
    );
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

    updateChar((c) => ({
      ...c,
      hp: nextHp,
      mp: nextMp,
      abilityUsesRemaining: resetUses,
      deathSaves: { successes: 0, failures: 0 },
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
    updateChar((c) => ({
      ...c,
      hp: stats.maxHp,
      mp: stats.maxMp,
      tempHp: 0,
      abilityUsesRemaining: resetUses,
      activeConditionIds: c.activeConditionIds.filter((id) => id !== 'cond-exausto'),
      deathSaves: { successes: 0, failures: 0 },
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
        actionType: 'Padrão',
        costMp: forgeCostMp,
        attackFormula: forgeAttack.trim() || undefined,
        damageFormula: forgeDamage.trim() || undefined,
        damageType: forgeDamageType.trim() || 'Arcano',
        range: forgeRange.trim() || '18m',
        rarity: forgeRarity,
        description: forgeDesc.trim() || 'Poder especial concedido pelo Mestre.',
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
  };

  const toggleCondition = (condId: string) => {
    updateChar((c) => ({
      ...c,
      activeConditionIds: c.activeConditionIds.includes(condId)
        ? c.activeConditionIds.filter((id) => id !== condId)
        : [...c.activeConditionIds, condId],
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
                      onClick={() => {
                        if (
                          window.confirm(
                            `Excluir permanentemente o personagem "${character.name}" da campanha?`
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
                          window.alert('Arquivo de herói inválido.');
                          return;
                        }
                        importSavedHeroIntoCampaign(imported);
                      } catch {
                        window.alert('Erro ao ler arquivo JSON do personagem.');
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
                  onClick={handleLevelUp}
                  className="rpg-card px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer text-amber-400 hover:opacity-85"
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  Level Up
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
                      onClick={() =>
                        updateChar((c) => {
                          const nextSucc = i + 1 === (c.deathSaves?.successes || 0) ? i : i + 1;
                          return {
                            ...c,
                            deathSaves: {
                              ...c.deathSaves,
                              successes: nextSucc,
                              stabilized: nextSucc >= 3,
                            },
                          };
                        })
                      }
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
                      onClick={() =>
                        updateChar((c) => {
                          const nextFail = i + 1 === (c.deathSaves?.failures || 0) ? i : i + 1;
                          return {
                            ...c,
                            deathSaves: {
                              ...c.deathSaves,
                              failures: nextFail,
                              dead: nextFail >= 3,
                            },
                          };
                        })
                      }
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
          <button
            onClick={() => {
              if (character.concentratingSpell) {
                setCharacterConcentration(character.id, null);
              } else {
                const spell = window.prompt('Qual magia/efeito está mantendo em Concentração?', 'Bênção');
                if (spell && spell.trim()) {
                  setCharacterConcentration(character.id, spell.trim());
                }
              }
            }}
            title="Concentração D&D 5e: ao sofrer dano, exige teste de CON (CD = máx(10, metade do dano)). Clique para ativar ou encerrar."
            className={`px-2 py-0.5 rounded-md text-[11px] font-display font-bold flex items-center gap-1 shrink-0 border transition cursor-pointer ${
              character.concentratingSpell
                ? 'border-sky-400/80 bg-sky-950/60 text-sky-200'
                : 'border-white/15 bg-black/25 text-slate-300 hover:border-sky-400/50'
            }`}
          >
            <Sparkles className="w-3 h-3 text-sky-400" />
            <span>
              {character.concentratingSpell
                ? `Conc: ${character.concentratingSpell} ×`
                : '+ Concentração'}
            </span>
          </button>

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
                  <h3 className="font-display font-bold text-sm mb-2.5 flex items-center justify-between">
                    <span>Atributos (Clique para testar)</span>
                    <span className="text-xs font-mono-dice" style={{ color: 'var(--accent-primary)' }}>
                      Prof: +{stats.proficiencyBonus}
                    </span>
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
                            <div
                              className="relative z-10 text-[10px] font-display font-bold px-2 py-0.5 rounded-xs bg-black/55 border border-amber-500/30 inline-block mt-0.5"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              Valor {comp.value}
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
                      <label className="block mb-1">Tipo</label>
                      <input
                        value={forgeDamageType}
                        onChange={(e) => setForgeDamageType(e.target.value)}
                        placeholder="Fogo, Corte, Cura"
                        className="rpg-input w-full"
                      />
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
                    <div>
                      <label className="block mb-1">Alcance</label>
                      <input
                        value={forgeRange}
                        onChange={(e) => setForgeRange(e.target.value)}
                        className="rpg-input w-full"
                      />
                    </div>
                    <div className={forgeMode === 'ability' ? 'sm:col-span-3' : 'sm:col-span-4'}>
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
                                applyConditionId: ab.applyConditionId,
                                conditionDurationRounds: ab.conditionDurationRounds,
                              });
                              if ((ab.attackFormula || (ab.damageFormula && ab.damageType?.toLowerCase() !== 'cura')) && !ab.applyConditionId) {
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
                    <div key={inv.id} className="rpg-card rounded-xl p-3 flex items-start justify-between gap-3">
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
                        <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                          Peso: {item.weight}kg • Valor: {item.valueGold} PO
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex items-center gap-1">
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
                      value={character.name}
                      onChange={(e) => updateChar((c) => ({ ...c, name: e.target.value }))}
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
