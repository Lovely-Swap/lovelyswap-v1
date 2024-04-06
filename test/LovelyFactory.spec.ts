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
        await expect(factory.createPair(...tokens, timestamp)).to.be.rejectedWith("Lovely Swap: TOKEN_A_NOT_WHITELISTED")

        await factory.allowToken(tokens[0], 0)
        await expect(factory.createPair(...tokens, timestamp)).to.be.rejectedWith("Lovely Swap: TOKEN_B_NOT_WHITELISTED")
        await factory.allowToken(tokens[1], 0)
        await factory.allowToken(ZERO_ADDRESS, 0)

        await expect(factory.createPair(...tokens, timestamp))
            .to.emit(factory, 'PairCreated')
            .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, BigInt(1))

        await expect(factory.createPair(tokens[0], tokens[0], timestamp)).to.be.revertedWith("Lovely Swap: IDENTICAL_ADDRESSES")
        await expect(factory.createPair(ZERO_ADDRESS, tokens[0], timestamp)).to.be.revertedWith("Lovely Swap: ZERO_ADDRESS")

        await expect(factory.createPair(...tokens, timestamp)).to.be.rejectedWith("Lovely Swap: PAIR_EXISTS");
        await expect(factory.createPair(tokens[1], tokens[0], timestamp)).to.be.rejectedWith("Lovely Swap: PAIR_EXISTS");
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
        await expect(new LovelyFactory__factory(wallet).deploy(wallet.address, await feeToken.getAddress(), 10, 21)).to.be.revertedWith("Lovely Swap: VALIDATION")
        await expect(new LovelyFactory__factory(wallet).deploy(wallet.address, await feeToken.getAddress(), 21, 10)).to.be.revertedWith("Lovely Swap: VALIDATION")
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
        const tokens: [string, string, string, string, string, string, string] = [
            '0x3000000000000000000000000000000000000000',
            '0x4000000000000000000000000000000000000000',
            '0x5000000000000000000000000000000000000000',
            '0x6000000000000000000000000000000000000000',
            '0x7000000000000000000000000000000000000000',
            '0x8000000000000000000000000000000000000000',
            '0x9000000000000000000000000000000000000000'
        ]

        const timestamp = (await ethers.provider.getBlock('latest'))!.timestamp
        const days7 = 7 * 24 * 60 * 60
        await expect(factory.connect(other).createPair(tokens[0], tokens[1], 0)).to.be.revertedWith("Lovely Swap: TOKEN_A_NOT_WHITELISTED")
        await expect(factory.allowToken(tokens[0], 0)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).createPair(tokens[0], tokens[1], 0)).to.be.revertedWith("Lovely Swap: TOKEN_B_NOT_WHITELISTED")

        await expect(factory.allowToken(tokens[0], 0)).to.be.revertedWith('Lovely Swap: ALREADY_WHITELISTED')
        await expect(factory.allowToken(tokens[1], timestamp + days7 + 100)).to.be.revertedWith('Lovely Swap: LONG_PENDING_PERIOD')

        await expect(factory.allowToken(tokens[1], timestamp + days7)).to.emit(factory, 'TokenAllowed')
        await expect(factory.allowToken(tokens[2], timestamp + days7)).to.emit(factory, 'TokenAllowed')
        expect((await factory.allowlists(tokens[1]))[1]).to.be.equal(timestamp + days7);


        await expect(factory.connect(other).createPair(tokens[1], tokens[2], 0)).to.be.revertedWith("Lovely Swap: FORBIDDEN")

        await expect(factory.createPair(tokens[1], tokens[2], timestamp + days7 + 10)).to.be.revertedWith("LOVELY: INVALID_ACTIVE_FROM")

        await expect(factory.createPair(tokens[1], tokens[2], timestamp + days7)).to.emit(factory, 'PairCreated')

        await expect(factory.connect(other).allowToken(tokens[3], timestamp + days7)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).allowToken(tokens[4], timestamp + days7 / 2)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).createPair(tokens[3], tokens[4], timestamp + days7 / 2 + 10)).to.be.revertedWith("Lovely Swap: INVALID_ACTIVE_FROM")

        await expect(factory.connect(other).allowToken(tokens[5], timestamp + days7)).to.emit(factory, 'TokenAllowed')
        await expect(factory.allowToken(tokens[6], timestamp + days7 / 2)).to.emit(factory, 'TokenAllowed')
        await expect(factory.connect(other).createPair(tokens[5], tokens[6], timestamp + days7 / 2 + 10)).to.be.revertedWith("Lovely Swap: FORBIDDEN")


    })


    it('setFeeTo', async () => {
        await expect(factory.connect(other).setFeeTo(other.address)).to.be.revertedWith('Lovely Swap: FORBIDDEN')
        await factory.setFeeTo(wallet.address)
        expect(await factory.feeTo()).to.eq(wallet.address)
    })

    it('ownership', async () => {
        await expect(factory.connect(other).setFeeToSetter(other.address)).to.be.revertedWith('Lovely Swap: FORBIDDEN')
        await factory.setFeeToSetter(other.address)
        expect(await factory.feeToSetter()).to.eq(other.address)

        await expect(factory.setListingFee(BigInt(1))).to.be.revertedWith('Lovely Swap: FORBIDDEN')
        await factory.connect(other).setListingFee(BigInt(1))
        expect(await factory.listingFee()).to.be.equal(BigInt(1));

        await expect(factory.setFeeToken(wallet.address)).to.be.revertedWith('Lovely Swap: FORBIDDEN')
        await factory.connect(other).setFeeToken(wallet.address)
        expect(await factory.feeToken()).to.be.equal(wallet.address);

        await expect(factory.setTradingFees(BigInt(1), BigInt(1))).to.be.revertedWith('Lovely Swap: FORBIDDEN')
        await factory.connect(other).setTradingFees(BigInt(1), BigInt(1))
        expect(await factory.ownerFee()).to.be.equal(BigInt(1));
        expect(await factory.lpFee()).to.be.equal(BigInt(1));

        await expect(factory.connect(other).setTradingFees(BigInt(21), BigInt(1))).to.be.revertedWith('Lovely Swap: VALIDATION')
        await expect(factory.connect(other).setTradingFees(BigInt(1), BigInt(21))).to.be.revertedWith('Lovely Swap: VALIDATION')


    })


})
