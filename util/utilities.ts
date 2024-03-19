import { ethers} from 'hardhat';

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function expandTo18Decimals(n: number): BigInt {
  return BigInt(n) * (BigInt(10) ** BigInt(18));
}

export async function setTimestamp(provider: typeof ethers.provider, timestamp: number): Promise<void> {
  await provider.send('evm_setNextBlockTimestamp', [timestamp]);
}

