<p align="center">
	<img src="https://user-images.githubusercontent.com/25379378/75189749-b4ea6500-5703-11ea-91d9-529ef4264dbe.png" width="640" alt="Adventureth Logo" />
	<p align="center">
		Adventures with Ethereum zkSNARKs.
	</p>
</p>

Exclusive proofs of knowledge with ZeneKa zkSNARKs on Medium.com:
https://medium.com/@iRyanBell/exclusive-proofs-of-knowledge-with-zeneka-zksnarks-8d95bffeec88

## Adding a challenge:

New challenges are added as G16 zkSNARKs with:

```
register(
	bytes32 prev,
	bytes32[2] a,
	bytes32[2][2] b,
	bytes32[2][2] gamma,
	bytes32[2][2] delta,
	uint256 gamma_abc_len,
	bytes32[2][] gamma_abc
)

```

where `prev` represents an optional _previous_ challenge identifier. The first id in a series is registered as `0`.

A challenge `id` is calculated as `keccak256(a, b, gamma, delta, gamma_abc_len, gamma_abc)`.

## Solving a challenge:

To solve a challenge, a participant first commits a hash of their proof as: `commit(bytes32 id, bytes32 proofHash)`

Then, participants solve a challenge with:

```
solve(
	bytes32 id,
	uint256[2] a,
	uint256[2][2] b,
	uint256[2] c,
	uint256[] input
)
```

Upon solving a challenge, a new ERC721 token is minted in recognition of the accomplishment.

## API

```
/* Setters */
// Register a new gameplay level
register(bytes32 _prev, ...verificationKey) payable

// Change the operator for a challenge level id
updateOperator(bytes32 _id, address _address)

// Set the IPFS metadata for an id (requires isOperator)
setIPFS(bytes32 _id, string memory _ipfsAddress)

// Prepare to submit a solution
commit(bytes32 _id, bytes32 _proofHash)

// Submit a solution
solve(bytes32 _id, ...proof)

// Add rewards to level
addReward(bytes32 _id) payable

// Transfer reward to a new level (requires isOperator)
transfer(bytes32 _from, bytes32 _to)

// Withdraw challenge reward (requires isOperator)
withdraw(bytes32 _id)

/* Getters */
// Get the previous level
prev(bytes32 _id) -> bytes32

// Get the next level
next(bytes32 _id) -> bytes32

// Get the existence of a challenge
exists(bytes32 _id) -> bool

// Get the IPFS metadata for an id
getIPFS(bytes32 _id) -> string

// Get first challenge solver
solver(bytes32 _id) -> address

// Get the solve status
solved(bytes32 _id, address _address) -> bool

// Get the challenge id for a token
tokenToId(uint256 _tokenId) -> bytes32

// Get the solver for a tokenId
tokenToSolver(uint256 _tokenId) -> address

// Get the number of solvers for a tokenId
solvers(uint256 _tokenId) -> uint256

// Get the challenge reward
reward(bytes32 _id) -> uint256

// Get the challenge operator
operator(bytes32 _id) -> address

/* Internal */
// Update zkSNARK registry
updateAdventurethOperator(address _operator)
updateZenekaG16Address(address _address)
```

## Why zkSNARKS?

Zero-knowledge succinct non-interactive argument of knowledge proofs (zkSNARKs) allow statements to be proven without revealing the details referenced within these statements. In Adventureth, these allow participants to prove that they have obtained a valid solution to a challenge without reveal any additional details.

## Testing

```bash
truffle init
truffle compile
truffle test
```

## Mainnet address

```
0x793f389cc1f7d42fa1f1bba68d16a1e00067cb04
```

## View on the distributed web

https://ipfs.io/ipfs/QmavkedsovxmUNXVY2yiWAigM6T2wr6wiEKEMFLUMxAif2/

## Challenge 001 (0.025ETH Reward Bounty) [SOLVED]:

Challenge:
https://adventureth.com/0xd77018c3f8a98f399cfbf86227b1f5c654edb746dce5b3892d719915983f1b26

Puzzle:
![QmV1aymbknLTtrZX3wKex9CfbLcGiwPgqTmUWx1zAvCf9j](https://user-images.githubusercontent.com/25379378/76173434-dfeda380-615c-11ea-805c-a3f79ba86aaa.jpg)

Solution: `こんにちは`
