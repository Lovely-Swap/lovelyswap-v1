//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import "./ILovelyRouter02.sol";

interface ILovelyTCRouter is ILovelyRouter02 {
	event CompetitionCreated(uint256 indexed id);
	event Registered(address indexed account, uint256 indexed id);
	event ReadyForPayouts(uint256 indexed id);
	event TradeLogged(address indexed account, uint256 indexed competiotion, uint volume);
	event Claimed(address indexed account, uint256 indexed competition, uint256 reward);
	event Withdrawn(uint256 indexed competition);
	event CompetitionFeeSet(uint256 indexed fee);

	struct Participant {
		address user;
		uint256 tradeVolume;
		bool claimed;
	}

	struct Competition {
		uint256 participantsCount;
		uint256 start;
		uint256 end;
		uint256 totalTradeVolume;
		address rewardToken;
		address owner;
		bool leftoversWithdrawn;
		uint256[] rewards;
		mapping(address user => bool registered) registeredUsers;
		mapping(address user => uint256 participant) participantIds;
		mapping(address user => bool participant) usersWhoTraded;
		address[] pairs;
		Participant[] participants;
		bool sorted;
		address competitionToken;
		uint256 minCompetitionTokenValue;
		address rewardsVault;
	}

	error NoCompetition();
	error WinnersNotSelected();
	error AlreadyClaimed();
	error FeeTokensForbidden();
	error NotAWinner();
	error NotEnded();
	error AlreadyWithdrawn();
	error NothingToWithdraw();
	error AlreadyRegistered();
	error AlreadySorted();
	error InvalidRewards();
	error PairsNotProvided();
	error InvalidFee();
	error InvalidRange();
	error RangeTooBig();
	error NotACompetitionToken();
	error PairDoesNotExist();
}
