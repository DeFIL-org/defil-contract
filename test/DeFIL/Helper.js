const { dfn } = require('../Utils/JS');
const {
  etherBalance,
  etherMantissa,
  etherUnsigned,
  mergeInterface
} = require('../Utils/Ethereum');
const BigNumber = require('bignumber.js');

const WhitePaperInterestRateModel = artifacts.require("WhitePaperInterestRateModel");
const DeFIL = artifacts.require("DeFILHarness");
const EFILToken = artifacts.require("StandardTokenHarness");
const MFILToken = artifacts.require("StandardTokenHarness");
const LPToken = artifacts.require("StandardTokenHarness");
const DFLToken = artifacts.require("DFL");
const StakingDFL = artifacts.require("StakingDFL");
const StakingLP = artifacts.require("StakingLP");

const zeroAmount = new BigNumber(0);

async function makeDeFIL() {
  const defil = await DeFIL.deployed();

  return Object.assign(defil, {
    interestRateModel: await WhitePaperInterestRateModel.at(await defil.interestRateModel()),
    eFIL: await EFILToken.at(await defil.eFILAddress()),
    mFIL: await MFILToken.at(await defil.mFILAddress()),
    dfl: await DFLToken.at(await defil.dflToken()),
    stakingDFL: await StakingDFL.at(await defil.reservesOwner()),
    stakingLP: await StakingDFL.at(await defil.uniswapAddress()),
    minerLeagueAddress: defil.minerLeagueAddress,
    operatorAddress: defil.operatorAddress,
    technicalAddress: defil.technicalAddress,
    undistributedAddress: defil.undistributedAddress,
  });
}

function userAccounts(accounts) {
  return accounts.slice(5, accounts.length);
}

async function balanceOf(token, account) {
  return etherUnsigned(await token.balanceOf(account));
}

async function totalSupply(token) {
  return etherUnsigned(await token.totalSupply());
}

async function withBalanceChecked(token, account, delta, action) {
  const pre = await balanceOf(token, account);
  const res = await action();
  const post = await balanceOf(token, account);
  assert.ok(post.isEqualTo(pre.plus(delta)), "balance mismatch");
  return res;
}

async function withTotalSupplyChecked(token, delta, action) {
  const pre = await totalSupply(token);
  const res = await action();
  const post = await totalSupply(token);
  assert.ok(post.isEqualTo(pre.plus(delta)), "total supply mismatch");
  return res;
}

module.exports = {
  makeDeFIL,
  userAccounts,

  zeroAmount,
  balanceOf,
  totalSupply,
  withBalanceChecked,
  withTotalSupplyChecked,
};
