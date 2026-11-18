import React from 'react';
import { useCampaign } from '../context/CampaignContext';

/**
 * Architectural & cartographic dark-fantasy backdrop (zero floating orb particles).
 */
export const FantasyParticlesBackground: React.FC<{ intensity?: 'low' | 'high' }> = ({
  intensity = 'low',
}) => {
  const { theme } = useCampaign();
  const isBright = theme === 'bright-fantasy';

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
      {/* Atmospheric Radial Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: isBright
            ? 'radial-gradient(ellipse at 50% 35%, rgba(255, 248, 231, 0.25) 0%, rgba(168, 126, 72, 0.16) 75%, rgba(92, 62, 28, 0.28) 100%)'
            : 'radial-gradient(ellipse at 50% 35%, rgba(188, 138, 44, 0.08) 0%, rgba(8, 10, 18, 0.45) 60%, rgba(3, 4, 8, 0.94) 100%)',
        }}
      />

      {/* Subtle Parchment / Obsidian Grain Texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.25) 0px, rgba(255,255,255,0.25) 1px, transparent 1px, transparent 4px), repeating-linear-gradient(90deg, rgba(255,255,255,0.2) 0px, rgba(255,255,255,0.2) 1px, transparent 1px, transparent 4px)',
        }}
      />

      {/* Carved Cartographic Compass Rose & Astrolabe (stronger on Lobby title screen) */}
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        style={{
          opacity: intensity === 'high' ? (isBright ? 0.11 : 0.075) : isBright ? 0.05 : 0.035,
          color: 'var(--border-ornate)',
        }}
      >
        <g stroke="currentColor" fill="none">
          <circle cx="500" cy="500" r="410" strokeWidth="1.2" />
          <circle cx="500" cy="500" r="392" strokeWidth="0.6" strokeDasharray="3 9" />
          <circle cx="500" cy="500" r="295" strokeWidth="1" />
          <circle cx="500" cy="500" r="190" strokeWidth="0.8" />
          {/* Cardinal Compass Axes */}
          <line x1="500" y1="30" x2="500" y2="970" strokeWidth="0.8" />
          <line x1="30" y1="500" x2="970" y2="500" strokeWidth="0.8" />
          <line x1="170" y1="170" x2="830" y2="830" strokeWidth="0.5" />
          <line x1="830" y1="170" x2="170" y2="830" strokeWidth="0.5" />
          {/* Etched Compass Star */}
          <polygon points="500,145 530,470 855,500 530,530 500,855 470,530 145,500 470,470" strokeWidth="1" />
          {/* Architectural Outer Framing Lines */}
          <rect x="28" y="28" width="944" height="944" strokeWidth="1" />
          <rect x="40" y="40" width="920" height="920" strokeWidth="0.5" />
        </g>
      </svg>
    </div>
  );
};
