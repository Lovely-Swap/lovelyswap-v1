import { expect } from 'chai'

import { expandTo18Decimals, getCreate2Address } from './shared/utilities'
import { factoryFixture } from './shared/fixtures'

import { ERC20, LovelyFactory, LovelyFactory__factory, LovelyPair__factory } from '../typechain-types';

import { ZERO_ADDRESS } from '../util/utilities';
import { ethers } from "hardhat"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";


const TEST_ADDRESSES: [string, string] = [
    '0x1000000000000000000000000000000000000000',
    '0x2000000000000000000000000000000000000000'
]

describe('LovelyFactory', () => {

    let wallet: SignerWithAddress;
    let other: SignerWithAddress;

    let factory: LovelyFactory;
    let feeToken: ERC20;

    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        wallet = accounts[0];
        other = accounts[1];
        const fixture = await factoryFixture(wallet)
        factory = fixture.factory
        feeToken = fixture.feeToken
    })

    it('feeTo, feeToSetter, allPairsLength', async () => {
        expect(await factory.feeTo()).to.eq(ZERO_ADDRESS)
        expect(await factory.feeToSetter()).to.eq(wallet.address)
        expect(await factory.allPairsLength()).to.eq(0)
    })

    async function createPair(tokens: [string, string]) {
        const timestamp = (await ethers.provider.getBlock('latest'))!.timestamp

        const bytecode = `${LovelyPair__factory.bytecode}`
        const create2Address = getCreate2Address(await factory.getAddress(), tokens, bytecode)
        await expect(factory.createPair(...tokens, 0)).to.be.revertedWithCustomError(factory, "TokenANotWhitelisted")

        await factory.allowToken(tokens[0], 0)
        await expect(factory.createPair(...tokens, 0)).to.be.revertedWithCustomError(factory, "TokenBNotWhitelisted")
        await factory.allowToken(tokens[1], 0)
        await expect(factory.allowToken(ZERO_ADDRESS, 0)).to.be.revertedWithCustomError(factory, "ZeroAddress")

        await expect(factory.createPair(...tokens, 0))
            .to.emit(factory, 'PairCreated')
            .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, BigInt(1))

        await expect(factory.createPair(tokens[0], tokens[0], 0)).to.be.revertedWithCustomError(factory, "IdenticalAddresses")

        await expect(factory.createPair(...tokens, 0)).to.be.revertedWithCustomError(factory, "PairExists")
        await expect(factory.createPair(tokens[1], tokens[0], 0)).to.be.revertedWithCustomError(factory, "PairExists")
        expect(await factory.getPair(...tokens)).to.eq(create2Address)
        expect(await factory.getPair(tokens[1], tokens[0])).to.eq(create2Address)
        expect(await factory.allPairs(0)).to.eq(create2Address)
        expect(await factory.allPairsLength()).to.eq(1)

        const pair = LovelyPair__factory.connect(create2Address, wallet);
        expect(await pair.factory()).to.eq(await factory.getAddress())
        expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
        expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
    }

    it('createPair', async () => {
        await createPair(TEST_ADDRESSES)
    })

    it('createPair:reverse', async () => {
        await createPair(TEST_ADDRESSES.slice().reverse() as [string, string])
    })

    it("constructor rever", async () => {
        await expect(new LovelyFactory__factory(wallet).deploy(wallet.address, await feeToken.getAddress(), 10, 21)).to.be.revertedWithCustomError(factory, "ValidationFailed")
        await expect(new LovelyFactory__factory(wallet).deploy(wallet.address, await feeToken.getAddress(), 21, 10)).to.be.revertedWithCustomError(factory, "ValidationFailed")
        await expect(new LovelyFactory__factory(wallet).deploy(wallet.address, ZERO_ADDRESS, 20, 10)).to.be.revertedWithCustomError(factory, "ValidationFailed")
        await expect(new LovelyFactory__factory(wallet).deploy(ZERO_ADDRESS, await feeToken.getAddress(), 20, 10)).to.be.revertedWithCustomError(factory, "ValidationFailed")

    })

    it("allow token", async () => {
        await feeToken.connect(other).mint(expandTo18Decimals(1000000));
        await feeToken.connect(other).approve(await factory.getAddress(), expandTo18Decimals(100000));
        const timestamp = (await ethers.provider.getBlock('latest'))!.timestamp
        await expect(factory.connect(other).allowToken(feeToken, timestamp + 100)).to.emit(feeToken, "Transfer");
        expect(await factory.allowedTokensLength()).to.be.eq(1);
        expect((await factory.getAllPairs()).length).to.be.eq(0);
        expect((await factory.getAllowedTokens()).length).to.be.eq(1);
    })

    it('whitelist token', async () => {
        const tokens = [
            '0x3000000000000000000000000000000000000000',
            '0x4000000000000000000000000000000000000000',
            '0x5000000000000000000000000000000000000000',
            '0x6000000000000000000000000000000000000000',
            '0x7000000000000000000000000000000000000000',
            '0x8000000000000000000000000000000000000000',
            '0x9000000000000000000000000000000000000000',
            '0x1000000000000000000000000000000000000000',
            '0x1100000000000000000000000000000000000000',
            '0x1200000000000000000000000000000000000000',
            '0x1300000000000000000000000000000000000000',
            '0x1400000000000000000000000000000000000000',
            '0x1500000000000000000000000000000000000000',
        ]

        const timestamp = (await ethers.provider.getBlock('latest'))!.timestamp
        const days7 = 7 * 24 * 60 * 60
        await expect(factory.connect(other).createPair(tokens[0], tokens[1], 0)).to.be.revertedWithCustomError(factory, "TokenANotWhitelisted")
        await expect(factory.allowToken(tokens[0], 0)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).createPair(tokens[0], tokens[1], 0)).to.be.revertedWithCustomError(factory, "TokenBNotWhitelisted")

        await expect(factory.allowToken(tokens[0], 0)).to.be.revertedWithCustomError(factory, "AlreadyWhitelisted")
        await expect(factory.allowToken(tokens[1], timestamp + days7 + 100)).to.be.revertedWithCustomError(factory, "InvalidPendingPeriod")

        await expect(factory.allowToken(tokens[1], timestamp + days7)).to.emit(factory, 'TokenAllowed')
        await expect(factory.allowToken(tokens[2], timestamp + days7)).to.emit(factory, 'TokenAllowed')
        expect((await factory.allowlists(tokens[1]))[1]).to.be.equal(timestamp + days7);


        await expect(factory.connect(other).createPair(tokens[1], tokens[2], 0)).to.be.revertedWithCustomError(factory, "Forbidden")

        await expect(factory.createPair(tokens[1], tokens[2], timestamp + days7 + 10)).to.be.revertedWithCustomError(factory, "InvalidActiveFrom")

        await expect(factory.createPair(tokens[1], tokens[2], timestamp + days7)).to.emit(factory, 'PairCreated')

        await expect(factory.connect(other).allowToken(tokens[3], timestamp + days7)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).allowToken(tokens[4], timestamp + days7 / 2)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).createPair(tokens[3], tokens[4], timestamp + days7 / 2 + 10)).to.be.revertedWithCustomError(factory, "InvalidActiveFrom")

        await expect(factory.connect(other).allowToken(tokens[11], timestamp + days7 / 2)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).allowToken(tokens[12], timestamp + days7)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).createPair(tokens[11], tokens[12], timestamp + days7 / 2 + 10)).to.be.revertedWithCustomError(factory, "InvalidActiveFrom")


        await expect(factory.connect(other).allowToken(tokens[5], timestamp + days7)).to.emit(factory, 'TokenAllowed')
        await expect(factory.allowToken(tokens[6], timestamp + days7 / 2)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).createPair(tokens[5], tokens[6], timestamp + days7 / 2 + 10)).to.be.revertedWithCustomError(factory, "Forbidden")

        await expect(factory.allowToken(tokens[7], timestamp + days7 / 2)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).allowToken(tokens[8], timestamp + days7)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).createPair(tokens[7], tokens[8], timestamp + days7 / 2 + 10)).to.be.revertedWithCustomError(factory, "Forbidden")


        await expect(factory.allowToken(tokens[9], 0)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).allowToken(tokens[10], timestamp + days7)).to.emit(factory, 'TokenAllowed')
        await expect(factory.createPair(tokens[9], tokens[10], timestamp + days7 - 10)).to.be.revertedWithCustomError(factory, "Forbidden")
        
    
    })


    it('setFeeTo', async () => {
        await expect(factory.connect(other).setFeeTo(other.address)).to.be.revertedWithCustomError(factory, "Forbidden")
        await factory.setFeeTo(wallet.address)
        expect(await factory.feeTo()).to.eq(wallet.address)
    })

    it('ownership', async () => {
        await expect(factory.connect(other).setFeeToSetter(other.address)).to.be.revertedWithCustomError(factory, "Forbidden")
        await expect(factory.setFeeToSetter(ZERO_ADDRESS)).to.be.revertedWithCustomError(factory, "ValidationFailed")
        await factory.setFeeToSetter(other.address)
        expect(await factory.feeToSetter()).to.eq(other.address)

        await expect(factory.setListingFee(BigInt(1))).to.be.revertedWithCustomError(factory, "Forbidden")
        await factory.connect(other).setListingFee(BigInt(1))
        expect(await factory.listingFee()).to.be.equal(BigInt(1));

        await expect(factory.setFeeToken(wallet.address)).to.be.revertedWithCustomError(factory, "Forbidden")
        await expect(factory.connect(other).setFeeToken(ZERO_ADDRESS)).to.be.revertedWithCustomError(factory, "ValidationFailed")

        await factory.connect(other).setFeeToken(wallet.address)
        expect(await factory.feeToken()).to.be.equal(wallet.address);

        await expect(factory.setTradingFees(BigInt(1), BigInt(1))).to.be.revertedWithCustomError(factory, "Forbidden")
        await factory.connect(other).setTradingFees(BigInt(1), BigInt(1))
        expect(await factory.ownerFee()).to.be.equal(BigInt(1));
        expect(await factory.lpFee()).to.be.equal(BigInt(1));

        await expect(factory.connect(other).setTradingFees(BigInt(21), BigInt(1))).to.be.revertedWithCustomError(factory, "ValidationFailed")
        await expect(factory.connect(other).setTradingFees(BigInt(1), BigInt(21))).to.be.revertedWithCustomError(factory, "ValidationFailed")
    })
})
