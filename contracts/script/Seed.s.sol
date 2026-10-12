// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {BlindBidMarket} from "../src/BlindBidMarket.sol";

/// @notice Testnet-only demo data (CLAUDE.md §8): never hardcoded in the UI.
///         Metadata is inlined as data: URIs so seeding needs no IPFS credentials.
///         BLINDBID_ADDRESS=0x... arc-forge script script/Seed.s.sol --rpc-url $ARC_TESTNET_RPC_URL --broadcast
contract Seed is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        BlindBidMarket market = BlindBidMarket(vm.envAddress("BLINDBID_ADDRESS"));
        uint64 nowTs = uint64(block.timestamp);

        vm.startBroadcast(pk);
        uint256 a = market.createTender(
            _meta(
                "Enterprise Website Development",
                "Technology",
                "Design and build a responsive corporate website with CMS, multilingual support and SEO setup.",
                "Portfolio of 3+ comparable projects; delivery within 8 weeks."
            ),
            5_000e6,
            10_000e6,
            nowTs + 2 days,
            nowTs + 3 days,
            1 ether // 1 USDC bid bond (native, 18 decimals)
        );
        uint256 b = market.createTender(
            _meta(
                "Commercial Building Renovation",
                "Construction",
                "Interior renovation of a 2-floor office (600 m2): partitions, electrical, HVAC and finishing.",
                "Licensed contractor; safety record; 12-month warranty."
            ),
            80_000e6,
            120_000e6,
            nowTs + 4 days,
            nowTs + 5 days,
            5 ether
        );
        uint256 c = market.createTender(
            _meta(
                "Digital Marketing Campaign",
                "Services",
                "Three-month multi-channel campaign (social, search, email) for a product launch.",
                "Case studies with measurable results; monthly reporting."
            ),
            3_000e6,
            6_000e6,
            nowTs + 1 days,
            nowTs + 1 days + 2 hours,
            0
        );
        vm.stopBroadcast();

        console2.log("Seeded tenders:", a, b, c);
    }

    function _meta(string memory title, string memory category, string memory description, string memory eligibility)
        internal
        pure
        returns (string memory)
    {
        bytes memory json = abi.encodePacked(
            '{"version":1,"title":"',
            title,
            '","category":"',
            category,
            '","description":"',
            description,
            '","eligibility":"',
            eligibility,
            '","criteria":"Price, technical approach and track record."}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }
}
