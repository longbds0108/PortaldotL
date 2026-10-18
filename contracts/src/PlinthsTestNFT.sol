// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PlinthsTestNFT
/// @notice Test-only ERC-721 with three items minted to the deployer at construction, so the NFT auction market
///         has something to list on PortaldotV3 Testnet. There is no mint function: Plinths never mints.
/// @dev Hand-written minimal ERC-721 (+ metadata) to keep the deployed code small — PortaldotV3 charges a storage
///      deposit per byte of code. Token ids are 1..3 with fixed ipfs:// metadata (contracts/scripts/test-nft).
contract PlinthsTestNFT {
    string public constant name = "Plinths Test NFT";
    string public constant symbol = "PTNFT";

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    error NotAuthorized();
    error UnsafeRecipient();

    constructor() {
        for (uint256 id = 1; id <= 3; id++) {
            ownerOf[id] = msg.sender;
            emit Transfer(address(0), msg.sender, id);
        }
        balanceOf[msg.sender] = 3;
    }

    function tokenURI(uint256 id) external view returns (string memory) {
        if (ownerOf[id] == address(0)) revert NotAuthorized();
        if (id == 1) return "ipfs://bafkreif7giatkqukhopkiz6edvna7culo6vw255n67fpjvx2ne4u4nw4sq";
        if (id == 2) return "ipfs://bafkreibmv2d7pnxrbudzgc62ftwvxcxv42llvwp2etfs3fhmpb23max6ya";
        return "ipfs://bafkreifnkrbsirsexluo4xfwmuopfgs4gdazupwmclgapzx4tffdtnhnka";
    }

    function approve(address spender, uint256 id) external {
        address owner = ownerOf[id];
        if (msg.sender != owner && !isApprovedForAll[owner][msg.sender]) revert NotAuthorized();
        getApproved[id] = spender;
        emit Approval(owner, spender, id);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 id) public {
        if (from != ownerOf[id] || to == address(0)) revert NotAuthorized();
        if (msg.sender != from && !isApprovedForAll[from][msg.sender] && msg.sender != getApproved[id]) {
            revert NotAuthorized();
        }
        unchecked {
            balanceOf[from]--;
            balanceOf[to]++;
        }
        ownerOf[id] = to;
        delete getApproved[id];
        emit Transfer(from, to, id);
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        safeTransferFrom(from, to, id, "");
    }

    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public {
        transferFrom(from, to, id);
        if (to.code.length != 0) {
            (bool ok, bytes memory ret) =
                to.call(abi.encodeWithSelector(0x150b7a02, msg.sender, from, id, data)); // onERC721Received
            if (!ok || ret.length < 32 || abi.decode(ret, (bytes4)) != bytes4(0x150b7a02)) revert UnsafeRecipient();
        }
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f; // ERC165, ERC721, ERC721Metadata
    }
}
