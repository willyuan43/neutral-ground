// Small UI pieces that show the illustrations, each with a drawn fallback (the game runs without the art files).
import { useState, type ReactNode, type CSSProperties } from 'react';
import { iconArt, type IconKey } from './art';

/** An <img> that swaps to `fallback` if the file is missing. */
export function ArtOr({ src, fallback, className, style, alt = '' }: { src: string; fallback: ReactNode; className?: string; style?: CSSProperties; alt?: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return <>{fallback}</>;
  return <img className={className} style={style} src={src} alt={alt} draggable={false} onError={() => setBad(true)} />;
}

/** One of the eight 3D UI icons (token, sweat, water, calendar, rain, sprout, star, balance). */
export function Icon3d({ k, fallback, size }: { k: IconKey; fallback: ReactNode; size?: number }) {
  return <ArtOr className="ico3d" src={iconArt(k)} fallback={fallback} style={size ? { width: size, height: size } : undefined} />;
}
