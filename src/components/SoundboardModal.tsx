import React, { useState } from 'react';
import { Music, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { soundEngine } from '../utils/soundEngine';
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
  { key: 'fireball', name: 'Explosão / Fogo', icon: '💥' },
  { key: 'thunder', name: 'Trovão', icon: '⚡' },
  { key: 'heal', name: 'Cura Divina', icon: '✨' },
  { key: 'roar', name: 'Rugido de Monstro', icon: '🐉' },
  { key: 'door', name: 'Porta / Alerta', icon: '🚪' },
  { key: 'dice', name: 'Dados na Mesa', icon: '🎲' },
];

export const SoundboardModal: React.FC<SoundboardModalProps> = ({ onClose }) => {
  const {
    campaign,
    role,
    activeAmbientName,
    triggerSound,
    updateCampaign,
    playCharacterTheme,
  } = useCampaign();
  const [volume, setVolume] = useState(45);
  const [muted, setMuted] = useState(soundEngine.getMuted());
  const [customUrl, setCustomUrl] = useState('');
  const [newTrackTitle, setNewTrackTitle] = useState('');

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    soundEngine.setVolume(val / 100);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  };

  const heroesWithThemes = campaign.characters.filter((c) => Boolean(c.themeMusicUrl));

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="rpg-glass-panel rounded-2xl w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
        <div
          className="px-4 py-3 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            <div>
              <h2 className="font-display font-bold text-base leading-none">
                Mesa de Som Sincronizada
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

        <div className="p-4 space-y-5 text-xs overflow-y-auto flex-1 min-h-0">
          {/* Local Volume */}
          <div className="rpg-card rounded-xl p-3 flex items-center justify-between gap-4">
            <button
              onClick={toggleMute}
              className={`px-3 py-1.5 rounded flex items-center gap-1.5 font-semibold cursor-pointer ${
                muted ? 'rpg-btn-crimson' : 'rpg-btn-primary'
              }`}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{muted ? 'Mutado (Local)' : 'Som Ativo'}</span>
            </button>
            <div className="flex items-center gap-2 flex-1">
              <span>Meu Volume:</span>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="flex-1 accent-amber-500 cursor-pointer"
              />
              <span className="w-9 text-right font-mono-dice">{volume}%</span>
            </div>
          </div>

          {role !== 'gm' ? (
            <div className="text-center py-4" style={{ color: 'var(--text-secondary)' }}>
              Apenas o Mestre dispara músicas e temas para toda a sala. Ajuste seu volume acima.
            </div>
          ) : (
            <>
              {/* Character Theme Songs */}
              <div className="space-y-2">
                <h3 className="font-display font-bold text-sm flex items-center gap-1.5">
                  <Music className="w-4 h-4 text-amber-400" />
                  Temas Épicos dos Personagens (Para momentos de glória!)
                </h3>
                {heroesWithThemes.length === 0 ? (
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Nenhum herói tem música tema ainda. Abra a Ficha de um jogador na aba "Foto, Cor, Música &amp; História" para subir o MP3 dele!
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {heroesWithThemes.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => playCharacterTheme(ch)}
                        className="rpg-card p-2.5 rounded-xl flex items-center justify-between gap-2 hover:border-amber-400 cursor-pointer"
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
                )}
              </div>

              {/* GM Uploaded MP3 Library */}
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-sm">Suas Músicas do PC</h3>
                  <div className="flex items-center gap-2">
                    <input
                      value={newTrackTitle}
                      onChange={(e) => setNewTrackTitle(e.target.value)}
                      placeholder="Nome da música (opcional)"
                      className="rpg-input py-1 text-xs w-44"
                    />
                    <FileUploadButton
                      accept="audio/*"
                      label="Subir MP3 / Áudio"
                      onUploaded={(url, fname) => {
                        const title = newTrackTitle.trim() || fname.replace(/\.[^.]+$/, '');
                        updateCampaign((p) => ({
                          ...p,
                          customMusicTracks: [
                            ...(p.customMusicTracks || []),
                            { id: `trk-${Date.now()}`, title, url, category: 'ambient' },
                          ],
                        }));
                        setNewTrackTitle('');
                      }}
                    />
                  </div>
                </div>

                {(campaign.customMusicTracks || []).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {campaign.customMusicTracks.map((trk) => (
                      <div
                        key={trk.id}
                        className="rpg-card rounded-xl p-2.5 flex items-center justify-between gap-2"
                      >
                        <span className="font-semibold truncate">{trk.title}</span>
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
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ambient Loops */}
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-sm">Trilhas Ambiente Geradas (Zero Config)</h3>
                  {activeAmbientName && (
                    <button
                      onClick={() =>
                        triggerSound({ action: 'stop-ambient', presetKey: '', name: '' })
                      }
                      className="rpg-btn-crimson px-2.5 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Square className="w-3 h-3" /> Parar Música
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition ${
                          isPlaying ? 'rpg-btn-primary' : 'rpg-card hover:opacity-85'
                        }`}
                      >
                        <span className="text-lg">{amb.icon}</span>
                        <span className="font-semibold">{amb.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SFX Pads */}
              <div className="space-y-2">
                <h3 className="font-display font-bold text-sm">Efeitos Sonoros Instantâneos (SFX)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                      className="rpg-card p-2.5 rounded-xl text-center hover:opacity-80 active:scale-95 transition cursor-pointer"
                    >
                      <div className="text-xl">{sfx.icon}</div>
                      <div className="font-semibold mt-1">{sfx.name}</div>
                    </button>
                  ))}
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
