pragma solidity =0.8.20;

import "../interfaces/ILovelyCallee.sol";
import "../interfaces/ILovelyPair.sol";

contract Callback is ILovelyCallee {
	bool private reEnter;

	function setReEnter(bool val) external {
		reEnter = val;
	}

	function lovelyCall(address sender, uint256 amount0, uint256 amount1, bytes calldata data) external {
		if (reEnter) {
			ILovelyPair(msg.sender).swap(amount0, amount1, address(this), data);
		}
	}
}
