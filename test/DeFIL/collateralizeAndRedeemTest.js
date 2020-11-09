const truffleAssert = require('truffle-assertions');
const BigNumber = require('bignumber.js');
const {
  etherExp,
  etherUnsigned,
} = require('../Utils/Ethereum');

const {
  makeDeFIL,
  userAccounts,
  balanceOf,
  zeroAmount,
} = require('./Helper.js');

async function withCollateralsChecked(defil, account, delta, action) {
  const pre = etherUnsigned(await defil.getCollateral(account));
  const res = await action();
  const post = etherUnsigned(await defil.getCollateral(account));
  assert.ok(post.isEqualTo(pre.plus(delta)), "collaterals mismatch");
  return res;
}

async function withTotalCollateralsChecked(defil, delta, action) {
  const pre = etherUnsigned(await defil.totalCollaterals());
  const res = await action();
  const post = etherUnsigned(await defil.totalCollaterals());
  assert.ok(post.isEqualTo(pre.plus(delta)), "total collaterals mismatch");
  return res;
}

contract('DeFIL', function (accounts) {
  let defil;
  let exchangeRate;
  let collateralizer;
  beforeEach(async () => {
    defil = await makeDeFIL();
    collateralizer = userAccounts(accounts)[0];
  });

  describe('collateralize', () => {
    beforeEach(async () => {
      await defil.harnessFastForward(1);
    });

    it("Should failed if have minted before", async () => {
      const collateralizeAmount = etherExp(10);

      // Mock minted
      await defil.harnessSetBalance(collateralizer, etherExp(1));

      const res = await withTotalCollateralsChecked(defil, zeroAmount, async () => {
        return await withCollateralsChecked(defil, collateralizer, zeroAmount, async () => {
          return await defil.collateralize(collateralizeAmount, {from: collateralizer});
        })
      });

      truffleAssert.eventEmitted(res, 'AccrueInterest');
      truffleAssert.eventEmitted(res, 'AccrueDFL');
      truffleAssert.eventEmitted(res, 'Failure', (ev) => {
        return ev.error == 3 && ev.info == 28; // Error.REJECTION, FailureInfo.COLLATERALIZE_REJECTION
      });

      // redeem; clean
      await defil.harnessSetBalance(collateralizer, etherExp(0));
    });

    it("Should successfully collateralize", async () => {
      const collateralizeAmount = etherExp(10);

      await defil.mFIL.transfer(collateralizer, collateralizeAmount);
      await defil.mFIL.approve(defil.address, collateralizeAmount, {from: collateralizer});
      const res = await withTotalCollateralsChecked(defil, collateralizeAmount, async () => {
        return await withCollateralsChecked(defil, collateralizer, collateralizeAmount, async () => {
          return await defil.collateralize(collateralizeAmount, {from: collateralizer});
        })
      });

      truffleAssert.eventEmitted(res, 'AccrueInterest');
      truffleAssert.eventEmitted(res, 'AccrueDFL');
      truffleAssert.eventEmitted(res, 'Collateralize', (ev) => {
        return ev.collateralizer == collateralizer
              && etherUnsigned(ev.collateralizeAmount).isEqualTo(collateralizeAmount)
      });
      truffleAssert.eventEmitted(res, 'Transfer', (ev) => {
        return ev.from == collateralizer
              && ev.to == defil.address
              && etherUnsigned(ev.amount).isEqualTo(collateralizeAmount);
      });
    });

    it("Should failed if insufficient approve", async () => {
      await defil.mFIL.approve(defil.address, etherExp(5), {from: collateralizer});
      await truffleAssert.fails(
          defil.collateralize(etherExp(10), {from: collateralizer}),
          truffleAssert.ErrorType.REVERT,
          "Insufficient allowance"
      );
    });

    it("Should failed if insufficient balance", async () => {
      await defil.mFIL.approve(defil.address, etherExp(10), {from: collateralizer});
      await truffleAssert.fails(
          defil.collateralize(etherExp(10), {from: collateralizer}),
          truffleAssert.ErrorType.REVERT,
          "Insufficient balance"
      );
    });
  });

  describe('redeemCollateral', () => {
    beforeEach(async () => {
      await defil.harnessFastForward(1);
    });

    it("Should successfully redeem collateral", async () => {
      const collateralizeAmount = etherExp(10);

      await defil.mFIL.transfer(collateralizer, collateralizeAmount);
      await defil.mFIL.approve(defil.address, collateralizeAmount, {from: collateralizer});
      await defil.collateralize(collateralizeAmount, {from: collateralizer});
      await defil.harnessFastForward(1);

      const res = await withTotalCollateralsChecked(defil, collateralizeAmount.negated(), async () => {
        return await withCollateralsChecked(defil, collateralizer, collateralizeAmount.negated(), async () => {
          return await defil.redeemCollateral(collateralizeAmount, {from: collateralizer});
        })
      });

      truffleAssert.eventEmitted(res, 'AccrueInterest');
      truffleAssert.eventEmitted(res, 'AccrueDFL');
      truffleAssert.eventEmitted(res, 'RedeemCollateral', (ev) => {
        return ev.redeemer == collateralizer
              && etherUnsigned(ev.redeemAmount).isEqualTo(collateralizeAmount)
      });
      truffleAssert.eventEmitted(res, 'Transfer', (ev) => {
        return ev.from == defil.address
              && ev.to == collateralizer
              && etherUnsigned(ev.amount).isEqualTo(collateralizeAmount);
      });
    });

    it("Should failed if insufficient balance", async () => {
      const collateralizeAmount = etherExp(10);

      await defil.mFIL.transfer(collateralizer, collateralizeAmount);
      await defil.mFIL.approve(defil.address, collateralizeAmount, {from: collateralizer});
      await defil.collateralize(collateralizeAmount, {from: collateralizer});
      await defil.harnessFastForward(1);

      // harness set mFIL balance of defil to zero
      await defil.mFIL.harnessSetBalance(defil.address, etherExp(0));

      await truffleAssert.fails(
          defil.redeemCollateral(collateralizeAmount, {from: collateralizer}),
          truffleAssert.ErrorType.REVERT,
          "Insufficient balance"
      );
    });
  });
});

