import React, { useEffect, useState } from 'react';
import {
  Backpack,
  BookOpen,
  Crown,
  Dices,
  Plus,
  ScrollText,
  Shield,
  Skull,
  Swords,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  DAMAGE_TYPE_OPTIONS,
  formatSigned,
  getAttrMod,
  getCampaignDamageTypes,
} from '../shared/rulesEngine';
import { MonsterAttack, MonsterDef, NpcEntry } from '../shared/types';
import { FileUploadButton } from './FileUploadButton';
import { OrnateFrame } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

export interface EntitySheetTarget {
  kind: 'monster' | 'npc';
  id: string;
}

let entitySheetListener: ((target: EntitySheetTarget | null) => void) | null = null;

export function openEntitySheet(target: EntitySheetTarget) {
  entitySheetListener?.(target);
}

const DEFAULT_ATTRS: Record<string, number> = {
  for: 10,
  des: 10,
  con: 10,
  int: 10,
  sab: 10,
  car: 10,
};

export const EntitySheetHost: React.FC = () => {
  const { campaign, role, updateCampaign, quickRollFormula } = useCampaign();
  const [target, setTarget] = useState<EntitySheetTarget | null>(null);
  const [tab, setTab] = useState<'combat' | 'actions' | 'skills-loot' | 'lore'>('combat');

  useEffect(() => {
    entitySheetListener = (next) => {
      setTarget(next);
      setTab('combat');
    };
    return () => {
      entitySheetListener = null;
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target]);

  if (!target) return null;

  const isMonster = target.kind === 'monster';
  const monster: MonsterDef | undefined = isMonster
    ? campaign.compendium.monsters.find((m) => m.id === target.id)
    : undefined;
  const npc: NpcEntry | undefined = !isMonster
    ? campaign.npcs.find((n) => n.id === target.id)
    : undefined;

  if (!monster && !npc) return null;

  const canEdit = role === 'gm';
  const entityName = monster ? monster.name : npc!.name;
  const entityColor = monster ? monster.tokenColor : npc!.tokenColor || '#e0b84c';
  const entityImage = monster ? monster.imageUrl : npc!.imageUrl;
  const attrs = (monster ? monster.attributes : npc!.attributes) || DEFAULT_ATTRS;
  const saves = (monster ? monster.saves : npc!.saves) || { fort: 0, ref: 0, von: 0 };
  const attacks: MonsterAttack[] = (monster ? monster.attacks : npc!.attacks) || [];
  const abilities: string[] = (monster ? monster.abilities : npc!.abilities) || [];
  const skills: string[] = (monster ? monster.skills : npc!.skills) || [];
  const loot: string = (monster ? monster.loot : npc!.loot) || '';
  const damageResistances = (monster ? monster.damageResistances : npc!.damageResistances) || [];
  const damageImmunities = (monster ? monster.damageImmunities : npc!.damageImmunities) || [];
  const damageVulnerabilities =
    (monster ? monster.damageVulnerabilities : npc!.damageVulnerabilities) || [];

  const patchMonster = (patch: Partial<MonsterDef>) => {
    if (!monster) return;
    updateCampaign((prev) => ({
      ...prev,
      compendium: {
        ...prev.compendium,
        monsters: prev.compendium.monsters.map((m) =>
          m.id === monster.id ? { ...m, ...patch } : m
        ),
      },
      maps: prev.maps.map((mp) => ({
        ...mp,
        tokens: mp.tokens.map((t) => {
          if (t.type !== 'monster' || t.referenceId !== monster.id) return t;
          const nextMax = patch.maxHp ?? t.maxHp;
          return {
            ...t,
            name: patch.name !== undefined ? patch.name : t.name,
            maxHp: nextMax,
            hp: Math.min(t.hp, nextMax),
            defense: patch.defense ?? t.defense,
            color: patch.tokenColor ?? t.color,
            imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : t.imageUrl,
            hideAcFromPlayers:
              patch.hideAcFromPlayers !== undefined ? patch.hideAcFromPlayers : t.hideAcFromPlayers,
            isBoss: patch.isBoss !== undefined ? patch.isBoss : t.isBoss,
            bossTitle: patch.bossTitle !== undefined ? patch.bossTitle : t.bossTitle,
            bossPhase2HpPct:
              patch.bossPhase2HpPct !== undefined ? patch.bossPhase2HpPct : t.bossPhase2HpPct,
            bossPhase2Title:
              patch.bossPhase2Title !== undefined ? patch.bossPhase2Title : t.bossPhase2Title,
            legendaryActionsMax:
              patch.legendaryActionsMax !== undefined
                ? patch.legendaryActionsMax
                : t.legendaryActionsMax,
            legendaryResistancesMax:
              patch.legendaryResistancesMax !== undefined
                ? patch.legendaryResistancesMax
                : t.legendaryResistancesMax,
          };
        }),
      })),
    }));
  };

  const patchNpc = (patch: Partial<NpcEntry>) => {
    if (!npc) return;
    const effectivePatch: Partial<NpcEntry> =
      patch.attacks && patch.attacks.length > 0 && patch.combatEnabled === undefined
        ? { ...patch, combatEnabled: true }
        : patch;
    updateCampaign((prev) => ({
      ...prev,
      npcs: prev.npcs.map((n) => (n.id === npc.id ? { ...n, ...effectivePatch } : n)),
      maps: prev.maps.map((mp) => ({
        ...mp,
        tokens: mp.tokens.map((t) => {
          if (t.type !== 'npc' || t.referenceId !== npc.id) return t;
          const nextMax = effectivePatch.maxHp ?? t.maxHp;
          return {
            ...t,
            name: effectivePatch.name !== undefined ? effectivePatch.name : t.name,
            maxHp: nextMax,
            hp: Math.min(t.hp, nextMax),
            defense: effectivePatch.defense ?? t.defense,
            color: effectivePatch.tokenColor ?? t.color,
            imageUrl: effectivePatch.imageUrl !== undefined ? effectivePatch.imageUrl : t.imageUrl,
          };
        }),
      })),
    }));
  };

  const patchCommon = (patch: {
    name?: string;
    imageUrl?: string;
    tokenColor?: string;
    maxHp?: number;
    defense?: number;
    speed?: number;
    initiativeBonus?: number;
    attributes?: Record<string, number>;
    saves?: { fort: number; ref: number; von: number; for?: number; int?: number; car?: number };
    attacks?: MonsterAttack[];
    abilities?: string[];
    skills?: string[];
    loot?: string;
    damageResistances?: string[];
    damageImmunities?: string[];
    damageVulnerabilities?: string[];
    secretNotes?: string;
  }) => {
    if (isMonster) patchMonster(patch);
    else patchNpc(patch);
  };

  const rollModifierCheck = (label: string, mod: number) => {
    const formula = mod >= 0 ? `1d20 + ${mod}` : `1d20 - ${Math.abs(mod)}`;
    quickRollFormula(`${entityName} — ${label}`, formula, entityName);
  };

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/78 backdrop-blur-xs flex items-center justify-center p-3 md:p-6"
      onClick={() => setTarget(null)}
    >
      <div
        className="w-full max-w-4xl h-[86vh] animate-modal-unfurl"
        onClick={(e) => e.stopPropagation()}
      >
        <OrnateFrame
          accentColor={monster?.isBoss ? '#dc2626' : '#d4aa48'}
          className="rpg-glass-panel rounded-xl w-full h-full flex flex-col overflow-hidden"
        >
          {/* Header with top-right pinned Close X */}
          <div
            className="px-5 py-3.5 border-b flex items-center justify-between gap-3 shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <TokenPortrait
                name={entityName}
                imageUrl={entityImage}
                playerColor={entityColor}
                frameStyle={monster?.isBoss ? 'crimson' : 'gold'}
                sizePx={54}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-widest font-display font-bold px-1.5 py-0.5 rounded bg-black/40 border border-amber-500/35 text-amber-300 flex items-center gap-1">
                    {isMonster ? (
                      monster?.isBoss ? (
                        <>
                          <Crown className="w-3 h-3 text-amber-400" /> Chefe (Bestiário)
                        </>
                      ) : (
                        <>
                          <Skull className="w-3 h-3 text-red-400" /> Criatura do Bestiário
                        </>
                      )
                    ) : (
                      <>
                        <Users className="w-3 h-3 text-sky-400" /> Ficha de NPC
                      </>
                    )}
                  </span>
                  {monster && (
                    <span className="text-[11px] font-mono-dice opacity-80">
                      ND {monster.cr} • {monster.size} • {monster.type}
                    </span>
                  )}
                  {npc && (
                    <span className="text-[11px] opacity-80">
                      {npc.role} • {npc.disposition}
                    </span>
                  )}
                </div>
                <h2 className="font-chronicle font-black text-xl sm:text-2xl text-amber-100 truncate mt-0.5">
                  {entityName}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setTarget(null)}
              className="rpg-card p-1.5 rounded-md cursor-pointer hover:border-amber-400/60 shrink-0"
              aria-label="Fechar ficha"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 4 Structured Sheet Tabs */}
          <div
            className="px-5 py-2 border-b flex items-center gap-2 overflow-x-auto shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {[
              { id: 'combat' as const, label: 'Combate & Atributos', icon: <Shield className="w-3.5 h-3.5" /> },
              { id: 'actions' as const, label: `Ataques & Poderes (${attacks.length + abilities.length})`, icon: <Swords className="w-3.5 h-3.5" /> },
              { id: 'skills-loot' as const, label: 'Perícias & Loot', icon: <Backpack className="w-3.5 h-3.5" /> },
              { id: 'lore' as const, label: 'História & Notas', icon: <ScrollText className="w-3.5 h-3.5" /> },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition ${
                  tab === t.id ? 'rpg-btn-primary' : 'rpg-card hover:border-amber-400/50'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs min-h-0">
            {tab === 'combat' && (
              <>
                {/* Identity & Portrait Row */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 rpg-card rounded-lg p-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] uppercase opacity-75 mb-1">Nome</label>
                    <input
                      disabled={!canEdit}
                      maxLength={32}
                      value={entityName}
                      onChange={(e) => patchCommon({ name: e.target.value })}
                      className="rpg-input w-full font-display font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase opacity-75 mb-1">Cor do Token</label>
                    <input
                      disabled={!canEdit}
                      type="color"
                      value={entityColor}
                      onChange={(e) => patchCommon({ tokenColor: e.target.value })}
                      className="rpg-input w-full h-9 p-1"
                    />
                  </div>
                  <div className="flex items-end">
                    {canEdit && (
                      <FileUploadButton
                        label={entityImage ? 'Trocar Retrato' : 'Subir Retrato'}
                        accept="image/*"
                        className="rpg-card w-full py-2 px-2.5 rounded text-xs"
                        onUploaded={(url) => patchCommon({ imageUrl: url })}
                      />
                    )}
                  </div>
                </div>

                {/* Vitals & Combat Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rpg-card rounded-lg p-3 text-center">
                    <div className="text-[10px] uppercase opacity-75 mb-1">PV Máximo</div>
                    <input
                      disabled={!canEdit}
                      type="number"
                      min={1}
                      value={(monster ? monster.maxHp : npc!.maxHp) ?? 15}
                      onChange={(e) => patchCommon({ maxHp: Math.max(1, Number(e.target.value) || 1) })}
                      className="rpg-input w-full text-center font-mono-dice font-bold text-base text-red-300"
                    />
                  </div>
                  <div className="rpg-card rounded-lg p-3 text-center">
                    <div className="text-[10px] uppercase opacity-75 mb-1">Classe de Armadura (CA)</div>
                    <input
                      disabled={!canEdit}
                      type="number"
                      min={1}
                      value={(monster ? monster.defense : npc!.defense) ?? 12}
                      onChange={(e) => patchCommon({ defense: Math.max(1, Number(e.target.value) || 1) })}
                      className="rpg-input w-full text-center font-mono-dice font-bold text-base text-amber-300"
                    />
                  </div>
                  <div className="rpg-card rounded-lg p-3 text-center">
                    <div className="text-[10px] uppercase opacity-75 mb-1">Deslocamento (m)</div>
                    <input
                      disabled={!canEdit}
                      type="number"
                      min={0}
                      step={1.5}
                      value={(monster ? monster.speed : npc!.speed) ?? 9}
                      onChange={(e) => patchCommon({ speed: Math.max(0, Number(e.target.value) || 0) })}
                      className="rpg-input w-full text-center font-mono-dice font-bold text-base"
                    />
                  </div>
                  <div className="rpg-card rounded-lg p-3 text-center">
                    <div className="text-[10px] uppercase opacity-75 mb-1">Iniciativa</div>
                    <div className="flex items-center gap-1">
                      <input
                        disabled={!canEdit}
                        type="number"
                        value={(monster ? monster.initiativeBonus : npc!.initiativeBonus) ?? 0}
                        onChange={(e) => patchCommon({ initiativeBonus: Number(e.target.value) || 0 })}
                        className="rpg-input w-full text-center font-mono-dice font-bold text-base"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          rollModifierCheck(
                            'Iniciativa',
                            (monster ? monster.initiativeBonus : npc!.initiativeBonus) ?? 0
                          )
                        }
                        className="rpg-btn-primary p-2 rounded cursor-pointer"
                        title="Rolar Iniciativa"
                      >
                        <Dices className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 6 Attributes with Auto-Calculated Modifiers & 1-Click Roll */}
                <div className="rpg-card rounded-lg p-3.5 space-y-2.5">
                  <div className="font-display font-bold text-xs uppercase tracking-wider text-amber-300">
                    Atributos (Clique no modificador para rolar 1d20)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                    {campaign.compendium.attributes.map((attrDef) => {
                      const val = attrs[attrDef.code] ?? 10;
                      const mod = getAttrMod(val);
                      return (
                        <div
                          key={attrDef.id}
                          className="rpg-socket rounded-lg p-2 flex flex-col items-center gap-1.5"
                        >
                          <span className="text-[10px] font-display font-bold uppercase text-amber-200/90">
                            {attrDef.shortName}
                          </span>
                          <input
                            disabled={!canEdit}
                            type="number"
                            min={1}
                            max={30}
                            value={val}
                            onChange={(e) =>
                              patchCommon({
                                attributes: {
                                  ...attrs,
                                  [attrDef.code]: Math.max(1, Math.min(30, Number(e.target.value) || 10)),
                                },
                              })
                            }
                            className="rpg-input w-14 text-center py-0.5 font-mono-dice font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => rollModifierCheck(attrDef.name, mod)}
                            className="w-full py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-mono-dice font-bold text-xs cursor-pointer transition"
                            title={`Rolar teste de ${attrDef.name}`}
                          >
                            {formatSigned(mod)}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Saving Throws (All 6 Attributes) */}
                <div className="rpg-card rounded-lg p-3.5 space-y-2">
                  <div className="font-display font-bold text-xs uppercase tracking-wider text-amber-300">
                    Salvaguardas (6 Atributos)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(
                      [
                        { key: 'for' as const, label: 'Vigor Físico (FOR)', attrCode: 'for' },
                        { key: 'ref' as const, label: 'Reflexos (DES)', attrCode: 'des' },
                        { key: 'fort' as const, label: 'Resiliência (CON)', attrCode: 'con' },
                        { key: 'int' as const, label: 'Lucidez (INT)', attrCode: 'int' },
                        { key: 'von' as const, label: 'Vontade (SAB)', attrCode: 'sab' },
                        { key: 'car' as const, label: 'Presença (CAR)', attrCode: 'car' },
                      ] as const
                    ).map((sv) => {
                      const val = saves[sv.key] ?? getAttrMod(attrs[sv.attrCode] ?? 10);
                      return (
                        <div key={sv.key} className="rpg-socket rounded-lg p-2 flex items-center justify-between gap-1.5">
                          <span className="font-display font-bold text-[10px] truncate">{sv.label}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              disabled={!canEdit}
                              type="number"
                              value={val}
                              onChange={(e) =>
                                patchCommon({
                                  saves: { ...saves, [sv.key]: Number(e.target.value) || 0 },
                                })
                              }
                              className="rpg-input w-12 text-center py-0.5 font-mono-dice font-bold"
                            />
                            <button
                              type="button"
                              onClick={() => rollModifierCheck(`Salvaguarda de ${sv.label}`, val)}
                              className="rpg-btn-primary p-1.5 rounded cursor-pointer"
                              title={`Rolar ${sv.label}`}
                            >
                              <Dices className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Damage Affinities */}
                <div className="rpg-card rounded-lg p-3.5 space-y-2">
                  <div className="font-display font-bold text-xs uppercase tracking-wider text-amber-300">
                    Afinidades de Dano
                  </div>
                  {(
                    [
                      {
                        key: 'damageResistances' as const,
                        label: 'Resistente (½ dano)',
                        list: damageResistances,
                        activeCls: 'bg-sky-950/90 border-sky-400/70 text-sky-200',
                      },
                      {
                        key: 'damageImmunities' as const,
                        label: 'Imune (0 dano)',
                        list: damageImmunities,
                        activeCls: 'bg-emerald-950/90 border-emerald-400/70 text-emerald-200',
                      },
                      {
                        key: 'damageVulnerabilities' as const,
                        label: 'Vulnerável (2x dano)',
                        list: damageVulnerabilities,
                        activeCls: 'bg-red-950/90 border-red-400/70 text-red-200',
                      },
                    ] as const
                  ).map((grp) => (
                    <div key={grp.key} className="space-y-1">
                      <div className="text-[10px] uppercase opacity-75">{grp.label}</div>
                      <div className="flex flex-wrap gap-1">
                        {DAMAGE_TYPE_OPTIONS.map((dt) => {
                          const active = grp.list.includes(dt);
                          return (
                            <button
                              key={dt}
                              type="button"
                              disabled={!canEdit}
                              onClick={() => {
                                const next = active
                                  ? grp.list.filter((x) => x !== dt)
                                  : [...grp.list, dt];
                                patchCommon({ [grp.key]: next });
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer disabled:opacity-60 ${
                                active ? grp.activeCls : 'rpg-card opacity-65 hover:opacity-100'
                              }`}
                            >
                              {dt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Active Conditions on Map Token(s) for NPCs & Monsters */}
                {(() => {
                  const activeMap =
                    campaign.maps.find((m) => m.id === campaign.activeMapId) || campaign.maps[0];
                  const matchingTokens = (activeMap?.tokens || []).filter(
                    (t) => t.type === (isMonster ? 'monster' : 'npc') && t.referenceId === target.id
                  );
                  const activeCondIds = new Set(
                    matchingTokens.flatMap((t) => t.activeConditionIds || [])
                  );
                  return (
                    <div className="rpg-card rounded-lg p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display font-bold text-xs uppercase tracking-wider text-amber-300">
                          Condições Ativas
                        </span>
                        <span className="text-[10px] opacity-70">
                          {matchingTokens.length > 0
                            ? `${matchingTokens.length} token(s) no mapa atual`
                            : 'Invoque no mapa para aplicar condições'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {campaign.compendium.conditions.map((cond) => {
                          const isActive = activeCondIds.has(cond.id);
                          return (
                            <button
                              key={cond.id}
                              type="button"
                              disabled={!canEdit || matchingTokens.length === 0}
                              onClick={() => {
                                updateCampaign((prev) => ({
                                  ...prev,
                                  maps: prev.maps.map((m) =>
                                    m.id !== prev.activeMapId
                                      ? m
                                      : {
                                          ...m,
                                          tokens: m.tokens.map((t) => {
                                            if (
                                              t.type !== (isMonster ? 'monster' : 'npc') ||
                                              t.referenceId !== target.id
                                            ) {
                                              return t;
                                            }
                                            const has = (t.activeConditionIds || []).includes(cond.id);
                                            return {
                                              ...t,
                                              activeConditionIds: has
                                                ? t.activeConditionIds.filter((id) => id !== cond.id)
                                                : [...(t.activeConditionIds || []), cond.id],
                                            };
                                          }),
                                        }
                                  ),
                                }));
                              }}
                              className={`px-2 py-1 rounded text-[11px] border flex items-center gap-1 cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed ${
                                isActive
                                  ? 'bg-amber-500/20 border-amber-400 text-amber-100 font-bold'
                                  : 'rpg-card opacity-70 hover:opacity-100'
                              }`}
                              title={cond.description}
                            >
                              <span>{cond.icon}</span>
                              <span>{cond.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {tab === 'actions' && (
              <div className="space-y-4">
                {/* Attacks */}
                <div className="rpg-card rounded-lg p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-red-300">
                      Ataques &amp; Ações de Combate ({attacks.length})
                    </span>
                    {canEdit && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          value=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            const [kind, refId] = val.split('::');
                            if (kind === 'item') {
                              const it = campaign.compendium.items.find((i) => i.id === refId);
                              if (!it) return;
                              const nextAtk: MonsterAttack = {
                                name: it.name,
                                attackBonus: Math.max(2, Math.floor(((attrs.for ?? 10) - 10) / 2) + 2),
                                damageFormula: (it.damageFormula || '1d8').replace(/@\w+/g, '0').replace(/\+\s*0\b/g, '').trim() || '1d8',
                                damageType: it.damageType || 'Corte',
                                range: it.range || '1,5m',
                                sourceItemId: it.id,
                              };
                              patchCommon({ attacks: [...attacks, nextAtk] });
                            } else if (kind === 'ability') {
                              const ab = campaign.compendium.abilities.find((a) => a.id === refId);
                              if (!ab) return;
                              const hasNoDamage = !ab.damageType;
                              const isHeal = ab.damageType?.toLowerCase() === 'cura';
                              const nextAtk: MonsterAttack = {
                                name: ab.name,
                                attackBonus: hasNoDamage || isHeal ? 0 : Math.max(2, Math.floor(((attrs.int ?? 10) - 10) / 2) + 2),
                                damageFormula: hasNoDamage
                                  ? ''
                                  : (ab.damageFormula || '1d8').replace(/@\w+/g, '0').replace(/\+\s*0\b/g, '').trim() || '1d8',
                                damageType: ab.damageType || '',
                                range: ab.range || 'Pessoal',
                                sourceAbilityId: ab.id,
                                applyConditionId: ab.applyConditionId,
                                conditionDurationRounds: ab.conditionDurationRounds,
                              };
                              patchCommon({ attacks: [...attacks, nextAtk] });
                            }
                          }}
                          className="rpg-input py-1 px-2 text-[11px] max-w-[210px]"
                          title="Importar arma ou habilidade criada no Compêndio como ataque"
                        >
                          <option value="">+ Importar do Compêndio...</option>
                          {campaign.compendium.items.filter((i) => i.type === 'Arma').length > 0 && (
                            <optgroup label="Armas do Compêndio">
                              {campaign.compendium.items
                                .filter((i) => i.type === 'Arma')
                                .map((it) => (
                                  <option key={it.id} value={`item::${it.id}`}>
                                    ⚔ {it.name} ({it.damageFormula || '1d8'})
                                  </option>
                                ))}
                            </optgroup>
                          )}
                          {campaign.compendium.abilities.length > 0 && (
                            <optgroup label="Habilidades & Magias">
                              {campaign.compendium.abilities.map((ab) => (
                                <option key={ab.id} value={`ability::${ab.id}`}>
                                  ✨ {ab.name}{ab.damageFormula ? ` (${ab.damageFormula})` : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            patchCommon({
                              attacks: [
                                ...attacks,
                                {
                                  name: 'Novo Ataque',
                                  attackBonus: 4,
                                  damageFormula: '1d8+2',
                                  damageType: 'Corte',
                                  range: '1,5m',
                                },
                              ],
                            })
                          }
                          className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Adicionar Ataque
                        </button>
                      </div>
                    )}
                  </div>

                  {attacks.length === 0 ? (
                    <div className="text-center opacity-70 py-4">
                      Nenhum ataque cadastrado ainda.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {attacks.map((atk, idx) => {
                        const isLinked = Boolean(atk.sourceAbilityId || atk.sourceItemId);
                        const isNoDamage = !atk.damageType;
                        return (
                        <div
                          key={idx}
                          className="rpg-socket rounded-lg p-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                          title={isLinked ? 'Sincronizado com Regras — edite em Regras para atualizar em todos' : undefined}
                        >
                          <input
                            disabled={!canEdit || isLinked}
                            maxLength={32}
                            value={atk.name}
                            onChange={(e) =>
                              patchCommon({
                                attacks: attacks.map((a, i) =>
                                  i === idx ? { ...a, name: e.target.value } : a
                                ),
                              })
                            }
                            placeholder="Nome do ataque"
                            className="rpg-input sm:col-span-3 py-1 font-semibold disabled:opacity-70"
                          />
                          <input
                            disabled={!canEdit || isLinked || isNoDamage}
                            type="number"
                            value={isNoDamage ? 0 : atk.attackBonus}
                            onChange={(e) =>
                              patchCommon({
                                attacks: attacks.map((a, i) =>
                                  i === idx ? { ...a, attackBonus: Number(e.target.value) || 0 } : a
                                ),
                              })
                            }
                            title={isNoDamage ? 'Sem rolagem de acerto' : 'Bônus de acerto'}
                            className="rpg-input sm:col-span-2 py-1 text-center font-mono-dice disabled:opacity-45"
                          />
                          <input
                            disabled={!canEdit || isLinked || isNoDamage}
                            value={isNoDamage ? '' : atk.damageFormula}
                            onChange={(e) =>
                              patchCommon({
                                attacks: attacks.map((a, i) =>
                                  i === idx ? { ...a, damageFormula: e.target.value } : a
                                ),
                              })
                            }
                            placeholder={isNoDamage ? 'Condição/Efeito' : '1d8+3'}
                            className="rpg-input sm:col-span-2 py-1 font-mono-dice disabled:opacity-45"
                          />
                          <select
                            disabled={!canEdit || isLinked}
                            value={atk.damageType}
                            onChange={(e) =>
                              patchCommon({
                                attacks: attacks.map((a, i) =>
                                  i === idx
                                    ? {
                                        ...a,
                                        damageType: e.target.value,
                                        ...(e.target.value === '' ? { attackBonus: 0, damageFormula: '' } : {}),
                                      }
                                    : a
                                ),
                              })
                            }
                            className="rpg-input sm:col-span-2 py-1 disabled:opacity-70"
                          >
                            <option value="">Nenhum</option>
                            {getCampaignDamageTypes(campaign).map((dt) => (
                              <option key={dt} value={dt}>
                                {dt}
                              </option>
                            ))}
                          </select>
                          <div className="sm:col-span-3 flex items-center justify-end gap-1">
                            {isLinked && (
                              <span
                                className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-[9px] font-display uppercase text-amber-200"
                                title="Sincronizado com Regras"
                              >
                                Regras
                              </span>
                            )}
                            {!isNoDamage && (
                              <button
                                type="button"
                                onClick={() =>
                                  quickRollFormula(
                                    `${entityName}: ${atk.name}`,
                                    `1d20 + ${atk.attackBonus}`,
                                    entityName,
                                    atk.damageFormula,
                                    atk.damageType
                                  )
                                }
                                className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer"
                              >
                                <Dices className="w-3 h-3" /> Rolar
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() =>
                                  patchCommon({ attacks: attacks.filter((_, i) => i !== idx) })
                                }
                                className="p-1.5 rounded text-red-400 hover:bg-red-950/60 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Special Abilities / Spells / Traits */}
                <div className="rpg-card rounded-lg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-amber-300">
                      Habilidades, Magias &amp; Traços ({abilities.length})
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() =>
                          patchCommon({
                            abilities: [...abilities, 'Nova Habilidade — descreva o efeito aqui.'],
                          })
                        }
                        className="rpg-card px-2.5 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
                      >
                        <Plus className="w-3 h-3" /> Habilidade
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {abilities.map((ab, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <textarea
                          disabled={!canEdit}
                          rows={2}
                          value={ab}
                          onChange={(e) =>
                            patchCommon({
                              abilities: abilities.map((x, i) => (i === idx ? e.target.value : x)),
                            })
                          }
                          className="rpg-input flex-1 py-1.5"
                        />
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() =>
                              patchCommon({ abilities: abilities.filter((_, i) => i !== idx) })
                            }
                            className="p-1.5 rounded text-red-400 hover:bg-red-950/60 cursor-pointer mt-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'skills-loot' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rpg-card rounded-lg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-amber-300">
                      Perícias Treinadas &amp; Sentidos
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => patchCommon({ skills: [...skills, 'Percepção +4'] })}
                        className="rpg-card px-2 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Perícia
                      </button>
                    )}
                  </div>
                  {skills.length === 0 ? (
                    <div className="opacity-70 py-2">Nenhuma perícia listada.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {skills.map((sk, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <input
                            disabled={!canEdit}
                            value={sk}
                            onChange={(e) =>
                              patchCommon({
                                skills: skills.map((x, i) => (i === idx ? e.target.value : x)),
                              })
                            }
                            className="rpg-input flex-1 py-1"
                          />
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() =>
                                patchCommon({ skills: skills.filter((_, i) => i !== idx) })
                              }
                              className="text-red-400 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rpg-card rounded-lg p-3.5 space-y-2">
                  <div className="font-display font-bold text-xs uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                    <Backpack className="w-3.5 h-3.5" />
                    Equipamentos &amp; Loot / Espólios
                  </div>
                  <textarea
                    disabled={!canEdit}
                    rows={8}
                    value={loot}
                    onChange={(e) => patchCommon({ loot: e.target.value })}
                    placeholder="Ex: Espada Curta, 25 PO, Chave da Cripta, Poção de Cura..."
                    className="rpg-input w-full"
                  />
                </div>
              </div>
            )}

            {tab === 'lore' && (
              <div className="space-y-3">
                <div className="rpg-card rounded-lg p-3.5 space-y-2">
                  <div className="font-display font-bold text-xs uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    Descrição &amp; Personalidade
                  </div>
                  <textarea
                    disabled={!canEdit}
                    rows={5}
                    value={monster ? monster.description : npc!.publicBio}
                    onChange={(e) => {
                      if (monster) patchMonster({ description: e.target.value });
                      else patchNpc({ publicBio: e.target.value });
                    }}
                    className="rpg-input w-full"
                  />
                </div>

                {role === 'gm' && (
                  <div className="rpg-card rounded-lg p-3.5 space-y-2 border border-red-500/30">
                    <div className="font-display font-bold text-xs uppercase tracking-wider text-red-300">
                      Segredos &amp; Notas Exclusivas do Mestre
                    </div>
                    <textarea
                      rows={5}
                      value={(monster ? monster.secretNotes : npc!.secretNotes) || ''}
                      onChange={(e) => patchCommon({ secretNotes: e.target.value })}
                      placeholder="Motivações ocultas, táticas de combate, fraquezas narrativas..."
                      className="rpg-input w-full"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </OrnateFrame>
      </div>
    </div>
  );
};
