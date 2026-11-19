import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  Dices,
  Music,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  buildPreviewDiceForFormula,
  computeCharacterStats,
  evaluateFormula,
  formatSigned,
} from '../shared/rulesEngine';
import { DraggablePanel, DragGripBadge } from './DraggablePanel';
import { OrnateDivider, OrnateFrame, SculptedHealthBar } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

export const CinematicOverlays: React.FC = () => {
  const {
    campaign,
    role,
    myCharacter,
    activeCharacterId,
    activeSkillCheck,
    submitSkillCheckResult,
    dismissSkillCheck,
    sendRoll,
    openManualRoll,
    activeReward,
    dismissReward,
    activeThemeBanner,
    mapBannerName,
    dismissMapBanner,
    announceBoss,
    resolveAssetUrl,
  } = useCampaign();

  const activeChar =
    role === 'player'
      ? myCharacter
      : campaign.characters.find((c) => c.id === activeCharacterId);

  const handleRollRequestedCheck = () => {
    if (!activeSkillCheck || !activeChar) return;
    const stats = computeCharacterStats(activeChar, campaign);
    const skill = campaign.compendium.skills.find(
      (s) => s.id === activeSkillCheck.skillOrAttrId
    );
    const attr = campaign.compendium.attributes.find(
      (a) => a.id === activeSkillCheck.skillOrAttrId
    );

    const bonus = skill
      ? stats.skills[skill.id]?.total ?? 0
      : attr
      ? stats.attributes[attr.id]?.mod ?? 0
      : 0;
    const formulaStr = `1d20 ${bonus >= 0 ? `+ ${bonus}` : `- ${Math.abs(bonus)}`}`;

    openManualRoll({
      title: `Teste Pedido: ${activeSkillCheck.label}`,
      subtitle: `Dificuldade: CD ${activeSkillCheck.dc}`,
      formula: formulaStr,
      displayFormula: formulaStr,
      previewDice: buildPreviewDiceForFormula('1d20', 'normal'),
      rollerName: activeChar.name,
      rollerColor: activeChar.playerColor || activeChar.tokenColor,
      diceSkin: activeChar.diceSkin || 'gold',
      allowAdvantageToggle: true,
      advantageMode: 'normal',
      onExecute: (chosenMode) => {
        const res = evaluateFormula(`1d20 + ${bonus}`, stats, activeChar, {
          advantageMode: chosenMode,
        });
        const passed = res.isCrit || (!res.isFumble && res.total >= activeSkillCheck.dc);

        sendRoll({
          rollerName: activeChar.name,
          rollerRole: role,
          rollerColor: activeChar.playerColor || activeChar.tokenColor,
          diceSkin: activeChar.diceSkin || 'gold',
          title: `Teste Pedido: ${activeSkillCheck.label}`,
          formula: res.resolvedFormula,
          individualRolls: res.individualRolls,
          rolledDice: res.rolledDice,
          d20Natural: res.d20Natural,
          total: res.total,
          isCrit: res.isCrit,
          isFumble: res.isFumble,
          isSecret: false,
          details: `${passed ? 'SUCESSO' : 'FALHA'} contra CD ${activeSkillCheck.dc} (${res.details})`,
        });

        submitSkillCheckResult({
          checkId: activeSkillCheck.id,
          characterId: activeChar.id,
          characterName: activeChar.name,
          playerColor: activeChar.playerColor || activeChar.tokenColor,
          total: res.total,
          d20: res.d20Natural,
          passed,
        });
      },
    });
  };

  const myResult = activeSkillCheck?.results.find(
    (r) => r.characterId === activeChar?.id
  );

  const activeBoss = campaign.activeBoss;
  const [bossMinimized, setBossMinimized] = useState(false);

  return (
    <>
      {/* 1. COMPACT GOTHIC BOSS BAR (Positioned bottom-right & Draggable!) */}
      {activeBoss && activeBoss.active && (
        <DraggablePanel
          storageKey="boss-fight-bar"
          className="fixed bottom-20 right-4 z-25 w-[310px] sm:w-[350px] pointer-events-auto"
        >
          {bossMinimized ? (
            <button
              onClick={() => setBossMinimized(false)}
              className="ml-auto rpg-glass-panel rounded-md px-3 py-1.5 flex items-center gap-2 border-red-500/60 shadow-xl cursor-pointer hover:border-amber-400"
              title="Expandir barra do Chefe"
            >
              <Crown className="w-3.5 h-3.5 text-red-400" />
              <span className="font-chronicle font-bold text-xs text-red-200 truncate max-w-[180px]">
                {activeBoss.name}
              </span>
              <ChevronUp className="w-3.5 h-3.5 text-amber-300" />
            </button>
          ) : (
            <OrnateFrame
              accentColor="#dc2626"
              cornerSize={14}
              className="rpg-glass-panel rounded-lg px-3.5 py-2 shadow-[0_14px_38px_rgba(180,25,25,0.45)] animate-modal-unfurl"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <TokenPortrait
                    name={activeBoss.name}
                    imageUrl={activeBoss.imageUrl}
                    playerColor={activeBoss.color || '#dc2626'}
                    frameStyle="crimson"
                    sizePx={36}
                    isDead={activeBoss.hp <= 0}
                  />
                  <div className="min-w-0">
                    <div className="font-chronicle font-black text-xs tracking-wider text-red-200 uppercase truncate">
                      {activeBoss.name}
                    </div>
                    <div className="text-[10px] font-display uppercase tracking-wider text-amber-300/80 truncate">
                      {activeBoss.title}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 text-[11px]">
                  <DragGripBadge />
                  {role === 'gm' && (
                    <>
                      <button
                        onClick={() =>
                          announceBoss({
                            ...activeBoss,
                            hp: Math.max(0, activeBoss.hp - 10),
                          })
                        }
                        className="px-1.5 py-0.5 rounded bg-red-950/85 border border-red-500/40 hover:bg-red-800 text-red-100 cursor-pointer"
                      >
                        -10
                      </button>
                      <button
                        onClick={() =>
                          announceBoss({
                            ...activeBoss,
                            hp: Math.min(activeBoss.maxHp, activeBoss.hp + 10),
                          })
                        }
                        className="px-1.5 py-0.5 rounded bg-emerald-950/85 border border-emerald-500/40 hover:bg-emerald-800 text-emerald-100 cursor-pointer"
                      >
                        +10
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setBossMinimized(true)}
                    className="rpg-card p-1 rounded text-amber-300 cursor-pointer"
                    title="Minimizar Barra de Chefe"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {role === 'gm' && (
                    <button
                      onClick={() => announceBoss(null)}
                      className="rpg-card p-1 rounded text-red-300 cursor-pointer"
                      title="Ocultar Barra de Chefe"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2">
                <SculptedHealthBar
                  hp={activeBoss.hp}
                  maxHp={activeBoss.maxHp}
                  variant="boss"
                  heightClass="h-2.5"
                  label={role === 'gm' ? `${activeBoss.hp} / ${activeBoss.maxHp} PV` : undefined}
                />
              </div>
            </OrnateFrame>
          )}
        </DraggablePanel>
      )}

      {/* 2. CINEMATIC LOCATION BANNER */}
      {mapBannerName && (
        <div
          key={mapBannerName}
          onClick={dismissMapBanner}
          title="Clique para fechar"
          className="fixed top-28 left-1/2 -translate-x-1/2 z-40 pointer-events-auto cursor-pointer animate-modal-unfurl"
        >
          <OrnateFrame
            accentColor="#d4aa48"
            cornerSize={18}
            className="rpg-glass-panel px-12 py-3 rounded-lg text-center shadow-2xl relative overflow-hidden"
          >
            <div className="text-[10px] font-display uppercase tracking-[0.3em] text-amber-300/80">
              Você Chegou a
            </div>
            <div className="font-chronicle font-bold text-2xl tracking-wider chronicle-gold-text mt-0.5">
              {mapBannerName}
            </div>
            <OrnateDivider className="mt-1.5" />
            <div className="absolute bottom-0 inset-x-0 h-0.5 bg-black/50">
              <div
                className="h-full animate-banner-drain"
                style={{ background: 'linear-gradient(90deg, #9a7020, #fde047)' }}
              />
            </div>
          </OrnateFrame>
        </div>
      )}

      {/* 3. CHARACTER THEME MUSIC PLAYING BANNER */}
      {activeThemeBanner && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-modal-unfurl">
          <OrnateFrame
            accentColor={activeThemeBanner.characterColor}
            cornerSize={14}
            className="rpg-glass-panel px-6 py-2.5 rounded-lg flex items-center gap-3 shadow-2xl"
          >
            <div
              className="w-8 h-8 rounded-md rpg-socket flex items-center justify-center"
            >
              <Music className="w-4 h-4" style={{ color: activeThemeBanner.characterColor }} />
            </div>
            <div>
              <div className="text-[10px] font-display uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                Tema Épico em Execução
              </div>
              <div className="font-display font-bold text-sm" style={{ color: activeThemeBanner.characterColor }}>
                {activeThemeBanner.characterName} — {activeThemeBanner.title}
              </div>
            </div>
          </OrnateFrame>
        </div>
      )}

      {/* 4. "O MESTRE PEDE UM TESTE!" POP-UP (#1) */}
      {activeSkillCheck && (
        <div className="fixed bottom-6 left-6 z-40 w-80 sm:w-96 pointer-events-auto animate-ui-enter">
          <div className="rpg-glass-panel rounded-2xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">
                    Chamado do Mestre
                  </div>
                  <h4 className="font-display font-bold text-base leading-tight">
                    Teste de {activeSkillCheck.label}
                  </h4>
                </div>
              </div>
              {role === 'gm' && (
                <button
                  onClick={dismissSkillCheck}
                  className="rpg-card p-1 rounded cursor-pointer"
                  title="Encerrar Pedido de Teste"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {role === 'gm' && (
              <div className="text-xs text-amber-300/90 font-semibold">
                Dificuldade (CD): {activeSkillCheck.dc}
              </div>
            )}

            {/* Giant 1-click button for player */}
            {activeChar && !myResult && (
              <button
                onClick={handleRollRequestedCheck}
                className="rpg-btn-primary w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              >
                <Dices className="w-5 h-5" />
                <span>
                  Rolar {activeSkillCheck.label} Agora (
                  {(() => {
                    const stats = computeCharacterStats(activeChar, campaign);
                    const sk = stats.skills[activeSkillCheck.skillOrAttrId];
                    const at = stats.attributes[activeSkillCheck.skillOrAttrId];
                    return formatSigned(sk ? sk.total : at ? at.mod : 0);
                  })()}
                  )
                </span>
              </button>
            )}

            {myResult && (
              <div
                className={`p-2.5 rounded-lg text-xs font-bold flex items-center justify-between ${
                  myResult.passed
                    ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-300'
                    : 'bg-red-950/60 border border-red-500/50 text-red-300'
                }`}
              >
                <span>Seu Resultado: {myResult.total}</span>
                <span className="flex items-center gap-1">
                  {myResult.passed ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> PASSOU!
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-4 h-4" /> FALHOU
                    </>
                  )}
                </span>
              </div>
            )}

            {/* Live Results Feed */}
            {activeSkillCheck.results.length > 0 && (
              <div className="space-y-1 pt-1 border-t max-h-36 overflow-y-auto" style={{ borderColor: 'var(--border-subtle)' }}>
                {activeSkillCheck.results.map((r) => (
                  <div
                    key={r.characterId}
                    className="flex items-center justify-between text-xs px-2 py-1 rounded bg-black/25"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: r.playerColor }}
                      />
                      <span className="font-semibold">{r.characterName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-dice font-bold">{r.total}</span>
                      <span className={r.passed ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                        {r.passed ? '✓' : '✕'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. MAGIC CARD REWARD ANIMATION (#2) */}
      {activeReward && (
        <div
          onClick={dismissReward}
          className="fixed inset-0 z-[75] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`rpg-glass-panel rpg-magic-card rarity-${activeReward.rarity} animate-card-reveal rounded-2xl max-w-sm w-full p-6 text-center space-y-3`}
          >
            <div className="text-xs uppercase tracking-[0.25em] font-bold text-amber-300 flex items-center justify-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              <span>Carta Recebida!</span>
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Para <strong>{activeReward.characterName}</strong>
            </div>
            <div className="py-3 px-4 rounded-xl bg-black/35 border border-amber-500/30">
              <h3 className="font-display font-extrabold text-2xl" style={{ color: 'var(--accent-primary)' }}>
                {activeReward.cardTitle}
              </h3>
              <div className="text-xs font-mono-dice text-amber-200 mt-1">
                {activeReward.cardSubtitle}
              </div>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {activeReward.description}
            </p>
            <div className="text-[10px] uppercase tracking-widest opacity-75">
              Raridade: {activeReward.rarity}
            </div>
            <button
              onClick={dismissReward}
              className="rpg-btn-primary w-full py-2 rounded-lg text-xs cursor-pointer"
            >
              Guardar na Ficha
            </button>
          </div>
        </div>
      )}
    </>
  );
};
