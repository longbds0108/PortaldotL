// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BlindBidMarket} from "../src/BlindBidMarket.sol";

/// @notice arc-forge script script/Deploy.s.sol --rpc-url $ARC_TESTNET_RPC_URL --broadcast
///         TREASURY_ADDRESS (optional) receives forfeited bonds; defaults to the deployer. It is immutable.
///         Then set NEXT_PUBLIC_BLINDBID_ADDRESS and NEXT_PUBLIC_BLINDBID_DEPLOY_BLOCK in web/.env.local.
contract Deploy is Script {
    function run() external returns (BlindBidMarket market) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address treasury = vm.envOr("TREASURY_ADDRESS", vm.addr(pk));
        vm.startBroadcast(pk);
        market = new BlindBidMarket(treasury);
        vm.stopBroadcast();

        console2.log("BlindBidMarket:", address(market));
        console2.log("Treasury:      ", treasury);
        console2.log("Deploy block:  ", block.number);
    }
}
