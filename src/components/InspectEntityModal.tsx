import React, { useEffect, useState } from 'react';
import { Eye, Heart, Shield, Skull, Sparkles, X } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { computeCharacterStats, getMonsterWoundStatus } from '../shared/rulesEngine';
import { OrnateFrame } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

export function openInspectEntity(tokenId: string) {
  window.dispatchEvent(new CustomEvent('chronicle:inspect-entity', { detail: { tokenId } }));
}

export const InspectEntityModal: React.FC = () => {
  const { campaign, role } = useCampaign();
  const [tokenId, setTokenId] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<{ tokenId: string }>).detail;
      if (detail?.tokenId) setTokenId(detail.tokenId);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setTokenId(null);
    };
    window.addEventListener('chronicle:inspect-entity', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('chronicle:inspect-entity', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!tokenId) return null;
  const activeMap =
    campaign.maps.find((m) => m.id === campaign.activeMapId) || campaign.maps[0];
  const tok = activeMap?.tokens.find((t) => t.id === tokenId);
  if (!tok) return null;

  const char =
    tok.type === 'character' && tok.referenceId
      ? campaign.characters.find((c) => c.id === tok.referenceId)
      : undefined;
  const mon =
    tok.type === 'monster' && tok.referenceId
      ? campaign.compendium.monsters.find((m) => m.id === tok.referenceId)
      : undefined;
  const npc =
    tok.type === 'npc' && tok.referenceId
      ? campaign.npcs.find((n) => n.id === tok.referenceId)
      : undefined;

  const charStats = char ? computeCharacterStats(char, campaign) : null;
  const isEnemyMonster = tok.type === 'monster';
  const showExactStats = role === 'gm' || !isEnemyMonster;
  const hideAc =
    role !== 'gm' &&
    isEnemyMonster &&
    (tok.hideAcFromPlayers || campaign.settings.showEnemyAcToPlayers === false);

  const activeCondIds = char ? char.activeConditionIds : tok.activeConditionIds || [];
  const activeConds = activeCondIds
    .map((id) => campaign.compendium.conditions.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const resistances = char?.damageResistances || mon?.damageResistances || npc?.damageResistances || [];
  const immunities = char?.damageImmunities || mon?.damageImmunities || npc?.damageImmunities || [];
  const vulnerabilities =
    char?.damageVulnerabilities || mon?.damageVulnerabilities || npc?.damageVulnerabilities || [];

  const wound = getMonsterWoundStatus(tok.hp, tok.maxHp);
  const subtitle = char
    ? `Herói Nv ${char.level} • ${campaign.compendium.races.find((r) => r.id === char.raceId)?.name || ''} ${campaign.compendium.classes.find((c) => c.id === char.classId)?.name || ''}`
    : mon
      ? `${mon.type} • ${mon.size}${mon.isBoss ? ' • 👑 CHEFE' : ''}`
      : npc
        ? `${npc.role || 'NPC'} • ${npc.location || 'Campanha'}`
        : 'Criatura';

  const publicDesc = char?.background || mon?.description || npc?.publicBio || '';

  return (
    <div
      className="fixed inset-0 z-[88] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={() => setTokenId(null)}
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
                name={tok.name}
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
                  {tok.name}
                </h2>
                <div className="text-[11px] opacity-80 truncate">{subtitle}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTokenId(null)}
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
                    showExactStats ? 'text-red-300' : wound.colorClass
                  }`}
                >
                  {showExactStats ? `${tok.hp} / ${tok.maxHp}` : wound.label}
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
