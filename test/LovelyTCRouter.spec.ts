import { expect } from 'chai'
import { getBigInt, MaxUint256 } from 'ethers'
import {
    ERC20, LFSwapTCRouter, LFSwapTCRouter__factory, WETH9, LFSwapPair, LFSwapFactory, RouterEventEmitter,
    DeflatingERC20, DeflatingERC20__factory,
    LFSwapRouter,
    ERC20__factory,
    RewardsVault, RewardsVault__factory,
    RewardsVaultDeployer, RewardsVaultDeployer__factory
} from '../typechain-types';

import { ecsign } from 'ethereumjs-util';

import { expandTo18Decimals, mineBlockIncreaseTime, generateRandomBigInt } from './shared/utilities'
import { factoryFixture, pairFixture } from './shared/fixtures'

import { ethers } from "hardhat"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ZERO_ADDRESS } from '../util/utilities';

const overrides = {
    gasLimit: 9999999
}


describe('LFSwapTCRouter', () => {
    const DAYS_30 = 30 * 24 * 60 * 60;
    const TC_CREATE_FEE = BigInt(100000)
    let wallet: SignerWithAddress;
    let accounts: SignerWithAddress[];

    let token0: ERC20
    let token1: ERC20
    let router: LFSwapTCRouter

    let WETH: WETH9
    let WETHPartner: ERC20
    let factory: LFSwapFactory
    let pair: LFSwapPair
    let WETHPair: LFSwapPair
    let routerEventEmitter: RouterEventEmitter
    let rewardsVaultFactory: RewardsVaultDeployer

    beforeEach(async function () {
        accounts = await ethers.getSigners();
        wallet = accounts[0];
        const fixture = await pairFixture(wallet)
        token0 = fixture.token0
        token1 = fixture.token1
        WETH = fixture.WETH
        WETHPartner = fixture.WETHPartner
        factory = fixture.factory
        rewardsVaultFactory = await new RewardsVaultDeployer__factory(wallet).deploy();
        router = await new LFSwapTCRouter__factory(wallet).deploy(factory, WETH, rewardsVaultFactory, TC_CREATE_FEE, 500);
        pair = fixture.pair
        WETHPair = fixture.WETHPair
        routerEventEmitter = fixture.routerEventEmitter
    })

    afterEach(async function () {
        expect(await ethers.provider.getBalance(await router.getAddress())).to.eq(0)
    })


    describe("TC Router", () => {
        it('factory, WETH', async () => {
            expect(await router.factory()).to.eq(await factory.getAddress())
            expect(await router.WETH()).to.eq(await WETH.getAddress())
        })

        async function addLiquidity(token0Amount: bigint, token1Amount: bigint) {
            await token0.transfer(await pair.getAddress(), token0Amount)
            await token1.transfer(await pair.getAddress(), token1Amount)
            await pair.mint(wallet.address, overrides)
        }

        describe('competition', () => {
            it('competition validations', async () => {
                const timestamp = (await ethers.provider.getBlock('latest'))!.timestamp

                const pairs = [await pair.getAddress()]
                const rewards = [expandTo18Decimals(10), expandTo18Decimals(5), expandTo18Decimals(2), expandTo18Decimals(1)]
                await token0.approve(await router.getAddress(), expandTo18Decimals(250));

                await expect(router.createCompetition(timestamp - 1, timestamp + 200, token0, await pair.token0(), expandTo18Decimals(1), rewards, pairs))
                    .to.be.revertedWithCustomError(router, "InvalidRange")
                await expect(router.createCompetition(timestamp + 200, timestamp - 1, token0, await pair.token0(), expandTo18Decimals(1), rewards, pairs))
                    .to.be.revertedWithCustomError(router, "InvalidRange")
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30 + 1, token0, await pair.token0(), expandTo18Decimals(1), rewards, pairs))
                    .to.be.revertedWithCustomError(router, "RangeTooBig")
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, await pair.token0(), expandTo18Decimals(1),
                    [expandTo18Decimals(10), expandTo18Decimals(5), expandTo18Decimals(2)], pairs))
                    .to.be.revertedWithCustomError(router, "InvalidRewards")
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, await pair.token0(), expandTo18Decimals(1),
                    [0, 0, 0, 0], pairs))
                    .to.be.revertedWithCustomError(router, "InvalidRewards")
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, ZERO_ADDRESS, expandTo18Decimals(1), rewards, pairs))
                    .to.be.revertedWithCustomError(router, "NotACompetitionToken")
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, await pair.token0(), expandTo18Decimals(1), rewards, []))
                    .to.be.revertedWithCustomError(router, "PairsNotProvided")
                await expect(router.createCompetition(timestamp + 200 + DAYS_30, timestamp + 200, token0, await pair.token0(), expandTo18Decimals(1), rewards, pairs))
                    .to.be.revertedWithCustomError(router, "InvalidRange")
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, await pair.token0(), expandTo18Decimals(1), rewards, pairs))
                    .to.emit(router, "CompetitionCreated").withArgs(0)
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, await pair.token0(), expandTo18Decimals(1), rewards, pairs))
                    .to.emit(router, "CompetitionCreated").withArgs(1);
                expect(await router.competitionsLength()).to.be.equal(2);
                expect(await router.maxParticipants()).to.be.equal(500);


            })

            it('pair validation', async () =>{
                const timestamp = (await ethers.provider.getBlock('latest'))!.timestamp
                const newFactory = await factoryFixture(accounts[0]);
                await newFactory.factory.allowToken(token0, 0);
                await newFactory.factory.allowToken(token1, 0);
                await newFactory.factory.createPair(token0, token1, 0);
                const newPairAddress = await newFactory.factory.getPair(token0, token1);
                const rewards = [expandTo18Decimals(10), expandTo18Decimals(5), expandTo18Decimals(2), expandTo18Decimals(1)]
                expect(newPairAddress).to.not.eql(await router.factory());
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, await pair.token0(), expandTo18Decimals(1), rewards, [newPairAddress]))
                    .to.be.revertedWithCustomError(router, "PairDoesNotExist")
            })

        })

        describe('swapExactTokensForTokens no competition', () => {
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

        describe('swapExactTokensForTokens competition', () => {
            const token0Amount = getBigInt(expandTo18Decimals(5))
            const token1Amount = getBigInt(expandTo18Decimals(10))

            let timestamp: number;
            beforeEach(async () => {
                await addLiquidity(token0Amount, token1Amount)
                await token0.approve(await router.getAddress(), MaxUint256)
                timestamp = (await ethers.provider.getBlock('latest'))!.timestamp

                const pairs = [await pair.getAddress()]
                const rewards = [expandTo18Decimals(10), expandTo18Decimals(5), expandTo18Decimals(2), expandTo18Decimals(1)]
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, await pair.token0(), BigInt("20000000000"), rewards, pairs))
                    .to.emit(router, "CompetitionCreated").withArgs(0)
            })

            async function mintAndApprove(account: SignerWithAddress, token0Amount: bigint, token1Amount: bigint) {
                await token0.connect(account).mint(token0Amount);
                await token1.connect(account).mint(token1Amount);
                await token0.connect(account).approve(await router.getAddress(), token0Amount)
                await token1.connect(account).approve(await router.getAddress(), token1Amount)

            }

            it('register', async () => {
                await expect(router.connect(accounts[1]).register(2)).to.be.revertedWithCustomError(router, "NoCompetition")
            })

            it('competition fee', async () => {
                await token0.connect(accounts[1]).approve(await router.getAddress(), MaxUint256)
                await token0.connect(accounts[1]).mint(expandTo18Decimals(200))

                const pairs = [await pair.getAddress()]
                const rewards = [expandTo18Decimals(10), expandTo18Decimals(5), expandTo18Decimals(2), expandTo18Decimals(1)]
                await expect(router.connect(accounts[1]).createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, await pair.token0(), BigInt("100000"), rewards, pairs))
                    .to.be.revertedWithCustomError(router, "InvalidFee")
                await expect(router.connect(accounts[1]).createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, await pair.token0(), BigInt("100000"), rewards, pairs, { value: TC_CREATE_FEE }))
                    .to.emit(router, "CompetitionCreated").withArgs(1)
                const rewardsResult = await router.getRewards(0);
                expect(rewardsResult[0]).to.be.equal(rewards[0])
                expect(rewardsResult[1]).to.be.equal(rewards[1])
                expect(rewardsResult[2]).to.be.equal(rewards[2])
                expect(rewardsResult[3]).to.be.equal(rewards[3])

                await expect(router.connect(accounts[2]).setCompetitionFee(BigInt(1))).to.be.reverted;
                await router.setCompetitionFee(BigInt(1));
                expect(await router.competitionFee()).to.be.equal(BigInt(1));

                expect((await router.getCompetitionsOfPair(pair.getAddress())).length).to.be.equal(2);
                expect((await router.getPairs(0)).length).to.be.equal(BigInt(1));
            })


            it('deflation tokens are forbidden', async () => {
                const deflatingToken = await new DeflatingERC20__factory(accounts[0]).deploy(expandTo18Decimals(100000));
                await token0.connect(accounts[0]).approve(await router.getAddress(), MaxUint256)
                await token0.connect(accounts[0]).mint(expandTo18Decimals(200))
                await deflatingToken.connect(accounts[0]).approve(await router.getAddress(), MaxUint256)
                const pairs = [await pair.getAddress()]
                const rewards = [expandTo18Decimals(10), expandTo18Decimals(5), expandTo18Decimals(2), expandTo18Decimals(1)]
                await expect(router.connect(accounts[0]).createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, deflatingToken, await pair.token0(), BigInt("100000"), rewards, pairs, { value: TC_CREATE_FEE }))
                    .to.be.revertedWithCustomError(router, "FeeTokensForbidden")
            })

            it('trade before competition', async () => {
                await token0.mint(expandTo18Decimals(10000000000))
                await token1.mint(expandTo18Decimals(10000000000))
                await addLiquidity(BigInt(expandTo18Decimals(10000000000)), BigInt(expandTo18Decimals(10000000000)));

                const account = accounts[3];
                const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                await mintAndApprove(account, token0Amount * BigInt(2), token1Amount * BigInt(2))
                await router.connect(account).swapExactTokensForTokens(
                    token0Amount > token1Amount ? token0Amount : token1Amount,
                    0,
                    token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                    await account.getAddress(),
                    MaxUint256,
                    overrides
                )

                expect((await router.getCompetitionsOfPair(pair.getAddress())).length).to.be.equal(1);
                expect((await router.getPairs(0)).length).to.be.equal(BigInt(1));
            })


            it('trade after competition', async () => {
                await token0.mint(expandTo18Decimals(10000000000))
                await token1.mint(expandTo18Decimals(10000000000))
                await addLiquidity(BigInt(expandTo18Decimals(10000000000)), BigInt(expandTo18Decimals(10000000000)));
                mineBlockIncreaseTime(DAYS_30);
                mineBlockIncreaseTime(DAYS_30);

                const account = accounts[3];
                const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                await mintAndApprove(account, token0Amount * BigInt(2), token1Amount * BigInt(2))
                await router.connect(account).swapExactTokensForTokens(
                    token0Amount > token1Amount ? token0Amount : token1Amount,
                    0,
                    token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                    await account.getAddress(),
                    MaxUint256,
                    overrides
                )

                const rewardsVault = RewardsVault__factory.connect((await router.competitions(0)).rewardsVault, account);
                await expect(rewardsVault.withdraw(await account.getAddress(), 0)).to.be.revertedWithCustomError(rewardsVault, "Forbidden")
            })

            it('multiple trades in a competition', async () => {
                const competitionId = 0;
                mineBlockIncreaseTime(500);
                await token0.mint(expandTo18Decimals(10000000000))
                await token1.mint(expandTo18Decimals(10000000000))
                await addLiquidity(BigInt(expandTo18Decimals(10000000000)), BigInt(expandTo18Decimals(10000000000)));

                const account = accounts[3];
                const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                await mintAndApprove(account, token0Amount * BigInt(2), token1Amount * BigInt(2))
                await router.connect(account).register(competitionId)
                await router.connect(account).swapExactTokensForTokens(
                    token0Amount > token1Amount ? token0Amount : token1Amount,
                    0,
                    token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                    await account.getAddress(),
                    MaxUint256,
                    overrides
                )

                await router.connect(account).swapExactTokensForTokens(
                    token0Amount > token1Amount ? token0Amount : token1Amount,
                    0,
                    token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                    await account.getAddress(),
                    MaxUint256,
                    overrides
                )

            })

            it('Clean up', async () => {
                router = await new LFSwapTCRouter__factory(wallet).deploy(factory, WETH, rewardsVaultFactory, TC_CREATE_FEE, 2);
                await token0.connect(accounts[0]).approve(await router.getAddress(), MaxUint256)
                await token0.connect(accounts[0]).mint(expandTo18Decimals(200))
                const pairs = [await pair.getAddress()]
                const rewards = [expandTo18Decimals(10), expandTo18Decimals(5), expandTo18Decimals(2), expandTo18Decimals(1)]
                await expect(router.createCompetition(timestamp + 200, timestamp + DAYS_30, token0, await pair.token0(), BigInt("100000"), rewards, pairs))
                    .to.emit(router, "CompetitionCreated").withArgs(0)
                await expect(router.createCompetition(timestamp + 200, timestamp + DAYS_30, token0, await pair.token0(), BigInt("100000"), rewards, pairs))
                    .to.emit(router, "CompetitionCreated").withArgs(1)
                await expect(router.cleanUpCompetitions(0)).to.be.revertedWithCustomError(router, "NotEnded");
                expect((await router.getCompetitionsOfPair(await pair.getAddress())).length).to.eql(2);
                mineBlockIncreaseTime(DAYS_30+200)
                expect((await router.getCompetitionsOfPair(await pair.getAddress())).length).to.eql(2);
                await router.sumUpCompetition(0);
                await router.cleanUpCompetitions(0);
                expect((await router.getCompetitionsOfPair(await pair.getAddress())).length).to.eql(1);
                await expect(router.withdrawRemainings(0)).to.not.be.reverted
            })

            it('trades over max participants ', async () => {
                router = await new LFSwapTCRouter__factory(wallet).deploy(factory, WETH, rewardsVaultFactory, TC_CREATE_FEE, 2);
                await token0.connect(accounts[0]).approve(await router.getAddress(), MaxUint256)
                await token0.connect(accounts[0]).mint(expandTo18Decimals(200))
                const pairs = [await pair.getAddress()]
                const rewards = [expandTo18Decimals(10), expandTo18Decimals(5), expandTo18Decimals(2), expandTo18Decimals(1)]
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, await pair.token0(), BigInt("100000"), rewards, pairs))
                    .to.emit(router, "CompetitionCreated").withArgs(0)
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, await pair.token0(), BigInt("100000"), rewards, pairs))
                    .to.emit(router, "CompetitionCreated").withArgs(1)
                mineBlockIncreaseTime(500);
                const competitionId = 1;
                for (let i = 5; i < 12; i++) {
                    const account = accounts[i];
                    const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    await mintAndApprove(account, token0Amount, token1Amount)
                    await router.connect(account).register(competitionId)
                    await router.connect(account).swapExactTokensForTokens(
                        token0Amount > token1Amount ? token0Amount : token1Amount,
                        0,
                        token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                        await account.getAddress(),
                        MaxUint256,
                        overrides
                    )
                }

                mineBlockIncreaseTime(DAYS_30)
                await expect(router.sumUpCompetition(competitionId)).to.emit(router, "ReadyForPayouts").withArgs(competitionId)
            })


            it('withdraw remainings 1', async () => {
                const competitionId = 0;
                mineBlockIncreaseTime(500);

                await expect(router.withdrawRemainings(competitionId)).to.be.revertedWithCustomError(router, "NotEnded")
                await expect(router.withdrawRemainings(2)).to.be.revertedWithCustomError(router, "NoCompetition")

                const account = accounts[3];
                const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                await mintAndApprove(account, token0Amount * BigInt(2), token1Amount * BigInt(2))
                await router.connect(account).register(competitionId)
                await router.connect(account).swapExactTokensForTokens(
                    token0Amount > token1Amount ? token0Amount : token1Amount,
                    0,
                    token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                    await account.getAddress(),
                    MaxUint256,
                    overrides
                )
                await expect(router.claimById(competitionId, 0)).to.be.revertedWithCustomError(router, "WinnersNotSelected")
                mineBlockIncreaseTime(DAYS_30)
                await expect(router.sumUpCompetition(0)).to.emit(router, "ReadyForPayouts").withArgs(competitionId)
                await expect(router.claimByAddress(competitionId, account.address)).to.emit(token0, "Transfer");
                await expect(router.withdrawRemainings(competitionId)).to.not.be.reverted
                expect(await token0.balanceOf(router)).to.be.equal(expandTo18Decimals(0))

            })

            it('withdraw remainings 2', async () => {
                const competitionId = 0;
                mineBlockIncreaseTime(500);

                for (let i = 5; i < 11; i++) {
                    const account = accounts[i];
                    const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    await mintAndApprove(account, token0Amount, token1Amount)
                    await router.connect(account).register(competitionId)
                    await router.connect(account).swapExactTokensForTokens(
                        token0Amount > token1Amount ? token0Amount : token1Amount,
                        0,
                        token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                        await account.getAddress(),
                        MaxUint256,
                        overrides
                    )
                }

                mineBlockIncreaseTime(DAYS_30)
                await expect(router.sumUpCompetition(0)).to.emit(router, "ReadyForPayouts").withArgs(competitionId)

                await expect(router.withdrawRemainings(competitionId)).to.not.be.reverted
            })

            it('withdraw remainings 3', async () => {
                const competitionId = 0;
                mineBlockIncreaseTime(500);

                for (let i = 5; i < 16; i++) {
                    const account = accounts[i];
                    const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    await mintAndApprove(account, token0Amount, token1Amount)
                    await router.connect(account).register(competitionId)
                    await router.connect(account).swapExactTokensForTokens(
                        token0Amount > token1Amount ? token0Amount : token1Amount,
                        0,
                        token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                        await account.getAddress(),
                        MaxUint256,
                        overrides
                    )
                }

                mineBlockIncreaseTime(DAYS_30)
                await expect(router.sumUpCompetition(0)).to.emit(router, "ReadyForPayouts").withArgs(competitionId)

                await expect(router.withdrawRemainings(competitionId)).to.not.be.reverted
            })

            it('withdraw remainings 4', async () => {
                const competitionId = 0;
                mineBlockIncreaseTime(500);

                for (let i = 5; i < 26; i++) {
                    const account = accounts[i];
                    const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    await mintAndApprove(account, token0Amount, token1Amount)
                    await router.connect(account).register(competitionId)
                    await router.connect(account).swapExactTokensForTokens(
                        token0Amount > token1Amount ? token0Amount : token1Amount,
                        0,
                        token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                        await account.getAddress(),
                        MaxUint256,
                        overrides
                    )
                }

                mineBlockIncreaseTime(DAYS_30)
                await expect(router.sumUpCompetition(0)).to.emit(router, "ReadyForPayouts").withArgs(competitionId)

                await expect(router.withdrawRemainings(competitionId)).to.not.be.reverted
            })

            it('competition tests', async () => {
                const competitionId = 0;
                mineBlockIncreaseTime(500);
                await token0.mint(expandTo18Decimals(10000000000))
                await token1.mint(expandTo18Decimals(10000000000))
                await addLiquidity(BigInt(expandTo18Decimals(10000000000)), BigInt(expandTo18Decimals(10000000000)));
                expect((await router.competitions(competitionId)).participantsCount).to.be.equal(0);


                for (let i = 5; i < 11; i++) {
                    const account = accounts[i];
                    const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    await mintAndApprove(account, token0Amount, token1Amount)
                    if (i < 10)
                        await router.connect(account).register(competitionId)
                    await router.connect(account).swapExactTokensForTokens(
                        token0Amount > token1Amount ? token0Amount : token1Amount,
                        0,
                        token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                        await account.getAddress(),
                        MaxUint256,
                        overrides
                    )

                }
                expect((await router.competitions(competitionId)).participantsCount).to.be.equal(5)
                expect(await router.isRegistered(competitionId, accounts[5])).to.be.true
                const participants = await router.getParticipants(competitionId)
                expect(participants.length).to.be.equal(5)
                const offchainSortedArray = [...participants].sort((a, b) => {
                    if (a[1] < b[1]) return 1;
                    if (a[1] > b[1]) return -1;
                    return 0;
                });

                expect(await token0.balanceOf(router)).to.be.equal(expandTo18Decimals(0))


                mineBlockIncreaseTime(DAYS_30)
                await expect(router.sumUpCompetition(0)).to.emit(router, "ReadyForPayouts").withArgs(0)
                await router.cleanUpCompetitions(0);
                const onchainSortedArray = await router.getParticipants(competitionId)
                for (let i = 0; i < onchainSortedArray.length; i++) {
                    await expect(onchainSortedArray[i][1]).to.be.equal(offchainSortedArray[i][1])
                }

                for (let i = 5; i < 10; i++) {
                    const account = accounts[i];
                    await expect(router.claimByAddress(0, account.address)).to.emit(token0, "Transfer");
                }

                await router.withdrawRemainings(competitionId)
                expect(await token0.balanceOf(router)).to.be.equal(expandTo18Decimals(0))
                await expect(router.withdrawRemainings(competitionId)).to.be.revertedWithCustomError(router, "AlreadyWithdrawn")

                await expect(router.claimByAddress(0, accounts[0])).to.be.revertedWithCustomError(router, "NotAWinner")
                await expect(router.claimByAddress(2, accounts[0])).to.be.revertedWithCustomError(router, "NoCompetition")

            })

            it('competition tests: soldout', async () => {
                const competitionId = 0;
                expect((await router.getParticipantsPaginated(competitionId, 0, 100)).length).to.be.equal(0)

                await mineBlockIncreaseTime(500);
                await token0.mint(expandTo18Decimals(10000000000))
                await token1.mint(expandTo18Decimals(10000000000))
                await addLiquidity(BigInt(expandTo18Decimals(10000000000)), BigInt(expandTo18Decimals(10000000000)));

                //untracked trade
                await mintAndApprove(accounts[2], BigInt(1000000000), BigInt(100000000))
                await router.connect(accounts[2]).register(competitionId)
                await router.connect(accounts[2]).swapExactTokensForTokens(
                    BigInt(1000000000),
                    0,
                    [await token0.getAddress(), await token1.getAddress()],
                    await accounts[2].getAddress(),
                    MaxUint256,
                    overrides
                )

                //tracked trades
                for (let i = 5; i < 60; i++) {
                    const account = accounts[i];
                    const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    await mintAndApprove(account, token0Amount, token1Amount)
                    await router.connect(account).register(competitionId)
                    await router.connect(account).swapExactTokensForTokens(
                        token0Amount > token1Amount ? token0Amount : token1Amount,
                        0,
                        token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                        await account.getAddress(),
                        MaxUint256,
                        overrides
                    )
                }

                await expect(router.connect(accounts[5]).register(competitionId)).to.be.revertedWithCustomError(router, "AlreadyRegistered")
                expect((await router.competitions(competitionId)).participantsCount).to.be.equal(55)
                expect((await router.competitionsOf(accounts[5])).length).to.be.equal(1)

                expect((await router.getParticipantsPaginated(competitionId, 0, 100)).length).to.be.equal(55)
                expect((await router.getParticipantsPaginated(competitionId, 0, 55)).length).to.be.equal(55)



                await expect(router.sumUpCompetition(5)).to.be.revertedWithCustomError(router, "NoCompetition")
                await expect(router.sumUpCompetition(competitionId)).to.be.revertedWithCustomError(router, "NotEnded");
                await mineBlockIncreaseTime(DAYS_30)
                await expect(router.sumUpCompetition(competitionId)).to.emit(router, "ReadyForPayouts").withArgs(0)
                await expect(router.sumUpCompetition(competitionId)).to.be.revertedWithCustomError(router, "AlreadySorted");


                const participants = await router.getParticipants(0);
                for (let i = 0; i < 50; i++) {
                    const value = i < 5 ? expandTo18Decimals(10) : i < 10 ? expandTo18Decimals(5) : i < 20 ? expandTo18Decimals(2) : expandTo18Decimals(1)
                    await expect(router.claimById(0, i)).to.emit(token0, "Transfer")
                }
                expect(await token0.balanceOf(router)).to.be.equal(expandTo18Decimals(0))

                for (let i = 51; i < 55; i++) {
                    await expect(router.claimById(0, i)).to.be.revertedWithCustomError(router, "NotAWinner")
                }
                await expect(router.claimById(0, 49)).to.be.revertedWithCustomError(router, "AlreadyClaimed")
                await expect(router.claimById(0, 50)).to.be.revertedWithCustomError(router, "NotAWinner")

                await expect(router.withdrawRemainings(competitionId)).to.be.revertedWithCustomError(router, "NothingToWithdraw")
                await expect(router.claimByAddress(competitionId, accounts[0])).to.be.revertedWithCustomError(router, "NotAWinner")

            })


            // it('max participants', async () => {
            // 	const competitionId = 0;
            // 	await expect(router.claimById(0, 0)).to.be.revertedWithCustomError(router, "WinnersNotSelected")
            // 	await mineBlockIncreaseTime(500);
            // 	await token0.mint(expandTo18Decimals(1000000000000))
            // 	await token1.mint(expandTo18Decimals(1000000000000))
            // 	await addLiquidity(BigInt(expandTo18Decimals(1000000000000)), BigInt(expandTo18Decimals(1000000000000)));
            // 	const provider = accounts[0].provider;
            // 	for (let i = 0; i < 100; i++) {
            // 		console.log(`iteration ${i}`)
            // 		const wallet = ethers.Wallet.createRandom(provider);
            // 		await provider.send("hardhat_setBalance", [
            // 			wallet.address,
            // 			"0x999999999999999",
            // 		]);
            // 		const token0Amount = generateRandomBigInt(BigInt(10000000000000000), BigInt(100000000000000000000000))
            // 		const token1Amount = generateRandomBigInt(BigInt(10000000000000000), BigInt(100000000000000000000000))
            // 		await mintAndApprove(wallet, token0Amount, token1Amount)
            // 		await router.connect(wallet).register(competitionId)
            // 		await router.connect(wallet).swapExactTokensForTokens(
            // 			token0Amount > token1Amount ? token0Amount : token1Amount,
            // 			0,
            // 			token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
            // 			wallet.address,
            // 			MaxUint256,
            // 			overrides
            // 		)
            //
            // 	}
            //
            // 	await mineBlockIncreaseTime(DAYS_30)
            //
            // 	const contractTransactionResponse = await router.sumUpCompetition(competitionId);
            // 	const contractTransactionReceipt = await contractTransactionResponse.wait();
            // 	console.log(contractTransactionReceipt)
            // })
        })
    })

})
