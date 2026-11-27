import React, { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { CampaignProvider, useCampaign } from './context/CampaignContext';
import { ActiveModalType, TopHeader } from './components/TopHeader';
import { InitiativeBar } from './components/InitiativeBar';
import { StageCanvas } from './components/StageCanvas';
import { RightSidebar } from './components/RightSidebar';
import { CharacterSheetModal } from './components/CharacterSheetModal';
import { InspectEntityModal } from './components/InspectEntityModal';
import { LootChestModal } from './components/LootChestModal';
import { CompendiumModal } from './components/CompendiumModal';
import { GMShieldModal } from './components/GMShieldModal';
import { DiaryModal } from './components/DiaryModal';
import { QuestLogModal } from './components/QuestLogModal';
import { SoundboardModal } from './components/SoundboardModal';
import { LobbyScreen } from './components/LobbyScreen';
import { PlayerCharacterSetupModal } from './components/PlayerCharacterSetupModal';
import { PolyhedralDiceOverlay } from './components/PolyhedralDiceOverlay';
import { CinematicOverlays } from './components/CinematicOverlays';
import { CombatDuelOverlay } from './components/CombatDuelOverlay';
import { InitiativeCeremonyOverlay } from './components/InitiativeCeremonyOverlay';
import { PlayerActionHUD } from './components/PlayerActionHUD';
import { EntitySheetHost } from './components/EntitySheetModal';
import { OrnateFrame } from './components/OrnateFrame';
import { PromptDialogHost } from './components/PromptDialog';

const HandoutOverlay: React.FC = () => {
  const { activeHandout, dismissHandout, resolveAssetUrl } = useCampaign();

  useEffect(() => {
    if (!activeHandout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissHandout();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeHandout, dismissHandout]);

  if (!activeHandout) return null;

  const isSecret = Boolean(
    activeHandout.targetPlayerName ||
      (activeHandout.recipientCharacterIds &&
        activeHandout.recipientCharacterIds.length > 0)
  );

  return (
    <div
      data-modal-overlay="true"
      data-sub-overlay="true"
      className="fixed inset-0 z-[65] bg-[#040508]/82 backdrop-blur-[3px] flex items-center justify-center p-4"
      onClick={dismissHandout}
    >
      <OrnateFrame
        accentColor={isSecret ? '#9561ce' : '#b89146'}
        cornerSize={16}
        className="rpg-panel rpg-grain rounded-lg max-w-xl w-full overflow-hidden animate-modal-unfurl"
      >
        <div onClick={(e) => e.stopPropagation()}>
          <div
            className="px-5 py-3.5 border-b flex items-start justify-between gap-3 bg-[#0d0f16]"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="min-w-0">
              {isSecret && (
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded bg-[#231934] text-[#d5bdf5] border border-[#9561ce]/45 font-display font-semibold mb-1.5">
                  <Eye className="w-3 h-3" />
                  <span>
                    Sussurro Secreto — Somente você percebeu
                    {activeHandout.targetPlayerName ? ` (${activeHandout.targetPlayerName})` : ''}
                  </span>
                </span>
              )}
              <h3 className="font-display font-bold text-lg chronicle-gold-text">
                {activeHandout.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={dismissHandout}
              className="rpg-card w-8 h-8 rounded flex items-center justify-center text-[#a69b88] hover:text-[#ece4d5] cursor-pointer shrink-0"
              title="Fechar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4 bg-[#090b10]">
            {activeHandout.imageUrl && (
              <div
                className="rounded overflow-hidden border bg-black/50"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <img
                  src={resolveAssetUrl(activeHandout.imageUrl)}
                  alt={activeHandout.title}
                  className="w-full max-h-[54vh] object-contain"
                />
              </div>
            )}

            {activeHandout.text && (
              <div className="rpg-well rounded p-4 font-lore text-base leading-relaxed whitespace-pre-wrap text-[#ece4d5]">
                {activeHandout.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={dismissHandout}
                className="rpg-btn-primary px-4 py-1.5 rounded text-xs cursor-pointer"
              >
                Fechar Pista
              </button>
            </div>
          </div>
        </div>
      </OrnateFrame>
    </div>
  );
};

const TabletopWorkspace: React.FC = () => {
  const [activeModal, setActiveModal] = useState<ActiveModalType>(null);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const { loading, inLobby, role, hasGmPrivilege, myCharacter, pendingManualRoll, activeHandout } =
    useCampaign();

  // Global desktop RPG shortcuts: C = Sheet, Tab = Chronicle Drawer, Esc = Close Modal
  useEffect(() => {
    if (loading || inLobby) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape' && activeModal) {
        if (
          pendingManualRoll ||
          activeHandout ||
          document.querySelector('[data-prompt-dialog="true"], [data-sub-overlay="true"]')
        ) {
          return;
        }
        e.preventDefault();
        setActiveModal(null);
        return;
      }

      if (isEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[data-prompt-dialog="true"]')) return;

      if (e.key === 'Tab' && !activeModal) {
        if (document.querySelector('[data-modal-overlay="true"]')) return;
        e.preventDefault();
        setChronicleOpen((v) => !v);
        return;
      }

      if ((e.key === 'c' || e.key === 'C') && !e.repeat) {
        if (!activeModal && document.querySelector('[data-modal-overlay="true"]')) return;
        e.preventDefault();
        setActiveModal((curr) => (curr === 'sheet' ? null : 'sheet'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, inLobby, activeModal, pendingManualRoll, activeHandout]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-2.5 bg-[#08090d]">
        <div className="font-chronicle font-black text-3xl tracking-[0.24em] chronicle-gold-text">
          CHRONICLES
        </div>
        <div className="font-lore italic text-sm text-[#a69b88]">
          Abrindo os tomos da campanha...
        </div>
      </div>
    );
  }

  if (inLobby) {
    return <LobbyScreen />;
  }

  const needsCharacterOnboarding = role === 'player' && !hasGmPrivilege && !myCharacter;

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-[#07080c]">
      {/* Full-bleed tactical map fills 100% of the viewport */}
      <main className="fixed inset-0 flex overflow-hidden">
        <StageCanvas />
      </main>

      {/* Slim anchored 44px top chrome */}
      <TopHeader activeModal={activeModal} setActiveModal={setActiveModal} />

      {/* Floating Initiative Rail (renders only during active combat) */}
      <InitiativeBar />

      {/* Unified Right Chronicle Drawer (Combat Log + Dice + RP Chat) */}
      <RightSidebar
        open={chronicleOpen}
        onOpen={() => setChronicleOpen(true)}
        onClose={() => setChronicleOpen(false)}
      />

      {/* Bottom Anchored Action Hotbar (Player) / Tactical Command Dock (GM) */}
      <PlayerActionHUD
        onOpenSheet={() => setActiveModal('sheet')}
        diceDrawerOpen={chronicleOpen}
        onToggleDiceDrawer={() => setChronicleOpen((v) => !v)}
      />

      <LootChestModal />
      <InspectEntityModal />

      {activeModal === 'sheet' && (
        <CharacterSheetModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'compendium' && (
        <CompendiumModal mode="rules" onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'bestiary' && (
        <CompendiumModal mode="bestiary" onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'npcs' && (
        <DiaryModal mode="npcs" onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'gm-shield' && (
        <GMShieldModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'diary' && (
        <DiaryModal mode="diary" onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'quests' && (
        <QuestLogModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'soundboard' && (
        <SoundboardModal onClose={() => setActiveModal(null)} />
      )}

      {needsCharacterOnboarding ? (
        <PlayerCharacterSetupModal />
      ) : (
        <>
          <CinematicOverlays />
          <InitiativeCeremonyOverlay />
          <CombatDuelOverlay />
          <PolyhedralDiceOverlay />
          <HandoutOverlay />
        </>
      )}
    </div>
  );
};

export function App() {
  return (
    <CampaignProvider>
      <TabletopWorkspace />
      <EntitySheetHost />
      <PromptDialogHost />
    </CampaignProvider>
  );
}

export default App;
