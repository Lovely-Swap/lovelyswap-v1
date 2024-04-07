import { expect } from 'chai'
import { MaxUint256, hexlify, keccak256, toUtf8Bytes, getBigInt } from 'ethers'
import { ethers } from "hardhat"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expandTo18Decimals } from './shared/utilities'

import { ERC20 } from '../typechain-types/contracts/test/ERC20';
import { ERC20__factory } from '../typechain-types/factories/contracts/test/ERC20__factory';

const TOTAL_SUPPLY = expandTo18Decimals(10000)
const TEST_AMOUNT = expandTo18Decimals(10)

describe('LovelyERC20', () => {
    let wallet: SignerWithAddress;
    let other: SignerWithAddress;

    let token: ERC20
    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        wallet = accounts[0];
        other = accounts[1];
        token = await new ERC20__factory(wallet).deploy(TOTAL_SUPPLY);
    })

    it('name, symbol, decimals, totalSupply, balanceOf, DOMAIN_SEPARATOR, PERMIT_TYPEHASH', async () => {
        const name = await token.name()
        expect(name).to.eq('Lovely Swap')
        expect(await token.symbol()).to.eq('LS')
        expect(await token.decimals()).to.eq(18)
        expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY)
        expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY)
        const chainIdHex = await ethers.provider.send('eth_chainId');
        expect(await token.DOMAIN_SEPARATOR()).to.eq(
            keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
                    [
                        keccak256(
                            toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
                        ),
                        keccak256(toUtf8Bytes(name)),
                        keccak256(toUtf8Bytes('1')),
                        chainIdHex,
                        await token.getAddress()
                    ]
                )
            )
        )
        expect(await token.PERMIT_TYPEHASH()).to.eq(
            keccak256(toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'))
        )
        expect(await token.chainId()).to.be.equal(31337);
    })

    it('approve', async () => {
        await expect(token.approve(other.address, TEST_AMOUNT))
            .to.emit(token, 'Approval')
            .withArgs(wallet.address, other.address, TEST_AMOUNT)
        expect(await token.allowance(wallet.address, other.address)).to.eq(TEST_AMOUNT)
    })

    it('transfer', async () => {
        await expect(token.transfer(other.address, TEST_AMOUNT))
            .to.emit(token, 'Transfer')
            .withArgs(wallet.address, other.address, TEST_AMOUNT)
        expect(await token.balanceOf(wallet.address)).to.eq(getBigInt(TOTAL_SUPPLY) - getBigInt(TEST_AMOUNT))
        expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
    })

    it('transfer:fail', async () => {
        await expect(token.transfer(other.address, getBigInt(TOTAL_SUPPLY) + BigInt(1))).to.be.reverted // ds-math-sub-underflow
        await expect(token.connect(other).transfer(wallet.address, 1)).to.be.reverted // ds-math-sub-underflow
    })

    it('transferFrom', async () => {
        await token.approve(other.address, TEST_AMOUNT)
        await expect(token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT))
            .to.emit(token, 'Transfer')
            .withArgs(wallet.address, other.address, TEST_AMOUNT)
        expect(await token.allowance(wallet.address, other.address)).to.eq(0)
        expect(await token.balanceOf(wallet.address)).to.eq(getBigInt(TOTAL_SUPPLY) - getBigInt(TEST_AMOUNT))
        expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
    })

    it('transferFrom:max', async () => {
        await token.connect(wallet).approve(other.address, MaxUint256)
        await expect(token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT))
            .to.emit(token, 'Transfer')
            .withArgs(wallet.address, other.address, TEST_AMOUNT)
        expect(await token.allowance(wallet.address, other.address)).to.eq(MaxUint256)
        expect(await token.balanceOf(wallet.address)).to.eq(getBigInt(TOTAL_SUPPLY) - getBigInt(TEST_AMOUNT))
        expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
    })

    it('permit', async () => {

        const nonce = await token.nonces(wallet.address)
        const deadline = MaxUint256

        const sig = await wallet.signTypedData(
            {
                name: await token.name(),
                version: '1',
                chainId: 31337,
                verifyingContract: await token.getAddress()
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
                spender: other.address,
                value: TEST_AMOUNT,
                nonce: nonce,
                deadline: deadline,
            }
        )


        const signature = ethers.Signature.from(sig);
        await expect(token.permit(wallet.address, other.address, TEST_AMOUNT, 0, signature.v, hexlify(signature.r), hexlify(signature.s)))
            .to.be.revertedWith("Lovely Swap: EXPIRED");

        await expect(token.permit(other.address, other.address, TEST_AMOUNT, deadline, signature.v, hexlify(signature.r), hexlify(signature.s)))
            .to.be.revertedWith("Lovely Swap: INVALID_SIGNATURE");

        await expect(token.permit(wallet.address, other.address, TEST_AMOUNT, deadline, signature.v, hexlify(signature.r), hexlify(signature.s)))
            .to.emit(token, 'Approval')
            .withArgs(wallet.address, other.address, TEST_AMOUNT)
        expect(await token.allowance(wallet.address, other.address)).to.eq(TEST_AMOUNT)
        expect(await token.nonces(wallet.address)).to.eq(BigInt(1))
    })
})
