import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, ethers } from "ethers";
import { ethers as hardhatEther } from "hardhat";
import {
    Verifier,
    Verifier__factory,
    DlpcMetaTx,
    DlpcMetaTx__factory,
    ZKVerifier__factory,
    ZKVerifier,
    DLPCAssetRegistry,
    DLPCAssetRegistry__factory
} from "../typechain";
import { createHash } from "crypto";
import SHA256 from 'crypto-js/sha256';
import { MerkleTree } from 'merkletreejs';
import { ZKPClient, EdDSA } from "circuits";
import fs from "fs";
import path from "path";
export interface Proof {
    a: [bigint, bigint];
    b: [[bigint, bigint], [bigint, bigint]];
    c: [bigint, bigint];
}


describe("DlpcMetaTx", function () {
    let verifier: Verifier;
    let zkVerifier: ZKVerifier;
    let metaTx: DlpcMetaTx;
    let dlpcAssetRegistry: DLPCAssetRegistry;
    let deployer: SignerWithAddress;    
    let user1: ethers.Wallet;
    let user2: ethers.Wallet;
    let client: ZKPClient;
    let eddsa: EdDSA;
    enum Stage {
        Initiated,
        Effective,
        Contingent,
        Discharge
    }

    before(async () => {
        [deployer] = await hardhatEther.getSigners();    
        user1 = new ethers.Wallet(`0x2cf36dfbae17dca908d52b187dd57bef600c253421b3e69633b9c59178b44853`, hardhatEther.provider)
        user2 = new ethers.Wallet(`0xda9c8edea5f14b2819a76faf14f0585ff23638d27a6dc085024fe8eafd0afd79`, hardhatEther.provider)
        
        verifier = await new Verifier__factory(deployer).deploy();
        
        zkVerifier = await new ZKVerifier__factory(deployer).deploy(verifier.address);
        metaTx = await new DlpcMetaTx__factory(deployer).deploy();
        const uri = "";
        dlpcAssetRegistry = await new DLPCAssetRegistry__factory(deployer).deploy(uri);             

        await dlpcAssetRegistry.grantRole(await dlpcAssetRegistry.DEFAULT_ADMIN_ROLE(), deployer.address);
        await dlpcAssetRegistry.setMetaTxContractAddress(metaTx.address);
        await metaTx.setVerifier(verifier.address);
        await metaTx.setDlpcAssetRegistry(dlpcAssetRegistry.address);
    });

    beforeEach(async () => {
        const privKey = process.env.PRIVATE_KEY || '0xfda56bef5f8bcffc230fd16fe0d200278777c6fbdf6a5d7070a49a2f0bd983c4';
        const wasm = fs.readFileSync(
          path.join(__dirname, "../../circuits/zk/circuits/main_js/main.wasm")
        );
        const zkey = fs.readFileSync(
          path.join(__dirname, "../../circuits/zk/zkeys/main.zkey")
        );
        client = await new ZKPClient().init(wasm, zkey);
        eddsa = await new EdDSA(privKey).init();
      });

    let scalarPubKey0,scalarPubKey1,genesisMsg: any, genesisMerkleRoot:string;

    // Function to hash data using SHA-256
    async function hashData(data: any): Promise<Buffer> {
        const hash = createHash('sha256').update(JSON.stringify(data)).digest();
        return hash;
    }

    async function createMerkleTree(leaves: Buffer[]): Promise<MerkleTree> {
        return new MerkleTree(leaves, SHA256);
    }

    // Helper function to create Merkle root
    async function createMerkleRootHelper(data: any): Promise<Buffer> {
        const values = Object.values(data).map(value => {
            if (value instanceof Date) {
                return value.toISOString();
            }
            return String(value);
        });

        const leaves = await Promise.all(values.map(value => hashData(value)));
        const tree = await createMerkleTree(leaves);
        return tree.getRoot();
    }

    // Function to create a Merkle root and msg
    async function createMerkleRoot(data: any): Promise<string> {
        const merkleRootBuffer = await createMerkleRootHelper(data);
        const merkleRoot = `0x${merkleRootBuffer.toString('hex')}`;

        // Ensure the Merkle root is 32 bytes
        if (merkleRootBuffer.length !== 32) {
            throw new Error("Invalid Merkle root length. Expected 32 bytes.");
        }

        return merkleRoot;
    }

    // Main function to create a Merkle root and msg
    async function getMerkleRoot(data: any): Promise<{ merkleRoot: string, msg: BigNumber }> {
        const merkleRoot = await createMerkleRoot(data);
        const hash = createHash("sha256").update(merkleRoot).digest("hex");

        let msg = BigNumber.from(`0x${hash}`);
        const sfv = BigNumber.from('21888242871839275222246405745257275088548364400416034343698204186575808495617');
        // Reduce msg by the scalar field if needed
        while (msg.gte(sfv)) {
            msg = msg.sub(sfv);
        }
        return { merkleRoot, msg };
    }

    async function createProof(msg: any){
        const signature = await eddsa.sign(msg);
        const proof = await client.prove({
            M: msg.toBigInt(),
            Ax: eddsa.scalarPubKey[0],
            Ay: eddsa.scalarPubKey[1],
            S: signature.S,
            R8x: eddsa.babyjub.F.toObject(signature.R8[0]),
            R8y: eddsa.babyjub.F.toObject(signature.R8[1]),
        });
        const Ax = eddsa.scalarPubKey[0];
        const Ay = eddsa.scalarPubKey[1];
        return {
            proof, Ax, Ay
        }
    }

    
    it("Should add the asset with a valid given zkp proof", async () => {
        this.timeout(30000);
        const dniData = {
            originatorId: "originator1",
            referenceId: "reference1",
            committer: "buyer",
            commitee: "supplier",
            currency: "usd",
            amount: "100",
            commitmentDate: "date1",
            dueDate: "dueDate",
            commitmentState: "INITIATED",
            dischargeState: "null",
            dischargeDate: "null",
            applicationRule: "rule1"
        };
    
        const id = ethers.utils.formatBytes32String('asset11');
        const assetType = ethers.utils.formatBytes32String("type1");
    
        // Fetch the previousMerkleRoot
        const existingAsset = await dlpcAssetRegistry.getAsset(id);
        const previousMerkleRoot = existingAsset.currentMerkleRoot || ethers.constants.HashZero;
    
        // Generate the currentMerkleRoot using dniData
        const currentMerkleRootObj = await getMerkleRoot(dniData);
        const currentMerkleRoot = `${currentMerkleRootObj.merkleRoot}`;
        genesisMerkleRoot= currentMerkleRootObj.merkleRoot;
        const msg = currentMerkleRootObj.msg;
        const tradeTrustMerkleRoot = previousMerkleRoot;
        const stage = 1;

        const target = dlpcAssetRegistry.address;
        const data = dlpcAssetRegistry.interface.encodeFunctionData(
            'addAssetUsingMetaTx',
            [id, assetType, currentMerkleRoot, currentMerkleRoot, tradeTrustMerkleRoot, stage]
        );
    
        const proofObj = await createProof(msg);
        const proof = proofObj.proof;
        scalarPubKey0 = proofObj.Ax;
        scalarPubKey1 = proofObj.Ay;

        
        // Execute the meta transaction
        await metaTx.execute(
            target,
            data,
            [msg, scalarPubKey0, scalarPubKey1],
            proof
        );
        // Verify the asset is added correctly
        const updatedAsset = await dlpcAssetRegistry.getAsset(id);
        expect(updatedAsset.id).to.equal(id);
        expect(updatedAsset.previousMerkleRoot).to.equal(currentMerkleRoot);
        expect(updatedAsset.stage).to.equal(stage);
    });

    it("Should be able to update the asset to the next stage", async () => {
        this.timeout(30000);
        const dniData = {
          originatorId: "originator1",
          referenceId: "reference1",
          committer: "buyer",
          commitee: "supplier",
          currency: "usd",
          amount: "100",
          commitmentDate: "date1",
          dueDate: "dueDate1",
          commitmentState: "Effective",
          dischargeState: "null",
          dischargeDate: "null",
          applicationRule: "rule1",
        };
      
        const existingId = ethers.utils.formatBytes32String("asset11");
        const assetType = ethers.utils.formatBytes32String("type1");
        const id = ethers.utils.formatBytes32String("asset11");
      
        // Fetch the previousMerkleRoot
        const existingAsset = await dlpcAssetRegistry.getAsset(existingId);
        const previousMerkleRoot = existingAsset.currentMerkleRoot ;
        const existingAssetType= existingAsset.assetType;
        // Generate the currentMerkleRoot using dniData
        const currentMerkleRootObj = await getMerkleRoot(dniData);
        const currentMerkleRoot = `${currentMerkleRootObj.merkleRoot}`;
        const msg = currentMerkleRootObj.msg;
        const tradeTrustMerkleRoot = ethers.constants.HashZero;
        const stage = 2;
      
        const target = dlpcAssetRegistry.address;
      
      
        const data = dlpcAssetRegistry.interface.encodeFunctionData(
            "updateAssetUsingMetaTx", 
        [
            id,
            existingAssetType,
            currentMerkleRoot,
            previousMerkleRoot,
            previousMerkleRoot,
            stage,
        ]);

        const proofObj = await createProof(msg);
        const proof = proofObj.proof;
        const scalarPubKey0 = proofObj.Ax;
        const scalarPubKey1 = proofObj.Ay;

        const verified = await zkVerifier.verify(
            [msg, scalarPubKey0, scalarPubKey1],
            proof
        )
        // Execute the meta transaction
        const updateMetaTx = await metaTx.execute(
            target, 
            data, 
            [msg, scalarPubKey0, scalarPubKey1],
            proof
        );
      
        // Verify the asset is added correctly
        const updatedAsset = await dlpcAssetRegistry.getAsset(id);
        expect(updatedAsset.id).to.equal(id);
        expect(updatedAsset.currentMerkleRoot).to.equal(currentMerkleRoot);
        expect(updatedAsset.stage).to.equal(stage);
    });

    it("Should be able to change some important dniData in order to make the endorsment for the DNI", async () => {
        this.timeout(30000);
        const dniData = {
          originatorId: "originator1",
          referenceId: "reference1",
          committer: "buyer",
          commitee: "supplier's bank",
          currency: "usd",
          amount: "100",
          commitmentDate: "date1",
          dueDate: "dueDate1",
          commitmentState: "Effective",
          dischargeState: "null",
          dischargeDate: "null",
          applicationRule: "rule1",
        };
      
        const existingId = ethers.utils.formatBytes32String("asset11");
        const assetType = ethers.utils.formatBytes32String("type1");
        const id = ethers.utils.formatBytes32String("asset11");
      
        // Fetch the previousMerkleRoot
        const existingAsset = await dlpcAssetRegistry.getAsset(existingId);
        const previousMerkleRoot = existingAsset.currentMerkleRoot ;
        const existingAssetType= existingAsset.assetType;
        // Generate the currentMerkleRoot using dniData
        const currentMerkleRootObj = await getMerkleRoot(dniData);
        const currentMerkleRoot = `${currentMerkleRootObj.merkleRoot}`;
        const msg = currentMerkleRootObj.msg;
        const tradeTrustMerkleRoot = ethers.constants.HashZero;
        const stage = 2;
      
        const target = dlpcAssetRegistry.address;
      
      
        const data = dlpcAssetRegistry.interface.encodeFunctionData(
            "updateAssetUsingMetaTx", 
        [
            id,
            existingAssetType,
            currentMerkleRoot,
            previousMerkleRoot,
            previousMerkleRoot,
            stage,
        ]);

        const proofObj = await createProof(msg);
        const proof = proofObj.proof;
        const scalarPubKey0 = proofObj.Ax;
        const scalarPubKey1 = proofObj.Ay;

        const verified = await zkVerifier.verify(
            [msg, scalarPubKey0, scalarPubKey1],
            proof
        )
        // Execute the meta transaction
        const updateMetaTx = await metaTx.execute(
            target, 
            data, 
            [msg, scalarPubKey0, scalarPubKey1],
            proof
        );
      
        // Verify the asset is added correctly
        const updatedAsset = await dlpcAssetRegistry.getAsset(id);
        expect(updatedAsset.id).to.equal(id);
        expect(updatedAsset.currentMerkleRoot).to.equal(currentMerkleRoot);
        expect(updatedAsset.stage).to.equal(stage);
    });

    it("Should be able to change some important dniData in order to make the DNI DISCHARGED", async () => {
        this.timeout(30000);
        const dniData = {
          originatorId: "originator1",
          referenceId: "reference1",
          committer: "buyer",
          commitee: "supplier's bank",
          currency: "usd",
          amount: "0",
          commitmentDate: "date1",
          dueDate: "dueDate1",
          commitmentState: "Discharged",
          dischargeState: "PAID",
          dischargeDate: "todayDate",
          applicationRule: "rule1",
        };
      
        const existingId = ethers.utils.formatBytes32String("asset11");
        const assetType = ethers.utils.formatBytes32String("type1");
        const id = ethers.utils.formatBytes32String("asset11");
      
        // Fetch the previousMerkleRoot
        const existingAsset = await dlpcAssetRegistry.getAsset(existingId);
        const previousMerkleRoot = existingAsset.currentMerkleRoot ;
        const existingAssetType= existingAsset.assetType;
        // Generate the currentMerkleRoot using dniData
        const currentMerkleRootObj = await getMerkleRoot(dniData);
        const currentMerkleRoot = `${currentMerkleRootObj.merkleRoot}`;
        const msg = currentMerkleRootObj.msg;
        const tradeTrustMerkleRoot = ethers.constants.HashZero;
        const stage = 3;
      
        const target = dlpcAssetRegistry.address;
      
      
        const data = dlpcAssetRegistry.interface.encodeFunctionData(
            "updateAssetUsingMetaTx", 
        [
            id,
            existingAssetType,
            currentMerkleRoot,
            previousMerkleRoot,
            previousMerkleRoot,
            stage,
        ]);

        const proofObj = await createProof(msg);
        const proof = proofObj.proof;
        const scalarPubKey0 = proofObj.Ax;
        const scalarPubKey1 = proofObj.Ay;

        const verified = await zkVerifier.verify(
            [msg, scalarPubKey0, scalarPubKey1],
            proof
        )
        // Execute the meta transaction
        const updateMetaTx = await metaTx.execute(
            target, 
            data, 
            [msg, scalarPubKey0, scalarPubKey1],
            proof
        );
      
        // Verify the asset is added correctly
        const updatedAsset = await dlpcAssetRegistry.getAsset(id);
        expect(updatedAsset.id).to.equal(id);
        expect(updatedAsset.currentMerkleRoot).to.equal(currentMerkleRoot);
        expect(updatedAsset.stage).to.equal(stage);
    });
    
    
    

})
