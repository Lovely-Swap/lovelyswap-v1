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


describe('LovelyRouter{01,02}', () => {
    const DAYS_30 = 30 * 24 * 60 * 60;
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
        router = await new LovelyTCRouter__factory(wallet).deploy(factory, WETH);
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
                expect(await router.pairToCompetitions(await pair.getAddress(), 1)).to.be.equal(1);
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

            it('competiotion tests', async () => {
                const competiotionId = 0;
                mineBlockIncreaseTime(500);
                token0.mint(expandTo18Decimals(10000000000))
                token1.mint(expandTo18Decimals(10000000000))
                addLiquidity(BigInt(expandTo18Decimals(10000000000)), BigInt(expandTo18Decimals(10000000000)));
                expect((await router.competitions(competiotionId)).participantsCount).to.be.equal(0);
                for (let i = 5; i < 10; i++) {
                    const account = accounts[i];
                    const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    await mintAndApprove(account, token0Amount, token1Amount)
                    router.connect(account).register(competiotionId)
                    await router.connect(account).swapExactTokensForTokens(
                        token0Amount > token1Amount ? token0Amount : token1Amount,
                        0,
                        token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                        await account.getAddress(),
                        MaxUint256,
                        overrides
                    )

                }
                expect((await router.competitions(competiotionId)).participantsCount).to.be.equal(5)
                expect(await router.isRegistered(competiotionId, accounts[5])).to.be.true
                const participants = await router.getParticipants(competiotionId)
                expect(participants.length).to.be.equal(5)
                const offchainSortedArray = [...participants].sort((a, b) => {
                    if (a[1] > b[1]) return 1;
                    if (a[1] < b[1]) return -1;
                    return 0;
                });

                expect(await token0.balanceOf(router)).to.be.equal(expandTo18Decimals(125))

                mineBlockIncreaseTime(DAYS_30)
                await expect(router.sumUpCompetition(0)).to.emit(router, "ReadyForPayouts").withArgs(0)
                const onchainSortedArray = await router.getParticipants(competiotionId)
                for (let i = 0; i < onchainSortedArray.length; i++) {
                    await expect(onchainSortedArray[i][1]).to.be.equal(offchainSortedArray[i][1])
                }

                for (let i = 5; i < 10; i++) {
                    const account = accounts[i];
                    await expect(router.claimByAddress(0, account.address)).to.emit(token0, "Transfer").withArgs(await router.getAddress(), account.address, expandTo18Decimals(10));
                }

                await router.withdrawRemainings(0)
                expect(await token0.balanceOf(router)).to.be.equal(expandTo18Decimals(0))

            })

            it('competiotion tests: soldout', async () => {
                const competiotionId = 0;
                await expect(router.claimById(0, 0)).to.be.revertedWith("LovelyTCRouter: WINNERS_NOT_SELECTED")
                mineBlockIncreaseTime(500);
                token0.mint(expandTo18Decimals(10000000000))
                token1.mint(expandTo18Decimals(10000000000))
                addLiquidity(BigInt(expandTo18Decimals(10000000000)), BigInt(expandTo18Decimals(10000000000)));
                expect((await router.competitions(competiotionId)).participantsCount).to.be.equal(0);
                for (let i = 5; i < 60; i++) {
                    const account = accounts[i];
                    const token0Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    const token1Amount = generateRandomBigInt(BigInt(1000000000000000000), BigInt(1000000000000000000000000))
                    await mintAndApprove(account, token0Amount, token1Amount)
                    router.connect(account).register(competiotionId)
                    await router.connect(account).swapExactTokensForTokens(
                        token0Amount > token1Amount ? token0Amount : token1Amount,
                        0,
                        token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
                        await account.getAddress(),
                        MaxUint256,
                        overrides
                    )

                }
                expect((await router.competitions(competiotionId)).participantsCount).to.be.equal(55)

                mineBlockIncreaseTime(DAYS_30)
                await expect(router.sumUpCompetition(0)).to.emit(router, "ReadyForPayouts").withArgs(0)

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
            })


            // it('loadtest', async () => {
            //     const competiotionId = 0;
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
            //         router.connect(account).register(competiotionId)
            //         await router.connect(account).swapExactTokensForTokens(
            //             token0Amount > token1Amount ? token0Amount : token1Amount,
            //             0,
            //             token0Amount > token1Amount ? [await token0.getAddress(), await token1.getAddress()] : [await token1.getAddress(), await token0.getAddress()],
            //             await account.getAddress(),
            //             MaxUint256,
            //             overrides
            //         )
            //     }
            //     expect((await router.competitions(competiotionId)).participantsCount).to.be.equal(1000)
            //     mineBlockIncreaseTime(DAYS_30)
            //     await expect(router.sumUpCompetition(0)).to.emit(router, "ReadyForPayouts").withArgs(0)

            // })

        })
    })

})
