// Collection page (T11): the eight endings and the achievements, with silhouettes and a hint for the ones not found yet.
import { useState } from 'react';
import { useGame } from '../state/store';
import { getCollection, clearCollection } from '../state/collection';
import { ENDINGS } from '../content/endings';
import { ENDING_IDS } from '../campaign/campaign';
import { shownAchievements } from '../content/achievements';
import { ArtOr } from './ArtBits';
import { endingArt, iconArt } from './art';
import { DECOR } from '../stage/Decor';

export function CollectionScreen() {
  const { setScreen } = useGame();
  const [c, setC] = useState(getCollection());
  const [armed, setArmed] = useState(false);
  const ach = shownAchievements();
  return (
    <div className="screen about collection">
      <div className="inner">
        <button className="btn small" onClick={() => setScreen('title')}>← Back</button>
        <h1>Collection</h1>
        <p>Endings found and achievements earned in this browser ({c.seasons} season{c.seasons === 1 ? '' : 's'} played). Nothing leaves this device.</p>
        <h2>Endings · {c.endings.length} of {ENDING_IDS.length}</h2>
        <div className="col-grid">
          {ENDING_IDS.map((e) => { const got = c.endings.includes(e); return (
            <div key={e} className={`col-card ending-tile ${got ? 'got' : 'not'}`}><ArtOr className="col-art" src={endingArt(e)} fallback={<div className="col-ico" aria-hidden>{got ? '◆' : '◇'}</div>} /><b>{got ? ENDINGS[e].title : '? ? ?'}</b><span>{got ? ENDINGS[e].sub : 'Not found yet. Every ending has a way in — try different neighbours.'}</span></div>
          ); })}
        </div>
        <h2>Achievements · {c.achievements.filter((x) => ach.some((a) => a.id === x)).length} of {ach.length}</h2>
        <div className="col-grid">
          {ach.map((a) => { const got = c.achievements.includes(a.id); return (
            <div key={a.id} className={`col-card ${got ? 'got' : 'not'} ${a.bad ? 'bad' : ''}`}><div className="col-ico" aria-hidden>{got && !a.bad ? <ArtOr className="col-star" src={iconArt('star')} fallback="★" /> : got ? '✖' : '☆'}</div><b>{a.name}{a.bad ? ' (the hard way)' : ''}</b><span>{got ? a.how : a.hint}</span></div>
          ); })}
        </div>
        <h2>Your island · {DECOR.filter((x) => c.achievements.includes(x.from)).length} of {DECOR.length} decorations</h2>
        <div className="col-grid">
          {DECOR.map((x) => { const got = c.achievements.includes(x.from); const a = ach.find((q) => q.id === x.from); return (
            <div key={x.id} className={`col-card ${got ? 'got' : 'not'}`}><div className="col-ico" aria-hidden style={{ fontSize: 30 }}>{got ? x.emoji : '🔒'}</div><b>{x.name}</b><span>{got ? 'On your island (a decoration you earned — not a model result)' : `Earn “${a?.name}”: ${a?.hint}`}</span></div>
          ); })}
        </div>
        <h2>Field notes · {(c.places ?? []).length} real places found</h2>
        <p style={{ fontSize: 13 }}>{(c.places ?? []).length ? (c.places ?? []).join(' · ') : 'Tap the place names on the map (Layers → Places nearby) to collect them.'} <span className="tag obs">OpenStreetMap</span></p>
        <p style={{ fontSize: 13 }}>Correct guesses so far: {c.correctGuesses}.</p>
        <button className="btn small" onClick={() => { if (armed) { clearCollection(); setC(getCollection()); setArmed(false); } else setArmed(true); }}>{armed ? 'Tap again to clear the collection' : 'Clear the collection'}</button>
      </div>
    </div>
  );
}
