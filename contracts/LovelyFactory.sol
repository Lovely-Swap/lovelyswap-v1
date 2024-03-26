//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import "./libraries/TransferHelper.sol";
import "./interfaces/ILovelyFactory.sol";
import "./interfaces/IERC20.sol";
import "./LovelyPair.sol";

contract LovelyFactory is ILovelyFactory {
	uint256 public constant MAX_ACTIVE_FROM = 7 * 24 * 60 * 60;
	address public feeTo;
	address public feeToSetter;
	address public feeToken;
	uint256 public listingFee;
	uint256 public ownerFee; //1 is 0.01%
	uint256 public lpFee; //1 is 0.01%

	mapping(address token => AllowedToken allowedToken) public allowlists;
	mapping(address => mapping(address => address)) public getPair;
	address[] public allPairs;
	address[] public allowedTokens;

	modifier valid(
		address tokenA,
		address tokenB,
		uint256 activeFrom
	) {
		require(allowlists[tokenA].creator != address(0), "Lovely Swap: TOKEN_A_NOT_WHITELISTED");
		require(allowlists[tokenB].creator != address(0), "Lovely Swap: TOKEN_B_NOT_WHITELISTED");
		if (allowlists[tokenA].activeFrom > block.timestamp) {
			require(msg.sender == allowlists[tokenA].creator, "Lovely Swap: FORBIDDEN");
			require(activeFrom <= allowlists[tokenA].activeFrom, "LOVELY: INVALID_ACTIVE_FROM");
		}
		if (allowlists[tokenB].activeFrom > block.timestamp) {
			require(msg.sender == allowlists[tokenB].creator, "Lovely Swap: FORBIDDEN");
			require(activeFrom <= allowlists[tokenB].activeFrom, "Lovely Swap: INVALID_ACTIVE_FROM");
		}
		_;
	}

	/// @param _feeToSetter an address where permissions to update fees will be granted
	/// @param _feeToken a token that will be used to charge fees for other tokens listing
	/// @param _ownerFee fees that will go to the dex owner: 1 is 0.01%
	/// @param _lpFee fees that will go to the liquidity pool: 1 is 0.01%

	constructor(address _feeToSetter, address _feeToken, uint256 _ownerFee, uint256 _lpFee) {
		require(_ownerFee <= 20, "Lovely Swap: VALIDATION"); // 0.2% max
		require(_lpFee <= 20, "Lovely Swap: VALIDATION"); // 0.2% max
		feeToSetter = _feeToSetter;
		feeToken = _feeToken;
		ownerFee = _ownerFee;
		lpFee = _lpFee;
	}

	function allowToken(address token, uint256 activeFrom) external {
		require(allowlists[token].creator == address(0), "Lovely Swap: ALREADY_WHITELISTED");
		require(block.timestamp + MAX_ACTIVE_FROM >= activeFrom, "Lovely Swap: LONG_PENDING_PERIOD");
		if (msg.sender != feeToSetter) {
			TransferHelper.safeTransferFrom(feeToken, msg.sender, feeTo, listingFee); //Owner don't pay fees
		}
		allowlists[token].activeFrom = activeFrom;
		allowlists[token].creator = msg.sender;
		allowedTokens.push(token);
		emit TokenAllowed(token, activeFrom);
	}

	function allPairsLength() external view returns (uint) {
		return allPairs.length;
	}

	function allowedTokensLength() external view returns (uint) {
		return allowedTokens.length;
	}

	function getAllPairs() public view returns (address[] memory) {
		return allPairs;
	}

	function getAllowedTokens() public view returns (address[] memory) {
		return allowedTokens;
	}

	function createPair(
		address tokenA,
		address tokenB,
		uint256 activeFrom
	) external valid(tokenA, tokenB, activeFrom) returns (address pair) {
		require(tokenA != tokenB, "Lovely Swap: IDENTICAL_ADDRESSES");
		(address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
		require(token0 != address(0), "Lovely Swap: ZERO_ADDRESS");
		require(getPair[token0][token1] == address(0), "Lovely Swap: PAIR_EXISTS"); // single check is sufficient
		bytes memory bytecode = type(LovelyPair).creationCode;
		bytes32 salt = keccak256(abi.encodePacked(token0, token1));
		assembly {
			pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
		}
		ILovelyPair(pair).initialize(token0, token1, msg.sender, activeFrom);
		getPair[token0][token1] = pair;
		getPair[token1][token0] = pair; // populate mapping in the reverse direction
		allPairs.push(pair);
		emit PairCreated(token0, token1, pair, allPairs.length);
	}

	function setFeeTo(address _feeTo) external {
		require(msg.sender == feeToSetter, "Lovely Swap: FORBIDDEN");
		feeTo = _feeTo;
	}

	function setTradingFees(uint256 _ownerFee, uint256 _lpFee) external {
		require(msg.sender == feeToSetter, "Lovely Swap: FORBIDDEN");
		require(_ownerFee <= 20, "Lovely Swap: VALIDATION"); // 0.2% max
		require(_lpFee <= 20, "Lovely Swap: VALIDATION"); // 0.2% max

		ownerFee = _ownerFee;
		lpFee = _lpFee;
	}

	function setFeeToken(address _feeToken) external {
		require(msg.sender == feeToSetter, "Lovely Swap: FORBIDDEN");
		feeToken = _feeToken;
	}

	function setListingFee(uint256 _listingFee) external {
		require(msg.sender == feeToSetter, "Lovely Swap: FORBIDDEN");
		listingFee = _listingFee;
	}

	function setFeeToSetter(address _feeToSetter) external {
		require(msg.sender == feeToSetter, "Lovely Swap: FORBIDDEN");
		feeToSetter = _feeToSetter;
	}
}
