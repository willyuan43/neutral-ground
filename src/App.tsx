import { useEffect, useState, Component, ReactNode } from 'react';
import { useGame } from './state/store';
import { loadGameData } from './data/load';
import { TitleScreen } from './ui/TitleScreen';
import { LevelSelect } from './ui/LevelSelect';
import { StormLevel } from './ui/StormLevel';
import { SlopeLevel } from './ui/SlopeLevel';
import { About } from './ui/About';
import { Campaign } from './ui/campaign/Campaign';
import { CollectionScreen } from './ui/Collection';
import { sfx } from './audio/sfx';
import { CharTest } from './ui/CharTest';

class Boundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: any) { return { err: String(e?.message ?? e) }; }
  render() {
    if (this.state.err) return (
      <div className="fatal">
        <h2>Something broke in the prototype.</h2>
        <p>{this.state.err}</p>
        <button className="btn" onClick={() => location.reload()}>Reload</button>
      </div>
    );
    return this.props.children;
  }
}

export function App() {
  const { screen, data, setData, settings } = useGame();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadGameData().then(setData).catch((e) => setErr(String(e?.message ?? e))); }, [setData]);
  // deep links: #campaign #level1 #level2 #level3 #levels #about (handy for testing and demos)
  useEffect(() => {
    const go = () => { const h = location.hash.replace('#', ''); if (['campaign', 'collection', 'level1', 'level2', 'level3', 'levels', 'about', 'title'].includes(h)) useGame.getState().setScreen(h as any); };
    go(); window.addEventListener('hashchange', go); return () => window.removeEventListener('hashchange', go);
  }, []);
  useEffect(() => { sfx.enabled = settings.sound; sfx.soundChanged(); }, [settings.sound]);
  useEffect(() => { document.documentElement.dataset.reduceMotion = settings.reduceMotion ? '1' : '0'; }, [settings.reduceMotion]);
  if (location.hash === '#chartest') return <CharTest />;
  if (err) return <div className="fatal"><h2>Could not load the canyon data</h2><p>{err}</p></div>;
  if (!data) return <div className="loading"><div className="logo-mark" /><p>Loading the canyon…</p></div>;
  return (
    <Boundary>
      {screen === 'title' && <TitleScreen d={data} />}
      {screen === 'levels' && <LevelSelect d={data} />}
      {screen === 'level1' && <StormLevel key="l1" d={data} level={1} />}
      {screen === 'level2' && <StormLevel key="l2" d={data} level={2} />}
      {screen === 'level3' && <SlopeLevel key="l3" d={data} />}
      {screen === 'about' && <About d={data} />}
      {screen === 'campaign' && <Campaign key="campaign" d={data} />}
      {screen === 'collection' && <CollectionScreen />}
    </Boundary>
  );
}
