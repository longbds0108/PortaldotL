// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PlinthsTestNFT
/// @notice Test-only ERC-721 collection so the NFT auction market has items to list on PortaldotV3 Testnet,
///         where few NFT tools exist yet. Plinths itself never mints: only this contract's owner can.
/// @dev Enumerable so the app can list a wallet's tokens without an indexer (tokenOfOwnerByIndex).
///      Token ids start at 1; tokenURI is an ipfs:// metadata JSON (name, description, image, attributes).
contract PlinthsTestNFT is ERC721Enumerable, ERC721URIStorage, Ownable {
    uint256 public totalMinted;

    constructor(address owner_) ERC721("Plinths Test NFT", "PTNFT") Ownable(owner_) {}

    function mint(address to, string calldata uri) external onlyOwner returns (uint256 tokenId) {
        tokenId = ++totalMinted;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    // ───────────── required overrides (ERC721Enumerable × ERC721URIStorage) ─────────────

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }
}
