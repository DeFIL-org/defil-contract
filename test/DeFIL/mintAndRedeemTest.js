const truffleAssert = require('truffle-assertions');
const BigNumber = require('bignumber.js');
const {
  etherExp,
  etherUnsigned,
} = require('../Utils/Ethereum');

const {
  makeDeFIL,
  balanceOf,
  totalSupply,
  withTotalSupplyChecked,
  withBalanceChecked,
  zeroAmount,
} = require('./Helper.js');

contract('DeFIL', function (accounts) {
  let defil;
  let exchangeRate;
  let minter;
  beforeEach(async () => {
    defil = await makeDeFIL(accounts);
    exchangeRate = await defil.initialExchangeRateMantissa();
    minter = defil.userAccounts[0];
  });

  describe('mint', () => {
    beforeEach(async () => {
      await defil.harnessFastForward(1);
    });

    it("Should failed if has collaterals", async () => {
      await defil.harnessSetCollaterals(minter, etherExp(1));
      const res = await withTotalSupplyChecked(defil, zeroAmount, async () => {
        return await withBalanceChecked(defil, minter, zeroAmount, async () => {
          return await defil.mint(etherExp(1), {from: minter});
        })
      });

      truffleAssert.eventEmitted(res, 'AccrueInterest');
      truffleAssert.eventEmitted(res, 'AccrueDFL');
      truffleAssert.eventEmitted(res, 'Failure', (ev) => {
        return ev.error == 3 && ev.info == 14; // Error.REJECTION, FailureInfo.MINT_REJECTION
      });
      // clean up
      await defil.harnessSetCollaterals(minter, etherExp(0));
    });

    it("Should successfully mint", async () => {

      const mintAmount = etherExp(10);
      const mintTokens = mintAmount.multipliedBy(1e18).dividedBy(exchangeRate);

      await defil.eFIL.transfer(minter, mintAmount);
      await defil.eFIL.approve(defil.address, mintAmount, {from: minter});
      const res = await withTotalSupplyChecked(defil, mintTokens, async () => {
        return await withBalanceChecked(defil, minter, mintTokens, async () => {
          return await defil.mint(mintAmount, {from: minter});
        })
      });

      truffleAssert.eventEmitted(res, 'AccrueInterest');
      truffleAssert.eventEmitted(res, 'AccrueDFL');
      truffleAssert.eventEmitted(res, 'Mint', (ev) => {
        return ev.minter == minter
              && etherUnsigned(ev.mintAmount).isEqualTo(mintAmount)
              && etherUnsigned(ev.mintTokens).isEqualTo(mintTokens);
      });
      truffleAssert.eventEmitted(res, 'Transfer', (ev) => {
        return ev.from == minter
              && ev.to == defil.address
              && etherUnsigned(ev.amount).isEqualTo(mintAmount);
      });
      truffleAssert.eventEmitted(res, 'Transfer', (ev) => {
        return ev.from == defil.address
              && ev.to == minter
              && etherUnsigned(ev.amount).isEqualTo(mintTokens);
      });
    });

    it("Should failed if not allowed", async () => {
      const mintAmount = etherExp(10);

      await defil._setMintAllowed(false);
      const res = await withTotalSupplyChecked(defil, zeroAmount, async () => {
        return await withBalanceChecked(defil, minter, zeroAmount, async () => {
          return await defil.mint(mintAmount, {from: minter});
        })
      });

      truffleAssert.eventEmitted(res, 'AccrueInterest');
      truffleAssert.eventEmitted(res, 'AccrueDFL');
      truffleAssert.eventEmitted(res, 'Failure', (ev) => {
        return ev.error == 3 && ev.info == 14; // Error.REJECTION, FailureInfo.MINT_REJECTION
      });
    });

    it("Should success if reset to allowed", async () => {
      const mintAmount = etherExp(10);
      const mintTokens = mintAmount.multipliedBy(1e18).dividedBy(exchangeRate);

      await defil._setMintAllowed(true);
      await defil.eFIL.transfer(minter, mintAmount);
      await defil.eFIL.approve(defil.address, mintAmount, {from: minter});
      const res = await withTotalSupplyChecked(defil, mintTokens, async () => {
        return await withBalanceChecked(defil, minter, mintTokens, async () => {
          return await defil.mint(mintAmount, {from: minter});
        })
      });
    });

    it("Should reverted if insufficient approve", async () => {
      await defil.eFIL.approve(defil.address, etherExp(5), {from: minter});
      await truffleAssert.fails(
          defil.mint(etherExp(10), {from: minter}),
          truffleAssert.ErrorType.REVERT,
          "Insufficient allowance"
      );
    });

    it("Should reverted if insufficient balance", async () => {
      await defil.eFIL.transfer(minter, etherExp(5));
      await defil.eFIL.approve(defil.address, etherExp(10), {from: minter});
      await truffleAssert.fails(
          defil.mint(etherExp(10), {from: minter}),
          truffleAssert.ErrorType.REVERT,
          "Insufficient balance"
      );
    });
  });

  describe('redeem', () => {
    beforeEach(async () => {
      await defil.harnessFastForward(1);
    });

    it("Should successfully redeem by tokens", async () => {
      const mintAmount = etherExp(10);
      const mintTokens = mintAmount.multipliedBy(1e18).dividedBy(exchangeRate);
      const redeemAmount = mintAmount;
      const redeemTokens = mintTokens;

      await defil.eFIL.transfer(minter, mintAmount);
      await defil.eFIL.approve(defil.address, mintAmount, {from: minter});
      await defil.mint(mintAmount, {from: minter});
      await defil.harnessFastForward(1);
      const res = await withTotalSupplyChecked(defil, mintTokens.negated(), async () => {
        return await withBalanceChecked(defil, minter, mintTokens.negated(), async () => {
          return await defil.redeem(redeemTokens, {from: minter});
        })
      });

      truffleAssert.eventEmitted(res, 'AccrueInterest');
      truffleAssert.eventEmitted(res, 'AccrueDFL');
      truffleAssert.eventEmitted(res, 'DistributedDFL');
      truffleAssert.eventEmitted(res, 'Redeem', (ev) => {
        return ev.redeemer == minter
              && etherUnsigned(ev.redeemAmount).isEqualTo(redeemAmount)
              && etherUnsigned(ev.redeemTokens).isEqualTo(redeemTokens);
      });
      truffleAssert.eventEmitted(res, 'Transfer', (ev) => {
        return ev.from == minter
              && ev.to == defil.address
              && etherUnsigned(ev.amount).isEqualTo(redeemTokens);
      });
      truffleAssert.eventEmitted(res, 'Transfer', (ev) => {
        return ev.from == defil.address
              && ev.to == minter
              && etherUnsigned(ev.amount).isEqualTo(redeemAmount);
      });
    });

    it("Should successfully redeem by amount", async () => {
      const mintAmount = etherExp(10);
      const mintTokens = mintAmount.multipliedBy(1e18).dividedBy(exchangeRate);
      const redeemAmount = mintAmount;

      await defil.eFIL.transfer(minter, mintAmount);
      await defil.eFIL.approve(defil.address, mintAmount, {from: minter});
      await defil.mint(mintAmount, {from: minter});
      await defil.harnessFastForward(1);
      const res = await withTotalSupplyChecked(defil, mintTokens.negated(), async () => {
        return await withBalanceChecked(defil, minter, mintTokens.negated(), async () => {
          return await defil.redeemUnderlying(redeemAmount, {from: minter});
        })
      });

      truffleAssert.eventEmitted(res, 'AccrueInterest');
      truffleAssert.eventEmitted(res, 'AccrueDFL');
      truffleAssert.eventEmitted(res, 'DistributedDFL');
    });

    it("Should failed if insufficient cash", async () => {
      const mintAmount = etherExp(10);
      const mintTokens = mintAmount.multipliedBy(1e18).dividedBy(exchangeRate);
      const redeemTokens = mintTokens;

      await defil.eFIL.transfer(minter, mintAmount);
      await defil.eFIL.approve(defil.address, mintAmount, {from: minter});
      await defil.mint(mintAmount, {from: minter});
      await defil.harnessFastForward(1);

      // set balance of defil.address to 1 eFIL
      await defil.eFIL.harnessSetBalance(defil.address, etherExp(1));
      await defil.harnessSetTotalBorrows(etherExp(9));

      const res = await withTotalSupplyChecked(defil, zeroAmount, async () => {
        return await withBalanceChecked(defil, minter, zeroAmount, async () => {
          return await defil.redeem(redeemTokens, {from: minter});
        })
      });
      truffleAssert.eventEmitted(res, 'Failure', (ev) => {
        return ev.error == 6 && ev.info == 24; // Error.TOKEN_INSUFFICIENT_CASH, FailureInfo.REDEEM_TRANSFER_OUT_NOT_POSSIBLE
      });

      truffleAssert.eventEmitted(res, 'AccrueInterest');
      truffleAssert.eventEmitted(res, 'AccrueDFL');
      truffleAssert.eventEmitted(res, 'DistributedDFL');
    });
  });
});

