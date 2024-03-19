//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

interface ILovelyMigrator {
	function migrate(
		address token,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline
	) external;
}
