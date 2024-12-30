//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

interface ILFSwapCallee {
	function LFSwapCall(address sender, uint256 amount0, uint256 amount1, bytes calldata data) external;
}