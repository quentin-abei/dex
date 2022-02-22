const { expectRevert } = require('@openzeppelin/test-helpers');
const assert = require('assert');
const Dai = artifacts.require('Dai.sol');
const Bat = artifacts.require('Bat.sol');
const Quen = artifacts.require('Quen.sol');
const Zrx = artifacts.require('Zrx.sol');
const Dex = artifacts.require('Dex.sol');

const SIDE = {
  BUY: 0,
  SELL: 1
};

contract('Dex', async function (accounts)  {
  let dai, bat, quen, zrx, dex;
  const [trader1, trader2] = [accounts[1], accounts[2]];
  const [DAI, BAT, QUEN, ZRX] = ['DAI', 'BAT', 'QUEN', 'ZRX']
    .map(symbol => web3.utils.fromAscii(symbol));

  beforeEach(async() => {
    ([dai, bat, quen, zrx] = await Promise.all([
      Dai.new(), 
      Bat.new(), 
      Quen.new(), 
      Zrx.new()
    ]));
    dex = await Dex.new();
    await Promise.all([
      dex.addToken(DAI, dai.address),
      dex.addToken(BAT, bat.address),
      dex.addToken(QUEN, quen.address),
      dex.addToken(ZRX, zrx.address)
    ]);

    const amount = web3.utils.toWei('1000');
    const seedTokenBalance = async (token, trader) => {
      await token.faucet(trader, amount)
      await token.approve(
        dex.address, 
        amount, 
        {from: trader}
      );
    };
    await Promise.all(
      [dai, bat, quen, zrx].map(
        token => seedTokenBalance(token, trader1) 
      )
    );
    await Promise.all(
      [dai, bat, quen, zrx].map(
        token => seedTokenBalance(token, trader2) 
      )
    );
  });

  it('should deposit tokens', async () => {
    const amount = web3.utils.toWei('100');

    await dex.deposit(
      amount,
      DAI,
      {from: trader1}
    );

    const balance = await dex.traderBalances(trader1, DAI);
    assert(balance.toString() === amount);
  });

  it('should NOT deposit tokens if token does not exist', async () => {
    await expectRevert(
      dex.deposit(
        web3.utils.toWei('100'),
        web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
        {from: trader1}
      ),
      'token does not exist'
    );
  });

  it('should withdraw tokens', async () => {
    const amount = web3.utils.toWei('100');

    await dex.deposit(
      amount,
      DAI,
      {from: trader1}
    );

    await dex.withdraw(
      amount,
      DAI,
      {from: trader1}
    );

    const [balanceDex, balanceDai] = await Promise.all([
      dex.traderBalances(trader1, DAI),
      dai.balanceOf(trader1)
    ]);
    assert(balanceDex.isZero());
    assert(balanceDai.toString() === web3.utils.toWei('1000')); 
  });

  it('should NOT withdraw tokens if token does not exist', async () => {
    await expectRevert(
      dex.withdraw(
        web3.utils.toWei('1000'),
        web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
        {from: trader1}
      ),
      'token does not exist'
    );
  });

  it('should NOT withdraw tokens if balance too low', async () => {
    await dex.deposit(
      web3.utils.toWei('100'),
      DAI,
      {from: trader1}
    );

    await expectRevert(
      dex.withdraw(
        web3.utils.toWei('1000'),
        DAI,
        {from: trader1}
      ),
      'balance too low'
    );
  });

  it('should create limit order', async () => {
    await dex.deposit(
      web3.utils.toWei('100'),
      DAI,
      {from: trader1}
    );
  
    await dex.createLimitOrder(
      QUEN,
      web3.utils.toWei('10'),
      10,
      SIDE.BUY,
      {from: trader1}
    );
  
    let buyOrders = await dex.getOrders(QUEN, SIDE.BUY);
    let sellOrders = await dex.getOrders(QUEN, SIDE.SELL);
    assert(buyOrders.length === 1);
    assert(buyOrders[0].trader === trader1);
    assert(buyOrders[0].symbol === web3.utils.padRight(QUEN, 64));
    assert(buyOrders[0].price === '10');
    assert(buyOrders[0].amount === web3.utils.toWei('10'));
    assert(sellOrders.length === 0);
  
    await dex.deposit(
      web3.utils.toWei('200'),
      DAI,
      {from: trader2}
    );
  
    await dex.createLimitOrder(
      QUEN,
      web3.utils.toWei('10'),
      11,
      SIDE.BUY,
      {from: trader2}
    );
  
    buyOrders = await dex.getOrders(QUEN, SIDE.BUY);
    sellOrders = await dex.getOrders(QUEN, SIDE.SELL);
    assert(buyOrders.length === 2);
    assert(buyOrders[0].trader === trader2);
    assert(buyOrders[1].trader === trader1);
    assert(sellOrders.length === 0);
  
    await dex.deposit(
      web3.utils.toWei('200'),
      DAI,
      {from: trader2}
    );
  
    await dex.createLimitOrder(
      QUEN,
      web3.utils.toWei('10'),
      9,
      SIDE.BUY,
      {from: trader2}
    );
  
    buyOrders = await dex.getOrders(QUEN, SIDE.BUY);
    sellOrders = await dex.getOrders(QUEN, SIDE.SELL);
    assert(buyOrders.length === 3);
    assert(buyOrders[0].trader === trader2);
    assert(buyOrders[1].trader === trader1);
    assert(buyOrders[2].trader === trader2);
    assert(sellOrders.length === 0);
  });

  it('should NOT create limit order if token balance too low', async () => {
    await dex.deposit(
      web3.utils.toWei('99'),
      QUEN,
      {from: trader1}
    );

    await expectRevert(
      dex.createLimitOrder(
        QUEN,
        web3.utils.toWei('100'),
        10,
        SIDE.SELL,
        {from: trader1}
      ),
      'balance too low'
    );
  });

  it('should NOT create limit order if dai balance too low', async () => {
    await dex.deposit(
      web3.utils.toWei('99'),
      DAI,
      {from: trader1}
    );

    await expectRevert(
      dex.createLimitOrder(
        QUEN,
        web3.utils.toWei('10'),
        10,
        SIDE.BUY,
        {from: trader1}
      ),
      'dai balance too low'
    );
  });

  it('should NOT create limit order if token is DAI', async () => {
    await expectRevert(
      dex.createLimitOrder(
        DAI,
        web3.utils.toWei('1000'),
        10,
        SIDE.BUY,
        {from: trader1}
      ),
      'cannot trade DAI'
    );
  });

  it('should NOT create limit order if token does not exist', async () => {
    await expectRevert(
      dex.createLimitOrder(
        web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
        web3.utils.toWei('1000'),
        10,
        SIDE.BUY,
        {from: trader1}
      ),
      'token does not exist'
    );
  });
  it('should create market order & match', async () => {
    await dex.deposit(
      web3.utils.toWei('100'),
      DAI,
      {from: trader1}
    );
  
    await dex.createLimitOrder(
      QUEN,
      web3.utils.toWei('10'),
      10,
      SIDE.BUY,
      {from: trader1}
    );
  
    await dex.deposit(
      web3.utils.toWei('100'),
      QUEN,
      {from: trader2}
    );
  
    await dex.createMarketOrder(
      QUEN,
      web3.utils.toWei('5'),
      SIDE.SELL,
      {from: trader2}
    );
  
    const balances = await Promise.all([
      dex.traderBalances(trader1, DAI),
      dex.traderBalances(trader1, QUEN),
      dex.traderBalances(trader2, DAI),
      dex.traderBalances(trader2, QUEN),
    ]);
    const orders = await dex.getOrders(REP, SIDE.BUY);
    assert(orders.length === 1);
    assert(orders[0].filled = web3.utils.toWei('5'));
    assert(balances[0].toString() === web3.utils.toWei('50'));
    assert(balances[1].toString() === web3.utils.toWei('5'));
    assert(balances[2].toString() === web3.utils.toWei('50'));
    assert(balances[3].toString() === web3.utils.toWei('95'));
  });

  it('should NOT create market order if token balance too low', async () => {
    await expectRevert(
      dex.createMarketOrder(
        QUEN,
        web3.utils.toWei('101'),
        SIDE.SELL,
        {from: trader2}
      ),
      'balance too low'
    );
  });

  it('should NOT create market order if dai balance too low', async () => {
    await dex.deposit(
      web3.utils.toWei('100'),
      QUEN,
      {from: trader1}
    );
  
    await dex.createLimitOrder(
      QUEN,
      web3.utils.toWei('100'),
      10,
      SIDE.SELL,
      {from: trader1}
    );

    await expectRevert(
      dex.createMarketOrder(
        QUEN,
        web3.utils.toWei('101'),
        SIDE.BUY,
        {from: trader2}
      ),
      'dai balance too low'
    );
  });

  it('should NOT create market order if token is DAI', async () => {
    await expectRevert(
      dex.createMarketOrder(
        DAI,
        web3.utils.toWei('1000'),
        SIDE.BUY,
        {from: trader1}
      ),
      'cannot trade DAI'
    );
  });

  it('should NOT create market order if token does not exist', async () => {
    await expectRevert(
      dex.createMarketOrder(
        web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
        web3.utils.toWei('1000'),
        SIDE.BUY,
        {from: trader1}
      ),
      'token does not exist'
    );
  });
});