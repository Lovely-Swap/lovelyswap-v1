//SPDX-License-Identifier: MIT

import { TransferHelper } from "./libraries/TransferHelper.sol";
import { IRewardsVault } from "./interfaces/IRewardsVault.sol";

/*
 * @dev RewardsVault is used to store and withdraw rewards for the trading competition.
 */
contract RewardsVault is IRewardsVault {
	address public immutable token;
	address public immutable owner;

	/**
	 * @dev Creates a new RewardsVault contract.
	 * @param _token The address of the token to store rewards in.
	 * @param _owner The address that is allowed to withdraw rewards.
	 */
	constructor(address _token, address _owner) {
		token = _token;
		owner = _owner;
	}

	/**
	 * @dev Withdraw rewards into the vault.
	 * @param to The address to transfer rewards to.
	 * @param amount The amount of rewards to transfer.
	 */
	function withdraw(address to, uint256 amount) external {
		if (msg.sender != owner) revert Forbidden();
		TransferHelper.safeTransfer(address(token), to, amount);
	}
}
