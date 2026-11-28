import "server-only";
import { app, kickio } from "../db";
import { runScan, type ScanOptions } from "./run";

// Runs a scan against the configured databases.
export function scanNow(opts: ScanOptions) {
  return runScan({ kickio: kickio(), app: app() }, opts);
}
