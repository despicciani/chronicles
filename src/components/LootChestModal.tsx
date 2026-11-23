import React, { useState } from 'react';
import { Coins, Package, Plus, Sparkles, Trash2, Users, X } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { OrnateFrame } from './OrnateFrame';
import { soundEngine } from '../utils/soundEngine';

export const LootChestModal: React.FC = () => {
  const { campaign, role, myCharacter, updateCampaign, pushCombatLog } = useCampaign();
  const [addItemId, setAddItemId] = useState(campaign.compendium.items[0]?.id || '');
  const [addQty, setAddQty] = useState(1);
  const [addGold, setAddGold] = useState(50);

  const chest = campaign.activeLootChest;
  if (!chest || !chest.open) return null;

  const canClaim = role === 'player' && Boolean(myCharacter);

  const claimItem = (lootItemId: string) => {
    if (!myCharacter) return;
    const target = chest.items.find((i) => i.id === lootItemId);
    if (!target || target.claimedBy) return;
    const itemDef = campaign.compendium.items.find((i) => i.id === target.itemId);

    soundEngine.playSfxPreset('coin');
    updateCampaign((prev) => {
      if (!prev.activeLootChest) return prev;
      const curItem = prev.activeLootChest.items.find((i) => i.id === lootItemId);
      if (!curItem || curItem.claimedBy) return prev;
      return {
        ...prev,
        characters: prev.characters.map((c) => {
          if (c.id !== myCharacter.id) return c;
          const existing = c.inventory.find((inv) => inv.itemId === curItem.itemId && !inv.equipped);
          return {
            ...c,
            inventory: existing
              ? c.inventory.map((inv) =>
                  inv.id === existing.id
                    ? { ...inv, quantity: inv.quantity + curItem.quantity }
                    : inv
                )
              : [
                  ...c.inventory,
                  {
                    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    itemId: curItem.itemId,
                    quantity: curItem.quantity,
                    equipped: false,
                  },
                ],
          };
        }),
        activeLootChest: {
          ...prev.activeLootChest,
          items: prev.activeLootChest.items.map((i) =>
            i.id === lootItemId ? { ...i, claimedBy: myCharacter.name } : i
          ),
        },
      };
    });

    pushCombatLog({
      category: 'system',
      actorName: myCharacter.name,
      actorKind: 'hero',
      actorColor: myCharacter.playerColor || myCharacter.tokenColor,
      summary: `pegou ${target.quantity}× ${itemDef?.name || 'Item'} do ${chest.title}`,
    });
  };

  const claimGold = (splitParty: boolean) => {
    if (chest.gold <= 0 || chest.goldClaimedBy) return;
    soundEngine.playSfxPreset('coin');

    if (splitParty && campaign.characters.length > 0) {
      const share = Math.max(1, Math.floor(chest.gold / campaign.characters.length));
      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) => ({ ...c, gold: (c.gold || 0) + share })),
        activeLootChest: prev.activeLootChest
          ? { ...prev.activeLootChest, gold: 0, goldClaimedBy: `Dividido (+${share} PO cada)` }
          : null,
      }));
      pushCombatLog({
        category: 'system',
        actorName: 'Grupo',
        actorKind: 'system',
        summary: `dividiu ${chest.gold} PO do ${chest.title} (+${share} PO para cada herói)`,
      });
    } else if (myCharacter) {
      const amt = chest.gold;
      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === myCharacter.id ? { ...c, gold: (c.gold || 0) + amt } : c
        ),
        activeLootChest: prev.activeLootChest
          ? { ...prev.activeLootChest, gold: 0, goldClaimedBy: myCharacter.name }
          : null,
      }));
      pushCombatLog({
        category: 'system',
        actorName: myCharacter.name,
        actorKind: 'hero',
        actorColor: myCharacter.playerColor || myCharacter.tokenColor,
        summary: `pegou ${amt} PO do ${chest.title}`,
      });
    }
  };

  const closeChest = () => {
    updateCampaign((prev) => ({ ...prev, activeLootChest: null }));
  };

  return (
    <div className="fixed inset-0 z-[72] bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto">
      <div className="w-full max-w-lg animate-modal-unfurl">
        <OrnateFrame
          accentColor="#eab308"
          className="rpg-glass-panel rounded-xl overflow-hidden flex flex-col shadow-[0_24px_70px_rgba(0,0,0,0.92)]"
        >
          {/* Header */}
          <div
            className="px-4 py-3 border-b flex items-center justify-between gap-2 bg-gradient-to-r from-amber-950/60 via-black/40 to-amber-950/60"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <h2 className="font-chronicle font-black text-lg chronicle-gold-text truncate">
                  {chest.title}
                </h2>
                <p className="text-[11px] opacity-75">
                  {role === 'gm'
                    ? 'Adicione ouro/itens ao vivo ou feche o baú quando terminarem.'
                    : 'Clique em Pegar para enviar o saque direto para sua mochila!'}
                </p>
              </div>
            </div>
            {role === 'gm' && (
              <button
                type="button"
                onClick={closeChest}
                className="rpg-card p-1.5 rounded text-amber-200 hover:border-amber-400 cursor-pointer"
                title="Fechar Baú para todos"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="p-4 space-y-3 max-h-[68vh] overflow-y-auto text-xs">
            {/* Gold Row */}
            <div className="rpg-card rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 border-amber-500/40">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="font-display font-bold text-sm text-amber-200">
                    {chest.gold > 0 ? `${chest.gold} PO (Ouro)` : 'Ouro recolhido'}
                  </div>
                  {chest.goldClaimedBy && (
                    <div className="text-[10px] text-emerald-300">
                      ✓ {chest.goldClaimedBy}
                    </div>
                  )}
                </div>
              </div>
              {chest.gold > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => claimGold(true)}
                    className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer"
                    title="Dividir igualmente entre todos os heróis da campanha"
                  >
                    <Users className="w-3.5 h-3.5" /> Dividir Grupo
                  </button>
                  {canClaim && (
                    <button
                      type="button"
                      onClick={() => claimGold(false)}
                      className="rpg-card px-2.5 py-1 rounded text-[11px] hover:border-amber-400 cursor-pointer"
                    >
                      Pegar Tudo
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Items List */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider font-display text-amber-300/80">
                Itens no Baú ({chest.items.length})
              </div>
              {chest.items.length === 0 ? (
                <div className="text-center italic opacity-60 py-4 font-lore">
                  Nenhum item colocado no baú ainda.
                </div>
              ) : (
                chest.items.map((entry) => {
                  const def = campaign.compendium.items.find((i) => i.id === entry.itemId);
                  return (
                    <div
                      key={entry.id}
                      className={`rpg-socket rounded-lg px-3 py-2 flex items-center justify-between gap-2 ${
                        entry.claimedBy ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="w-4 h-4 text-amber-300 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-display font-bold text-amber-100 truncate">
                            {entry.quantity}× {def?.name || 'Item'}
                          </div>
                          <div className="text-[10px] opacity-70 truncate">
                            {def?.type || 'Item'}
                            {def?.description ? ` • ${def.description}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {entry.claimedBy ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                            ✓ {entry.claimedBy}
                          </span>
                        ) : canClaim ? (
                          <button
                            type="button"
                            onClick={() => claimItem(entry.id)}
                            className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] cursor-pointer"
                          >
                            Pegar
                          </button>
                        ) : (
                          <span className="text-[10px] opacity-65">Disponível</span>
                        )}
                        {role === 'gm' && (
                          <button
                            type="button"
                            onClick={() =>
                              updateCampaign((prev) => ({
                                ...prev,
                                activeLootChest: prev.activeLootChest
                                  ? {
                                      ...prev.activeLootChest,
                                      items: prev.activeLootChest.items.filter((x) => x.id !== entry.id),
                                    }
                                  : null,
                              }))
                            }
                            className="p-1 rounded text-red-400 hover:bg-red-950/60 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* GM Live Add Controls */}
            {role === 'gm' && (
              <div className="pt-3 border-t border-white/10 space-y-2">
                <div className="text-[10px] uppercase tracking-wider font-display text-amber-300">
                  Adicionar ao Baú (Mestre)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <select
                    value={addItemId}
                    onChange={(e) => setAddItemId(e.target.value)}
                    className="rpg-input flex-1 min-w-[160px] py-1 text-xs"
                  >
                    {campaign.compendium.items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({it.type})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={addQty}
                    onChange={(e) => setAddQty(Math.max(1, Number(e.target.value) || 1))}
                    className="rpg-input w-14 py-1 text-center font-mono-dice"
                    title="Quantidade"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!addItemId) return;
                      updateCampaign((prev) => ({
                        ...prev,
                        activeLootChest: prev.activeLootChest
                          ? {
                              ...prev.activeLootChest,
                              items: [
                                ...prev.activeLootChest.items,
                                {
                                  id: `loot-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                                  itemId: addItemId,
                                  quantity: addQty,
                                },
                              ],
                            }
                          : null,
                      }));
                    }}
                    className="rpg-btn-primary px-2.5 py-1 rounded text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Item
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    value={addGold}
                    onChange={(e) => setAddGold(Math.max(1, Number(e.target.value) || 10))}
                    className="rpg-input w-24 py-1 text-center font-mono-dice"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateCampaign((prev) => ({
                        ...prev,
                        activeLootChest: prev.activeLootChest
                          ? {
                              ...prev.activeLootChest,
                              gold: (prev.activeLootChest.gold || 0) + addGold,
                              goldClaimedBy: undefined,
                            }
                          : null,
                      }))
                    }
                    className="rpg-card px-2.5 py-1 rounded text-xs hover:border-amber-400 cursor-pointer flex items-center gap-1"
                  >
                    <Coins className="w-3.5 h-3.5 text-amber-400" /> +Ouro
                  </button>
                </div>
              </div>
            )}
          </div>
        </OrnateFrame>
      </div>
    </div>
  );
};
