import React from 'react';
import { TokenFrameStyle } from '../shared/types';
import { useCampaign } from '../context/CampaignContext';

interface TokenPortraitProps {
  name: string;
  imageUrl?: string;
  playerColor: string;
  frameStyle?: TokenFrameStyle;
  sizePx?: number;
  isDead?: boolean;
  iconHint?: string;
}

const FRAME_GRADIENTS: Record<TokenFrameStyle, string> = {
  gold: 'conic-gradient(from 135deg, #fde68a 0deg, #b47b1c 75deg, #4b2d07 145deg, #e7b94c 220deg, #78480f 295deg, #fde68a 360deg)',
  runic: 'conic-gradient(from 135deg, #e2e8f0 0deg, #64748b 80deg, #1e293b 155deg, #94a3b8 235deg, #334155 305deg, #e2e8f0 360deg)',
  emerald: 'conic-gradient(from 135deg, #a7f3d0 0deg, #059669 80deg, #064e3b 155deg, #34d399 235deg, #065f46 305deg, #a7f3d0 360deg)',
  crimson: 'conic-gradient(from 135deg, #fecaca 0deg, #dc2626 75deg, #450a0a 150deg, #ef4444 230deg, #7f1d1d 300deg, #fecaca 360deg)',
  arcane: 'conic-gradient(from 135deg, #bae6fd 0deg, #2563eb 80deg, #172554 155deg, #60a5fa 235deg, #1e3a8a 305deg, #bae6fd 360deg)',
};

function renderFantasyCrestSvg(keyText: string) {
  const k = keyText.toLowerCase();

  // 1. DRAGON (Dragão Vermelho, etc.)
  if (/drag[aã]o|dragon|draco|wyrm/.test(k)) {
    return (
      <svg viewBox="0 0 64 64" className="w-[74%] h-[74%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {/* Swept Horns & Winged Crest */}
        <path
          d="M10 10 L24 22 L28 14 L32 22 L36 14 L40 22 L54 10 L47 28 L54 36 L43 42 L38 54 L32 58 L26 54 L21 42 L10 36 L17 28 Z"
          fill="currentColor"
          fillOpacity="0.22"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {/* Dragon Snout & Jaws */}
        <path
          d="M23 27 L32 21 L41 27 L39 43 L32 52 L25 43 Z"
          fill="currentColor"
          fillOpacity="0.4"
          stroke="currentColor"
          strokeWidth="2"
        />
        {/* Glowing Dragon Eyes */}
        <polygon points="25,31 30,34 26,35" fill="#fef08a" />
        <polygon points="39,31 34,34 38,35" fill="#fef08a" />
        {/* Fangs & Nostril Slits */}
        <path d="M27 45 L29 50 M37 45 L35 50 M30 40 L31 42 M34 40 L33 42" stroke="#fef08a" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  // 2. GOBLIN / ARCHER (Goblin Arqueiro, etc.)
  if (/goblin|arqueiro|kobold|batedor/.test(k)) {
    return (
      <svg viewBox="0 0 64 64" className="w-[74%] h-[74%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {/* Pointed Goblin Ears & Hood Silhouette */}
        <path
          d="M6 26 L20 24 L26 15 L38 15 L44 24 L58 26 L44 33 L40 46 L32 52 L24 46 L20 33 Z"
          fill="currentColor"
          fillOpacity="0.25"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Drawn Recurve Bow & Arrow */}
        <path d="M20 12 C42 22, 42 42, 20 52" fill="none" stroke="#fde68a" strokeWidth="2.4" strokeLinecap="round" />
        <line x1="20" y1="12" x2="20" y2="52" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.7" />
        <line x1="14" y1="32" x2="48" y2="32" stroke="#fef08a" strokeWidth="2.2" strokeLinecap="round" />
        <polygon points="52,32 44,27 46,32 44,37" fill="#fef08a" />
      </svg>
    );
  }

  // 3. SKELETON / UNDEAD (Esqueleto Guardião, Morto-Vivo)
  if (/esqueleto|morto|caveira|zumbi|lich|guardi[aã]o/.test(k)) {
    return (
      <svg viewBox="0 0 64 64" className="w-[72%] h-[72%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {/* Crossed Swords Behind Skull */}
        <line x1="12" y1="52" x2="52" y2="12" stroke="currentColor" strokeWidth="2.2" strokeOpacity="0.65" strokeLinecap="round" />
        <line x1="52" y1="52" x2="12" y2="12" stroke="currentColor" strokeWidth="2.2" strokeOpacity="0.65" strokeLinecap="round" />
        {/* Sculpted Skull */}
        <path
          d="M20 26 C20 15, 44 15, 44 26 C44 33, 41 37, 39 40 L39 48 L25 48 L25 40 C23 37, 20 33, 20 26 Z"
          fill="#0f131d"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <circle cx="27" cy="28" r="3.5" fill="currentColor" />
        <circle cx="37" cy="28" r="3.5" fill="currentColor" />
        <polygon points="32,33 29.5,38 34.5,38" fill="currentColor" />
        <line x1="29" y1="43" x2="29" y2="48" stroke="currentColor" strokeWidth="1.8" />
        <line x1="32" y1="43" x2="32" y2="48" stroke="currentColor" strokeWidth="1.8" />
        <line x1="35" y1="43" x2="35" y2="48" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  // 4. ORC / BERSERKER (Orc Berserker)
  if (/orc|berserker|b[aá]rbaro/.test(k)) {
    return (
      <svg viewBox="0 0 64 64" className="w-[74%] h-[74%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {/* Double-Bitted Greataxe */}
        <path
          d="M16 16 C8 24, 8 40, 16 48 L28 36 L28 28 Z M48 16 C56 24, 56 40, 48 48 L36 36 L36 28 Z"
          fill="currentColor"
          fillOpacity="0.32"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <line x1="32" y1="10" x2="32" y2="55" stroke="#fde68a" strokeWidth="3" strokeLinecap="round" />
        {/* Orc Lower Tusks */}
        <polygon points="22,48 25,38 28,46" fill="#fef08a" />
        <polygon points="42,48 39,38 36,46" fill="#fef08a" />
      </svg>
    );
  }

  // 5. OGRE / GIANT (Ogro Brutamontes)
  if (/ogro|gigante|brutamontes|troll/.test(k)) {
    return (
      <svg viewBox="0 0 64 64" className="w-[74%] h-[74%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {/* Spiked Iron Warclub */}
        <path
          d="M38 12 L50 24 L26 52 L16 42 Z"
          fill="currentColor"
          fillOpacity="0.35"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <polygon points="44,12 49,17 55,11" fill="#fef08a" />
        <polygon points="48,24 56,24 51,30" fill="#fef08a" />
        <polygon points="34,16 30,9 39,12" fill="#fef08a" />
        <polygon points="27,26 20,22 24,31" fill="#fef08a" />
      </svg>
    );
  }

  // 6. CULTIST / NECROMANCER / MAGE (Cultista, Mago, Lyra)
  if (/cultista|necromante|mago|arcano|bruxo|feiticeiro|lyra/.test(k)) {
    return (
      <svg viewBox="0 0 64 64" className="w-[74%] h-[74%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {/* Arcane Halo & Staff Spire */}
        <circle cx="32" cy="28" r="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="4 3" />
        <polygon
          points="32,10 38,24 52,28 38,32 32,48 26,32 12,28 26,24"
          fill="currentColor"
          fillOpacity="0.3"
          stroke="#fef08a"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="28" r="4.5" fill="#fef08a" />
        <line x1="32" y1="44" x2="32" y2="56" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }

  // 7. ROGUE / ASSASSIN (Ladino, Kael)
  if (/ladino|assassino|sombra|kael|ladr[aã]o/.test(k)) {
    return (
      <svg viewBox="0 0 64 64" className="w-[74%] h-[74%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {/* Crossed Twin Daggers */}
        <path
          d="M14 14 L38 38 L34 42 L10 18 Z"
          fill="currentColor"
          fillOpacity="0.35"
          stroke="#fef08a"
          strokeWidth="1.8"
        />
        <path
          d="M50 14 L26 38 L30 42 L54 18 Z"
          fill="currentColor"
          fillOpacity="0.35"
          stroke="#fef08a"
          strokeWidth="1.8"
        />
        <line x1="34" y1="36" x2="48" y2="50" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        <line x1="30" y1="36" x2="16" y2="50" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    );
  }

  // 8. CLERIC / PALADIN (Clérigo, Paladino, Seraphina)
  if (/cl[eé]rigo|paladino|sagrado|luz|seraphina|templar/.test(k)) {
    return (
      <svg viewBox="0 0 64 64" className="w-[74%] h-[74%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {/* Heraldic Heater Shield + Sunburst Cross */}
        <path
          d="M16 14 L48 14 L48 32 C48 44, 32 54, 32 54 C32 54, 16 44, 16 32 Z"
          fill="currentColor"
          fillOpacity="0.28"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <line x1="32" y1="20" x2="32" y2="45" stroke="#fef08a" strokeWidth="3" strokeLinecap="round" />
        <line x1="22" y1="30" x2="42" y2="30" stroke="#fef08a" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  // 9. DEFAULT WARRIOR / HERO CREST (Guerreiro, Ragnar, or any character/creature)
  return (
    <svg viewBox="0 0 64 64" className="w-[74%] h-[74%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
      {/* Knight Greathelm & Broadsword Crest */}
      <path
        d="M18 24 C18 14, 46 14, 46 24 L46 42 L36 50 L32 45 L28 50 L18 42 Z"
        fill="currentColor"
        fillOpacity="0.28"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Visor Cross Slit */}
      <line x1="22" y1="28" x2="42" y2="28" stroke="#fef08a" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="32" y1="20" x2="32" y2="44" stroke="#fef08a" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export const TokenPortrait: React.FC<TokenPortraitProps> = ({
  name,
  imageUrl,
  playerColor,
  frameStyle = 'gold',
  sizePx = 48,
  isDead = false,
  iconHint,
}) => {
  const { resolveAssetUrl } = useCampaign();
  const resolved = resolveAssetUrl(imageUrl);
  const rimPad = Math.max(2, Math.round(sizePx * 0.085));

  return (
    <div
      className={`relative rounded-full flex items-center justify-center shrink-0 select-none ${
        isDead ? 'animate-death-pulse' : ''
      }`}
      style={{
        width: sizePx,
        height: sizePx,
        padding: rimPad,
        background: FRAME_GRADIENTS[frameStyle] || FRAME_GRADIENTS.gold,
        boxShadow: `0 6px 16px rgba(0,0,0,0.85), 0 0 0 1.5px ${playerColor}cc, inset 0 1px 2px rgba(255,255,255,0.45)`,
      }}
    >
      {/* Inner Carved Obsidian/Gem Medallion Core */}
      <div
        className="w-full h-full rounded-full overflow-hidden flex items-center justify-center relative"
        style={{
          background: `radial-gradient(circle at 35% 28%, ${playerColor}ee 0%, ${playerColor}66 42%, #090b12 92%)`,
          boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.88), inset 0 0 0 1px rgba(255,235,180,0.22)',
          color: '#fff7e0',
        }}
      >
        {resolved ? (
          <img
            src={resolved}
            alt={name}
            className={`w-full h-full object-cover ${isDead ? 'grayscale brightness-75' : ''}`}
          />
        ) : (
          renderFantasyCrestSvg(`${name} ${iconHint || ''}`)
        )}

        {/* Top-Left Specular Glass Arc */}
        <div
          className="absolute inset-0 pointer-events-none rounded-full"
          style={{
            background:
              'linear-gradient(145deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.04) 36%, transparent 55%)',
          }}
        />
      </div>
    </div>
  );
};
