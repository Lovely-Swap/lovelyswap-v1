import { ethers, upgrades } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { LovelyFactory__factory } from '../typechain-types';

dotEnvConfig();

async function main() {
  const ContractFactory = await ethers.getContractFactory("LovelyFactory");
  const [deployer] = await ethers.getSigners();

  const feeToSetter = process.env.FEE_SETTER_ADDRESS as string;
  const feeToken = process.env.FEE_TOKEN_ADDRESS as string;
  const ownerFee = process.env.OWNER_FEE as string;
  const lpFee = process.env.LP_FEE as string;

  const factory = await new LovelyFactory__factory(deployer).deploy(feeToSetter, feeToken, ownerFee, lpFee);

  console.log(`Factory deployed to ${await factory.getAddress()}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
