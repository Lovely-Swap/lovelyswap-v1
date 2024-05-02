//SPDX-License-Identifier: MIT

import { RewardsVault } from "./RewardsVault.sol";
import { IRewardsVaultDeployer } from "./interfaces/IRewardsVaultDeployer.sol";
/**
 * @dev RewardsVaultDeployer is used to deploy RewardsVault contracts.
 */
contract RewardsVaultDeployer is IRewardsVaultDeployer {
	/**
	 * @dev Deploys a new RewardsVault contract.
	 * @param token The address of the token to store rewards in.
	 * @return The address of the newly deployed RewardsVault contract.
	 */
	function deploy(address token) external returns (address) {
		return address(new RewardsVault(token, msg.sender));
	}
}
