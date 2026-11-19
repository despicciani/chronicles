import React, { useState } from 'react';
import { Shield, Sparkles } from 'lucide-react';
import {
  ComputedCharacterStats,
  EQUIP_SLOT_LABELS,
  extractItemDefenseBonus,
  formatFormulaForDisplay,
  inferPaperdollArchetype,
  resolveItemEquipSlot,
} from '../shared/rulesEngine';
import {
  CampaignState,
  CardRarity,
  Character,
  EquipSlot,
  InventoryEntry,
  ItemDef,
  PaperdollArchetype,
} from '../shared/types';
import { OrnateFrame } from './OrnateFrame';

interface EquipmentPaperdollProps {
  character: Character;
  campaign: CampaignState;
  stats: ComputedCharacterStats;
  charClassName?: string;
  classPaperdollArchetype?: PaperdollArchetype;
  charColor: string;
  resolveAssetUrl: (url?: string) => string;
  onToggleEquip: (invId: string) => void;
}

const ARCHETYPE_OPTIONS: Array<{
  id: PaperdollArchetype;
  label: string;
  subtitle: string;
  imagePath: string;
}> = [
  {
    id: 'warrior',
    label: 'Guerreiro',
    subtitle: 'Armadura Pesada',
    imagePath: '/paperdoll/warrior.jpg',
  },
  {
    id: 'arcane',
    label: 'Arcano',
    subtitle: 'Manto & Runas',
    imagePath: '/paperdoll/arcane.jpg',
  },
  {
    id: 'rogue',
    label: 'Ladino',
    subtitle: 'Couro & Sombras',
    imagePath: '/paperdoll/rogue.jpg',
  },
];

const ANCHOR_POINTS: Record<
  EquipSlot,
  { xPct: number; yPct: number; label: string }
> = {
  head: { xPct: 50, yPct: 14, label: 'Cabeça' },
  amulet: { xPct: 50, yPct: 24, label: 'Pescoço / Manto' },
  armor: { xPct: 50, yPct: 35, label: 'Armadura' },
  mainHand: { xPct: 22, yPct: 49, label: 'Mão Principal' },
  offHand: { xPct: 78, yPct: 49, label: 'Mão Secundária' },
  ring: { xPct: 25, yPct: 56, label: 'Anel / Relíquia' },
  boots: { xPct: 50, yPct: 86, label: 'Pés / Botas' },
};

const RARITY_STYLES: Record<
  CardRarity,
  {
    label: string;
    border: string;
    glow: string;
    badgeBg: string;
    runeColor: string;
    stroke: string;
  }
> = {
  comum: {
    label: 'Comum',
    border: 'border-amber-500/65',
    glow: 'shadow-[0_0_18px_rgba(212,170,72,0.16)]',
    badgeBg: 'bg-stone-900/90 border-amber-500/40 text-amber-200',
    runeColor: '#e4ba52',
    stroke: '#e8c266',
  },
  raro: {
    label: 'Raro',
    border: 'border-sky-400/80',
    glow: 'shadow-[0_0_22px_rgba(56,189,248,0.22)]',
    badgeBg: 'bg-sky-950/90 border-sky-400/60 text-sky-200',
    runeColor: '#38bdf8',
    stroke: '#7dd3fc',
  },
  epico: {
    label: 'Épico',
    border: 'border-purple-400/85',
    glow: 'shadow-[0_0_24px_rgba(168,85,247,0.26)]',
    badgeBg: 'bg-purple-950/90 border-purple-400/65 text-purple-200',
    runeColor: '#c084fc',
    stroke: '#d8b4fe',
  },
  lendario: {
    label: 'Lendário',
    border: 'border-amber-300',
    glow: 'shadow-[0_0_28px_rgba(250,204,21,0.34)]',
    badgeBg: 'bg-amber-950/95 border-amber-300/80 text-amber-100',
    runeColor: '#facc15',
    stroke: '#fef08a',
  },
};

function inferItemRarity(item: ItemDef): CardRarity {
  if (item.rarity) return item.rarity;
  if (item.type === 'Item Mágico') return 'raro';
  if (item.valueGold >= 500) return 'epico';
  if (item.valueGold >= 150) return 'raro';
  return 'comum';
}

function renderSubtypeIcon(slot: EquipSlot, item?: ItemDef, active = false): React.ReactNode {
  const rarity = item ? inferItemRarity(item) : 'comum';
  const strokeCol = active ? RARITY_STYLES[rarity].stroke : '#64748b';
  const fillCol = active ? `${RARITY_STYLES[rarity].runeColor}38` : 'rgba(30, 41, 59, 0.45)';
  const lowerName = (item?.name || '').toLowerCase();

  if (slot === 'mainHand') {
    if (/arco|besta|balestra/.test(lowerName)) {
      return (
        <svg viewBox="0 0 36 36" className="w-6 h-6">
          <path d="M12 6 C25 10, 25 26, 12 30" fill="none" stroke={strokeCol} strokeWidth="2.2" strokeLinecap="round" />
          <line x1="12" y1="6" x2="12" y2="30" stroke={strokeCol} strokeOpacity="0.6" strokeWidth="1.2" />
          <line x1="7" y1="18" x2="29" y2="18" stroke={strokeCol} strokeWidth="1.7" />
          <polygon points="29,18 24,15 25,18 24,21" fill={strokeCol} />
        </svg>
      );
    }
    if (/cajado|bast[aã]o|varinha|cetro/.test(lowerName)) {
      return (
        <svg viewBox="0 0 36 36" className="w-6 h-6">
          <line x1="10" y1="29" x2="24" y2="11" stroke={strokeCol} strokeWidth="2.4" strokeLinecap="round" />
          <polygon points="26,5 30,9 26,14 22,9" fill={fillCol} stroke={strokeCol} strokeWidth="1.7" />
          <circle cx="26" cy="9.5" r="2" fill={strokeCol} />
        </svg>
      );
    }
    if (/machado|alabarda/.test(lowerName)) {
      return (
        <svg viewBox="0 0 36 36" className="w-6 h-6">
          <line x1="10" y1="29" x2="25" y2="9" stroke={strokeCol} strokeWidth="2.3" strokeLinecap="round" />
          <path d="M19 8 C26 7, 30 13, 27 20 C23 18, 21 15, 22 12 Z" fill={fillCol} stroke={strokeCol} strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      );
    }
    if (/martelo|ma[çc]a|clava/.test(lowerName)) {
      return (
        <svg viewBox="0 0 36 36" className="w-6 h-6">
          <line x1="10" y1="29" x2="22" y2="15" stroke={strokeCol} strokeWidth="2.4" strokeLinecap="round" />
          <rect x="18" y="6" width="12" height="8" rx="1.5" transform="rotate(38 24 10)" fill={fillCol} stroke={strokeCol} strokeWidth="1.8" />
        </svg>
      );
    }
    if (/adaga|punhal|faca/.test(lowerName)) {
      return (
        <svg viewBox="0 0 36 36" className="w-6 h-6">
          <polygon points="27,8 22,19 17,14" fill={fillCol} stroke={strokeCol} strokeWidth="1.8" strokeLinejoin="round" />
          <line x1="14" y1="16" x2="21" y2="23" stroke={strokeCol} strokeWidth="2.2" strokeLinecap="round" />
          <line x1="16" y1="20" x2="10" y2="26" stroke={strokeCol} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 36 36" className="w-6 h-6">
        <path d="M28 6 L30 8 L15 23 L13 21 Z" fill={fillCol} stroke={strokeCol} strokeWidth="1.7" />
        <line x1="10" y1="18" x2="18" y2="26" stroke={strokeCol} strokeWidth="2.4" strokeLinecap="round" />
        <line x1="13" y1="23" x2="7" y2="29" stroke={strokeCol} strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    );
  }

  switch (slot) {
    case 'head':
      return (
        <svg viewBox="0 0 36 36" className="w-6 h-6">
          <path d="M10 19 C10 11, 26 11, 26 19 L25 27 L18 30 L11 27 Z" fill={fillCol} stroke={strokeCol} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M18 7 L18 25 M13 18 L23 18" stroke={strokeCol} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'amulet':
      return (
        <svg viewBox="0 0 36 36" className="w-6 h-6">
          <path d="M11 8 C11 16, 25 16, 25 8" fill="none" stroke={strokeCol} strokeWidth="1.7" />
          <polygon points="18,14 24,21 18,29 12,21" fill={fillCol} stroke={strokeCol} strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="18" cy="21" r="2.1" fill={strokeCol} />
        </svg>
      );
    case 'armor':
      return (
        <svg viewBox="0 0 36 36" className="w-6 h-6">
          <path d="M10 8 L15 6 L18 10 L21 6 L26 8 L30 14 L25 18 L24 30 L18 32 L12 30 L11 18 L6 14 Z" fill={fillCol} stroke={strokeCol} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M18 11 L18 28 M13 17 L23 17" stroke={strokeCol} strokeOpacity="0.7" strokeWidth="1.3" />
        </svg>
      );
    case 'offHand':
      if (/grim[oó]rio|livro|tomo|orbe|foco/.test(lowerName)) {
        return (
          <svg viewBox="0 0 36 36" className="w-6 h-6">
            <rect x="9" y="7" width="18" height="22" rx="2" fill={fillCol} stroke={strokeCol} strokeWidth="1.8" />
            <line x1="13" y1="7" x2="13" y2="29" stroke={strokeCol} strokeWidth="1.4" />
            <polygon points="20,13 23,18 20,23 17,18" fill={strokeCol} />
          </svg>
        );
      }
      return (
        <svg viewBox="0 0 36 36" className="w-6 h-6">
          <path d="M8 7 L28 7 L27 20 C26 26, 18 31, 18 31 C18 31, 10 26, 9 20 Z" fill={fillCol} stroke={strokeCol} strokeWidth="1.8" strokeLinejoin="round" />
          <line x1="18" y1="10" x2="18" y2="27" stroke={strokeCol} strokeWidth="1.5" />
          <line x1="12" y1="16" x2="24" y2="16" stroke={strokeCol} strokeWidth="1.5" />
        </svg>
      );
    case 'ring':
      return (
        <svg viewBox="0 0 36 36" className="w-6 h-6">
          <circle cx="18" cy="21" r="8" fill="none" stroke={strokeCol} strokeWidth="2.2" />
          <polygon points="18,6 23,11 18,15 13,11" fill={fillCol} stroke={strokeCol} strokeWidth="1.6" />
        </svg>
      );
    case 'boots':
      return (
        <svg viewBox="0 0 36 36" className="w-6 h-6">
          <path d="M12 7 L20 7 L20 22 L28 25 L28 30 L10 30 L10 24 L12 21 Z" fill={fillCol} stroke={strokeCol} strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
  }
}

export const EquipmentPaperdoll: React.FC<EquipmentPaperdollProps> = ({
  character,
  campaign,
  stats,
  charClassName,
  classPaperdollArchetype,
  charColor,
  resolveAssetUrl,
  onToggleEquip,
}) => {
  const [hoveredSlot, setHoveredSlot] = useState<EquipSlot | null>(null);

  // Strictly bound to the character's chosen class (GM can customize per class in Compendium)
  const activeArchetype: PaperdollArchetype =
    classPaperdollArchetype || inferPaperdollArchetype(charClassName);
  const archetypeInfo =
    ARCHETYPE_OPTIONS.find((a) => a.id === activeArchetype) || ARCHETYPE_OPTIONS[0];

  const slotToEquipped = new Map<EquipSlot, { inv: InventoryEntry; item: ItemDef }>();
  character.inventory.forEach((inv) => {
    if (!inv.equipped) return;
    const it = campaign.compendium.items.find((i) => i.id === inv.itemId);
    if (!it) return;
    const slot = inv.equippedSlot || resolveItemEquipSlot(it);
    if (slot && !slotToEquipped.has(slot)) {
      slotToEquipped.set(slot, { inv, item: it });
    }
  });

  const renderSlotSocket = (slot: EquipSlot, hint: string) => {
    const eq = slotToEquipped.get(slot);
    const rarity: CardRarity = eq ? inferItemRarity(eq.item) : 'comum';
    const rStyle = RARITY_STYLES[rarity];
    const isHovered = hoveredSlot === slot;

    const compatibleEntries = character.inventory.flatMap((inv) => {
      const it = campaign.compendium.items.find((i) => i.id === inv.itemId);
      if (!it) return [];
      const itSlot = inv.equippedSlot || resolveItemEquipSlot(it);
      return itSlot === slot ? [{ inv, item: it }] : [];
    });

    const eqDefBonus = eq ? extractItemDefenseBonus(eq.item) : 0;
    const eqModDef =
      eq?.item.modifiers
        ?.filter((m) => m.target === 'defense')
        .reduce((acc, m) => acc + m.value, 0) || 0;
    const totalSlotAc = eqDefBonus + eqModDef;

    return (
      <div
        key={slot}
        onMouseEnter={() => setHoveredSlot(slot)}
        onMouseLeave={() => setHoveredSlot((curr) => (curr === slot ? null : curr))}
        className={`rpg-card rounded-lg p-2.5 border transition relative ${
          eq
            ? `${rStyle.border} ${rStyle.glow} bg-gradient-to-br from-[#191512]/95 via-[#10131e]/95 to-[#090b12]/95`
            : 'border-amber-500/20 bg-[#0a0d15]/90 hover:border-amber-400/50'
        } ${isHovered ? 'ring-1 ring-amber-300/70' : ''}`}
      >
        <div className="flex items-start gap-2.5">
          {/* Beveled Metallic Item Socket */}
          <div
            className={`w-11 h-11 rounded-md rpg-socket flex items-center justify-center shrink-0 border transition ${
              eq ? rStyle.border : 'border-white/10 opacity-75'
            }`}
            style={
              eq
                ? {
                    boxShadow: `inset 0 2px 10px rgba(0,0,0,0.92), 0 0 12px ${rStyle.runeColor}44`,
                  }
                : undefined
            }
          >
            {renderSubtypeIcon(slot, eq?.item, Boolean(eq))}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-display font-bold uppercase tracking-wider text-amber-300 truncate">
                {EQUIP_SLOT_LABELS[slot]}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {eq && rarity !== 'comum' && (
                  <span
                    className={`px-1.5 py-0.2 rounded-xs border text-[8px] font-display font-bold uppercase ${rStyle.badgeBg}`}
                  >
                    {rStyle.label}
                  </span>
                )}
                {totalSlotAc > 0 && (
                  <span className="px-1.5 py-0.2 rounded-xs bg-emerald-950/90 border border-emerald-400/60 text-[9px] font-mono-dice font-bold text-emerald-300">
                    +{totalSlotAc} CA
                  </span>
                )}
              </div>
            </div>

            {eq ? (
              <div className="mt-0.5">
                <div className="font-display font-bold text-xs text-amber-100 truncate">
                  {eq.item.name}
                </div>
                <div className="text-[10px] font-mono-dice text-amber-200/80 truncate">
                  {eq.item.damageFormula
                    ? `Dano: ${formatFormulaForDisplay(eq.item.damageFormula, stats, character)}`
                    : eq.item.description}
                </div>
              </div>
            ) : (
              <div
                className="mt-0.5 text-[10px] font-lore italic truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                Vazio — {hint}
              </div>
            )}
          </div>
        </div>

        {/* Rich Hover Tooltip Card */}
        {isHovered && eq && (
          <div className="hidden md:block absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] w-64 z-50 pointer-events-none">
            <div
              className={`rpg-glass-panel rounded-lg p-3 border ${rStyle.border} shadow-[0_14px_38px_rgba(0,0,0,0.96)] space-y-1.5 text-left`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-xs text-amber-100 truncate">
                  {eq.item.name}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded-xs border text-[8px] font-display font-bold uppercase shrink-0 ${rStyle.badgeBg}`}
                >
                  {rStyle.label}
                </span>
              </div>
              <div className="text-[10px] text-amber-300/85 font-mono-dice flex flex-wrap gap-x-2 gap-y-0.5">
                {totalSlotAc > 0 && <span>+{totalSlotAc} CA</span>}
                {eq.item.attackFormula && <span>Atq: {eq.item.attackFormula}</span>}
                {eq.item.damageFormula && (
                  <span>
                    Dano: {eq.item.damageFormula}
                    {eq.item.damageType ? ` (${eq.item.damageType})` : ''}
                  </span>
                )}
                {eq.item.range && <span>Alcance: {eq.item.range}</span>}
              </div>
              {eq.item.modifiers && eq.item.modifiers.length > 0 && (
                <div className="text-[10px] text-emerald-300/90 space-y-0.5">
                  {eq.item.modifiers.map((m, idx) => (
                    <div key={idx}>
                      • {m.label || m.target}: {m.value >= 0 ? `+${m.value}` : m.value}
                      {m.diceBonus ? ` ${m.diceBonus}` : ''}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] font-lore leading-snug text-slate-300">
                {eq.item.description}
              </p>
            </div>
          </div>
        )}

        {/* 1-Click Inline Swap / Unequip */}
        <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center gap-1.5">
          {compatibleEntries.length > 0 ? (
            <select
              value={eq?.inv.id || ''}
              onChange={(e) => {
                const pickedInvId = e.target.value;
                if (!pickedInvId) {
                  if (eq) onToggleEquip(eq.inv.id);
                } else if (pickedInvId !== eq?.inv.id) {
                  onToggleEquip(pickedInvId);
                }
              }}
              className="rpg-input flex-1 text-[10px] py-0.5 px-1.5"
            >
              <option value="">— Nenhum vestido —</option>
              {compatibleEntries.map(({ inv, item }) => {
                const b =
                  extractItemDefenseBonus(item) +
                  (item.modifiers
                    ?.filter((m) => m.target === 'defense')
                    .reduce((a, m) => a + m.value, 0) || 0);
                return (
                  <option key={inv.id} value={inv.id}>
                    {item.name}
                    {b > 0 ? ` (+${b} CA)` : item.damageFormula ? ` (${item.damageFormula})` : ''}
                  </option>
                );
              })}
            </select>
          ) : (
            <span className="text-[9px] opacity-55 flex-1">
              Sem item de {EQUIP_SLOT_LABELS[slot].toLowerCase()} na mochila
            </span>
          )}
          {eq && (
            <button
              onClick={() => onToggleEquip(eq.inv.id)}
              className="px-2 py-0.5 rounded bg-red-950/80 border border-red-500/40 text-red-200 hover:bg-red-800 text-[10px] font-display font-bold cursor-pointer shrink-0"
              title="Desequipar deste slot"
            >
              Tirar
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <OrnateFrame
      accentColor={charColor}
      cornerSize={16}
      className="rpg-panel rounded-lg p-4 shadow-[inset_0_0_55px_rgba(0,0,0,0.85)]"
    >
      {/* Reliquary Header: Archetype Selector + Live CA Breakdown */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3.5 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div>
          <div className="text-[10px] font-display uppercase tracking-[0.22em] text-amber-400/90 font-bold flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            <span>Relicário Anatômico • 7 Partes do Corpo</span>
          </div>
          <h4 className="font-chronicle font-bold text-base chronicle-gold-text">
            Corpo do Aventureiro — {character.name}
          </h4>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Class-Bound Archetype Emblem (Read-only, derived automatically from Class) */}
          <div className="rpg-socket rounded-md px-2.5 py-1.5 flex items-center gap-1.5 border border-amber-500/30">
            <span className="text-[10px] font-display font-bold uppercase tracking-wider text-amber-200">
              {charClassName || archetypeInfo.label}
            </span>
            <span className="text-[10px] opacity-40">•</span>
            <span className="text-[10px] font-lore italic text-amber-300/80">
              {archetypeInfo.subtitle}
            </span>
          </div>

          {/* Live CA Shield Readout */}
          <div className="rpg-socket rounded-md px-3 py-1.5 flex items-center gap-2 border border-amber-400/50">
            <Shield className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="font-chronicle font-black text-base text-amber-200 leading-none">
                CA {stats.defense}
              </div>
              <div className="text-[9px] font-mono-dice text-amber-300/80 mt-0.5">
                {stats.defenseBreakdown.join(' • ')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-center">
        {/* Left Column Sockets: Head, Main Hand, Ring */}
        <div className="lg:col-span-4 space-y-2.5">
          {renderSlotSocket('head', 'Elmo / Capuz / Coroa')}
          {renderSlotSocket('mainHand', 'Arma Principal / Cajado')}
          {renderSlotSocket('ring', 'Anel / Luvas / Relíquia')}
        </div>

        {/* Centerpiece: High-Res Illustrated Dark-Fantasy Hero Reliquary + Armor Socket */}
        <div className="lg:col-span-4 flex flex-col items-center gap-2.5">
          <div
            className="relative w-full max-w-[270px] aspect-[3/4] rounded-lg overflow-hidden border border-amber-500/45 shadow-[0_14px_40px_rgba(0,0,0,0.92),inset_0_0_24px_rgba(0,0,0,0.9)]"
            style={{ backgroundColor: '#08090e' }}
          >
            {/* High-Resolution Archetype Illustration */}
            <img
              src={resolveAssetUrl(archetypeInfo.imagePath)}
              alt={`Silhueta ${archetypeInfo.label}`}
              className="w-full h-full object-cover object-center select-none pointer-events-none"
              draggable={false}
            />

            {/* Soft Edge Vignette for Seamless Obsidian Integration */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 48%, transparent 56%, rgba(8,9,14,0.65) 86%, rgba(8,9,14,0.96) 100%)',
              }}
            />

            {/* Engraved Inner Filigree Frame */}
            <div className="absolute inset-2 rounded border border-amber-400/20 pointer-events-none" />

            {/* Illuminated Anatomical Rune Anchors for All 7 Slots */}
            {(Object.keys(ANCHOR_POINTS) as EquipSlot[]).map((slot) => {
              const pt = ANCHOR_POINTS[slot];
              const eq = slotToEquipped.get(slot);
              const rarity = eq ? inferItemRarity(eq.item) : 'comum';
              const runeCol = eq ? RARITY_STYLES[rarity].runeColor : '#64748b';
              const isHighlighted = hoveredSlot === slot;

              return (
                <div
                  key={slot}
                  onMouseEnter={() => setHoveredSlot(slot)}
                  onMouseLeave={() => setHoveredSlot((curr) => (curr === slot ? null : curr))}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10 cursor-pointer"
                  style={{ left: `${pt.xPct}%`, top: `${pt.yPct}%` }}
                  title={
                    eq
                      ? `${pt.label}: ${eq.item.name}`
                      : `${pt.label}: vazio`
                  }
                >
                  {/* Localized Aura Glow when Equipped or Hovered */}
                  {(eq || isHighlighted) && (
                    <div
                      className="absolute -inset-4 rounded-full pointer-events-none transition-opacity"
                      style={{
                        background: `radial-gradient(circle, ${runeCol}${isHighlighted ? '66' : '38'} 0%, transparent 70%)`,
                      }}
                    />
                  )}
                  {/* Runic Diamond Anchor Node */}
                  <div
                    className="relative w-3.5 h-3.5 rotate-45 border transition-transform"
                    style={{
                      transform: isHighlighted ? 'scale(1.35) rotate(45deg)' : 'rotate(45deg)',
                      backgroundColor: eq ? `${runeCol}cc` : 'rgba(12, 15, 24, 0.85)',
                      borderColor: eq || isHighlighted ? '#fef08a' : 'rgba(212, 170, 72, 0.45)',
                      boxShadow: eq
                        ? `0 0 10px ${runeCol}, inset 0 0 4px rgba(255,255,255,0.6)`
                        : '0 2px 6px rgba(0,0,0,0.85)',
                    }}
                  />
                </div>
              );
            })}

            {/* Subtle Archetype Emblem Footer */}
            <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
              <span className="px-2.5 py-0.5 rounded bg-black/75 border border-amber-500/35 text-[9px] font-display uppercase tracking-[0.2em] text-amber-200/90">
                {archetypeInfo.label} • {slotToEquipped.size}/7 Equipados
              </span>
            </div>
          </div>

          <div className="w-full">
            {renderSlotSocket('armor', 'Armadura / Couraça / Veste')}
          </div>
        </div>

        {/* Right Column Sockets: Amulet, Off-Hand, Boots */}
        <div className="lg:col-span-4 space-y-2.5">
          {renderSlotSocket('amulet', 'Colar / Amuleto / Manto')}
          {renderSlotSocket('offHand', 'Escudo / Grimório / Foco')}
          {renderSlotSocket('boots', 'Botas / Grevas')}
        </div>
      </div>
    </OrnateFrame>
  );
};
