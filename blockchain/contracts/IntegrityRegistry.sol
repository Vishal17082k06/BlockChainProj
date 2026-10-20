// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract IntegrityRegistry {
    address public owner;

    struct Version {
        bytes32 hash;
        uint256 timestamp;
    }

    mapping(bytes32 => Version[]) private versions;
    mapping(bytes32 => bool) private deleted;

    event HashAnchored(string recordType, uint256 recordId, uint256 version,
                       bytes32 hash, uint256 timestamp);
    event RecordMarkedDeleted(string recordType, uint256 recordId, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function _key(string memory recordType, uint256 recordId) internal pure returns (bytes32) {
        return keccak256(abi.encode(recordType, recordId));
    }

    function anchorHash(string calldata recordType, uint256 recordId, bytes32 hash)
        external onlyOwner returns (uint256)
    {
        bytes32 k = _key(recordType, recordId);
        require(!deleted[k], "Record marked deleted");
        versions[k].push(Version(hash, block.timestamp));
        uint256 v = versions[k].length;
        emit HashAnchored(recordType, recordId, v, hash, block.timestamp);
        return v;
    }

    function markDeleted(string calldata recordType, uint256 recordId) external onlyOwner {
        bytes32 k = _key(recordType, recordId);
        require(versions[k].length > 0, "Nothing anchored");
        deleted[k] = true;
        emit RecordMarkedDeleted(recordType, recordId, block.timestamp);
    }

    function getLatest(string calldata recordType, uint256 recordId)
        external view
        returns (bytes32 hash, uint256 version, uint256 timestamp, bool isDeleted)
    {
        bytes32 k = _key(recordType, recordId);
        uint256 n = versions[k].length;
        isDeleted = deleted[k];
        if (n == 0) {
            return (bytes32(0), 0, 0, isDeleted);
        }
        Version memory latest = versions[k][n - 1];
        return (latest.hash, n, latest.timestamp, isDeleted);
    }

    function verify(string calldata recordType, uint256 recordId, bytes32 currentHash)
        external view returns (bool)
    {
        bytes32 k = _key(recordType, recordId);
        uint256 n = versions[k].length;
        if (n == 0 || deleted[k]) {
            return false;
        }
        return versions[k][n - 1].hash == currentHash;
    }

    function versionCount(string calldata recordType, uint256 recordId)
        external view returns (uint256)
    {
        return versions[_key(recordType, recordId)].length;
    }

    function getVersion(string calldata recordType, uint256 recordId, uint256 index)
        external view returns (bytes32, uint256)
    {
        Version memory v = versions[_key(recordType, recordId)][index];
        return (v.hash, v.timestamp);
    }
}
