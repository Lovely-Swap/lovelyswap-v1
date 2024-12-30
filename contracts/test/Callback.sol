pragma solidity =0.8.20;

import "../interfaces/ILFSwapCallee.sol";
import "../interfaces/ILFPair.sol";

contract Callback is ILFSwapCallee {
	bool private reEnter;

	function setReEnter(bool val) external {
		reEnter = val;
	}

	function LFSwapCall(address sender, uint256 amount0, uint256 amount1, bytes calldata data) external {
		if (reEnter) {
			ILFPair(msg.sender).swap(amount0, amount1, address(this), data);
		}
	}
}
