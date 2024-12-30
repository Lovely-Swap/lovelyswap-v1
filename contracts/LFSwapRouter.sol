//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import { TransferHelper } from "./libraries/TransferHelper.sol";
import {ILFSwapFactory} from "./interfaces/ILFSwapFactory.sol";
import {ILFSwapRouter02} from "./interfaces/ILFSwapRouter02.sol";
import {LFLibrary} from "./libraries/LFLibrary.sol";
import { IERC20 } from "./interfaces/IERC20.sol";
import { IWETH } from "./interfaces/IWETH.sol";
import {ILFPair} from "./interfaces/ILFPair.sol";

contract LFSwapRouter is ILFSwapRouter02 {
	address public immutable override factory;
	address public immutable override WETH;

	modifier ensure(uint256 deadline) {
		if (deadline < block.timestamp) revert Expired();
		_;
	}

	constructor(address _factory, address _WETH) {
		factory = _factory;
		WETH = _WETH;
	}

	receive() external payable {
		assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
	}

	// **** ADD LIQUIDITY ****
	function _addLiquidity(
		address tokenA,
		address tokenB,
		uint256 amountADesired,
		uint256 amountBDesired,
		uint256 amountAMin,
		uint256 amountBMin
	) internal virtual returns (uint256 amountA, uint256 amountB) {
		// revert if pair does not exist. Creation of pairs from the router is forbidden
		if (ILFSwapFactory(factory).getPair(tokenA, tokenB) == address(0)) revert PairNotExist();
		(uint256 reserveA, uint256 reserveB) = LFLibrary.getReserves(factory, tokenA, tokenB);
		if (reserveA == 0 && reserveB == 0) {
			(amountA, amountB) = (amountADesired, amountBDesired);
		} else {
			uint256 amountBOptimal = LFLibrary.quote(amountADesired, reserveA, reserveB);
			if (amountBOptimal <= amountBDesired) {
				if (amountBOptimal < amountBMin) revert InsufficientBAmount();
				(amountA, amountB) = (amountADesired, amountBOptimal);
			} else {
				uint256 amountAOptimal = LFLibrary.quote(amountBDesired, reserveB, reserveA);
				assert(amountAOptimal <= amountADesired);
				if (amountAOptimal < amountAMin) revert InsufficientAAmount();
				(amountA, amountB) = (amountAOptimal, amountBDesired);
			}
		}
	}

	function addLiquidity(
		address tokenA,
		address tokenB,
		uint256 amountADesired,
		uint256 amountBDesired,
		uint256 amountAMin,
		uint256 amountBMin,
		address to,
		uint256 deadline
	) external virtual override ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
		(amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
		address pair = LFLibrary.pairFor(factory, tokenA, tokenB);
		TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
		TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
		liquidity = ILFPair(pair).mint(to);
	}

	function addLiquidityETH(
		address token,
		uint256 amountTokenDesired,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline
	)
		external
		payable
		virtual
		override
		ensure(deadline)
		returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
	{
		(amountToken, amountETH) = _addLiquidity(
			token,
			WETH,
			amountTokenDesired,
			msg.value,
			amountTokenMin,
			amountETHMin
		);
		address pair = LFLibrary.pairFor(factory, token, WETH);
		TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
		IWETH(WETH).deposit{ value: amountETH }();
		assert(IWETH(WETH).transfer(pair, amountETH));
		liquidity = ILFPair(pair).mint(to);
		// refund dust eth, if any
		if (msg.value > amountETH) TransferHelper.safeTransferETH(msg.sender, msg.value - amountETH);
	}

	// **** REMOVE LIQUIDITY ****
	function removeLiquidity(
		address tokenA,
		address tokenB,
		uint256 liquidity,
		uint256 amountAMin,
		uint256 amountBMin,
		address to,
		uint256 deadline
	) public virtual override ensure(deadline) returns (uint256 amountA, uint256 amountB) {
		address pair = LFLibrary.pairFor(factory, tokenA, tokenB);
		ILFPair(pair).transferFrom(msg.sender, pair, liquidity); // send liquidity to pair
		(uint256 amount0, uint256 amount1) = ILFPair(pair).burn(to);
		(address token0, ) = LFLibrary.sortTokens(tokenA, tokenB);
		(amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
		if (amountA < amountAMin) revert InsufficientAAmount();
		if (amountB < amountBMin) revert InsufficientBAmount();
	}

	function removeLiquidityETH(
		address token,
		uint256 liquidity,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline
	) public virtual override ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
		(amountToken, amountETH) = removeLiquidity(
			token,
			WETH,
			liquidity,
			amountTokenMin,
			amountETHMin,
			address(this),
			deadline
		);
		TransferHelper.safeTransfer(token, to, amountToken);
		IWETH(WETH).withdraw(amountETH);
		TransferHelper.safeTransferETH(to, amountETH);
	}

	function removeLiquidityWithPermit(
		address tokenA,
		address tokenB,
		uint256 liquidity,
		uint256 amountAMin,
		uint256 amountBMin,
		address to,
		uint256 deadline,
		bool approveMax,
		uint8 v,
		bytes32 r,
		bytes32 s
	) external virtual override returns (uint256 amountA, uint256 amountB) {
		address pair = LFLibrary.pairFor(factory, tokenA, tokenB);
		uint256 value = approveMax ? type(uint256).max : liquidity;
		ILFPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
		(amountA, amountB) = removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline);
	}

	function removeLiquidityETHWithPermit(
		address token,
		uint256 liquidity,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline,
		bool approveMax,
		uint8 v,
		bytes32 r,
		bytes32 s
	) external virtual override returns (uint256 amountToken, uint256 amountETH) {
		address pair = LFLibrary.pairFor(factory, token, WETH);
		uint256 value = approveMax ? type(uint256).max : liquidity;
		ILFPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
		(amountToken, amountETH) = removeLiquidityETH(token, liquidity, amountTokenMin, amountETHMin, to, deadline);
	}

	// **** REMOVE LIQUIDITY (supporting fee-on-transfer tokens) ****
	function removeLiquidityETHSupportingFeeOnTransferTokens(
		address token,
		uint256 liquidity,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline
	) public virtual override ensure(deadline) returns (uint256 amountETH) {
		(, amountETH) = removeLiquidity(token, WETH, liquidity, amountTokenMin, amountETHMin, address(this), deadline);
		TransferHelper.safeTransfer(token, to, IERC20(token).balanceOf(address(this)));
		IWETH(WETH).withdraw(amountETH);
		TransferHelper.safeTransferETH(to, amountETH);
	}

	function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
		address token,
		uint256 liquidity,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline,
		bool approveMax,
		uint8 v,
		bytes32 r,
		bytes32 s
	) external virtual override returns (uint256 amountETH) {
		address pair = LFLibrary.pairFor(factory, token, WETH);
		uint256 value = approveMax ? type(uint256).max : liquidity;
		ILFPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
		amountETH = removeLiquidityETHSupportingFeeOnTransferTokens(
			token,
			liquidity,
			amountTokenMin,
			amountETHMin,
			to,
			deadline
		);
	}

	// **** SWAP ****
	// requires the initial amount to have already been sent to the first pair
	function _swap(uint[] memory amounts, address[] calldata path, address _to) internal virtual {
		for (uint256 i; i < path.length - 1; i++) {
			(address input, address output) = (path[i], path[i + 1]);
			(address token0, ) = LFLibrary.sortTokens(input, output);
			uint256 amountOut = amounts[i + 1];
			(uint256 amount0Out, uint256 amount1Out) = input == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
			address to = i < path.length - 2 ? LFLibrary.pairFor(factory, output, path[i + 2]) : _to;
			address pair = LFLibrary.pairFor(factory, input, output);
			ILFPair(pair).swap(amount0Out, amount1Out, to, new bytes(0));
			_postTrade(pair, input, amounts, i);
		}
	}

	function _postTrade(address pair, address input, uint256[] memory amounts, uint256 position) internal virtual {}

	function swapExactTokensForTokens(
		uint256 amountIn,
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external virtual override ensure(deadline) returns (uint[] memory amounts) {
		amounts = LFLibrary.getAmountsOut(factory, amountIn, path, getTotalFees());
		if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
		TransferHelper.safeTransferFrom(
			path[0],
			msg.sender,
			LFLibrary.pairFor(factory, path[0], path[1]),
			amounts[0]
		);
		_swap(amounts, path, to);
	}

	function swapTokensForExactTokens(
		uint256 amountOut,
		uint256 amountInMax,
		address[] calldata path,
		address to,
		uint256 deadline
	) external virtual override ensure(deadline) returns (uint[] memory amounts) {
		amounts = LFLibrary.getAmountsIn(factory, amountOut, path, getTotalFees());
		if (amounts[0] > amountInMax) revert ExcessiveInputAmount();
		TransferHelper.safeTransferFrom(
			path[0],
			msg.sender,
			LFLibrary.pairFor(factory, path[0], path[1]),
			amounts[0]
		);
		_swap(amounts, path, to);
	}

	function swapExactETHForTokens(
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable virtual override ensure(deadline) returns (uint[] memory amounts) {
		if (path[0] != WETH) revert InvalidPath();
		amounts = LFLibrary.getAmountsOut(factory, msg.value, path, getTotalFees());
		if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
		IWETH(WETH).deposit{ value: amounts[0] }();
		assert(IWETH(WETH).transfer(LFLibrary.pairFor(factory, path[0], path[1]), amounts[0]));
		_swap(amounts, path, to);
	}

	function swapTokensForExactETH(
		uint256 amountOut,
		uint256 amountInMax,
		address[] calldata path,
		address to,
		uint256 deadline
	) external virtual override ensure(deadline) returns (uint[] memory amounts) {
		if (path[path.length - 1] != WETH) revert InvalidPath();
		amounts = LFLibrary.getAmountsIn(factory, amountOut, path, getTotalFees());
		if (amounts[0] > amountInMax) revert ExcessiveInputAmount();
		TransferHelper.safeTransferFrom(
			path[0],
			msg.sender,
			LFLibrary.pairFor(factory, path[0], path[1]),
			amounts[0]
		);
		_swap(amounts, path, address(this));
		IWETH(WETH).withdraw(amounts[amounts.length - 1]);
		TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
	}

	function swapExactTokensForETH(
		uint256 amountIn,
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external virtual override ensure(deadline) returns (uint[] memory amounts) {
		if (path[path.length - 1] != WETH) revert InvalidPath();
		amounts = LFLibrary.getAmountsOut(factory, amountIn, path, getTotalFees());
		if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
		TransferHelper.safeTransferFrom(
			path[0],
			msg.sender,
			LFLibrary.pairFor(factory, path[0], path[1]),
			amounts[0]
		);
		_swap(amounts, path, address(this));
		IWETH(WETH).withdraw(amounts[amounts.length - 1]);
		TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
	}

	function swapETHForExactTokens(
		uint256 amountOut,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable virtual override ensure(deadline) returns (uint[] memory amounts) {
		if (path[0] != WETH) revert InvalidPath();
		amounts = LFLibrary.getAmountsIn(factory, amountOut, path, getTotalFees());
		if (amounts[0] > msg.value) revert ExcessiveInputAmount();
		IWETH(WETH).deposit{ value: amounts[0] }();
		assert(IWETH(WETH).transfer(LFLibrary.pairFor(factory, path[0], path[1]), amounts[0]));
		_swap(amounts, path, to);
		// refund dust eth, if any
		if (msg.value > amounts[0]) TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
	}

	// **** SWAP (supporting fee-on-transfer tokens) ****
	// requires the initial amount to have already been sent to the first pair
	function _swapSupportingFeeOnTransferTokens(address[] calldata path, address _to) internal virtual {
		for (uint256 i; i < path.length - 1; i++) {
			(address input, address output) = (path[i], path[i + 1]);
			(address token0, ) = LFLibrary.sortTokens(input, output);
			ILFPair pair = ILFPair(LFLibrary.pairFor(factory, input, output));
			uint256 amountInput;
			uint256 amountOutput;
			{
				// scope to avoid stack too deep errors
				(uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
				(uint256 reserveInput, uint256 reserveOutput) = input == token0
					? (reserve0, reserve1)
					: (reserve1, reserve0);
				amountInput = IERC20(input).balanceOf(address(pair)) - reserveInput;
				amountOutput = LFLibrary.getAmountOut(amountInput, reserveInput, reserveOutput, getTotalFees());
			}
			(uint256 amount0Out, uint256 amount1Out) = input == token0
				? (uint(0), amountOutput)
				: (amountOutput, uint(0));
			address to = i < path.length - 2 ? LFLibrary.pairFor(factory, output, path[i + 2]) : _to;
			pair.swap(amount0Out, amount1Out, to, new bytes(0));
		}
	}

	function swapExactTokensForTokensSupportingFeeOnTransferTokens(
		uint256 amountIn,
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external virtual override ensure(deadline) {
		TransferHelper.safeTransferFrom(
			path[0],
			msg.sender,
			LFLibrary.pairFor(factory, path[0], path[1]),
			amountIn
		);
		uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
		_swapSupportingFeeOnTransferTokens(path, to);
		if (IERC20(path[path.length - 1]).balanceOf(to) - balanceBefore < amountOutMin)
			revert InsufficientOutputAmount();
	}

	function swapExactETHForTokensSupportingFeeOnTransferTokens(
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable virtual override ensure(deadline) {
		if (path[0] != WETH) revert InvalidPath();
		uint256 amountIn = msg.value;
		IWETH(WETH).deposit{ value: amountIn }();
		assert(IWETH(WETH).transfer(LFLibrary.pairFor(factory, path[0], path[1]), amountIn));
		uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
		_swapSupportingFeeOnTransferTokens(path, to);
		if (IERC20(path[path.length - 1]).balanceOf(to) - balanceBefore < amountOutMin)
			revert InsufficientOutputAmount();
	}

	function swapExactTokensForETHSupportingFeeOnTransferTokens(
		uint256 amountIn,
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external virtual override ensure(deadline) {
		if (path[path.length - 1] != WETH) revert InvalidPath();
		TransferHelper.safeTransferFrom(
			path[0],
			msg.sender,
			LFLibrary.pairFor(factory, path[0], path[1]),
			amountIn
		);
		_swapSupportingFeeOnTransferTokens(path, address(this));
		uint256 amountOut = IERC20(WETH).balanceOf(address(this));
		if (amountOut < amountOutMin) revert InsufficientOutputAmount();
		IWETH(WETH).withdraw(amountOut);
		TransferHelper.safeTransferETH(to, amountOut);
	}

	// **** LIBRARY FUNCTIONS ****
	function quote(
		uint256 amountA,
		uint256 reserveA,
		uint256 reserveB
	) public pure virtual override returns (uint256 amountB) {
		return LFLibrary.quote(amountA, reserveA, reserveB);
	}

	function getAmountOut(
		uint256 amountIn,
		uint256 reserveIn,
		uint256 reserveOut
	) public view virtual override returns (uint256 amountOut) {
		return LFLibrary.getAmountOut(amountIn, reserveIn, reserveOut, getTotalFees());
	}

	function getAmountIn(
		uint256 amountOut,
		uint256 reserveIn,
		uint256 reserveOut
	) public view virtual override returns (uint256 amountIn) {
		return LFLibrary.getAmountIn(amountOut, reserveIn, reserveOut, getTotalFees());
	}

	function getAmountsOut(
		uint256 amountIn,
		address[] calldata path
	) public view virtual override returns (uint[] memory amounts) {
		return LFLibrary.getAmountsOut(factory, amountIn, path, getTotalFees());
	}

	function getAmountsIn(
		uint256 amountOut,
		address[] calldata path
	) public view virtual override returns (uint[] memory amounts) {
		return LFLibrary.getAmountsIn(factory, amountOut, path, getTotalFees());
	}

	function getTotalFees() internal view returns (uint) {
		return ILFSwapFactory(factory).ownerFee() + ILFSwapFactory(factory).lpFee();
	}
}
