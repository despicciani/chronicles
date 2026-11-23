import React, { useState } from 'react';
import {
  BookOpen,
  Copy,
  Flame,
  Package,
  Plus,
  Settings,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  ATTACK_RANGE_OPTIONS,
  DAMAGE_TYPE_OPTIONS,
  DEFAULT_XP_THRESHOLDS,
  findNearestFreeGridCell,
  getCampaignDamageTypes,
  getXpThresholds,
} from '../shared/rulesEngine';
import {
  DND5E_CLASSIC_CLASSES,
  DND5E_CLASSIC_ITEMS,
  DND5E_CLASSIC_MONSTERS,
  DND5E_CLASSIC_RACES,
  DND5E_CLASSIC_SPELLS,
} from '../shared/dnd5ePack';
import { FileUploadButton } from './FileUploadButton';
import { openEntitySheet } from './EntitySheetModal';
import { openAlertDialog, openTextPrompt } from './PromptDialog';
import { ABILITY_SFX_OPTIONS, resolveAbilitySfxPreset, soundEngine } from '../utils/soundEngine';
import { TokenPortrait } from './TokenPortrait';
import {
  AbilityDef,
  AttributeDef,
  CardRarity,
  ClassDef,
  ConditionDef,
  ItemDef,
  MonsterDef,
  RaceDef,
  SavedEncounter,
  SkillDef,
  StatModifier,
} from '../shared/types';

type CompendiumSection =
  | 'rules'
  | 'races'
  | 'classes'
  | 'abilities'
  | 'items'
  | 'conditions'
  | 'monsters'
  | 'encounters';

interface CompendiumModalProps {
  onClose: () => void;
  mode?: 'rules' | 'bestiary';
}

export const CompendiumModal: React.FC<CompendiumModalProps> = ({
  onClose,
  mode = 'rules',
}) => {
  const {
    campaign,
    role,
    updateCampaign,
    quickRollFormula,
    resolveAssetUrl,
    startCombatFromMap,
  } = useCampaign();
  const campaignDamageTypes = getCampaignDamageTypes(campaign);
  const [section, setSection] = useState<CompendiumSection>(
    mode === 'bestiary' && role === 'gm' ? 'monsters' : 'abilities'
  );
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canEdit = role === 'gm';

  const allSections: Array<{
    id: CompendiumSection;
    label: string;
    icon: React.ReactNode;
    gmOnly?: boolean;
  }> = [
    { id: 'rules', label: 'Regras & Atributos', icon: <Settings className="w-4 h-4" /> },
    { id: 'races', label: 'Raças', icon: <Users className="w-4 h-4" /> },
    { id: 'classes', label: 'Classes', icon: <Swords className="w-4 h-4" /> },
    { id: 'abilities', label: 'Poderes & Magias', icon: <Flame className="w-4 h-4" /> },
    { id: 'items', label: 'Itens & Armas', icon: <Package className="w-4 h-4" /> },
    { id: 'conditions', label: 'Condições', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'monsters', label: 'Bestiário & Chefes', icon: <Skull className="w-4 h-4" />, gmOnly: true },
    { id: 'encounters', label: 'Encontros Salvos', icon: <Swords className="w-4 h-4" />, gmOnly: true },
  ];
  const sections =
    mode === 'bestiary'
      ? allSections.filter((s) => (s.id === 'monsters' || s.id === 'encounters') && role === 'gm')
      : allSections.filter((s) => s.id !== 'monsters' && s.id !== 'encounters');
  const activeSection: CompendiumSection =
    mode === 'bestiary'
      ? role === 'gm'
        ? section === 'encounters'
          ? 'encounters'
          : 'monsters'
        : 'abilities'
      : section === 'monsters' || section === 'encounters'
        ? 'abilities'
        : section;

  // Helpers to update compendium arrays cleanly
  const updateCompendium = <K extends keyof typeof campaign.compendium>(
    key: K,
    nextVal: (typeof campaign.compendium)[K]
  ) => {
    updateCampaign((prev) => ({
      ...prev,
      compendium: {
        ...prev.compendium,
        [key]: nextVal,
      },
    }));
  };

  // Creation handlers
  const handleCreateNew = () => {
    const uid = Date.now();
    if (section === 'races') {
      const item: RaceDef = {
        id: `raca-${uid}`,
        name: 'Nova Raça Customizada',
        description: 'Descreva a origem e cultura desta raça.',
        speed: 9,
        size: 'Médio',
        vision: 'Visão Normal',
        attributeBonuses: { for: 1, car: 1 },
        customTraits: ['Traço Racial Especial'],
        abilityIds: [],
      };
      updateCompendium('races', [...campaign.compendium.races, item]);
      setSelectedId(item.id);
    } else if (section === 'classes') {
      const item: ClassDef = {
        id: `classe-${uid}`,
        name: 'Nova Classe Customizada',
        description: 'Arquétipo e papel no grupo.',
        hitDie: 8,
        hpPerLevel: 5,
        mpPerLevel: 4,
        keyAttributeId: campaign.compendium.attributes[0]?.id || 'for',
        proficiencies: ['Armas Simples', 'Armaduras Leves'],
        numTrainedSkills: 4,
        color: '#f59e0b',
        levelFeatures: [
          { level: 1, featureName: 'Habilidade Inicial', description: 'Recurso de nível 1.' },
        ],
      };
      updateCompendium('classes', [...campaign.compendium.classes, item]);
      setSelectedId(item.id);
    } else if (section === 'abilities') {
      const item: AbilityDef = {
        id: `hab-${uid}`,
        name: 'Nova Habilidade / Magia',
        category: 'Magia',
        actionType: 'Padrão',
        costMp: 2,
        range: '18m',
        duration: 'Instantâneo',
        description: 'Descreva os efeitos da habilidade.',
        attackFormula: '1d20 + @int + @prof',
        damageFormula: '2d8',
        damageType: 'Arcano',
      };
      updateCompendium('abilities', [...campaign.compendium.abilities, item]);
      setSelectedId(item.id);
    } else if (section === 'items') {
      const item: ItemDef = {
        id: `item-${uid}`,
        name: 'Novo Item Customizado',
        type: 'Arma',
        weight: 1,
        valueGold: 50,
        description: 'Descrição do equipamento.',
        attackFormula: '1d20 + @for + @prof',
        damageFormula: '1d8 + @for',
        damageType: 'Corte',
      };
      updateCompendium('items', [...campaign.compendium.items, item]);
      setSelectedId(item.id);
    } else if (section === 'conditions') {
      const item: ConditionDef = {
        id: `cond-${uid}`,
        name: 'Nova Condição',
        color: '#38bdf8',
        icon: '⚡',
        description: 'Efeito temporário aplicado à ficha.',
        modifiers: [{ target: 'attack', value: 2, label: 'Nova Condição' }],
      };
      updateCompendium('conditions', [...campaign.compendium.conditions, item]);
      setSelectedId(item.id);
    } else if (section === 'monsters') {
      const item: MonsterDef = {
        id: `mon-${uid}`,
        name: 'Nova Criatura',
        type: 'Monstro',
        size: 'Médio',
        cr: '1',
        maxHp: 30,
        defense: 14,
        speed: 9,
        initiativeBonus: 2,
        attributes: { for: 14, des: 14, con: 14, int: 10, sab: 10, car: 10 },
        saves: { fort: 2, ref: 2, von: 1 },
        attacks: [
          { name: 'Garra', attackBonus: 5, damageFormula: '1d8+3', damageType: 'Corte' },
        ],
        abilities: ['Sentidos Aguçados'],
        description: 'Criatura customizada do bestiário.',
        tokenColor: '#dc2626',
      };
      updateCompendium('monsters', [...campaign.compendium.monsters, item]);
      setSelectedId(item.id);
    } else if (section === 'encounters') {
      const firstMonId = campaign.compendium.monsters[0]?.id;
      const enc: SavedEncounter = {
        id: `enc-${uid}`,
        name: 'Novo Encontro / Emboscada',
        description: 'Grupo de criaturas pronto para invocar com 1 clique.',
        entries: firstMonId ? [{ monsterId: firstMonId, count: 3 }] : [],
      };
      updateCampaign((prev) => ({
        ...prev,
        savedEncounters: [...(prev.savedEncounters || []), enc],
      }));
      setSelectedId(enc.id);
    }
  };

  const getMonsterGridSize = (mon: MonsterDef): number => {
    if (typeof mon.gridSize === 'number' && mon.gridSize >= 1) {
      return Math.max(1, Math.min(8, Math.round(mon.gridSize)));
    }
    if (mon.size === 'Colossal') return 4;
    if (mon.size === 'Enorme') return 3;
    if (mon.size === 'Grande') return 2;
    return 1;
  };

  const spawnEncounterOnMap = (enc: SavedEncounter, alsoRollInitiative: boolean) => {
    const activeMap = campaign.maps.find((m) => m.id === campaign.activeMapId);
    if (!activeMap) return;
    let totalSpawned = 0;
    updateCampaign((prev) => ({
      ...prev,
      maps: prev.maps.map((m) => {
        if (m.id !== activeMap.id) return m;
        const nextTokens = [...m.tokens];
        enc.entries.forEach((entry) => {
          const mon = prev.compendium.monsters.find((x) => x.id === entry.monsterId);
          if (!mon) return;
          const size = getMonsterGridSize(mon);
          for (let i = 0; i < Math.max(1, entry.count); i++) {
            const count = nextTokens.filter((t) => t.referenceId === mon.id).length;
            const tempMap = { ...m, tokens: nextTokens };
            const pos = findNearestFreeGridCell(
              tempMap,
              Math.floor(m.gridWidth / 2) + ((totalSpawned % 5) - 2),
              Math.floor(m.gridHeight / 2) + (Math.floor(totalSpawned / 5) - 1),
              size
            );
            nextTokens.push({
              id: `tok-${Date.now()}-${totalSpawned}-${Math.random().toString(36).slice(2, 5)}`,
              name: mon.isBoss ? mon.name : `${mon.name} #${count + 1}`,
              type: 'monster',
              referenceId: mon.id,
              x: pos.x,
              y: pos.y,
              size,
              hp: mon.maxHp,
              maxHp: mon.maxHp,
              defense: mon.defense,
              activeConditionIds: [],
              isHidden: false,
              color: mon.tokenColor,
              frameStyle: mon.isBoss ? 'crimson' : undefined,
              imageUrl: mon.imageUrl,
              hideAcFromPlayers: mon.hideAcFromPlayers,
              isBoss: mon.isBoss,
              bossTitle: mon.bossTitle,
              bossPhase: mon.isBoss ? 1 : undefined,
              bossPhase2HpPct: mon.bossPhase2HpPct ?? 50,
              bossPhase2Title: mon.bossPhase2Title,
              legendaryActionsMax: mon.isBoss ? (mon.legendaryActionsMax ?? 3) : undefined,
              legendaryActionsRemaining: mon.isBoss ? (mon.legendaryActionsMax ?? 3) : undefined,
              legendaryResistancesMax: mon.isBoss ? (mon.legendaryResistancesMax ?? 3) : undefined,
              legendaryResistancesRemaining: mon.isBoss ? (mon.legendaryResistancesMax ?? 3) : undefined,
            });
            totalSpawned++;
          }
        });
        return { ...m, tokens: nextTokens };
      }),
    }));
    if (alsoRollInitiative) {
      setTimeout(() => {
        startCombatFromMap();
      }, 120);
    }
    openAlertDialog(
      `${totalSpawned} criatura(s) do encontro "${enc.name}" invocadas em "${activeMap.name}"!${
        alsoRollInitiative ? '\nIniciativa rolada automaticamente!' : ''
      }`,
      'Encontro Invocado'
    );
  };

  const spawnMonsterOnMap = (mon: MonsterDef) => {
    const activeMap = campaign.maps.find((m) => m.id === campaign.activeMapId);
    if (!activeMap) return;
    const count = activeMap.tokens.filter((t) => t.referenceId === mon.id).length;
    const size = getMonsterGridSize(mon);
    updateCampaign((prev) => ({
      ...prev,
      maps: prev.maps.map((m) => {
        if (m.id !== activeMap.id) return m;
        const pos = findNearestFreeGridCell(
          m,
          Math.floor(m.gridWidth / 2),
          Math.floor(m.gridHeight / 2),
          size
        );
        return {
          ...m,
          tokens: [
            ...m.tokens,
            {
              id: `tok-${Date.now()}`,
              name: mon.isBoss ? mon.name : `${mon.name} #${count + 1}`,
              type: 'monster',
              referenceId: mon.id,
              x: pos.x,
              y: pos.y,
              size,
              hp: mon.maxHp,
              maxHp: mon.maxHp,
              defense: mon.defense,
              activeConditionIds: [],
              isHidden: false,
              color: mon.tokenColor,
              frameStyle: mon.isBoss ? 'crimson' : undefined,
              imageUrl: mon.imageUrl,
              hideAcFromPlayers: mon.hideAcFromPlayers,
              isBoss: mon.isBoss,
              bossTitle: mon.bossTitle,
              bossPhase: mon.isBoss ? 1 : undefined,
              bossPhase2HpPct: mon.bossPhase2HpPct ?? 50,
              bossPhase2Title: mon.bossPhase2Title,
              legendaryActionsMax: mon.isBoss ? (mon.legendaryActionsMax ?? 3) : undefined,
              legendaryActionsRemaining: mon.isBoss ? (mon.legendaryActionsMax ?? 3) : undefined,
              legendaryResistancesMax: mon.isBoss ? (mon.legendaryResistancesMax ?? 3) : undefined,
              legendaryResistancesRemaining: mon.isBoss ? (mon.legendaryResistancesMax ?? 3) : undefined,
            },
          ],
        };
      }),
    }));
    openAlertDialog(`${mon.name} invocado no mapa "${activeMap.name}"!`, 'Criatura Invocada');
  };

  const importDnd5ePack = () => {
    const existingRaceIds = new Set(campaign.compendium.races.map((r) => r.id));
    const existingClassIds = new Set(campaign.compendium.classes.map((c) => c.id));
    const existingAbilityIds = new Set(campaign.compendium.abilities.map((a) => a.id));
    const existingItemIds = new Set(campaign.compendium.items.map((i) => i.id));
    const existingMonIds = new Set(campaign.compendium.monsters.map((m) => m.id));

    const newRaces = DND5E_CLASSIC_RACES.filter((r) => !existingRaceIds.has(r.id));
    const newClasses = DND5E_CLASSIC_CLASSES.filter((c) => !existingClassIds.has(c.id));
    const newSpells = DND5E_CLASSIC_SPELLS.filter((a) => !existingAbilityIds.has(a.id));
    const newItems = DND5E_CLASSIC_ITEMS.filter((i) => !existingItemIds.has(i.id));
    const newMons = DND5E_CLASSIC_MONSTERS.filter((m) => !existingMonIds.has(m.id));

    if (
      newRaces.length === 0 &&
      newClasses.length === 0 &&
      newSpells.length === 0 &&
      newItems.length === 0 &&
      newMons.length === 0
    ) {
      openAlertDialog(
        'Todas as raças, classes, magias, itens e monstros clássicos de D&D 5e já estão nesta campanha!',
        'Pacote D&D 5e'
      );
      return;
    }
    updateCampaign((prev) => ({
      ...prev,
      compendium: {
        ...prev.compendium,
        races: [...prev.compendium.races, ...newRaces],
        classes: [...prev.compendium.classes, ...newClasses],
        abilities: [...prev.compendium.abilities, ...newSpells],
        items: [...prev.compendium.items, ...newItems],
        monsters: [...prev.compendium.monsters, ...newMons],
      },
    }));
    const parts: string[] = [];
    if (newRaces.length > 0) parts.push(`+${newRaces.length} raças`);
    if (newClasses.length > 0) parts.push(`+${newClasses.length} classes`);
    if (newSpells.length > 0) parts.push(`+${newSpells.length} magias`);
    if (newItems.length > 0) parts.push(`+${newItems.length} itens`);
    if (newMons.length > 0) parts.push(`+${newMons.length} monstros/chefes`);
    openAlertDialog(
      `Pacote D&D 5e importado: ${parts.join(', ')}!`,
      'Pacote D&D 5e Carregado'
    );
  };

  const renderModifierEditor = (
    modifiers: StatModifier[],
    onChange: (next: StatModifier[]) => void
  ) => (
    <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Modificadores Automáticos na Ficha</span>
        {canEdit && (
          <button
            onClick={() =>
              onChange([...modifiers, { target: 'defense', value: 1, label: 'Bônus' }])
            }
            className="rpg-card px-2 py-0.5 rounded text-[11px] cursor-pointer"
          >
            + Modificador
          </button>
        )}
      </div>
      {modifiers.map((mod, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-1.5 items-center text-xs">
          <select
            disabled={!canEdit}
            value={mod.target}
            onChange={(e) =>
              onChange(
                modifiers.map((m, i) =>
                  i === idx ? { ...m, target: e.target.value as StatModifier['target'] } : m
                )
              )
            }
            className="rpg-input col-span-4 py-1 text-xs"
          >
            <option value="defense">Defesa (CA)</option>
            <option value="attack">Ataques</option>
            <option value="damage">Dano</option>
            <option value="save">Resistências</option>
            <option value="skill">Perícia</option>
            <option value="attribute">Atributo</option>
            <option value="speed">Deslocamento</option>
            <option value="maxHp">PV Máximo</option>
            <option value="maxMp">PM Máximo</option>
            <option value="initiative">Iniciativa</option>
          </select>

          {(mod.target === 'attribute' || mod.target === 'skill') && (
            <select
              disabled={!canEdit}
              value={mod.targetId || ''}
              onChange={(e) =>
                onChange(
                  modifiers.map((m, i) => (i === idx ? { ...m, targetId: e.target.value } : m))
                )
              }
              className="rpg-input col-span-3 py-1 text-xs"
            >
              <option value="">Todas</option>
              {mod.target === 'attribute'
                ? campaign.compendium.attributes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))
                : campaign.compendium.skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
            </select>
          )}

          <input
            disabled={!canEdit}
            type="number"
            value={mod.value}
            onChange={(e) =>
              onChange(
                modifiers.map((m, i) => (i === idx ? { ...m, value: Number(e.target.value) } : m))
              )
            }
            placeholder="Valor"
            className="rpg-input col-span-2 py-1 text-xs"
          />
          <input
            disabled={!canEdit}
            type="text"
            value={mod.diceBonus || ''}
            onChange={(e) =>
              onChange(
                modifiers.map((m, i) => (i === idx ? { ...m, diceBonus: e.target.value } : m))
              )
            }
            placeholder="Dado (1d4)"
            className="rpg-input col-span-2 py-1 text-xs"
          />
          {canEdit && (
            <button
              onClick={() => onChange(modifiers.filter((_, i) => i !== idx))}
              className="text-red-400 col-span-1 flex justify-center cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );

  // Build list of entries for current section
  const q = search.trim().toLowerCase();

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 md:p-6">
      <div className="rpg-panel rpg-ornate-border rounded-xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            <div>
              <h2 className="font-display font-bold text-base leading-none">
                Estúdio de Compêndio &amp; Regras Customizáveis
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {canEdit
                  ? 'Crie ou edite raças, classes, magias, itens, monstros, atributos e perícias livremente.'
                  : 'Modo de Consulta (Mude para perfil Mestre para editar o compêndio).'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={importDnd5ePack}
                className="rpg-btn-primary px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer"
                title="Adicionar raças, classes, magias, itens mágicos e monstros/chefes clássicos de D&D 5e sem apagar seus dados"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Carregar Pacote D&D 5e</span>
              </button>
            )}
            <button onClick={onClose} className="rpg-card p-1.5 rounded cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div
          className="px-4 py-2 border-b flex items-center gap-1.5 overflow-x-auto shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => {
                setSection(sec.id);
                setSelectedId(null);
                setSearch('');
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition ${
                activeSection === sec.id ? 'rpg-btn-primary' : 'rpg-card hover:opacity-85'
              }`}
            >
              {sec.icon}
              <span>{sec.label}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        {section === 'rules' ? (
          /* CAMPAIGN RULES, ATTRIBUTES & SKILLS EDITOR */
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
            {/* Global System Settings + Custom Attributes */}
            <div className="space-y-4">
              <div className="rpg-card rounded-lg p-4 space-y-3">
                <h3 className="font-display font-bold text-sm">Configurações Gerais do Sistema d20</h3>
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="col-span-2">
                    <label className="block mb-1">Nome da Campanha</label>
                    <input
                      disabled={!canEdit}
                      type="text"
                      value={campaign.name}
                      onChange={(e) =>
                        updateCampaign((p) => ({ ...p, name: e.target.value }))
                      }
                      className="rpg-input w-full"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Nome do Recurso (Mana/Foco)</label>
                    <input
                      disabled={!canEdit}
                      type="text"
                      value={campaign.settings.resourceName}
                      onChange={(e) =>
                        updateCampaign((p) => ({
                          ...p,
                          settings: { ...p.settings, resourceName: e.target.value },
                        }))
                      }
                      className="rpg-input w-full"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Sigla do Recurso</label>
                    <input
                      disabled={!canEdit}
                      type="text"
                      value={campaign.settings.resourceShort}
                      onChange={(e) =>
                        updateCampaign((p) => ({
                          ...p,
                          settings: { ...p.settings, resourceShort: e.target.value },
                        }))
                      }
                      className="rpg-input w-full"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Defesa / CA Base</label>
                    <input
                      disabled={!canEdit}
                      type="number"
                      value={campaign.settings.baseDefense}
                      onChange={(e) =>
                        updateCampaign((p) => ({
                          ...p,
                          settings: { ...p.settings, baseDefense: Number(e.target.value) },
                        }))
                      }
                      className="rpg-input w-full"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Metros por Quadrado</label>
                    <input
                      disabled={!canEdit}
                      type="number"
                      step="0.5"
                      value={campaign.settings.gridSquareMeters}
                      onChange={(e) =>
                        updateCampaign((p) => ({
                          ...p,
                          settings: { ...p.settings, gridSquareMeters: Number(e.target.value) },
                        }))
                      }
                      className="rpg-input w-full"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      disabled={!canEdit}
                      type="checkbox"
                      checked={campaign.settings.useProficiencyBonus}
                      onChange={(e) =>
                        updateCampaign((p) => ({
                          ...p,
                          settings: { ...p.settings, useProficiencyBonus: e.target.checked },
                        }))
                      }
                      className="accent-amber-500"
                    />
                    <span>Usar Bônus de Proficiência estilo D&amp;D 5e (+2 a +6)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      disabled={!canEdit}
                      type="checkbox"
                      checked={campaign.settings.useHalfLevelBonus}
                      onChange={(e) =>
                        updateCampaign((p) => ({
                          ...p,
                          settings: { ...p.settings, useHalfLevelBonus: e.target.checked },
                        }))
                      }
                      className="accent-amber-500"
                    />
                    <span>Somar Metade do Nível estilo Tormenta20 (+Nível/2)</span>
                  </label>
                </div>
              </div>

              {/* Attributes List */}
              <div className="rpg-card rounded-lg p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-sm">Atributos do Sistema</h3>
                  {canEdit && (
                    <button
                      onClick={async () => {
                        const code = await openTextPrompt('Código curto para fórmulas (ex: san):', 'san');
                        if (!code) return;
                        const clean = code.toLowerCase().replace(/[^a-z]/g, '');
                        if (!clean) return;
                        const attrName = await openTextPrompt('Nome do Atributo:', 'Sanidade');
                        const newAttr: AttributeDef = {
                          id: clean,
                          code: clean,
                          name: attrName || 'Novo Atributo',
                          shortName: clean.toUpperCase().slice(0, 3),
                          description: 'Atributo customizado.',
                        };
                        updateCompendium('attributes', [...campaign.compendium.attributes, newAttr]);
                      }}
                      className="rpg-btn-primary px-2.5 py-1 rounded text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Atributo
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {campaign.compendium.attributes.map((attr) => (
                    <div
                      key={attr.id}
                      className="flex items-center gap-2 p-2 rounded border text-xs"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <span className="font-mono-dice font-bold px-1.5 py-0.5 rounded bg-black/25">
                        @{attr.code}
                      </span>
                      <input
                        disabled={!canEdit}
                        type="text"
                        value={attr.name}
                        onChange={(e) =>
                          updateCompendium(
                            'attributes',
                            campaign.compendium.attributes.map((a) =>
                              a.id === attr.id ? { ...a, name: e.target.value } : a
                            )
                          )
                        }
                        className="rpg-input flex-1 py-1"
                      />
                      <input
                        disabled={!canEdit}
                        type="text"
                        value={attr.shortName}
                        onChange={(e) =>
                          updateCompendium(
                            'attributes',
                            campaign.compendium.attributes.map((a) =>
                              a.id === attr.id ? { ...a, shortName: e.target.value } : a
                            )
                          )
                        }
                        className="rpg-input w-14 text-center py-1"
                      />
                      {canEdit && campaign.compendium.attributes.length > 1 && (
                        <button
                          onClick={() =>
                            updateCompendium(
                              'attributes',
                              campaign.compendium.attributes.filter((a) => a.id !== attr.id)
                            )
                          }
                          className="text-red-400 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Damage Types Manager */}
              <div className="rpg-card rounded-lg p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-sm">
                    Tipos de Dano da Campanha ({campaignDamageTypes.length})
                  </h3>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={async () => {
                        const dt = await openTextPrompt('Nome do novo Tipo de Dano:', 'Sombrio');
                        if (!dt || !dt.trim()) return;
                        const clean = dt.trim();
                        if (campaignDamageTypes.some((x) => x.toLowerCase() === clean.toLowerCase())) {
                          return;
                        }
                        updateCompendium('customDamageTypes', [
                          ...(campaign.compendium.customDamageTypes || []),
                          clean,
                        ]);
                      }}
                      className="rpg-btn-primary px-2.5 py-1 rounded text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tipo de Dano
                    </button>
                  )}
                </div>
                <p className="text-[11px] opacity-75">
                  Todos os golpes, habilidades, itens e armadilhas usam exclusivamente os tipos desta lista.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {campaignDamageTypes.map((dt) => {
                    const isCustom = (campaign.compendium.customDamageTypes || []).includes(dt);
                    return (
                      <span
                        key={dt}
                        className={`px-2 py-0.5 rounded text-[11px] border flex items-center gap-1 ${
                          isCustom
                            ? 'bg-amber-950/70 border-amber-400/50 text-amber-200'
                            : 'bg-black/30 border-white/15'
                        }`}
                      >
                        <span>{dt}</span>
                        {canEdit && isCustom && (
                          <button
                            type="button"
                            onClick={() =>
                              updateCompendium(
                                'customDamageTypes',
                                (campaign.compendium.customDamageTypes || []).filter((x) => x !== dt)
                              )
                            }
                            className="text-red-400 hover:text-red-300 cursor-pointer"
                            title="Remover tipo customizado"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Skills Editor */}
            <div className="rpg-card rounded-lg p-4 space-y-2.5 flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm">
                  Perícias &amp; Resistências ({campaign.compendium.skills.length})
                </h3>
                {canEdit && (
                  <button
                    onClick={async () => {
                      const name = await openTextPrompt('Nome da nova Perícia:', 'Conhecimento Arcano');
                      if (!name) return;
                      const newSkill: SkillDef = {
                        id: `sk-${Date.now()}`,
                        name,
                        defaultAttributeId: campaign.compendium.attributes[0]?.id || 'int',
                        isSavingThrow: false,
                      };
                      updateCompendium('skills', [...campaign.compendium.skills, newSkill]);
                    }}
                    className="rpg-btn-primary px-2.5 py-1 rounded text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Perícia
                  </button>
                )}
              </div>

              <div className="space-y-1.5 overflow-y-auto pr-1 flex-1">
                {campaign.compendium.skills.map((sk) => (
                  <div
                    key={sk.id}
                    className="flex items-center gap-2 p-1.5 rounded border text-xs"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <input
                      disabled={!canEdit}
                      type="text"
                      value={sk.name}
                      onChange={(e) =>
                        updateCompendium(
                          'skills',
                          campaign.compendium.skills.map((s) =>
                            s.id === sk.id ? { ...s, name: e.target.value } : s
                          )
                        )
                      }
                      className="rpg-input flex-1 py-1"
                    />
                    <select
                      disabled={!canEdit}
                      value={sk.defaultAttributeId}
                      onChange={(e) =>
                        updateCompendium(
                          'skills',
                          campaign.compendium.skills.map((s) =>
                            s.id === sk.id ? { ...s, defaultAttributeId: e.target.value } : s
                          )
                        )
                      }
                      className="rpg-input w-20 py-1"
                    >
                      {campaign.compendium.attributes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.shortName}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 cursor-pointer shrink-0">
                      <input
                        disabled={!canEdit}
                        type="checkbox"
                        checked={Boolean(sk.isSavingThrow)}
                        onChange={(e) =>
                          updateCompendium(
                            'skills',
                            campaign.compendium.skills.map((s) =>
                              s.id === sk.id ? { ...s, isSavingThrow: e.target.checked } : s
                            )
                          )
                        }
                        className="accent-amber-500"
                      />
                      <span className="text-[10px]">RES</span>
                    </label>
                    {canEdit && (
                      <button
                        onClick={() =>
                          updateCompendium(
                            'skills',
                            campaign.compendium.skills.filter((s) => s.id !== sk.id)
                          )
                        }
                        className="text-red-400 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Resource Bars (Vida, Mana, Estamina, Ki, Sanidade, Sangue, etc.) */}
            <div className="rpg-card rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold text-sm text-amber-300">
                    Barras de Recurso Customizadas (Ex: Estamina, Ki, Sanidade, Fúria)
                  </h3>
                  <p className="text-[11px] opacity-75">
                    Crie ou exclua barras de recurso extras além de Vida (PV) e {campaign.settings.resourceName} ({campaign.settings.resourceShort}). Elas aparecem na Ficha dos heróis e podem ser gastas ao conjurar habilidades!
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextRes = {
                        id: `res-${Date.now()}`,
                        name: 'Estamina',
                        shortName: 'EST',
                        color: '#22c55e',
                        baseMax: 20,
                        perLevel: 5,
                        resetOn: 'short' as const,
                      };
                      updateCompendium('customResources', [
                        ...(campaign.compendium.customResources || []),
                        nextRes,
                      ]);
                    }}
                    className="rpg-btn-primary px-2.5 py-1 rounded text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Novo Recurso
                  </button>
                )}
              </div>

              {(campaign.compendium.customResources || []).length === 0 ? (
                <div className="text-[11px] opacity-65 italic">
                  Nenhum recurso extra criado ainda (Vida e {campaign.settings.resourceName} já estão ativos por padrão).
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  {(campaign.compendium.customResources || []).map((res) => {
                    const patchRes = (partial: Partial<typeof res>) =>
                      updateCompendium(
                        'customResources',
                        (campaign.compendium.customResources || []).map((r) =>
                          r.id === res.id ? { ...r, ...partial } : r
                        )
                      );
                    return (
                      <div
                        key={res.id}
                        className="rpg-socket rounded-lg p-2.5 grid grid-cols-2 sm:grid-cols-12 gap-2 items-center"
                      >
                        <input
                          disabled={!canEdit}
                          type="color"
                          value={res.color}
                          onChange={(e) => patchRes({ color: e.target.value })}
                          className="w-7 h-7 rounded bg-transparent border border-white/20 cursor-pointer sm:col-span-1"
                          title="Cor da barra"
                        />
                        <input
                          disabled={!canEdit}
                          value={res.name}
                          onChange={(e) => patchRes({ name: e.target.value })}
                          placeholder="Nome (ex: Estamina)"
                          className="rpg-input py-1 sm:col-span-3 font-semibold"
                        />
                        <input
                          disabled={!canEdit}
                          maxLength={6}
                          value={res.shortName}
                          onChange={(e) => patchRes({ shortName: e.target.value.toUpperCase() })}
                          placeholder="Sigla"
                          className="rpg-input py-1 sm:col-span-1 text-center font-mono-dice"
                        />
                        <div className="sm:col-span-2 flex items-center gap-1">
                          <span className="text-[10px] opacity-70">Base:</span>
                          <input
                            disabled={!canEdit}
                            type="number"
                            min={1}
                            value={res.baseMax}
                            onChange={(e) => patchRes({ baseMax: Math.max(1, Number(e.target.value) || 1) })}
                            className="rpg-input w-full py-1 text-center font-mono-dice"
                          />
                        </div>
                        <div className="sm:col-span-2 flex items-center gap-1">
                          <span className="text-[10px] opacity-70">+Nv:</span>
                          <input
                            disabled={!canEdit}
                            type="number"
                            min={0}
                            value={res.perLevel}
                            onChange={(e) => patchRes({ perLevel: Math.max(0, Number(e.target.value) || 0) })}
                            className="rpg-input w-full py-1 text-center font-mono-dice"
                          />
                        </div>
                        <select
                          disabled={!canEdit}
                          value={res.resetOn}
                          onChange={(e) =>
                            patchRes({ resetOn: e.target.value as 'short' | 'long' | 'manual' })
                          }
                          className="rpg-input py-1 sm:col-span-2 text-[11px]"
                        >
                          <option value="short">Desc. Curto</option>
                          <option value="long">Desc. Longo</option>
                          <option value="manual">Manual</option>
                        </select>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() =>
                              updateCompendium(
                                'customResources',
                                (campaign.compendium.customResources || []).filter((r) => r.id !== res.id)
                              )
                            }
                            className="text-red-400 hover:bg-red-950/60 p-1 rounded cursor-pointer justify-self-end sm:col-span-1"
                            title="Excluir recurso"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Editable XP Curve per Level (Nv 2 to Nv 20) */}
            <div className="rpg-card rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold text-sm text-amber-300">
                    Progressão de XP por Nível (Level Up Automático)
                  </h3>
                  <p className="text-[11px] opacity-75">
                    Defina o XP acumulado necessário para atingir cada nível. Quando um herói ultrapassar o limite, ele sobe de nível automaticamente.
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      updateCampaign((prev) => ({
                        ...prev,
                        settings: { ...prev.settings, xpThresholds: [...DEFAULT_XP_THRESHOLDS] },
                      }))
                    }
                    className="rpg-card px-2.5 py-1 rounded text-[11px] cursor-pointer hover:border-amber-400/60"
                  >
                    Restaurar D&amp;D 5e
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 text-xs">
                {getXpThresholds(campaign.settings.xpThresholds)
                  .slice(1)
                  .map((reqXp, idx) => {
                    const lv = idx + 2;
                    return (
                      <div key={lv} className="rpg-socket rounded p-2 flex items-center justify-between gap-1.5">
                        <span className="font-display font-bold text-[11px] text-amber-200 shrink-0">
                          Nv {lv}
                        </span>
                        <input
                          disabled={!canEdit}
                          type="number"
                          min={0}
                          value={reqXp}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            const current = [...getXpThresholds(campaign.settings.xpThresholds)];
                            current[lv - 1] = val;
                            updateCampaign((prev) => ({
                              ...prev,
                              settings: { ...prev.settings, xpThresholds: current },
                            }));
                          }}
                          className="rpg-input w-20 py-0.5 px-1.5 text-right font-mono-dice text-[11px]"
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        ) : (
          /* MASTER-DETAIL STUDIO FOR RACES, CLASSES, ABILITIES, ITEMS, CONDITIONS, MONSTERS */
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
            {/* Left List */}
            <div
              className="md:col-span-4 border-r p-3 flex flex-col gap-2 min-h-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar no compêndio..."
                  className="rpg-input flex-1 text-xs"
                />
                {canEdit && (
                  <button
                    onClick={handleCreateNew}
                    className="rpg-btn-primary px-2.5 py-1.5 rounded text-xs flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Criar
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {section === 'races' &&
                  campaign.compendium.races
                    .filter((r) => r.name.toLowerCase().includes(q))
                    .map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className={`w-full text-left p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                          selectedId === r.id ? 'rpg-ornate-border bg-amber-500/10' : 'rpg-card'
                        }`}
                      >
                        <div className="font-bold">{r.name}</div>
                        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          Desloc. {r.speed}m • {r.size}
                        </div>
                      </button>
                    ))}

                {section === 'classes' &&
                  campaign.compendium.classes
                    .filter((c) => c.name.toLowerCase().includes(q))
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
                        className={`w-full text-left p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                          selectedId === c.id ? 'rpg-ornate-border bg-amber-500/10' : 'rpg-card'
                        }`}
                      >
                        <div className="font-bold flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                          <span>{c.name}</span>
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          DV d{c.hitDie} • +{c.hpPerLevel} PV / +{c.mpPerLevel} {campaign.settings.resourceShort}
                        </div>
                      </button>
                    ))}

                {section === 'abilities' &&
                  campaign.compendium.abilities
                    .filter((a) => a.name.toLowerCase().includes(q))
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedId(a.id)}
                        className={`w-full text-left p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                          selectedId === a.id ? 'rpg-ornate-border bg-amber-500/10' : 'rpg-card'
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>{a.name}</span>
                          {a.costMp > 0 && (
                            <span className="text-[10px] text-sky-400">
                              {a.costMp} {campaign.settings.resourceShort}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {a.category} • {a.actionType}
                        </div>
                      </button>
                    ))}

                {section === 'items' &&
                  campaign.compendium.items
                    .filter((i) => i.name.toLowerCase().includes(q))
                    .map((i) => (
                      <button
                        key={i.id}
                        onClick={() => setSelectedId(i.id)}
                        className={`w-full text-left p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                          selectedId === i.id ? 'rpg-ornate-border bg-amber-500/10' : 'rpg-card'
                        }`}
                      >
                        <div className="font-bold">{i.name}</div>
                        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {i.type} • {i.valueGold} PO
                        </div>
                      </button>
                    ))}

                {section === 'conditions' &&
                  campaign.compendium.conditions
                    .filter((c) => c.name.toLowerCase().includes(q))
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
                        className={`w-full text-left p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                          selectedId === c.id ? 'rpg-ornate-border bg-amber-500/10' : 'rpg-card'
                        }`}
                      >
                        <div className="font-bold flex items-center gap-1.5">
                          <span>{c.icon}</span>
                          <span>{c.name}</span>
                        </div>
                        <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                          {c.description}
                        </div>
                      </button>
                    ))}

                {activeSection === 'monsters' &&
                  role === 'gm' &&
                  campaign.compendium.monsters
                    .filter((m) => m.name.toLowerCase().includes(q))
                    .map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedId(m.id)}
                        className={`w-full text-left p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                          selectedId === m.id ? 'rpg-ornate-border bg-amber-500/10' : 'rpg-card'
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>{m.name}</span>
                          <span className="text-[10px]" style={{ color: 'var(--accent-primary)' }}>
                            ND {m.cr}
                          </span>
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          PV {m.maxHp} • CA {m.defense} • {m.type}
                        </div>
                      </button>
                    ))}

                {activeSection === 'encounters' &&
                  role === 'gm' &&
                  (campaign.savedEncounters || [])
                    .filter((e) => e.name.toLowerCase().includes(q))
                    .map((enc) => {
                      const total = enc.entries.reduce((s, x) => s + x.count, 0);
                      return (
                        <button
                          key={enc.id}
                          onClick={() => setSelectedId(enc.id)}
                          className={`w-full text-left p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                            selectedId === enc.id ? 'rpg-ornate-border bg-amber-500/10' : 'rpg-card'
                          }`}
                        >
                          <div className="font-bold flex items-center justify-between">
                            <span className="truncate">{enc.name}</span>
                            <span className="text-[10px] text-amber-300 shrink-0">
                              {total}x
                            </span>
                          </div>
                          <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                            {enc.description || `${enc.entries.length} tipo(s) de criatura`}
                          </div>
                        </button>
                      );
                    })}
              </div>
            </div>

            {/* Right Detail Editor */}
            <div className="md:col-span-8 p-4 overflow-y-auto min-h-0">
              {/* RACE EDITOR */}
              {section === 'races' &&
                (() => {
                  const item =
                    campaign.compendium.races.find((r) => r.id === selectedId) ||
                    campaign.compendium.races[0];
                  if (!item) return null;
                  const patch = (next: Partial<RaceDef>) =>
                    updateCompendium(
                      'races',
                      campaign.compendium.races.map((r) => (r.id === item.id ? { ...r, ...next } : r))
                    );
                  return (
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display font-bold text-lg">{item.name}</h3>
                        {canEdit && (
                          <button
                            onClick={() => {
                              updateCompendium(
                                'races',
                                campaign.compendium.races.filter((r) => r.id !== item.id)
                              );
                              setSelectedId(null);
                            }}
                            className="text-red-400 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Excluir
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="col-span-2">
                          <label className="block mb-1">Nome da Raça</label>
                          <input
                            disabled={!canEdit}
                            value={item.name}
                            onChange={(e) => patch({ name: e.target.value })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Deslocamento (m)</label>
                          <input
                            disabled={!canEdit}
                            type="number"
                            step="0.5"
                            value={item.speed}
                            onChange={(e) => patch({ speed: Number(e.target.value) })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Tamanho</label>
                          <select
                            disabled={!canEdit}
                            value={item.size}
                            onChange={(e) => patch({ size: e.target.value as RaceDef['size'] })}
                            className="rpg-input w-full"
                          >
                            <option value="Pequeno">Pequeno</option>
                            <option value="Médio">Médio</option>
                            <option value="Grande">Grande</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block mb-1">Visão</label>
                        <input
                          disabled={!canEdit}
                          value={item.vision}
                          onChange={(e) => patch({ vision: e.target.value })}
                          className="rpg-input w-full"
                        />
                      </div>
                      <div>
                        <label className="block mb-1">Descrição</label>
                        <textarea
                          disabled={!canEdit}
                          rows={2}
                          value={item.description}
                          onChange={(e) => patch({ description: e.target.value })}
                          className="rpg-input w-full"
                        />
                      </div>
                      <div>
                        <label className="block mb-1.5 font-semibold">Bônus Raciais de Atributo</label>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {campaign.compendium.attributes.map((attr) => (
                            <div key={attr.id} className="rpg-card p-2 rounded text-center">
                              <div className="text-[10px] font-bold">{attr.shortName}</div>
                              <input
                                disabled={!canEdit}
                                type="number"
                                value={item.attributeBonuses[attr.id] ?? 0}
                                onChange={(e) =>
                                  patch({
                                    attributeBonuses: {
                                      ...item.attributeBonuses,
                                      [attr.id]: Number(e.target.value),
                                    },
                                  })
                                }
                                className="rpg-input w-full text-center mt-1 py-0.5"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block mb-1 font-semibold">Traços Raciais (um por linha)</label>
                        <textarea
                          disabled={!canEdit}
                          rows={3}
                          value={item.customTraits.join('\n')}
                          onChange={(e) => patch({ customTraits: e.target.value.split('\n') })}
                          className="rpg-input w-full"
                        />
                      </div>
                    </div>
                  );
                })()}

              {/* CLASS EDITOR */}
              {section === 'classes' &&
                (() => {
                  const item =
                    campaign.compendium.classes.find((c) => c.id === selectedId) ||
                    campaign.compendium.classes[0];
                  if (!item) return null;
                  const patch = (next: Partial<ClassDef>) =>
                    updateCompendium(
                      'classes',
                      campaign.compendium.classes.map((c) => (c.id === item.id ? { ...c, ...next } : c))
                    );
                  return (
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display font-bold text-lg">{item.name}</h3>
                        {canEdit && (
                          <button
                            onClick={() => {
                              updateCompendium(
                                'classes',
                                campaign.compendium.classes.filter((c) => c.id !== item.id)
                              );
                              setSelectedId(null);
                            }}
                            className="text-red-400 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Excluir
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div className="col-span-2">
                          <label className="block mb-1">Nome da Classe</label>
                          <input
                            disabled={!canEdit}
                            value={item.name}
                            onChange={(e) => patch({ name: e.target.value })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Dado de Vida</label>
                          <select
                            disabled={!canEdit}
                            value={item.hitDie}
                            onChange={(e) => patch({ hitDie: Number(e.target.value) })}
                            className="rpg-input w-full"
                          >
                            {[4, 6, 8, 10, 12].map((d) => (
                              <option key={d} value={d}>
                                d{d}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block mb-1">PV / Nível</label>
                          <input
                            disabled={!canEdit}
                            type="number"
                            value={item.hpPerLevel}
                            onChange={(e) => patch({ hpPerLevel: Number(e.target.value) })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">PM / Nível</label>
                          <input
                            disabled={!canEdit}
                            type="number"
                            value={item.mpPerLevel}
                            onChange={(e) => patch({ mpPerLevel: Number(e.target.value) })}
                            className="rpg-input w-full"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block mb-1">Atributo Chave</label>
                          <select
                            disabled={!canEdit}
                            value={item.keyAttributeId}
                            onChange={(e) => patch({ keyAttributeId: e.target.value })}
                            className="rpg-input w-full"
                          >
                            {campaign.compendium.attributes.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block mb-1">Cor da Classe</label>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <input
                              disabled={!canEdit}
                              type="color"
                              value={item.color || '#f59e0b'}
                              onChange={(e) => patch({ color: e.target.value })}
                              className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/20 p-0.5"
                              title="Escolher cor personalizada da classe"
                            />
                            {['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#38bdf8', '#6366f1', '#a855f7', '#ec4899'].map(
                              (col) => (
                                <button
                                  key={col}
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={() => patch({ color: col })}
                                  className={`w-5 h-5 rounded-full border cursor-pointer transition ${
                                    item.color === col
                                      ? 'border-white scale-115 ring-1 ring-amber-300'
                                      : 'border-black/60 opacity-80 hover:opacity-100'
                                  }`}
                                  style={{ backgroundColor: col }}
                                  title={col}
                                />
                              )
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block mb-1">Silhueta do Corpo (Paperdoll)</label>
                          <select
                            disabled={!canEdit}
                            value={item.paperdollArchetype || ''}
                            onChange={(e) =>
                              patch({
                                paperdollArchetype: (e.target.value || undefined) as
                                  | ClassDef['paperdollArchetype']
                                  | undefined,
                              })
                            }
                            className="rpg-input w-full"
                          >
                            <option value="">Automático pelo nome da classe</option>
                            <option value="warrior">Guerreiro (Armadura Pesada)</option>
                            <option value="arcane">Arcano (Manto &amp; Runas)</option>
                            <option value="rogue">Ladino (Couro &amp; Sombras)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block mb-1">Descrição</label>
                          <input
                            disabled={!canEdit}
                            value={item.description}
                            onChange={(e) => patch({ description: e.target.value })}
                            className="rpg-input w-full"
                          />
                        </div>
                      </div>

                      {/* Level 1-20 Features Table */}
                      <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Tabela de Progressão (Níveis 1–20)</span>
                          {canEdit && (
                            <button
                              onClick={() =>
                                patch({
                                  levelFeatures: [
                                    ...item.levelFeatures,
                                    {
                                      level: Math.min(20, (item.levelFeatures.at(-1)?.level || 0) + 1),
                                      featureName: 'Novo Poder de Classe',
                                      description: 'Descreva o ganho deste nível.',
                                    },
                                  ],
                                })
                              }
                              className="rpg-card px-2 py-1 rounded text-[11px] cursor-pointer"
                            >
                              + Nível / Recurso
                            </button>
                          )}
                        </div>
                        {item.levelFeatures.map((feat, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-1.5 items-start">
                            <input
                              disabled={!canEdit}
                              type="number"
                              min={1}
                              max={20}
                              value={feat.level}
                              onChange={(e) =>
                                patch({
                                  levelFeatures: item.levelFeatures.map((f, i) =>
                                    i === idx ? { ...f, level: Number(e.target.value) } : f
                                  ),
                                })
                              }
                              className="rpg-input col-span-2 py-1 text-center"
                            />
                            <input
                              disabled={!canEdit}
                              value={feat.featureName}
                              onChange={(e) =>
                                patch({
                                  levelFeatures: item.levelFeatures.map((f, i) =>
                                    i === idx ? { ...f, featureName: e.target.value } : f
                                  ),
                                })
                              }
                              className="rpg-input col-span-4 py-1"
                            />
                            <input
                              disabled={!canEdit}
                              value={feat.description}
                              onChange={(e) =>
                                patch({
                                  levelFeatures: item.levelFeatures.map((f, i) =>
                                    i === idx ? { ...f, description: e.target.value } : f
                                  ),
                                })
                              }
                              className="rpg-input col-span-5 py-1"
                            />
                            {canEdit && (
                              <button
                                onClick={() =>
                                  patch({
                                    levelFeatures: item.levelFeatures.filter((_, i) => i !== idx),
                                  })
                                }
                                className="col-span-1 text-red-400 p-1.5 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

              {/* ABILITY / SPELL EDITOR */}
              {section === 'abilities' &&
                (() => {
                  const item =
                    campaign.compendium.abilities.find((a) => a.id === selectedId) ||
                    campaign.compendium.abilities[0];
                  if (!item) return null;
                  const patch = (next: Partial<AbilityDef>) => {
                    const updatedAbility: AbilityDef = { ...item, ...next };
                    const hasNoDamage = !updatedAbility.damageType;
                    const cleanDamageFormula = hasNoDamage
                      ? ''
                      : (updatedAbility.damageFormula || '')
                          .replace(/@\w+/g, '0')
                          .replace(/\+\s*0\b/g, '')
                          .trim();
                    const syncAttack = (atk: import('../shared/types').MonsterAttack) => {
                      if (atk.sourceAbilityId !== item.id) return atk;
                      return {
                        ...atk,
                        name: updatedAbility.name,
                        attackBonus: hasNoDamage || updatedAbility.damageType?.toLowerCase() === 'cura' ? 0 : atk.attackBonus,
                        damageFormula: cleanDamageFormula,
                        damageType: updatedAbility.damageType || '',
                        range: updatedAbility.range || atk.range,
                        applyConditionId: updatedAbility.applyConditionId,
                        conditionDurationRounds: updatedAbility.conditionDurationRounds,
                      };
                    };
                    updateCampaign((prev) => ({
                      ...prev,
                      compendium: {
                        ...prev.compendium,
                        abilities: prev.compendium.abilities.map((a) =>
                          a.id === item.id ? updatedAbility : a
                        ),
                        monsters: prev.compendium.monsters.map((m) => ({
                          ...m,
                          attacks: m.attacks.map(syncAttack),
                        })),
                      },
                      npcs: prev.npcs.map((n) => ({
                        ...n,
                        attacks: (n.attacks || []).map(syncAttack),
                      })),
                    }));
                  };
                  return (
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {item.imageUrl && (
                            <img
                              src={resolveAssetUrl(item.imageUrl)}
                              alt={item.name}
                              className="w-10 h-10 rounded-md object-cover border border-amber-400/50 shrink-0"
                            />
                          )}
                          <h3 className="font-display font-bold text-lg truncate">{item.name}</h3>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-2 shrink-0">
                            <FileUploadButton
                              label={item.imageUrl ? 'Trocar Imagem' : '+ Imagem'}
                              accept="image/*"
                              className="rpg-card px-2 py-1 rounded text-[11px]"
                              onUploaded={(url) => patch({ imageUrl: url })}
                            />
                            <button
                              onClick={() => {
                                const dup: AbilityDef = {
                                  ...item,
                                  id: `hab-${Date.now()}`,
                                  name: `${item.name} (Cópia)`,
                                };
                                updateCompendium('abilities', [...campaign.compendium.abilities, dup]);
                                setSelectedId(dup.id);
                              }}
                              className="rpg-card px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
                            >
                              <Copy className="w-3 h-3" /> Duplicar
                            </button>
                            <button
                              onClick={() => {
                                updateCompendium(
                                  'abilities',
                                  campaign.compendium.abilities.filter((a) => a.id !== item.id)
                                );
                                setSelectedId(null);
                              }}
                              className="text-red-400 flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Excluir
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="col-span-2">
                          <label className="block mb-1">Nome</label>
                          <input
                            disabled={!canEdit}
                            value={item.name}
                            onChange={(e) => patch({ name: e.target.value })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Categoria</label>
                          <select
                            disabled={!canEdit}
                            value={item.category}
                            onChange={(e) =>
                              patch({ category: e.target.value as AbilityDef['category'] })
                            }
                            className="rpg-input w-full"
                          >
                            <option value="Habilidade de Classe">Habilidade de Classe</option>
                            <option value="Magia">Magia</option>
                            <option value="Poder Racial">Poder Racial</option>
                            <option value="Talento">Talento</option>
                            <option value="Ataque Especial">Ataque Especial</option>
                          </select>
                        </div>
                        <div>
                          <label className="block mb-1">Ação</label>
                          <select
                            disabled={!canEdit}
                            value={item.actionType}
                            onChange={(e) =>
                              patch({ actionType: e.target.value as AbilityDef['actionType'] })
                            }
                            className="rpg-input w-full"
                          >
                            <option value="Padrão">Padrão</option>
                            <option value="Movimento">Movimento</option>
                            <option value="Bônus">Bônus</option>
                            <option value="Reação">Reação</option>
                            <option value="Livre">Livre</option>
                            <option value="Passiva">Passiva</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block mb-1">Custo</label>
                          <input
                            disabled={!canEdit}
                            type="number"
                            min={0}
                            value={item.costMp}
                            onChange={(e) => patch({ costMp: Math.max(0, Number(e.target.value) || 0) })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Recurso Gasto</label>
                          <select
                            disabled={!canEdit}
                            value={item.costResourceId || 'mp'}
                            onChange={(e) => patch({ costResourceId: e.target.value })}
                            className="rpg-input w-full"
                          >
                            <option value="mp">
                              {campaign.settings.resourceName} ({campaign.settings.resourceShort})
                            </option>
                            <option value="hp">Vida (PV)</option>
                            {(campaign.compendium.customResources || []).map((res) => (
                              <option key={res.id} value={res.id}>
                                {res.name} ({res.shortName})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block mb-1">Alcance</label>
                          <select
                            disabled={!canEdit}
                            value={item.range}
                            onChange={(e) => patch({ range: e.target.value })}
                            className="rpg-input w-full"
                          >
                            {!(ATTACK_RANGE_OPTIONS as readonly string[]).includes(item.range) && item.range && (
                              <option value={item.range}>{item.range}</option>
                            )}
                            {ATTACK_RANGE_OPTIONS.map((rng) => (
                              <option key={rng} value={rng}>
                                {rng}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block mb-1">Duração</label>
                          <input
                            disabled={!canEdit}
                            value={item.duration}
                            onChange={(e) => patch({ duration: e.target.value })}
                            className="rpg-input w-full"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                          <input
                            disabled={!canEdit}
                            type="checkbox"
                            checked={Boolean(item.requiresConcentration)}
                            onChange={(e) => patch({ requiresConcentration: e.target.checked })}
                            className="accent-sky-400"
                          />
                          <span className="text-sky-300 font-semibold">
                            Requer Concentração
                          </span>
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            (Ativa foco automaticamente ao conjurar; sofrer dano exige teste de CON e perder remove efeitos)
                          </span>
                        </label>

                        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                          <input
                            disabled={!canEdit}
                            type="checkbox"
                            checked={Boolean(item.singleTargetOnly)}
                            onChange={(e) => patch({ singleTargetOnly: e.target.checked })}
                            className="accent-amber-400"
                          />
                          <span className="text-amber-300 font-semibold">
                            Alvo Único (Exclusivo)
                          </span>
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            (Apenas 1 alvo ativo por vez; trocar de alvo exibe aviso de confirmação e remove do anterior)
                          </span>
                        </label>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                          <div>
                            <label className="block mb-1">Efeito Sonoro (SFX ao Usar)</label>
                            <div className="flex items-center gap-1.5">
                              <select
                                disabled={!canEdit}
                                value={item.sfxPreset || ''}
                                onChange={(e) => patch({ sfxPreset: e.target.value || undefined })}
                                className="rpg-input w-full"
                              >
                                {ABILITY_SFX_OPTIONS.map((opt) => (
                                  <option key={opt.value || 'auto'} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                title="Testar efeito sonoro"
                                onClick={() =>
                                  soundEngine.playSfxPreset(
                                    resolveAbilitySfxPreset({
                                      explicitSfxPreset: item.sfxPreset,
                                      title: item.name,
                                      damageType: item.damageType,
                                      range: item.range,
                                      applyConditionId: item.applyConditionId,
                                      conditionName: campaign.compendium.conditions.find(
                                        (c) => c.id === item.applyConditionId
                                      )?.name,
                                      isAttack: Boolean(item.attackFormula),
                                    })
                                  )
                                }
                                className="rpg-btn-ghost px-2.5 py-1.5 rounded text-xs shrink-0"
                              >
                                🔊
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block mb-1">Descrição</label>
                        <textarea
                          disabled={!canEdit}
                          rows={2}
                          value={item.description}
                          onChange={(e) => patch({ description: e.target.value })}
                          className="rpg-input w-full"
                        />
                      </div>

                      <div className="rpg-card p-3 rounded-lg space-y-2.5">
                        <div className="font-semibold text-amber-400">
                          Automação de Fórmulas (Use @for, @des, @int, @sab, @car, @prof, @nivel)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block mb-1">Fórmula de Ataque</label>
                            <input
                              disabled={
                                !canEdit ||
                                !item.damageType ||
                                item.damageType.toLowerCase() === 'cura' ||
                                Boolean(item.aoeShape)
                              }
                              value={
                                !item.damageType ||
                                item.damageType.toLowerCase() === 'cura' ||
                                item.aoeShape
                                  ? ''
                                  : item.attackFormula || ''
                              }
                              onChange={(e) => patch({ attackFormula: e.target.value })}
                              placeholder={
                                item.aoeShape
                                  ? 'Área geométrica (usa Salvaguarda / CD)'
                                  : !item.damageType
                                    ? 'Sem ataque (apenas condição/efeito)'
                                    : item.damageType.toLowerCase() === 'cura'
                                      ? 'Cura garantida (sem teste de CA)'
                                      : 'Ex: 1d20 + @int + @prof'
                              }
                              className="rpg-input w-full font-mono-dice disabled:opacity-45"
                            />
                          </div>
                          <div>
                            <label className="block mb-1">Fórmula de Dano / Cura</label>
                            <input
                              disabled={!canEdit || !item.damageType}
                              value={!item.damageType ? '' : (item.damageFormula || '')}
                              onChange={(e) => patch({ damageFormula: e.target.value })}
                              placeholder={!item.damageType ? 'Sem dano (apenas efeito)' : 'Ex: 8d6 ou 2d8 + @sab'}
                              className="rpg-input w-full font-mono-dice disabled:opacity-45"
                            />
                          </div>
                          <div>
                            <label className="block mb-1">Tipo de Dano / Efeito</label>
                            <select
                              disabled={!canEdit}
                              value={item.damageType || ''}
                              onChange={(e) => {
                                const nextType = e.target.value;
                                if (!nextType) {
                                  patch({ damageType: '', attackFormula: '', damageFormula: '' });
                                } else if (nextType.toLowerCase() === 'cura') {
                                  patch({ damageType: nextType, attackFormula: '' });
                                } else {
                                  patch({ damageType: nextType });
                                }
                              }}
                              className="rpg-input w-full"
                            >
                              <option value="">Nenhum</option>
                              {campaignDamageTypes.map((dt) => (
                                <option key={dt} value={dt}>
                                  {dt}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block mb-1">Salvaguarda do Alvo</label>
                            <select
                              disabled={!canEdit}
                              value={item.saveSkillId || ''}
                              onChange={(e) => patch({ saveSkillId: e.target.value })}
                              className="rpg-input w-full"
                            >
                              <option value="">Nenhuma (Dano direto)</option>
                              <optgroup label="Salvaguardas (Testes de Resistência)">
                                {campaign.compendium.skills
                                  .filter((s) => s.isSavingThrow)
                                  .map((s) => (
                                    <option key={s.id} value={s.id}>
                                      🛡️ {s.name}
                                    </option>
                                  ))}
                              </optgroup>
                              <optgroup label="Outras Perícias">
                                {campaign.compendium.skills
                                  .filter((s) => !s.isSavingThrow)
                                  .map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                              </optgroup>
                            </select>
                          </div>
                          <div>
                            <label className="block mb-1">Fórmula de CD</label>
                            <input
                              disabled={!canEdit}
                              value={item.saveDcFormula || ''}
                              onChange={(e) => patch({ saveDcFormula: e.target.value })}
                              placeholder="Ex: 8 + @prof + @int"
                              className="rpg-input w-full font-mono-dice"
                            />
                          </div>
                          <div>
                            <label className="block mb-1">Aplica Condição</label>
                            <select
                              disabled={!canEdit}
                              value={item.applyConditionId || ''}
                              onChange={(e) => patch({ applyConditionId: e.target.value })}
                              className="rpg-input w-full"
                            >
                              <option value="">Nenhuma</option>
                              {campaign.compendium.conditions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.icon} {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Automatic Geometric AoE Shape */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-white/10">
                          <div>
                            <label className="block mb-1">Forma Geométrica (AoE)</label>
                            <select
                              disabled={!canEdit}
                              value={item.aoeShape || ''}
                              onChange={(e) => {
                                const val = e.target.value as AbilityDef['aoeShape'] | '';
                                patch({
                                  aoeShape: val || undefined,
                                  aoeSizeMeters: val ? item.aoeSizeMeters || 6 : undefined,
                                  ...(val ? { attackFormula: '' } : {}),
                                });
                              }}
                              className="rpg-input w-full"
                            >
                              <option value="">Nenhuma (Alvo Único)</option>
                              <option value="sphere">Esfera / Círculo</option>
                              <option value="cone">Cone</option>
                              <option value="line">Linha</option>
                              <option value="cube">Quadrado / Cubo</option>
                            </select>
                          </div>
                          <div>
                            <label className="block mb-1">Diâmetro / Comprimento (m)</label>
                            <input
                              disabled={!canEdit || !item.aoeShape}
                              type="number"
                              min={1.5}
                              step={1.5}
                              value={item.aoeSizeMeters || ''}
                              onChange={(e) =>
                                patch({ aoeSizeMeters: Math.max(1.5, Number(e.target.value) || 6) })
                              }
                              placeholder="Ex: 6"
                              className="rpg-input w-full font-mono-dice disabled:opacity-45"
                            />
                          </div>
                          <div>
                            <label className="block mb-1">Alvos Atingidos na Área</label>
                            <select
                              disabled={!canEdit || !item.aoeShape}
                              value={item.aoeTargetFilter || 'all'}
                              onChange={(e) =>
                                patch({
                                  aoeTargetFilter: e.target.value as AbilityDef['aoeTargetFilter'],
                                })
                              }
                              className="rpg-input w-full disabled:opacity-45"
                            >
                              <option value="all">Atinge todos na área</option>
                              <option value="exclude-caster">Ignora o conjurador</option>
                              <option value="exclude-allies">Ignora conjurador e aliados</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 pt-1">
                          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                            <input
                              disabled={!canEdit || !item.aoeShape}
                              type="checkbox"
                              checked={Boolean(item.aoePersistent)}
                              onChange={(e) => patch({ aoePersistent: e.target.checked })}
                              className="accent-amber-400"
                            />
                            <span className="text-[11px]">Manter forma no mapa após conjurar</span>
                          </label>
                        </div>

                        {/* Elemental Surface Created on Ground */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/10">
                          <div>
                            <label className="block mb-1">Superfície Elemental Criada (Terreno)</label>
                            <select
                              disabled={!canEdit}
                              value={item.createsSurface || ''}
                              onChange={(e) =>
                                patch({
                                  createsSurface: (e.target.value || undefined) as AbilityDef['createsSurface'],
                                })
                              }
                              className="rpg-input w-full"
                            >
                              <option value="">Nenhuma</option>
                              <option value="fire">🔥 Fogo (1d4 ao pisar)</option>
                              <option value="ice">❄️ Gelo (Reflexos ou Caído)</option>
                              <option value="acid">🧪 Ácido (1d4 ao pisar)</option>
                              <option value="water">💧 Água (Molhado)</option>
                            </select>
                          </div>
                          <div className="flex items-end pb-1 text-[10px] opacity-75">
                            Ao conjurar a habilidade no mapa, ela pinta automaticamente o chão com essa superfície elemental.
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              {/* ITEM EDITOR */}
              {section === 'items' &&
                (() => {
                  const item =
                    campaign.compendium.items.find((i) => i.id === selectedId) ||
                    campaign.compendium.items[0];
                  if (!item) return null;
                  const patch = (next: Partial<ItemDef>) =>
                    updateCompendium(
                      'items',
                      campaign.compendium.items.map((i) => (i.id === item.id ? { ...i, ...next } : i))
                    );
                  return (
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {item.imageUrl && (
                            <img
                              src={resolveAssetUrl(item.imageUrl)}
                              alt={item.name}
                              className="w-10 h-10 rounded-md object-cover border border-amber-400/50 shrink-0"
                            />
                          )}
                          <h3 className="font-display font-bold text-lg truncate">{item.name}</h3>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-2 shrink-0">
                            <FileUploadButton
                              label={item.imageUrl ? 'Trocar Imagem' : '+ Imagem'}
                              accept="image/*"
                              className="rpg-card px-2 py-1 rounded text-[11px]"
                              onUploaded={(url) => patch({ imageUrl: url })}
                            />
                            <button
                              onClick={() => {
                                updateCompendium(
                                  'items',
                                  campaign.compendium.items.filter((i) => i.id !== item.id)
                                );
                                setSelectedId(null);
                              }}
                              className="text-red-400 flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Excluir
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="col-span-2">
                          <label className="block mb-1">Nome do Item</label>
                          <input
                            disabled={!canEdit}
                            value={item.name}
                            onChange={(e) => patch({ name: e.target.value })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Tipo</label>
                          <select
                            disabled={!canEdit}
                            value={item.type}
                            onChange={(e) => patch({ type: e.target.value as ItemDef['type'] })}
                            className="rpg-input w-full"
                          >
                            <option value="Arma">Arma</option>
                            <option value="Armadura">Armadura</option>
                            <option value="Escudo">Escudo</option>
                            <option value="Consumível">Consumível</option>
                            <option value="Item Mágico">Item Mágico</option>
                            <option value="Equipamento">Equipamento</option>
                          </select>
                        </div>
                        <div>
                          <label className="block mb-1">Valor (PO)</label>
                          <input
                            disabled={!canEdit}
                            type="number"
                            value={item.valueGold}
                            onChange={(e) => patch({ valueGold: Number(e.target.value) })}
                            className="rpg-input w-full"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block mb-1">Peso (kg)</label>
                          <input
                            disabled={!canEdit}
                            type="number"
                            step="0.1"
                            value={item.weight}
                            onChange={(e) => patch({ weight: Number(e.target.value) })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Bônus Defesa (CA)</label>
                          <input
                            disabled={!canEdit}
                            type="number"
                            value={item.defenseBonus || 0}
                            onChange={(e) => patch({ defenseBonus: Number(e.target.value) })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Fórmula Ataque</label>
                          <input
                            disabled={!canEdit}
                            value={item.attackFormula || ''}
                            onChange={(e) => patch({ attackFormula: e.target.value })}
                            className="rpg-input w-full font-mono-dice"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Fórmula Dano / Cura</label>
                          <input
                            disabled={!canEdit}
                            value={item.damageFormula || ''}
                            onChange={(e) => patch({ damageFormula: e.target.value })}
                            className="rpg-input w-full font-mono-dice"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block mb-1">Tipo de Dano / Efeito</label>
                          <select
                            disabled={!canEdit}
                            value={item.damageType || ''}
                            onChange={(e) => patch({ damageType: e.target.value })}
                            className="rpg-input w-full"
                          >
                            <option value="">Nenhum</option>
                            {campaignDamageTypes.map((dt) => (
                              <option key={dt} value={dt}>
                                {dt}
                              </option>
                            ))}
                          </select>
                        </div>
                        {item.type !== 'Consumível' && (
                          <div>
                            <label className="block mb-1">Parte do Corpo (Slot)</label>
                            <select
                              disabled={!canEdit}
                              value={item.slot || ''}
                              onChange={(e) =>
                                patch({
                                  slot: (e.target.value || undefined) as ItemDef['slot'],
                                })
                              }
                              className="rpg-input w-full"
                            >
                              <option value="">Automático pelo Tipo/Nome</option>
                              <option value="head">Cabeça (Elmo / Capuz / Coroa)</option>
                              <option value="amulet">Pescoço / Manto (Colar / Capa)</option>
                              <option value="armor">Tronco / Armadura (Peitoral / Veste)</option>
                              <option value="mainHand">Mão Principal (Arma / Cajado)</option>
                              <option value="offHand">Mão Secundária (Escudo / Foco)</option>
                              <option value="ring">Anel / Relíquia (Anel / Luvas)</option>
                              <option value="boots">Pés / Botas (Grevas / Botas)</option>
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="block mb-1">Raridade</label>
                          <select
                            disabled={!canEdit}
                            value={item.rarity || 'comum'}
                            onChange={(e) =>
                              patch({
                                rarity: e.target.value as CardRarity,
                              })
                            }
                            className="rpg-input w-full"
                          >
                            <option value="comum">Comum</option>
                            <option value="raro">Raro</option>
                            <option value="epico">Épico</option>
                            <option value="lendario">Lendário</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block mb-1">Descrição</label>
                        <textarea
                          disabled={!canEdit}
                          rows={2}
                          value={item.description}
                          onChange={(e) => patch({ description: e.target.value })}
                          className="rpg-input w-full"
                        />
                      </div>

                      {renderModifierEditor(item.modifiers || [], (mods) =>
                        patch({ modifiers: mods })
                      )}
                    </div>
                  );
                })()}

              {/* CONDITION EDITOR */}
              {section === 'conditions' &&
                (() => {
                  const item =
                    campaign.compendium.conditions.find((c) => c.id === selectedId) ||
                    campaign.compendium.conditions[0];
                  if (!item) return null;
                  const patch = (next: Partial<ConditionDef>) =>
                    updateCompendium(
                      'conditions',
                      campaign.compendium.conditions.map((c) => (c.id === item.id ? { ...c, ...next } : c))
                    );
                  return (
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display font-bold text-lg">
                          {item.icon} {item.name}
                        </h3>
                        {canEdit && (
                          <button
                            onClick={() => {
                              updateCompendium(
                                'conditions',
                                campaign.compendium.conditions.filter((c) => c.id !== item.id)
                              );
                              setSelectedId(null);
                            }}
                            className="text-red-400 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Excluir
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-2.5">
                        <div className="col-span-2">
                          <label className="block mb-1">Nome</label>
                          <input
                            disabled={!canEdit}
                            value={item.name}
                            onChange={(e) => patch({ name: e.target.value })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Ícone / Emoji</label>
                          <input
                            disabled={!canEdit}
                            value={item.icon}
                            onChange={(e) => patch({ icon: e.target.value })}
                            className="rpg-input w-full text-center"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Cor</label>
                          <input
                            disabled={!canEdit}
                            type="color"
                            value={item.color}
                            onChange={(e) => patch({ color: e.target.value })}
                            className="rpg-input w-full h-8 p-1"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block mb-1">Descrição</label>
                        <textarea
                          disabled={!canEdit}
                          rows={2}
                          value={item.description}
                          onChange={(e) => patch({ description: e.target.value })}
                          className="rpg-input w-full"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs cursor-pointer select-none pt-1">
                        <input
                          disabled={!canEdit}
                          type="checkbox"
                          checked={Boolean(item.preventsOpportunityAttacks)}
                          onChange={(e) =>
                            patch({ preventsOpportunityAttacks: e.target.checked })
                          }
                          className="accent-emerald-400"
                        />
                        <span className="text-emerald-300 font-semibold">
                          Imune a Ataques de Oportunidade (Desengajar Natural)
                        </span>
                      </label>
                      {renderModifierEditor(item.modifiers, (mods) => patch({ modifiers: mods }))}
                    </div>
                  );
                })()}

              {/* MONSTER EDITOR (GM ONLY) */}
              {activeSection === 'monsters' &&
                role === 'gm' &&
                (() => {
                  const item =
                    campaign.compendium.monsters.find((m) => m.id === selectedId) ||
                    campaign.compendium.monsters[0];
                  if (!item) return null;
                  const patch = (next: Partial<MonsterDef>) =>
                    updateCompendium(
                      'monsters',
                      campaign.compendium.monsters.map((m) => (m.id === item.id ? { ...m, ...next } : m))
                    );
                  return (
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-3">
                          <TokenPortrait
                            name={item.name}
                            imageUrl={item.imageUrl}
                            playerColor={item.tokenColor}
                            frameStyle="crimson"
                            sizePx={48}
                            iconHint={item.type}
                          />
                          <div>
                            <h3 className="font-display font-bold text-lg leading-tight">{item.name}</h3>
                            {canEdit && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <FileUploadButton
                                  accept="image/*"
                                  label={item.imageUrl ? 'Trocar Foto' : 'Subir Foto'}
                                  onUploaded={(url) => patch({ imageUrl: url })}
                                  className="rounded-md"
                                />
                                {item.imageUrl && (
                                  <button
                                    type="button"
                                    onClick={() => patch({ imageUrl: undefined })}
                                    className="rpg-card px-2 py-1 rounded text-[10px] text-red-400 cursor-pointer"
                                  >
                                    Remover Foto
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => openEntitySheet({ kind: 'monster', id: item.id })}
                            className="rpg-card px-2.5 py-1 rounded text-xs font-display font-bold text-amber-200 hover:border-amber-400/70 cursor-pointer"
                          >
                            📜 Ficha Completa
                          </button>
                          {canEdit && (
                            <>
                              <button
                                onClick={() => spawnMonsterOnMap(item)}
                                className="rpg-btn-crimson px-3 py-1 rounded font-semibold cursor-pointer"
                              >
                                + Invocar no Mapa
                              </button>
                              <button
                                onClick={() => {
                                  updateCompendium(
                                    'monsters',
                                    campaign.compendium.monsters.filter((m) => m.id !== item.id)
                                  );
                                  setSelectedId(null);
                                }}
                                className="text-red-400 flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div className="col-span-2">
                          <label className="block mb-1">Nome</label>
                          <input
                            disabled={!canEdit}
                            value={item.name}
                            onChange={(e) => patch({ name: e.target.value })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Tipo</label>
                          <input
                            disabled={!canEdit}
                            value={item.type}
                            onChange={(e) => patch({ type: e.target.value })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">ND (CR)</label>
                          <input
                            disabled={!canEdit}
                            value={item.cr}
                            onChange={(e) => patch({ cr: e.target.value })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Porte / Tamanho</label>
                          <div className="flex items-center gap-1.5">
                            <select
                              disabled={!canEdit}
                              value={item.size}
                              onChange={(e) => {
                                const sz = e.target.value as MonsterDef['size'];
                                const mapped =
                                  sz === 'Colossal' ? 4 : sz === 'Enorme' ? 3 : sz === 'Grande' ? 2 : 1;
                                patch({ size: sz, gridSize: mapped });
                              }}
                              className="rpg-input flex-1"
                            >
                              <option value="Pequeno">Pequeno (1×1)</option>
                              <option value="Médio">Médio (1×1)</option>
                              <option value="Grande">Grande (2×2)</option>
                              <option value="Enorme">Enorme (3×3)</option>
                              <option value="Colossal">Colossal (4×4)</option>
                            </select>
                            <input
                              disabled={!canEdit}
                              type="number"
                              min={1}
                              max={8}
                              value={getMonsterGridSize(item)}
                              onChange={(e) => {
                                const nextGrid = Math.max(1, Math.min(8, Number(e.target.value) || 1));
                                patch({ gridSize: nextGrid });
                                updateCampaign((prev) => ({
                                  ...prev,
                                  maps: prev.maps.map((mp) => ({
                                    ...mp,
                                    tokens: mp.tokens.map((t) =>
                                      t.type === 'monster' && t.referenceId === item.id
                                        ? { ...t, size: nextGrid }
                                        : t
                                    ),
                                  })),
                                }));
                              }}
                              className="rpg-input w-14 text-center font-mono-dice"
                              title="Tamanho livre no grid em quadrados (1×1 até 8×8)"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2.5">
                        <div>
                          <label className="block mb-1">PV Máximo</label>
                          <input
                            disabled={!canEdit}
                            type="number"
                            value={item.maxHp}
                            onChange={(e) => patch({ maxHp: Number(e.target.value) })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Defesa (CA)</label>
                          <input
                            disabled={!canEdit}
                            type="number"
                            value={item.defense}
                            onChange={(e) => patch({ defense: Number(e.target.value) })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Iniciativa (+)</label>
                          <input
                            disabled={!canEdit}
                            type="number"
                            value={item.initiativeBonus}
                            onChange={(e) => patch({ initiativeBonus: Number(e.target.value) })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Cor Token</label>
                          <input
                            disabled={!canEdit}
                            type="color"
                            value={item.tokenColor}
                            onChange={(e) => patch({ tokenColor: e.target.value })}
                            className="rpg-input w-full h-8 p-1"
                          />
                        </div>
                      </div>

                      {/* Per-Enemy AC Visibility + Boss Configuration */}
                      <div className="rpg-card p-3 rounded-lg space-y-2.5 border border-amber-500/30">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
                            <input
                              type="checkbox"
                              disabled={!canEdit}
                              checked={item.hideAcFromPlayers ?? !campaign.settings.showEnemyAcToPlayers}
                              onChange={(e) => patch({ hideAcFromPlayers: e.target.checked })}
                            />
                            <span>Ocultar C.A. deste inimigo para os jogadores</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-300">
                            <input
                              type="checkbox"
                              disabled={!canEdit}
                              checked={Boolean(item.isBoss)}
                              onChange={(e) =>
                                patch({
                                  isBoss: e.target.checked,
                                  legendaryActionsMax: item.legendaryActionsMax ?? 3,
                                  legendaryResistancesMax: item.legendaryResistancesMax ?? 3,
                                  bossPhase2HpPct: item.bossPhase2HpPct ?? 50,
                                })
                              }
                            />
                            <span>Marcar como CHEFE (BOSS)</span>
                          </label>
                        </div>

                        {item.isBoss && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-amber-500/20">
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] uppercase opacity-75 mb-1">
                                Subtítulo do Chefe
                              </label>
                              <input
                                disabled={!canEdit}
                                value={item.bossTitle || ''}
                                onChange={(e) => patch({ bossTitle: e.target.value })}
                                placeholder="Ex: Senhor das Cinzas"
                                className="rpg-input w-full py-1"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase opacity-75 mb-1">
                                Ações Lendárias / Rodada
                              </label>
                              <input
                                disabled={!canEdit}
                                type="number"
                                min={0}
                                max={6}
                                value={item.legendaryActionsMax ?? 3}
                                onChange={(e) =>
                                  patch({ legendaryActionsMax: Math.max(0, Number(e.target.value) || 0) })
                                }
                                className="rpg-input w-full py-1 text-center"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase opacity-75 mb-1">
                                Resistências Lendárias
                              </label>
                              <input
                                disabled={!canEdit}
                                type="number"
                                min={0}
                                max={6}
                                value={item.legendaryResistancesMax ?? 3}
                                onChange={(e) =>
                                  patch({ legendaryResistancesMax: Math.max(0, Number(e.target.value) || 0) })
                                }
                                className="rpg-input w-full py-1 text-center"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase opacity-75 mb-1">
                                Gatilho Fase 2 (% PV)
                              </label>
                              <input
                                disabled={!canEdit}
                                type="number"
                                min={10}
                                max={90}
                                value={item.bossPhase2HpPct ?? 50}
                                onChange={(e) =>
                                  patch({
                                    bossPhase2HpPct: Math.max(10, Math.min(90, Number(e.target.value) || 50)),
                                  })
                                }
                                className="rpg-input w-full py-1 text-center"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className="block text-[10px] uppercase opacity-75 mb-1">
                                Nome da Fase 2 (ao cruzar o limiar de PV)
                              </label>
                              <input
                                disabled={!canEdit}
                                value={item.bossPhase2Title || ''}
                                onChange={(e) => patch({ bossPhase2Title: e.target.value })}
                                placeholder="Ex: Forma Desperta / Fúria Ancestral"
                                className="rpg-input w-full py-1"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Damage Resistances / Immunities / Vulnerabilities */}
                      <div className="rpg-card p-3 rounded-lg space-y-2">
                        <div className="font-semibold text-amber-200">
                          Afinidades de Dano (Resistência ½ • Imunidade 0 • Vulnerabilidade 2x)
                        </div>
                        {(
                          [
                            {
                              key: 'damageResistances' as const,
                              label: 'Resistente (½ dano)',
                              activeCls: 'bg-sky-950/90 border-sky-400/70 text-sky-200',
                            },
                            {
                              key: 'damageImmunities' as const,
                              label: 'Imune (0 dano)',
                              activeCls: 'bg-emerald-950/90 border-emerald-400/70 text-emerald-200',
                            },
                            {
                              key: 'damageVulnerabilities' as const,
                              label: 'Vulnerável (2x dano)',
                              activeCls: 'bg-red-950/90 border-red-400/70 text-red-200',
                            },
                          ] as const
                        ).map((group) => {
                          const list = item[group.key] || [];
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
                                      disabled={!canEdit}
                                      onClick={() => {
                                        const nextList = active
                                          ? list.filter((x) => x !== dt)
                                          : [...list, dt];
                                        patch({ [group.key]: nextList });
                                      }}
                                      className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer transition disabled:opacity-50 ${
                                        active
                                          ? group.activeCls
                                          : 'rpg-card opacity-70 hover:opacity-100'
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

                      {/* Attacks + 1-Click Monster Attack Roll for GM */}
                      <div className="rpg-card p-3 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Ataques do Monstro (Clique em Rolar para atacar alvo)</span>
                          {canEdit && (
                            <button
                              onClick={() =>
                                patch({
                                  attacks: [
                                    ...item.attacks,
                                    { name: 'Novo Ataque', attackBonus: 4, damageFormula: '1d8+2', damageType: 'Corte' },
                                  ],
                                })
                              }
                              className="rpg-card px-2 py-0.5 rounded text-[11px] cursor-pointer"
                            >
                              + Ataque
                            </button>
                          )}
                        </div>
                        {item.attacks.map((atk, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                            <input
                              disabled={!canEdit}
                              value={atk.name}
                              onChange={(e) =>
                                patch({
                                  attacks: item.attacks.map((a, i) =>
                                    i === idx ? { ...a, name: e.target.value } : a
                                  ),
                                })
                              }
                              className="rpg-input col-span-3 py-1"
                            />
                            <input
                              disabled={!canEdit}
                              type="number"
                              value={atk.attackBonus}
                              onChange={(e) =>
                                patch({
                                  attacks: item.attacks.map((a, i) =>
                                    i === idx ? { ...a, attackBonus: Number(e.target.value) } : a
                                  ),
                                })
                              }
                              className="rpg-input col-span-2 py-1 text-center"
                            />
                            <input
                              disabled={!canEdit}
                              value={atk.damageFormula}
                              onChange={(e) =>
                                patch({
                                  attacks: item.attacks.map((a, i) =>
                                    i === idx ? { ...a, damageFormula: e.target.value } : a
                                  ),
                                })
                              }
                              className="rpg-input col-span-3 py-1 font-mono-dice"
                            />
                            <input
                              disabled={!canEdit}
                              value={atk.damageType}
                              onChange={(e) =>
                                patch({
                                  attacks: item.attacks.map((a, i) =>
                                    i === idx ? { ...a, damageType: e.target.value } : a
                                  ),
                                })
                              }
                              className="rpg-input col-span-2 py-1"
                            />
                            <button
                              onClick={() =>
                                quickRollFormula(
                                  `${item.name}: ${atk.name}`,
                                  `1d20 + ${atk.attackBonus}`,
                                  item.name,
                                  atk.damageFormula,
                                  atk.damageType
                                )
                              }
                              className="rpg-btn-crimson col-span-2 py-1 rounded text-[11px] cursor-pointer"
                            >
                              Rolar 🎲
                            </button>
                          </div>
                        ))}
                      </div>

                      <div>
                        <label className="block mb-1">Descrição &amp; Táticas</label>
                        <textarea
                          disabled={!canEdit}
                          rows={2}
                          value={item.description}
                          onChange={(e) => patch({ description: e.target.value })}
                          className="rpg-input w-full"
                        />
                      </div>
                    </div>
                  );
                })()}

              {activeSection === 'encounters' &&
                (() => {
                  const list = campaign.savedEncounters || [];
                  const enc = list.find((e) => e.id === selectedId) || list[0];
                  if (!enc) {
                    return (
                      <div className="text-center py-10 space-y-2 opacity-80">
                        <div className="font-display font-bold text-sm text-amber-200">
                          Nenhum encontro salvo ainda
                        </div>
                        <p className="text-xs opacity-75">
                          Clique em "+ Criar" na coluna da esquerda para montar um bando de monstros e invocar tudo com 1 clique!
                        </p>
                      </div>
                    );
                  }
                  const patchEnc = (next: Partial<SavedEncounter>) =>
                    updateCampaign((prev) => ({
                      ...prev,
                      savedEncounters: (prev.savedEncounters || []).map((x) =>
                        x.id === enc.id ? { ...x, ...next } : x
                      ),
                    }));
                  const totalMonsters = enc.entries.reduce((s, e) => s + e.count, 0);
                  return (
                    <div className="space-y-4 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display font-bold text-lg text-amber-200">
                          {enc.name} ({totalMonsters} criatura{totalMonsters === 1 ? '' : 's'})
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={totalMonsters === 0}
                            onClick={() => spawnEncounterOnMap(enc, false)}
                            className="rpg-card px-3 py-1.5 rounded font-display font-bold text-amber-200 hover:border-amber-400 cursor-pointer disabled:opacity-40"
                          >
                            Invocar no Mapa
                          </button>
                          <button
                            type="button"
                            disabled={totalMonsters === 0}
                            onClick={() => spawnEncounterOnMap(enc, true)}
                            className="rpg-btn-crimson px-3 py-1.5 rounded font-display font-bold cursor-pointer disabled:opacity-40"
                          >
                            ⚔ Invocar + Rolar Iniciativa
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateCampaign((prev) => ({
                                ...prev,
                                savedEncounters: (prev.savedEncounters || []).filter((x) => x.id !== enc.id),
                              }))
                            }
                            className="rpg-card p-1.5 rounded text-red-400 hover:bg-red-950/60 cursor-pointer"
                            title="Excluir encontro"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block mb-1">Nome do Encontro</label>
                          <input
                            value={enc.name}
                            onChange={(e) => patchEnc({ name: e.target.value })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Notas / Gatilho</label>
                          <input
                            value={enc.description || ''}
                            onChange={(e) => patchEnc({ description: e.target.value })}
                            placeholder="Ex: Emboscada na ponte da floresta"
                            className="rpg-input w-full"
                          />
                        </div>
                      </div>

                      <div className="rpg-card rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display font-bold text-amber-300">
                            Criaturas neste Encontro
                          </span>
                          <select
                            value=""
                            onChange={(e) => {
                              const mid = e.target.value;
                              if (!mid) return;
                              const existing = enc.entries.find((x) => x.monsterId === mid);
                              patchEnc({
                                entries: existing
                                  ? enc.entries.map((x) =>
                                      x.monsterId === mid ? { ...x, count: x.count + 1 } : x
                                    )
                                  : [...enc.entries, { monsterId: mid, count: 1 }],
                              });
                            }}
                            className="rpg-input py-1 px-2 text-xs max-w-[220px]"
                          >
                            <option value="">+ Adicionar Criatura...</option>
                            {campaign.compendium.monsters.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.isBoss ? '👑 ' : ''}{m.name} (ND {m.cr})
                              </option>
                            ))}
                          </select>
                        </div>

                        {enc.entries.length === 0 ? (
                          <div className="text-center opacity-60 italic py-3">
                            Adicione monstros acima para montar o bando.
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {enc.entries.map((entry) => {
                              const mon = campaign.compendium.monsters.find((m) => m.id === entry.monsterId);
                              return (
                                <div
                                  key={entry.monsterId}
                                  className="rpg-socket rounded px-2.5 py-1.5 flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <div className="font-display font-bold text-amber-100 truncate">
                                      {mon?.name || 'Criatura'}
                                    </div>
                                    <div className="text-[10px] opacity-70">
                                      ND {mon?.cr || '?'} • PV {mon?.maxHp || '?'} • CA {mon?.defense || '?'}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        patchEnc({
                                          entries:
                                            entry.count <= 1
                                              ? enc.entries.filter((x) => x.monsterId !== entry.monsterId)
                                              : enc.entries.map((x) =>
                                                  x.monsterId === entry.monsterId
                                                    ? { ...x, count: x.count - 1 }
                                                    : x
                                                ),
                                        })
                                      }
                                      className="rpg-card px-2 py-0.5 rounded font-bold cursor-pointer"
                                    >
                                      -
                                    </button>
                                    <span className="font-mono-dice font-bold w-6 text-center text-amber-300">
                                      {entry.count}×
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        patchEnc({
                                          entries: enc.entries.map((x) =>
                                            x.monsterId === entry.monsterId
                                              ? { ...x, count: x.count + 1 }
                                              : x
                                          ),
                                        })
                                      }
                                      className="rpg-card px-2 py-0.5 rounded font-bold cursor-pointer"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
