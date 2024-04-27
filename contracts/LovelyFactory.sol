//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import { ILovelyFactory } from "./interfaces/ILovelyFactory.sol";
import { TransferHelper } from "./libraries/TransferHelper.sol";
import { ILovelyPair, LovelyPair } from "./LovelyPair.sol";

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

	/**
	 * @dev Ensures that the given tokens are allowed and validation conditions on `activeFrom` date are met.
	 * @param tokenA First token to be checked.
	 * @param tokenB Second token to be checked.
	 * @param activeFrom The timestamp from when the tokens are supposed to be active.
	 * The function reverts if
	 * - either of the tokens are not whitelisted,
	 * - if the activeFrom date is invalid,
	 * - if the sender is not the creator of the token and the token's activeFrom date is still in the future.
	 */
	modifier valid(
		address tokenA,
		address tokenB,
		uint256 activeFrom
	) {
		require(allowlists[tokenA].creator != address(0), "Lovely Swap: TOKEN_A_NOT_WHITELISTED");
		require(allowlists[tokenB].creator != address(0), "Lovely Swap: TOKEN_B_NOT_WHITELISTED");
		require(activeFrom <= allowlists[tokenA].activeFrom || activeFrom <= allowlists[tokenB].activeFrom ,
			"Lovely Swap: INVALID_ACTIVE_FROM");
		if (activeFrom < allowlists[tokenA].activeFrom) {
			require(msg.sender == allowlists[tokenA].creator, "Lovely Swap: FORBIDDEN");
		}
		if (activeFrom < allowlists[tokenB].activeFrom) {
			require(msg.sender == allowlists[tokenB].creator, "Lovely Swap: FORBIDDEN");
		}
		if (allowlists[tokenA].activeFrom > block.timestamp) {
			require(msg.sender == allowlists[tokenA].creator, "Lovely Swap: FORBIDDEN");
			require(activeFrom <= allowlists[tokenA].activeFrom, "Lovely Swap: INVALID_ACTIVE_FROM");
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
		require(_feeToSetter != address(0), "Lovely Swap: VALIDATION");
		require(_feeToken != address(0), "Lovely Swap: VALIDATION");
		feeToSetter = _feeToSetter;
		feeToken = _feeToken;
		ownerFee = _ownerFee;
		lpFee = _lpFee;
	}

	/**
	 * @notice This function allows a token to be listed and active after 'activeFrom' timestamp.
	 *         The function makes sure that the token is not already listed and the activeFrom timestamp is under the
	 *         maximum allowed. If not executed by feeSetter, a fee in 'feeToken' is deducted.
	 * @dev The token address and activeFrom timestamp are captured in the allowlists mapping for later validations and checks.
	 * @param token The address of the token to be listed.
	 * @param activeFrom The timestamp from which the token becomes active.
	 */
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

	/**
	 * @notice This function returns the length of all pairs.
	 * @return The length of all pairs.
	 */
	function allPairsLength() external view returns (uint) {
		return allPairs.length;
	}

	/**
	 * @notice This function returns the length of allowed tokens.
	 * @return The length of allowed tokens array.
	 */
	function allowedTokensLength() external view returns (uint) {
		return allowedTokens.length;
	}

	/**
	 * @notice This function returns the list of all pairs.
	 * @return An array of all pairs.
	 */
	function getAllPairs() public view returns (address[] memory) {
		return allPairs;
	}

	/**
	 * @notice This function returns the list of allowed tokens.
	 * @return An array of allowed tokens.
	 */
	function getAllowedTokens() public view returns (address[] memory) {
		return allowedTokens;
	}

	/**
	 * @notice Creates a pair of given two tokens.
	 * @dev This function requires that the tokens are not identical, addresses are not zero, and pair of them
	 * does not already exist.
	 * It creates a new `LovelyPair` contract for the pair and initializes it with the token addresses and activeFrom timestamp.
	 * The function emits the `PairCreated` event by passing the pair's addresses and length of allPairs array.
	 * @param tokenA The address of the first token of the pair.
	 * @param tokenB The address of the second token of the pair.
	 * @param activeFrom The timestamp from when the pair should be active.
	 * @return pair address.
	 */
	function createPair(
		address tokenA,
		address tokenB,
		uint256 activeFrom
	) external valid(tokenA, tokenB, activeFrom) returns (address pair) {
		require(tokenA != tokenB, "Lovely Swap: IDENTICAL_ADDRESSES");
		(address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
		require(token0 != address(0), "Lovely Swap: ZERO_ADDRESS");
		require(getPair[token0][token1] == address(0), "Lovely Swap: PAIR_EXISTS"); // single check is sufficient
		bytes32 salt = keccak256(abi.encodePacked(token0, token1));
		pair = address(new LovelyPair{ salt: salt }());
		ILovelyPair(pair).initialize(token0, token1, msg.sender, activeFrom);
		getPair[token0][token1] = pair;
		getPair[token1][token0] = pair; // populate mapping in the reverse direction
		allPairs.push(pair);
		emit PairCreated(token0, token1, pair, allPairs.length);
	}

	/**
	 * @notice This function allows the owner to update the feeTo address.
	 * @dev The function requires that the sender is the feeToSetter.
	 * @param _feeTo The address to which the fees will be sent.
	 */
	function setFeeTo(address _feeTo) external {
		require(msg.sender == feeToSetter, "Lovely Swap: FORBIDDEN");
		feeTo = _feeTo;
	}

	/**
	 * @notice This function allows the owner to update the trading fees.
	 * @dev The function requires that the sender is the feeToSetter and the fees are less than or equal to 0.2%.
	 * @param _ownerFee The fee that will go to the dex owner: 1 is 0.01%.
	 * @param _lpFee The fee that will go to the liquidity pool: 1 is 0.01%.
	 */
	function setTradingFees(uint256 _ownerFee, uint256 _lpFee) external {
		require(msg.sender == feeToSetter, "Lovely Swap: FORBIDDEN");
		require(_ownerFee <= 20, "Lovely Swap: VALIDATION"); // 0.2% max
		require(_lpFee <= 20, "Lovely Swap: VALIDATION"); // 0.2% max

		ownerFee = _ownerFee;
		lpFee = _lpFee;
	}

	/**
	 * @notice This function allows the owner to update the feeToken address.
	 * @dev The function requires that the sender is the feeToSetter and the feeToken address is not zero.
	 * @param _feeToken The address of the token that will be used to charge fees for other tokens listing.
	 */
	function setFeeToken(address _feeToken) external {
		require(msg.sender == feeToSetter, "Lovely Swap: FORBIDDEN");
		require(_feeToken != address(0), "Lovely Swap: VALIDATION");
		feeToken = _feeToken;
	}

	/**
	 * @notice This function allows the owner to update the listing fee.
	 * @dev The function requires that the sender is the feeToSetter.
	 * @param _listingFee The fee that will be charged for listing a token.
	 */
	function setListingFee(uint256 _listingFee) external {
		require(msg.sender == feeToSetter, "Lovely Swap: FORBIDDEN");
		listingFee = _listingFee;
	}

	/**
	 * @notice This function allows the owner to update the feeToSetter address.
	 * @dev The function requires that the sender is the feeToSetter and the feeToSetter address is not zero.
	 * @param _feeToSetter The address where permissions to update fees will be granted.
	 */
	function setFeeToSetter(address _feeToSetter) external {
		require(msg.sender == feeToSetter, "Lovely Swap: FORBIDDEN");
		require(_feeToSetter != address(0), "Lovely Swap: VALIDATION");
		feeToSetter = _feeToSetter;
	}
}
