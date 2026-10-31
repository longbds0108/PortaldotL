// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommitmentLib} from "../../src/CommitmentLib.sol";
import {IBlindBidMarket} from "../../src/interfaces/IBlindBidMarket.sol";
import {CommitReveal} from "../../src/v2/CommitReveal.sol";
import {IMarketProbe, MarketV1Probe, MarketV2Probe} from "../v2/Harnesses.sol";

/// @dev Drives a market with random calls from several actors. Calls that revert simply leave the ghost state alone.
///      Calls that must never succeed are tried too; if one does, a `ghost_violations` counter records it.
abstract contract MarketHandler is Test {
    IMarketProbe public immutable market;
    address public immutable treasury;

    address[] internal buyers;
    address[] internal bidders;
    address internal stranger = makeAddr("stranger");

    /// Few tenders, so the random actors keep colliding on the same ones and sequences reach late phases.
    uint256 internal constant MAX_TENDERS = 2;

    uint256 public ghost_bondsIn;
    uint256 public ghost_bondsOut;
    uint256 public ghost_swept;
    uint256 public ghost_donated;
    uint256 public ghost_violations;
    uint256 public ghost_awards;

    mapping(uint256 => uint128) public ghost_budgetMin;
    mapping(uint256 => uint128) public ghost_budgetMax;
    mapping(uint256 => mapping(address => uint128)) internal sealedAmount;
    mapping(uint256 => mapping(address => bytes32)) internal sealedSalt;
    mapping(uint256 => mapping(address => uint256)) public ghost_bondWithdrawals;
    mapping(uint256 => uint256) public ghost_sweeps;
    mapping(uint256 => address) public ghost_winner;

    mapping(bytes4 => uint256) public calls;

    constructor(IMarketProbe market_, address treasury_) {
        market = market_;
        treasury = treasury_;
        buyers.push(makeAddr("buyer0"));
        buyers.push(makeAddr("buyer1"));
        bidders.push(makeAddr("bidder0"));
        bidders.push(makeAddr("bidder1"));
        bidders.push(makeAddr("bidder2"));
        bidders.push(makeAddr("bidder3"));
        for (uint256 i; i < bidders.length; i++) vm.deal(bidders[i], 1_000_000 ether);
    }

    function _commit(uint256 id, address bidder, uint128 amount, bytes32 salt, bytes32 key)
        internal
        view
        virtual
        returns (bytes32);

    function bidderCount() external view returns (uint256) {
        return bidders.length;
    }

    function bidderAt(uint256 i) external view returns (address) {
        return bidders[i];
    }

    function _bidder(uint256 seed) internal view returns (address) {
        return bidders[seed % bidders.length];
    }

    /// @return false when no tender exists yet
    function _pick(uint256 seed) internal view returns (bool, uint256) {
        uint256 n = market.tenderCount();
        return n == 0 ? (false, 0) : (true, seed % n);
    }

    function _key(uint256 id, address bidder) internal pure returns (bytes32) {
        return keccak256(abi.encode("key", id, bidder));
    }

    // ───────────── protocol calls ─────────────

    function createTender(uint256 buyerSeed, uint128 budgetA, uint128 budgetB, uint96 bond, uint32 window) external {
        calls[this.createTender.selector]++;
        if (market.tenderCount() >= MAX_TENDERS) return;
        uint128 lo = uint128(bound(budgetA, 1, 500 ether));
        uint128 hi = uint128(bound(budgetB, lo, 1_000 ether));
        uint64 submit = uint64(block.timestamp) + uint64(bound(window, 1 hours, 3 days));
        uint64 reveal = submit + 1 days;
        vm.prank(buyers[buyerSeed % buyers.length]);
        uint256 id = market.createTender("meta", lo, hi, submit, reveal, uint96(bound(bond, 0, 50 ether)));
        ghost_budgetMin[id] = lo;
        ghost_budgetMax[id] = hi;
    }

    /// First bid locks the bond, a later one replaces the commitment. Amounts straddle the budget on purpose.
    function submitBid(uint256 tenderSeed, uint256 bidderSeed, uint128 amount, bytes32 salt) external {
        calls[this.submitBid.selector]++;
        (bool ok, uint256 id) = _pick(tenderSeed);
        if (!ok) return;
        address who = _bidder(bidderSeed);
        amount = uint128(bound(amount, 1, 1_500 ether));
        bool first = market.bid(id, who).commitment == 0;
        uint256 value = first ? market.tenderCore(id).bidBond : 0;
        bytes32 c = _commit(id, who, amount, salt, _key(id, who));
        vm.prank(who);
        market.submitBid{value: value}(id, c, "doc");
        sealedAmount[id][who] = amount;
        sealedSalt[id][who] = salt;
        ghost_bondsIn += value;
    }

    function revealBid(uint256 tenderSeed, uint256 bidderSeed) external {
        calls[this.revealBid.selector]++;
        (bool ok, uint256 id) = _pick(tenderSeed);
        if (!ok) return;
        address who = _bidder(bidderSeed);
        vm.prank(who);
        market.revealBid(id, sealedAmount[id][who], sealedSalt[id][who], _key(id, who));
    }

    function award(uint256 tenderSeed, uint256 winnerSeed) external {
        calls[this.award.selector]++;
        (bool ok, uint256 id) = _pick(tenderSeed);
        if (!ok) return;
        address winner = _bidder(winnerSeed);
        vm.prank(market.tenderCore(id).buyer);
        market.award(id, winner, "reason");
        ghost_winner[id] = winner;
        ghost_awards++;
    }

    function cancel(uint256 tenderSeed) external {
        calls[this.cancel.selector]++;
        (bool ok, uint256 id) = _pick(tenderSeed);
        if (!ok) return;
        vm.prank(market.tenderCore(id).buyer);
        market.cancel(id);
    }

    function withdrawBond(uint256 tenderSeed, uint256 bidderSeed) external {
        calls[this.withdrawBond.selector]++;
        (bool ok, uint256 id) = _pick(tenderSeed);
        if (!ok) return;
        address who = _bidder(bidderSeed);
        uint256 before = who.balance;
        vm.prank(who);
        market.withdrawBond(id);
        ghost_bondsOut += who.balance - before;
        ghost_bondWithdrawals[id][who]++;
    }

    function sweep(uint256 tenderSeed) external {
        calls[this.sweep.selector]++;
        (bool ok, uint256 id) = _pick(tenderSeed);
        if (!ok) return;
        uint256 before = treasury.balance;
        market.sweepForfeitedBonds(id);
        ghost_swept += treasury.balance - before;
        ghost_sweeps[id]++;
    }

    // ───────────── world ─────────────

    function warp(uint32 secs) external {
        calls[this.warp.selector]++;
        vm.warp(block.timestamp + bound(secs, 1, 8 hours));
    }

    /// Native funds can reach a contract without calling it, so raw balance may exceed what is accounted for.
    function donate(uint64 wei_) external {
        calls[this.donate.selector]++;
        vm.deal(address(market), address(market).balance + wei_);
        ghost_donated += wei_;
    }

    // ───────────── calls that must never succeed ─────────────

    /// One entry point for all attacks, so ordinary protocol calls dominate the random mix.
    function attack(uint256 kind, uint256 tenderSeed, uint256 bidderSeed, bytes32 badSalt) external {
        calls[this.attack.selector]++;
        (bool ok, uint256 id) = _pick(tenderSeed);
        if (!ok) return;
        address who = _bidder(bidderSeed);
        IBlindBidMarket.Tender memory t = market.tenderCore(id);
        kind %= 5;
        if (kind == 0) {
            vm.assume(badSalt != sealedSalt[id][who]);
            vm.prank(who);
            try market.revealBid(id, sealedAmount[id][who], badSalt, _key(id, who)) {
                ghost_violations++;
            } catch {}
        } else if (kind == 1) {
            vm.prank(stranger);
            try market.award(id, who, "reason") {
                ghost_violations++;
            } catch {}
        } else if (kind == 2) {
            vm.prank(stranger);
            try market.withdrawBond(id) {
                ghost_violations++;
            } catch {}
        } else if (kind == 3) {
            vm.prank(stranger);
            try market.cancel(id) {
                ghost_violations++;
            } catch {}
        } else {
            vm.deal(t.buyer, t.bidBond);
            vm.prank(t.buyer);
            try market.submitBid{value: t.bidBond}(id, "c", "doc") {
                ghost_violations++;
            } catch {}
        }
    }
}

contract MarketV1Handler is MarketHandler {
    constructor(IMarketProbe m, address t) MarketHandler(m, t) {}

    function _commit(uint256 id, address bidder, uint128 amount, bytes32 salt, bytes32 key)
        internal
        pure
        override
        returns (bytes32)
    {
        return CommitmentLib.compute(id, bidder, amount, salt, key);
    }
}

contract MarketV2Handler is MarketHandler {
    constructor(IMarketProbe m, address t) MarketHandler(m, t) {}

    function _commit(uint256 id, address bidder, uint128 amount, bytes32 salt, bytes32 key)
        internal
        view
        override
        returns (bytes32)
    {
        bytes32 payload = keccak256(abi.encode(uint256(amount), keccak256(abi.encodePacked(key))));
        return CommitReveal.compute(
            keccak256("plinths.tender.commit.v2"), block.chainid, address(market), id, bidder, payload, salt
        );
    }
}

abstract contract MarketInvariantsBase is Test {
    IMarketProbe internal market;
    MarketHandler internal handler;
    address internal treasury = makeAddr("treasury");

    function _target(MarketHandler h) internal {
        handler = h;
        bytes4[] memory s = new bytes4[](10);
        s[0] = h.createTender.selector;
        s[1] = h.submitBid.selector;
        s[2] = h.revealBid.selector;
        s[3] = h.award.selector;
        s[4] = h.cancel.selector;
        s[5] = h.withdrawBond.selector;
        s[6] = h.sweep.selector;
        s[7] = h.warp.selector;
        s[8] = h.donate.selector;
        s[9] = h.attack.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: s}));
        targetContract(address(h));
    }

    /// Exact bookkeeping: every wei in the contract is an unpaid bond, or a donation nobody can claim.
    function invariant_balanceEqualsLedger() public view {
        assertEq(
            address(market).balance,
            handler.ghost_bondsIn() + handler.ghost_donated() - handler.ghost_bondsOut() - handler.ghost_swept()
        );
    }

    /// Solvency, computed from contract state alone: the balance is exactly what is owed, plus donations nobody can claim.
    function invariant_liabilitiesAreCovered() public view {
        uint256 owed;
        uint256 n = market.tenderCount();
        for (uint256 id; id < n; id++) {
            IBlindBidMarket.Tender memory t = market.tenderCore(id);
            for (uint256 i; i < handler.bidderCount(); i++) {
                IBlindBidMarket.Bid memory b = market.bid(id, handler.bidderAt(i));
                if (b.commitment != 0 && b.revealed && !b.bondWithdrawn) owed += b.bond;
            }
            if (!t.forfeitSwept) owed += uint256(t.bidBond) * (t.bidCount - t.revealedCount);
        }
        assertEq(address(market).balance, owed + handler.ghost_donated());
    }

    function invariant_treasuryOnlyGetsSweeps() public view {
        assertEq(treasury.balance, handler.ghost_swept());
    }

    function invariant_forbiddenCallsNeverSucceed() public view {
        assertEq(handler.ghost_violations(), 0);
    }

    function invariant_lifecycle() public view {
        uint256 n = market.tenderCount();
        for (uint256 id; id < n; id++) {
            IBlindBidMarket.Tender memory t = market.tenderCore(id);
            assertLe(t.revealedCount, t.bidCount);
            assertLe(handler.ghost_sweeps(id), 1, "double sweep");
            if (t.cancelled) {
                assertEq(t.bidCount, 0, "cancelled with bids");
                assertFalse(t.awarded, "cancelled and awarded");
            }
            if (t.awarded) {
                assertTrue(market.bid(id, t.winner).revealed, "winner not revealed");
                assertEq(t.winner, handler.ghost_winner(id), "winner changed");
                assertGe(block.timestamp, t.revealDeadline, "awarded early");
            } else {
                assertEq(t.winner, address(0));
            }
            uint256 revealedSeen;
            for (uint256 i; i < handler.bidderCount(); i++) {
                address who = handler.bidderAt(i);
                IBlindBidMarket.Bid memory b = market.bid(id, who);
                assertLe(handler.ghost_bondWithdrawals(id, who), 1, "double withdrawal");
                if (handler.ghost_bondWithdrawals(id, who) == 1) assertTrue(b.revealed, "unrevealed bond withdrawn");
                if (b.revealed) {
                    revealedSeen++;
                    assertGt(b.amount, 0);
                } else {
                    assertEq(b.amount, 0, "amount visible before reveal");
                }
            }
            assertEq(revealedSeen, t.revealedCount, "revealedCount drift");
        }
    }
}

contract MarketV1Invariants is MarketInvariantsBase {
    function setUp() public {
        vm.warp(1_750_000_000);
        market = IMarketProbe(address(new MarketV1Probe(treasury)));
        _target(new MarketV1Handler(market, treasury));
    }
}

contract MarketV2Invariants is MarketInvariantsBase {
    function setUp() public {
        vm.warp(1_750_000_000);
        market = IMarketProbe(address(new MarketV2Probe(treasury)));
        _target(new MarketV2Handler(market, treasury));
    }

    /// The fix for ISSUE-001, stated as a property of every reachable state.
    function invariant_winnerIsWithinBudget() public view {
        uint256 n = market.tenderCount();
        for (uint256 id; id < n; id++) {
            IBlindBidMarket.Tender memory t = market.tenderCore(id);
            if (!t.awarded) continue;
            uint128 amount = market.bid(id, t.winner).amount;
            assertGe(amount, handler.ghost_budgetMin(id));
            assertLe(amount, handler.ghost_budgetMax(id));
        }
    }
}
