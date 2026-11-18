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
  AbilityDef,
  AttributeDef,
  ClassDef,
  ConditionDef,
  ItemDef,
  MonsterDef,
  RaceDef,
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
  | 'monsters';

interface CompendiumModalProps {
  onClose: () => void;
}

export const CompendiumModal: React.FC<CompendiumModalProps> = ({ onClose }) => {
  const { campaign, role, updateCampaign, quickRollFormula } = useCampaign();
  const [section, setSection] = useState<CompendiumSection>('abilities');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canEdit = role === 'gm';

  const sections: Array<{ id: CompendiumSection; label: string; icon: React.ReactNode }> = [
    { id: 'rules', label: 'Regras & Atributos', icon: <Settings className="w-4 h-4" /> },
    { id: 'races', label: 'Raças', icon: <Users className="w-4 h-4" /> },
    { id: 'classes', label: 'Classes', icon: <Swords className="w-4 h-4" /> },
    { id: 'abilities', label: 'Poderes & Magias', icon: <Flame className="w-4 h-4" /> },
    { id: 'items', label: 'Itens & Armas', icon: <Package className="w-4 h-4" /> },
    { id: 'conditions', label: 'Condições', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'monsters', label: 'Bestiário', icon: <Skull className="w-4 h-4" /> },
  ];

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
    }
  };

  const spawnMonsterOnMap = (mon: MonsterDef) => {
    const activeMap = campaign.maps.find((m) => m.id === campaign.activeMapId);
    if (!activeMap) return;
    const count = activeMap.tokens.filter((t) => t.referenceId === mon.id).length;
    updateCampaign((prev) => ({
      ...prev,
      maps: prev.maps.map((m) =>
        m.id === activeMap.id
          ? {
              ...m,
              tokens: [
                ...m.tokens,
                {
                  id: `tok-${Date.now()}`,
                  name: `${mon.name} #${count + 1}`,
                  type: 'monster',
                  referenceId: mon.id,
                  x: Math.floor(m.gridWidth / 2),
                  y: Math.floor(m.gridHeight / 2),
                  size: mon.size === 'Grande' || mon.size === 'Enorme' ? 2 : 1,
                  hp: mon.maxHp,
                  maxHp: mon.maxHp,
                  defense: mon.defense,
                  activeConditionIds: [],
                  isHidden: false,
                  color: mon.tokenColor,
                },
              ],
            }
          : m
      ),
    }));
    window.alert(`${mon.name} invocado no centro do mapa "${activeMap.name}"!`);
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

          <button onClick={onClose} className="rpg-card p-1.5 rounded cursor-pointer">
            <X className="w-4 h-4" />
          </button>
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
                section === sec.id ? 'rpg-btn-primary' : 'rpg-card hover:opacity-85'
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
                      onClick={() => {
                        const code = window.prompt('Código curto para fórmulas (ex: san):', 'san');
                        if (!code) return;
                        const clean = code.toLowerCase().replace(/[^a-z]/g, '');
                        const newAttr: AttributeDef = {
                          id: clean,
                          code: clean,
                          name: window.prompt('Nome do Atributo:', 'Sanidade') || 'Novo Atributo',
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
            </div>

            {/* Skills Editor */}
            <div className="rpg-card rounded-lg p-4 space-y-2.5 flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm">
                  Perícias &amp; Resistências ({campaign.compendium.skills.length})
                </h3>
                {canEdit && (
                  <button
                    onClick={() => {
                      const name = window.prompt('Nome da nova Perícia:', 'Conhecimento Arcano');
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

                {section === 'monsters' &&
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
                      <div className="grid grid-cols-2 gap-2.5">
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
                  const patch = (next: Partial<AbilityDef>) =>
                    updateCompendium(
                      'abilities',
                      campaign.compendium.abilities.map((a) => (a.id === item.id ? { ...a, ...next } : a))
                    );
                  return (
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display font-bold text-lg">{item.name}</h3>
                        {canEdit && (
                          <div className="flex items-center gap-2">
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

                      <div className="grid grid-cols-3 gap-2.5">
                        <div>
                          <label className="block mb-1">Custo ({campaign.settings.resourceShort})</label>
                          <input
                            disabled={!canEdit}
                            type="number"
                            value={item.costMp}
                            onChange={(e) => patch({ costMp: Number(e.target.value) })}
                            className="rpg-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">Alcance</label>
                          <input
                            disabled={!canEdit}
                            value={item.range}
                            onChange={(e) => patch({ range: e.target.value })}
                            className="rpg-input w-full"
                          />
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
                              disabled={!canEdit}
                              value={item.attackFormula || ''}
                              onChange={(e) => patch({ attackFormula: e.target.value })}
                              placeholder="Ex: 1d20 + @int + @prof"
                              className="rpg-input w-full font-mono-dice"
                            />
                          </div>
                          <div>
                            <label className="block mb-1">Fórmula de Dano / Cura</label>
                            <input
                              disabled={!canEdit}
                              value={item.damageFormula || ''}
                              onChange={(e) => patch({ damageFormula: e.target.value })}
                              placeholder="Ex: 8d6 ou 2d8 + @sab"
                              className="rpg-input w-full font-mono-dice"
                            />
                          </div>
                          <div>
                            <label className="block mb-1">Tipo (ou "Cura")</label>
                            <input
                              disabled={!canEdit}
                              value={item.damageType || ''}
                              onChange={(e) => patch({ damageType: e.target.value })}
                              placeholder="Fogo, Corte, Cura..."
                              className="rpg-input w-full"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block mb-1">Resistência do Alvo</label>
                            <select
                              disabled={!canEdit}
                              value={item.saveSkillId || ''}
                              onChange={(e) => patch({ saveSkillId: e.target.value })}
                              className="rpg-input w-full"
                            >
                              <option value="">Nenhuma</option>
                              {campaign.compendium.skills.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
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
                      <div className="flex items-center justify-between">
                        <h3 className="font-display font-bold text-lg">{item.name}</h3>
                        {canEdit && (
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
                      <div>
                        <label className="block mb-1">Tipo de Dano / Efeito</label>
                        <input
                          disabled={!canEdit}
                          value={item.damageType || ''}
                          onChange={(e) => patch({ damageType: e.target.value })}
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
                      {renderModifierEditor(item.modifiers, (mods) => patch({ modifiers: mods }))}
                    </div>
                  );
                })()}

              {/* MONSTER EDITOR */}
              {section === 'monsters' &&
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
                        <h3 className="font-display font-bold text-lg">{item.name}</h3>
                        <div className="flex items-center gap-2">
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
                          <label className="block mb-1">Tamanho</label>
                          <select
                            disabled={!canEdit}
                            value={item.size}
                            onChange={(e) => patch({ size: e.target.value as MonsterDef['size'] })}
                            className="rpg-input w-full"
                          >
                            <option value="Pequeno">Pequeno</option>
                            <option value="Médio">Médio</option>
                            <option value="Grande">Grande</option>
                            <option value="Enorme">Enorme</option>
                          </select>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
