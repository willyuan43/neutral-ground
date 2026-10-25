// Analytic piecewise "bucket" solver for one time step (docs/04 C).
// Within a step the inflow arrives at a constant rate; all outlets (infiltration, underdrain, release …)
// run at constant rates while there is water; full → overflow; empty → outlets share the inflow pro rata.
// Exact (no sub-steps), so the hour in which a tank fills is handled correctly.

export interface BucketStep {
  storage: number; // end storage (m³)
  out: number[]; // volume through each outlet during the step (m³)
  overflow: number; // spilled because full (m³)
  fullAt: number | null; // time (h, from step start) when it became full during the step, if it did
}

/**
 * @param s0 storage at step start (m³)
 * @param cap capacity (m³)
 * @param vin inflow volume during the step (m³), uniform in time
 * @param rates outlet rates (m³/h) that run whenever storage > 0
 * @param dt step length (h)
 */
export function bucketStep(s0: number, cap: number, vin: number, rates: number[], dt = 1): BucketStep {
  const R = rates.reduce((a, b) => a + b, 0);
  const qin = vin / dt;
  const out = rates.map(() => 0);
  let overflow = 0;
  let s = Math.min(Math.max(s0, 0), cap);
  let t = 0;
  let fullAt: number | null = null;
  const EPS = 1e-12;
  // iterate over at most three regimes (filling/draining → full/empty → stay)
  for (let guard = 0; guard < 4 && t < dt - EPS; guard++) {
    const rem = dt - t;
    const atEmpty = s <= EPS;
    const atFull = s >= cap - EPS;
    if (atEmpty && qin <= R) {
      // empty: outlets take the inflow pro rata, storage stays 0
      if (R > 0) rates.forEach((r, k) => (out[k] += (r / R) * qin * rem));
      else overflow += qin * rem; // no outlets and no capacity to fill? (cap 0) → passes through
      s = 0;
      t = dt;
      break;
    }
    if (atFull && qin >= R) {
      rates.forEach((r, k) => (out[k] += r * rem));
      overflow += (qin - R) * rem;
      s = cap;
      if (fullAt === null) fullAt = t;
      t = dt;
      break;
    }
    const q = qin - R; // net rate while 0 < s < cap
    let tau = rem;
    if (q > EPS) tau = Math.min(rem, (cap - s) / q);
    else if (q < -EPS) tau = Math.min(rem, s / -q);
    rates.forEach((r, k) => (out[k] += r * tau));
    s += q * tau;
    if (q > EPS && Math.abs(s - cap) < 1e-9) { s = cap; if (fullAt === null) fullAt = t + tau; }
    if (q < -EPS && Math.abs(s) < 1e-9) s = 0;
    t += tau;
    if (Math.abs(q) <= EPS) { t = dt; break; }
  }
  return { storage: s, out, overflow, fullAt };
}

/** Run a whole series (e.g. 24 hourly inflows). Returns per-step results. */
export function bucketSeries(s0: number, cap: number, vins: number[], rates: number[]): BucketStep[] {
  const res: BucketStep[] = [];
  let s = s0;
  for (const v of vins) {
    const r = bucketStep(s, cap, v, rates);
    res.push(r);
    s = r.storage;
  }
  return res;
}
