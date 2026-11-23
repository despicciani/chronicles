import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { triggerHeroJsonDownload, useCampaign } from '../context/CampaignContext';
import {
  findNearestFreeGridCell,
  formatSigned,
  getAttrMod,
  parseHeroPayloadFromJson,
  PLAYER_COLOR_PALETTE,
} from '../shared/rulesEngine';
import { Character, DiceSkin, TokenFrameStyle } from '../shared/types';
import { FileUploadButton } from './FileUploadButton';
import { OrnateDivider, OrnateFrame } from './OrnateFrame';
import { openConfirmDialog } from './PromptDialog';
import { TokenPortrait } from './TokenPortrait';

export const PlayerCharacterSetupModal: React.FC = () => {
  const {
    campaign,
    setInLobby,
    myPlayerId,
    myPlayerName,
    myPlayerColor,
    setMyPlayerColor,
    updateCampaign,
    setActiveCharacterId,
    savedHeroes,
    refreshSavedHeroes,
    saveCharacterToVault,
    deleteSavedHero,
    importSavedHeroIntoCampaign,
    claimCampaignCharacter,
    connectedPlayers,
    pendingHeroJoinRequest,
    heroJoinFeedback,
    clearHeroJoinFeedback,
    cancelHeroJoinRequest,
  } = useCampaign();

  // Unified playable heroes list: combines current campaign heroes + GM's Hero Vault (deduplicated)
  const unifiedHeroes = React.useMemo(() => {
    const byKey = new Map<
      string,
      {
        source: 'campaign' | 'vault';
        hero: Character;
        vaultEntryId?: string;
        originLabel: string;
      }
    >();

    campaign.characters.forEach((ch) => {
      const key = ch.vaultId || ch.id;
      byKey.set(key, {
        source: 'campaign',
        hero: ch,
        originLabel: `Nesta campanha (${campaign.name})`,
      });
    });

    savedHeroes.forEach((entry) => {
      // Only include Vault heroes that belong to THIS campaign (avoid leaking heroes from unrelated campaigns!)
      if (entry.originCampaignId && entry.originCampaignId !== campaign.id) return;
      const key = entry.character.vaultId || entry.character.id || entry.id;
      if (!byKey.has(key)) {
        byKey.set(key, {
          source: 'vault',
          hero: entry.character,
          vaultEntryId: entry.id,
          originLabel: entry.originCampaignName || campaign.name,
        });
      }
    });

    return Array.from(byKey.values());
  }, [campaign.characters, campaign.id, campaign.name, savedHeroes]);

  const [setupMode, setSetupMode] = useState<'create' | 'vault'>(() =>
    campaign.characters.length > 0 || savedHeroes.length > 0 ? 'vault' : 'create'
  );
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState('');

  useEffect(() => {
    refreshSavedHeroes().catch(() => {});
  }, [refreshSavedHeroes]);

  const attrBudget = campaign.settings.attributePointBudget ?? 15;
  const maxSkills = campaign.settings.maxTrainedSkills ?? 4;

  const [charName, setCharName] = useState('');
  const [raceId, setRaceId] = useState(campaign.compendium.races[0]?.id || '');
  const [classId, setClassId] = useState(campaign.compendium.classes[0]?.id || '');
  const [portraitUrl, setPortraitUrl] = useState('');
  const [frameStyle, setFrameStyle] = useState<TokenFrameStyle>('gold');
  const [diceSkin, setDiceSkin] = useState<DiceSkin>('gold');
  const [background, setBackground] = useState('');

  const [attributes, setAttributes] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    campaign.compendium.attributes.forEach((a) => {
      map[a.id] = 10;
    });
    return map;
  });

  const [trainedSkillIds, setTrainedSkillIds] = useState<string[]>([]);

  const pointsSpent = campaign.compendium.attributes.reduce(
    (sum, a) => sum + Math.max(0, (attributes[a.id] ?? 10) - 10),
    0
  );
  const pointsRemaining = Math.max(0, attrBudget - pointsSpent);

  const selectedRace = campaign.compendium.races.find((r) => r.id === raceId);
  const selectedClass = campaign.compendium.classes.find((c) => c.id === classId);
  const conTotal = (attributes['con'] ?? 10) + (selectedRace?.attributeBonuses?.['con'] ?? 0);
  const conMod = getAttrMod(conTotal);
  const startHp = Math.max(4, (selectedClass?.hitDie || 8) + conMod);
  const startMp = Math.max(2, selectedClass?.mpPerLevel || 4);

  const adjustAttr = (attrId: string, delta: 1 | -1) => {
    const current = attributes[attrId] ?? 10;
    if (delta > 0) {
      if (pointsRemaining <= 0 || current >= 18) return;
      setAttributes((prev) => ({ ...prev, [attrId]: current + 1 }));
    } else {
      if (current <= 10) return;
      setAttributes((prev) => ({ ...prev, [attrId]: current - 1 }));
    }
  };

  const toggleSkill = (skillId: string) => {
    setTrainedSkillIds((prev) => {
      if (prev.includes(skillId)) {
        return prev.filter((id) => id !== skillId);
      }
      if (prev.length >= maxSkills) return prev;
      return [...prev, skillId];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!charName.trim()) return;

    const charId = `char-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newChar: Character = {
      id: charId,
      vaultId: charId,
      lastSyncedAt: new Date().toISOString(),
      ownerPlayerId: myPlayerId,
      playerName: myPlayerName,
      playerColor: myPlayerColor,
      tokenFrameStyle: frameStyle,
      diceSkin,
      name: charName.trim(),
      raceId,
      classId,
      level: 1,
      attributes,
      unspentAttributePoints: pointsRemaining,
      trainedSkillIds,
      hp: startHp,
      tempHp: 0,
      mp: startMp,
      knownAbilityIds: [],
      customAttacks: [],
      customAbilities: [],
      abilityUsesRemaining: {},
      activeConditionIds: [],
      inventory: [],
      gold: 50,
      portraitUrl,
      tokenColor: myPlayerColor,
      background: background.trim(),
      notes: '',
      deathSaves: { successes: 0, failures: 0 },
    };

    updateCampaign((prev) => ({
      ...prev,
      characters: [...prev.characters, newChar],
      maps: prev.maps.map((m) => {
        if (m.id !== prev.activeMapId) return m;
        const spawnPos = findNearestFreeGridCell(
          m,
          2 + (prev.characters.length % 3),
          4 + (prev.characters.length % 4),
          1
        );
        return {
          ...m,
          tokens: [
            ...m.tokens,
            {
              id: `tok-${charId}`,
              name: newChar.name.split(' ')[0],
              type: 'character',
              referenceId: charId,
              x: spawnPos.x,
              y: spawnPos.y,
              size: 1,
              hp: startHp,
              maxHp: startHp,
              defense: 10 + getAttrMod((attributes['des'] ?? 10) + (selectedRace?.attributeBonuses?.['des'] ?? 0)),
              activeConditionIds: [],
              isHidden: false,
              color: myPlayerColor,
              frameStyle,
              imageUrl: portraitUrl,
            },
          ],
        };
      }),
    }));

    saveCharacterToVault(newChar).catch(() => {});
    setActiveCharacterId(charId);
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const hero = parseHeroPayloadFromJson(parsed, campaign);
        if (!hero) {
          setImportError('Arquivo de ficha inválido. Escolha um arquivo .hero.json válido.');
          return;
        }
        importSavedHeroIntoCampaign(hero);
      } catch {
        setImportError('Não foi possível ler o arquivo de personagem.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-[65] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <OrnateFrame className="rpg-glass-panel rounded-lg max-w-4xl w-full p-6 my-auto animate-modal-unfurl relative">
        <button
          type="button"
          onClick={() => {
            if (pendingHeroJoinRequest) cancelHeroJoinRequest();
            setInLobby(true);
          }}
          className="absolute top-4 right-4 z-20 rpg-card p-1.5 rounded-md text-amber-200/80 hover:text-amber-100 hover:border-amber-400/70 cursor-pointer transition"
          title="Voltar ao Lobby"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 text-amber-300 font-display font-bold uppercase tracking-widest text-[11px]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Entre em {campaign.name}</span>
          </div>
          <h2 className="font-chronicle font-black text-3xl chronicle-gold-text">
            Escolha ou Forje seu Herói
          </h2>
          <p className="font-lore text-base" style={{ color: 'var(--text-secondary)' }}>
            Todos os heróis criados ou carregados ficam salvos e sincronizados no seu Cofre (Desktop + Online).
          </p>
        </div>

        {/* Pending GM Approval Waiting Banner (when player requested to join as an existing/saved hero) */}
        {pendingHeroJoinRequest && (
          <div className="my-4 p-4 rounded-lg bg-amber-950/55 border border-amber-400/70 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3 min-w-0">
              <TokenPortrait
                name={pendingHeroJoinRequest.characterName}
                imageUrl={pendingHeroJoinRequest.characterPortraitUrl}
                playerColor={pendingHeroJoinRequest.playerColor || myPlayerColor}
                frameStyle="gold"
                sizePx={46}
              />
              <div className="min-w-0">
                <div className="font-display font-bold text-sm text-amber-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Aguardando permissão do Mestre...</span>
                </div>
                <p className="text-xs text-amber-100/85 mt-0.5">
                  Solicitação enviada para <strong>{myPlayerName}</strong> entrar como{' '}
                  <strong>{pendingHeroJoinRequest.characterName}</strong>. Assim que o Mestre aprovar, você entrará automaticamente.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={cancelHeroJoinRequest}
              className="rpg-card px-3 py-1.5 rounded-md text-xs text-red-300 hover:border-red-400 cursor-pointer shrink-0"
            >
              Cancelar Pedido
            </button>
          </div>
        )}

        {/* Rejected Feedback Banner */}
        {!pendingHeroJoinRequest && heroJoinFeedback?.status === 'rejected' && (
          <div className="my-3 p-3 rounded-lg bg-red-950/60 border border-red-500/60 text-red-200 text-xs flex items-center justify-between gap-2">
            <span>{heroJoinFeedback.message}</span>
            <button
              type="button"
              onClick={clearHeroJoinFeedback}
              className="underline text-[11px] opacity-80 hover:opacity-100 cursor-pointer shrink-0"
            >
              Ok
            </button>
          </div>
        )}

        {/* Mode Switch Tabs (Unified Playable Heroes + Create New) */}
        <div className="grid grid-cols-2 gap-2 my-4 text-xs">
          <button
            type="button"
            onClick={() => setSetupMode('vault')}
            className={`px-3 py-2 rounded-md font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
              setupMode === 'vault' ? 'rpg-btn-primary' : 'rpg-card hover:border-amber-400/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Heróis Disponíveis ({unifiedHeroes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSetupMode('create')}
            className={`px-3 py-2 rounded-md font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
              setupMode === 'create' ? 'rpg-btn-primary' : 'rpg-card hover:border-amber-400/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Criar Novo Personagem</span>
          </button>
        </div>

        {setupMode === 'vault' && (
          <div className="space-y-4 text-xs">
            <div className="rpg-card rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-display font-bold text-sm text-amber-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Personagens Salvos na Mesa / Cofre do Mestre</span>
                </div>
                <p className="text-[11px] opacity-75">
                  Escolha um personagem abaixo para pedir permissão ao Mestre para entrar com ele, ou crie um novo personagem.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => jsonInputRef.current?.click()}
                  className="rpg-card px-3 py-1.5 rounded-md font-display font-bold flex items-center gap-1.5 cursor-pointer hover:border-amber-400/60"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Importar (.json)</span>
                </button>
                <input
                  ref={jsonInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportJsonFile}
                  className="hidden"
                />
              </div>
            </div>

            {importError && (
              <div className="p-2.5 rounded-md bg-red-950/60 border border-red-500/50 text-red-200">
                {importError}
              </div>
            )}

            {unifiedHeroes.length === 0 ? (
              <div className="rpg-card rounded-lg p-6 text-center space-y-2">
                <div className="font-display font-bold text-sm text-amber-200">
                  Nenhum herói salvo encontrado ainda
                </div>
                <p className="font-lore text-sm opacity-75">
                  Crie seu personagem agora ou importe uma ficha <code>.hero.json</code>.
                </p>
                <button
                  type="button"
                  onClick={() => setSetupMode('create')}
                  className="rpg-btn-primary px-4 py-2 rounded-md text-xs cursor-pointer mt-2"
                >
                  Criar Meu Primeiro Herói
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[54vh] overflow-y-auto pr-1">
                {unifiedHeroes.map((item) => {
                  const h = item.hero;
                  const clsName =
                    campaign.compendium.classes.find((c) => c.id === h.classId)?.name || 'Aventureiro';
                  const raceName =
                    campaign.compendium.races.find((r) => r.id === h.raceId)?.name || '';
                  const activeHolder = connectedPlayers.find(
                    (p) => p.role === 'player' && p.characterId === h.id && p.playerId !== myPlayerId
                  );
                  const isOccupied = Boolean(activeHolder);
                  return (
                    <div
                      key={`${item.source}-${h.id}`}
                      className={`rpg-card rounded-lg p-3 flex items-center justify-between gap-3 border transition ${
                        isOccupied
                          ? 'opacity-65 border-red-500/30'
                          : 'hover:border-amber-400/70'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <TokenPortrait
                          name={h.name}
                          imageUrl={h.portraitUrl}
                          playerColor={h.playerColor || myPlayerColor}
                          frameStyle={h.tokenFrameStyle || 'gold'}
                          sizePx={52}
                        />
                        <div className="min-w-0">
                          <div className="font-display font-bold text-sm text-amber-100 truncate">
                            {h.name}
                          </div>
                          <div className="text-[11px] text-amber-300/85 truncate">
                            Nível {h.level} • {clsName} {raceName ? `(${raceName})` : ''}
                          </div>
                          {isOccupied ? (
                            <div className="text-[10px] text-red-300 font-semibold truncate">
                              Em uso agora por {activeHolder?.playerName}
                            </div>
                          ) : (
                            <div className="text-[10px] opacity-70 truncate">
                              {item.originLabel}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={Boolean(pendingHeroJoinRequest) || isOccupied}
                          onClick={() => {
                            if (item.source === 'campaign') {
                              claimCampaignCharacter(h.id);
                            } else {
                              importSavedHeroIntoCampaign(h);
                            }
                          }}
                          className="rpg-btn-primary px-3 py-1.5 rounded-md font-display font-bold text-[11px] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                        >
                          {isOccupied
                            ? 'Em Uso'
                            : pendingHeroJoinRequest?.characterId === h.id
                              ? 'Aguardando Mestre...'
                              : 'Pedir para Entrar'}
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => triggerHeroJsonDownload(h)}
                            className="rpg-card px-2 py-1 rounded text-[10px] flex items-center gap-1 cursor-pointer"
                            title="Baixar ficha .json"
                          >
                            <Download className="w-3 h-3" /> .json
                          </button>
                          {item.vaultEntryId && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (
                                  await openConfirmDialog(
                                    `Remover "${h.name}" do Cofre de Heróis salvos?`,
                                    'Remover do Cofre'
                                  )
                                ) {
                                  deleteSavedHero(item.vaultEntryId!);
                                }
                              }}
                              className="p-1 rounded bg-red-950/60 border border-red-500/40 text-red-200 hover:bg-red-900 cursor-pointer"
                              title="Excluir do Cofre"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {setupMode === 'create' && (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <OrnateDivider />

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Portrait, Color & Token Stamp */}
            <div className="md:col-span-4 flex flex-col items-center gap-3 rpg-card rounded-xl p-4">
              <TokenPortrait
                name={charName || myPlayerName}
                imageUrl={portraitUrl}
                playerColor={myPlayerColor}
                frameStyle={frameStyle}
                sizePx={106}
              />
              <FileUploadButton
                accept="image/*"
                label="Subir Foto do PC"
                onUploaded={(url) => setPortraitUrl(url)}
                className="w-full justify-center"
              />

              <div className="w-full space-y-1.5">
                <label className="font-display font-bold block">Sua Cor (Borda &amp; Bolinha)</label>
                <div className="flex flex-wrap gap-1.5">
                  {PLAYER_COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setMyPlayerColor(c)}
                      className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                        myPlayerColor === c ? 'border-white scale-110' : 'border-transparent opacity-75'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="w-full">
                <label className="font-display font-bold block mb-1">Moldura do Token</label>
                <select
                  value={frameStyle}
                  onChange={(e) => setFrameStyle(e.target.value as TokenFrameStyle)}
                  className="rpg-input w-full"
                >
                  <option value="gold">Ouro Imperial</option>
                  <option value="runic">Prata Rúnica</option>
                  <option value="crimson">Rubi Carmesim</option>
                  <option value="arcane">Safira Arcana</option>
                  <option value="emerald">Esmeralda Feérica</option>
                </select>
              </div>

              <div className="w-full">
                <label className="font-display font-bold block mb-1">Estilo dos Seus Dados</label>
                <select
                  value={diceSkin}
                  onChange={(e) => setDiceSkin(e.target.value as DiceSkin)}
                  className="rpg-input w-full"
                >
                  <option value="gold">Ouro Imperial</option>
                  <option value="fire">Chama Dracônica</option>
                  <option value="ice">Gelo Astral</option>
                  <option value="emerald">Esmeralda</option>
                  <option value="amethyst">Ametista</option>
                  <option value="blood">Sangue Rubro</option>
                </select>
              </div>
            </div>

            {/* Identity, Point-Buy Attributes & Skill Limit */}
            <div className="md:col-span-8 space-y-3.5">
              <div>
                <label className="font-display font-bold block mb-1">Nome do Personagem *</label>
                <input
                  required
                  maxLength={28}
                  value={charName}
                  onChange={(e) => setCharName(e.target.value)}
                  placeholder="Ex: Arthas Lâmina-Alva"
                  className="rpg-input w-full text-sm font-display font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-display font-bold block mb-1">Raça</label>
                  <select
                    value={raceId}
                    onChange={(e) => setRaceId(e.target.value)}
                    className="rpg-input w-full"
                  >
                    {campaign.compendium.races.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-display font-bold block mb-1">Classe</label>
                  <select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    className="rpg-input w-full"
                  >
                    {campaign.compendium.classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Point-Buy Attributes */}
              <div className="rpg-card rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-xs">
                    Distribuição de Atributos (Base 10 + Bônus Racial)
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      pointsRemaining > 0
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                    }`}
                  >
                    Pontos Restantes: {pointsRemaining}
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {campaign.compendium.attributes.map((a) => {
                    const baseVal = attributes[a.id] ?? 10;
                    const racial = selectedRace?.attributeBonuses?.[a.id] ?? 0;
                    const total = baseVal + racial;
                    const mod = getAttrMod(total);
                    return (
                      <div key={a.id} className="rpg-card rounded-xl p-2 text-center border">
                        <div className="text-[10px] font-display font-bold" style={{ color: 'var(--accent-primary)' }}>
                          {a.shortName}
                        </div>
                        <div className="font-display font-black text-xl leading-tight my-0.5">
                          {formatSigned(mod)}
                        </div>
                        <div className="text-[10px] opacity-80 mb-1">
                          Total {total}
                          {racial > 0 ? ` (+${racial})` : ''}
                        </div>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => adjustAttr(a.id, -1)}
                            disabled={baseVal <= 10}
                            className="w-5 h-5 rounded bg-black/40 flex items-center justify-center cursor-pointer disabled:opacity-30"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono-dice text-xs font-bold w-5">{baseVal}</span>
                          <button
                            type="button"
                            onClick={() => adjustAttr(a.id, 1)}
                            disabled={pointsRemaining <= 0 || baseVal >= 18}
                            className="w-5 h-5 rounded bg-amber-500/25 text-amber-300 flex items-center justify-center cursor-pointer disabled:opacity-30"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Skill Selection with GM Limit */}
              <div className="rpg-card rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-xs">
                    Escolha Suas Perícias Treinadas
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      trainedSkillIds.length < maxSkills
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                    }`}
                  >
                    Escolhidas: {trainedSkillIds.length} / {maxSkills}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                  {campaign.compendium.skills.map((sk) => {
                    const active = trainedSkillIds.includes(sk.id);
                    const disabled = !active && trainedSkillIds.length >= maxSkills;
                    return (
                      <button
                        key={sk.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleSkill(sk.id)}
                        className={`px-2.5 py-1 rounded-full text-[11px] border cursor-pointer transition ${
                          active
                            ? 'rpg-btn-primary border-transparent'
                            : 'rpg-card opacity-80 hover:opacity-100 disabled:opacity-30'
                        }`}
                      >
                        {active ? '✓ ' : ''}
                        {sk.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="font-display font-bold block mb-1">História / Aparência</label>
                <textarea
                  rows={2}
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder="Quem é seu herói e por que está nesta aventura?"
                  className="rpg-input w-full"
                />
              </div>
            </div>
          </div>

          <OrnateDivider />

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] opacity-75">
              Seus ataques e habilidades especiais serão forjados pelo Mestre dentro da mesa.
            </span>
            <button
              type="submit"
              disabled={!charName.trim()}
              className="rpg-btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <UserCheck className="w-4 h-4" />
              <span>Entrar na Aventura!</span>
            </button>
          </div>
        </form>
        )}
      </OrnateFrame>
    </div>
  );
};
