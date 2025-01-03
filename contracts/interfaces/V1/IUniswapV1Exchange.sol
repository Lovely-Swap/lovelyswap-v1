//SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

interface ILFSwapV1Exchange {
	function balanceOf(address owner) external view returns (uint);

	function transferFrom(address from, address to, uint256 value) external returns (bool);

	function removeLiquidity(uint, uint, uint, uint) external returns (uint, uint);

	function tokenToEthSwapInput(uint, uint, uint) external returns (uint);

	function ethToTokenSwapInput(uint, uint) external payable returns (uint);
}
