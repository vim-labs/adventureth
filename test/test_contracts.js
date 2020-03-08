const { assert } = require("chai");
const ZeneKaG16 = artifacts.require("ZeneKaG16");
const Adventureth = artifacts.require("Adventureth");
const vk1 = require("../examples/example_vk_1.json")["vkG16"];
const vk2 = require("../examples/example_vk_2.json")["vkG16"];
const vk3 = require("../examples/example_vk_3.json")["vkG16"];
const id1 = require("../examples/example_vk_id_1.json")["vkG16Id"];
const id2 = require("../examples/example_vk_id_2.json")["vkG16Id"];
const id3 = require("../examples/example_vk_id_3.json")["vkG16Id"];
const proof1 = require("../examples/example_proof_1.json")["proofG16"];
const proofHash1 = require("../examples/example_proofHash_1.json")[
  "proofHashG16"
];

let zeneKaG16;
let adventureth;
contract("ZeneKaG16", () => {
  it("should initialize ZeneKa", async () => {
    zeneKaG16 = await ZeneKaG16.deployed();
    console.log("ZeneKaG16 Address:", zeneKaG16.address);
  });
});

contract("Adventureth", accounts => {
  const [k0, k1] = accounts;

  it("should initialize Adventureth", async () => {
    adventureth = await Adventureth.deployed();
    console.log("Adventureth Address:", adventureth.address);
  });

  it("should add the ZeneKa16 Contract", async () => {
    await adventureth.updateZenekaG16Address(zeneKaG16.address, { from: k0 });
  });

  it("should register fist verifying key", async () => {
    await adventureth.register("0x0", ...vk1, {
      from: k0,
      value: web3.utils.toWei("1", "ether")
    });
  });

  it("should register second verifying key", async () => {
    await adventureth.register(id1, ...vk2, { from: k0 });
  });

  it("should register third verifying key", async () => {
    await adventureth.register(id2, ...vk3, { from: k0 });
  });

  it("should return operator", async () => {
    const operator = await adventureth.operator(id1);
    assert(operator === k0);
  });

  it("should exist", async () => {
    const exists = await adventureth.exists(id1);
    assert.isTrue(exists);
  });

  it("should return reward", async () => {
    const reward = (await adventureth.reward(id1)).toString();
    assert(web3.utils.fromWei(reward, "ether") === "1");
  });

  it("should add reward", async () => {
    await adventureth.addReward(id3, {
      from: k0,
      value: web3.utils.toWei("1", "ether")
    });
    const reward = (await adventureth.reward(id3)).toString();
    assert(web3.utils.fromWei(reward, "ether") === "1");
  });

  it("should withdraw a reward", async () => {
    await adventureth.withdraw(id1, {
      from: k0
    });
  });

  it("should transfer a reward to a new level", async () => {
    await adventureth.transfer(id2, id3, {
      from: k0
    });
  });

  it("should set an IPFS address", async () => {
    await adventureth.setIPFS(
      id1,
      "QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx",
      { from: k0 }
    );
  });

  it("should get an IPFS address", async () => {
    const ipfsAddress = await adventureth.getIPFS(id1);
    assert(ipfsAddress == "QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx");
  });

  it("should link keys", async () => {
    const nextFromSecond = await adventureth.next(id2);
    assert(nextFromSecond == id3);

    const prevFromThird = await adventureth.prev(id3);
    assert(prevFromThird == id2);
  });

  it("should commit a proofHash", async () => {
    await adventureth.commit(id1, proofHash1, { from: k0 });
  });

  it("should solve a challenge", async () => {
    await adventureth.solve(id1, ...proof1, { from: k0 });
  });

  it("should return the first challenge solver", async () => {
    const solver = await adventureth.solver(id1);
    assert(solver == k0);
  });

  it("should return the solve status", async () => {
    const solvedK0 = await adventureth.solved(id1, k0);
    assert.isTrue(solvedK0);

    const solvedK1 = await adventureth.solved(id1, k1);
    assert.isNotTrue(solvedK1);
  });

  it("should return the total solvers", async () => {
    const solvers = (await adventureth.solvers(id1)).toString();
    assert(solvers === "1");
  });

  it("should return the solver by index", async () => {
    const solverK0 = await adventureth.solverByIndex(id1, 0);
    assert(solverK0 === k0);
  });

  it("should mint NFTs", async () => {
    const totalSupply = (await adventureth.totalSupply.call()).toNumber();
    assert(totalSupply == 1);

    const tkn1 = await adventureth.tokenToId(1);
    assert(tkn1 == id1);

    const tkn1Solver = await adventureth.tokenToSolver(1);
    assert(tkn1Solver == k0);
  });
});
