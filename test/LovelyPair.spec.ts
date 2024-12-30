import { expect } from 'chai'
import { getBigInt, BigNumberish } from 'ethers'
import { ethers } from "hardhat"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expandTo18Decimals, mineBlock, encodePrice } from './shared/utilities'
import { pairFixture } from './shared/fixtures'
import { ERC20, LFSwapFactory, LFSwapPair, ERC20__factory, LFSwapPair__factory, Callback } from '../typechain-types';
import { ZERO_ADDRESS } from '../util/utilities';

const MINIMUM_LIQUIDITY = BigInt(10 ** 3)

describe('LFSwapPair', () => {

    let wallet: SignerWithAddress;
    let other: SignerWithAddress;


    let factory: LFSwapFactory
    let token0: ERC20
    let token1: ERC20
    let pair: LFSwapPair
    let callbackHelper: Callback
    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        wallet = accounts[0];
        other = accounts[1];
        const fixture = await pairFixture(wallet)
        factory = fixture.factory
        token0 = fixture.token0
        token1 = fixture.token1
        pair = fixture.pair
        callbackHelper = fixture.callbackHelper
    })

    it('not available', async () => {
        const timestamp = (await ethers.provider.getBlock('latest'))!.timestamp
        const days7 = 7 * 24 * 60 * 60
        const token2 = await new ERC20__factory(wallet).deploy(expandTo18Decimals(10000));

        await factory.allowToken(token2, timestamp + days7);
        await factory.createPair(token1, token2, timestamp + days7);
        const pairAddress = await factory.getPair(await token1.getAddress(), await token2.getAddress())
        const pair = LFSwapPair__factory.connect(pairAddress, wallet);

        const token1Amount = expandTo18Decimals(1)
        const token2Amount = expandTo18Decimals(4)
        await token1.transfer(await pair.getAddress(), token1Amount)
        await token2.transfer(await pair.getAddress(), token2Amount)
        await expect(pair.mint(other.address)).to.be.rejectedWith("LFSwap Swap: NOT ACTIVE")
        await expect(pair.mint(wallet.address)).to.emit(pair, 'Transfer')
        await expect(pair.mint(wallet.address)).to.be.revertedWith("LFSwap Swap: INSUFFICIENT_LIQUIDITY_MINTED")

        await expect(pair.initialize(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, 0)).to.be.revertedWith("LFSwap Swap: FORBIDDEN")
    })

    it('skim', async () => {
        const token0Amount = expandTo18Decimals(1)
        await token0.transfer(await pair.getAddress(), token0Amount)
        await expect(pair.skim(wallet.address)).to.emit(token0, 'Transfer')
    })

    it('mint', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)
        await token0.transfer(await pair.getAddress(), token0Amount)
        await token1.transfer(await pair.getAddress(), token1Amount)

        const expectedLiquidity = expandTo18Decimals(2)
        await expect(pair.mint(wallet.address))
            .to.emit(pair, 'Transfer')
            .withArgs(ZERO_ADDRESS, ZERO_ADDRESS, MINIMUM_LIQUIDITY)
            .to.emit(pair, 'Transfer')
            .withArgs(ZERO_ADDRESS, wallet.address, getBigInt(expectedLiquidity) - MINIMUM_LIQUIDITY)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount, token1Amount)
            .to.emit(pair, 'Mint')
            .withArgs(wallet.address, token0Amount, token1Amount)

        expect(await pair.totalSupply()).to.eq(expectedLiquidity)
        expect(await pair.balanceOf(wallet.address)).to.eq(getBigInt(expectedLiquidity) - MINIMUM_LIQUIDITY)
        expect(await token0.balanceOf(await pair.getAddress())).to.eq(token0Amount)
        expect(await token1.balanceOf(await pair.getAddress())).to.eq(token1Amount)
        const reserves = await pair.getReserves()
        expect(reserves[0]).to.eq(token0Amount)
        expect(reserves[1]).to.eq(token1Amount)
    })

    async function addLiquidity(token0Amount: BigNumberish, token1Amount: BigNumberish) {
        await token0.transfer(await pair.getAddress(), token0Amount)
        await token1.transfer(await pair.getAddress(), token1Amount)
        await pair.mint(wallet.address)
    }
    const swapTestCases: BigNumberish[][] = [
        [1, 5, 10, '1662497915624478906'],
        [1, 10, 5, '453305446940074565'],

        [2, 5, 10, '2851015155847869602'],
        [2, 10, 5, '831248957812239453'],

        [1, 10, 10, '906610893880149131'],
        [1, 100, 100, '987158034397061298'],
        [1, 1000, 1000, '996006981039903216']
    ].map(a => a.map(n => (typeof n === 'string' ? getBigInt(n) : expandTo18Decimals(n))))
    swapTestCases.forEach((swapTestCase, i) => {
        it(`getInputPrice:${i}`, async () => {
            const [swapAmount, token0Amount, token1Amount, expectedOutputAmount] = swapTestCase
            await addLiquidity(token0Amount, token1Amount)
            await token0.transfer(await pair.getAddress(), swapAmount)
            await expect(pair.swap(0, getBigInt(expectedOutputAmount) + getBigInt(1), wallet.address, '0x')).to.be.revertedWith(
                'LFSwap Swap: K'
            )
            await pair.swap(0, expectedOutputAmount, wallet.address, '0x')
        })
    })

    const optimisticTestCases: BigNumberish[][] = [
        ['997000000000000000', 5, 10, 1], // given amountIn, amountOut = floor(amountIn * .997)
        ['997000000000000000', 10, 5, 1],
        ['997000000000000000', 5, 5, 1],
        [1, 5, 5, '1003009027081243732'] // given amountOut, amountIn = ceiling(amountOut / .997)
    ].map(a => a.map(n => (typeof n === 'string' ? getBigInt(n) : expandTo18Decimals(n))))
    optimisticTestCases.forEach((optimisticTestCase, i) => {
        it(`optimistic:${i}`, async () => {
            const [outputAmount, token0Amount, token1Amount, inputAmount] = optimisticTestCase
            await addLiquidity(token0Amount, token1Amount)
            await token0.transfer(await pair.getAddress(), inputAmount)
            await expect(pair.swap(getBigInt(outputAmount) + getBigInt(1), 0, wallet.address, '0x')).to.be.revertedWith(
                'LFSwap Swap: K'
            )
            await pair.swap(outputAmount, 0, wallet.address, '0x')
        })
    })

    it('swap:token0', async () => {
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        await addLiquidity(token0Amount, token1Amount)

        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = getBigInt('1662497915624478906')
        await token0.transfer(await pair.getAddress(), swapAmount)
        await expect(pair.swap(0, 0, wallet.address, '0x')).to.be.revertedWith("LFSwap Swap: INSUFFICIENT_OUTPUT_AMOUNT")
        await expect(pair.swap(expectedOutputAmount, expandTo18Decimals(99999999), wallet.address, '0x')).to.be.revertedWith("LFSwap Swap: INSUFFICIENT_LIQUIDITY")
        await expect(pair.swap(expandTo18Decimals(99999999), expectedOutputAmount, wallet.address, '0x')).to.be.revertedWith("LFSwap Swap: INSUFFICIENT_LIQUIDITY")
        await expect(pair.swap(0, expectedOutputAmount, await token0.getAddress(), '0x')).to.be.revertedWith("LFSwap Swap: INVALID_TO")
        await expect(pair.swap(0, expectedOutputAmount, await token1.getAddress(), '0x')).to.be.revertedWith("LFSwap Swap: INVALID_TO")


        await expect(pair.swap(0, expectedOutputAmount, wallet.address, '0x'))
            .to.emit(token1, 'Transfer')
            .withArgs(await pair.getAddress(), wallet.address, expectedOutputAmount)
            .to.emit(pair, 'Sync')
            .withArgs(getBigInt(token0Amount) + getBigInt(swapAmount), getBigInt(token1Amount) - expectedOutputAmount)
            .to.emit(pair, 'Swap')
            .withArgs(wallet.address, swapAmount, 0, 0, expectedOutputAmount, wallet.address)

        const reserves = await pair.getReserves()
        expect(reserves[0]).to.eq(getBigInt(token0Amount) + getBigInt(swapAmount))
        expect(reserves[1]).to.eq(getBigInt(token1Amount) - getBigInt(expectedOutputAmount))
        expect(await token0.balanceOf(await pair.getAddress())).to.eq(getBigInt(token0Amount) + getBigInt(swapAmount))
        expect(await token1.balanceOf(await pair.getAddress())).to.eq(getBigInt(token1Amount) - getBigInt(expectedOutputAmount))
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(wallet.address)).to.eq(getBigInt(totalSupplyToken0) - getBigInt(token0Amount) - getBigInt(swapAmount))
        expect(await token1.balanceOf(wallet.address)).to.eq(getBigInt(totalSupplyToken1) - getBigInt(token1Amount) + (expectedOutputAmount))
    })

    it('swap:token1', async () => {
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        await addLiquidity(token0Amount, token1Amount)

        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = getBigInt('453305446940074565')
        await token1.transfer(await pair.getAddress(), swapAmount)
        await expect(pair.swap(expectedOutputAmount, 0, wallet.address, '0x'))
            .to.emit(token0, 'Transfer')
            .withArgs(await pair.getAddress(), wallet.address, expectedOutputAmount)
            .to.emit(pair, 'Sync')
            .withArgs(getBigInt(token0Amount) - expectedOutputAmount, getBigInt(token1Amount) + getBigInt(swapAmount))
            .to.emit(pair, 'Swap')
            .withArgs(wallet.address, 0, swapAmount, expectedOutputAmount, 0, wallet.address)

        const reserves = await pair.getReserves()
        expect(reserves[0]).to.eq(getBigInt(token0Amount) - (expectedOutputAmount))
        expect(reserves[1]).to.eq(getBigInt(token1Amount) + getBigInt(swapAmount))
        expect(await token0.balanceOf(await pair.getAddress())).to.eq(getBigInt(token0Amount) - (expectedOutputAmount))
        expect(await token1.balanceOf(await pair.getAddress())).to.eq(getBigInt(token1Amount) + getBigInt(swapAmount))
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(wallet.address)).to.eq(getBigInt(totalSupplyToken0) - getBigInt(token0Amount) + (expectedOutputAmount))
        expect(await token1.balanceOf(wallet.address)).to.eq(getBigInt(totalSupplyToken1) - getBigInt(token1Amount) - getBigInt(swapAmount))

    })

    it('swap:token callback receiver', async () => {
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        await addLiquidity(token0Amount, token1Amount)

        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = getBigInt('453305446940074565')
        await token1.transfer(await pair.getAddress(), swapAmount)

        await callbackHelper.setReEnter(true);
        await expect(pair.swap(expectedOutputAmount, 0, await callbackHelper.getAddress(), '0x1f'))
            .to.be.revertedWith("LFSwap Swap: LOCKED")
        await callbackHelper.setReEnter(false);


        await expect(pair.swap(expectedOutputAmount, 0, await callbackHelper.getAddress(), '0x1f'))
            .to.emit(token0, 'Transfer')
            .withArgs(await pair.getAddress(), await callbackHelper.getAddress(), expectedOutputAmount)
            .to.emit(pair, 'Sync')
            .withArgs(getBigInt(token0Amount) - expectedOutputAmount, getBigInt(token1Amount) + getBigInt(swapAmount))
            .to.emit(pair, 'Swap')
            .withArgs(wallet.address, 0, swapAmount, expectedOutputAmount, 0, await callbackHelper.getAddress())
    })

    it('burn', async () => {
        const token0Amount = getBigInt(expandTo18Decimals(3))
        const token1Amount = getBigInt(expandTo18Decimals(3))
        await addLiquidity(token0Amount, token1Amount)

        const expectedLiquidity = getBigInt(expandTo18Decimals(3))
        await pair.transfer(await pair.getAddress(), expectedLiquidity - (MINIMUM_LIQUIDITY))
        await expect(pair.burn(wallet.address))
            .to.emit(pair, 'Transfer')
            .withArgs(await pair.getAddress(), ZERO_ADDRESS, expectedLiquidity - (MINIMUM_LIQUIDITY))
            .to.emit(token0, 'Transfer')
            .withArgs(await pair.getAddress(), wallet.address, token0Amount - getBigInt(1000))
            .to.emit(token1, 'Transfer')
            .withArgs(await pair.getAddress(), wallet.address, token1Amount - getBigInt(1000))
            .to.emit(pair, 'Sync')
            .withArgs(1000, 1000)
            .to.emit(pair, 'Burn')
            .withArgs(wallet.address, token0Amount - getBigInt(1000), token1Amount - getBigInt(1000), wallet.address)

        expect(await pair.balanceOf(wallet.address)).to.eq(0)
        expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
        expect(await token0.balanceOf(await pair.getAddress())).to.eq(1000)
        expect(await token1.balanceOf(await pair.getAddress())).to.eq(1000)
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0 - getBigInt(1000))
        expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1 - getBigInt(1000))
    })

    it('price{0,1}CumulativeLast', async () => {

        const token0Amount = getBigInt(expandTo18Decimals(3))
        const token1Amount = getBigInt(expandTo18Decimals(3))
        await addLiquidity(token0Amount, token1Amount)

        const blockTimestamp = (await pair.getReserves())[2]
        await mineBlock(Number(blockTimestamp) + 1)
        await pair.sync()
        const blockTimestamp2 = (await pair.getReserves())[2]

        const initialPrice = encodePrice(token0Amount, token1Amount)
        expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0] * (blockTimestamp2 - blockTimestamp))
        expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1] * (blockTimestamp2 - blockTimestamp))
        expect((await pair.getReserves())[2]).to.eq(Number(blockTimestamp) + 2)

        const swapAmount = expandTo18Decimals(3)
        await token0.transfer(await pair.getAddress(), swapAmount)
        await mineBlock(Number(blockTimestamp) + 10)
        // swap to a new price eagerly instead of syncing
        await pair.swap(0, expandTo18Decimals(1), wallet.address, '0x') // make the price nice

        expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0] * BigInt(11))
        expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1] * BigInt(11))
        expect((await pair.getReserves())[2]).to.eq(Number(blockTimestamp) + 11)

    })

    it('feeTo:off', async () => {
        const token0Amount = expandTo18Decimals(1000)
        const token1Amount = expandTo18Decimals(1000)
        await addLiquidity(token0Amount, token1Amount)

        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = BigInt('996006981039903216')
        await token1.transfer(await pair.getAddress(), swapAmount)
        await pair.swap(expectedOutputAmount, 0, wallet.address, '0x')

        const expectedLiquidity = expandTo18Decimals(1000)
        await pair.transfer(await pair.getAddress(), getBigInt(expectedLiquidity) - (MINIMUM_LIQUIDITY))
        await pair.burn(wallet.address)
        expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
    })

    it('feeTo:on', async () => {
        await factory.setFeeTo(other.address)

        const token0Amount = expandTo18Decimals(1000)
        const token1Amount = expandTo18Decimals(1000)
        await addLiquidity(token0Amount, token1Amount)

        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = BigInt('996006981039903216')
        await token1.transfer(await pair.getAddress(), swapAmount)
        await pair.swap(expectedOutputAmount, 0, wallet.address, '0x')

        const expectedLiquidity = expandTo18Decimals(1000)
        await pair.transfer(await pair.getAddress(), getBigInt(expectedLiquidity) - MINIMUM_LIQUIDITY)
        await pair.burn(wallet.address)
        expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY + BigInt('499501123253431'))
        expect(await pair.balanceOf(other.address)).to.eq('499501123253431')

        // using 1000 here instead of the symbolic MINIMUM_LIQUIDITY because the amounts only happen to be equal...
        // ...because the initial liquidity amounts were equal
        expect(await token0.balanceOf(await pair.getAddress())).to.eq(BigInt(1000) + BigInt('499003367394890'))
        expect(await token1.balanceOf(await pair.getAddress())).to.eq(BigInt(1000) + BigInt('500000374625937'))

        await factory.setFeeTo(ZERO_ADDRESS);
        await addLiquidity(token0Amount, token1Amount)
        expect(await pair.kLast()).to.be.equal(0);
    })
})
