import React, { useState } from 'react';
import { X } from 'lucide-react';
import { CampaignProvider, useCampaign } from './context/CampaignContext';
import { ActiveModalType, TopHeader } from './components/TopHeader';
import { InitiativeBar } from './components/InitiativeBar';
import { StageCanvas } from './components/StageCanvas';
import { RightSidebar } from './components/RightSidebar';
import { CharacterSheetModal } from './components/CharacterSheetModal';
import { CombatLogWidget } from './components/CombatLogWidget';
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
import { PromptDialogHost } from './components/PromptDialog';

const HandoutOverlay: React.FC = () => {
  const { activeHandout, dismissHandout, resolveAssetUrl } = useCampaign();
  if (!activeHandout) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={dismissHandout}
    >
      <div
        className="rpg-glass-panel rounded-2xl max-w-xl w-full p-5 space-y-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            {activeHandout.targetPlayerName && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                Sussurro Privado ({activeHandout.targetPlayerName})
              </span>
            )}
            <h3 className="font-display font-bold text-xl mt-1" style={{ color: 'var(--accent-primary)' }}>
              {activeHandout.title}
            </h3>
          </div>
          <button onClick={dismissHandout} className="rpg-card p-1.5 rounded cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {activeHandout.imageUrl && (
          <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-subtle)' }}>
            <img
              src={resolveAssetUrl(activeHandout.imageUrl)}
              alt={activeHandout.title}
              className="w-full max-h-[55vh] object-contain bg-black/40"
            />
          </div>
        )}

        {activeHandout.text && (
          <div className="rpg-card rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {activeHandout.text}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={dismissHandout}
            className="rpg-btn-primary px-4 py-1.5 rounded text-xs cursor-pointer"
          >
            Fechar Pista
          </button>
        </div>
      </div>
    </div>
  );
};

const TabletopWorkspace: React.FC = () => {
  const [activeModal, setActiveModal] = useState<ActiveModalType>(null);
  const [diceDrawerOpen, setDiceDrawerOpen] = useState(false);
  const { loading, inLobby, role, myCharacter } = useCampaign();

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-2 bg-[#06070c]">
        <div className="font-chronicle font-black text-3xl tracking-[0.22em] chronicle-gold-text">
          CHRONICLES
        </div>
        <div className="font-lore italic text-sm text-amber-200/70">
          Abrindo os tomos da campanha...
        </div>
      </div>
    );
  }

  if (inLobby) {
    return <LobbyScreen />;
  }

  const needsCharacterOnboarding = role === 'player' && !myCharacter;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden relative">
      <TopHeader activeModal={activeModal} setActiveModal={setActiveModal} />
      <InitiativeBar />

      <main className="flex-1 flex min-h-0 overflow-hidden relative z-10">
        <StageCanvas />
      </main>

      <RightSidebar open={diceDrawerOpen} onClose={() => setDiceDrawerOpen(false)} />

      <PlayerActionHUD
        onOpenSheet={() => setActiveModal('sheet')}
        diceDrawerOpen={diceDrawerOpen}
        onToggleDiceDrawer={() => setDiceDrawerOpen((v) => !v)}
      />
      <CombatLogWidget />
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
