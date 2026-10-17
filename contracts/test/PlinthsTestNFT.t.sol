// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {PlinthsTestNFT} from "../src/PlinthsTestNFT.sol";

contract PlinthsTestNFTTest is Test {
    PlinthsTestNFT nft;
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");

    function setUp() public {
        nft = new PlinthsTestNFT(owner);
    }

    function test_mint_setsOwnerUriAndSequentialIds() public {
        vm.startPrank(owner);
        uint256 a = nft.mint(alice, "ipfs://meta-1");
        uint256 b = nft.mint(alice, "ipfs://meta-2");
        vm.stopPrank();

        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.tokenURI(2), "ipfs://meta-2");
        assertEq(nft.totalMinted(), 2);
    }

    function test_enumerable_listsWalletTokens() public {
        vm.startPrank(owner);
        nft.mint(alice, "ipfs://a");
        nft.mint(owner, "ipfs://b");
        nft.mint(alice, "ipfs://c");
        vm.stopPrank();

        assertEq(nft.balanceOf(alice), 2);
        assertEq(nft.tokenOfOwnerByIndex(alice, 0), 1);
        assertEq(nft.tokenOfOwnerByIndex(alice, 1), 3);

        vm.prank(alice);
        nft.transferFrom(alice, owner, 1);
        assertEq(nft.balanceOf(alice), 1);
        assertEq(nft.tokenOfOwnerByIndex(alice, 0), 3);
        assertEq(nft.totalSupply(), 3);
    }

    function test_mint_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        nft.mint(alice, "ipfs://x");
    }

    function test_supportsInterfaces() public view {
        assertTrue(nft.supportsInterface(type(IERC721Enumerable).interfaceId));
        assertTrue(nft.supportsInterface(type(IERC721Metadata).interfaceId));
        assertTrue(nft.supportsInterface(0x49064906)); // ERC-4906 metadata updates (ERC721URIStorage)
    }
}
