// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BlindBidMarket} from "../../src/BlindBidMarket.sol";
import {SealedNFTAuction} from "../../src/SealedNFTAuction.sol";
import {BlindBidMarketV2} from "../../src/v2/BlindBidMarketV2.sol";
import {SealedNFTAuctionV2} from "../../src/v2/SealedNFTAuctionV2.sol";
import {IBlindBidMarket} from "../../src/interfaces/IBlindBidMarket.sol";
import {ISealedNFTAuction} from "../../src/interfaces/ISealedNFTAuction.sol";

/// @dev The contracts have no views (storage-lean for PortaldotV3); these harnesses expose what tests assert on and
///      give V1 and V2 one shape, so the same invariant suite runs against both.
interface IMarketProbe is IBlindBidMarket {
    function tenderCount() external view returns (uint256);
    function tenderCore(uint256 id) external view returns (Tender memory);
    function bid(uint256 id, address bidder) external view returns (Bid memory);
    function state(uint256 id) external view returns (TenderState);
}

contract MarketV1Probe is BlindBidMarket {
    constructor(address treasury_) BlindBidMarket(treasury_) {}

    function tenderCount() external view returns (uint256) {
        return _tenders.length;
    }

    function tenderCore(uint256 id) external view returns (Tender memory) {
        return _tender(id);
    }

    function bid(uint256 id, address bidder) external view returns (Bid memory) {
        return _bids[id][bidder];
    }

    function state(uint256 id) external view returns (TenderState) {
        return _state(_tender(id));
    }
}

contract MarketV2Probe is BlindBidMarketV2 {
    constructor(address treasury_) BlindBidMarketV2(treasury_) {}

    function tenderCount() external view returns (uint256) {
        return _tenders.length;
    }

    function tender(uint256 id) external view returns (TenderV2 memory) {
        return _tender(id);
    }

    function tenderCore(uint256 id) external view returns (Tender memory t) {
        TenderV2 storage v = _tender(id);
        t.buyer = v.buyer;
        t.submissionDeadline = v.submissionDeadline;
        t.bidCount = v.bidCount;
        t.winner = v.winner;
        t.revealDeadline = v.revealDeadline;
        t.revealedCount = v.revealedCount;
        t.bidBond = v.bidBond;
        t.createdBlock = v.createdBlock;
        t.cancelled = v.cancelled;
        t.awarded = v.awarded;
        t.forfeitSwept = v.forfeitSwept;
    }

    function bid(uint256 id, address bidder) external view returns (Bid memory) {
        return _bids[id][bidder];
    }

    function state(uint256 id) external view returns (TenderState) {
        return _state(_tender(id));
    }
}

interface IAuctionProbe is ISealedNFTAuction {
    function auctionCount() external view returns (uint256);
    function auction(uint256 id) external view returns (Auction memory);
    function bid(uint256 id, address bidder) external view returns (Bid memory);
    function state(uint256 id) external view returns (AuctionState);
}

contract AuctionV1Probe is SealedNFTAuction {
    constructor(address treasury_) SealedNFTAuction(treasury_) {}

    function auctionCount() external view returns (uint256) {
        return _auctions.length;
    }

    function auction(uint256 id) external view returns (Auction memory) {
        return _auction(id);
    }

    function bid(uint256 id, address bidder) external view returns (Bid memory) {
        return _bids[id][bidder];
    }

    function state(uint256 id) external view returns (AuctionState) {
        return _state(_auction(id));
    }
}

contract AuctionV2Probe is SealedNFTAuctionV2 {
    constructor(address treasury_) SealedNFTAuctionV2(treasury_) {}

    function auctionCount() external view returns (uint256) {
        return _auctions.length;
    }

    function auction(uint256 id) external view returns (Auction memory) {
        return _auction(id);
    }

    function bid(uint256 id, address bidder) external view returns (Bid memory) {
        return _bids[id][bidder];
    }

    function state(uint256 id) external view returns (AuctionState) {
        return _state(_auction(id));
    }
}
