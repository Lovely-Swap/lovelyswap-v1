import { expect } from 'chai'
import { getBigInt, MaxUint256 } from 'ethers'
import { ERC20, LovelyTCRouter, LovelyTCRouter__factory, WETH9, LovelyPair, LovelyFactory, RouterEventEmitter } from '../typechain-types';

import { ecsign } from 'ethereumjs-util';

import { expandTo18Decimals, mineBlockIncreaseTime, generateRandomBigInt } from './shared/utilities'
import { pairFixture } from './shared/fixtures'

import { ethers } from "hardhat"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ZERO_ADDRESS } from '../util/utilities';

const overrides = {
    gasLimit: 9999999
}


describe('LovelyTCRouter', () => {
    const DAYS_30 = 30 * 24 * 60 * 60;
    const TC_CREATE_FEE = BigInt(100000)
    let wallet: SignerWithAddress;
    let accounts: SignerWithAddress[];

    let token0: ERC20
    let token1: ERC20
    let router: LovelyTCRouter

    let WETH: WETH9
    let WETHPartner: ERC20
    let factory: LovelyFactory
    let pair: LovelyPair
    let WETHPair: LovelyPair
    let routerEventEmitter: RouterEventEmitter
    beforeEach(async function () {
        accounts = await ethers.getSigners();
        wallet = accounts[0];
        const fixture = await pairFixture(wallet)
        token0 = fixture.token0
        token1 = fixture.token1
        WETH = fixture.WETH
        WETHPartner = fixture.WETHPartner
        factory = fixture.factory
        router = await new LovelyTCRouter__factory(wallet).deploy(factory, WETH, TC_CREATE_FEE);
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

                await expect(router.createCompetition(timestamp - 1, timestamp + 200, token0, rewards, pairs))
                    .to.be.rejectedWith("LovelyTCRouter: INVALID_RANGE")
                await expect(router.createCompetition(timestamp + 200, timestamp - 1, token0, rewards, pairs))
                    .to.be.rejectedWith("LovelyTCRouter: INVALID_RANGE")
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30 + 1, token0, rewards, pairs))
                    .to.be.rejectedWith("LovelyTCRouter: RANGE_TOO_BIG")
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0,
                    [expandTo18Decimals(10), expandTo18Decimals(5), expandTo18Decimals(2)], pairs))
                    .to.be.rejectedWith("LovelyTCRouter: WRONG_REWARDS_LENGTH")
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, rewards, pairs))
                    .to.emit(router, "CompetitionCreated").withArgs(0)
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, rewards, pairs))
                    .to.emit(router, "CompetitionCreated").withArgs(1);
                expect(await router.competitionsLength()).to.be.equal(2);
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
                await expect(router.createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, rewards, pairs))
                    .to.emit(router, "CompetitionCreated").withArgs(0)
            })

            async function mintAndApprove(account: SignerWithAddress, token0Amount: bigint, token1Amount: bigint) {
                await token0.connect(account).mint(token0Amount);
                await token1.connect(account).mint(token1Amount);
                await token0.connect(account).approve(await router.getAddress(), token0Amount)
                await token1.connect(account).approve(await router.getAddress(), token1Amount)

            }
            it('register', async () => {
                await expect(router.connect(accounts[1]).register(2)).to.be.revertedWith("LovelyTCRouter: NO_COMPETITION")
            })

            it('competition fee', async () => {
                await token0.connect(accounts[1]).approve(await router.getAddress(), MaxUint256)
                await token0.connect(accounts[1]).mint(expandTo18Decimals(200))

                const pairs = [await pair.getAddress()]
                const rewards = [expandTo18Decimals(10), expandTo18Decimals(5), expandTo18Decimals(2), expandTo18Decimals(1)]
                await expect(router.connect(accounts[1]).createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, rewards, pairs))
                    .to.be.revertedWith("LovelyTCRouter: INVALID_FEE")
                await expect(router.connect(accounts[1]).createCompetition(timestamp + 200, timestamp + 200 + DAYS_30, token0, rewards, pairs, { value: TC_CREATE_FEE }))
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

            it('withdraw remainings 1', async () => {
                const competitionId = 0;
                mineBlockIncreaseTime(500);

                await expect(router.withdrawRemainings(competitionId)).to.be.revertedWith("LovelyTCRouter: NOT_FINISHED")
                await expect(router.withdrawRemainings(2)).to.be.revertedWith("LovelyTCRouter: NO_COMPETITION")

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
                mineBlockIncreaseTime(DAYS_30)
                await expect(router.sumUpCompetition(0)).to.emit(router, "ReadyForPayouts").withArgs(competitionId)
                await expect(router.claimByAddress(competitionId, account.address)).to.emit(token0, "Transfer").withArgs(await router.getAddress(), account.address, expandTo18Decimals(10));
                await expect(router.withdrawRemainings(competitionId)).to.not.be.reverted
                expect(await token0.balanceOf(router)).to.be.equal(expandTo18Decimals(0))

            })

            it('withdraw remainings 2', async () => {
                const competitionId = 0;
                mineBlockIncreaseTime(500);

                await expect(router.withdrawRemainings(competitionId)).to.be.revertedWith("LovelyTCRouter: NOT_FINISHED")
                await expect(router.withdrawRemainings(2)).to.be.revertedWith("LovelyTCRouter: NO_COMPETITION")


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

                await expect(router.withdrawRemainings(competitionId)).to.be.revertedWith("LovelyTCRouter: NOT_FINISHED")
                await expect(router.withdrawRemainings(2)).to.be.revertedWith("LovelyTCRouter: NO_COMPETITION")


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

                await expect(router.withdrawRemainings(competitionId)).to.be.revertedWith("LovelyTCRouter: NOT_FINISHED")
                await expect(router.withdrawRemainings(2)).to.be.revertedWith("LovelyTCRouter: NO_COMPETITION")


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
                    if (a[1] > b[1]) return 1;
                    if (a[1] < b[1]) return -1;
                    return 0;
                });

                expect(await token0.balanceOf(router)).to.be.equal(expandTo18Decimals(125))

                mineBlockIncreaseTime(DAYS_30)
                await expect(router.sumUpCompetition(0)).to.emit(router, "ReadyForPayouts").withArgs(0)
                const onchainSortedArray = await router.getParticipants(competitionId)
                for (let i = 0; i < onchainSortedArray.length; i++) {
                    await expect(onchainSortedArray[i][1]).to.be.equal(offchainSortedArray[i][1])
                }

                for (let i = 5; i < 10; i++) {
                    const account = accounts[i];
                    await expect(router.claimByAddress(0, account.address)).to.emit(token0, "Transfer").withArgs(await router.getAddress(), account.address, expandTo18Decimals(10));
                }

                await router.withdrawRemainings(competitionId)
                expect(await token0.balanceOf(router)).to.be.equal(expandTo18Decimals(0))
                await expect(router.withdrawRemainings(competitionId)).to.be.revertedWith("LovelyTCRouter: ALREADY_WITHDRAWN")

                await expect(router.claimByAddress(0, accounts[0])).to.be.revertedWith("LovelyTCRouter: NOT_WINNER");
                await expect(router.claimByAddress(2, accounts[0])).to.be.revertedWith("LovelyTCRouter: NO_COMPETITION");

            })

            it('competition tests: soldout', async () => {
                const competitionId = 0;
                await expect(router.claimById(0, 0)).to.be.revertedWith("LovelyTCRouter: WINNERS_NOT_SELECTED")
                mineBlockIncreaseTime(500);
                token0.mint(expandTo18Decimals(10000000000))
                token1.mint(expandTo18Decimals(10000000000))
                addLiquidity(BigInt(expandTo18Decimals(10000000000)), BigInt(expandTo18Decimals(10000000000)));
                expect((await router.competitions(competitionId)).participantsCount).to.be.equal(0);
                for (let i = 5; i < 60; i++) {
                    const account = accounts[i];
                    const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    await mintAndApprove(account, token0Amount, token1Amount)
                    router.connect(account).register(competitionId)
                    await router.connect(account).swapExactTokensForTokens(
                        token0Amount > token1Amount ? token0Amount : token1Amount,
                        0,
                        token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                        await account.getAddress(),
                        MaxUint256,
                        overrides
                    )

                }

                await expect(router.connect(accounts[5]).register(competitionId)).to.be.rejectedWith("LovelyTCRouter: already registered")
                expect((await router.competitions(competitionId)).participantsCount).to.be.equal(55)
                expect((await router.competitionsOf(accounts[5])).length).to.be.equal(1);

                await expect(router.sumUpCompetition(5)).to.be.revertedWith("LovelyTCRouter: NO_COMPETITION");
                await expect(router.sumUpCompetition(competitionId)).to.be.revertedWith("LovelyTCRouter: COMPETITION_ACTIVE");
                mineBlockIncreaseTime(DAYS_30)
                await expect(router.sumUpCompetition(competitionId)).to.emit(router, "ReadyForPayouts").withArgs(0)
                await expect(router.sumUpCompetition(competitionId)).to.be.revertedWith("LovelyTCRouter: ALREADY_SORTED");


                const participants = await router.getParticipants(0);
                for (let i = 0; i < 50; i++) {
                    const value = i < 5 ? expandTo18Decimals(10) : i < 10 ? expandTo18Decimals(5) : i < 20 ? expandTo18Decimals(2) : expandTo18Decimals(1)
                    await expect(router.claimById(0, i)).to.emit(token0, "Transfer").withArgs(await router.getAddress(), participants[i].user, value);
                }
                expect(await token0.balanceOf(router)).to.be.equal(expandTo18Decimals(0))

                for (let i = 51; i < 55; i++) {
                    await expect(router.claimById(0, i)).to.be.revertedWith("LovelyTCRouter: NOT_WINNER")
                }
                await expect(router.claimById(0, 49)).to.be.revertedWith("LovelyTCRouter: ALREADY_CLAIMED")
                await expect(router.claimById(0, 50)).to.be.revertedWith("LovelyTCRouter: NOT_WINNER")

                await expect(router.withdrawRemainings(competitionId)).to.be.revertedWith("LovelyTCRouter: NOTHING TO WITHDRAW");

            })


            // it('loadtest', async () => {
            //     const competitionId = 0;
            //     await expect(router.claimById(0, 0)).to.be.revertedWith("LovelyTCRouter: WINNERS_NOT_SELECTED")
            //     mineBlockIncreaseTime(500);
            //     token0.mint(expandTo18Decimals(10000000000))
            //     token1.mint(expandTo18Decimals(10000000000))
            //     addLiquidity(BigInt(expandTo18Decimals(10000000000)), BigInt(expandTo18Decimals(10000000000)));
            //     for (let i = 0; i < 10000; i++) {
            //         const account = accounts[i];
            //         const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
            //         const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
            //         await mintAndApprove(account, token0Amount, token1Amount)
            //         router.connect(account).register(competitionId)
            //         await router.connect(account).swapExactTokensForTokens(
            //             token0Amount > token1Amount ? token0Amount : token1Amount,
            //             0,
            //             token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
            //             await account.getAddress(),
            //             MaxUint256,
            //             overrides
            //         )
            //     }
            //     expect((await router.competitions(competitionId)).participantsCount).to.be.equal(1000)
            //     mineBlockIncreaseTime(DAYS_30)
            //     await expect(router.sumUpCompetition(0)).to.emit(router, "ReadyForPayouts").withArgs(0)

            // })

        })
    })

})
