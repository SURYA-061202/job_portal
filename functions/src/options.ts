import { setGlobalOptions } from "firebase-functions/v2/options";

/**
 * Applies to every function. Without a cap each v2 function can scale to 100 instances,
 * which Cloud Run counts against the regional CPU quota when a revision is created
 * ("Quota exceeded for total allowable CPU per project per region" on deploy).
 * Must be imported before any function is defined, so it is the first import in index.ts.
 */
setGlobalOptions({ maxInstances: 10 });
