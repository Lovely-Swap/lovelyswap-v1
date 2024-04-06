import { expect } from 'chai'
import { getBigInt, MaxUint256 } from 'ethers'
import { ERC20, DeflatingERC20__factory, DeflatingERC20, LovelyRouter02, WETH9, LovelyPair, LovelyPair__factory } from '../typechain-types';

import { pairFixture } from './shared/fixtures'
import { expandTo18Decimals, MINIMUM_LIQUIDITY } from './shared/utilities'

import { ecsign } from 'ethereumjs-util'

import { ethers } from "hardhat"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

const overrides = {
    gasLimit: 9999999
}

describe('LovelyRouter02', () => {
    let wallet: SignerWithAddress;


    let token0: ERC20
    let token1: ERC20
    let router: LovelyRouter02
    beforeEach(async function () {
        const accounts = await ethers.getSigners();
        wallet = accounts[0];
        const fixture = await pairFixture(wallet);
        token0 = fixture.token0
        token1 = fixture.token1
        router = fixture.router02
    })

    it('quote', async () => {
        expect(await router.quote(BigInt(1), BigInt(100), BigInt(200))).to.eq(BigInt(2))
        expect(await router.quote(BigInt(2), BigInt(200), BigInt(100))).to.eq(BigInt(1))
        await expect(router.quote(BigInt(0), BigInt(100), BigInt(200))).to.be.revertedWith(
            'Lovely SwapLibrary: INSUFFICIENT_AMOUNT'
        )
        await expect(router.quote(BigInt(1), BigInt(0), BigInt(200))).to.be.revertedWith(
            'Lovely SwapLibrary: INSUFFICIENT_LIQUIDITY'
        )
        await expect(router.quote(BigInt(1), BigInt(100), BigInt(0))).to.be.revertedWith(
            'Lovely SwapLibrary: INSUFFICIENT_LIQUIDITY'
        )
    })

    it('getAmountOut', async () => {
        expect(await router.getAmountOut(BigInt(2), BigInt(100), BigInt(100))).to.eq(BigInt(1))
        await expect(router.getAmountOut(BigInt(0), BigInt(100), BigInt(100))).to.be.revertedWith(
            'Lovely SwapLibrary: INSUFFICIENT_INPUT_AMOUNT'
        )
        await expect(router.getAmountOut(BigInt(2), BigInt(0), BigInt(100))).to.be.revertedWith(
            'Lovely SwapLibrary: INSUFFICIENT_LIQUIDITY'
        )
        await expect(router.getAmountOut(BigInt(2), BigInt(100), BigInt(0))).to.be.revertedWith(
            'Lovely SwapLibrary: INSUFFICIENT_LIQUIDITY'
        )
    })

    it('getAmountIn', async () => {
        expect(await router.getAmountIn(BigInt(1), BigInt(100), BigInt(100))).to.eq(BigInt(2))
        await expect(router.getAmountIn(BigInt(0), BigInt(100), BigInt(100))).to.be.revertedWith(
            'Lovely SwapLibrary: INSUFFICIENT_OUTPUT_AMOUNT'
        )
        await expect(router.getAmountIn(BigInt(1), BigInt(0), BigInt(100))).to.be.revertedWith(
            'Lovely SwapLibrary: INSUFFICIENT_LIQUIDITY'
        )
        await expect(router.getAmountIn(BigInt(1), BigInt(100), BigInt(0))).to.be.revertedWith(
            'Lovely SwapLibrary: INSUFFICIENT_LIQUIDITY'
        )
    })

    it('getAmountsOut', async () => {
        await token0.approve(await router.getAddress(), MaxUint256)
        await token1.approve(await router.getAddress(), MaxUint256)
        await router.addLiquidity(
            await token0.getAddress(),
            await token1.getAddress(),
            BigInt(10000),
            BigInt(10000),
            0,
            0,
            wallet.address,
            MaxUint256
        )

        await expect(router.getAmountsOut(BigInt(2), [await token0.getAddress()])).to.be.revertedWith(
            'Lovely SwapLibrary: INVALID_PATH'
        )
        const path = [await token0.getAddress(), await token1.getAddress()]
        expect(await router.getAmountsOut(BigInt(2), path)).to.deep.eq([BigInt(2), BigInt(1)])
    })

    it('getAmountsIn', async () => {
        await token0.approve(await router.getAddress(), MaxUint256)
        await token1.approve(await router.getAddress(), MaxUint256)
        await router.addLiquidity(
            await token0.getAddress(),
            await token1.getAddress(),
            BigInt(10000),
            BigInt(10000),
            0,
            0,
            wallet.address,
            MaxUint256
        )

        await expect(router.getAmountsIn(BigInt(1), [await token0.getAddress()])).to.be.revertedWith(
            'Lovely SwapLibrary: INVALID_PATH'
        )
        const path = [await token0.getAddress(), await token1.getAddress()]
        expect(await router.getAmountsIn(BigInt(1), path)).to.deep.eq([BigInt(2), BigInt(1)])
    })
})

describe('fee-on-transfer tokens', () => {
    let wallet: SignerWithAddress;

    let DTT: DeflatingERC20
    let WETH: WETH9
    let router: LovelyRouter02
    let pair: LovelyPair
    beforeEach(async function () {
        const accounts = await ethers.getSigners();
        wallet = accounts[0];
        const fixture = await pairFixture(wallet)

        WETH = fixture.WETH
        router = fixture.router02

        DTT = await new DeflatingERC20__factory(wallet).deploy(expandTo18Decimals(10000));
        await fixture.factory.allowToken(DTT, 0);
        // make a DTT<>WETH pair
        await fixture.factory.createPair(await DTT.getAddress(), await WETH.getAddress(), 0)
        const pairAddress = await fixture.factory.getPair(await DTT.getAddress(), await WETH.getAddress())
        pair = LovelyPair__factory.connect(pairAddress, wallet)
    })

    afterEach(async function () {
        expect(await ethers.provider.getBalance(router.getAddress())).to.eq(0)
    })

    async function addLiquidity(DTTAmount: bigint, WETHAmount: bigint) {
        await DTT.approve(await router.getAddress(), MaxUint256)
        await router.addLiquidityETH(await DTT.getAddress(), DTTAmount, DTTAmount, WETHAmount, wallet.address, MaxUint256, {
            ...overrides,
            value: WETHAmount
        })
    }

    it('removeLiquidityETHSupportingFeeOnTransferTokens', async () => {
        const DTTAmount = expandTo18Decimals(1)
        const ETHAmount = expandTo18Decimals(4)
        await addLiquidity(getBigInt(DTTAmount), getBigInt(ETHAmount))

        const DTTInPair = await DTT.balanceOf(await pair.getAddress())
        const WETHInPair = await WETH.balanceOf(await pair.getAddress())
        const liquidity = await pair.balanceOf(wallet.address)
        const totalSupply = await pair.totalSupply()
        const NaiveDTTExpected = DTTInPair * liquidity / totalSupply
        const WETHExpected = WETHInPair * liquidity / totalSupply

        await pair.approve(await router.getAddress(), MaxUint256)
        await router.removeLiquidityETHSupportingFeeOnTransferTokens(
            await DTT.getAddress(),
            liquidity,
            NaiveDTTExpected,
            WETHExpected,
            wallet.address,
            MaxUint256,
            overrides
        )
    })

    it('removeLiquidityETHWithPermitSupportingFeeOnTransferTokens', async () => {
        const DTTAmount = getBigInt(expandTo18Decimals(1)) * getBigInt(100) / getBigInt(99)
        const ETHAmount = getBigInt(expandTo18Decimals(4))
        await addLiquidity(DTTAmount, ETHAmount)

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

        const DTTInPair = await DTT.balanceOf(await pair.getAddress())
        const WETHInPair = await WETH.balanceOf(await pair.getAddress())
        const liquidity = await pair.balanceOf(wallet.address)
        const totalSupply = await pair.totalSupply()
        const NaiveDTTExpected = DTTInPair * liquidity / totalSupply
        const WETHExpected = WETHInPair * liquidity / totalSupply

        await pair.approve(await router.getAddress(), MaxUint256)
        await router.removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
            await DTT.getAddress(),
            liquidity,
            NaiveDTTExpected,
            WETHExpected,
            wallet.address,
            MaxUint256,
            false,
            signature.v,
            signature.r,
            signature.s,
            overrides
        )
    })

    it('removeLiquidityETHWithPermitSupportingFeeOnTransferTokens: 2', async () => {
        const DTTAmount = getBigInt(expandTo18Decimals(1)) * getBigInt(100) / getBigInt(99)
        const ETHAmount = getBigInt(expandTo18Decimals(4))
        await addLiquidity(DTTAmount, ETHAmount)

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

        const DTTInPair = await DTT.balanceOf(await pair.getAddress())
        const WETHInPair = await WETH.balanceOf(await pair.getAddress())
        const liquidity = await pair.balanceOf(wallet.address)
        const totalSupply = await pair.totalSupply()
        const NaiveDTTExpected = DTTInPair * liquidity / totalSupply
        const WETHExpected = WETHInPair * liquidity / totalSupply

        await pair.approve(await router.getAddress(), MaxUint256)
        await router.removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
            await DTT.getAddress(),
            liquidity,
            NaiveDTTExpected,
            WETHExpected,
            wallet.address,
            MaxUint256,
            true,
            signature.v,
            signature.r,
            signature.s,
            overrides
        )
    })

    describe('swapExactTokensForTokensSupportingFeeOnTransferTokens', () => {
        const DTTAmount = getBigInt(expandTo18Decimals(5)) * getBigInt(100) / getBigInt(99)
        const ETHAmount = getBigInt(expandTo18Decimals(10))
        const amountIn = expandTo18Decimals(1)

        beforeEach(async () => {
            await addLiquidity(DTTAmount, ETHAmount)
        })

        it('DTT -> WETH', async () => {
            await DTT.approve(await router.getAddress(), MaxUint256)

            await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amountIn,
                0,
                [await DTT.getAddress(), await WETH.getAddress()],
                wallet.address,
                MaxUint256,
                overrides
            )
        })

        // WETH -> DTT
        it('WETH -> DTT', async () => {
            await WETH.deposit({ value: amountIn }) // mint WETH
            await WETH.approve(await router.getAddress(), MaxUint256)

            await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amountIn,
                0,
                [await WETH.getAddress(), await DTT.getAddress()],
                wallet.address,
                MaxUint256,
                overrides
            )
        })
    })

    // ETH -> DTT
    it('swapExactETHForTokensSupportingFeeOnTransferTokens', async () => {
        const DTTAmount = getBigInt(expandTo18Decimals(10)) * getBigInt(100) / getBigInt(99)
        const ETHAmount = getBigInt(expandTo18Decimals(5))
        const swapAmount = getBigInt(expandTo18Decimals(1))
        await addLiquidity(DTTAmount, ETHAmount)

        await expect(router.swapExactETHForTokensSupportingFeeOnTransferTokens(
            0,
            [await DTT.getAddress(), await DTT.getAddress()],
            wallet.address,
            MaxUint256,
            {
                value: swapAmount
            }
        )).to.be.revertedWith("LovelyV2Router: INVALID_PATH");

        await expect(router.swapExactETHForTokensSupportingFeeOnTransferTokens(
            0,
            [await WETH.getAddress(), await DTT.getAddress()],
            wallet.address,
            0,
            {
                value: swapAmount
            }
        )).to.be.revertedWith("LovelyV2Router: EXPIRED");

        await router.connect(wallet).swapExactETHForTokensSupportingFeeOnTransferTokens(
            0,
            [await WETH.getAddress(), await DTT.getAddress()],
            wallet.address,
            MaxUint256,
            {
                value: swapAmount
            }
        )
    })

    // DTT -> ETH
    it('swapExactTokensForETHSupportingFeeOnTransferTokens', async () => {
        const DTTAmount = getBigInt(expandTo18Decimals(5)) * getBigInt(100) / getBigInt(99)
        const ETHAmount = getBigInt(expandTo18Decimals(10))
        const swapAmount = getBigInt(expandTo18Decimals(1))

        await addLiquidity(DTTAmount, ETHAmount)
        await DTT.approve(await router.getAddress(), MaxUint256)

        await expect(router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            swapAmount,
            0,
            [await DTT.getAddress(), await DTT.getAddress()],
            wallet.address,
            MaxUint256,
            overrides
        )).to.be.revertedWith("LovelyV2Router: INVALID_PATH");

        await expect(router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            swapAmount,
            0,
            [await DTT.getAddress(), await DTT.getAddress()],
            wallet.address,
            0,
            overrides
        )).to.be.revertedWith("LovelyV2Router: EXPIRED");

        await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            swapAmount,
            0,
            [await DTT.getAddress(), await WETH.getAddress()],
            wallet.address,
            MaxUint256,
            overrides
        )
    })
})

describe('fee-on-transfer tokens: reloaded', () => {
    let wallet: SignerWithAddress;

    let DTT: DeflatingERC20
    let DTT2: DeflatingERC20
    let DTT3: DeflatingERC20

    let router: LovelyRouter02
    beforeEach(async function () {
        const accounts = await ethers.getSigners();
        wallet = accounts[0];
        const fixture = await pairFixture(wallet)

        router = fixture.router02

        DTT = await new DeflatingERC20__factory(wallet).deploy(expandTo18Decimals(10000));
        DTT2 = await new DeflatingERC20__factory(wallet).deploy(expandTo18Decimals(100000));
        DTT3 = await new DeflatingERC20__factory(wallet).deploy(expandTo18Decimals(100000));

        await fixture.factory.allowToken(DTT, 0);
        await fixture.factory.allowToken(DTT2, 0);
        await fixture.factory.allowToken(DTT3, 0);
        // make a DTT<>DTT pair
        await fixture.factory.createPair(await DTT.getAddress(), await DTT2.getAddress(), 0)
        await fixture.factory.createPair(await DTT2.getAddress(), await DTT3.getAddress(), 0)

    })

    afterEach(async function () {
        expect(await ethers.provider.getBalance(await router.getAddress())).to.eq(0)
    })

    async function addLiquidity(DTTAmount: bigint, DTT2Amount: bigint, DTT3Amount: bigint) {
        await DTT.approve(await router.getAddress(), MaxUint256)
        await DTT2.approve(await router.getAddress(), MaxUint256)
        await DTT3.approve(await router.getAddress(), MaxUint256)

        await router.addLiquidity(
            await DTT.getAddress(),
            await DTT2.getAddress(),
            DTTAmount,
            DTT2Amount,
            DTTAmount,
            DTT2Amount,
            wallet.address,
            MaxUint256,
            overrides
        )

        await router.addLiquidity(
            await DTT2.getAddress(),
            await DTT3.getAddress(),
            DTT2Amount,
            DTT3Amount,
            DTT2Amount,
            DTT3Amount,
            wallet.address,
            MaxUint256,
            overrides
        )
    }

    describe('swapExactTokensForTokensSupportingFeeOnTransferTokens', () => {
        const DTTAmount = getBigInt(expandTo18Decimals(5)) * getBigInt(100) / getBigInt(99)
        const DTT2Amount = getBigInt(expandTo18Decimals(5))
        const DTT3Amount = getBigInt(expandTo18Decimals(5))
        const amountIn = getBigInt(expandTo18Decimals(1))

        beforeEach(async () => {
            await addLiquidity(DTTAmount, DTT2Amount, DTT3Amount)
        })

        it('DTT -> DTT2', async () => {
            await DTT.approve(await router.getAddress(), MaxUint256)

            await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amountIn,
                0,
                [await DTT.getAddress(), await DTT2.getAddress()],
                wallet.address,
                MaxUint256,
                overrides
            )
        })

        it('DTT -> DTT3', async () => {
            await DTT.approve(await router.getAddress(), MaxUint256)

            await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amountIn,
                0,
                [await DTT.getAddress(), await DTT2.getAddress(), await DTT3.getAddress()],
                wallet.address,
                MaxUint256,
                overrides
            )
        })
    })
})
