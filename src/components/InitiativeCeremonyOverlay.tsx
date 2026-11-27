import React, { useEffect, useMemo, useState } from 'react';
import { Crown, Dices, Swords } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { formatSigned, maskHiddenNameForRole } from '../shared/rulesEngine';
import { OrnateDivider, OrnateFrame } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

export const InitiativeCeremonyOverlay: React.FC = () => {
  const { campaign, role, initiativeCeremony, showInitiativeCeremony } = useCampaign();
  const [stage, setStage] = useState<'rolling' | 'revealed' | 'sorted'>('rolling');
  const [tickRolls, setTickRolls] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!initiativeCeremony) return;
    setStage('rolling');

    const interval = window.setInterval(() => {
      const next: Record<string, number> = {};
      initiativeCeremony.entries.forEach((e) => {
        next[e.id] = Math.floor(Math.random() * 20) + 1;
      });
      setTickRolls(next);
    }, 65);

    const t1 = window.setTimeout(() => {
      window.clearInterval(interval);
      setStage('revealed');
    }, 950);

    const t2 = window.setTimeout(() => {
      setStage('sorted');
    }, 1550);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [initiativeCeremony]);

  const orderedEntries = useMemo(() => {
    if (!initiativeCeremony) return [];
    if (stage === 'sorted') {
      return [...initiativeCeremony.entries].sort((a, b) => b.total - a.total);
    }
    return initiativeCeremony.entries;
  }, [initiativeCeremony, stage]);

  if (!initiativeCeremony) return null;

  return (
    <div
      data-modal-overlay="true"
      className="fixed inset-0 z-[73] bg-[#040508]/84 backdrop-blur-[3px] flex items-center justify-center p-4"
    >
      <OrnateFrame
        accentColor="#b89146"
        cornerSize={16}
        className="rpg-panel rpg-grain rounded-lg max-w-2xl w-full p-6 space-y-4 animate-herald-unfurl"
      >
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 text-[#d4ad5c] font-display font-bold text-[11px] uppercase tracking-[0.24em]">
            <Swords className="w-3.5 h-3.5" />
            <span>O Combate Começou</span>
            <Swords className="w-3.5 h-3.5" />
          </div>
          <h2 className="font-chronicle font-black text-3xl chronicle-gold-text">
            Ordem de Iniciativa
          </h2>
          <p className="font-lore italic text-base text-[#a69b88]">
            {stage === 'rolling'
              ? 'Rolando o d20 do destino para todos os combatentes...'
              : stage === 'revealed'
              ? 'Calculando reflexos e ordenando a fila de combate...'
              : 'Ordem de turnos definida.'}
          </p>
        </div>

        <OrnateDivider />

        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {orderedEntries.map((entry, idx) => {
            const isFirst = stage === 'sorted' && idx === 0;
            const shownD20 = stage === 'rolling' ? tickRolls[entry.id] || entry.d20Roll : entry.d20Roll;
            const shownTotal = stage === 'rolling' ? shownD20 + entry.bonus : entry.total;
            const entryTokId = entry.id.startsWith('cer-') ? entry.id.slice(4) : undefined;
            const displayEntryName = maskHiddenNameForRole(entry.name, role, campaign, entryTokId);

            return (
              <div
                key={entry.id}
                style={{ transitionDelay: stage === 'sorted' ? `${idx * 45}ms` : '0ms' }}
                className={`rpg-card rounded px-4 py-2.5 flex items-center justify-between gap-3 transition-all duration-500 ${
                  isFirst
                    ? 'border-[#d4ad5c] bg-[#221c12]'
                    : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded flex items-center justify-center font-mono-dice font-bold text-xs shrink-0 ${
                      isFirst
                        ? 'bg-[#d4ad5c] text-[#140e04]'
                        : 'rpg-socket text-[#d4ad5c]'
                    }`}
                  >
                    {stage === 'sorted' ? (isFirst ? <Crown className="w-4 h-4" /> : `${idx + 1}º`) : '—'}
                  </div>

                  <TokenPortrait
                    name={displayEntryName}
                    imageUrl={entry.imageUrl}
                    playerColor={entry.color}
                    frameStyle={entry.frameStyle || (entry.type === 'character' ? 'gold' : 'crimson')}
                    sizePx={40}
                  />

                  <div className="min-w-0">
                    <div className="font-display font-bold text-sm truncate flex items-center gap-2 text-[#ece4d5]">
                      <span>{displayEntryName}</span>
                      {isFirst && (
                        <span className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] bg-[#2c2313] text-[#e8c683] border border-[#b89146]/55">
                          Age Primeiro
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono-dice text-[#a69b88]">
                      d20 ({shownD20}) {formatSigned(entry.bonus)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <Dices
                    className={`w-4 h-4 ${
                      stage === 'rolling' ? 'animate-dice-rolling text-[#d4ad5c]' : 'text-[#6c6457]'
                    }`}
                  />
                  <span
                    className="font-mono-dice font-black text-2xl w-10 text-right"
                    style={{ color: isFirst ? '#e8c683' : entry.color }}
                  >
                    {shownTotal}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => showInitiativeCeremony(null)}
            className="rpg-btn-primary px-8 py-2.5 rounded text-xs inline-flex items-center gap-2 cursor-pointer"
          >
            {stage === 'sorted' && <Swords className="w-4 h-4" />}
            <span>{stage === 'sorted' ? 'Começar Batalha' : 'Continuar'}</span>
          </button>
        </div>
      </OrnateFrame>
    </div>
  );
};
