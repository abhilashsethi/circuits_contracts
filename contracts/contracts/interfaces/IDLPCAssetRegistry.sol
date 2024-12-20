//SPDX-License-Identifier: GPL-3.0-or-later
// Author: Credore (Trustless Private Limited)
pragma solidity >=0.8.0;

interface IDLPCAssetRegistry {
    // enum to represent the different stages of the DNI
    enum Stage{
        Initiated,
        Effective,
        Contingent,
        Discharge
    }

    struct Asset {
        bytes32 id;
        bytes32 previousMerkleRoot;
        bytes32 currentMerkleRoot;
        bytes32 tradeTrustMerkleRoot;
        bytes32 assetType;
        Stage stage;
    }

    // Event to log the creation of a new asset
    event AssetCreated(bytes32 indexed id, bytes32 assetType, Stage stage, bytes32 currentMerkleroot, bytes32 tradeTrustMerkleRoot);

    // Event to log stage transition of an asset
    event AssetStageUpdated(bytes32 indexed id, Stage previousStage, Stage newStage, bytes32 newMerkleRoot);

    // Function to create a new asset and set its initial stage i.e. INITIATED and Merkle root
    function addAsset(
        bytes32 id, 
        bytes32 assetType,
        bytes32 currentMerkleRoot, 
        bytes32 previousMerkleRoot, 
        bytes32 tradeTrustMerkleRoot,
        Stage   initialStage
    ) external;

    // Function to update the stage of an existing asset and calculate the new Merkle root
    function updateAsset(
        bytes32 id, 
        bytes32 currentMerkleRoot, 
        bytes32 previousMerkleRoot, 
        bytes32 tradeTrustMerkleRoot,
        bytes32 assetType,
        Stage newStage
    ) external;

    // Function to retrieve the details of an asset by its ID
    // call the asset
    function getAsset(bytes32 id) external view returns (
        Asset memory
    );
    function setMetaTxContractAddress(address _metaTxContract) external;
    function addAssetUsingMetaTx(
        bytes32 id, 
        bytes32 currentMerkleRoot, 
        bytes32 previousMerkleRoot, 
        bytes32 tradeTrustMerkleRoot,
        bytes32 assetType,
        Stage stage
    ) external;

    function updateAssetUsingMetaTx(
        bytes32 id,
        bytes32 currentMerkleRoot,
        bytes32 previousMerkleRoot,
        bytes32 tradeTrustMerkleRoot,
        bytes32 assetType,
        Stage stage
    ) external;
}

