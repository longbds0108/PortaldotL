#!/usr/bin/env -S npx tsx
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, keccak256, type Address, type Hex } from "viem";
import { verifyAuction } from "./auction.js";
import { artifactMatcher } from "./common.js";
import { collectEvidence } from "./evidence.js";
import { verifyTender } from "./tender.js";
import { EXIT_CODE, type Evidence, type Kind, type VerifyOptions } from "./types.js";

const USAGE = `Rechecks a Plinths tender or auction from chain data.

  npm run verify -- --rpc <URL> --contract <ADDRESS> --tender <ID>
  npm run verify -- --rpc <URL> --contract <ADDRESS> --auction <ID>
  npm run verify -- --evidence <FILE> [--contract-version 1|2] [--artifact <FILE>]

Options
  --from-block <N>        First block to scan (default: the pinned deploy block, otherwise 0)
  --confirmations <N>     Depth required when the RPC has no finalized tag (default 12)
  --chain-id <N>          Fail unless the evidence is from this chain
  --artifact <FILE>       Forge artifact you compiled; the runtime code is compared to it
  --contract-version <N>  Version to assume with --artifact: 1 or 2
  --reason-file <FILE>    The award reason document, checked against its on-chain digest
  --save-evidence <FILE>  Write everything read from the chain, for replay with --evidence
  --out <FILE>            Write the report here as well as to stdout

Exit codes: 0 VERIFIED, 1 FAILED, 2 INCOMPLETE, 3 UNSUPPORTED, 64 bad usage`;

const here = dirname(fileURLToPath(import.meta.url));

type Pin = { chainId: number; address: string; kind: Kind; version: 1 | 2; deployBlock: number; runtimeKeccak: Hex };
const PINS = (JSON.parse(readFileSync(resolve(here, "deployments.json"), "utf8")) as { deployments: Pin[] }).deployments;

function parseArgs(argv: string[]) {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--") || i + 1 >= argv.length) throw new Error(`Bad argument: ${a}`);
    out.set(a.slice(2), argv[++i]);
  }
  return out;
}

function pinOf(chainId: number, contract: string, kind: Kind) {
  return PINS.find((p) => p.chainId === chainId && p.kind === kind && p.address.toLowerCase() === contract.toLowerCase());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tender = args.get("tender");
  const auction = args.get("auction");
  const evidenceFile = args.get("evidence");
  let evidence: Evidence;

  if (evidenceFile) {
    evidence = JSON.parse(readFileSync(evidenceFile, "utf8")) as Evidence;
    if (evidence.format !== "plinths.evidence/1") throw new Error(`Unsupported evidence format: ${evidence.format}`);
  } else {
    const rpc = args.get("rpc");
    const contract = args.get("contract");
    if (!rpc || !contract || (tender === undefined) === (auction === undefined)) throw new Error("Need --rpc, --contract and one of --tender / --auction");
    const kind: Kind = tender !== undefined ? "tender" : "auction";
    const address = getAddress(contract) as Address;
    const pin = PINS.find((p) => p.kind === kind && p.address.toLowerCase() === address.toLowerCase());
    const fromBlock = args.has("from-block") ? BigInt(args.get("from-block")!) : pin ? BigInt(pin.deployBlock) : 0n;
    evidence = await collectEvidence({ rpc, contract: address, kind, roundId: BigInt((tender ?? auction)!), fromBlock });
    if (args.has("save-evidence")) writeFileSync(args.get("save-evidence")!, `${JSON.stringify(evidence, null, 2)}\n`);
  }

  const version = args.get("contract-version");
  if (version !== undefined && version !== "1" && version !== "2") throw new Error("--contract-version must be 1 or 2");
  const opts: VerifyOptions = {
    confirmations: Number(args.get("confirmations") ?? 12),
    expectedChainId: args.has("chain-id") ? Number(args.get("chain-id")) : undefined,
    reasonDocument: args.has("reason-file") ? new Uint8Array(readFileSync(args.get("reason-file")!)) : undefined,
  };
  if (args.has("artifact")) {
    const path = args.get("artifact")!;
    opts.expectedCode = artifactMatcher(JSON.parse(readFileSync(path, "utf8")) as Parameters<typeof artifactMatcher>[0], `compiled artifact ${path}`);
    opts.knownVersion = version ? (Number(version) as 1 | 2) : undefined;
  } else {
    const pin = pinOf(evidence.chainId, evidence.contract, evidence.kind);
    if (pin) {
      opts.knownVersion = pin.version;
      opts.expectedCode = {
        source: "pinned",
        description: "deployment pinned in deployments.json",
        matches: (code) => ({ ok: keccak256(code) === pin.runtimeKeccak }),
      };
    }
  }

  const report = evidence.kind === "tender" ? verifyTender(evidence, opts) : verifyAuction(evidence, opts);
  const text = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(text);
  if (args.has("out")) writeFileSync(args.get("out")!, text);

  const fails = report.checks.filter((c) => c.status !== "PASS");
  console.error(`\n${report.result}: ${report.subject.kind} ${report.subject.roundId}, outcome ${report.outcome.status}`);
  for (const c of fails) console.error(`  ${c.status.padEnd(12)} ${c.id}: ${c.detail}`);
  process.exit(report.exitCode);
}

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  // A network failure is missing evidence, not a verdict about the tender.
  const usage = /^(Need|Bad argument|--contract-version|Unsupported evidence|Address)/.test(message) || /invalid address/i.test(message);
  console.error(usage ? `${message}\n\n${USAGE}` : `Could not gather evidence: ${message}`);
  process.exit(usage ? 64 : EXIT_CODE.INCOMPLETE);
});
