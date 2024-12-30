import { ethers, upgrades } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { LFSwapRouter02__factory } from '../typechain-types';

dotEnvConfig();

async function main() {
    const [deployer] = await ethers.getSigners();

    const factory = process.env.FACTORY_ADDRESS as string;
    const wrappedNative = process.env.WRAPPED_NATIVE_ADDRESS as string;

    const router = await new LFSwapRouter02__factory(deployer).deploy(factory, wrappedNative);

    console.log(`Router deployed to ${await router.getAddress()}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
