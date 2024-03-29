//SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import "./ILovelyRouter02.sol";

interface ILovelyTCRouter is ILovelyRouter02 {
	event CompetitionCreated(uint256 indexed id);
	event ReadyForPayouts(uint256 indexed id);
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
		address[] pairs;
		Participant[] participants;
		bool sorted;
	}
}
