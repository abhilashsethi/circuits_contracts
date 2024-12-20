//SPDX-License-Identifier: GPL-3.0-or-later
// Author: Credore (Trustless Private Limited)
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./interfaces/IDLPCAssetRegistry.sol";

/**
 * @title DLPCAssetRegistry
 * @dev This contract implements a registry for digital assets that can be represented by ERC1155 tokens.
 * @dev It allows administrators with the DEFAULT_ADMIN_ROLE and the TOKEN_ISSUER_ROLE to add and update digital assets, and issue ERC1155 tokens to represent these assets.
 * @dev The contract can be paused by the DEFAULT_ADMIN_ROLE.
 * @dev The contract also implements the IDLPCAssetRegistry interface.
 * @dev The contract uses AccessControl and ERC1155 contracts from the OpenZeppelin library.
 */
contract DLPCAssetRegistry is IDLPCAssetRegistry, AccessControl, ERC1155 {
    
    bool private paused;
    address private metaTxContract;

    mapping(bytes32 => Asset) private assets;

    event AssetAdded(bytes32 id);
    event AssetUpdated(bytes32 id);

    modifier whenNotPaused() {
        require(!paused, "The contract is currently paused");
        _;
    }

    modifier onlyMetaTxContract() {
        require(msg.sender == metaTxContract, "Only Meta Transaction contract is allowed to call this method");
        _;
    }

    constructor(string memory uri) ERC1155(uri) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        paused = false;        
    }   

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        paused = true;
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        paused = false;
    }

    function setMetaTxContractAddress(address _metaTxContract) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        metaTxContract = _metaTxContract;
    }

    /**
     * @notice Adds a new digital asset to the registry
     * @dev Only an administrator with DEFAULT_ADMIN_ROLE can call this method.
     * @dev The contract must not be paused when calling this method.
     * @param _id The unique identifier for the new asset
     * @param _currentMerkleRoot The current merkle root hash of the asset data
     * @param _previousMerkleRoot The previous merkle root hash of the asset data
     * @param _assetType The type of asset
     * @param _stage The current stage of the asset
     */
    function addAsset(
        bytes32 _id, 
        bytes32 _currentMerkleRoot,
        bytes32 _previousMerkleRoot,
        bytes32 _tradeTrustMerkleRoot,
        bytes32 _assetType,
        Stage _stage
        ) 
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
        whenNotPaused
    {
        require(_id != bytes32(0), "Invalid Id");
        require(!assetExists(_id), "Asset already exists");
        require(_currentMerkleRoot != bytes32(0), "Invalid current MerkleRoot");
        require(_previousMerkleRoot != bytes32(0), "Invalid previous MerkleRoot");
        require(_assetType != bytes32(0), "Invalid Asset Type");
        require(_stage != Stage.Initiated , "Invalid Stage");  

        assets[_id] = Asset({
            id: _id,
            currentMerkleRoot: _currentMerkleRoot,
            assetType: _assetType,
            previousMerkleRoot:_previousMerkleRoot,
            tradeTrustMerkleRoot:_tradeTrustMerkleRoot,
            stage: Stage(_stage)
        });

        emit AssetAdded(_id);
    }

    /**
     * @notice Updates a new digital asset to the registry
     * @dev Only an administrator with DEFAULT_ADMIN_ROLE can call this method.
     * @dev The contract must not be paused when calling this method.
     * @param _id The unique identifier for the new asset
     * @param _currentMerkleRoot The current merkle root hash of the asset data
     * @param _previousMerkleRoot The previous merkle root hash of the asset data
     * @param _assetType The type of asset
     * @param _stage The current stage of the asset
     */
    function updateAsset(
        bytes32 _id, 
        bytes32 _currentMerkleRoot,
        bytes32 _previousMerkleRoot,
        bytes32 _tradeTrustMerkleRoot,
        bytes32 _assetType,
        Stage _stage
        ) 
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
        whenNotPaused
    {        
        require(_id != bytes32(0), "Invalid Id");
        require(assetExists(_id), "Asset already exists");
        require(_currentMerkleRoot != bytes32(0), "Invalid current MerkleRoot");
        require(_previousMerkleRoot != bytes32(0), "Invalid previous MerkleRoot");
        require(_assetType != bytes32(0), "Invalid Asset Type");
        
        // Fetch current asset to check its stage
        // Asset storage asset = assets[_id];
        // Stage currentStage = asset.stage;
        
        // Validate the new stage based on the current stage
        // if (currentStage == Stage.Initiated) {
        //     require(_stage == Stage.Contingent || _stage == Stage.Effective, "Invalid stage transition from Initiated");
        // } else if (currentStage == Stage.Contingent || currentStage == Stage.Initiated) {
        //     require(_stage == Stage.Effective, "Invalid stage transition from Contingent or Initiated");
        // } else if (currentStage == Stage.Effective) {
        //     require(_stage == Stage.Discharge, "Invalid stage transition from Effective");
        // } else {
        //     require(_stage == Stage.Initiated, "Invalid stage transition from unknown state");
        // } 

        assets[_id] = Asset({
            id: _id,
            currentMerkleRoot: _currentMerkleRoot,
            assetType: _assetType,
            previousMerkleRoot:_previousMerkleRoot,
            tradeTrustMerkleRoot:_tradeTrustMerkleRoot,
            stage: _stage
        });

        emit AssetUpdated(_id);
    }

    /**
     * @dev Updates a new digital asset to the registry using a meta-transaction.
     * @param _id The unique identifier for the new asset
     * @param _currentMerkleRoot The current merkle root hash of the asset data
     * @param _previousMerkleRoot The previous merkle root hash of the asset data
     * @param _assetType The type of asset
     * @param _stage The current stage of the asset
     * Requirements:
     * - Only the Meta-Transaction contract is allowed to call this function.
     * - The contract must not be paused.
     * - The asset ID must not be zero.
     * - The asset must already exist in the registry.
     * - The Merkle root hash, asset type, LEI, LEI verification date, originator, and status must not be zero.
     * Effects:
     * - Updatesthe asset to the registr.
     * - Emits an AssetUpdated event.
     */
    function addAssetUsingMetaTx(
        bytes32 _id, 
        bytes32 _assetType,
        bytes32 _currentMerkleRoot,
        bytes32 _previousMerkleRoot,
        bytes32 _tradeTrustMerkleRoot,
        Stage _stage
        )         
        external
        override
        whenNotPaused
        onlyMetaTxContract
    {        
        require(_id != bytes32(0), "Invalid Id");
        require(!assetExists(_id), "Asset already exists");
        require(_currentMerkleRoot != bytes32(0), "Invalid current MerkleRoot");
        require(_previousMerkleRoot != bytes32(0), "Invalid previous MerkleRoot");
        require(_assetType != bytes32(0), "Invalid Asset Type");
        require(_stage != Stage.Initiated , "Invalid Stage");  

        assets[_id] = Asset({
            id: _id,
            previousMerkleRoot:_previousMerkleRoot,
            currentMerkleRoot: _currentMerkleRoot,
            tradeTrustMerkleRoot: _tradeTrustMerkleRoot,
            assetType: _assetType,
            stage: _stage
        });
        emit AssetUpdated(_id);
    }

    /**
     * @dev Updates a new digital asset to the registry using a meta-transaction.
     * @param _id The unique identifier for the new asset
     * @param _currentMerkleRoot The current merkle root hash of the asset data
     * @param _previousMerkleRoot The previous merkle root hash of the asset data
     * @param _tradeTrustMerkleRoot The tradetrust merkle root hash of the asset data, this is not required, as we will be getting this merkle root at the time of .tt file creation.
     * @param _assetType The type of asset
     * @param _stage The current stage of the asset
     * Requirements:
     * - Only the Meta-Transaction contract is allowed to call this function.
     * - The contract must not be paused.
     * - The asset ID must not be zero.
     * - The asset must already exist in the registry.
     * - The Merkle root hash, asset type, LEI, LEI verification date, originator, and status must not be zero.
     * Effects:
     * - Updatesthe asset to the registr.
     * - Emits an AssetUpdated event.
     */
    function updateAssetUsingMetaTx(
        bytes32 _id, 
        bytes32 _assetType,
        bytes32 _currentMerkleRoot,
        bytes32 _previousMerkleRoot,
        bytes32 _tradeTrustMerkleRoot,
        Stage _stage
        )         
        external
        override
        whenNotPaused
        onlyMetaTxContract
    {        
        require(_id != bytes32(0), "Invalid Id");
        require(assetExists(_id), "Asset does not exist");
        require(_currentMerkleRoot != bytes32(0), "Invalid current MerkleRoot");
        require(_previousMerkleRoot != bytes32(0), "Invalid previous MerkleRoot");
        require(_tradeTrustMerkleRoot != bytes32(0), "Invalid tradeTrustMerkleRoot");
        require(_assetType != bytes32(0), "Invalid Asset Type");
        
        // Fetch current asset to check its stage
        // Asset storage asset = assets[_id];
        // Stage currentStage = asset.stage;
        // Validate the new stage based on the current stage
        // if (currentStage == Stage.Initiated) {
        //     require(_stage == Stage.Contingent || _stage == Stage.Effective, "Invalid stage transition from Initiated");
        // } else if (currentStage == Stage.Contingent || currentStage == Stage.Initiated) {
        //     require(_stage == Stage.Effective, "Invalid stage transition from Contingent or Initiated");
        // } else if (currentStage == Stage.Effective) {
        //     require(_stage == Stage.Discharge, "Invalid stage transition from Effective");
        // } else {
        //     require(_stage == Stage.Initiated, "Invalid stage transition from unknown state");
        // } 

        // Update the asset
        assets[_id] = Asset({
            id: _id,
            currentMerkleRoot: _currentMerkleRoot,
            previousMerkleRoot: _previousMerkleRoot,
            tradeTrustMerkleRoot: _tradeTrustMerkleRoot,
            assetType: _assetType,
            stage: _stage
        });
    
        emit AssetUpdated(_id);
    }


    function getEthSignedMessageHash(
        bytes32 _messageHash
    ) private pure returns (bytes32) {
        /*
        Signature is produced by signing a keccak256 hash with the following format:
        "\x19Ethereum Signed Message\n" + len(msg) + msg
        */
        return
            keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash)
            );
    }

    function setURI(string memory newuri) public onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        _setURI(newuri);
    }

    function ownerBalance(address owner, uint256 _tokenId) public view whenNotPaused returns (uint256) {
        return balanceOf(owner, _tokenId);
    }

    function assetExists(bytes32 id) public view whenNotPaused returns (bool) {
        return (assets[id].id == id);
    }

    function getAsset(bytes32 id) external override view returns (Asset memory) {
        return assets[id];
    }

    function recoverSigner(
        bytes32 _ethSignedMessageHash,
        bytes memory _signature
    ) private pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);

        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(
        bytes memory sig
    ) private pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "invalid signature length");

        assembly {
            /*
            First 32 bytes stores the length of the signature

            add(sig, 32) = pointer of sig + 32
            effectively, skips first 32 bytes of signature

            mload(p) loads next 32 bytes starting at the memory address p into memory
            */

            // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
            // second 32 bytes
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }

        // implicitly return (r, s, v)
    }
}
