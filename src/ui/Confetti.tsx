import { useMemo } from 'react';
const COLORS = ['#ffc23d', '#57c785', '#63b8ff', '#ff8a3d', '#b394ff', '#ffffff'];
export function Confetti() {
  const bits = useMemo(() => Array.from({ length: 46 }, (_, k) => ({ left: Math.random() * 100, delay: Math.random() * 0.6, color: COLORS[k % COLORS.length], dur: 1.4 + Math.random() * 1.2 })), []);
  return <div className="confetti" aria-hidden>{bits.map((b, k) => <i key={k} style={{ left: `${b.left}%`, background: b.color, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }} />)}</div>;
}
