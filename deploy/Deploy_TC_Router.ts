import { ethers, upgrades } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { LFSwapTCRouter__factory, RewardsVaultDeployer__factory } from '../typechain-types';

dotEnvConfig();

async function main() {
    const [deployer] = await ethers.getSigners();

    const factory = process.env.FACTORY_ADDRESS as string;
    const wrappedNative = process.env.WRAPPED_NATIVE_ADDRESS as string;
    const competitionFee = process.env.COMPETITION_FEE as string;
    const maxCompetitior = process.env.MAX_COMPETITORS as string;
    const vaultDeployer = await new RewardsVaultDeployer__factory(deployer).deploy()
    const router = await new LFSwapTCRouter__factory(deployer).deploy(factory, wrappedNative, vaultDeployer, BigInt(competitionFee), BigInt(maxCompetitior));

    console.log(`Proxy deployed to ${await router.getAddress()}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
