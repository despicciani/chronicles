import React, { useEffect, useState } from 'react';
import {
  Music,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { MusicPlaybackSnapshot, soundEngine } from '../utils/soundEngine';
import { FileUploadButton } from './FileUploadButton';

interface SoundboardModalProps {
  onClose: () => void;
}

const AMBIENTS = [
  { key: 'tavern', name: 'Taverna & Lareira', icon: '🍺' },
  { key: 'dungeon', name: 'Masmorra Sombria', icon: '🕯️' },
  { key: 'exploration', name: 'Exploração & Mistério', icon: '🌲' },
  { key: 'rain', name: 'Chuva Noturna', icon: '🌧️' },
  { key: 'boss', name: 'Tensão / Combate Boss', icon: '🔥' },
];

const SFX_PADS = [
  { key: 'sword', name: 'Golpe de Espada', icon: '⚔️' },
  { key: 'shield', name: 'Escudo / Bloqueio', icon: '🛡️' },
  { key: 'arrow', name: 'Flecha / Arco', icon: '🏹' },
  { key: 'crit', name: 'Crítico Épico', icon: '💥' },
  { key: 'fireball', name: 'Explosão / Fogo', icon: '🔥' },
  { key: 'thunder', name: 'Trovão', icon: '⚡' },
  { key: 'spell', name: 'Magia Arcana', icon: '🔮' },
  { key: 'heal', name: 'Cura Divina', icon: '✨' },
  { key: 'roar', name: 'Rugido de Monstro', icon: '🐉' },
  { key: 'potion', name: 'Poção / Beber', icon: '🧪' },
  { key: 'coin', name: 'Ouro / Tesouro', icon: '🪙' },
  { key: 'levelup', name: 'Level Up / Vitória', icon: '👑' },
  { key: 'door', name: 'Porta Pesada', icon: '🚪' },
  { key: 'dice', name: 'Dados na Mesa', icon: '🎲' },
];

const TRACK_CATEGORIES = [
  { id: 'all', label: 'Todas' },
  { id: 'combat', label: '⚔️ Combate' },
  { id: 'ambient', label: '🌲 Exploração' },
  { id: 'tavern', label: '🍺 Taverna' },
  { id: 'boss', label: '👑 Chefe' },
  { id: 'drama', label: '🎭 Drama' },
] as const;

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const SoundboardModal: React.FC<SoundboardModalProps> = ({ onClose }) => {
  const {
    campaign,
    role,
    activeAmbientName,
    triggerSound,
    updateCampaign,
    playCharacterTheme,
  } = useCampaign();

  const [musicVol, setMusicVol] = useState(Math.round(soundEngine.getMusicVolume() * 100));
  const [sfxVol, setSfxVol] = useState(Math.round(soundEngine.getSfxVolume() * 100));
  const [muted, setMuted] = useState(soundEngine.getMuted());
  const [loopOne, setLoopOne] = useState(soundEngine.getLoop());
  const [shuffleMode, setShuffleMode] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(soundEngine.getPlaybackRate());
  const [snap, setSnap] = useState<MusicPlaybackSnapshot>(() => soundEngine.getPlaybackSnapshot());

  const [customUrl, setCustomUrl] = useState('');
  const [newTrackTitle, setNewTrackTitle] = useState('');
  const [newTrackCat, setNewTrackCat] = useState<string>('ambient');
  const [trackFilter, setTrackFilter] = useState<string>('all');
  const [trackSearch, setTrackSearch] = useState('');

  const tracks = campaign.customMusicTracks || [];
  const filteredTracks = tracks.filter((t) => {
    const catOk = trackFilter === 'all' || (t.category || 'ambient') === trackFilter;
    const qOk = !trackSearch.trim() || t.title.toLowerCase().includes(trackSearch.trim().toLowerCase());
    return catOk && qOk;
  });

  const currentTrackIndex = tracks.findIndex(
    (t) => t.title === activeAmbientName || (snap.currentUrl && snap.currentUrl.includes(t.url))
  );

  const playTrackByIndex = (idx: number) => {
    if (tracks.length === 0) return;
    const safeIdx = ((idx % tracks.length) + tracks.length) % tracks.length;
    const trk = tracks[safeIdx];
    triggerSound({
      action: 'ambient',
      presetKey: 'custom',
      name: trk.title,
      customUrl: trk.url,
    });
  };

  const playNextTrack = () => {
    if (tracks.length === 0) return;
    if (shuffleMode && tracks.length > 1) {
      let next = Math.floor(Math.random() * tracks.length);
      if (next === currentTrackIndex) next = (next + 1) % tracks.length;
      playTrackByIndex(next);
      return;
    }
    playTrackByIndex(currentTrackIndex >= 0 ? currentTrackIndex + 1 : 0);
  };

  const playPrevTrack = () => {
    if (tracks.length === 0) return;
    playTrackByIndex(currentTrackIndex >= 0 ? currentTrackIndex - 1 : 0);
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSnap(soundEngine.getPlaybackSnapshot());
    }, 300);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (role !== 'gm') return;
    soundEngine.setOnTrackEnded(() => {
      if (!soundEngine.getLoop() && tracks.length > 0) {
        playNextTrack();
      }
    });
    return () => soundEngine.setOnTrackEnded(null);
  });

  const handleMusicVolChange = (val: number) => {
    setMusicVol(val);
    soundEngine.setMusicVolume(val / 100);
  };

  const handleSfxVolChange = (val: number) => {
    setSfxVol(val);
    soundEngine.setSfxVolume(val / 100);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  };

  const toggleLoopMode = () => {
    const next = !loopOne;
    setLoopOne(next);
    soundEngine.setLoop(next);
  };

  const changeRate = (rate: number) => {
    setPlaybackRate(rate);
    soundEngine.setPlaybackRate(rate);
  };

  const heroesWithThemes = campaign.characters.filter((c) => Boolean(c.themeMusicUrl));

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="rpg-glass-panel rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div
          className="px-4 py-3 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            <div>
              <h2 className="font-display font-bold text-base leading-none">
                Mesa de Som &amp; Player Musical
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {activeAmbientName
                  ? `Tocando agora: ${activeAmbientName}`
                  : 'Nenhuma trilha ambiente ativa'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rpg-card p-1.5 rounded cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs overflow-y-auto flex-1 min-h-0">
          {/* Dual Volume Controls (Music vs SFX) + Mute */}
          <div className="rpg-card rounded-xl p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            <button
              onClick={toggleMute}
              className={`md:col-span-3 px-3 py-1.5 rounded flex items-center justify-center gap-1.5 font-semibold cursor-pointer ${
                muted ? 'rpg-btn-crimson' : 'rpg-btn-primary'
              }`}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{muted ? 'Mutado (Local)' : 'Som Ativo'}</span>
            </button>
            <div className="md:col-span-9 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-semibold text-amber-200">🎵 Música:</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={musicVol}
                  onChange={(e) => handleMusicVolChange(Number(e.target.value))}
                  className="flex-1 accent-amber-500 cursor-pointer"
                />
                <span className="w-8 text-right font-mono-dice">{musicVol}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-semibold text-sky-200">⚡ Efeitos:</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sfxVol}
                  onChange={(e) => handleSfxVolChange(Number(e.target.value))}
                  className="flex-1 accent-sky-400 cursor-pointer"
                />
                <span className="w-8 text-right font-mono-dice">{sfxVol}%</span>
              </div>
            </div>
          </div>

          {role !== 'gm' ? (
            <div className="text-center py-6" style={{ color: 'var(--text-secondary)' }}>
              Apenas o Mestre controla as músicas e efeitos sonoros da mesa. Ajuste seus volumes de Música e Efeitos acima!
            </div>
          ) : (
            <>
              {/* Active Music Deck Player (Play/Pause, Seek, Prev/Next, Loop/Shuffle, Fade Out, Speed) */}
              <div className="rpg-card rounded-xl p-3.5 border border-amber-500/45 bg-gradient-to-r from-amber-950/35 via-black/40 to-amber-950/35 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Music className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-display font-bold text-sm text-amber-100 truncate">
                        {activeAmbientName || 'Deck Musical Parado'}
                      </div>
                      <div className="text-[10px] opacity-70">
                        {snap.duration > 0
                          ? `${formatTime(snap.currentTime)} / ${formatTime(snap.duration)} • ${loopOne ? 'Repetir Faixa' : shuffleMode ? 'Playlist Aleatória' : 'Playlist Contínua'}`
                          : activeAmbientName
                            ? 'Trilha ambiente gerada ativa'
                            : 'Escolha uma música do PC abaixo para tocar'}
                      </div>
                    </div>
                  </div>

                  {/* Transport Controls */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={playPrevTrack}
                      disabled={tracks.length === 0}
                      className="rpg-card p-1.5 rounded hover:border-amber-400 cursor-pointer disabled:opacity-35"
                      title="Faixa Anterior"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (snap.duration > 0 || snap.isPaused) {
                          soundEngine.togglePauseMusic();
                          setSnap(soundEngine.getPlaybackSnapshot());
                        } else if (tracks.length > 0) {
                          playTrackByIndex(currentTrackIndex >= 0 ? currentTrackIndex : 0);
                        }
                      }}
                      disabled={tracks.length === 0 && !snap.duration}
                      className="rpg-btn-primary px-3 py-1.5 rounded flex items-center gap-1 cursor-pointer disabled:opacity-35"
                      title={snap.isPlaying ? 'Pausar (Local)' : 'Tocar / Retomar'}
                    >
                      {snap.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{snap.isPlaying ? 'Pausar' : 'Tocar'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={playNextTrack}
                      disabled={tracks.length === 0}
                      className="rpg-card p-1.5 rounded hover:border-amber-400 cursor-pointer disabled:opacity-35"
                      title="Próxima Faixa"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleLoopMode}
                      className={`p-1.5 rounded border cursor-pointer transition ${
                        loopOne
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'rpg-card opacity-70 hover:opacity-100'
                      }`}
                      title={loopOne ? 'Repetir Faixa Atual (Ativo)' : 'Tocar Playlist em Sequência'}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !shuffleMode;
                        setShuffleMode(next);
                        if (next && loopOne) {
                          setLoopOne(false);
                          soundEngine.setLoop(false);
                        }
                      }}
                      className={`p-1.5 rounded border cursor-pointer transition ${
                        shuffleMode
                          ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                          : 'rpg-card opacity-70 hover:opacity-100'
                      }`}
                      title="Modo Aleatório (Shuffle)"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                    </button>
                    {activeAmbientName && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            soundEngine.fadeOutAndStop(1200, () =>
                              triggerSound({ action: 'stop-ambient', presetKey: '', name: '' })
                            )
                          }
                          className="rpg-card px-2 py-1 rounded text-[11px] text-amber-200 hover:border-amber-400 cursor-pointer"
                          title="Diminuir suavemente até parar (Fade Out 1,2s)"
                        >
                          Fade Out
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            triggerSound({ action: 'stop-ambient', presetKey: '', name: '' })
                          }
                          className="rpg-btn-crimson px-2 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer"
                          title="Parar música imediatamente"
                        >
                          <Square className="w-3 h-3" /> Parar
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Live Seek Bar + Speed Selector */}
                <div className="flex items-center gap-2.5">
                  <span className="font-mono-dice text-[10px] w-9 text-amber-200/80">
                    {formatTime(snap.currentTime)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, snap.duration)}
                    step={0.5}
                    value={Math.min(snap.currentTime, snap.duration || 1)}
                    disabled={snap.duration <= 0}
                    onChange={(e) => {
                      const t = Number(e.target.value);
                      soundEngine.seekMusic(t);
                      setSnap((prev) => ({ ...prev, currentTime: t }));
                    }}
                    className="flex-1 accent-amber-400 cursor-pointer disabled:opacity-35"
                  />
                  <span className="font-mono-dice text-[10px] w-9 text-right opacity-75">
                    {formatTime(snap.duration)}
                  </span>
                  <select
                    value={playbackRate}
                    onChange={(e) => changeRate(Number(e.target.value))}
                    className="rpg-input py-0.5 px-1.5 text-[10px] font-mono-dice"
                    title="Velocidade de reprodução"
                  >
                    <option value={0.85}>0.85×</option>
                    <option value={1}>1.0×</option>
                    <option value={1.15}>1.15×</option>
                  </select>
                </div>
              </div>

              {/* GM PC Music Library with Categories & Search */}
              <div className="space-y-2.5 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-sm">
                    Biblioteca de Músicas do PC ({tracks.length})
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      value={newTrackTitle}
                      onChange={(e) => setNewTrackTitle(e.target.value)}
                      placeholder="Nome (opcional)"
                      className="rpg-input py-1 text-xs w-36"
                    />
                    <select
                      value={newTrackCat}
                      onChange={(e) => setNewTrackCat(e.target.value)}
                      className="rpg-input py-1 text-xs"
                    >
                      {TRACK_CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <FileUploadButton
                      accept="audio/*"
                      label="Subir MP3 / OGG / WAV"
                      onUploaded={(url, fname) => {
                        const title = newTrackTitle.trim() || fname.replace(/\.[^.]+$/, '');
                        updateCampaign((p) => ({
                          ...p,
                          customMusicTracks: [
                            ...(p.customMusicTracks || []),
                            {
                              id: `trk-${Date.now()}`,
                              title,
                              url,
                              category: newTrackCat as 'ambient' | 'combat' | 'tavern' | 'boss' | 'drama',
                            },
                          ],
                        }));
                        setNewTrackTitle('');
                      }}
                    />
                  </div>
                </div>

                {/* Category Filter Pills + Search */}
                {tracks.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {TRACK_CATEGORIES.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setTrackFilter(c.id)}
                          className={`px-2 py-0.5 rounded text-[10px] font-display font-semibold cursor-pointer transition ${
                            trackFilter === c.id
                              ? 'bg-amber-500/25 border border-amber-400 text-amber-200'
                              : 'rpg-card opacity-75 hover:opacity-100'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <input
                      value={trackSearch}
                      onChange={(e) => setTrackSearch(e.target.value)}
                      placeholder="Filtrar música..."
                      className="rpg-input py-0.5 px-2 text-[11px] w-40"
                    />
                  </div>
                )}

                {filteredTracks.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {filteredTracks.map((trk) => {
                      const isThisPlaying = activeAmbientName === trk.title;
                      return (
                        <div
                          key={trk.id}
                          className={`rpg-card rounded-xl p-2.5 flex items-center justify-between gap-2 transition ${
                            isThisPlaying ? 'border-amber-400 bg-amber-500/12' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold truncate text-amber-100">
                              {isThisPlaying ? '🎵 ' : ''}
                              {trk.title}
                            </div>
                            <div className="text-[10px] opacity-65">
                              {TRACK_CATEGORIES.find((c) => c.id === trk.category)?.label || '🌲 Exploração'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() =>
                                triggerSound({
                                  action: 'ambient',
                                  presetKey: 'custom',
                                  name: trk.title,
                                  customUrl: trk.url,
                                })
                              }
                              className="rpg-btn-primary px-2 py-1 rounded text-[11px] cursor-pointer"
                            >
                              ▶ Tocar
                            </button>
                            <button
                              onClick={() =>
                                updateCampaign((p) => ({
                                  ...p,
                                  customMusicTracks: p.customMusicTracks.filter((x) => x.id !== trk.id),
                                }))
                              }
                              className="text-red-400 p-1 cursor-pointer"
                              title="Remover faixa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] opacity-65 italic">
                    {tracks.length === 0
                      ? 'Suba arquivos MP3, OGG ou WAV do seu PC acima para criar sua trilha sonora sincronizada com os jogadores!'
                      : 'Nenhuma faixa encontrada nesse filtro.'}
                  </div>
                )}
              </div>

              {/* Character Theme Songs */}
              {heroesWithThemes.length > 0 && (
                <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                  <h3 className="font-display font-bold text-sm flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Temas Épicos dos Personagens
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {heroesWithThemes.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => playCharacterTheme(ch)}
                        className="rpg-card p-2 rounded-xl flex items-center justify-between gap-2 hover:border-amber-400 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: ch.playerColor || ch.tokenColor }}
                          />
                          <div className="text-left min-w-0">
                            <div className="font-bold truncate">{ch.name}</div>
                            <div className="text-[10px] opacity-75 truncate">
                              {ch.themeMusicTitle || 'Música Tema'}
                            </div>
                          </div>
                        </div>
                        <span className="rpg-btn-primary px-2 py-1 rounded text-[11px]">▶ Tocar</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Improved Studio-Quality SFX Pads (14 Foley Presets) */}
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <h3 className="font-display font-bold text-sm">
                  Efeitos Sonoros Instantâneos — Foley Aprimorado ({SFX_PADS.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {SFX_PADS.map((sfx) => (
                    <button
                      key={sfx.key}
                      onClick={() =>
                        triggerSound({
                          action: 'sfx',
                          presetKey: sfx.key,
                          name: sfx.name,
                        })
                      }
                      className="rpg-card p-2 rounded-xl text-center hover:border-amber-400/70 active:scale-95 transition cursor-pointer"
                    >
                      <div className="text-lg">{sfx.icon}</div>
                      <div className="font-semibold text-[10px] mt-1 leading-tight">{sfx.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Ambient Loops */}
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <h3 className="font-display font-bold text-sm">Trilhas Ambiente Geradas (Zero Config)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {AMBIENTS.map((amb) => {
                    const isPlaying = activeAmbientName === amb.name;
                    return (
                      <button
                        key={amb.key}
                        onClick={() =>
                          triggerSound({
                            action: 'ambient',
                            presetKey: amb.key,
                            name: amb.name,
                          })
                        }
                        className={`p-2 rounded-xl border text-left flex items-center gap-1.5 cursor-pointer transition ${
                          isPlaying ? 'rpg-btn-primary' : 'rpg-card hover:opacity-85'
                        }`}
                      >
                        <span className="text-base">{amb.icon}</span>
                        <span className="font-semibold text-[11px] leading-tight">{amb.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* External Audio URL */}
              <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <label className="font-semibold block">Link Direto de Áudio Externo (.mp3 / .ogg)</label>
                <div className="flex gap-2">
                  <input
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://exemplo.com/trilha.mp3"
                    className="rpg-input flex-1"
                  />
                  <button
                    onClick={() => {
                      if (!customUrl.trim()) return;
                      triggerSound({
                        action: 'ambient',
                        presetKey: 'custom',
                        name: 'Trilha Customizada',
                        customUrl: customUrl.trim(),
                      });
                    }}
                    className="rpg-btn-primary px-3 py-1.5 rounded cursor-pointer"
                  >
                    Tocar Loop
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
