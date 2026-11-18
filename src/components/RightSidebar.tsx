import React, { useState } from 'react';
import {
  CheckCircle2,
  Dices,
  EyeOff,
  Heart,
  Send,
  ShieldAlert,
  Sparkles,
  Swords,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { computeCharacterStats } from '../shared/rulesEngine';
import { FormulaBuilderInput } from './FormulaBuilderInput';

interface RightSidebarProps {
  open: boolean;
  onClose: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({ open, onClose }) => {
  const {
    campaign,
    role,
    myCharacter,
    activeCharacterId,
    advantageMode,
    setAdvantageMode,
    secretRoll,
    setSecretRoll,
    quickRollFormula,
    applyDamage,
  } = useCampaign();

  const [customFormula, setCustomFormula] = useState('1d20 + FOR + PROF');

  const activeChar =
    role === 'player'
      ? myCharacter || campaign.characters[0]
      : campaign.characters.find((c) => c.id === activeCharacterId) ||
        campaign.characters[0];
  const activeStats = activeChar ? computeCharacterStats(activeChar, campaign) : null;

  if (!open) return null;

  const diceTypes = [4, 6, 8, 10, 12, 20, 100];

  const handleQuickDie = (sides: number) => {
    quickRollFormula(`Dado d${sides}`, `1d${sides}`);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFormula.trim()) return;
    quickRollFormula('Rolagem Customizada', customFormula.trim());
  };

  const visibleLogs = campaign.rollLog.filter((entry) => role === 'gm' || !entry.isSecret);

  return (
    <aside className="fixed top-16 right-3 bottom-24 z-35 w-80 sm:w-96 rpg-glass-panel rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-dice-tumble">
      {/* Header */}
      <div
        className="px-3.5 py-2.5 border-b flex items-center justify-between shrink-0"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <span className="text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5">
          <Dices className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          Dados &amp; Crônica da Mesa
        </span>
        <button
          onClick={onClose}
          className="rpg-card p-1 rounded-md hover:border-amber-400 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Dice Roller Tray */}
      <div
        className="p-3 border-b space-y-2.5 shrink-0"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Modo de d20:
          </span>
          <div className="flex rounded-md overflow-hidden border text-[11px]" style={{ borderColor: 'var(--border-subtle)' }}>
            <button
              onClick={() => setAdvantageMode('normal')}
              className={`px-2.5 py-0.5 cursor-pointer ${
                advantageMode === 'normal' ? 'rpg-btn-primary' : 'rpg-card'
              }`}
            >
              Normal
            </button>
            <button
              onClick={() => setAdvantageMode('advantage')}
              className={`px-2.5 py-0.5 cursor-pointer ${
                advantageMode === 'advantage' ? 'bg-emerald-600 text-white font-semibold' : 'rpg-card'
              }`}
            >
              Vant.
            </button>
            <button
              onClick={() => setAdvantageMode('disadvantage')}
              className={`px-2.5 py-0.5 cursor-pointer ${
                advantageMode === 'disadvantage' ? 'bg-red-600 text-white font-semibold' : 'rpg-card'
              }`}
            >
              Desv.
            </button>
          </div>
        </div>

        {/* Quick Dice Buttons */}
        <div className="grid grid-cols-7 gap-1">
          {diceTypes.map((d) => (
            <button
              key={d}
              onClick={() => handleQuickDie(d)}
              className="rpg-card hover:opacity-80 py-1.5 rounded-lg text-xs font-mono-dice font-bold text-center cursor-pointer transition active:scale-95"
              style={{ color: d === 20 ? 'var(--accent-primary)' : 'var(--text-primary)' }}
            >
              d{d}
            </button>
          ))}
        </div>

        {/* Formula Input with Visual + Autocomplete & 1-Click Modifier Chips */}
        <form onSubmit={handleCustomSubmit} className="space-y-1.5">
          <div className="flex items-start gap-1.5">
            <div className="flex-1 min-w-0">
              <FormulaBuilderInput
                value={customFormula}
                onChange={setCustomFormula}
                stats={activeStats}
                character={activeChar}
                placeholder="Ex: 1d20 + FOR (digite + para abrir opções)"
                dropdownPosition="bottom"
              />
            </div>
            <button
              type="submit"
              className="rpg-btn-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer shrink-0"
              title="Rolar Fórmula"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Secret GM Toggle */}
        {role === 'gm' && (
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={secretRoll}
              onChange={(e) => setSecretRoll(e.target.checked)}
              className="accent-amber-500"
            />
            <EyeOff className="w-3.5 h-3.5 text-purple-400" />
            <span style={{ color: 'var(--text-secondary)' }}>
              Rolagem Oculta (apenas Mestre)
            </span>
          </label>
        )}
      </div>

      {/* Interactive Feed / Combat Log */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {visibleLogs.map((entry) => {
          const isHeal = entry.damageType?.toLowerCase() === 'cura';
          return (
            <div
              key={entry.id}
              className={`rpg-card rounded-xl p-2.5 text-xs border transition ${
                entry.isSecret ? 'border-purple-500/50 bg-purple-950/20' : ''
              } ${entry.isCrit ? 'ring-1 ring-amber-400' : ''}`}
              style={
                entry.rollerColor && !entry.isSecret
                  ? { borderLeftWidth: '3px', borderLeftColor: entry.rollerColor }
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {entry.isSecret && <EyeOff className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                  <span className="font-bold truncate">{entry.rollerName}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    • {entry.timestamp}
                  </span>
                </div>
                <span className="font-mono-dice text-[10px] px-1.5 py-0.5 rounded bg-black/25">
                  {entry.formula}
                </span>
              </div>

              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="font-semibold" style={{ color: 'var(--accent-primary)' }}>
                  {entry.title}
                </div>
                <div className="flex items-center gap-1.5">
                  {entry.isCrit && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold text-[10px]">
                      CRÍTICO!
                    </span>
                  )}
                  {entry.isFumble && (
                    <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold text-[10px]">
                      FALHA CRÍTICA
                    </span>
                  )}
                  <span className="text-lg font-display font-extrabold leading-none">
                    {entry.total}
                  </span>
                </div>
              </div>

              {entry.targetName && (
                <div className="mt-1.5 flex items-center justify-between px-2 py-1 rounded bg-black/20">
                  <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Alvo: <strong>{entry.targetName}</strong> (CA {entry.targetDefense})
                  </span>
                  {entry.hitStatus === 'hit' && (
                    <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> ACERTOU!
                    </span>
                  )}
                  {entry.hitStatus === 'miss' && (
                    <span className="text-red-400 font-bold flex items-center gap-1 text-[11px]">
                      <ShieldAlert className="w-3.5 h-3.5" /> ERROU
                    </span>
                  )}
                </div>
              )}

              <div className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {entry.details}
              </div>

              {entry.damageTotal && entry.damageTotal > 0 && entry.targetTokenId && role === 'gm' && (
                <div className="mt-2 pt-2 border-t flex flex-wrap gap-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                  {isHeal ? (
                    <button
                      onClick={() =>
                        applyDamage(entry.targetTokenId!, entry.damageTotal!, true, entry.id)
                      }
                      disabled={entry.applied}
                      className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <Heart className="w-3 h-3" />
                      {entry.applied ? 'Cura Aplicada' : `Curar ${entry.damageTotal} PV`}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() =>
                          applyDamage(entry.targetTokenId!, entry.damageTotal!, false, entry.id)
                        }
                        disabled={entry.applied}
                        className="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      >
                        <Swords className="w-3 h-3" />
                        {entry.applied
                          ? 'Dano Aplicado'
                          : `Aplicar ${entry.damageTotal} (${entry.damageType || 'Dano'})`}
                      </button>
                      {!entry.applied && (
                        <button
                          onClick={() =>
                            applyDamage(
                              entry.targetTokenId!,
                              Math.floor(entry.damageTotal! / 2),
                              false,
                              entry.id
                            )
                          }
                          className="rpg-card px-2 py-1 rounded text-[11px] font-semibold hover:opacity-80 cursor-pointer"
                        >
                          Metade ({Math.floor(entry.damageTotal / 2)})
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {visibleLogs.length === 0 && (
          <div className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-50" />
            Nenhuma rolagem ainda. Clique em um dado acima!
          </div>
        )}
      </div>
    </aside>
  );
};
