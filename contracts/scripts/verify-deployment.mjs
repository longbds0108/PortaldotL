// Checks that the contracts deployed on PortaldotV3 Testnet are exactly what this repo compiles to.
//
//   forge build && node scripts/verify-deployment.mjs
//
// For each contract it compares, byte for byte:
//   1. the deployment transaction's input with the local creation bytecode + ABI-encoded constructor arguments;
//   2. the runtime code on chain (eth_getCode) with the local runtime bytecode. Immutable slots are filled by
//      the constructor at deploy time, so those bytes are compared after writing the expected value into the
//      local code, and the value is printed.
// No metadata hash is compiled in (foundry.toml / hardhat.config.cjs), so a match is exact. Exits 1 on any mismatch.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "out");
const rpcUrl = process.env.PORTALDOTV3_TESTNET_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev";
const CHAIN_ID = 420420777;
const TREASURY = "0xf9642b695d4ddf58599c953a791f94c2e96b6a57";

const DEPLOYMENTS = [
  { name: "BlindBidMarket", address: "0x6e79287f62B47307B5b7349072c51AdAF8833d54", tx: "0xd2417fb17449e36e563886733176d7a38277c790ecfa778cdd6b49ebedf3e5ff", args: [TREASURY] },
  { name: "SealedNFTAuction", address: "0xc05A1f041a42FFa96FC24a3aeBc576b1157aA7F6", tx: "0x281d6c5415001d351223d3bcbf156b283c2df2855b1afdc1e917d02d58aa43c9", args: [TREASURY] },
  { name: "PlinthsTestNFT", address: "0xb64BE4189Dc4F0f105369D02CA91C485199d6fcd", tx: "0xa0410e638c77c1b23665596ca697424a155e9f97ba461ee6bc5f06679dee8249", args: [] },
  { name: "DisputeRegistry", address: "0x1F8A235387763A67E4f293E1bDFC65E149437120", tx: "0xc457cb73d70bcd2a0295139edcddf2de45ae20278f1f1852b8ebd1dc0017b042", args: [TREASURY] },
];

async function rpc(method, params) {
  const res = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

const hex = (s) => s.toLowerCase().replace(/^0x/, "");
const word = (address) => hex(address).padStart(64, "0"); // every constructor argument here is an address

const chainId = parseInt(await rpc("eth_chainId", []), 16);
if (chainId !== CHAIN_ID) throw new Error(`Expected chain ${CHAIN_ID}, RPC reports ${chainId}.`);
console.log(`RPC ${rpcUrl} · chain ${chainId} · block ${parseInt(await rpc("eth_blockNumber", []), 16)}\n`);

let failures = 0;
for (const d of DEPLOYMENTS) {
  const artifact = JSON.parse(await readFile(path.join(out, `${d.name}.sol`, `${d.name}.json`), "utf8"));
  const creation = hex(artifact.bytecode.object);
  const [tx, receipt, onchain] = await Promise.all([
    rpc("eth_getTransactionByHash", [d.tx]),
    rpc("eth_getTransactionReceipt", [d.tx]),
    rpc("eth_getCode", [d.address, "latest"]).then(hex),
  ]);

  const deployedHere = receipt?.status === "0x1" && receipt.contractAddress?.toLowerCase() === d.address.toLowerCase();
  const creationMatch = hex(tx.input) === creation + d.args.map(word).join("");

  // Write each immutable's on-chain value into the local runtime code, then require an exact match.
  let runtime = hex(artifact.deployedBytecode.object);
  const values = new Set();
  for (const { start, length } of Object.values(artifact.deployedBytecode.immutableReferences ?? {}).flat()) {
    const value = onchain.slice(start * 2, (start + length) * 2);
    values.add("0x" + value);
    runtime = runtime.slice(0, start * 2) + value + runtime.slice((start + length) * 2);
  }
  const runtimeMatch = runtime === onchain;
  const immutablesOk = [...values].every((v) => hex(v) === word(TREASURY));

  const ok = deployedHere && creationMatch && runtimeMatch && immutablesOk;
  if (!ok) failures++;
  console.log(`${ok ? "MATCH" : "MISMATCH"}  ${d.name} @ ${d.address}`);
  console.log(`  deployment tx ${d.tx} (block ${parseInt(tx.blockNumber, 16)}, from ${tx.from}) created this address: ${deployedHere}`);
  console.log(`  tx input == local creation bytecode (${creation.length / 2} B) + constructor args (${d.args.length * 32} B): ${creationMatch}`);
  console.log(`  on-chain runtime (${onchain.length / 2} B) == local runtime with immutables filled in: ${runtimeMatch}`);
  console.log(`  immutables: ${values.size ? [...values].join(", ") + ` (treasury: ${immutablesOk})` : "none"}\n`);
}

console.log(failures ? `${failures} of ${DEPLOYMENTS.length} contracts do not match.` : `All ${DEPLOYMENTS.length} deployed contracts match this repo's build exactly.`);
process.exit(failures ? 1 : 0);
