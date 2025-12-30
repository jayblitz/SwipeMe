// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TipManager
 * @notice Manages tip payments with automatic fee splitting and creator claiming
 * @dev Deployed on Tempo Testnet for SwipeMe platform
 * 
 * Flow:
 * 1. User approves TipManager to spend their tokens
 * 2. User calls tipCreator() - 5% goes to treasury, 95% accrues to creator
 * 3. Creator calls claim() to withdraw their accumulated earnings
 */
contract TipManager is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public platformFee = 500; // 5% = 500/10000
    
    address public treasury;
    
    mapping(address => mapping(address => uint256)) public creatorBalances;
    mapping(address => uint256) public totalCreatorEarnings;
    mapping(address => uint256) public totalTreasuryEarnings;
    mapping(address => bool) public supportedTokens;

    event TipSent(
        address indexed token,
        address indexed tipper,
        address indexed creator,
        uint256 grossAmount,
        uint256 netAmount,
        uint256 feeAmount,
        string postId
    );
    
    event CreatorClaimed(
        address indexed token,
        address indexed creator,
        uint256 amount
    );
    
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event TokenSupportUpdated(address indexed token, bool supported);

    constructor(address _treasury, address[] memory _initialTokens) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        
        for (uint256 i = 0; i < _initialTokens.length; i++) {
            supportedTokens[_initialTokens[i]] = true;
            emit TokenSupportUpdated(_initialTokens[i], true);
        }
    }

    /**
     * @notice Send a tip to a creator with automatic fee splitting
     * @param token The ERC20 token address
     * @param creator The creator's wallet address
     * @param amount The gross tip amount (before fee deduction)
     * @param postId The post ID being tipped (for event tracking)
     */
    function tipCreator(
        address token,
        address creator,
        uint256 amount,
        string calldata postId
    ) external nonReentrant {
        require(supportedTokens[token], "Token not supported");
        require(creator != address(0), "Invalid creator");
        require(amount > 0, "Amount must be positive");
        require(creator != msg.sender, "Cannot tip yourself");

        uint256 feeAmount = (amount * platformFee) / FEE_DENOMINATOR;
        uint256 netAmount = amount - feeAmount;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        IERC20(token).safeTransfer(treasury, feeAmount);
        
        creatorBalances[token][creator] += netAmount;
        totalCreatorEarnings[token] += netAmount;
        totalTreasuryEarnings[token] += feeAmount;

        emit TipSent(token, msg.sender, creator, amount, netAmount, feeAmount, postId);
    }

    /**
     * @notice Claim accumulated earnings for a specific token
     * @param token The ERC20 token address
     * @param amount The amount to claim (must be <= balance)
     */
    function claim(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        require(creatorBalances[token][msg.sender] >= amount, "Insufficient balance");

        creatorBalances[token][msg.sender] -= amount;
        
        IERC20(token).safeTransfer(msg.sender, amount);

        emit CreatorClaimed(token, msg.sender, amount);
    }

    /**
     * @notice Claim all accumulated earnings for a specific token
     * @param token The ERC20 token address
     */
    function claimAll(address token) external nonReentrant {
        uint256 balance = creatorBalances[token][msg.sender];
        require(balance > 0, "No balance to claim");

        creatorBalances[token][msg.sender] = 0;
        
        IERC20(token).safeTransfer(msg.sender, balance);

        emit CreatorClaimed(token, msg.sender, balance);
    }

    /**
     * @notice Get creator's claimable balance for a token
     * @param token The ERC20 token address
     * @param creator The creator's address
     * @return The claimable balance
     */
    function getCreatorBalance(address token, address creator) external view returns (uint256) {
        return creatorBalances[token][creator];
    }

    /**
     * @notice Update treasury address (owner only)
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
    }

    /**
     * @notice Update platform fee (owner only)
     * @param _fee New fee in basis points (100 = 1%, max 1000 = 10%)
     */
    function setPlatformFee(uint256 _fee) external onlyOwner {
        require(_fee <= 1000, "Fee too high"); // Max 10%
        uint256 oldFee = platformFee;
        platformFee = _fee;
        emit FeeUpdated(oldFee, _fee);
    }

    /**
     * @notice Add or remove token support (owner only)
     * @param token Token address
     * @param supported Whether the token is supported
     */
    function setTokenSupport(address token, bool supported) external onlyOwner {
        supportedTokens[token] = supported;
        emit TokenSupportUpdated(token, supported);
    }

    /**
     * @notice Emergency withdraw stuck tokens (owner only)
     * @param token Token address
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(to, amount);
    }
}
