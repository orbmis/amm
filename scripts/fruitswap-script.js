// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

const toWei = amount => BigInt(amount) * (10n ** 18n)

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const apples = await Token.deploy(toWei(10000n), 'Apples', 'APPLE').then(c => c.deployed())
  const oranges = await Token.deploy(toWei(10000n), 'Ornages', 'ORNAGE').then(c => c.deployed())

  const Fruitswap = await hre.ethers.getContractFactory("Fruitswap");
  const fruitswap = await Fruitswap.deploy(apples.address, oranges.address);

  await fruitswap.deployed();

  console.log("Fruitswap deployed to:", fruitswap.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
