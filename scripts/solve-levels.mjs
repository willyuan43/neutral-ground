// solve-levels.mjs — run every allowed layout of levels 1–2 (and the bounded level-3 space) through the prototype model.
// Proves each level has a solution, that the "obvious" move fails, and prints the tables used in NOTES.md.
// Run from prototype/:  node scripts/solve-levels.mjs      (uses tsx to load the TypeScript model)
import { register } from 'tsx/esm/api';
register();
const { main } = await import('./solve-levels-impl.ts');
await main();
