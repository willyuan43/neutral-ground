// The “why” chain (T7): from the historical weather to a result, each link tagged observed / model / assumption.
// Sentences are templates; every number is read from the data or the model run.
import { A } from '../model/assumptions';
import { EST_YEARS } from '../model/slope';
import type { CampaignResult } from '../campaign/campaign';

export interface WhyStep { text: string; tier: 'observed' | 'model' | 'assumption' }
export interface WhyFacts { wyRainMm: number[]; stationKm: number; oakKm: number; oakMaxHourMm: number }

export function whyChain(k: string, r: CampaignResult, base: CampaignResult, f: WhyFacts): WhyStep[] | null {
  const g = r.slope.cohorts.find((c) => c.kind === 'grass' && c.cls === 'grassland');
  if (k === 'native' || k === 'grassland' || k === 'erosion') return [
    { text: `Rain: downtown SF daily record (~${f.stationKm} km away) — water years ${f.wyRainMm.map((v, i) => `${2021 + i}: ${v} mm`).join(', ')}.`, tier: 'observed' },
    { text: 'Ground: slope steepness from the 5 m lidar (USGS 3DEP); cover from ESA WorldCover 2021.', tier: 'observed' },
    { text: `Daily soil water for each kind of ground (FAO-56 style, curve-number runoff); evapotranspiration from ERA5.`, tier: 'model' },
    g ? { text: `Seedlings: survival = ${A.sMax.value} − ${A.kPerSevereDay.value} × days of severe thirst (min ${A.sMin.value}); this planting had ${g.severeDays} such days → ${Math.round((g.survival ?? 0) * 100)}%. Grass counts as established ${EST_YEARS.grass} years after it survives.`, tier: 'assumption' }
      : { text: `Nothing planted: the slope follows the weather on its own.`, tier: 'model' },
    k === 'erosion' ? { text: `Erosion index = slope × cover factor × storm rain over ${A.erosiveRainMm.value} mm a day — relative, no tonnes. Result: ×${r.slope.ldn.grassland.erosion.ratio.toFixed(2)} vs doing nothing in water year 2023.`, tier: 'model' }
      : { text: `Result: ${Math.round(r.slope.establishedNative).toLocaleString('en-US')} m² established by 30 Sept 2023 (doing nothing ${Math.round(base.slope.establishedNative).toLocaleString('en-US')}); grassland check ${r.slope.ldn.grassland.status.replace('_', ' ')}.`, tier: 'model' },
  ];
  if (k === 'peak') return [
    { text: `Rain: Oakland airport hourly record, 31 Dec 2022 (~${f.oakKm} km away), biggest hour ${f.oakMaxHourMm} mm.`, tier: 'observed' },
    { text: 'Where water runs: D8 flow paths on the 5 m lidar; roofs and paving from DataSF and OpenStreetMap.', tier: 'observed' },
    { text: 'Runoff each hour from curve numbers (generic TR-55 values mapped to local covers; average soil wetness before the storm).', tier: 'assumption' },
    { text: `Gardens: ${A.rgPondingM.value} m ponding + ${A.rgMediaM.value} m soil; slow soils get an underdrain pipe (${A.underdrainRate.value} mm/h) — later, not less.`, tier: 'assumption' },
    { text: `Result: ${r.storm.peakM3.toFixed(1)} m³ in the biggest hour into the drain (doing nothing ${base.storm.peakM3.toFixed(1)}).`, tier: 'model' },
  ];
  if (k === 'tank') return [
    { text: 'Rain before the storm: downtown SF daily record from 1 Oct 2022.', tier: 'observed' },
    { text: 'The tank starts empty on 1 Oct; a tank kept for watering only fills in the rainy season.', tier: 'assumption' },
    { text: `Result: ${r.tankMay1?.toFixed(1)} m³ on 1 May 2023.`, tier: 'model' },
  ];
  if (k === 'shade') { const c = r.shade[0]; return c ? [
    { text: `Rain: downtown SF daily record, water year ${2021 + c.year}.`, tier: 'observed' },
    { text: `Young trees watered their first year; ${c.severeDays} days of severe thirst in the model → ${Math.round(c.survival * 100)}% survive (teaching rule).`, tier: 'assumption' },
    { text: `Result: ${c.alive} of ${c.planted} alive (planted × survival, rounded down).`, tier: 'model' },
  ] : null; }
  return null;
}
