//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

interface ILFSwapFactory {
	event PairCreated(address indexed token0, address indexed token1, address pair, uint256);
	event TokenAllowed(address indexed token, uint256 indexed activeFrom);

	event FeeToAddressChanged(address indexed account);
	event FeesChanged(uint256 indexed ownerFee, uint256 indexed lpFee);
	event FeeTokenChanged(address indexed tokenAddress);
	event ListingFeeChanged(uint256 indexed price);
	event AdminAccountChanged(address indexed newAdmin);

	struct AllowedToken {
		address creator;
		uint256 activeFrom;
	}

	function feeTo() external view returns (address);

	function feeToSetter() external view returns (address);

	function ownerFee() external view returns (uint256);

	function lpFee() external view returns (uint256);

	function getPair(address tokenA, address tokenB) external view returns (address pair);

	function allPairs(uint256) external view returns (address pair);

	function allPairsLength() external view returns (uint256);

	function createPair(address tokenA, address tokenB, uint256 activeFrom) external returns (address pair);

	function setFeeTo(address) external;

	function setFeeToSetter(address) external;

	error TokenANotWhitelisted();
	error TokenBNotWhitelisted();
	error InvalidActiveFrom();
	error Forbidden();
	error ValidationFailed();
	error ZeroAddress();
	error AlreadyWhitelisted();
	error InvalidPendingPeriod();
	error IdenticalAddresses();
	error PairExists();
}
