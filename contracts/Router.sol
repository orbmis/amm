
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./Fruitswap.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Fruitswap AMM DEX for swapping fruit
 * @author Simon Brown <orbmis@protonmail.com>
 */
contract Router {

    struct Token {
        address tokenAddress;
        string tokenSymbol;
        string tokenName;
    }

    struct LiquidityPool {
        address contractAddress;
        Token tokenA;
        Token tokenB;
    }

    mapping(bytes32 => LiquidityPool) public liquidityPools;

    string[] public tradingPairs;

    event CreateLiquidity(string tradingPairName, bytes32 tradingPairHash);

    function createLiquidityPool(address tokenA, address tokenB) public {
        ERC20 _tokenA = ERC20(tokenA);
        ERC20 _tokenB = ERC20(tokenB);

        string memory tokenAName = _tokenA.name();
        string memory tokenBName = _tokenB.name();
        string memory tokenASymbol = _tokenA.symbol();
        string memory tokenBSymbol = _tokenB.symbol();

        Token memory tokenAInfo = Token(address(_tokenA), _tokenA.symbol(), _tokenA.name());
        Token memory tokenBInfo = Token(address(_tokenB), _tokenA.symbol(), _tokenB.name());

        Fruitswap pool = new Fruitswap(address(_tokenA), address(_tokenB));

        // TODO: sort order of trading pair deterministically
        // to prevent the same pair being added twice
        // e.g. "LINK/UNI" and "UNI/LINK"
        bytes32 tradingPairHash = keccak256(abi.encodePacked(tokenASymbol, tokenBSymbol));
        
        // prevent trading pair from being added if it already exists
        require(liquidityPools[tradingPairHash].contractAddress == address(0), "Trading pair already exists");

        liquidityPools[tradingPairHash] = LiquidityPool(address(pool), tokenAInfo, tokenBInfo);

        string memory tradingPairName = string(abi.encodePacked(tokenAName, "/", tokenBName));

        tradingPairs.push(tradingPairName);

        emit CreateLiquidity(tradingPairName, tradingPairHash);
    }

    function getPoolAddress(bytes32 poolId) view public returns (address contractAddress) {
        LiquidityPool memory liquidityPool = liquidityPools[poolId];

        contractAddress = liquidityPool.contractAddress;
    }

    function getContract(bytes32 poolId) internal view returns (Fruitswap contractInstance) {
        LiquidityPool memory liquidityPool = liquidityPools[poolId];

        contractInstance = Fruitswap(liquidityPool.contractAddress);
    }

    function addLiquidity(bytes32 poolId, uint256 tokenA, uint256 tokenB) public {
        getContract(poolId).addLiquidity(tokenA, tokenB, msg.sender);
    }

    function removeLiquidity(bytes32 poolId, uint256 liquidity) public {
        getContract(poolId).removeLiquidity(liquidity, msg.sender);
    }

    function swap(bytes32 poolId, uint256 amountA, uint256 amountB) public {
        getContract(poolId).swap(amountA, amountB, msg.sender);
    }
}