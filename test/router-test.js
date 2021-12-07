const { expect } = require('chai')
const { toWei, erc20Abi } = require('./test-helper')

describe('Router', () => {
  let router, apples, oranges, pears, plums, owner

  beforeEach(async () => {
    const [ ownerAccount ] = await ethers.getSigners();

    owner = ownerAccount

    const Token = await hre.ethers.getContractFactory('Token')

    apples = await Token.deploy(toWei(10000n), 'Apples', 'APPLE').then(c => c.deployed())
    oranges = await Token.deploy(toWei(10000n), 'Oranges', 'ORANGE').then(c => c.deployed())
    pears = await Token.deploy(toWei(10000n), 'Pears', 'PEAR').then(c => c.deployed())
    plums = await Token.deploy(toWei(10000n), 'Plums', 'PLUM').then(c => c.deployed())

    router = await hre.ethers.getContractFactory('Router')
      .then(contract => contract.deploy())
      .then(contract => contract.deployed())
  })

  it('creates new liquidity pools', async () => {
    let createTx = await router.createLiquidityPool(apples.address, oranges.address)
    let tx = await createTx.wait()
    let args = tx.events[0].args

    expect(args.tradingPairName).to.equal('Apples/Oranges')
    expect(args.tradingPairHash).to.equal('0x6982d8326b83c3a1e5fbfeae0b99eeeca4a2562e59d0102d7deada6a92a95291')

    createTx = await router.createLiquidityPool(pears.address, plums.address)
    tx = await createTx.wait()
    args = tx.events[0].args

    expect(args.tradingPairName).to.equal('Pears/Plums')
    expect(args.tradingPairHash).to.equal('0x09f01b9e8666f5315e495e24be58656859c56e9170e06ba186ec9296a32e9a14')
  })

  it('routes new liquidity to the correct contract', async () => {
    let createTx = await router.createLiquidityPool(apples.address, oranges.address)
    let tx = await createTx.wait()
    let args = tx.events[0].args

    expect(args.tradingPairName).to.equal('Apples/Oranges')
    expect(args.tradingPairHash).to.equal('0x6982d8326b83c3a1e5fbfeae0b99eeeca4a2562e59d0102d7deada6a92a95291')

    createTx = await router.createLiquidityPool(pears.address, plums.address)
    tx = await createTx.wait()
    args = tx.events[0].args

    const poolId = '0x09f01b9e8666f5315e495e24be58656859c56e9170e06ba186ec9296a32e9a14'

    expect(args.tradingPairName).to.equal('Pears/Plums')
    expect(args.tradingPairHash).to.equal(poolId)

    const contractAddress = await router.getPoolAddress(poolId)

    expect(await pears.balanceOf(owner.address)).to.equal(toWei(10000));
    expect(await plums.balanceOf(owner.address)).to.equal(toWei(10000));

    expect(contractAddress).to.equal('0x2e1E753d4a984F592D9De32C7e8009CE53298720')

    await pears.approve(contractAddress, toWei(5000)).then(tx => tx.wait())
    await plums.approve(contractAddress, toWei(5000)).then(tx => tx.wait())

    const addLiquidityTx = await router.addLiquidity(poolId, toWei(300), toWei(200))
    tx = await addLiquidityTx.wait()

    expect(await pears.balanceOf(owner.address)).to.equal(toWei(9700));
    expect(await plums.balanceOf(owner.address)).to.equal(toWei(9800));

    const erc20 = new ethers.Contract(contractAddress, erc20Abi, owner)

    const lpBalance = await erc20.balanceOf(owner.address)

    expect(lpBalance).to.equal(244948974278317808819n)
  })

  it('prevents a trading pair from being added twice', async () => {
    let createTx = await router.createLiquidityPool(apples.address, oranges.address)
    let tx = await createTx.wait()
    let args = tx.events[0].args

    expect(args.tradingPairName).to.equal('Apples/Oranges')
    expect(args.tradingPairHash).to.equal('0x6982d8326b83c3a1e5fbfeae0b99eeeca4a2562e59d0102d7deada6a92a95291')

    await expect(router.createLiquidityPool(apples.address, oranges.address))
      .to.be.revertedWith('Trading pair already exists');
  })

  it('renoves liquidity from the liquidity pool', async () => {
    let createTx = await router.createLiquidityPool(apples.address, oranges.address)
    let tx = await createTx.wait()
    let args = tx.events[0].args

    const poolId = '0x6982d8326b83c3a1e5fbfeae0b99eeeca4a2562e59d0102d7deada6a92a95291'

    const contractAddress = await router.getPoolAddress(poolId)

    await apples.approve(contractAddress, toWei(5000)).then(tx => tx.wait())
    await oranges.approve(contractAddress, toWei(5000)).then(tx => tx.wait())

    const addLiquidityTx = await router.addLiquidity(poolId, toWei(300), toWei(200))
    tx = await addLiquidityTx.wait()

    expect(await apples.balanceOf(owner.address)).to.equal(toWei(9700));
    expect(await oranges.balanceOf(owner.address)).to.equal(toWei(9800));

    const erc20 = new ethers.Contract(contractAddress, erc20Abi, owner)

    let lpBalance = await erc20.balanceOf(owner.address)

    expect(lpBalance).to.equal(244948974278317808819n)

    const removeLiquidityTx = await router.removeLiquidity(poolId, toWei(100))
    tx = await removeLiquidityTx.wait()

    lpBalance = await erc20.balanceOf(owner.address)

    expect(lpBalance).to.equal(144948974278317808819n)
    expect(await apples.balanceOf(owner.address)).to.equal(9822474487139158905410n);
    expect(await oranges.balanceOf(owner.address)).to.equal(9881649658092772603606n);
  })

  it('routes trades to the correct trading pair', async () => {
    await router.createLiquidityPool(apples.address, oranges.address).then(tx => tx.wait())

    const poolId = '0x6982d8326b83c3a1e5fbfeae0b99eeeca4a2562e59d0102d7deada6a92a95291'
    const contractAddress = await router.getPoolAddress(poolId)

    await apples.approve(contractAddress, toWei(5000)).then(tx => tx.wait())
    await oranges.approve(contractAddress, toWei(5000)).then(tx => tx.wait())
    await router.addLiquidity(poolId, toWei(300), toWei(200)).then(tx => tx.wait())

    expect(await apples.balanceOf(owner.address)).to.equal(toWei(9700));
    expect(await oranges.balanceOf(owner.address)).to.equal(toWei(9800));

    await router.swap(poolId, toWei(100), 0n).then(tx => tx.wait())

    expect(await apples.balanceOf(owner.address)).to.equal(toWei(9600));
    expect(await oranges.balanceOf(owner.address)).to.equal(toWei(9850));
  })
})