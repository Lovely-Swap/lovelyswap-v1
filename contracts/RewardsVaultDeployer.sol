//SPDX-License-Identifier: MIT

import { RewardsVault } from "./RewardsVault.sol";
import { IRewardsVaultDeployer } from "./interfaces/IRewardsVaultDeployer.sol";

contract RewardsVaultDeployer is IRewardsVaultDeployer {
	function deploy(address token) external returns (address) {
		return address(new RewardsVault(token, msg.sender));
	}
}
