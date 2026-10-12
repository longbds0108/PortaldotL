// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BlindBidMarket} from "../src/BlindBidMarket.sol";

/// @notice arc-forge script script/Deploy.s.sol --rpc-url $ARC_TESTNET_RPC_URL --broadcast
///         Then set NEXT_PUBLIC_BLINDBID_ADDRESS and NEXT_PUBLIC_BLINDBID_DEPLOY_BLOCK in web/.env.local.
contract Deploy is Script {
    function run() external returns (BlindBidMarket market) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        market = new BlindBidMarket();
        vm.stopBroadcast();

        console2.log("BlindBidMarket:", address(market));
        console2.log("Deploy block:  ", block.number);
    }
}
