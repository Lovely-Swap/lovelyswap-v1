//SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

interface ILFSwapV1Factory {
	function getExchange(address) external view returns (address);
}
