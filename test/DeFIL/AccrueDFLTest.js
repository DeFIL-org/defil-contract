const truffleAssert = require('truffle-assertions');
const BigNumber = require('bignumber.js');
const {
  etherExp,
  etherDouble,
  etherUnsigned,
  etherMantissa,
} = require('../Utils/Ethereum');

const {
  makeDeFIL,
  balanceOf,
} = require('./Helper.js');

const initSpeed = etherExp(86.805721);
const minSpeed = etherExp(0.00017);
const halvePeriod = 576000;
const initSupplyIndex = etherDouble(1);
const initBlockNumber = 1;
const uniswapPercetage = etherExp(0.25);
const minerLeaguePercentage = etherExp(0.1);
const operatorPercentage = etherExp(0.03);
const technicalPercentage = etherExp(0.02);
const supplyPercentage = etherExp(0.6);

async function preAccrue(defil, blockNumber) {
  await defil.dfl.harnessSetBalance(defil.address, 0);
  await defil.harnessSetTotalSupply(0);
  await defil.harnessSetDflAccrued(defil.stakingLP.address, 0);
  await defil.harnessSetDflAccrued(defil.minerLeagueAddress, 0);
  await defil.harnessSetDflAccrued(defil.operatorAddress, 0);
  await defil.harnessSetDflAccrued(defil.technicalAddress, 0);
  await defil.harnessSetDflAccrued(defil.undistributedAddress, 0);
  await defil.harnessSetDflSupplyIndex(initSupplyIndex);
  await defil.harnessSetCurrentSpeed(initSpeed);
  await defil.harnessSetDflAccrualBlockNumber(etherUnsigned(blockNumber));
  await defil.harnessSetNextHalveBlockNumber(etherUnsigned(blockNumber + halvePeriod));
  await defil.harnessSetBlockNumber(etherUnsigned(blockNumber));
}

async function dflAccrued(defil, account) {
  return etherUnsigned(await defil.dflAccrued(account));
}

function getParts(delta) {
  const partOf = (percentage) => {
    return delta.multipliedBy(percentage).dividedBy(etherExp(1));
  }
  return [partOf(uniswapPercetage), partOf(operatorPercentage), partOf(minerLeaguePercentage), partOf(technicalPercentage), partOf(supplyPercentage)];
}

contract('DeFIL', function (accounts) {
  let defil;
  beforeEach(async () => {
    defil = await makeDeFIL(accounts);
  });

  describe('accrueDFL', () => {
    beforeEach(async () => {
      await preAccrue(defil, initBlockNumber);
    });

    it("success accrued if not delta blocks", async () => {
      const res = await defil.harnessAccrueDFL();
      assert.ok((await dflAccrued(defil, defil.stakingLP.address)).isEqualTo(0));
      assert.ok((await dflAccrued(defil, defil.operatorAddress)).isEqualTo(0));
      assert.ok((await dflAccrued(defil, defil.minerLeagueAddress)).isEqualTo(0));
      assert.ok((await dflAccrued(defil, defil.technicalAddress)).isEqualTo(0));
      assert.ok((await dflAccrued(defil, defil.undistributedAddress)).isEqualTo(0));

      assert.ok((await balanceOf(defil.dfl, defil.address)).isEqualTo(0));
      assert.ok(etherUnsigned(await defil.dflSupplyIndex()).isEqualTo(initSupplyIndex));
      assert.ok(etherUnsigned(await defil.dflAccrualBlockNumber()).isEqualTo(initBlockNumber));

      truffleAssert.eventNotEmitted(res, 'AccrueDFL');
    });

    it("success accrued if not beyond halve period", async () => {
      await defil.harnessFastForward(10);
      await defil.harnessSetTotalSupply(0);
      const res = await defil.harnessAccrueDFL();
      const delta = etherUnsigned(await defil.currentSpeed()).multipliedBy(10);
      const [uniswapPart, operatorPart, minerLeaguePart, technicalPart, supplyPart] = getParts(delta);
      assert.ok((await dflAccrued(defil, defil.stakingLP.address)).isEqualTo(uniswapPart));
      assert.ok((await dflAccrued(defil, defil.operatorAddress)).isEqualTo(operatorPart));
      assert.ok((await dflAccrued(defil, defil.minerLeagueAddress)).isEqualTo(minerLeaguePart));
      assert.ok((await dflAccrued(defil, defil.technicalAddress)).isEqualTo(technicalPart));
      assert.ok((await dflAccrued(defil, defil.undistributedAddress)).isEqualTo(supplyPart));

      assert.ok((await balanceOf(defil.dfl, defil.address)).isEqualTo(delta));
      assert.ok(etherUnsigned(await defil.dflSupplyIndex()).isEqualTo(initSupplyIndex));
      assert.ok(etherUnsigned(await defil.dflAccrualBlockNumber()).isEqualTo(11));

      truffleAssert.eventEmitted(res, 'AccrueDFL', (ev) => {
        return etherUnsigned(ev.uniswapPart).isEqualTo(uniswapPart)
              && etherUnsigned(ev.minerLeaguePart).isEqualTo(minerLeaguePart)
              && etherUnsigned(ev.operatorPart).isEqualTo(operatorPart)
              && etherUnsigned(ev.technicalPart).isEqualTo(technicalPart)
              && etherUnsigned(ev.supplyPart).isEqualTo(supplyPart)
              && etherUnsigned(ev.dflSupplyIndex).isEqualTo(initSupplyIndex);
      });
    });

    it("success accrued if beyond halve period", async () => {
      const beyondBlockNumber = 1;
      await defil.harnessFastForward(halvePeriod + beyondBlockNumber);
      await defil.harnessSetTotalSupply(0);
      const res = await defil.harnessAccrueDFL();
      const delta1 = etherUnsigned(initSpeed).multipliedBy(halvePeriod);
      const [uniswapPart1, operatorPart1, minerLeaguePart1, technicalPart1, supplyPart1] = getParts(delta1)

      const delta2 = etherUnsigned(await defil.currentSpeed()).multipliedBy(beyondBlockNumber); // halved
      const [uniswapPart2, operatorPart2, minerLeaguePart2, technicalPart2, supplyPart2] = getParts(delta2)

      const delta = delta1.plus(delta2);
      const [uniswapPart, operatorPart, minerLeaguePart, technicalPart, supplyPart] = getParts(delta)
      assert.ok((await dflAccrued(defil, defil.stakingLP.address)).isEqualTo(uniswapPart));
      assert.ok((await dflAccrued(defil, defil.operatorAddress)).isEqualTo(operatorPart));
      assert.ok((await dflAccrued(defil, defil.minerLeagueAddress)).isEqualTo(minerLeaguePart));
      assert.ok((await dflAccrued(defil, defil.technicalAddress)).isEqualTo(technicalPart));
      assert.ok((await dflAccrued(defil, defil.undistributedAddress)).isEqualTo(supplyPart));

      assert.ok((await balanceOf(defil.dfl, defil.address)).isEqualTo(delta));
      assert.ok(etherUnsigned(await defil.dflSupplyIndex()).isEqualTo(initSupplyIndex));
      assert.ok(etherUnsigned(await defil.dflAccrualBlockNumber()).isEqualTo(halvePeriod + beyondBlockNumber + 1));

      truffleAssert.eventEmitted(res, 'AccrueDFL', (ev) => {
        return etherUnsigned(ev.uniswapPart).isEqualTo(uniswapPart1)
              && etherUnsigned(ev.minerLeaguePart).isEqualTo(minerLeaguePart1)
              && etherUnsigned(ev.operatorPart).isEqualTo(operatorPart1)
              && etherUnsigned(ev.technicalPart).isEqualTo(technicalPart1)
              && etherUnsigned(ev.supplyPart).isEqualTo(supplyPart1)
              && etherUnsigned(ev.dflSupplyIndex).isEqualTo(initSupplyIndex);
      });
      truffleAssert.eventEmitted(res, 'AccrueDFL', (ev) => {
        return etherUnsigned(ev.uniswapPart).isEqualTo(uniswapPart2)
              && etherUnsigned(ev.minerLeaguePart).isEqualTo(minerLeaguePart2)
              && etherUnsigned(ev.operatorPart).isEqualTo(operatorPart2)
              && etherUnsigned(ev.technicalPart).isEqualTo(technicalPart2)
              && etherUnsigned(ev.supplyPart).isEqualTo(supplyPart2)
              && etherUnsigned(ev.dflSupplyIndex).isEqualTo(initSupplyIndex);
      });
    });

    it("success accrued if beyond the last accrue block number", async () => {
      await defil.harnessFastForward(10944000 + 10);
      await defil.harnessSetTotalSupply(0);
      const res = await defil.harnessAccrueDFL();

      assert.ok(etherUnsigned(await defil.currentSpeed()).isLessThan(minSpeed));
      assert.ok(etherUnsigned(await defil.dflAccrualBlockNumber()).isEqualTo(10944000 + 10 + 1));

      const totalDFL = await balanceOf(defil.dfl, defil.address);
      assert.ok(totalDFL.dividedBy(1e18).toFixed(0) == "100000000");

      const [uniswapPart, operatorPart, minerLeaguePart, technicalPart, supplyPart] = getParts(totalDFL)
      assert.ok((await dflAccrued(defil, defil.stakingLP.address)).isEqualTo(uniswapPart));
      assert.ok((await dflAccrued(defil, defil.operatorAddress)).isEqualTo(operatorPart));
      assert.ok((await dflAccrued(defil, defil.minerLeagueAddress)).isEqualTo(minerLeaguePart));
      assert.ok((await dflAccrued(defil, defil.technicalAddress)).isEqualTo(technicalPart));
      assert.ok((await dflAccrued(defil, defil.undistributedAddress)).isEqualTo(supplyPart));
    });

    it("success accrued if total supply is not zero", async () => {
      const totalSupply = etherExp(100);
      await defil.harnessSetTotalSupply(totalSupply);
      await defil.harnessFastForward(10);
      const res = await defil.harnessAccrueDFL();
      const delta = etherUnsigned(await defil.currentSpeed()).multipliedBy(10);
      const [uniswapPart, operatorPart, minerLeaguePart, technicalPart, supplyPart] = getParts(delta)
      assert.ok((await dflAccrued(defil, defil.stakingLP.address)).isEqualTo(uniswapPart));
      assert.ok((await dflAccrued(defil, defil.operatorAddress)).isEqualTo(operatorPart));
      assert.ok((await dflAccrued(defil, defil.minerLeagueAddress)).isEqualTo(minerLeaguePart));
      assert.ok((await dflAccrued(defil, defil.technicalAddress)).isEqualTo(technicalPart));
      assert.ok((await dflAccrued(defil, defil.undistributedAddress)).isEqualTo(0));

      assert.ok((await balanceOf(defil.dfl, defil.address)).isEqualTo(delta));
      const expectSupplyIndex = etherDouble(supplyPart).dividedBy(totalSupply).plus(initSupplyIndex)
      assert.ok(etherUnsigned(await defil.dflSupplyIndex()).isEqualTo(expectSupplyIndex));
      assert.ok(etherUnsigned(await defil.dflAccrualBlockNumber()).isEqualTo(11));

      truffleAssert.eventEmitted(res, 'AccrueDFL', (ev) => {
        return etherUnsigned(ev.uniswapPart).isEqualTo(uniswapPart)
              && etherUnsigned(ev.minerLeaguePart).isEqualTo(minerLeaguePart)
              && etherUnsigned(ev.operatorPart).isEqualTo(operatorPart)
              && etherUnsigned(ev.technicalPart).isEqualTo(technicalPart)
              && etherUnsigned(ev.supplyPart).isEqualTo(supplyPart)
              && etherUnsigned(ev.dflSupplyIndex).isEqualTo(expectSupplyIndex);
      });
    });
  });
});

