import { useState } from 'react';
import { useGame, defaultGraphics } from '../state/store';
import type { GameData } from '../data/load';
import { A, Param } from '../model/assumptions';
import { CREDITS } from '../content/credits';

const TIER_LABEL: Record<string, string> = { local: 'local source', generic: 'generic table (mapping assumed)', design: 'design choice / standard', teaching: 'teaching assumption' };

function flatten(obj: any, prefix = ''): [string, Param<any>][] {
  const out: [string, Param<any>][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && 'tier' in (v as any) && 'unit' in (v as any)) out.push([prefix + k, v as Param<any>]);
    else if (v && typeof v === 'object') out.push(...flatten(v, prefix + k + '.'));
  }
  return out;
}
const show = (v: any) => (Array.isArray(v) ? v.join(' / ') : typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k} ${x}`).join(', ') : String(v));

export function About({ d }: { d: GameData }) {
  const { setScreen, settings, setSetting, resetProgress } = useGame();
  const params = flatten(A);
  const [armed, setArmed] = useState(false);
  const m = d.manifest;
  return (
    <div className="screen about">
      <div className="inner">
        <button className="btn small" onClick={() => setScreen('title')}>← Back</button>
        <h1>Data, model & credits</h1>
        <section className="about-credit" aria-label="Made by">
          <div className="ac-event"><span>{CREDITS.event}</span><b>{CREDITS.challenge}</b></div>
          <div className="ac-main">
            <small>A game by</small>
            <div className="ac-team">{CREDITS.team}</div>
            <ul className="ac-names">{CREDITS.members.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        </section>
        <p>The prototype was made before the event (2026-10-23/24) and disclosed to the organizers, who allow pre-event work; the canyon season was built on it during the event.</p>

        <h2>Free and non-profit</h2>
        <ul>
          <li>Neutral Ground is a free educational game: no fees, no ads, no accounts. It collects no names, faces or locations; your collection, achievements and settings stay in this browser and can be cleared.</li>
          <li>The four neighbours and Juno are fictional (“Simulated neighbor”). Their concerns echo kinds of disagreement on record for the park — lawn water, trails, natural-area restoration, storms — and speak for no real person or group.</li>
          <li>None of the organisations named in the game has endorsed it.</li>
          <li>Built to stay cheap to keep: a static page that also runs offline as one file; public data only (USGS 3DEP, USDA NAIP, ESA WorldCover, USDA soils, NOAA); each year needs only one more year of NOAA daily rain.</li>
        </ul>

        <h2>The canyon season: how the weather and the two models connect</h2>
        <table>
          <thead><tr><th>Item</th><th>How</th></tr></thead>
          <tbody>
            <tr><td>East slope (daily)</td><td>NOAA downtown SF daily rain (USW00023272, ~{d.weather.station?.distanceKm ?? '?'} km) and ERA5 reference evapotranspiration (a model product), 1 Oct 2020 → 30 Sept 2023</td></tr>
            <tr><td>New Year’s Eve storm (hourly)</td><td>NOAA Oakland airport (OAK) hourly rain, ~{Math.round(d.storms.OAK.distanceKm)} km from the park: {d.storms.OAK.totalMm} mm on 31 Dec 2022, biggest hour {d.storms.OAK.maxHourMm} mm. OAK is used because the full hourly record of this storm comes from the airport; downtown has daily totals only.</td></tr>
            <tr><td>Scaling</td><td>None. Downtown recorded {d.storms.downtownDaily20221231Mm} mm that day ({(d.storms.downtownDaily20221231Mm - d.storms.OAK.totalMm).toFixed(1)} mm more than OAK).</td></tr>
            <tr><td>Soil wetness before the storm</td><td>Average condition (AMC II, an assumption). Downtown had rain on the days before, so real runoff was likely larger.</td></tr>
            <tr><td>Roof tank level</td><td>Empty on 1 October (assumption), then filled by the downtown daily rain day by day up to the storm.</td></tr>
            <tr><td>No double counting</td><td>The east slope and the Rec Center are different parts of the park; no water flows between them in the model. The storm day counts as daily rain on the slope and as hourly rain at the Rec Center, separately. They share only the budget: tokens, and each water year’s sweat and water.</td></tr>
          </tbody>
        </table>

        <h2>Land Degradation Neutrality, as a teaching idea</h2>
        <p>The Neutral Ground check borrows the idea of Land Degradation Neutrality — avoid, then reduce, then reverse; losses balanced only within the same kind of land — as a teaching indicator. It is not an SDG 15.3.1 assessment. 2026 is the UN International Year of Rangelands and Pastoralists, and the UNCCD COP17 was planned for Ulaanbaatar, Mongolia, 17–28 August 2026 (<a href="https://www.unccd.int/index%2ephp/news-stories/stories/mongolia-host-unccd-cop17-august-2026" target="_blank" rel="noreferrer">UNCCD</a>).</p>

        <h2>The next three months</h2>
        <table>
          <thead><tr><th>When</th><th>What</th><th>Done when</th></tr></thead>
          <tbody>
            <tr><td>Month 1</td><td>Play-tests with 2–3 youth groups (adults, or with guardian consent); fix rules and screens from what we observe; write the known simplifications (e.g. AMC II) into a teacher’s guide</td><td>Play-test notes and a list of changes</td></tr>
            <tr><td>Month 2</td><td>A 45-minute lesson guide for teachers and group leaders; Spanish and Chinese; an accessibility check</td><td>The guide and three language versions</td></tr>
            <tr><td>Month 3</td><td>Turn the data scripts into a “new place” recipe; check the data for a second site</td><td>Data list and gap report for site #2</td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: 13 }}>Open questions: licences for code and content; who maintains it after the event. The 2006 management-zone layer stays private until its redistribution licence is checked.</p>
        <p><b>Prototype model · teaching assumptions.</b> Every number in the game is computed in your browser by a small open model (<code>src/model/</code>) from the data below and the teaching assumptions listed at the end of this page — no AI writes numbers. It is not a forecast, an engineering design or a measurement of the park. Game goals are picked from the model’s own results so each level has answers; they are not real-world standards.</p>

        <h2>Where the data comes from</h2>
        <table>
          <thead><tr><th>What</th><th>Licence</th><th>Credit</th></tr></thead>
          <tbody>
            {(m?.sources ?? []).map((s: any) => <tr key={s.id}><td>{s.what}</td><td>{s.licence}</td><td>{s.attribution}</td></tr>)}
            <tr><td>“Where we are” relief map: land, sea floor and shoreline (AWS Terrain Tiles, zoom 13; in the US from USGS 3DEP and other public sources)</td><td>Public data (see the Terrain Tiles attribution)</td><td>Mapzen / Linux Foundation, AWS Open Data; USGS</td></tr>
            <tr><td>Map: parks, bridges and place names (via Nominatim)</td><td>ODbL 1.0</td><td>© OpenStreetMap contributors</td></tr>
            <tr><td>Illustrations: characters, cards, endings, icons, title (made for this prototype with Higgsfield, GPT Image models). All characters are fictional; no animals are drawn.</td><td>Generated for this project</td><td>Neutral Ground team · Higgsfield</td></tr>
            <tr><td>3D characters: the five fictional neighbours as animated 3D figures (Higgsfield: GPT Image 2.5 concept art → Meshy image-to-3D, auto-rigged; moves from the Meshy animation library). Simplified with gltf-transform and meshoptimizer.</td><td>Generated for this project</td><td>Neutral Ground team · Higgsfield · Meshy</td></tr>
            <tr><td>Fonts: Fredoka, Inter (bundled)</td><td>SIL Open Font License</td><td>@fontsource</td></tr>
            <tr><td>Icons</td><td>ISC</td><td>Lucide</td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: 13 }}>Input files and their SHA-256 hashes are listed in <code>public/data/manifest.json</code>. The only photo is the NAIP 2024 aerial image (the satellite button and, faintly, the fine detail on the park’s ground). The island’s outline is the real park boundary (DataSF), grown by about 30 m so the first streets and houses around it show. No personal data is collected; progress and settings stay in this browser only.</p>

        <h2>Every parameter</h2>
        <p>Value, range, unit and where it comes from. “Teaching assumption” means no local source was found; these are shown so you can question them.</p>
        <table>
          <thead><tr><th>Parameter</th><th>Value</th><th>Range</th><th>Unit</th><th>Kind</th><th>Source / note</th></tr></thead>
          <tbody>
            {params.map(([k, p]) => (
              <tr key={k}><td><code>{k}</code></td><td>{show(p.value)}</td><td>{p.range ? `${p.range[0]}–${p.range[1]}` : '—'}</td><td>{p.unit}</td><td>{TIER_LABEL[p.tier]}</td><td>{p.source}{p.note ? ` — ${p.note}` : ''}</td></tr>
            ))}
          </tbody>
        </table>

        <h2>How the model works</h2>
        <ul>
          <li><b>Storm levels (1–2):</b> each 5 m cell makes runoff hour by hour with the SCS curve-number method; water follows the steepest-descent direction (D8) on the lidar surface to the first rain garden or to the drain. Gardens and tanks are buckets solved exactly within each hour (fill, overflow, soak, underdrain). Checked against the project’s 4 + 36 storage check values. Water let out later through a pipe is <i>delayed</i>, never counted as kept out.</li>
          <li><b>Canyon season:</b> the cards of three autumns are mapped onto the same two models below without changing their physics (<code>src/campaign/campaign.ts</code>). New cards change only costs, areas and states: rerouting the shortcut closes the old line exactly as closing does; shade trees by the lawn use the young-tree survival rule and do not change the storm model’s ground. Quests, allies and the eight endings are read off the model results; tests check every ending can be reached.</li>
          <li><b>Level 3:</b> a daily soil-water balance (FAO-56 style) for each kind of ground on real downtown-SF rain and ERA5 reference evapotranspiration, 1 Sept 2020 → 30 Sept 2023. New plantings survive by a teaching rule from their days of severe thirst in the first year. Erosion is a relative index (slope × cover × storm rain), never tonnes. The LDN check compares each kind of land with doing nothing, with no offsetting between kinds and “one indicator worse = net loss”.</li>
          <li><b>Not modelled:</b> pipes, culverts and flooding downstream; travel time; water soaking in again on the way downhill; groundwater; fog; species or animal numbers; shade; weeds; fire.</li>
          <li><b>Habitat faces</b> track habitat conditions, not animal counts. The LDN check is a teaching version, not an official SDG 15.3.1 assessment. 2006 management zones are historical and approximate — not a current approval.</li>
        </ul>

        <h2>Settings</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn small" onClick={() => setSetting('sound', !settings.sound)}>{settings.sound ? 'Sound: on' : 'Sound: off'}</button>
          <button className="btn small" onClick={() => setSetting('reduceMotion', !settings.reduceMotion)}>{settings.reduceMotion ? 'Motion: reduced' : 'Motion: full'}</button>
          <button className="btn small" onClick={() => setSetting('graphics', (settings.graphics ?? defaultGraphics()) === 'high' ? 'low' : 'high')}>{(settings.graphics ?? defaultGraphics()) === 'high' ? 'Graphics: high' : 'Graphics: fast'}</button>
          <button className="btn small" onClick={() => setSetting('aerial', !settings.aerial)}>{settings.aerial ? 'View: aerial photo' : 'View: stylised'}</button>
          <button className="btn small" onClick={() => { if (armed) { resetProgress(); setArmed(false); } else setArmed(true); }}>{armed ? 'Tap again to reset stars' : 'Reset progress'}</button>
        </div>
      </div>
    </div>
  );
}
