// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Testnet-only VastMind Coin prototype. Never deploy this faucet contract to mainnet.
contract VastMindCoinTestnet is ERC20, Ownable {
    uint256 public constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;
    uint256 public constant CLAIM_AMOUNT = 100 * 10 ** 18;
    uint256 public constant CLAIM_COOLDOWN = 1 days;

    mapping(address account => uint256 timestamp) public lastClaimAt;

    event TestTokensClaimed(
        address indexed account,
        uint256 amount,
        uint256 nextClaimAt
    );

    constructor() ERC20("VastMind Coin", "VMC") Ownable(msg.sender) {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    /// @notice Gives a test-only amount to a wallet once per cooldown period.
    /// @dev Claiming still requires Sepolia test ETH for transaction gas.
    function claimTestTokens() external {
        uint256 lastClaim = lastClaimAt[msg.sender];
        require(
            lastClaim == 0 || block.timestamp >= lastClaim + CLAIM_COOLDOWN,
            "Claim cooldown active"
        );

        lastClaimAt[msg.sender] = block.timestamp;
        _mint(msg.sender, CLAIM_AMOUNT);
        emit TestTokensClaimed(
            msg.sender,
            CLAIM_AMOUNT,
            block.timestamp + CLAIM_COOLDOWN
        );
    }
}
