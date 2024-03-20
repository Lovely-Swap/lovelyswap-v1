# LovelyFinance

This project contains smart contracts for Lovely Finance.

## Requirements
Nodejs: v18.15.0

## Installing dependencies

```npm install```

## Testing 
```npm run test```

## Coverage
Due to instrumentation that coverage tool uses it's important to update the init code in the ./contracts/libraries/LovelyLibrary.sol. To get the correct init code, compile the contract with the coverage instrumentation and call ```npm run init_code_hash```

When init code is set:
```
npm run converage 
```

## Configuration
Use .env.example file as an example of configuration.
Create .env file where all the fields from .env.example file are present.  

TESTNET_PRIVATE_KEY - private key from a deployer address 
MAINNET_PRIVATE_KEY - private key from a deployer address

BSC_SCAN_API - api key from the bscscan. Can be obtained here: https://bscscan.com/

ETHERSCAN_API_KEY - api key from the etherscan. Can be obtained here: https://etherscan.io/

POLYGONSCAN_API_KEY - api key from the polygonscan. Can be obtained here: https://polygonscan.com/

FEE_SETTER_ADDRESS - an address where permissions to update fees will be granted

FEE_TOKEN_ADDRESS - a token that will be used to charge fees for other tokens listing

OWNER_FEE - fees that will go to the dex owner: 1 is 0.01%

LP_FEE - fees that will go to the liquidity pool: 1 is 0.01%

WRAPPED_NATIVE_ADDRESS - Official wrapped native coin of a platform
FACTORY_ADDRESS - Address of the factory. Used to deploy the router.

## Deploying the contract

You can target any network from your Hardhat config using:

```
npm run deploy_factory --network <network>
```
example
```
npm run deploy_factory --network bsc_testnet
```
<b>After the factory contract is deployed, paste its address into the .env and deploy the lock contract</b>

```
npm run deploy_router --network <network>
```
example
```
npm run deploy_router --network bsc_testnet
```

Trading competition router could be deployed by
```
npm run deploy_TC_router --network <network>
```
example
```
npm run deploy_TC_router --network bsc_testnet
```

## Verify implementation
To verify the Factory:
```
npm run verify_factory <contract_address> -- --network <network> "<FEE_SETTER_ADDRESS>" "<FEE_TOKEN_ADDRESS>" "<OWNER_FEE>" "<LP_FEE>"
```
Example:
```
npm run verify_factory 0xD44C0f09B2da313dA1099c89215d8c1ff18c8659 -- --network bsc_testnet "0x6dF8eE7833c1B17aCDAC029bD264ec21993ec02c" "0x4b8eed87b61023f5beccebd2868c058fee6b7ac7" "5" "15"
```

To verify the Router contract:
```
npm run verify_router <contract_address> -- --network <network> "<factory_address>" "<wrapped_native_address>"
```
Example:
```
npm run verify_router 0xb4EF6AA882ED1B0b320B202f4f824b45F7d67191  -- --network bsc_testnet "0xD44C0f09B2da313dA1099c89215d8c1ff18c8659" "0x5b3e2bc1da86ff6235d9ead4504d598cae77dbcb
```

To verify the Trading Competition Router contract:
```
npm run verify_TC_router <contract_address> -- --network <network> "<factory_address>" "<wrapped_native_address>"
```
Example:
```
npm run verify_TC_router 0xb4EF6AA882ED1B0b320B202f4f824b45F7d67191  -- --network bsc_testnet "0xD44C0f09B2da313dA1099c89215d8c1ff18c8659" "0x5b3e2bc1da86ff6235d9ead4504d598cae77dbcb
```
