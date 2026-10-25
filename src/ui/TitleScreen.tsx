import { useEffect } from 'react';
import { useGame, defaultGraphics } from '../state/store';
import type { GameData } from '../data/load';
import { Stage } from '../stage/Stage';
import { sfx } from '../audio/sfx';
import { ArtOr } from './ArtBits';
import { bodyArt } from './art';
import { Volume2, VolumeX, Gauge, Sparkles, BookOpen, Award, Puzzle } from 'lucide-react';
import { wyIndex } from '../model/season';
import { ENDINGS } from '../content/endings';
import { NPCS } from '../content/npcs';
import { getCollection, rankOf } from '../state/collection';
import { CREDITS } from '../content/credits';
import { ACHIEVEMENTS, achievementOn } from '../content/achievements';
import { preloadCharacters } from '../stage/Characters';

/** Title: the real canyon as a living diorama, slowly turning; one clear action. */
export function TitleScreen({ d }: { d: GameData }) {
  const { setScreen, settings, setSetting } = useGame();
  const g = settings.graphics ?? defaultGraphics();
  const narrow = typeof window !== 'undefined' && window.innerWidth < 720;
  useEffect(() => { sfx.music('calm'); preloadCharacters(); }, []);
  const col = getCollection();
  const rank = rankOf(col, (id) => { const x = ACHIEVEMENTS.find((q) => q.id === id); return !!x && !x.bad && achievementOn(id); });
  // the facts on the title come from the data and content, not typed in
  const ix = wyIndex(d.weather); const days = ix.end[2] - ix.start[0] + 1;
  return (
    <div className="screen title2">
      <div className="canvas-wrap">
        <Stage d={d} view="hero" flyIn aerial={false} reduceMotion={settings.reduceMotion} interactive={false} autoRotate layers={{ places: false, boundary: false }} shiftX={narrow ? 0 : 0.2} />
      </div>
      <div className="t2-shade" aria-hidden />
      <div className="t2-ui">
        <div className="t2-eyebrow">Glen Canyon Park · San Francisco · 2020–2023</div>
        <h1 className="t2-title">Neutral<br />Ground</h1>
        <p className="t2-tag"><em>A real storm is coming.</em></p>
        <p className="t2-pitch">You have <b>three autumns</b> to get a San Francisco canyon ready.</p>
        <div className="t2-cta">
          <button className="btn primary t2-play" onClick={() => { sfx.play('click'); setScreen('campaign'); }}>▶ Play <span>· 6–8 min</span></button>
          <button className="btn t2-sec" onClick={() => { sfx.play('click'); setScreen('levels'); }}><Puzzle /> Challenge levels</button>
        </div>
        <div className="t2-facts">
          <span><b>{d.grid.cellM} m</b> lidar terrain</span>
          <span><b>{days.toLocaleString('en-US')}</b> days of real weather</span>
          <span><b>{Object.keys(NPCS).length}</b> neighbours · <b>{Object.keys(ENDINGS).length}</b> endings</span>
        </div>
        <div className="t2-credit" aria-label={`A game by ${CREDITS.team}: ${CREDITS.members.join(' and ')}. ${CREDITS.event}, ${CREDITS.challenge}.`}>
          <div className="t2-cr-stub"><span>{CREDITS.event.replace(/ 2026$/, '')}</span><b>2026 · {CREDITS.challenge}</b></div>
          <div className="t2-cr-body"><small>A game by</small><b>{CREDITS.team}</b><span>{CREDITS.members.join(' · ')}</span></div>
        </div>
      </div>
      <div className="t2-cast" aria-hidden>
        {(['maya', 'leo', 'juno', 'coach', 'chen'] as const).map((id) => <ArtOr key={id} className={`t2-body b-${id}`} src={bodyArt(id)} fallback={null} />)}
      </div>
      <div className="t2-foot">
        <button className="t2-link" onClick={() => setScreen('collection')}><Award /> Collection{rank.pts > 0 ? <> · <b>{rank.name}</b></> : null}</button>
        <button className="t2-link" onClick={() => setScreen('about')}><BookOpen /> About, data &amp; credits</button>
        <span className="t2-sp" />
        <button className={`t2-icon t2-sound ${settings.sound ? 'on' : ''}`} onClick={() => setSetting('sound', !settings.sound)} aria-label={settings.sound ? 'Sound on' : 'Sound off'} title="Sound">{settings.sound ? <Volume2 /> : <VolumeX />}<small>{settings.sound ? 'Music on' : 'Music off'}</small></button>
        <button className="t2-icon" onClick={() => setSetting('reduceMotion', !settings.reduceMotion)} aria-label={settings.reduceMotion ? 'Motion reduced' : 'Motion full'} title={settings.reduceMotion ? 'Motion: reduced' : 'Motion: full'}><Sparkles /></button>
        <button className="t2-icon" onClick={() => setSetting('graphics', g === 'high' ? 'low' : 'high')} aria-label={g === 'high' ? 'Graphics high' : 'Graphics fast'} title={g === 'high' ? 'Graphics: high' : 'Graphics: fast'}><Gauge /><small>{g === 'high' ? 'High' : 'Fast'}</small></button>
        <span className="t2-note">Teaching model · tokens are not dollars · all neighbours are fictional</span>
      </div>
    </div>
  );
}
