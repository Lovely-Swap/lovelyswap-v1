//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

interface IRewardsVault {
	function withdraw(address to, uint256 amount) external;

	error Forbidden();
}
