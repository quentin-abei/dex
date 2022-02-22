const Dai = artifacts.require('Dai.sol');
const Bat = artifacts.require('Bat.sol');
const Quen = artifacts.require('Quen.sol');
const Zrx = artifacts.require('Zrx.sol');
const Dex = artifacts.require("Dex.sol");

const [DAI, BAT, QUEN, ZRX] = ['DAI', 'BAT', 'QUEN', 'ZRX']
  .map(Symbol => web3.utils.fromAscii(Symbol));

module.exports = async function(deployer) {
  await Promise.all(
    [Dai, Bat, Quen, Zrx, Dex].map(contract => deployer.deploy(contract))
  );
  const [dai, bat, quen, zrx, dex] = await Promise.all(
    [Dai, Bat, Quen, Zrx, Dex].map(contract => contract.deployed())
  );

  await Promise.all([
    dex.addToken(DAI, dai.address),
    dex.addToken(BAT, bat.address),
    dex.addToken(QUEN, quen.address),
    dex.addToken(ZRX, zrx.address)
  ]);
};