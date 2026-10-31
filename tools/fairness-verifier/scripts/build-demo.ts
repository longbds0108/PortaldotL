/*
 * Builds the file the /demo page shows, from a verifier report. The provenance is required and is shown on the page.
 *
 *   tsx scripts/build-demo.ts --report <report.json> --provenance LOCAL_CHAIN|TESTNET_HISTORICAL --out <lifecycle.json>
 *
 * It never creates transactions: every hash on the page comes from the report.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Report } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const args = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args.set(argv[i].replace(/^--/, ""), argv[i + 1]);

const provenance = args.get("provenance");
if (provenance !== "LOCAL_CHAIN" && provenance !== "TESTNET_HISTORICAL") throw new Error("--provenance must be LOCAL_CHAIN or TESTNET_HISTORICAL");
const report = JSON.parse(readFileSync(args.get("report")!, "utf8")) as Report;
if (provenance === "TESTNET_HISTORICAL" && report.subject.chainId !== 420420777) throw new Error("That report is not from PortaldotV3 Testnet");
if (provenance === "LOCAL_CHAIN" && report.subject.chainId === 420420777) throw new Error("That report is from PortaldotV3 Testnet, so it should not be labeled local");

const story = JSON.parse(readFileSync(resolve(here, args.get("story") ?? "demo-story.json"), "utf8")) as object;
writeFileSync(args.get("out")!, `${JSON.stringify({ format: "plinths.demo/1", provenance, story, report }, null, 2)}\n`);
console.log(`Wrote ${args.get("out")} (${provenance}, ${report.result})`);
