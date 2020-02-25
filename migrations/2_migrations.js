const BN256G2 = artifacts.require("Zeneka/BN256G2.sol");
const ZeneKaG16 = artifacts.require("Zeneka/ZeneKaG16.sol");
const Adventureth = artifacts.require("Adventureth.sol");

module.exports = deployer => {
  // Link libraries
  deployer.deploy(BN256G2);
  deployer.link(BN256G2, [ZeneKaG16]);

  // Deploy contracts
  const zeneKaG16 = deployer.deploy(ZeneKaG16);
  const adventureth = deployer.deploy(Adventureth);
};
