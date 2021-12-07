// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./IFruitswap.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

// https://medium.com/coinmonks/programming-defi-uniswap-part-2-13a6428bf892
// https://ethereum.org/en/developers/tutorials/uniswap-v2-annotated-code/#uniswapv2pair

/**
 * @title Fruitswap AMM DEX for swapping fruit
 * @author Simon Brown <orbmis@protonmail.com>
 */
contract FruitswapBase is IFruitswap, ERC20 {
    using Math for uint256;

    address ownAddress;

    address public router;
    
    ERC20 _tokenA;
    ERC20 _tokenB;
    
    uint256 public tokenReserveA;
    uint256 public tokenReserveB;
    uint256 public constantProduct;
    
    /**
     * To avoid cases of division by zero, there is a minimum number of
     * LP tokens that always exist, but that are owned by account zero.
     * For the first liquidity provider for the pool, this amount is
     * subtracted from the LP tokens received and left in the pool forever.
     */
    uint16 public constant MINIMUM_LIQUIDITY = 1000;

    event RatioCheck(uint256 currentRatio, uint256 newRatio, uint256 tokenA, uint256 tokenB);
    
    event Swap(address indexed initiator, uint256 amountA, uint256 amountB);

    event AddLiquidity(
        address indexed initiator,
        uint indexed tokenA,
        uint indexed tokenB,
        uint tokenReserveA,
        uint tokenReserveB,
        uint amountA,
        uint amountB,
        uint liquidity,
        uint totalSupply
    );

    event RemoveLiquidity(
        address indexed initiator,
        uint256 balanceA,
        uint256 balanceB,
        uint256 amountA,
        uint256 amountB,
        uint256 _totalSupply,
        uint256 liquidity
    );

    /**
     * @dev Allows execution by router contract only.
     */
    modifier onlyRouter {
        require(msg.sender == router, "Can only be called by router");
        _;
    }
    
    constructor(address tokenA, address tokenB) ERC20("Fruit Swap", "FRT") {
        _tokenA = ERC20(tokenA);
        _tokenB = ERC20(tokenB);

        ownAddress = address(this);
        router = msg.sender;
    }

    /**
     * Provides information on the trading pair for this exchange,
     * including contract address, symbol and name for each token.
     *
     * TODO: move to constructor and store in state to reduce has fees.
     */
    function getExchangeInfo() public view returns (
        Token memory tokenA,
        Token memory tokenB
    ) {
        tokenA = Token(address(_tokenA), _tokenA.symbol(), _tokenA.name());
        tokenB = Token(address(_tokenB), _tokenB.symbol(), _tokenB.name());
    }
    
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
    function addLiquidity(uint256 tokenA, uint256 tokenB, address sender) public onlyRouter {
        // TODO: implement lock to prevent re-entrancy attack using bogus erc20 contract
        _tokenA.transferFrom(sender, ownAddress, tokenA);
        _tokenB.transferFrom(sender, ownAddress, tokenB);
        
        tokenReserveA += tokenA;
        tokenReserveB += tokenB;
        
        uint256 liquidity = 0;
        
        if (constantProduct == 0) {
            constantProduct = tokenA * tokenB;
        
            liquidity = sqrt(constantProduct);
            
            liquidity = liquidity - MINIMUM_LIQUIDITY;
        } else {
            uint256 currentRatio = (tokenReserveA * (10 ** 18)) / tokenReserveB;
            uint256 newRatio = (tokenA * (10 ** 18)) / tokenB;

            require(newRatio == currentRatio, "Incorrect liquidity ratio");

            uint256 _totalSupply = totalSupply();
            
            uint256 amountLPTokensA = (tokenA * _totalSupply) / tokenReserveA;
            uint256 amountLPTokensB = (tokenB * _totalSupply) / tokenReserveB;
            
            liquidity = Math.min(amountLPTokensA, amountLPTokensB);

            constantProduct = tokenA * tokenB;

            emit AddLiquidity(sender, tokenA, tokenB, tokenReserveA, tokenReserveB, amountLPTokensA, amountLPTokensB, liquidity, _totalSupply);
        }
        
        _mint(sender, liquidity);
    }
    
    /**
     * Removes liquidity from the pool. The sender sends a certain amount of LP tokens
     * and receives a respective amount of each token in the token pair.
     * The specified amount of LP tokens are then burned from the user's address.
     *
     * @param liquidity The amount LP tokens to swap for each token in the trading pool.
     * @param sender The sender's address.
     */
    function removeLiquidity(uint256 liquidity, address sender) public onlyRouter {
        require(liquidity <= balanceOf(sender), "Withdraw amount exceeds balance of LP Tokens");

        uint256 balanceA = _tokenA.balanceOf(ownAddress);
        uint256 balanceB = _tokenB.balanceOf(ownAddress);
        uint256 _totalSupply = totalSupply();
        
        uint256 amountA = (liquidity * balanceA) / _totalSupply;
        uint256 amountB = (liquidity * balanceB) / _totalSupply;
        
        require(amountA > 0 && amountB > 0, "Insufficient Liquidity");

        emit RemoveLiquidity(
            sender,
            balanceA,
            balanceB,
            amountA,
            amountB,
            _totalSupply,
            liquidity
        );
        
        _tokenA.transfer(sender, amountA);
        _tokenB.transfer(sender, amountB);
        
        _burn(sender, liquidity);
    }
    
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
    function swap(uint256 amountA, uint256 amountB, address sender) public onlyRouter {
        require(amountA == 0 || amountB == 0, "Specify the amount to swap for one token only");
        require(amountA < tokenReserveA && amountB < tokenReserveB, "Insufficient liquidity for trade");
        
        if (amountA > 0) {
            require(_tokenA.balanceOf(sender) >= amountA, "Insufficient balance for swap");

            amountB = tokenReserveB - (constantProduct / (tokenReserveA + amountA));
            tokenReserveA += amountA;
            tokenReserveB -= amountB;
            _tokenA.transferFrom(sender, ownAddress, amountA);
            _tokenB.transfer(sender, amountB);
        } else if (amountB > 0) {
            require(_tokenB.balanceOf(sender) >= amountB, "Insufficient balance for swap");

            amountA = tokenReserveA - (constantProduct / (tokenReserveB + amountB));
            tokenReserveA -= amountA;
            tokenReserveB += amountB;
            _tokenB.transferFrom(sender, ownAddress, amountB);
            _tokenA.transfer(sender, amountA);
        }
        
        emit Swap(sender, amountA, amountB);
    }
    
    /**
     * Calculates the square root of a given value using Newton's iteration.
     *
     * @dev https://ethereum.stackexchange.com/a/87713/8295
     * @param y The value to calculate the square root for.
     * @return z The square root of the specified value.
     */
    function sqrt(uint y) internal pure returns (uint z) {
        if (y > 3) {
            z = y;
            
            uint x = y / 2 + 1;
            
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}

contract Fruitswap is FruitswapBase {
    constructor(address tokenA, address tokenB) FruitswapBase(tokenA, tokenB) {}
}