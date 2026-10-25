// One consistent line-icon set (lucide) instead of emoji, so the UI reads as a tool rather than a chat message.
import { Coins } from 'lucide-react';
import { ArtOr } from './ArtBits';
import { iconArt } from './art';
export {
  Sprout, Cylinder, Unplug, Grid3x3, CircleDashed, Coins, Menu, CircleHelp, Satellite, Volume2, VolumeX, Wheat, TreeDeciduous,
  Axe, Leaf, Construction, Search, Droplets, CloudLightning, Play, RotateCcw, Timer, ArrowLeft, ArrowRight,
} from 'lucide-react';

/** A token cost: the number followed by a small coin icon. */
export function Tok({ n }: { n: number | string }) {
  return <span className="tok">{n}<ArtOr className="tok-i art" src={iconArt('token')} alt="tokens" fallback={<Coins className="tok-i" aria-label="tokens" />} /></span>;
}

/** Simple damselfly silhouette (no emoji exists for it). */
export function Damselfly({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden fill="none" stroke="#2a7f9e" strokeWidth="1.6" strokeLinecap="round">
      <line x1="16" y1="5" x2="16" y2="29" strokeWidth="2.2" />
      <circle cx="16" cy="5.5" r="2.2" fill="#2a7f9e" stroke="none" />
      <ellipse cx="9.5" cy="10" rx="6.5" ry="2" fill="#cfeaf3" transform="rotate(-12 9.5 10)" />
      <ellipse cx="22.5" cy="10" rx="6.5" ry="2" fill="#cfeaf3" transform="rotate(12 22.5 10)" />
      <ellipse cx="10" cy="14" rx="6" ry="1.8" fill="#cfeaf3" transform="rotate(8 10 14)" />
      <ellipse cx="22" cy="14" rx="6" ry="1.8" fill="#cfeaf3" transform="rotate(-8 22 14)" />
    </svg>
  );
}
