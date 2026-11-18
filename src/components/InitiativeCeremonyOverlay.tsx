import React, { useEffect, useMemo, useState } from 'react';
import { Crown, Dices, Swords } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { formatSigned } from '../shared/rulesEngine';
import { OrnateDivider, OrnateFrame } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

export const InitiativeCeremonyOverlay: React.FC = () => {
  const { initiativeCeremony, showInitiativeCeremony } = useCampaign();
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
    <div className="fixed inset-0 z-[73] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <OrnateFrame className="rpg-glass-panel rounded-lg max-w-2xl w-full p-6 space-y-4 animate-modal-unfurl shadow-2xl">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 text-amber-300 font-display font-bold text-xs uppercase tracking-[0.25em]">
            <Swords className="w-4 h-4" />
            <span>O Combate Começou!</span>
            <Swords className="w-4 h-4" />
          </div>
          <h2 className="font-chronicle font-black text-3xl chronicle-gold-text">
            Ordem de Iniciativa
          </h2>
          <p className="font-lore text-base" style={{ color: 'var(--text-secondary)' }}>
            {stage === 'rolling'
              ? 'Rolando o d20 do destino para todos os combatentes...'
              : stage === 'revealed'
              ? 'Calculando reflexos e ordenando a fila de combate...'
              : 'Ranking definido do maior para o menor!'}
          </p>
        </div>

        <OrnateDivider />

        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {orderedEntries.map((entry, idx) => {
            const isFirst = stage === 'sorted' && idx === 0;
            const shownD20 = stage === 'rolling' ? tickRolls[entry.id] || entry.d20Roll : entry.d20Roll;
            const shownTotal = stage === 'rolling' ? shownD20 + entry.bonus : entry.total;

            return (
              <div
                key={entry.id}
                className={`rpg-card rounded-md px-4 py-2.5 flex items-center justify-between gap-3 transition-all duration-500 ${
                  isFirst
                    ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_20px_rgba(245,158,11,0.3)] scale-[1.01]'
                    : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-md flex items-center justify-center font-chronicle font-bold text-sm shrink-0 ${
                      isFirst
                        ? 'bg-amber-400 text-black'
                        : 'rpg-socket text-amber-200'
                    }`}
                  >
                    {stage === 'sorted' ? (isFirst ? <Crown className="w-4 h-4" /> : `${idx + 1}º`) : '—'}
                  </div>

                  <TokenPortrait
                    name={entry.name}
                    imageUrl={entry.imageUrl}
                    playerColor={entry.color}
                    frameStyle={entry.frameStyle || (entry.type === 'character' ? 'gold' : 'crimson')}
                    sizePx={42}
                  />

                  <div className="min-w-0">
                    <div className="font-display font-bold text-sm truncate flex items-center gap-2">
                      <span>{entry.name}</span>
                      {isFirst && (
                        <span className="text-[10px] font-display px-2 py-0.5 rounded-xs bg-amber-950/75 text-amber-200 border border-amber-400/50">
                          Age Primeiro!
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono-dice" style={{ color: 'var(--text-secondary)' }}>
                      d20 ({shownD20}) {formatSigned(entry.bonus)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Dices
                    className={`w-5 h-5 ${
                      stage === 'rolling' ? 'animate-spin text-amber-400' : 'opacity-60'
                    }`}
                  />
                  <span
                    className="font-chronicle font-black text-2xl w-10 text-right"
                    style={{ color: isFirst ? '#facc15' : entry.color }}
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
            onClick={() => showInitiativeCeremony(null)}
            className="rpg-btn-primary px-8 py-2.5 rounded-xl text-sm cursor-pointer"
          >
            {stage === 'sorted' ? '⚔️ Começar Batalha!' : 'Continuar'}
          </button>
        </div>
      </OrnateFrame>
    </div>
  );
};
