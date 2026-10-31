#!/usr/bin/env bash
# The two Demo Day security scenarios, about a minute each. Local EVM only: nothing is deployed or signed.
#   bash tools/demo/attack-regressions.sh
set -uo pipefail
cd "$(dirname "$0")/../../contracts"

show() {
  echo
  echo "── $1"
  forge test --match-contract SecurityRegressions --match-test "$2" 2>/dev/null | grep -E '^\[(PASS|FAIL)|^Suite result|^Ran [0-9]+ test suite' | grep -vE '^Ran .* tests for'
}

echo "A [PASS] on a test_V1_ line means the weakness is real in the deployed source."
echo "A [PASS] on a test_V2_ line means the fix rejects the same steps."

show "Scenario 1, V1: a buyer awards a bid outside the published budget. It goes through." 'test_V1_award'
show "Scenario 1, V2: the same award reverts with BidOutOfBudget." 'test_V2_award'
show "Scenario 2, V1: one commitment opens on a second contract, and matches on another chain." 'test_V1_commitment'
show "Scenario 2, V2: the same replay reverts with CommitmentMismatch." 'test_V2_commitment'

echo
echo "── After the fact: the verifier flags the out-of-budget award V1 really accepted on a local chain."
cd ../tools/fairness-verifier
node -e '
  const r = require("./test/fixtures/v1-out-of-budget.report.json");
  const b = r.checks.find((c) => c.id === "budget");
  console.log(r.result + " (exit code " + r.exitCode + ")\n  " + b.status + " budget: " + b.detail);
'
