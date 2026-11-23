import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Flame,
  Heart,
  ScrollText,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Trash2,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { CombatLogEntry } from '../shared/types';
import { DraggablePanel, DragGripBadge } from './DraggablePanel';
import { OrnateFrame } from './OrnateFrame';

const getEntityColorClass = (kind?: CombatLogEntry['actorKind']) => {
  if (kind === 'monster') return 'text-red-400 font-bold';
  if (kind === 'npc') return 'text-amber-300 font-bold';
  if (kind === 'hero') return 'text-sky-300 font-bold';
  return 'text-slate-300 font-semibold';
};

const getCategoryIcon = (cat: CombatLogEntry['category']) => {
  switch (cat) {
    case 'attack':
    case 'damage':
      return <Swords className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
    case 'heal':
      return <Heart className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />;
    case 'condition':
      return <Shield className="w-3 h-3 text-violet-400 shrink-0 mt-0.5" />;
    case 'death':
      return <Skull className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />;
    case 'revive':
      return <Sparkles className="w-3 h-3 text-emerald-300 shrink-0 mt-0.5" />;
    case 'spell':
      return <Flame className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />;
    case 'xp':
    case 'levelup':
      return <Sparkles className="w-3 h-3 text-amber-300 shrink-0 mt-0.5" />;
    default:
      return <ScrollText className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />;
  }
};

export const CombatLogWidget: React.FC = () => {
  const { campaign, role, updateCampaign } = useCampaign();
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'combat' | 'effects'>('all');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const entries = campaign.combatLog || [];
  const filtered = entries.filter((e) => {
    if (filter === 'combat') {
      return e.category === 'attack' || e.category === 'damage' || e.category === 'death' || e.category === 'revive' || e.category === 'spell';
    }
    if (filter === 'effects') {
      return e.category === 'condition' || e.category === 'heal' || e.category === 'xp' || e.category === 'levelup';
    }
    return true;
  });

  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, collapsed]);

  return (
    <DraggablePanel
      storageKey="bg3-combat-log"
      className="fixed bottom-20 right-3 z-25 pointer-events-auto"
    >
      {collapsed ? (
        <div className="flex items-center gap-1">
          <DragGripBadge />
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="rpg-glass-panel px-3 py-1.5 rounded-lg border border-amber-500/45 shadow-xl flex items-center gap-1.5 text-xs font-display font-bold text-amber-200 hover:border-amber-400 cursor-pointer transition"
            title="Expandir Registro de Combate (estilo BG3)"
          >
            <ScrollText className="w-3.5 h-3.5 text-amber-400" />
            <span>Registro ({entries.length})</span>
            <ChevronUp className="w-3.5 h-3.5 opacity-75" />
          </button>
        </div>
      ) : (
        <OrnateFrame
          accentColor="#b89242"
          cornerSize={12}
          className="rpg-glass-panel rounded-lg w-[300px] sm:w-[330px] shadow-[0_18px_45px_rgba(0,0,0,0.88)] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div
            className="px-2.5 py-1.5 border-b flex items-center justify-between gap-1.5 bg-black/35"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <DragGripBadge />
              <ScrollText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-display font-bold text-[11px] uppercase tracking-wider text-amber-200 truncate">
                Registro de Combate
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {role === 'gm' && entries.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateCampaign((prev) => ({ ...prev, combatLog: [] }))}
                  className="p-1 rounded hover:bg-red-950/60 text-red-300/80 hover:text-red-200 cursor-pointer"
                  title="Limpar registro"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="p-1 rounded hover:bg-white/10 text-amber-200 cursor-pointer"
                title="Recolher"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div
            className="px-2 py-1 border-b flex items-center gap-1 text-[10px] bg-black/20"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {(
              [
                { id: 'all', label: 'Tudo' },
                { id: 'combat', label: 'Combate' },
                { id: 'effects', label: 'Cura / Efeitos / XP' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-2 py-0.5 rounded font-display font-semibold cursor-pointer transition ${
                  filter === f.id
                    ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                    : 'opacity-65 hover:opacity-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Log Feed */}
          <div
            ref={scrollRef}
            className="max-h-[210px] overflow-y-auto px-2.5 py-2 space-y-1.5 text-[11px] leading-snug"
          >
            {filtered.length === 0 ? (
              <div className="text-center italic opacity-55 py-5 font-lore text-xs">
                As ações de combate, magias, condições, mortes e XP aparecerão aqui.
              </div>
            ) : (
              filtered.slice(-80).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-1.5 px-1.5 py-1 rounded bg-black/25 hover:bg-black/45 transition border border-white/5"
                  title={entry.detail || entry.summary}
                >
                  {getCategoryIcon(entry.category)}
                  <div className="min-w-0 flex-1">
                    <span
                      className={getEntityColorClass(entry.actorKind)}
                      style={
                        entry.actorKind === 'hero' && entry.actorColor
                          ? { color: entry.actorColor }
                          : undefined
                      }
                    >
                      {entry.actorName}
                    </span>{' '}
                    <span
                      className={
                        entry.category === 'death'
                          ? 'text-red-300 font-semibold'
                          : entry.category === 'heal' || entry.category === 'revive'
                            ? 'text-emerald-200'
                            : entry.category === 'condition'
                              ? 'text-violet-200'
                              : entry.category === 'xp' || entry.category === 'levelup'
                                ? 'text-amber-200 font-semibold'
                                : 'text-slate-200'
                      }
                    >
                      {entry.summary}
                    </span>
                    {entry.targetName && (
                      <>
                        {' '}
                        <span
                          className={getEntityColorClass(entry.targetKind)}
                          style={
                            entry.targetKind === 'hero' && entry.targetColor
                              ? { color: entry.targetColor }
                              : undefined
                          }
                        >
                          {entry.targetName}
                        </span>
                      </>
                    )}
                    {entry.detail && (
                      <div className="text-[10px] opacity-65 font-mono-dice truncate">
                        {entry.detail}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </OrnateFrame>
      )}
    </DraggablePanel>
  );
};
