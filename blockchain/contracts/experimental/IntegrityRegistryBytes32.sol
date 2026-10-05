// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// EXPERIMENT: same behaviour as IntegrityRegistry, but the record key is computed
// off-chain and passed in as bytes32. Used only to measure gas (docs/journal/10-gas.md).
contract IntegrityRegistryBytes32 {
    address public owner;

    struct Version {
        bytes32 hash;
        uint256 timestamp;
    }

    mapping(bytes32 => Version[]) private versions;
    mapping(bytes32 => bool) private deleted;

    event HashAnchored(bytes32 indexed key, uint256 version, bytes32 hash, uint256 timestamp);
    event RecordMarkedDeleted(bytes32 indexed key, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function anchorHash(bytes32 key, bytes32 hash) external onlyOwner returns (uint256) {
        require(!deleted[key], "Record marked deleted");
        versions[key].push(Version(hash, block.timestamp));
        uint256 v = versions[key].length;
        emit HashAnchored(key, v, hash, block.timestamp);
        return v;
    }

    function markDeleted(bytes32 key) external onlyOwner {
        require(versions[key].length > 0, "Nothing anchored");
        deleted[key] = true;
        emit RecordMarkedDeleted(key, block.timestamp);
    }

    function verify(bytes32 key, bytes32 currentHash) external view returns (bool) {
        uint256 n = versions[key].length;
        if (n == 0 || deleted[key]) {
            return false;
        }
        return versions[key][n - 1].hash == currentHash;
    }

    function versionCount(bytes32 key) external view returns (uint256) {
        return versions[key].length;
    }
}
