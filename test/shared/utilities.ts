import {
  Contract,
  getAddress,
  keccak256,
  toUtf8Bytes,
  solidityPacked,
  AbiCoder,
  BigNumberish
} from 'ethers'
import { ethers } from "hardhat"
import { ERC20 } from '../../typechain-types';


export const MINIMUM_LIQUIDITY = BigInt(10) ** BigInt(3)

const PERMIT_TYPEHASH = keccak256(
  toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

export function expandTo18Decimals(n: number): BigNumberish {
  return BigInt(n) * (BigInt(10) ** BigInt(18));
}

function getDomainSeparator(name: string, tokenAddress: string) {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        keccak256(toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        keccak256(toUtf8Bytes(name)),
        keccak256(toUtf8Bytes('1')),
        1,
        tokenAddress
      ]
    )
  )
}

export function getCreate2Address(
  factoryAddress: string,
  [tokenA, tokenB]: [string, string],
  bytecode: string
): string {
  const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]
  const create2Inputs = [
    '0xff',
    factoryAddress,
    keccak256(solidityPacked(['address', 'address'], [token0, token1])),
    keccak256(bytecode)
  ]
  const sanitizedInputs = `0x${create2Inputs.map(i => i.slice(2)).join('')}`
  return getAddress(`0x${keccak256(sanitizedInputs).slice(-40)}`)
}

export async function mineBlock(timestamp: number): Promise<void> {
  await ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
  await ethers.provider.send('evm_mine', []);
}

export async function mineBlockIncreaseTime(value: number): Promise<void> {
  await ethers.provider.send('evm_increaseTime', [value]);
  await ethers.provider.send('evm_mine', []);
}

export function encodePrice(reserve0: bigint, reserve1: bigint) {
  return [reserve1 * (BigInt(2) ** BigInt(112)) / (reserve0), reserve0 * (BigInt(2) ** BigInt(112)) / (reserve1)]
}

/** Generates BigInts between low (inclusive) and high (exclusive) */
export function generateRandomBigInt(lowBigInt: bigint, highBigInt: bigint) {
  if (lowBigInt >= highBigInt) {
    throw new Error('lowBigInt must be smaller than highBigInt');
  }

  const difference = highBigInt - lowBigInt;
  const differenceLength = difference.toString().length;
  let multiplier = '';
  while (multiplier.length < differenceLength) {
    multiplier += Math.random()
      .toString()
      .split('.')[1];
  }
  multiplier = multiplier.slice(0, differenceLength);
  const divisor = '1' + '0'.repeat(differenceLength);

  const randomDifference = (difference * BigInt(multiplier)) / BigInt(divisor);

  return lowBigInt + randomDifference;
}