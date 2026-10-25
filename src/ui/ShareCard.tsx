// Share images (T12): the ending card and the proposal card drawn on a 2D canvas (no new dependency), with the footer note.
// No names, no locations. The island picture is a snapshot of the 3D view the player is looking at.
import type { CampaignResult, CampaignState } from '../campaign/campaign';
import { NPC_IDS } from '../campaign/campaign';
import { NPCS } from '../content/npcs';
import { ENDINGS, endingSentences } from '../content/endings';
import { proposalRows, Evidence, evidenceText } from '../content/evidence';
import { CREDITS } from '../content/credits';

export const SHARE_FOOT = 'Prototype model · teaching assumptions · historical 2020–23 weather';

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 6) {
  const words = text.split(' ');
  let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      if (n === maxLines - 1) { ctx.fillText(line + ' …', x, y); return y + lh; }
      ctx.fillText(line, x, y); line = words[i]; y += lh; n++;
    } else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function snapshot3d(): HTMLCanvasElement | null {
  const c = document.querySelector('.canvas-wrap canvas') as HTMLCanvasElement | null;
  return c && c.width > 0 ? c : null;
}

function base(title: string, kicker: string) {
  const cv = document.createElement('canvas');
  cv.width = 1200; cv.height = 675;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fffaf0'; g.fillRect(0, 0, cv.width, cv.height);
  const shot = snapshot3d();
  if (shot) { // left half: the island as it is on screen (crop to a square around the centre)
    const s = Math.min(shot.width, shot.height);
    g.save(); rr(g, 28, 28, 500, 560, 24); g.clip();
    g.drawImage(shot, (shot.width - s) / 2, (shot.height - s) / 2, s, s, 28 - 30, 28, 560, 560);
    g.restore();
  } else { g.fillStyle = '#cfe8e4'; g.fillRect(28, 28, 500, 560); }
  g.fillStyle = '#33505c'; g.font = '600 18px Inter, system-ui, sans-serif'; g.fillText(kicker.toUpperCase(), 560, 70);
  g.fillStyle = '#10222b'; g.font = '700 46px Fredoka, Inter, system-ui, sans-serif'; g.fillText(title, 560, 122);
  // footer
  g.fillStyle = '#16242a'; g.fillRect(0, 615, cv.width, 60);
  g.fillStyle = '#ffd36b'; g.font = '600 18px Inter, system-ui, sans-serif'; g.fillText(SHARE_FOOT, 28, 652);
  const leftEnd = 28 + g.measureText(SHARE_FOOT).width + 28;
  // right: who made it, two lines, shrunk to fit beside the note
  const fit = (txt: string, weight: string, px: number, fam: string) => { let s = px; do { g.font = `${weight} ${s}px ${fam}`; s -= 1; } while (s > 9 && g.measureText(txt).width > cv.width - 28 - leftEnd); };
  const r1 = `Neutral Ground · a game by ${CREDITS.team}`;
  const r2 = `${CREDITS.event} · ${CREDITS.challenge} · fictional neighbours`;
  g.fillStyle = '#fffaf0'; fit(r1, '700', 17, 'Fredoka, Inter, system-ui, sans-serif'); g.fillText(r1, cv.width - 28 - g.measureText(r1).width, 640);
  g.fillStyle = '#cfe0e4'; fit(r2, '500', 13, 'Inter, system-ui, sans-serif'); g.fillText(r2, cv.width - 28 - g.measureText(r2).width, 661);
  return { cv, g };
}

export function endingImage(r: CampaignResult, b: CampaignResult): string {
  const { cv, g } = base(ENDINGS[r.ending].title, 'Ending · 30 Sept 2023');
  g.fillStyle = '#2c4a55'; g.font = '20px Inter, system-ui, sans-serif';
  let y = wrap(g, ENDINGS[r.ending].sub, 560, 160, 600, 28, 3) + 8;
  g.fillStyle = '#10222b'; g.font = '19px Inter, system-ui, sans-serif';
  for (const s of endingSentences(r, b)) y = wrap(g, s, 560, y, 600, 27, 4) + 6;
  g.font = '600 19px Inter, system-ui, sans-serif';
  NPC_IDS.forEach((k, i) => { g.fillStyle = r.quests[k] ? '#17703f' : '#a3192c'; g.fillText(`${r.quests[k] ? '✓' : '✕'} ${NPCS[k].name}`, 560 + (i % 2) * 300, y + 8 + Math.floor(i / 2) * 30); });
  return cv.toDataURL('image/png');
}

export function proposalImage(s: CampaignState, r: CampaignResult, b: CampaignResult, sentence: string, ev: Evidence[]): string {
  const { cv, g } = base('My proposal', `Neutral Ground · ${ENDINGS[r.ending].title}`);
  let y = 160;
  g.font = '17px Inter, system-ui, sans-serif';
  for (const row of proposalRows(s, r, b).filter((x) => x.k !== 'responded')) {
    g.fillStyle = '#33505c'; g.font = '600 15px Inter, system-ui, sans-serif'; g.fillText(row.label, 560, y);
    g.fillStyle = '#10222b'; g.font = '16px Inter, system-ui, sans-serif'; y = wrap(g, row.text, 560, y + 20, 610, 21, 2) + 6;
  }
  if (sentence.trim()) { g.fillStyle = '#5a2fa8'; g.font = 'italic 18px Inter, system-ui, sans-serif'; y = wrap(g, `“I’d accept this cost because ${sentence}”`, 560, y + 6, 610, 24, 3) + 4; }
  g.fillStyle = '#0b4f86'; g.font = '14px Inter, system-ui, sans-serif';
  for (const e of ev.slice(0, 2)) y = wrap(g, '▪ ' + evidenceText(e), 560, y + 2, 610, 19, 2);
  void y;
  return cv.toDataURL('image/png');
}

export function download(dataUrl: string, name: string) {
  // try a normal download (works when the game runs from the file or a web server)…
  try { const a = document.createElement('a'); a.href = dataUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove(); } catch { /* blocked */ }
  // …and always show the picture, because some hosts (embedded viewers) block downloads: right-click or long-press saves it
  showPicture(dataUrl);
}

function showPicture(dataUrl: string) {
  document.querySelector('.pic-overlay')?.remove();
  const o = document.createElement('div'); o.className = 'pic-overlay'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Your picture');
  o.innerHTML = '<div class="pic-box"><img alt="Your Neutral Ground card" /><p>Didn’t download? Right-click or long-press the picture to save it.</p><button class="btn primary">Close</button></div>';
  (o.querySelector('img') as HTMLImageElement).src = dataUrl;
  const close = () => o.remove();
  o.addEventListener('click', (e) => { if (e.target === o) close(); });
  (o.querySelector('button') as HTMLButtonElement).addEventListener('click', close);
  document.body.appendChild(o);
}
