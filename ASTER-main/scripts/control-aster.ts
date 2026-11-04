#!/usr/bin/env -S node --experimental-strip-types
// ASTER control CLI forwarding to control-omb engine.
import { pathToFileURL } from "node:url";
import { ControlOmbError, main } from "./control-omb.ts";

export * from "./control-omb.ts";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const failure = error instanceof ControlOmbError
      ? { ok: false, error: error.message, ...(error.hint ? { hint: error.hint } : {}) }
      : { ok: false, error: error instanceof Error ? error.message : String(error) };
    process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
    process.exitCode = 1;
  });
}
