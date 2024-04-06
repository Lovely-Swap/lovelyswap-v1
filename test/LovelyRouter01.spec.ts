import { expect } from 'chai'
import { getBigInt, MaxUint256 } from 'ethers'
import { ERC20, LovelyRouter02, WETH9, LovelyPair, LovelyFactory, RouterEventEmitter, LovelyPair__factory } from '../typechain-types';

import { ecsign } from 'ethereumjs-util';

import { expandTo18Decimals, mineBlockIncreaseTime, MINIMUM_LIQUIDITY } from './shared/utilities'
import { pairFixture } from './shared/fixtures'

import { ethers } from "hardhat"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ZERO_ADDRESS } from '../util/utilities';

const overrides = {
    gasLimit: 9999999
}

enum RouterVersion {
    LovelyRouter02 = 'LovelyRouter02'
}

describe('LovelyRouter{01,02}', () => {
    for (const routerVersion of Object.keys(RouterVersion)) {
        let wallet: SignerWithAddress;


        let token0: ERC20
        let token1: ERC20
        let token2: ERC20

        let router: LovelyRouter02

        let WETH: WETH9
        let WETHPartner: ERC20
        let factory: LovelyFactory
        let pair: LovelyPair
        let pair2: LovelyPair
        let WETHPair: LovelyPair
        let routerEventEmitter: RouterEventEmitter
        beforeEach(async function () {
            const accounts = await ethers.getSigners();
            wallet = accounts[0];
            const fixture = await pairFixture(wallet)
            token0 = fixture.token0
            token1 = fixture.token1
            token2 = fixture.token2
            WETH = fixture.WETH
            WETHPartner = fixture.WETHPartner
            factory = fixture.factory
            router = {
                [RouterVersion.LovelyRouter02]: fixture.router02
            }[routerVersion as RouterVersion]
            pair = fixture.pair
            pair2 = fixture.pair2
            WETHPair = fixture.WETHPair
            routerEventEmitter = fixture.routerEventEmitter
        })

        afterEach(async function () {
            expect(await ethers.provider.getBalance(await router.getAddress())).to.eq(0)
        })

        describe(routerVersion, () => {
            it('factory, WETH', async () => {
                expect(await router.factory()).to.eq(await factory.getAddress())
                expect(await router.WETH()).to.eq(await WETH.getAddress())
            })

            it('pair not exist', async () => {
                await expect(
                    router.addLiquidity(
                        await token0.getAddress(),
                        ZERO_ADDRESS,
                        0,
                        0,
                        0,
                        0,
                        wallet.address,
                        MaxUint256,
                        overrides
                    )
                ).to.be.revertedWith("LovelyV2Router: PAIR_NOT_EXIST")
            })

            it('addLiquidity', async () => {
                const token0Amount = getBigInt(expandTo18Decimals(1))
                const token1Amount = getBigInt(expandTo18Decimals(4))

                const expectedLiquidity = getBigInt(expandTo18Decimals(2))
                await token0.approve(await router.getAddress(), MaxUint256)
                await token1.approve(await router.getAddress(), MaxUint256)
                await expect(
                    router.addLiquidity(
                        await token0.getAddress(),
                        await token1.getAddress(),
                        token0Amount,
                        token1Amount,
                        0,
                        0,
                        wallet.address,
                        MaxUint256,
                        overrides
                    )
                )
                    .to.emit(token0, 'Transfer')
                    .withArgs(wallet.address, await pair.getAddress(), token0Amount)
                    .to.emit(token1, 'Transfer')
                    .withArgs(wallet.address, await pair.getAddress(), token1Amount)
                    .to.emit(pair, 'Transfer')
                    .withArgs(ZERO_ADDRESS, ZERO_ADDRESS, MINIMUM_LIQUIDITY)
                    .to.emit(pair, 'Transfer')
                    .withArgs(ZERO_ADDRESS, wallet.address, expectedLiquidity - MINIMUM_LIQUIDITY)
                    .to.emit(pair, 'Sync')
                    .withArgs(token0Amount, token1Amount)
                    .to.emit(pair, 'Mint')
                    .withArgs(await router.getAddress(), token0Amount, token1Amount)

                expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity - MINIMUM_LIQUIDITY)
            })

            it('addLiquidity: not optimal 1', async () => {
                const token0Amount = getBigInt(expandTo18Decimals(1))
                const token1Amount = getBigInt(expandTo18Decimals(1))

                const expectedLiquidity = getBigInt(expandTo18Decimals(1))
                await token0.approve(await router.getAddress(), MaxUint256)
                await token1.approve(await router.getAddress(), MaxUint256)
                await router.addLiquidity(
                    await token0.getAddress(),
                    await token1.getAddress(),
                    token0Amount,
                    token1Amount,
                    0,
                    0,
                    wallet.address,
                    MaxUint256,
                    overrides
                )
                expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity - MINIMUM_LIQUIDITY)

                await expect(router.addLiquidity(
                    await token0.getAddress(),
                    await token1.getAddress(),
                    token0Amount,
                    token1Amount,
                    token0Amount,
                    token1Amount + BigInt(5000),
                    wallet.address,
                    MaxUint256,
                    overrides
                )).to.be.revertedWith("LovelyV2Router: INSUFFICIENT_B_AMOUNT")

                await expect(router.addLiquidity(
                    await token0.getAddress(),
                    await token1.getAddress(),
                    token0Amount,
                    token1Amount,
                    token0Amount,
                    token1Amount,
                    wallet.address,
                    MaxUint256,
                    overrides
                )).to.not.be.reverted

            })

            it('addLiquidity: not optimal 2', async () => {
                const token0Amount = getBigInt(expandTo18Decimals(1))
                const token1Amount = getBigInt(expandTo18Decimals(1))

                const expectedLiquidity = getBigInt(expandTo18Decimals(1))
                await token0.approve(await router.getAddress(), MaxUint256)
                await token1.approve(await router.getAddress(), MaxUint256)
                await router.addLiquidity(
                    await token0.getAddress(),
                    await token1.getAddress(),
                    token0Amount,
                    token1Amount,
                    0,
                    0,
                    wallet.address,
                    MaxUint256,
                    overrides
                )
                expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity - MINIMUM_LIQUIDITY)

                await expect(router.addLiquidity(
                    await token0.getAddress(),
                    await token1.getAddress(),
                    token0Amount + BigInt(5000000),
                    token1Amount,
                    token0Amount + BigInt(5000000),
                    token1Amount,
                    wallet.address,
                    MaxUint256,
                    overrides
                )).to.be.revertedWith("LovelyV2Router: INSUFFICIENT_A_AMOUNT")

                await expect(router.addLiquidity(
                    await token0.getAddress(),
                    await token1.getAddress(),
                    token0Amount + BigInt(5000000),
                    token1Amount,
                    token0Amount,
                    token1Amount,
                    wallet.address,
                    MaxUint256,
                    overrides
                )).to.not.be.reverted

                await expect(router.addLiquidity(
                    await token0.getAddress(),
                    await token1.getAddress(),
                    token0Amount,
                    token1Amount,
                    token0Amount,
                    token1Amount,
                    wallet.address,
                    MaxUint256,
                    overrides
                )).to.not.be.reverted
            })

            it('addLiquidityETH', async () => {
                const WETHPartnerAmount = getBigInt(expandTo18Decimals(1))
                const ETHAmount = getBigInt(expandTo18Decimals(4))

                const expectedLiquidity = getBigInt(expandTo18Decimals(2))
                const WETHPairToken0 = await WETHPair.token0()
                await WETHPartner.approve(await router.getAddress(), MaxUint256)
                await expect(
                    router.addLiquidityETH(
                        await WETHPartner.getAddress(),
                        WETHPartnerAmount,
                        WETHPartnerAmount,
                        ETHAmount,
                        wallet.address,
                        MaxUint256,
                        { ...overrides, value: ETHAmount }
                    )
                )
                    .to.emit(WETHPair, 'Transfer')
                    .withArgs(ZERO_ADDRESS, ZERO_ADDRESS, MINIMUM_LIQUIDITY)
                    .to.emit(WETHPair, 'Transfer')
                    .withArgs(ZERO_ADDRESS, wallet.address, expectedLiquidity - MINIMUM_LIQUIDITY)
                    .to.emit(WETHPair, 'Sync')
                    .withArgs(
                        WETHPairToken0 === await WETHPartner.getAddress() ? WETHPartnerAmount : ETHAmount,
                        WETHPairToken0 === await WETHPartner.getAddress() ? ETHAmount : WETHPartnerAmount
                    )
                    .to.emit(WETHPair, 'Mint')
                    .withArgs(
                        await router.getAddress(),
                        WETHPairToken0 === await WETHPartner.getAddress() ? WETHPartnerAmount : ETHAmount,
                        WETHPairToken0 === await WETHPartner.getAddress() ? ETHAmount : WETHPartnerAmount
                    )

                expect(await WETHPair.balanceOf(wallet.address)).to.eq(expectedLiquidity - MINIMUM_LIQUIDITY)
            })

            it('addLiquidityETH: not optimal 3', async () => {
                const WETHPartnerAmount = getBigInt(expandTo18Decimals(1))
                const ETHAmount = getBigInt(expandTo18Decimals(4))

                const expectedLiquidity = getBigInt(expandTo18Decimals(2))
                await WETHPartner.approve(await router.getAddress(), MaxUint256)
                await router.addLiquidityETH(
                    await WETHPartner.getAddress(),
                    WETHPartnerAmount,
                    WETHPartnerAmount,
                    ETHAmount,
                    wallet.address,
                    MaxUint256,
                    { ...overrides, value: ETHAmount }
                )

                expect(await WETHPair.balanceOf(wallet.address)).to.eq(expectedLiquidity - MINIMUM_LIQUIDITY)

                await expect(router.addLiquidityETH(
                    await WETHPartner.getAddress(),
                    WETHPartnerAmount,
                    WETHPartnerAmount,
                    ETHAmount,
                    wallet.address,
                    MaxUint256,
                    { ...overrides, value: (ETHAmount + BigInt(100)) }
                )).to.not.be.rejected

            })

            async function addLiquidity(token0Amount: bigint, token1Amount: bigint) {
                await token0.transfer(await pair.getAddress(), token0Amount)
                await token1.transfer(await pair.getAddress(), token1Amount)
                await pair.mint(wallet.address, overrides)
            }

            it('removeLiquidity', async () => {
                const token0Amount = getBigInt(expandTo18Decimals(1))
                const token1Amount = getBigInt(expandTo18Decimals(4))
                await addLiquidity(token0Amount, token1Amount)

                const expectedLiquidity = getBigInt(expandTo18Decimals(2))
                await pair.approve(await router.getAddress(), MaxUint256)

                await expect(
                    router.removeLiquidity(
                        await token0.getAddress(),
                        await token1.getAddress(),
                        expectedLiquidity - MINIMUM_LIQUIDITY,
                        token0Amount + BigInt(10000),
                        0,
                        wallet.address,
                        MaxUint256,
                        overrides
                    )
                ).to.be.revertedWith("LovelyV2Router: INSUFFICIENT_A_AMOUNT")

                await expect(
                    router.removeLiquidity(
                        await token0.getAddress(),
                        await token1.getAddress(),
                        expectedLiquidity - MINIMUM_LIQUIDITY,
                        0,
                        token1Amount + BigInt(10000),
                        wallet.address,
                        MaxUint256,
                        overrides
                    )
                ).to.be.revertedWith("LovelyV2Router: INSUFFICIENT_B_AMOUNT")

                await expect(
                    router.removeLiquidity(
                        await token0.getAddress(),
                        await token1.getAddress(),
                        expectedLiquidity - MINIMUM_LIQUIDITY,
                        0,
                        0,
                        wallet.address,
                        MaxUint256,
                        overrides
                    )
                )
                    .to.emit(pair, 'Transfer')
                    .withArgs(wallet.address, await pair.getAddress(), expectedLiquidity - MINIMUM_LIQUIDITY)
                    .to.emit(pair, 'Transfer')
                    .withArgs(await pair.getAddress(), ZERO_ADDRESS, expectedLiquidity - MINIMUM_LIQUIDITY)
                    .to.emit(token0, 'Transfer')
                    .withArgs(await pair.getAddress(), wallet.address, token0Amount - getBigInt(500))
                    .to.emit(token1, 'Transfer')
                    .withArgs(await pair.getAddress(), wallet.address, token1Amount - getBigInt(2000))
                    .to.emit(pair, 'Sync')
                    .withArgs(500, 2000)
                    .to.emit(pair, 'Burn')
                    .withArgs(await router.getAddress(), token0Amount - getBigInt(500), token1Amount - getBigInt(2000), wallet.address)

                expect(await pair.balanceOf(wallet.address)).to.eq(0)
                const totalSupplyToken0 = await token0.totalSupply()
                const totalSupplyToken1 = await token1.totalSupply()
                expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0 - getBigInt(500))
                expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1 - getBigInt(2000))
            })

            it('removeLiquidityETH', async () => {
                const WETHPartnerAmount = getBigInt(expandTo18Decimals(1))
                const ETHAmount = getBigInt(expandTo18Decimals(4))
                await WETHPartner.transfer(await WETHPair.getAddress(), WETHPartnerAmount)
                await WETH.deposit({ value: ETHAmount })
                await WETH.transfer(await WETHPair.getAddress(), ETHAmount)
                await WETHPair.mint(wallet.address, overrides)

                const expectedLiquidity = getBigInt(expandTo18Decimals(2))
                const WETHPairToken0 = await WETHPair.token0()
                await WETHPair.approve(await router.getAddress(), MaxUint256)
                await expect(
                    router.removeLiquidityETH(
                        await WETHPartner.getAddress(),
                        expectedLiquidity - MINIMUM_LIQUIDITY,
                        0,
                        0,
                        wallet.address,
                        MaxUint256,
                        overrides
                    )
                )
                    .to.emit(WETHPair, 'Transfer')
                    .withArgs(wallet.address, await WETHPair.getAddress(), expectedLiquidity - MINIMUM_LIQUIDITY)
                    .to.emit(WETHPair, 'Transfer')
                    .withArgs(await WETHPair.getAddress(), ZERO_ADDRESS, expectedLiquidity - MINIMUM_LIQUIDITY)
                    .to.emit(WETH, 'Transfer')
                    .withArgs(await WETHPair.getAddress(), await router.getAddress(), ETHAmount - getBigInt(2000))
                    .to.emit(WETHPartner, 'Transfer')
                    .withArgs(await WETHPair.getAddress(), await router.getAddress(), WETHPartnerAmount - getBigInt(500))
                    .to.emit(WETHPartner, 'Transfer')
                    .withArgs(await router.getAddress(), wallet.address, WETHPartnerAmount - getBigInt(500))
                    .to.emit(WETHPair, 'Sync')
                    .withArgs(
                        WETHPairToken0 === await WETHPartner.getAddress() ? 500 : 2000,
                        WETHPairToken0 === await WETHPartner.getAddress() ? 2000 : 500
                    )
                    .to.emit(WETHPair, 'Burn')
                    .withArgs(
                        await router.getAddress(),
                        WETHPairToken0 === await WETHPartner.getAddress() ? WETHPartnerAmount - getBigInt(500) : ETHAmount - getBigInt(2000),
                        WETHPairToken0 === await WETHPartner.getAddress() ? ETHAmount - getBigInt(2000) : WETHPartnerAmount - getBigInt(500),
                        await router.getAddress()
                    )

                expect(await WETHPair.balanceOf(wallet.address)).to.eq(0)
                const totalSupplyWETHPartner = await WETHPartner.totalSupply()
                const totalSupplyWETH = await WETH.totalSupply()
                expect(await WETHPartner.balanceOf(wallet.address)).to.eq(totalSupplyWETHPartner - getBigInt(500))
                expect(await WETH.balanceOf(wallet.address)).to.eq(totalSupplyWETH - getBigInt(2000))
            })

            it('removeLiquidityWithPermit', async () => {
                const token0Amount = getBigInt(expandTo18Decimals(1))
                const token1Amount = getBigInt(expandTo18Decimals(4))
                await addLiquidity(token0Amount, token1Amount)

                const expectedLiquidity = getBigInt(expandTo18Decimals(2))

                const nonce = await pair.nonces(wallet.address)
                const sig = await wallet.signTypedData(
                    {
                        name: await pair.name(),
                        version: '1',
                        chainId: 31337,
                        verifyingContract: await pair.getAddress()
                    },
                    {
                        Permit: [
                            {
                                name: "owner",
                                type: "address",
                            },
                            {
                                name: "spender",
                                type: "address",
                            },
                            {
                                name: "value",
                                type: "uint256",
                            },
                            {
                                name: "nonce",
                                type: "uint256",
                            },
                            {
                                name: "deadline",
                                type: "uint256",
                            },
                        ],
                    },
                    {
                        owner: wallet.address,
                        spender: await router.getAddress(),
                        value: expectedLiquidity - MINIMUM_LIQUIDITY,
                        nonce: nonce,
                        deadline: MaxUint256,
                    }
                )
                const signature = ethers.Signature.from(sig)

                await router.removeLiquidityWithPermit(
                    await token0.getAddress(),
                    await token1.getAddress(),
                    expectedLiquidity - MINIMUM_LIQUIDITY,
                    0,
                    0,
                    wallet.address,
                    MaxUint256,
                    false,
                    signature.v,
                    signature.r,
                    signature.s,
                    overrides
                )
            })

            it('removeLiquidityWithPermit: max', async () => {
                const token0Amount = getBigInt(expandTo18Decimals(1))
                const token1Amount = getBigInt(expandTo18Decimals(4))
                await addLiquidity(token0Amount, token1Amount)

                const expectedLiquidity = getBigInt(expandTo18Decimals(2))

                const nonce = await pair.nonces(wallet.address)
                const sig = await wallet.signTypedData(
                    {
                        name: await pair.name(),
                        version: '1',
                        chainId: 31337,
                        verifyingContract: await pair.getAddress()
                    },
                    {
                        Permit: [
                            {
                                name: "owner",
                                type: "address",
                            },
                            {
                                name: "spender",
                                type: "address",
                            },
                            {
                                name: "value",
                                type: "uint256",
                            },
                            {
                                name: "nonce",
                                type: "uint256",
                            },
                            {
                                name: "deadline",
                                type: "uint256",
                            },
                        ],
                    },
                    {
                        owner: wallet.address,
                        spender: await router.getAddress(),
                        value: MaxUint256,
                        nonce: nonce,
                        deadline: MaxUint256,
                    }
                )
                const signature = ethers.Signature.from(sig)

                await router.removeLiquidityWithPermit(
                    await token0.getAddress(),
                    await token1.getAddress(),
                    expectedLiquidity - MINIMUM_LIQUIDITY,
                    0,
                    0,
                    wallet.address,
                    MaxUint256,
                    true,
                    signature.v,
                    signature.r,
                    signature.s,
                    overrides
                )
            })

            it('removeLiquidityETHWithPermit', async () => {
                const WETHPartnerAmount = getBigInt(expandTo18Decimals(1))
                const ETHAmount = getBigInt(expandTo18Decimals(4))
                await WETHPartner.transfer(await WETHPair.getAddress(), WETHPartnerAmount)
                await WETH.deposit({ value: ETHAmount })
                await WETH.transfer(await WETHPair.getAddress(), ETHAmount)
                await WETHPair.mint(wallet.address, overrides)

                const expectedLiquidity = getBigInt(expandTo18Decimals(2))

                const nonce = await WETHPair.nonces(wallet.address)
                const sig = await wallet.signTypedData(
                    {
                        name: await WETHPair.name(),
                        version: '1',
                        chainId: 31337,
                        verifyingContract: await WETHPair.getAddress()
                    },
                    {
                        Permit: [
                            {
                                name: "owner",
                                type: "address",
                            },
                            {
                                name: "spender",
                                type: "address",
                            },
                            {
                                name: "value",
                                type: "uint256",
                            },
                            {
                                name: "nonce",
                                type: "uint256",
                            },
                            {
                                name: "deadline",
                                type: "uint256",
                            },
                        ],
                    },
                    {
                        owner: wallet.address,
                        spender: await router.getAddress(),
                        value: expectedLiquidity - MINIMUM_LIQUIDITY,
                        nonce: nonce,
                        deadline: MaxUint256,
                    }
                )
                const signature = ethers.Signature.from(sig)

                await router.removeLiquidityETHWithPermit(
                    await WETHPartner.getAddress(),
                    expectedLiquidity - MINIMUM_LIQUIDITY,
                    0,
                    0,
                    wallet.address,
                    MaxUint256,
                    false,
                    signature.v,
                    signature.r,
                    signature.s,
                    overrides
                )
            })

            it('removeLiquidityETHWithPermit: max', async () => {
                const WETHPartnerAmount = getBigInt(expandTo18Decimals(1))
                const ETHAmount = getBigInt(expandTo18Decimals(4))
                await WETHPartner.transfer(await WETHPair.getAddress(), WETHPartnerAmount)
                await WETH.deposit({ value: ETHAmount })
                await WETH.transfer(await WETHPair.getAddress(), ETHAmount)
                await WETHPair.mint(wallet.address, overrides)

                const expectedLiquidity = getBigInt(expandTo18Decimals(2))

                const nonce = await WETHPair.nonces(wallet.address)
                const sig = await wallet.signTypedData(
                    {
                        name: await WETHPair.name(),
                        version: '1',
                        chainId: 31337,
                        verifyingContract: await WETHPair.getAddress()
                    },
                    {
                        Permit: [
                            {
                                name: "owner",
                                type: "address",
                            },
                            {
                                name: "spender",
                                type: "address",
                            },
                            {
                                name: "value",
                                type: "uint256",
                            },
                            {
                                name: "nonce",
                                type: "uint256",
                            },
                            {
                                name: "deadline",
                                type: "uint256",
                            },
                        ],
                    },
                    {
                        owner: wallet.address,
                        spender: await router.getAddress(),
                        value: MaxUint256,
                        nonce: nonce,
                        deadline: MaxUint256,
                    }
                )
                const signature = ethers.Signature.from(sig)

                await router.removeLiquidityETHWithPermit(
                    await WETHPartner.getAddress(),
                    expectedLiquidity - MINIMUM_LIQUIDITY,
                    0,
                    0,
                    wallet.address,
                    MaxUint256,
                    true,
                    signature.v,
                    signature.r,
                    signature.s,
                    overrides
                )
            })

            describe('swapExactTokensForTokens', () => {
                const token0Amount = getBigInt(expandTo18Decimals(5))
                const token1Amount = getBigInt(expandTo18Decimals(10))
                const swapAmount = getBigInt(expandTo18Decimals(1))
                const expectedOutputAmount = getBigInt('1662497915624478906')

                beforeEach(async () => {
                    await addLiquidity(token0Amount, token1Amount)
                    await token0.approve(await router.getAddress(), MaxUint256)
                })

                it('happy path', async () => {
                    await expect(
                        router.swapExactTokensForTokens(
                            swapAmount,
                            0,
                            [await token0.getAddress(), await token1.getAddress()],
                            wallet.address,
                            MaxUint256,
                            overrides
                        )
                    )
                        .to.emit(token0, 'Transfer')
                        .withArgs(wallet.address, await pair.getAddress(), swapAmount)
                        .to.emit(token1, 'Transfer')
                        .withArgs(await pair.getAddress(), wallet.address, expectedOutputAmount)
                        .to.emit(pair, 'Sync')
                        .withArgs(token0Amount + swapAmount, token1Amount - expectedOutputAmount)
                        .to.emit(pair, 'Swap')
                        .withArgs(await router.getAddress(), swapAmount, 0, 0, expectedOutputAmount, wallet.address)
                })

                it('amounts', async () => {
                    await token0.approve(await routerEventEmitter.getAddress(), MaxUint256)
                    await expect(
                        routerEventEmitter.swapExactTokensForTokens(
                            await router.getAddress(),
                            swapAmount,
                            0,
                            [await token0.getAddress(), await token1.getAddress()],
                            wallet.address,
                            MaxUint256,
                            overrides
                        )
                    )
                        .to.emit(routerEventEmitter, 'Amounts')
                        .withArgs([swapAmount, expectedOutputAmount])
                })

            })

            describe('swapTokensForExactTokens', () => {
                const token0Amount = getBigInt(expandTo18Decimals(5))
                const token1Amount = getBigInt(expandTo18Decimals(10))
                const expectedSwapAmount = getBigInt('557227237267357629')
                const outputAmount = getBigInt(expandTo18Decimals(1))

                beforeEach(async () => {
                    await addLiquidity(token0Amount, token1Amount)
                })

                it('happy path', async () => {
                    await token0.approve(await router.getAddress(), MaxUint256)
                    await expect(
                        router.swapTokensForExactTokens(
                            outputAmount,
                            MaxUint256,
                            [await token0.getAddress(), await token1.getAddress()],
                            wallet.address,
                            MaxUint256,
                            overrides
                        )
                    )
                        .to.emit(token0, 'Transfer')
                        .withArgs(wallet.address, await pair.getAddress(), expectedSwapAmount)
                        .to.emit(token1, 'Transfer')
                        .withArgs(await pair.getAddress(), wallet.address, outputAmount)
                        .to.emit(pair, 'Sync')
                        .withArgs(token0Amount + expectedSwapAmount, token1Amount - outputAmount)
                        .to.emit(pair, 'Swap')
                        .withArgs(await router.getAddress(), expectedSwapAmount, 0, 0, outputAmount, wallet.address)
                })

                it('ensure', async () => {
                    await token0.approve(await router.getAddress(), MaxUint256)
                    await expect(
                        router.swapTokensForExactTokens(
                            outputAmount,
                            MaxUint256,
                            [await token0.getAddress(), await token1.getAddress()],
                            wallet.address,
                            0,
                            overrides
                        )
                    ).to.be.revertedWith("LovelyV2Router: EXPIRED")
                    await expect(
                        router.addLiquidityETH(
                            await WETHPartner.getAddress(),
                            0,
                            0,
                            0,
                            wallet.address,
                            0,
                            { ...overrides, value: 1000 }
                        )
                    ).to.be.revertedWith("LovelyV2Router: EXPIRED")

                    await expect(
                        router.addLiquidity(
                            await token0.getAddress(),
                            await token1.getAddress(),
                            0,
                            0,
                            0,
                            0,
                            wallet.address,
                            0
                        )
                    ).to.be.revertedWith("LovelyV2Router: EXPIRED")
                    await expect(
                        router.swapExactETHForTokens(0, [await WETH.getAddress(), await WETHPartner.getAddress()], wallet.address, 0, {
                            ...overrides,
                            value: 0
                        })
                    ).to.be.revertedWith("LovelyV2Router: EXPIRED")

                    await expect(
                        router.swapTokensForExactETH(
                            outputAmount,
                            MaxUint256,
                            [await WETHPartner.getAddress(), await WETH.getAddress()],
                            wallet.address,
                            0,
                            overrides
                        )
                    ).to.be.revertedWith("LovelyV2Router: EXPIRED")

                    await expect(
                        router.swapExactTokensForETH(
                            0,
                            0,
                            [await WETHPartner.getAddress(), await WETH.getAddress()],
                            wallet.address,
                            0,
                            overrides
                        )
                    ).to.be.revertedWith("LovelyV2Router: EXPIRED")

                    await expect(
                        router.swapETHForExactTokens(
                            outputAmount,
                            [await WETH.getAddress(), await WETHPartner.getAddress()],
                            wallet.address,
                            0,
                            {
                                ...overrides,
                                value: expectedSwapAmount
                            }
                        )
                    ).to.be.revertedWith("LovelyV2Router: EXPIRED")



                })

                it('amounts', async () => {
                    await token0.approve(await routerEventEmitter.getAddress(), MaxUint256)
                    await expect(
                        routerEventEmitter.swapTokensForExactTokens(
                            await router.getAddress(),
                            outputAmount,
                            MaxUint256,
                            [await token0.getAddress(), await token1.getAddress()],
                            wallet.address,
                            MaxUint256,
                            overrides
                        )
                    )
                        .to.emit(routerEventEmitter, 'Amounts')
                        .withArgs([expectedSwapAmount, outputAmount])
                })
            })

            describe('swapExactETHForTokens', () => {
                const WETHPartnerAmount = getBigInt(expandTo18Decimals(10))
                const ETHAmount = getBigInt(expandTo18Decimals(5))
                const swapAmount = getBigInt(expandTo18Decimals(1))
                const expectedOutputAmount = getBigInt('1662497915624478906')

                beforeEach(async () => {
                    await WETHPartner.transfer(await WETHPair.getAddress(), WETHPartnerAmount)
                    await WETH.deposit({ value: ETHAmount })
                    await WETH.transfer(await WETHPair.getAddress(), ETHAmount)
                    await WETHPair.mint(wallet.address, overrides)

                    await token0.approve(await router.getAddress(), MaxUint256)
                })

                it('happy path', async () => {
                    const WETHPairToken0 = await WETHPair.token0()
                    await expect(
                        router.swapExactETHForTokens(0, [await WETH.getAddress(), await WETHPartner.getAddress()], wallet.address, MaxUint256, {
                            ...overrides,
                            value: swapAmount
                        })
                    )
                        .to.emit(WETH, 'Transfer')
                        .withArgs(await router.getAddress(), await WETHPair.getAddress(), swapAmount)
                        .to.emit(WETHPartner, 'Transfer')
                        .withArgs(await WETHPair.getAddress(), wallet.address, expectedOutputAmount)
                        .to.emit(WETHPair, 'Sync')
                        .withArgs(
                            WETHPairToken0 === await WETHPartner.getAddress()
                                ? WETHPartnerAmount - expectedOutputAmount
                                : ETHAmount + swapAmount,
                            WETHPairToken0 === await WETHPartner.getAddress()
                                ? ETHAmount + swapAmount
                                : WETHPartnerAmount - expectedOutputAmount
                        )
                        .to.emit(WETHPair, 'Swap')
                        .withArgs(
                            await router.getAddress(),
                            WETHPairToken0 === await WETHPartner.getAddress() ? 0 : swapAmount,
                            WETHPairToken0 === await WETHPartner.getAddress() ? swapAmount : 0,
                            WETHPairToken0 === await WETHPartner.getAddress() ? expectedOutputAmount : 0,
                            WETHPairToken0 === await WETHPartner.getAddress() ? 0 : expectedOutputAmount,
                            wallet.address
                        )
                })

                it('amounts', async () => {
                    await expect(
                        routerEventEmitter.swapExactETHForTokens(
                            await router.getAddress(),
                            0,
                            [await WETH.getAddress(), await WETHPartner.getAddress()],
                            wallet.address,
                            MaxUint256,
                            {
                                ...overrides,
                                value: swapAmount
                            }
                        )
                    )
                        .to.emit(routerEventEmitter, 'Amounts')
                        .withArgs([swapAmount, expectedOutputAmount])
                })

            })

            describe('swapTokensForExactETH', () => {
                const WETHPartnerAmount = getBigInt(expandTo18Decimals(5))
                const ETHAmount = getBigInt(expandTo18Decimals(10))
                const expectedSwapAmount = getBigInt('557227237267357629')
                const outputAmount = getBigInt(expandTo18Decimals(1))

                beforeEach(async () => {
                    await WETHPartner.transfer(await WETHPair.getAddress(), WETHPartnerAmount)
                    await WETH.deposit({ value: ETHAmount })
                    await WETH.transfer(await WETHPair.getAddress(), ETHAmount)
                    await WETHPair.mint(wallet.address, overrides)
                })

                it('happy path', async () => {
                    await WETHPartner.approve(await router.getAddress(), MaxUint256)
                    const WETHPairToken0 = await WETHPair.token0()
                    await expect(
                        router.swapTokensForExactETH(
                            outputAmount,
                            MaxUint256,
                            [await WETHPartner.getAddress(), await WETH.getAddress()],
                            wallet.address,
                            MaxUint256,
                            overrides
                        )
                    )
                        .to.emit(WETHPartner, 'Transfer')
                        .withArgs(wallet.address, await WETHPair.getAddress(), expectedSwapAmount)
                        .to.emit(WETH, 'Transfer')
                        .withArgs(await WETHPair.getAddress(), await router.getAddress(), outputAmount)
                        .to.emit(WETHPair, 'Sync')
                        .withArgs(
                            WETHPairToken0 === await WETHPartner.getAddress()
                                ? WETHPartnerAmount + expectedSwapAmount
                                : ETHAmount - outputAmount,
                            WETHPairToken0 === await WETHPartner.getAddress()
                                ? ETHAmount - (outputAmount)
                                : WETHPartnerAmount + (expectedSwapAmount)
                        )
                        .to.emit(WETHPair, 'Swap')
                        .withArgs(
                            await router.getAddress(),
                            WETHPairToken0 === await WETHPartner.getAddress() ? expectedSwapAmount : 0,
                            WETHPairToken0 === await WETHPartner.getAddress() ? 0 : expectedSwapAmount,
                            WETHPairToken0 === await WETHPartner.getAddress() ? 0 : outputAmount,
                            WETHPairToken0 === await WETHPartner.getAddress() ? outputAmount : 0,
                            await router.getAddress()
                        )
                })

                it('amounts', async () => {
                    await WETHPartner.approve(await routerEventEmitter.getAddress(), MaxUint256)
                    await expect(
                        routerEventEmitter.swapTokensForExactETH(
                            await router.getAddress(),
                            outputAmount,
                            MaxUint256,
                            [await WETHPartner.getAddress(), await WETH.getAddress()],
                            wallet.address,
                            MaxUint256,
                            overrides
                        )
                    )
                        .to.emit(routerEventEmitter, 'Amounts')
                        .withArgs([expectedSwapAmount, outputAmount])
                })
            })

            describe('swapExactTokensForETH', () => {
                const WETHPartnerAmount = getBigInt(expandTo18Decimals(5))
                const ETHAmount = getBigInt(expandTo18Decimals(10))
                const swapAmount = getBigInt(expandTo18Decimals(1))
                const expectedOutputAmount = getBigInt('1662497915624478906')

                beforeEach(async () => {
                    await WETHPartner.transfer(await WETHPair.getAddress(), WETHPartnerAmount)
                    await WETH.deposit({ value: ETHAmount })
                    await WETH.transfer(await WETHPair.getAddress(), ETHAmount)
                    await WETHPair.mint(wallet.address, overrides)
                })

                it('happy path', async () => {
                    await WETHPartner.approve(await router.getAddress(), MaxUint256)
                    const WETHPairToken0 = await WETHPair.token0()
                    await expect(
                        router.swapExactTokensForETH(
                            swapAmount,
                            0,
                            [await WETHPartner.getAddress(), await WETH.getAddress()],
                            wallet.address,
                            MaxUint256,
                            overrides
                        )
                    )
                        .to.emit(WETHPartner, 'Transfer')
                        .withArgs(wallet.address, await WETHPair.getAddress(), swapAmount)
                        .to.emit(WETH, 'Transfer')
                        .withArgs(await WETHPair.getAddress(), await router.getAddress(), expectedOutputAmount)
                        .to.emit(WETHPair, 'Sync')
                        .withArgs(
                            WETHPairToken0 === await WETHPartner.getAddress()
                                ? WETHPartnerAmount + (swapAmount)
                                : ETHAmount - (expectedOutputAmount),
                            WETHPairToken0 === await WETHPartner.getAddress()
                                ? ETHAmount - (expectedOutputAmount)
                                : WETHPartnerAmount + (swapAmount)
                        )
                        .to.emit(WETHPair, 'Swap')
                        .withArgs(
                            await router.getAddress(),
                            WETHPairToken0 === await WETHPartner.getAddress() ? swapAmount : 0,
                            WETHPairToken0 === await WETHPartner.getAddress() ? 0 : swapAmount,
                            WETHPairToken0 === await WETHPartner.getAddress() ? 0 : expectedOutputAmount,
                            WETHPairToken0 === await WETHPartner.getAddress() ? expectedOutputAmount : 0,
                            await router.getAddress()
                        )
                })

                it('amounts', async () => {
                    await WETHPartner.approve(await routerEventEmitter.getAddress(), MaxUint256)
                    await expect(
                        routerEventEmitter.swapExactTokensForETH(
                            await router.getAddress(),
                            swapAmount,
                            0,
                            [await WETHPartner.getAddress(), await WETH.getAddress()],
                            wallet.address,
                            MaxUint256,
                            overrides
                        )
                    )
                        .to.emit(routerEventEmitter, 'Amounts')
                        .withArgs([swapAmount, expectedOutputAmount])
                })
            })

            describe('swapETHForExactTokens', () => {
                const WETHPartnerAmount = getBigInt(expandTo18Decimals(10))
                const ETHAmount = getBigInt(expandTo18Decimals(5))
                const expectedSwapAmount = getBigInt('557227237267357629')
                const outputAmount = getBigInt(expandTo18Decimals(1))

                beforeEach(async () => {
                    await WETHPartner.transfer(await WETHPair.getAddress(), WETHPartnerAmount)
                    await WETH.deposit({ value: ETHAmount })
                    await WETH.transfer(await WETHPair.getAddress(), ETHAmount)
                    await WETHPair.mint(wallet.address, overrides)
                })

                it('happy path', async () => {
                    const WETHPairToken0 = await WETHPair.token0()
                    await expect(
                        router.swapETHForExactTokens(
                            outputAmount,
                            [await WETH.getAddress(), await WETHPartner.getAddress()],
                            wallet.address,
                            MaxUint256,
                            {
                                ...overrides,
                                value: expectedSwapAmount
                            }
                        )
                    )
                        .to.emit(WETH, 'Transfer')
                        .withArgs(await router.getAddress(), await WETHPair.getAddress(), expectedSwapAmount)
                        .to.emit(WETHPartner, 'Transfer')
                        .withArgs(await WETHPair.getAddress(), wallet.address, outputAmount)
                        .to.emit(WETHPair, 'Sync')
                        .withArgs(
                            WETHPairToken0 === await WETHPartner.getAddress()
                                ? WETHPartnerAmount - (outputAmount)
                                : ETHAmount + (expectedSwapAmount),
                            WETHPairToken0 === await WETHPartner.getAddress()
                                ? ETHAmount + (expectedSwapAmount)
                                : WETHPartnerAmount - (outputAmount)
                        )
                        .to.emit(WETHPair, 'Swap')
                        .withArgs(
                            await router.getAddress(),
                            WETHPairToken0 === await WETHPartner.getAddress() ? 0 : expectedSwapAmount,
                            WETHPairToken0 === await WETHPartner.getAddress() ? expectedSwapAmount : 0,
                            WETHPairToken0 === await WETHPartner.getAddress() ? outputAmount : 0,
                            WETHPairToken0 === await WETHPartner.getAddress() ? 0 : outputAmount,
                            wallet.address
                        )
                })

                it('amounts', async () => {
                    await expect(
                        routerEventEmitter.swapETHForExactTokens(
                            await router.getAddress(),
                            outputAmount,
                            [await WETH.getAddress(), await WETHPartner.getAddress()],
                            wallet.address,
                            MaxUint256,
                            {
                                ...overrides,
                                value: expectedSwapAmount
                            }
                        )
                    )
                        .to.emit(routerEventEmitter, 'Amounts')
                        .withArgs([expectedSwapAmount, outputAmount])
                })
            })
        })
    }
})
