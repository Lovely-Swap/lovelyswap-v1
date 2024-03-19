import { Wallet } from 'ethers'

import { expandTo18Decimals } from './utilities'
import {
  ERC20, ERC20__factory, WETH9, WETH9__factory, LovelyFactory, LovelyFactory__factory, LovelyPair, LovelyPair__factory,
  LovelyRouter02, LovelyRouter02__factory, RouterEventEmitter, RouterEventEmitter__factory
} from '../../typechain-types'
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from 'hardhat';

const overrides = {
  gasLimit: 9999999
}

interface FactoryFixture {
  factory: LovelyFactory,
  feeToken: ERC20
}

interface V2Fixture extends FactoryFixture {
  token0: ERC20
  token1: ERC20
  WETH: WETH9
  WETHPartner: ERC20
  router02: LovelyRouter02
  routerEventEmitter: RouterEventEmitter
  pair: LovelyPair
  WETHPair: LovelyPair
}

export async function factoryFixture(wallet: SignerWithAddress): Promise<FactoryFixture> {
  const feeToken = await new ERC20__factory(wallet).deploy(expandTo18Decimals(10000));
  const factory = await new LovelyFactory__factory(wallet).deploy(wallet.address, await feeToken.getAddress(), 10, 20);
  return { factory, feeToken }
}

export async function pairFixture(wallet: SignerWithAddress): Promise<V2Fixture> {
  const { factory, feeToken } = await factoryFixture(wallet)

  const tokenA = await new ERC20__factory(wallet).deploy(expandTo18Decimals(10000));
  const tokenB = await new ERC20__factory(wallet).deploy(expandTo18Decimals(10000));
  factory.allowToken(tokenA, 0);
  factory.allowToken(tokenB, 0);

  const WETH = await new WETH9__factory(wallet).deploy();
  const WETHPartner = await new ERC20__factory(wallet).deploy(expandTo18Decimals(10000));
  factory.allowToken(WETH, 0);
  factory.allowToken(WETHPartner, 0);

  const timestamp = (await ethers.provider.getBlock('latest'))!.timestamp
  await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress(), timestamp)
  const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress())
  const pair = LovelyPair__factory.connect(pairAddress, wallet);

  const router02 = await new LovelyRouter02__factory(wallet).deploy(await factory.getAddress(), await WETH.getAddress());


  const token0Address = (await pair.token0())
  const token0 = await tokenA.getAddress() === token0Address ? tokenA : tokenB
  const token1 = await tokenA.getAddress() === token0Address ? tokenB : tokenA

  const routerEventEmitter = await new RouterEventEmitter__factory(wallet).deploy();

  await factory.createPair(await WETH.getAddress(), await WETHPartner.getAddress(), timestamp);
  const WETHPairAddress = await factory.getPair(await WETH.getAddress(), await WETHPartner.getAddress())
  const WETHPair = LovelyPair__factory.connect(WETHPairAddress, wallet);


  return { factory, feeToken, token0, token1, WETH, WETHPartner, router02, routerEventEmitter, pair, WETHPair }
}

