//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import "../LovelyERC20.sol";

contract ERC20 is LovelyERC20 {
	constructor(uint256 _totalSupply) {
		_mint(msg.sender, _totalSupply);
	}

	function mint(uint256 value) external {
		_mint(msg.sender, value);
	}
}
