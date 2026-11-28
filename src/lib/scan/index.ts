import "server-only";
import { app, kickio } from "../db";
import { runScan, type ScanOptions } from "./run";
import { checkSources } from "./source-check";

// Runs a scan against the configured databases.
export function scanNow(opts: ScanOptions) {
  return runScan({ kickio: kickio(), app: app() }, opts);
}

// Reads eBay / Vinted listing pages for open opportunities (see source-check).
export function checkSourceListings() {
  return checkSources(app());
}
