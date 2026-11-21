import { setGlobalOptions } from "firebase-functions/v2/options";

/**
 * Applies to every function. Cloud Run counts (CPU per instance x maxInstances) for every
 * function against the regional CPU quota when a revision is created, and a deploy fails with
 * "Quota exceeded for total allowable CPU per project per region" once the total is too high.
 *
 * With ~30 functions, the old setting (1 CPU x 10 instances each) reserved ~300 CPUs. This keeps
 * the total near 10: a fraction of a CPU per instance ("gcf_gen1" is the 1st-gen sizing, e.g.
 * 0.167 CPU at 256 MB) and at most 2 instances. Each instance then handles one request at a
 * time, which is plenty for this app's traffic.
 *
 * If the site grows, raise maxInstances (per function, in its own options, for the busy ones)
 * after requesting a higher "Total CPU allocation" quota for Cloud Run in us-central1.
 *
 * Must be imported before any function is defined, so it is the first import in index.ts.
 */
setGlobalOptions({ maxInstances: 2, cpu: "gcf_gen1" });
