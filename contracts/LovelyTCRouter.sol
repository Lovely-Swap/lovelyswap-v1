//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { TransferHelper } from "./libraries/TransferHelper.sol";
import { LovelyLibrary } from "./libraries/LovelyLibrary.sol";
import { ILovelyTCRouter } from "./interfaces/ILovelyTCRouter.sol";
import { ILovelyPair } from "./interfaces/ILovelyPair.sol";
import { IERC20 } from "./interfaces/IERC20.sol";
import { LovelyRouter02 } from "./LovelyRouter02.sol";
import { IRewardsVault } from "./interfaces/IRewardsVault.sol";
import { IRewardsVaultDeployer } from "./interfaces/IRewardsVaultDeployer.sol";
import { ILovelyFactory } from "./interfaces/ILovelyFactory.sol";

contract LovelyTCRouter is Ownable, ILovelyTCRouter, LovelyRouter02 {
	uint256 public immutable maxParticipants;
	address public immutable vaultDeployerAddress;
	uint256 private constant DAYS_30 = 30 * 24 * 60 * 60;
	uint256[] private TOTAL_WINNERS = [5, 10, 20, 50];
	uint256[4] private WINNERS = [5, 5, 10, 30];

	Competition[] public competitions;
	mapping(address pair => uint256[] competitions) private pairToCompetitions;
	mapping(address account => uint256[] competitions) private userCompetitions;

	uint256 public competitionFee;

	/**
	 * @param _factory address of the factory
	 * @param _WETH address of the WETH token
	 * @param _vaultDeployerAddress address of the vault factory
	 * @param _competitionFee fee that will be charged for creating a competition
	 * @param _maxParticipants maximum number of participants in a competition
	 */
	constructor(
		address _factory,
		address _WETH,
		address _vaultDeployerAddress,
		uint256 _competitionFee,
		uint256 _maxParticipants
	) LovelyRouter02(_factory, _WETH) Ownable(msg.sender) {
		competitionFee = _competitionFee;
		maxParticipants = _maxParticipants;
		vaultDeployerAddress = _vaultDeployerAddress;
	}

	function competitionsLength() external view returns (uint256) {
		return competitions.length;
	}

	function getParticipants(uint256 competition) external view returns (Participant[] memory) {
		return competitions[competition].participants;
	}

	/**
	 * @dev Returns the participants of a competition in a paginated way.
	 * @param competition The competition ID.
	 * @param start The start index of the participants array.
	 * @param limit The maximum number of participants to return.
	 * @return The participants array.
	 */

	function getParticipantsPaginated(
		uint256 competition,
		uint256 start,
		uint256 limit
	) external view returns (Participant[] memory) {
		uint256 length = limit;
		if (length > competitions[competition].participants.length - start) {
			length = competitions[competition].participants.length - start;
		}
		Participant[] memory _participants = new Participant[](length);
		for (uint256 i = 0; i < length; i++) {
			_participants[i] = competitions[competition].participants[start + i];
		}
		return _participants;
	}

	function getPairs(uint256 competition) external view returns (address[] memory) {
		return competitions[competition].pairs;
	}

	function getCompetitionsOfPair(address pair) external view returns (uint256[] memory) {
		return pairToCompetitions[pair];
	}

	function getRewards(uint256 competition) external view returns (uint256[] memory) {
		return competitions[competition].rewards;
	}

	function competitionsOf(address account) external view returns (uint256[] memory) {
		return userCompetitions[account];
	}

	function isRegistered(uint256 competition, address account) external view returns (bool) {
		return competitions[competition].registeredUsers[account];
	}

	function setCompetitionFee(uint256 _competitionFee) external onlyOwner {
		competitionFee = _competitionFee;
		emit CompetitionFeeSet(competitionFee);
	}

	/**
	 * @notice This function creates a competition with the given parameters.
	 * @dev This function requires that the sender is the owner of the competition or pays the competition fee.
	 * It requires that the start and end timestamps are in the future, the end is after the start, and the range is not too big.
	 * It requires that the rewards array has exactly 4 elements, the pairs array is not empty, and the competition token is one of the pair tokens.
	 * It creates a new competition with the given parameters and rewards, transfers the rewards to the contract, and logs the competition.
	 * @param start The timestamp when the competition starts.
	 * @param end The timestamp when the competition ends.
	 * @param rewardToken The address of the reward token.
	 * @param competitionToken The address of the competition token.
	 * @param minCompetitionTokenValue The minimum value of the competition token to be considered.
	 * @param rewards The array of rewards for the winners.
	 * @param pairs The array of pairs to be included in the competition.
	 */
	function createCompetition(
		uint256 start,
		uint256 end,
		address rewardToken,
		address competitionToken,
		uint256 minCompetitionTokenValue,
		uint256[] calldata rewards,
		address[] calldata pairs
	) external payable {
		if (msg.sender != owner()) {
			if (msg.value != competitionFee) revert InvalidFee();
			TransferHelper.safeTransferETH(owner(), msg.value);
		}
		if (start < block.timestamp || end < block.timestamp) revert InvalidRange();
		if (end <= start) revert InvalidRange();
		if (end - start > DAYS_30) revert RangeTooBig();
		if (rewards.length != 4) revert InvalidRewards();
		if (pairs.length == 0) revert PairsNotProvided();
		for (uint256 i = 0; i < pairs.length; i++) {
			address token0 = ILovelyPair(pairs[i]).token0();
			address token1 = ILovelyPair(pairs[i]).token1();
			if (ILovelyFactory(factory).getPair(token0, token1) != pairs[i]) revert PairDoesNotExist();
			if (token0 != competitionToken && token1 != competitionToken) revert NotACompetitionToken();
		}
		uint256 totalRewards;
		for (uint256 i = 0; i < rewards.length; i++) {
			if (rewards[i] == 0) revert InvalidRewards();
			totalRewards += rewards[i] * WINNERS[i];
		}
		address vaultAddress = IRewardsVaultDeployer(vaultDeployerAddress).deploy(rewardToken);
		Competition storage competition = competitions.push();
		competition.start = start;
		competition.end = end;
		competition.rewardToken = rewardToken;
		competition.owner = msg.sender;
		competition.rewards = rewards;
		competition.pairs = pairs;
		competition.competitionToken = competitionToken;
		competition.minCompetitionTokenValue = minCompetitionTokenValue;
		competition.rewardsVault = vaultAddress;
		for (uint256 i = 0; i < pairs.length; i++) {
			pairToCompetitions[pairs[i]].push(competitions.length - 1);
		}
		_transferRewardsIn(rewardToken, vaultAddress, totalRewards);
		emit CompetitionCreated(competitions.length - 1);
	}

	/**
	 * @notice This function registers the sender for the given competition.
	 * @dev This function requires that the competition exists and the sender is not already registered.
	 * It registers the sender for the competition and logs the registration.
	 * @param competition The competition ID.
	 */
	function register(uint256 competition) external {
		if (competition >= competitions.length) revert NoCompetition();
		if (competitions[competition].registeredUsers[msg.sender]) revert AlreadyRegistered();
		competitions[competition].registeredUsers[msg.sender] = true;
		userCompetitions[msg.sender].push(competition);
		emit Registered(msg.sender, competition);
	}

	/*
	 * @notice This function sorts the participants of the given competition by their trade volume.
	 * @dev This function requires that the competition exists, is not already sorted, and has ended.
	 * It sorts the participants by their trade volume and logs the competition as ready for payouts.
	 * @param competition The competition ID.
	 */
	function sumUpCompetition(uint256 competition) external {
		if (competition >= competitions.length) revert NoCompetition();
		if (competitions[competition].sorted) revert AlreadySorted();
		if (block.timestamp <= competitions[competition].end) revert NotEnded();
		if (competitions[competition].participants.length > 0) {
			competitions[competition].participants = _mergeSort(
				competitions[competition].participants,
				0,
				competitions[competition].participants.length - 1
			);
		}
		competitions[competition].sorted = true;
		emit ReadyForPayouts(competition);
	}

	function cleanUpCompetitions(uint256 competition) external {
		if (!competitions[competition].sorted) revert NotEnded();
		for (uint256 i = 0; i < competitions[competition].pairs.length; i++) {
			address pair = competitions[competition].pairs[i];
			for (uint256 j = 0; j < pairToCompetitions[pair].length; j++) {
				if (pairToCompetitions[pair][j] == competition) {
					pairToCompetitions[pair][j] = pairToCompetitions[pair][pairToCompetitions[pair].length - 1];
					pairToCompetitions[pair].pop();
					break;
				}
			}
		}
	}

	/*
	 * @notice This function allows the winner to claim their reward.
	 * @dev This function requires that the competition exists, is sorted, and the participant is a winner.
	 * It allows the winner to claim their reward and logs the claim.
	 * @param competition The competition ID.
	 * @param participantAddress An address of the participant
	 */
	function claimByAddress(uint256 competition, address participantAddress) external {
		if (competition >= competitions.length) revert NoCompetition();
		uint256 totalWinners = competitions[competition].participants.length > TOTAL_WINNERS[3]
			? TOTAL_WINNERS[3]
			: competitions[competition].participants.length;
		for (uint256 i = 0; i < totalWinners; i++) {
			if (competitions[competition].participants[i].user == participantAddress) {
				_claim(competition, i);
				return;
			}
		}
		revert NotAWinner();
	}

	function claimById(uint256 competition, uint256 participantId) external {
		_claim(competition, participantId);
	}

	/*
	 * @notice This function allows to withdraw the remaining rewards back to the owner
	 * @dev This function requires that the competition exists, has ended, and the leftovers are not withdrawn.
	 * It allows the owner to withdraw the remaining rewards and logs the withdrawal.
	 * @param competition The competition ID.
	 */
	function withdrawRemainings(uint256 competition) external {
		if (competition >= competitions.length) revert NoCompetition();
		if (competitions[competition].end > block.timestamp) revert NotEnded();
		if (competitions[competition].leftoversWithdrawn) revert AlreadyWithdrawn();
		competitions[competition].leftoversWithdrawn = true;
		uint256 winners = competitions[competition].participants.length;
		if (winners >= 50) revert NothingToWithdraw();
		uint256 amount = _getLeftovers(competition);
		IRewardsVault(competitions[competition].rewardsVault).withdraw(competitions[competition].owner, amount);
		emit Withdrawn(competition);
	}

	function _postTrade(address pair, address input, uint256[] memory amounts, uint256 position) internal override {
		if (pairToCompetitions[pair].length != 0) {
			_logTrade(pair, input, amounts[position], amounts[position + 1]);
		}
	}

	function _getReward(uint256 competition, uint256 participantId) internal view returns (uint256) {
		if (participantId < TOTAL_WINNERS[0]) {
			return competitions[competition].rewards[0];
		} else if (participantId < TOTAL_WINNERS[1]) {
			return competitions[competition].rewards[1];
		} else if (participantId < TOTAL_WINNERS[2]) {
			return competitions[competition].rewards[2];
		} else if (participantId < TOTAL_WINNERS[3]) {
			return competitions[competition].rewards[3];
		}
		revert NotAWinner();
	}

	function _getLeftovers(uint256 competition) internal view returns (uint256) {
		uint256 winners = competitions[competition].participants.length;
		if (winners < TOTAL_WINNERS[0]) {
			return
				((WINNERS[0] - winners) * competitions[competition].rewards[0]) +
				(WINNERS[1] * competitions[competition].rewards[1]) +
				(WINNERS[2] * competitions[competition].rewards[2]) +
				(WINNERS[3] * competitions[competition].rewards[3]);
		} else if (winners < TOTAL_WINNERS[1]) {
			return
				((TOTAL_WINNERS[1] - winners) * competitions[competition].rewards[1]) +
				(WINNERS[2] * competitions[competition].rewards[2]) +
				(WINNERS[3] * competitions[competition].rewards[3]);
		} else if (winners < TOTAL_WINNERS[2]) {
			return
				((TOTAL_WINNERS[2] - winners) * competitions[competition].rewards[2]) +
				(WINNERS[3] * competitions[competition].rewards[3]);
		} else {
			return ((TOTAL_WINNERS[3] - winners) * competitions[competition].rewards[3]);
		}
	}

	function _claim(uint256 competition, uint256 participantId) internal {
		if (!competitions[competition].sorted) revert WinnersNotSelected();
		if (competitions[competition].participants[participantId].claimed) revert AlreadyClaimed();
		Participant storage participant = competitions[competition].participants[participantId];
		participant.claimed = true;
		uint256 reward = _getReward(competition, participantId);
		IRewardsVault(competitions[competition].rewardsVault).withdraw(participant.user, reward);
		emit Claimed(participant.user, competition, reward);
	}

	function _transferRewardsIn(address token, address vaultAddress, uint256 amount) internal {
		uint256 balanceBefore = IERC20(token).balanceOf(vaultAddress);
		TransferHelper.safeTransferFrom(token, msg.sender, vaultAddress, amount);
		uint256 balanceAfter = IERC20(token).balanceOf(vaultAddress);
		if (balanceAfter - balanceBefore != amount) revert FeeTokensForbidden();
	}

	function _logTrade(address pair, address input, uint256 valueIn, uint256 valueOut) internal {
		for (uint256 i = 0; i < pairToCompetitions[pair].length; i++) {
			uint256 competitionId = pairToCompetitions[pair][i];
			if (
				block.timestamp >= competitions[competitionId].start && //withing the timeframe
				block.timestamp <= competitions[competitionId].end && //withing the timeframe
				competitions[competitionId].registeredUsers[msg.sender] && //only registered
				(competitions[competitionId].usersWhoTraded[msg.sender] ||
					competitions[competitionId].participantsCount < maxParticipants) // only not exceeding max participants number.
			) {
				Competition storage competition = competitions[competitionId];
				uint256 value = input == competition.competitionToken ? valueIn : valueOut;
				if (value >= competition.minCompetitionTokenValue) {
					// only if value is over lower limit.
					uint256 participantId = _getParticipantId(competition);
					competition.participants[participantId].tradeVolume += value;
					competition.totalTradeVolume += value;
					emit TradeLogged(msg.sender, competitionId, value);
				}
			}
		}
	}

	function _getParticipantId(Competition storage competition) internal returns (uint256) {
		uint256 participant = competition.participantIds[msg.sender];
		if (competition.usersWhoTraded[msg.sender]) {
			return participant;
		}
		competition.participantIds[msg.sender] = competition.participantsCount++;
		competition.usersWhoTraded[msg.sender] = true;
		Participant storage p = competition.participants.push();
		p.user = msg.sender;
		return competition.participantsCount - 1;
	}

	// Internal merge sort function
	function _mergeSort(Participant[] memory arr, uint256 left, uint256 right) internal returns (Participant[] memory) {
		if (left < right) {
			uint256 middle = left + (right - left) / 2;

			_mergeSort(arr, left, middle);
			_mergeSort(arr, middle + 1, right);

			_merge(arr, left, middle, right);
		}
		return arr;
	}

	// Internal function to merge the sorted halves
	function _merge(Participant[] memory arr, uint256 left, uint256 middle, uint256 right) private {
		uint256 n1 = middle - left + 1;
		uint256 n2 = right - middle;

		Participant[] memory leftArray = new Participant[](n1);
		Participant[] memory rightArray = new Participant[](n2);

		for (uint256 l = 0; l < n1; l++) {
			leftArray[l] = arr[left + l];
		}
		for (uint256 m = 0; m < n2; m++) {
			rightArray[m] = arr[middle + 1 + m];
		}

		uint256 i = 0;
		uint256 j = 0;
		uint256 k = left;

		while (i < n1 && j < n2) {
			if (leftArray[i].tradeVolume <= rightArray[j].tradeVolume) {
				arr[k] = leftArray[i];
				i++;
			} else {
				arr[k] = rightArray[j];
				j++;
			}
			k++;
		}

		while (i < n1) {
			arr[k] = leftArray[i];
			i++;
			k++;
		}

		while (j < n2) {
			arr[k] = rightArray[j];
			j++;
			k++;
		}
	}
}
