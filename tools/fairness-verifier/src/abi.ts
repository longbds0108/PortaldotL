import { keccak256, parseAbi, stringToHex, type Hex } from "viem";

// Written out here rather than imported from the app, so this tool has no dependency on the Plinths frontend.
export const TENDER_ABI = parseAbi([
  "event TenderCreated(uint256 indexed tenderId, address indexed buyer, bytes32 metadata, uint256 budgetMin, uint256 budgetMax, uint64 submissionDeadline, uint64 revealDeadline, uint256 bidBond)",
  "event BidSubmitted(uint256 indexed tenderId, address indexed bidder, bytes32 commitment, bytes32 encryptedDoc, bool first)",
  "event BidRevealed(uint256 indexed tenderId, address indexed bidder, uint256 amount, bytes32 salt, bytes32 docKey)",
  "event TenderAwarded(uint256 indexed tenderId, address indexed winner, uint256 amount, bytes32 reason)",
  "event SelectionRecorded(uint256 indexed tenderId, address indexed winner, bytes32 revealSetDigest, uint32 revealedCount, uint8 rule)",
  "event TenderCancelled(uint256 indexed tenderId)",
  "event BondWithdrawn(uint256 indexed tenderId, address indexed bidder, uint256 amount)",
  "event ForfeitedBondsSwept(uint256 indexed tenderId, uint256 amount)",
]);

export const AUCTION_ABI = parseAbi([
  "event AuctionCreated(uint256 indexed auctionId, address indexed seller, address indexed collection, uint256 tokenId, uint256 reservePrice, uint64 bidDeadline, uint64 revealDeadline)",
  "event BidPlaced(uint256 indexed auctionId, address indexed bidder, bytes32 commitment, uint256 deposit, bool first)",
  "event BidRevealed(uint256 indexed auctionId, address indexed bidder, uint256 amount, bytes32 salt, bool counted)",
  "event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 amount)",
  "event AuctionCancelled(uint256 indexed auctionId)",
  "event Withdrawn(uint256 indexed auctionId, address indexed account, uint256 amount)",
]);

export const ERC721_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export const DOMAIN_ABI = parseAbi(["function COMMITMENT_DOMAIN() view returns (bytes32)"]);

export const TENDER_DOMAIN_TAG: Hex = keccak256(stringToHex("plinths.tender.commit.v2"));
export const AUCTION_DOMAIN_TAG: Hex = keccak256(stringToHex("plinths.nft-auction.commit.v2"));
