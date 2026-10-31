# ISSUE-003: Anyone can list a token that never arrived

| | |
|---|---|
| Severity | Medium: bidders can lose the winning price |
| Status | **Open on deployed V1.** Fixed in V2 (not deployed) for the cases below |
| File | `contracts/src/SealedNFTAuction.sol:36-60` |

## Problem

`onERC721Received` is external and creates an auction whatever called it. It treats `msg.sender` as the collection and never checks that the token arrived. An account with no code can call it directly:

1. The auction exists, with `collection` set to the caller.
2. A bidder places and reveals a winning bid.
3. `settle` calls `transferFrom` on an address with no code, which always reverts, so the auction can never settle.
4. The winner can withdraw only `deposit - price`. The seller cannot withdraw either, so the price is stranded for good.

Also, a token minted directly to the contract arrives with `from == address(0)`. That creates an auction with no seller, and its token could never be returned.

Nobody gains the money in this form: it is griefing that destroys funds. The app shows the collection address, but a bidder could easily miss it.

## Reproduce

```bash
cd contracts
forge test --match-test 'test_V1_phantomListing' -vv
```

## Fix

`contracts/src/v2/SealedNFTAuctionV2.sol` now requires `ownerOf(tokenId) == address(this)` from the calling collection, which also reverts for an account with no code, and rejects `from == address(0)`.

This does not stop a hostile *contract* that lies in `ownerOf`. That remaining case is [ISSUE-004](ISSUE-004-hostile-collection.md).

## Tests

`test_V2_phantomListing_rejectedFromAccountWithoutCode`, `test_V2_phantomListing_rejectedWhenTokenIsNotInEscrow`, `test_V2_listing_rejectsZeroSeller`, and the stateful `invariant_nftCustody`.
