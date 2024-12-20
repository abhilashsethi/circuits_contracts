import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "chai";


import {
    DLPCAssetRegistry,
    DLPCAssetRegistry__factory,
}  from "../typechain";


describe("dlpcAssetRegistry", () => {
    let dlpcAssetRegistry: DLPCAssetRegistry;
    let admin: SignerWithAddress;
    let operator: SignerWithAddress;
    let owner: SignerWithAddress;    
    let recipient: SignerWithAddress;

    

    before(async function () {
        [admin, operator, owner, recipient] = await ethers.getSigners();
        const uri = "https://credore.xyz/api/asset/{id}.json";
        dlpcAssetRegistry = await new DLPCAssetRegistry__factory(admin).deploy(uri);
        
        await dlpcAssetRegistry.grantRole(await dlpcAssetRegistry.DEFAULT_ADMIN_ROLE(), admin.address);
    });


    it("Should allow admin to add asset", async function () {
        const id = ethers.utils.formatBytes32String("asset1");
        const assetType = ethers.utils.formatBytes32String("type1");
        const currentMerkleRoot = ethers.utils.formatBytes32String('currentMerkleRoot');
        const previousMerkleRoot = ethers.utils.formatBytes32String('previousMerkleRoot');
        const tradeTrustMerkleRoot = ethers.utils.formatBytes32String('tradeTrustMerkleRoot');
        const stage = 1;

        // Adding the asset
        await dlpcAssetRegistry.addAsset(
            id,
            currentMerkleRoot,
            previousMerkleRoot,
            tradeTrustMerkleRoot,
            assetType,
            stage
        );

        // Fetch the added asset
        const asset = await dlpcAssetRegistry.getAsset(id);
        
        // Validate the asset data
        expect(asset.id).to.equal(id);
        expect(asset.currentMerkleRoot).to.equal(currentMerkleRoot);
        expect(asset.previousMerkleRoot).to.equal(previousMerkleRoot);
        expect(asset.tradeTrustMerkleRoot).to.equal(tradeTrustMerkleRoot);
        expect(asset.assetType).to.equal(assetType);
        expect(asset.stage).to.equal(stage);

        // Check if the asset exists in the registry
        expect(await dlpcAssetRegistry.assetExists(id)).to.equal(true);

        // Attempt to add the same asset again and expect it to be reverted
        await expect(
            dlpcAssetRegistry.addAsset(
                id,
                currentMerkleRoot,
                previousMerkleRoot,
                tradeTrustMerkleRoot,
                assetType,
                stage
            )
        ).to.be.revertedWith("Asset already exists");
    });

    it("Should allow admin to update an asset", async () => {
        const id = ethers.utils.formatBytes32String("asset1");
        const assetType = ethers.utils.formatBytes32String("type1");
        const currentMerkleRoot = ethers.utils.formatBytes32String('currentMerkleRoot');
        const previousMerkleRoot = ethers.utils.formatBytes32String('previousMerkleRoot');
        const tradeTrustMerkleRoot = ethers.utils.formatBytes32String('tradeTrustMerkleRoot');
        const stage = 3; // Ensure this is a valid stage transition
    
        // Fetch the existing asset
        const prevAsset = await dlpcAssetRegistry.getAsset(id);
        console.log("Previous Asset:", prevAsset);
    
        // Update the asset
        await dlpcAssetRegistry.updateAsset(
            id,
            currentMerkleRoot,
            previousMerkleRoot,
            tradeTrustMerkleRoot,
            assetType,
            stage
        );
    
        // Fetch the updated asset
        const asset = await dlpcAssetRegistry.getAsset(id);
        console.log("Updated Asset:", asset);
    
        // Validate the asset data
        expect(asset.id).to.equal(id);
        expect(asset.currentMerkleRoot).to.equal(currentMerkleRoot);
        expect(asset.previousMerkleRoot).to.equal(previousMerkleRoot);
        expect(asset.tradeTrustMerkleRoot).to.equal(tradeTrustMerkleRoot);
        expect(asset.assetType).to.equal(assetType);
        expect(asset.stage).to.equal(stage);
    
        // Check if the asset exists in the registry
        expect(await dlpcAssetRegistry.assetExists(id)).to.equal(true);
    });
     
    
    // it("Should be able to update the asset to the next stage", async () => {
    //     const id = ethers.utils.formatBytes32String("asset1");
    //     const assetType = ethers.utils.formatBytes32String("type1");
    //     const currentMerkleRoot = ethers.utils.formatBytes32String("currentMerkleRoot");
    //     const previousMerkleRoot = ethers.utils.formatBytes32String("previousMerkleRoot");
    //     const tradeTrustMerkleRoot = ethers.utils.formatBytes32String("tradeTrustMerkleRoot");
    
    //     // Define the initial and next stages
    //     const previousStage = 0; // Example: Stage.Initiated
    //     const newStage = 1; // Example: Stage.Contingent
    
    //     // Deploy the Mock MetaTx Contract
    //     const MetaTxContract = await ethers.getContractFactory("DlpcMetaTx");
    //     const metaTxContract = await MetaTxContract.deploy(dlpcAssetRegistry.address); // Deploying with the necessary parameters
    //     await metaTxContract.deployed();
    
    //     // Set the authorized MetaTx contract
    //     await dlpcAssetRegistry.setMetaTxContractAddress(metaTxContract.address);
    
    //     // First, set up the initial asset stage in the registry
    //     await metaTxContract.updateAssetUsingMetaTx(
    //         id,
    //         currentMerkleRoot,
    //         previousMerkleRoot,
    //         tradeTrustMerkleRoot,
    //         assetType,
    //         previousStage
    //     );
    
    //     // Call to update the asset to the next stage
    //     await metaTxContract.updateAssetUsingMetaTx(
    //         id,
    //         currentMerkleRoot,
    //         previousMerkleRoot,
    //         tradeTrustMerkleRoot,
    //         assetType,
    //         newStage
    //     );
    
    //     // Fetch the updated asset and validate
    //     const asset = await dlpcAssetRegistry.getAsset(id);
    //     expect(asset.id).to.equal(id);
    //     expect(asset.currentMerkleRoot).to.equal(currentMerkleRoot);
    //     expect(asset.previousMerkleRoot).to.equal(previousMerkleRoot);
    //     expect(asset.tradeTrustMerkleRoot).to.equal(tradeTrustMerkleRoot);
    //     expect(asset.assetType).to.equal(assetType);
    //     expect(asset.stage).to.equal(newStage);
    // });
    
    
    
    // Separate test for reversion scenario if needed
    // it("Should revert when invalid stage transition occurs", async () => {
    //     const id = ethers.utils.formatBytes32String("asset1");
    //     const invalidStage = 5; // Assuming invalid stage transition based on enum
    
    //     // Attempt to update with invalid stage transition
    //     await expect(
    //         dlpcAssetRegistry.updateAsset(
    //             id,
    //             currentMerkleRoot,
    //             previousMerkleRoot,
    //             tradeTrustMerkleRoot,
    //             assetType,
    //             invalidStage
    //         )
    //     ).to.be.revertedWith("Invalid stage transition");
    // });
    

    // worst case
    // it("Should fail if any required data is not passed while adding the admin", async function () {
    //     const id = ethers.utils.formatBytes32String("asset1");
    //     const assetType = ethers.utils.formatBytes32String("type1");
    //     const currentMerkleRoot = ethers.utils.formatBytes32String('currentMerkleRoot');
    //     const previousMerkleRoot = ethers.utils.formatBytes32String('previousMerkleRoot');
    //     const tradeTrustMerkleRoot = ethers.utils.formatBytes32String('tradeTrustMerkleRoot');
    //     const stage = 1;

    //     // Adding the asset
    //     await dlpcAssetRegistry.addAsset(
    //         id,
    //         currentMerkleRoot,
    //         previousMerkleRoot,
    //         tradeTrustMerkleRoot,
    //         assetType,
    //         stage
    //     );

    //     // Fetch the added asset
    //     const asset = await dlpcAssetRegistry.getAsset(id);

    //     // Validate the asset data
    //     expect(asset.id).to.equal(id);
    //     expect(asset.currentMerkleRoot).to.equal(currentMerkleRoot);
    //     expect(asset.previousMerkleRoot).to.equal(previousMerkleRoot);
    //     expect(asset.tradeTrustMerkleRoot).to.equal(tradeTrustMerkleRoot);
    //     expect(asset.assetType).to.equal(assetType);
    //     expect(asset.stage).to.equal(stage);

    //     // Check if the asset exists in the registry
    //     expect(await dlpcAssetRegistry.assetExists(id)).to.equal(true);

    //     // Attempt to add the same asset again and expect it to be reverted
    //     await expect(
    //         dlpcAssetRegistry.addAsset(
    //             id,
    //             currentMerkleRoot,
    //             previousMerkleRoot,
    //             tradeTrustMerkleRoot,
    //             assetType,
    //             stage
    //         )
    //     ).to.be.revertedWith("Asset already exists");
    // });
    
});