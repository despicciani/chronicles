import React, { useEffect, useState } from 'react';
import { Eye, Heart, Shield, Skull, Sparkles, X } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { computeCharacterStats, getMonsterWoundStatus } from '../shared/rulesEngine';
import { MapToken } from '../shared/types';
import { OrnateFrame } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

export function openInspectEntity(tokenId: string) {
  window.dispatchEvent(new CustomEvent('chronicle:inspect-entity', { detail: { tokenId } }));
}

export function openInspectNpc(npcId: string) {
  window.dispatchEvent(new CustomEvent('chronicle:inspect-entity', { detail: { npcId } }));
}

export const InspectEntityModal: React.FC = () => {
  const { campaign, role, myCharacter } = useCampaign();
  const [inspectTarget, setInspectTarget] = useState<{ tokenId?: string; npcId?: string } | null>(
    null
  );

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<{ tokenId?: string; npcId?: string }>).detail;
      if (detail?.tokenId) {
        setInspectTarget({ tokenId: detail.tokenId });
      } else if (detail?.npcId) {
        setInspectTarget({ npcId: detail.npcId });
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setInspectTarget(null);
    };
    window.addEventListener('chronicle:inspect-entity', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('chronicle:inspect-entity', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!inspectTarget) return null;
  const allTokens = campaign.maps.flatMap((m) => m.tokens);

  let tok: MapToken | undefined;
  let npcFromCompendium = inspectTarget.npcId
    ? campaign.npcs.find((n) => n.id === inspectTarget.npcId)
    : undefined;

  if (inspectTarget.tokenId) {
    tok = allTokens.find((t) => t.id === inspectTarget.tokenId);
  } else if (npcFromCompendium) {
    if (role !== 'gm' && !npcFromCompendium.revealedToPlayers) return null;
    const liveNpcTok = allTokens.find(
      (t) =>
        t.type === 'npc' &&
        t.referenceId === npcFromCompendium!.id &&
        (role === 'gm' || !t.isHidden)
    );
    if (liveNpcTok) {
      tok = liveNpcTok;
    } else {
      const npcColor =
        npcFromCompendium.tokenColor ||
        (npcFromCompendium.disposition === 'Hostil'
          ? '#ef4444'
          : npcFromCompendium.disposition === 'Aliado'
            ? '#22c55e'
            : '#e0b84c');
      const npcFrame =
        npcFromCompendium.disposition === 'Hostil'
          ? 'crimson'
          : npcFromCompendium.disposition === 'Aliado'
            ? 'emerald'
            : 'gold';
      tok = {
        id: `npc-preview-${npcFromCompendium.id}`,
        name: npcFromCompendium.name,
        type: 'npc',
        referenceId: npcFromCompendium.id,
        x: 0,
        y: 0,
        size: 1,
        hp: npcFromCompendium.maxHp || 15,
        maxHp: npcFromCompendium.maxHp || 15,
        defense: npcFromCompendium.defense || 11,
        activeConditionIds: [],
        isHidden: !npcFromCompendium.revealedToPlayers,
        hideAcFromPlayers: npcFromCompendium.hideAcFromPlayers,
        hideHpFromPlayers: npcFromCompendium.hideHpFromPlayers,
        color: npcColor,
        frameStyle: npcFrame,
        imageUrl: npcFromCompendium.imageUrl,
      };
    }
  }

  if (!tok) return null;
  const isSpottedByMe = Boolean(
    myCharacter && (tok.visibleToCharacterIds || []).includes(myCharacter.id)
  );
  if (role !== 'gm' && tok.isHidden && !isSpottedByMe) return null;

  const char =
    tok.type === 'character' && tok.referenceId
      ? campaign.characters.find((c) => c.id === tok.referenceId)
      : undefined;
  const mon =
    tok.type === 'monster' && tok.referenceId
      ? campaign.compendium.monsters.find((m) => m.id === tok.referenceId)
      : undefined;
  const npc =
    npcFromCompendium ||
    (tok.type === 'npc' && tok.referenceId
      ? campaign.npcs.find((n) => n.id === tok.referenceId)
      : undefined);

  const charStats = char ? computeCharacterStats(char, campaign) : null;
  const isEnemyMonster = tok.type === 'monster';
  const isNpc = tok.type === 'npc';
  const hideHpExplicit =
    role !== 'gm' &&
    (isEnemyMonster || isNpc) &&
    Boolean(
      tok.hideHpFromPlayers !== undefined
        ? tok.hideHpFromPlayers
        : npc?.hideHpFromPlayers !== undefined
          ? npc.hideHpFromPlayers
          : mon?.hideHpFromPlayers
    );
  const showExactStats = role === 'gm' || (!isEnemyMonster && !hideHpExplicit);
  const effectiveHideAc =
    tok.hideAcFromPlayers !== undefined
      ? tok.hideAcFromPlayers
      : isNpc && npc?.hideAcFromPlayers !== undefined
        ? npc.hideAcFromPlayers
        : isEnemyMonster && mon?.hideAcFromPlayers !== undefined
          ? mon.hideAcFromPlayers
          : isEnemyMonster || (isNpc && npc?.disposition === 'Hostil')
            ? campaign.settings.showEnemyAcToPlayers === false
            : false;
  const hideAc = role !== 'gm' && (isEnemyMonster || isNpc) && effectiveHideAc;

  const activeCondIds = char ? char.activeConditionIds : tok.activeConditionIds || [];
  const activeConds = activeCondIds
    .map((id) => campaign.compendium.conditions.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const resistances = char?.damageResistances || mon?.damageResistances || npc?.damageResistances || [];
  const immunities = char?.damageImmunities || mon?.damageImmunities || npc?.damageImmunities || [];
  const vulnerabilities =
    char?.damageVulnerabilities || mon?.damageVulnerabilities || npc?.damageVulnerabilities || [];

  const wound = getMonsterWoundStatus(tok.hp, tok.maxHp);
  const hideThisName =
    role !== 'gm' &&
    (tok.type === 'monster' || tok.type === 'npc') &&
    Boolean(
      tok.hideNameFromPlayers !== undefined
        ? tok.hideNameFromPlayers
        : tok.type === 'npc'
          ? npc?.hideNameFromPlayers
          : mon?.hideNameFromPlayers
    );
  const displayName = hideThisName ? '???' : tok.name;

  const subtitle = hideThisName
    ? 'Criatura Desconhecida'
    : char
      ? `Herói Nv ${char.level} • ${campaign.compendium.races.find((r) => r.id === char.raceId)?.name || ''} ${campaign.compendium.classes.find((c) => c.id === char.classId)?.name || ''}`
      : mon
        ? `${mon.type} • ${mon.size}${mon.isBoss ? ' • CHEFE' : ''}`
        : npc
          ? `${npc.role || 'NPC'} • ${npc.location || 'Campanha'}`
          : 'Criatura';

  const publicDesc = hideThisName
    ? ''
    : char?.background || mon?.description || npc?.publicBio || '';

  return (
    <div
      data-modal-overlay="true"
      data-sub-overlay="true"
      data-inspect-modal="true"
      className="fixed inset-0 z-[88] bg-[#040508]/78 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={() => setInspectTarget(null)}
    >
      <div
        className="w-full max-w-md animate-modal-unfurl"
        onClick={(e) => e.stopPropagation()}
      >
        <OrnateFrame
          accentColor={mon?.isBoss ? '#dc2626' : isEnemyMonster ? '#ef4444' : '#d4aa48'}
          className="rpg-glass-panel rounded-xl overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.92)]"
        >
          {/* Header */}
          <div
            className="px-4 py-3 border-b flex items-center justify-between gap-3 bg-black/35"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <TokenPortrait
                name={displayName}
                imageUrl={tok.imageUrl}
                playerColor={tok.color}
                frameStyle={tok.frameStyle || (mon?.isBoss ? 'crimson' : 'gold')}
                sizePx={56}
                isDead={tok.hp <= 0}
                iconHint={mon?.type || char?.classId}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-display text-amber-300/80">
                  <Eye className="w-3 h-3" /> Inspecionar Criatura
                </div>
                <h2 className="font-chronicle font-black text-xl truncate chronicle-gold-text">
                  {displayName}
                </h2>
                <div className="text-[11px] opacity-80 truncate">{subtitle}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInspectTarget(null)}
              className="rpg-card p-1.5 rounded cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3 text-xs max-h-[68vh] overflow-y-auto">
            {/* Vital Stats Row */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rpg-socket rounded-lg p-2">
                <div className="text-[10px] opacity-70 flex items-center justify-center gap-1">
                  <Heart className="w-3 h-3 text-red-400" /> Vitalidade
                </div>
                <div
                  className={`font-display font-bold text-sm mt-0.5 ${
                    hideHpExplicit
                      ? 'text-slate-400'
                      : showExactStats
                        ? 'text-red-300'
                        : wound.colorClass
                  }`}
                >
                  {hideHpExplicit ? '??' : showExactStats ? `${tok.hp} / ${tok.maxHp}` : wound.label}
                </div>
              </div>
              <div className="rpg-socket rounded-lg p-2">
                <div className="text-[10px] opacity-70 flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3 text-amber-400" /> C.A.
                </div>
                <div className="font-display font-bold text-sm text-amber-200 mt-0.5">
                  {hideAc ? '??' : charStats ? charStats.defense : tok.defense}
                </div>
              </div>
              <div className="rpg-socket rounded-lg p-2">
                <div className="text-[10px] opacity-70 flex items-center justify-center gap-1">
                  <Skull className="w-3 h-3 text-slate-300" /> Porte
                </div>
                <div className="font-display font-bold text-sm text-slate-200 mt-0.5">
                  {mon?.size || (tok.size > 1 ? 'Grande' : 'Médio')}
                </div>
              </div>
            </div>

            {/* Active Conditions */}
            <div className="rpg-card rounded-lg p-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider font-display font-bold text-amber-300">
                Condições Ativas ({activeConds.length})
              </div>
              {activeConds.length === 0 ? (
                <div className="text-[11px] italic opacity-60">Nenhuma condição ativa no momento.</div>
              ) : (
                <div className="space-y-1">
                  {activeConds.map((c) => (
                    <div key={c.id} className="rpg-socket rounded px-2.5 py-1.5">
                      <div className="font-display font-bold text-amber-100">
                        {c.icon} {c.name}
                      </div>
                      <div className="text-[10px] opacity-75">{c.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Resistances / Immunities / Vulnerabilities */}
            <div className="rpg-card rounded-lg p-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider font-display font-bold text-amber-300">
                Resistências &amp; Afinidades Elementais
              </div>
              {hideThisName ? (
                <span className="italic opacity-60">Afinidades desconhecidas.</span>
              ) : (
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {resistances.map((r) => (
                    <span key={`r-${r}`} className="px-2 py-0.5 rounded bg-sky-950/80 border border-sky-400/50 text-sky-200">
                      ½ Resistente: {r}
                    </span>
                  ))}
                  {immunities.map((im) => (
                    <span key={`i-${im}`} className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-400/50 text-emerald-200">
                      0 Imune: {im}
                    </span>
                  ))}
                  {vulnerabilities.map((v) => (
                    <span key={`v-${v}`} className="px-2 py-0.5 rounded bg-red-950/80 border border-red-400/50 text-red-200">
                      2× Vulnerável: {v}
                    </span>
                  ))}
                  {resistances.length === 0 && immunities.length === 0 && vulnerabilities.length === 0 && (
                    <span className="italic opacity-60">Sem resistências ou vulnerabilidades conhecidas.</span>
                  )}
                </div>
              )}
            </div>

            {/* Public Description / Lore */}
            {publicDesc && (
              <div className="rpg-card rounded-lg p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wider font-display font-bold text-amber-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Aparência &amp; Conhecimento
                </div>
                <p className="font-lore text-sm leading-relaxed opacity-90">{publicDesc}</p>
              </div>
            )}
          </div>
        </OrnateFrame>
      </div>
    </div>
  );
};
