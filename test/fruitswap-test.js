const { expect } = require('chai')
const { toWei, sqrt } = require('./test-helper')

describe('Fruitswap', () => {
  let apples, oranges, fruitswap, ownerAddress

  beforeEach(async () => {
    const [ owner ] = await ethers.getSigners();

    ownerAddress = owner.address

    const Token = await hre.ethers.getContractFactory('Token')

    apples = await Token.deploy(toWei(10000n), 'Apples', 'APPLE').then(c => c.deployed())
    oranges = await Token.deploy(toWei(10000n), 'Oranges', 'ORANGE').then(c => c.deployed())

    fruitswap = await hre.ethers.getContractFactory('Fruitswap')
      .then(c => c.deploy(apples.address, oranges.address))
      .then(c => c.deployed())

    await apples.approve(fruitswap.address, toWei(5000)).then(tx => tx.wait())
    await oranges.approve(fruitswap.address, toWei(5000)).then(tx => tx.wait())
  })

  it('initiates the contract correctly', async () => {
    const details = await fruitswap.getExchangeInfo();

    expect(details.tokenA.tokenAddress).to.equal(apples.address)
    expect(details.tokenA.tokenName).to.equal('Apples')
    expect(details.tokenA.tokenSymbol).to.equal('APPLE')

    expect(details.tokenB.tokenAddress).to.equal(oranges.address)
    expect(details.tokenB.tokenName).to.equal('Oranges')
    expect(details.tokenB.tokenSymbol).to.equal('ORANGE')
  })

  it('correctly calculates liquidity on initiation of pool', async () => {
    expect(await fruitswap.totalSupply().then(n => n.toString())).to.equal('0')

    const addLiquidityTx = await fruitswap.addLiquidity(toWei(300), toWei(200), ownerAddress)

    addLiquidityTx.wait()

    const tokenReserveA = await fruitswap.tokenReserveA()
    const tokenReserveB = await fruitswap.tokenReserveB()
    const totalSupply = await fruitswap.totalSupply()
    const balance = await fruitswap.balanceOf(ownerAddress)

    const expectedLiquidity = sqrt(toWei(300) * toWei(200)) - 1000n

    expect(tokenReserveA).to.equal(toWei(300))
    expect(tokenReserveB).to.equal(toWei(200))
    expect(totalSupply).to.equal(expectedLiquidity)
    expect(balance).to.equal(expectedLiquidity)

    // TODO: test enforce ratio
  })

  it('correctly calculates liquidity on existing pool', async () => {
    expect(await fruitswap.totalSupply().then(n => n.toString())).to.equal('0')

    let addLiquidityTx = await fruitswap.addLiquidity(toWei(300), toWei(200), ownerAddress)

    addLiquidityTx.wait()

    let initialTotalSupply = sqrt(toWei(300) * toWei(200)) - 1000n

    expect(await fruitswap.totalSupply().then(n => n.toString())).to.equal(initialTotalSupply.toString())

    addLiquidityTx = await fruitswap.addLiquidity(toWei(90), toWei(60), ownerAddress)

    const tx = await addLiquidityTx.wait()

    const amountLPTokensA = (toWei(90) * initialTotalSupply) / toWei(390)
    const amountLPTokensB = (toWei(60) * initialTotalSupply) / toWei(260)
    const liquidity = amountLPTokensA < amountLPTokensB ? amountLPTokensA : amountLPTokensB
    const newTotalSupply = initialTotalSupply + liquidity

    const args = tx.events[4].args

    expect(args.tokenA).to.equal(toWei(90))
    expect(args.tokenB).to.equal(toWei(60))
    expect(args.tokenReserveA).to.equal(toWei(390))
    expect(args.tokenReserveB).to.equal(toWei(260))
    expect(args.amountA).to.equal(amountLPTokensA)
    expect(args.amountB).to.equal(amountLPTokensB)
    expect(args.liquidity).to.equal(liquidity)
    expect(args.totalSupply).to.equal(initialTotalSupply)

    expect(await fruitswap.tokenReserveA()).to.equal(toWei(390))
    expect(await fruitswap.tokenReserveB()).to.equal(toWei(260))
    expect(await fruitswap.totalSupply()).to.equal(newTotalSupply)
  })

  it('reverts transaction when liquidity is added in wrong ratio', async () => {
    await fruitswap.addLiquidity(toWei(300), toWei(200), ownerAddress)
      .then(tx => tx.wait())

    await expect(fruitswap.addLiquidity(toWei(60), toWei(50), ownerAddress))
      .to.be.revertedWith('Incorrect liquidity ratio');
  })

  // https://ethereum.org/en/developers/tutorials/uniswap-v2-annotated-code/#pair-vars

  // Event                                       reserve0    reserve1    reserve0 * reserve1    Average exchange rate (token1 / token0)
  // ----------------------------------------------------------------------------------------------------------------------------------
  // Initial setup                               1,000.000   1,000.000   1,000,000	
  // Trader A swaps 50 tokenA for 47.619 tokenB  1,050.000     952.381   1,000,000              0.952
  // Trader B swaps 10 tokenA for 8.984 tokenB   1,060.000     943.396   1,000,000              0.898
  // Trader C swaps 40 tokenA for 34.305 tokenB  1,100.000     909.090   1,000,000              0.858
  // Trader D swaps 100 tokenB for 109.01 tokenA   990.990   1,009.090   1,000,000              0.917
  // Trader E swaps 10 tokenA for 10.079 tokenB	 1,000.990     999.010   1,000,000              1.008
  it('correctly calculates price on consecutive trades', async () => {
    expect(await fruitswap.totalSupply().then(n => n.toString())).to.equal('0')

    let addLiquidityTx = await fruitswap.addLiquidity(toWei(1000), toWei(1000), ownerAddress)

    await addLiquidityTx.wait()

    expect(await fruitswap.tokenReserveA()).to.equal(toWei(1000))
    expect(await fruitswap.tokenReserveB()).to.equal(toWei(1000))
    expect(await fruitswap.totalSupply()).to.equal(toWei(1000) - 1000n)

    // Trader A swaps 50 tokenA for 47.619 tokenB  1,050.000     952.381   1,000,000              0.952
    let swapTx = await fruitswap.swap(toWei(50), 0n, ownerAddress)
    let tx = await swapTx.wait()

    let swapEvent = tx.events[tx.events.length - 1]
    let args = swapEvent && swapEvent.args
    let exchangeRate = args.amountB / args.amountA

    expect(args.initiator).to.equal(ownerAddress)
    expect(args.amountA).to.equal(toWei(50))
    expect(args.amountB).to.equal(47619047619047619048n)
    expect(await fruitswap.tokenReserveA().then(n => n.toString())).to.equal(toWei(1050).toString())
    expect(await fruitswap.tokenReserveB()).to.equal(952380952380952380952n)
    expect(exchangeRate.toString()).to.equal('0.9523809523809524')

    // Trader B swaps 10 tokenA for 8.984 tokenB
    swapTx = await fruitswap.swap(toWei(10), 0n, ownerAddress)
    tx = await swapTx.wait()

    swapEvent = tx.events[tx.events.length - 1]
    args = swapEvent && swapEvent.args
    exchangeRate = args.amountB / args.amountA

    expect(args.amountA).to.equal(toWei(10))
    expect(args.amountB).to.equal(8984725965858041330n)
    expect(await fruitswap.tokenReserveA().then(n => n.toString())).to.equal(toWei(1060).toString())
    expect(await fruitswap.tokenReserveB()).to.equal(943396226415094339622n)
    expect(exchangeRate.toString()).to.equal('0.898472596585804')

    // Trader C swaps 40 tokenA for 34.305 tokenB
    swapTx = await fruitswap.swap(toWei(40), 0n, ownerAddress)
    tx = await swapTx.wait()

    swapEvent = tx.events[tx.events.length - 1]
    args = swapEvent && swapEvent.args
    exchangeRate = args.amountB / args.amountA

    expect(args.amountA).to.equal(toWei(40))
    expect(args.amountB).to.equal(34305317324185248713n)
    expect(await fruitswap.tokenReserveA().then(n => n.toString())).to.equal(toWei(1100).toString())
    expect(await fruitswap.tokenReserveB()).to.equal(909090909090909090909n)
    expect(exchangeRate.toString()).to.equal('0.8576329331046312')

    // Trader D swaps 100 tokenB for 109.01 tokenA
    swapTx = await fruitswap.swap(0n, toWei(100), ownerAddress)
    tx = await swapTx.wait()

    swapEvent = tx.events[tx.events.length - 1]
    args = swapEvent && swapEvent.args

    exchangeRate = args.amountB / args.amountA

    expect(args.amountA).to.equal(109009009009009009009n)
    expect(args.amountB).to.equal(toWei(100))
    expect(await fruitswap.tokenReserveA()).to.equal(990990990990990990991n)
    expect(await fruitswap.tokenReserveB()).to.equal(1009090909090909090909n)
    expect(exchangeRate.toString()).to.equal('0.9173553719008264')

    // Trader E swaps 10 tokenA for 10.079 tokenB
    swapTx = await fruitswap.swap(toWei(10), 0n, ownerAddress)
    tx = await swapTx.wait()

    swapEvent = tx.events[tx.events.length - 1]
    args = swapEvent && swapEvent.args
    exchangeRate = args.amountB / args.amountA

    expect(args.amountA).to.equal(toWei(10))
    expect(args.amountB).to.equal(10080918991008091900n)
    expect(await fruitswap.tokenReserveA()).to.equal(1000990990990990990991n)
    expect(await fruitswap.tokenReserveB()).to.equal(999009990099900999009n)
    expect(exchangeRate.toString()).to.equal('1.0080918991008092')
  })

  it('reverts the transaction when the parameters are incorrect', async () => {
    await fruitswap.addLiquidity(toWei(300), toWei(200), ownerAddress)
      .then(tx => tx.wait())

    await expect(fruitswap.swap(toWei(500), 2n, ownerAddress))
      .to.be.revertedWith('Specify the amount to swap for one token only');
  })

  it('reverts the transaction when there isn\'t enough liquidity', async () => {
    await fruitswap.addLiquidity(toWei(300), toWei(200), ownerAddress)
      .then(tx => tx.wait())

    await expect(fruitswap.swap(toWei(500), 0n, ownerAddress))
      .to.be.revertedWith('Insufficient liquidity for trade');
  })

  it('reverts the transaction sender\'s token balance is too low', async () => {
    await fruitswap.addLiquidity(toWei(300), toWei(200), ownerAddress)
      .then(tx => tx.wait())

    await apples.transfer('0x000000000000000000000000000000000000dead', toWei(9500))

    expect(await apples.balanceOf(ownerAddress)).to.equal(toWei(200))

    await expect(fruitswap.swap(toWei(250), 0n, ownerAddress))
      .to.be.revertedWith('Insufficient balance for swap');

    await oranges.transfer('0x000000000000000000000000000000000000dead', toWei(9700))

    expect(await oranges.balanceOf(ownerAddress)).to.equal(toWei(100))

    await expect(fruitswap.swap(0n, toWei(150), ownerAddress))
      .to.be.revertedWith('Insufficient balance for swap');
  })

  it('correctly calculates token amounts when removing liquidity', async () => {
    await fruitswap.addLiquidity(toWei(300), toWei(200), ownerAddress)
      .then(tx => tx.wait())
      .then(() => fruitswap.swap(toWei(100), 0n, ownerAddress))
      .then(tx => tx.wait())

    const expectedTotalSupply = sqrt(toWei(300) * toWei(200)) - 1000n
    const balance = await fruitswap.balanceOf(ownerAddress)

    expect(await fruitswap.tokenReserveA()).to.equal(toWei(400))
    expect(await fruitswap.tokenReserveB()).to.equal(toWei(150))
    expect(await fruitswap.totalSupply()).to.equal(expectedTotalSupply)
    expect(balance).to.equal(expectedTotalSupply)

    const removeLiquidityTx = await fruitswap.removeLiquidity(balance, ownerAddress)
    const tx = await removeLiquidityTx.wait()

    expect(await fruitswap.balanceOf(ownerAddress)).to.equal(0n)
  })

  it('emits the correct event data when removing liquidity', async () => {
    await fruitswap.addLiquidity(toWei(300), toWei(200), ownerAddress)
      .then(tx => tx.wait())
      .then(() => fruitswap.swap(toWei(100), 0n, ownerAddress))
      .then(tx => tx.wait())

    const balance = await fruitswap.balanceOf(ownerAddress)
    const removeLiquidityTx = await fruitswap.removeLiquidity(balance, ownerAddress)
    const tx = await removeLiquidityTx.wait()

    const removeLiquidityEvent = tx.events.filter(e => e.event === 'RemoveLiquidity').shift()

    const args = removeLiquidityEvent.args

    const b = sqrt(toWei(300) * toWei(200)) - 1000n

    expect(args.initiator).to.equal(ownerAddress)
    expect(args.balanceA).to.equal(toWei(400))
    expect(args.balanceB).to.equal(toWei(150))
    expect(args.amountA).to.equal(toWei(400))
    expect(args.amountB).to.equal(toWei(150))
    expect(args._totalSupply).to.equal(b)
    expect(args.liquidity).to.equal(b)
  })

  it('reverts transaction when withdraw amount exceeds balance of LP token', async () => {
    await fruitswap.addLiquidity(toWei(300), toWei(200), ownerAddress)
      .then(tx => tx.wait())
      .then(() => fruitswap.swap(toWei(100), 0n, ownerAddress))
      .then(tx => tx.wait())

    const balance = sqrt(toWei(300) * toWei(200)) - 1000n

    await expect(fruitswap.removeLiquidity(balance + toWei(100), ownerAddress))
      .to.be.revertedWith('Withdraw amount exceeds balance of LP Tokens');

    // TODO: test withdrawing partial amount
  })

  it('correctly burns the amount of liquidity removed', async () => {
    await fruitswap.addLiquidity(toWei(300), toWei(200), ownerAddress).then(tx => tx.wait())

    const balance = await fruitswap.balanceOf(ownerAddress)

    await fruitswap.removeLiquidity(balance, ownerAddress).then(tx => tx.wait())

    expect(await fruitswap.totalSupply()).to.equal(0n)
  })
})
