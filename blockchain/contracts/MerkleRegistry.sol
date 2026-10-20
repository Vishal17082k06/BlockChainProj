// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Stores Merkle roots, one per batch of records, and can verify a proof on-chain.
// Hashing rules are identical to python/merkle.py:
//   leaf node     = keccak256(0x00 || leaf)
//   internal node = keccak256(0x01 || smaller || larger)
contract MerkleRegistry {
    address public owner;

    struct Batch {
        bytes32 root;
        uint256 count;
        uint256 timestamp;
    }

    Batch[] private batches;

    event RootAnchored(uint256 indexed batchId, bytes32 root, uint256 count, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function anchorRoot(bytes32 root, uint256 count) external onlyOwner returns (uint256 batchId) {
        require(count > 0, "Empty batch");
        batchId = batches.length;
        batches.push(Batch(root, count, block.timestamp));
        emit RootAnchored(batchId, root, count, block.timestamp);
    }

    function getBatch(uint256 batchId)
        external view returns (bytes32 root, uint256 count, uint256 timestamp)
    {
        require(batchId < batches.length, "Unknown batch");
        Batch memory b = batches[batchId];
        return (b.root, b.count, b.timestamp);
    }

    function batchCount() external view returns (uint256) {
        return batches.length;
    }

    function verify(uint256 batchId, bytes32 leaf, bytes32[] calldata proof)
        external view returns (bool)
    {
        require(batchId < batches.length, "Unknown batch");
        bytes32 computed = keccak256(abi.encodePacked(bytes1(0x00), leaf));
        for (uint256 i = 0; i < proof.length; i++) {
            computed = _hashPair(computed, proof[i]);
        }
        return computed == batches[batchId].root;
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b
            ? keccak256(abi.encodePacked(bytes1(0x01), a, b))
            : keccak256(abi.encodePacked(bytes1(0x01), b, a));
    }
}
