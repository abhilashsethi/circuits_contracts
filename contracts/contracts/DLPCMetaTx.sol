// SPDX-License-Identifier: GPL-3.0-or-later
// Author: Credore (Trustless Private Limited)
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title IVerifier
 * @dev Interface for a smart contract that verifies a zero-knowledge proof using a set of inputs and outputs.
 */
interface IVerifier {
    /**
     * @dev Verifies a zero-knowledge proof using a set of inputs and outputs.
     * @param a An array of two uint256 values that represent the first part of the proof.
     * @param b A 2D array of two uint256 values that represents the second part of the proof.
     * @param c An array of two uint256 values that represents the third part of the proof.
     * @param input An array of three uint256 values that represent the public inputs of the proof.
     * @return r boolean indicating whether the proof is valid or not.
     */
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[3] memory input
    ) external view returns (bool r);
}

interface IDLPCAssetRegistry {
    
    enum Stage{
        Initiated,
        Effective,
        Contignent,
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
    function getAsset(bytes32 id) external view returns (Asset memory);
}

contract DlpcMetaTx is AccessControl, ReentrancyGuard {
    using Address for address;
    using ECDSA for bytes32;
    /**
     * @dev Struct containing the proof data.
     * @param a The first part of the proof.
     * @param b The second part of the proof.
     * @param c The third part of the proof.
     */
    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }
    
    address private verifier; // Address of the IVerifier contract
    address private dlpcAssetRegistry;

    /**
     * @dev Initializes the contract and sets the DEFAULT_ADMIN_ROLE role to the deployer.
     */
    constructor() {                
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setVerifier(address verifier_) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(verifier_ != address(0), "Invalid address");
        require(Address.isContract(verifier_), "Address must be a contract");
        verifier = verifier_;
    }

    function setDlpcAssetRegistry(address dlpcAssetRegistry_) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(dlpcAssetRegistry_ != address(0), "Invalid address");
        require(Address.isContract(dlpcAssetRegistry_), "Address must be a contract");
        dlpcAssetRegistry = dlpcAssetRegistry_;
    }

    /**
     * @dev Execute an operation on a target contract using the provided data.
      * The method also ensures the validity of public signals and zero knowledge proof.
      *
      * @param target The address of the target contract to execute the operation on.
      * @param data The bytes data containing the encoded method and parameters for the target contract.
      * @param publicSignals An array of 3 uint256 values representing the public signals used in the SNARK verification process.
      * @param proof The Proof struct containing the proof data required for SNARK signature verification.
      *
      * @return response The bytes data returned by the target contract as a result of successful execution.
      *
      * Requirements:
      * - The caller must have the DEFAULT_ADMIN_ROLE.
      * - The target address must not be a zero address.
      * - The data length must be greater than 0.
      * - The publicSignals and proof must pass the SNARK signature verification.
      * - The execution of the operation on the target contract must be successful.
      */
    function execute(address target, bytes memory data, uint256[3] memory publicSignals, Proof memory proof) 
        public 
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
        validPublicSignals(publicSignals)
        validProof(proof)
        returns (bytes memory) 
    {
        require(target != address(0), "Invalid target address");
        require(data.length > 0, "Invalid data length");
        require(verify(publicSignals, proof), "SNARK signature verification failed");
        (bool success, bytes memory response) = target.call(data);
        require(success, string(abi.encodePacked("Execution failed: ", response)));
        return response;
    }


    /**
     * @dev Verifies the public signals anda proof by calling the IVerifier contract's verifyProof function.
     * @param publicSignals The public signals that correspond to the proof.
     * @param proof The proof that is being verified.
     * @return A boolean indicating whether the proof is valid or not.
     * Requirements:
     * - The public signals must be valid.
     * - The proof must be valid.
     */
    function verify(uint256[3] memory publicSignals, Proof memory proof)
        public
        view
        validPublicSignals(publicSignals)
        validProof(proof)
        returns (bool)
    {
        bool result = IVerifier(verifier).verifyProof(
            proof.a,
            proof.b,
            proof.c,
            publicSignals
        );
        return result;
    }
    

    function getAsset(bytes32 _id) public view returns (IDLPCAssetRegistry.Asset memory){
        return IDLPCAssetRegistry(dlpcAssetRegistry).getAsset(_id);
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

    /**
     * @dev The validPublicSignals modifier is used to validate that the provided public signals array is valid before executing the function. It checks if each value in the array is greater than 0.
     * @param publicSignals An array of three unsigned integers representing the public signals to be validated.
     * Requirements:
     * - The three values in the publicSignals array must be greater than 0.
     */
    modifier validPublicSignals(uint256[3] memory publicSignals) {
        require(publicSignals[0] > 0, "Invalid public signal: signal[0] <= 0");
        require(publicSignals[1] > 0, "Invalid public signal: signal[1] <= 0");
        require(publicSignals[2] > 0, "Invalid public signal: signal[2] <= 0");
        _;
    }


    /**
     * @dev Modifier to check the validity of a given proof.
     * @param proof The proof to check.
     * Requirements:
     * - proof must have valid values for all fields of the struct Proof, namely a, b, and c.
     */
    modifier validProof(Proof memory proof) {
        require(proof.a[0] > 0, "Invalid proof");
        require(proof.a[1] > 0, "Invalid proof");
        require(proof.b[0][0] > 0, "Invalid proof");
        require(proof.b[0][1] > 0, "Invalid proof");
        require(proof.b[1][0] > 0, "Invalid proof");
        require(proof.b[1][1] > 0, "Invalid proof");
        require(proof.c[0] > 0, "Invalid proof");
        require(proof.c[1] > 0, "Invalid proof");
        _;
    }
}
