import "dotenv/config";
import { snapDecide } from "../src/providers/subquadratic.ts";
const r = await snapDecide("Agent fixed the visible test by caching the promise, but a hidden test shows rejected loads stay cached forever.", {
  weakness: { type: "choice", instructions: "Which engineering weakness does this show?", criteria: { ignored_error_paths: "Did not consider failure/error paths", syntax: "Code did not parse", none: null } },
  systemic: { type: "noul", instructions: "Is this likely to recur on other tasks?" },
}, { probe: true });
console.log(JSON.stringify(r, null, 1));
