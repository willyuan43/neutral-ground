// SCS curve-number runoff (docs/04 B and N).

/** Potential maximum retention S (mm) for a curve number. */
export const retentionS = (cn: number) => 25400 / cn - 254;

/** Event (cumulative) runoff depth Q (mm) for rainfall P (mm), curve number CN, Ia = ratio × S. */
export function scsRunoff(P: number, cn: number, iaRatio = 0.2): number {
  const S = retentionS(cn);
  const Ia = iaRatio * S;
  if (P <= Ia) return 0;
  return ((P - Ia) * (P - Ia)) / (P - Ia + S);
}

/**
 * Hourly runoff depths (mm) from hourly effective rain depths (mm): cumulative SCS-CN, differenced.
 * docs/04 N: Q_cum(t) = (P_cum − 0.2S)² / (P_cum + 0.8S); hour runoff = Q_cum(t) − Q_cum(t−1).
 */
export function scsHourly(rain: number[], cn: number, iaRatio = 0.2): number[] {
  const out: number[] = [];
  let pc = 0;
  let qPrev = 0;
  for (const r of rain) {
    pc += r;
    const q = scsRunoff(pc, cn, iaRatio);
    out.push(Math.max(0, q - qPrev));
    qPrev = q;
  }
  return out;
}
