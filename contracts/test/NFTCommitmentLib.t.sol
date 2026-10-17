// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NFTCommitmentLib} from "../src/NFTCommitmentLib.sol";

/// @dev Same fixture is asserted by web/lib/nft-commitment.test.ts, so TS and Solidity hash identically.
contract NFTCommitmentLibTest is Test {
    function test_matchesSharedVectors() public view {
        string memory json = vm.readFile("test/fixtures/nft-commitment-vectors.json");
        for (uint256 i; i < 3; i++) {
            string memory p = string.concat(".vectors[", vm.toString(i), "]");
            uint256 auctionId = vm.parseUint(vm.parseJsonString(json, string.concat(p, ".auctionId")));
            address bidder = vm.parseJsonAddress(json, string.concat(p, ".bidder"));
            uint256 amount = vm.parseUint(vm.parseJsonString(json, string.concat(p, ".amount")));
            bytes32 salt = vm.parseJsonBytes32(json, string.concat(p, ".salt"));
            bytes32 expected = vm.parseJsonBytes32(json, string.concat(p, ".commitment"));
            assertEq(NFTCommitmentLib.compute(auctionId, bidder, amount, salt), expected);
        }
    }

    function testFuzz_bindsEveryField(uint256 id, address bidder, uint256 amount, bytes32 salt) public pure {
        vm.assume(amount < type(uint256).max && id < type(uint256).max);
        bytes32 c = NFTCommitmentLib.compute(id, bidder, amount, salt);
        assertTrue(c != NFTCommitmentLib.compute(id + 1, bidder, amount, salt));
        assertTrue(c != NFTCommitmentLib.compute(id, bidder, amount + 1, salt));
        assertTrue(c != NFTCommitmentLib.compute(id, bidder, amount, ~salt));
        assertTrue(c != NFTCommitmentLib.compute(id, address(uint160(bidder) ^ 1), amount, salt));
    }
}
