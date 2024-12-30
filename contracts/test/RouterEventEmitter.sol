//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import "../interfaces/ILFSwapRouter01.sol";

contract RouterEventEmitter {
	event Amounts(uint[] amounts);

	receive() external payable {}

	function swapExactTokensForTokens(
		address router,
		uint256 amountIn,
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external {
		(bool success, bytes memory returnData) = router.delegatecall(
			abi.encodeWithSelector(
				ILFSwapRouter01(router).swapExactTokensForTokens.selector,
				amountIn,
				amountOutMin,
				path,
				to,
				deadline
			)
		);
		assert(success);
		emit Amounts(abi.decode(returnData, (uint[])));
	}

	function swapTokensForExactTokens(
		address router,
		uint256 amountOut,
		uint256 amountInMax,
		address[] calldata path,
		address to,
		uint256 deadline
	) external {
		(bool success, bytes memory returnData) = router.delegatecall(
			abi.encodeWithSelector(
				ILFSwapRouter01(router).swapTokensForExactTokens.selector,
				amountOut,
				amountInMax,
				path,
				to,
				deadline
			)
		);
		assert(success);
		emit Amounts(abi.decode(returnData, (uint[])));
	}

	function swapExactETHForTokens(
		address router,
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable {
		(bool success, bytes memory returnData) = router.delegatecall(
			abi.encodeWithSelector(
				ILFSwapRouter01(router).swapExactETHForTokens.selector,
				amountOutMin,
				path,
				to,
				deadline
			)
		);
		assert(success);
		emit Amounts(abi.decode(returnData, (uint[])));
	}

	function swapTokensForExactETH(
		address router,
		uint256 amountOut,
		uint256 amountInMax,
		address[] calldata path,
		address to,
		uint256 deadline
	) external {
		(bool success, bytes memory returnData) = router.delegatecall(
			abi.encodeWithSelector(
				ILFSwapRouter01(router).swapTokensForExactETH.selector,
				amountOut,
				amountInMax,
				path,
				to,
				deadline
			)
		);
		assert(success);
		emit Amounts(abi.decode(returnData, (uint[])));
	}

	function swapExactTokensForETH(
		address router,
		uint256 amountIn,
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external {
		(bool success, bytes memory returnData) = router.delegatecall(
			abi.encodeWithSelector(
				ILFSwapRouter01(router).swapExactTokensForETH.selector,
				amountIn,
				amountOutMin,
				path,
				to,
				deadline
			)
		);
		assert(success);
		emit Amounts(abi.decode(returnData, (uint[])));
	}

	function swapETHForExactTokens(
		address router,
		uint256 amountOut,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable {
		(bool success, bytes memory returnData) = router.delegatecall(
			abi.encodeWithSelector(
				ILFSwapRouter01(router).swapETHForExactTokens.selector,
				amountOut,
				path,
				to,
				deadline
			)
		);
		assert(success);
		emit Amounts(abi.decode(returnData, (uint[])));
	}
}
