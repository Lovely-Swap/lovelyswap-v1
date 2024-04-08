//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./LovelyRouter02.sol";
import "./interfaces/ILovelyTCRouter.sol";
import "./interfaces/ILovelyPair.sol";
import "./libraries/LovelyLibrary.sol";

contract LovelyTCRouter is Ownable, ILovelyTCRouter, LovelyRouter02 {
	uint256 public constant MAX_PARTICIPANTS = 500;
	uint256 private constant DAYS_30 = 30 * 24 * 60 * 60;
	uint256[] private TOTAL_WINNERS = [5, 10, 20, 50];
	uint256[4] private WINNERS = [5, 5, 10, 30];

	Competition[] public competitions;
	mapping(address pair => uint256[] competitions) private pairToCompetitions;
	mapping(address account => uint256[] competitions) private userCompetitions;

	uint256 public competitionFee;

	constructor(
		address _factory,
		address _WETH,
		uint256 _competitionFee
	) LovelyRouter02(_factory, _WETH) Ownable(msg.sender) {
		competitionFee = _competitionFee;
	}

	function competitionsLength() external view returns (uint256) {
		return competitions.length;
	}

	function getParticipantsCount(uint256 competition) external view returns (uint256) {
		return competitions[competition].participants.length;
	}

	function getParticipants(uint256 competition) external view returns (Participant[] memory) {
		return competitions[competition].participants;
	}

	function getParticipantsPaginated(uint256 competition, uint256 start, uint256 limit) external view returns (Participant[] memory) {
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

	function getCompetitionsOfPair(address pair) external view returns (uint[] memory) {
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
	}

	/// @notice Creates a competition
	/// @param start timestamp when the competition starts
	/// @param end timestamp when the competition ends
	/// @param rewardToken a token that will be used to pay rewards
	/// @param rewards an array with rewards for each of 4 rewards tiers of users. <b>These amounts will go to each user of a tier!</b>
	function createCompetition(
		uint256 start,
		uint256 end,
		address rewardToken,
		address competitionToken,
		uint256[] memory rewards,
		address[] memory pairs
	) external payable {
		if (msg.sender != owner()) {
			if(msg.value != competitionFee) revert InvalidFee();
			TransferHelper.safeTransferETH(owner(), msg.value);
		}
		if(start < block.timestamp || end < block.timestamp) revert InvalidRange();
		if(end - start > DAYS_30) revert RangeTooBig();
		if(rewards.length != 4) revert InvalidRewards();
		for (uint256 i = 0; i < pairs.length; i++) {
			address token0 = ILovelyPair(pairs[i]).token0();
			address token1 = ILovelyPair(pairs[i]).token1();
			if(token0 != competitionToken && token1 != competitionToken) revert NotACompetitionToken();
		}
		Competition storage competition = competitions.push();
		competition.start = start;
		competition.end = end;
		competition.rewardToken = rewardToken;
		competition.owner = msg.sender;
		competition.rewards = rewards;
		competition.pairs = pairs;
		competition.competitionToken = competitionToken;
		uint256 totalRewards;
		for (uint256 i = 0; i < rewards.length; i++) {
			totalRewards += rewards[i] * WINNERS[i];
		}
		_feeIn(rewardToken, totalRewards);
		for (uint256 i = 0; i < pairs.length; i++) {
			pairToCompetitions[pairs[i]].push(competitions.length - 1);
		}
		emit CompetitionCreated(competitions.length - 1);
	}

	function register(uint256 competition) external {
		if (competition >= competitions.length) revert NoCompetition();
		if (competitions[competition].registeredUsers[msg.sender]) revert AlreadyRegistered();
		competitions[competition].registeredUsers[msg.sender] = true;
		userCompetitions[msg.sender].push(competition);
	}

	function sumUpCompetition(uint256 competition) external {
		if (competition >= competitions.length) revert NoCompetition();
		if (competitions[competition].sorted) revert AlreadySorted();
		if (block.timestamp <= competitions[competition].end) revert NotEnded();
		competitions[competition].participants = _mergeSort(
			competitions[competition].participants,
			0,
			competitions[competition].participants.length - 1
		);
		competitions[competition].sorted = true;
		emit ReadyForPayouts(competition);
	}

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

	function withdrawRemainings(uint256 competition) external {
		if (competition >= competitions.length) revert NoCompetition();
		if (competitions[competition].end > block.timestamp) revert NotEnded();
		if (competitions[competition].leftoversWithdrawn) revert AlreadyWithdrawn();
		competitions[competition].leftoversWithdrawn = true;
		uint256 winners = competitions[competition].participants.length;
		if (winners >= 50) revert NothingToWithdraw();
		uint256 amount = _getLeftovers(competition);
		TransferHelper.safeTransfer(competitions[competition].rewardToken, competitions[competition].owner, amount);
	}

	// **** SWAP ****
	// requires the initial amount to have already been sent to the first pair
	function _swap(uint[] memory amounts, address[] memory path, address _to) internal virtual override {
		for (uint256 i; i < path.length - 1; i++) {
			(address input, address output) = (path[i], path[i + 1]);
			(address token0, ) = LovelyLibrary.sortTokens(input, output);
			uint256 amountOut = amounts[i + 1];
			(uint256 amount0Out, uint256 amount1Out) = input == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
			address to = i < path.length - 2 ? LovelyLibrary.pairFor(factory, output, path[i + 2]) : _to;
			address pair = LovelyLibrary.pairFor(factory, input, output);
			ILovelyPair(pair).swap(amount0Out, amount1Out, to, new bytes(0));
			//log trades for competitions
			if (pairToCompetitions[pair].length != 0) {
				_logTrade(pair, input, amounts[i], amounts[i + 1]);
			}
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
		TransferHelper.safeTransfer(competitions[competition].rewardToken, participant.user, reward);
	}

	function _feeIn(address token, uint256 amount) internal {
		uint256 balanceBefore = IERC20(token).balanceOf(address(this));
		TransferHelper.safeTransferFrom(token, msg.sender, address(this), amount);
		uint256 balanceAfter = IERC20(token).balanceOf(address(this));
		if (balanceAfter - balanceBefore != amount) revert FeeTokensForbidden();
	}

	function _logTrade(address pair, address input, uint256 valueIn, uint256 valueOut) internal {
		for (uint256 i = 0; i < pairToCompetitions[pair].length; i++) {
			uint256 competitionId = pairToCompetitions[pair][i];
			if (
				block.timestamp >= competitions[competitionId].start &&
				block.timestamp <= competitions[competitionId].end &&
				competitions[competitionId].participantsCount < MAX_PARTICIPANTS &&
				competitions[competitionId].registeredUsers[msg.sender]
			) {
				Competition storage competition = competitions[competitionId];
				uint256 value = input == competition.competitionToken ? valueIn : valueOut;
				uint256 participantId = _getParticipantId(competition);
				competition.participants[participantId].tradeVolume += value;
				competition.totalTradeVolume += value;
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
