//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import "../interfaces/ILovelyPair.sol";

library LovelyLibrary {
	error IdenticalAddresses();
	error ZeroAddress();
	error InsufficientAmount();
	error InsufficientInputAmount();
	error InsufficientOutputAmount();
	error InsufficientLiquidity();
	error InvalidPath();

	// returns sorted token addresses, used to handle return values from pairs sorted in this order
	function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
		if (tokenA == tokenB) revert IdenticalAddresses();
		(token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
		if (token0 == address(0)) revert ZeroAddress();
	}

	// calculates the CREATE2 address for a pair without making any external calls
	function pairFor(address factory, address tokenA, address tokenB) internal pure returns (address pair) {
		(address token0, address token1) = sortTokens(tokenA, tokenB);
		pair = address(
			uint160(
				uint(
					keccak256(
						abi.encodePacked(
							hex"ff",
							factory,
							keccak256(abi.encodePacked(token0, token1)),
							hex"ad3026623d8747f3e606ae74d552678f8adf779f181a2e08c56468f553114e2b"
						)
					)
				)
			)
		);
	}

	// fetches and sorts the reserves for a pair
	function getReserves(
		address factory,
		address tokenA,
		address tokenB
	) internal view returns (uint256 reserveA, uint256 reserveB) {
		(address token0, ) = sortTokens(tokenA, tokenB);
		(uint112 reserve0, uint112 reserve1, ) = ILovelyPair(pairFor(factory, tokenA, tokenB)).getReserves();
		(reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
	}

	// given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
	function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) internal pure returns (uint256 amountB) {
		if (amountA == 0) revert InsufficientAmount();
		if (reserveA == 0 || reserveB == 0) revert InsufficientLiquidity();
		amountB = (amountA * reserveB) / reserveA;
	}

	// given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
	function getAmountOut(
		uint256 amountIn,
		uint256 reserveIn,
		uint256 reserveOut,
		uint256 totalFee
	) internal pure returns (uint256 amountOut) {
		if (amountIn == 0) revert InsufficientInputAmount();
		if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();
		uint256 amountInWithFee = amountIn * (10000 - totalFee);
		uint256 numerator = amountInWithFee * reserveOut;
		uint256 denominator = (reserveIn * 10000) + amountInWithFee;
		amountOut = numerator / denominator;
	}

	// given an output amount of an asset and pair reserves, returns a required input amount of the other asset
	function getAmountIn(
		uint256 amountOut,
		uint256 reserveIn,
		uint256 reserveOut,
		uint256 totalFee
	) internal pure returns (uint256 amountIn) {
		if (amountOut == 0) revert InsufficientOutputAmount();
		if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();
		uint256 numerator = reserveIn * amountOut * 10000;
		uint256 denominator = (reserveOut - amountOut) * (10000 - totalFee);
		amountIn = (numerator / denominator) + 1;
	}

	// performs chained getAmountOut calculations on any number of pairs
	function getAmountsOut(
		address factory,
		uint256 amountIn,
		address[] memory path,
		uint256 totalFee
	) internal view returns (uint[] memory amounts) {
		if (path.length < 2) revert InvalidPath();
		amounts = new uint[](path.length);
		amounts[0] = amountIn;
		for (uint256 i; i < path.length - 1; i++) {
			(uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i], path[i + 1]);
			amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut, totalFee);
		}
	}

	// performs chained getAmountIn calculations on any number of pairs
	function getAmountsIn(
		address factory,
		uint256 amountOut,
		address[] memory path,
		uint256 totalFee
	) internal view returns (uint[] memory amounts) {
		if (path.length < 2) revert InvalidPath();
		amounts = new uint[](path.length);
		amounts[amounts.length - 1] = amountOut;
		for (uint256 i = path.length - 1; i > 0; i--) {
			(uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i - 1], path[i]);
			amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut, totalFee);
		}
	}
}
