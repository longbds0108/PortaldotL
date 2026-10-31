#!/usr/bin/env python3
"""Checks that the invariant suites catch real bugs: breaks one line at a time in a throwaway copy of the contracts,
then expects the invariants to fail. Never touches the working tree.

    cd contracts && python3 scripts/mutation-check.py /path/to/empty/workdir
"""
import os
import re
import shutil
import subprocess
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
work = sys.argv[1]
M=[("double bond withdrawal","src/v2/BlindBidMarketV2.sol","        b.bondWithdrawn = true;\n","","MarketV2Invariants"),
("double sweep","src/v2/BlindBidMarketV2.sol","        t.forfeitSwept = true;\n","","MarketV2Invariants"),
("budget check removed","src/v2/BlindBidMarketV2.sol","        if (amount < t.budgetMin || amount > t.budgetMax) revert BidOutOfBudget();\n","","MarketV2Invariants"),
("unrevealed bond withdrawable","src/v2/BlindBidMarketV2.sol","if (!b.revealed || b.bondWithdrawn || b.bond == 0)","if (b.bondWithdrawn || b.bond == 0)","MarketV2Invariants"),
("V1 double bond withdrawal","src/BlindBidMarket.sol","        b.bondWithdrawn = true;\n","","MarketV1Invariants"),
("double seller proceeds","src/v2/SealedNFTAuctionV2.sol","            a.proceedsPaid = true;\n","","AuctionV2Invariants"),
("double bidder withdraw","src/v2/SealedNFTAuctionV2.sol","            b.withdrawn = true;\n","","AuctionV2Invariants"),
("NFT delivered to seller instead of winner","src/v2/SealedNFTAuctionV2.sol","if (to == address(0)) to = a.seller;","to = a.seller;","AuctionV2Invariants"),
("penalty skipped","src/v2/SealedNFTAuctionV2.sol","if (penalty != 0) _send(treasury, penalty);","","AuctionV2Invariants"),
("winner keeps price","src/SealedNFTAuction.sol","payout = b.deposit - a.highestBid;","payout = b.deposit;","AuctionV1Invariants"),
]
shutil.rmtree(work, ignore_errors=True)
os.makedirs(work)
for n in ["src", "test", "foundry.toml", "remappings.txt"]:
    s = os.path.join(root, n)
    (shutil.copytree if os.path.isdir(s) else shutil.copy)(s, os.path.join(work, n))
os.symlink(os.path.join(root, "lib"), os.path.join(work, "lib"))
missed = 0
for name, f, a, b, suite in M:
    p = os.path.join(work, f)
    orig = open(p).read()
    assert a in orig, name
    open(p, "w").write(orig.replace(a, b, 1))
    env = dict(os.environ, FOUNDRY_INVARIANT_SHOW_METRICS="false")
    r = subprocess.run(["forge", "test", "--match-contract", suite], cwd=work, env=env, capture_output=True, text=True)
    named = sorted(set(re.findall(r"invariant_\w+", "\n".join(l for l in r.stdout.splitlines() if "FAIL" in l))))
    print(f"{'CAUGHT' if r.returncode else 'MISSED'}  {name}  [{suite}] {named}", flush=True)
    missed += r.returncode == 0
    open(p, "w").write(orig)
print(f"{len(M) - missed}/{len(M)} mutants caught")
sys.exit(1 if missed else 0)
