//SPDX-License-Identifier: MIT

import { TransferHelper } from "./libraries/TransferHelper.sol";
import { IRewardsVault } from "./interfaces/IRewardsVault.sol";

/*
 * @dev RewardsVault is used to store and withdraw rewards for the trading competition.
 */
contract RewardsVault is IRewardsVault {
	address public immutable token;
	address public immutable owner;

	constructor(address _token, address _owner) {
		token = _token;
		owner = _owner;
	}

	function withdraw(address to, uint256 amount) external {
		if (msg.sender != owner) revert Forbidden();
		TransferHelper.safeTransfer(address(token), to, amount);
	}
}
