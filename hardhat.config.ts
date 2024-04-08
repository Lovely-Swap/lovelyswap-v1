import { HardhatUserConfig } from "hardhat/config";
import { HardhatNetworkAccountsUserConfig } from "hardhat/types/config";
import { ethers } from "ethers";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import { config as dotEnvConfig } from "dotenv";
import "hardhat-contract-sizer";

dotEnvConfig();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      viaIR: true,
      optimizer: {
        runs: 200,
        enabled: true,
        details: {
          yulDetails: {
            optimizerSteps: "u",
          },
        },
      },
      evmVersion: "shanghai"
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    hardhat: {
      accounts: {
        count: 100
      },
    },
    bsc_testnet: {
      url: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      gasPrice: 20000000000,
      accounts: [process.env.TESTNET_PRIVATE_KEY as string]
    },
    bsc: {
      url: "https://bsc-dataseed.bnbchain.org/",
      chainId: 56,
      gasPrice: 20000000000,
      accounts: [process.env.MAINNET_PRIVATE_KEY as string]
    },
    polygon: {
      url: "https://polygon.meowrpc.com/",
      chainId: 137,
      gasPrice: 20000000000,
      accounts: [process.env.MAINNET_PRIVATE_KEY as string]
    },
    polygonMumbai: {
      url: "https://rpc-mumbai.maticvigil.com/",
      chainId: 80001,
      gasPrice: 20000000000,
      accounts: [process.env.TESTNET_PRIVATE_KEY as string]
    },
  },
  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSC_SCAN_API as string,
      bsc: process.env.BSC_SCAN_API as string,
      polygon: process.env.POLYGON_SCAN_API as string,
      polygonMumbai: process.env.POLYGON_SCAN_API as string,
    }
  },
  mocha: {
    timeout: 600000
  },
};

export default config;

