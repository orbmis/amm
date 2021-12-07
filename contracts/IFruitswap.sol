// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IFruitswap {
    struct Token {
        address tokenAddress;
        string tokenSymbol;
        string tokenName;
    }

    /**
     * Provides information on the trading pair for this exchange,
     * including contract address, symbol and name for each token.
     *
     * TODO: move to constructor and store in state to reduce has fees.
     */
    function getExchangeInfo() external view returns (
        Token memory tokenA,
        Token memory tokenB
    );
    
    /**
     * Adds liquidity to the pool. The amount of each token must maintain
     * the correct ratio according to the ratio established in the pool.
     * Once the tokens have been transferred from the sender's address
     * to the smart contract, the sender has a respective amount of LP
     * tokens minted to their address.
     *
     * @param tokenA The amount of the first token to add to the pool.
     * @param tokenB The amount of the second token to add to the pool.
     * @param sender The sender's address.
     */
    function addLiquidity(uint256 tokenA, uint256 tokenB, address sender) external;
    
    /**
     * Removes liquidity from the pool. The sender sends a certain amount of LP tokens
     * and receives a respective amount of each token in the token pair.
     * The specified amount of LP tokens are then burned from the user's address.
     *
     * @param liquidity The amount LP tokens to swap for each token in the trading pool.
     * @param sender The sender's address.
     */
    function removeLiquidity(uint256 liquidity, address sender) external;
    
    /**
     * Swaps an amount of one token for the respective amount of the other token in the pool.
     * Sender specifies an amount of one token and specifies zero for the other.
     * If neither (or both) of each token is specified as zero, transaction reverts.
     * There must be enough liquidity in the pool for the amount the sender sepcifies,
     * and the user must hold that amount of the respective token at their address.
     *
     * @param amountA The amount of tokenA that the sender want to swap, (or zero).
     * @param amountB The amount of tokenB that the sender want to swap, (or zero).
     * @param sender The sender's address.
     */
    function swap(uint256 amountA, uint256 amountB, address sender) external;
}