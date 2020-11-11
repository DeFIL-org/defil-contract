const truffleAssert = require('truffle-assertions');
const BigNumber = require('bignumber.js');
const {
  etherExp,
  etherUnsigned,
  UInt256Max,
} = require('../Utils/Ethereum');

const {
  makeDeFIL,
  balanceOf,
  totalSupply,
  withTotalSupplyChecked,
  withBalanceChecked,
  zeroAmount,
} = require('./Helper.js');

const borrowAmount = etherExp(10e3);
const repayAmount = etherExp(10e2);

async function preBorrow(defil, borrower, borrowAmount, collaterals) {
  await defil._setBorrowAllowed(true);
  await defil.eFIL.harnessSetBalance(defil.address, borrowAmount);
  await defil.harnessSetTotalBorrows(0);
  await defil.harnessSetAccountBorrows(borrower, 0, 0);
  await defil.harnessSetCollaterals(borrower, collaterals);
}

async function pretendBorrow(defil, borrower, accountIndex, marketIndex, principalRaw, blockNumber = 2e7) {
  await defil.harnessSetTotalBorrows(principalRaw);
  await defil.harnessSetAccountBorrows(borrower, principalRaw, etherUnsigned(accountIndex));
  await defil.harnessSetBorrowIndex(etherUnsigned(marketIndex));
  await defil.harnessSetAccrualBlockNumber(etherUnsigned(blockNumber));
  await defil.harnessSetDflAccrualBlockNumber(etherUnsigned(blockNumber));
  await defil.harnessSetNextHalveBlockNumber(etherUnsigned(blockNumber));
  await defil.harnessSetBlockNumber(etherUnsigned(blockNumber));
}

async function preApprove(token, src, spender, amount) {
  await token.harnessSetBalance(src, amount);
  await token.approve(spender, amount, {from: src});
}

async function preRepay(defil, benefactor, borrower, repayAmount) {
  // setup either benefactor OR borrower for success in repaying
  await pretendBorrow(defil, borrower, 1, 1, repayAmount);
  await defil.eFIL.harnessSetBalance(defil.address, etherUnsigned(0));
  await preApprove(defil.eFIL, benefactor, defil.address, repayAmount);
  await preApprove(defil.eFIL, borrower, defil.address, repayAmount);
}

contract('DeFIL', function (accounts) {
  let defil, borrower, benefactor;
  beforeEach(async () => {
    defil = await makeDeFIL(accounts);
    borrower = defil.userAccounts[0];
    benefactor = defil.userAccounts[1];
  });

  describe('borrowFresh', () => {
    beforeEach(async () => {
      await preBorrow(defil, borrower, borrowAmount, borrowAmount)
    });

    it("Should successfully borrow", async () => {
      const res = await defil.harnessBorrowFresh(borrower, borrowAmount);
      const snapshot = await defil.harnessAccountBorrows(borrower);
      const borrowIndex = etherUnsigned(await defil.borrowIndex());
      assert.ok(etherUnsigned(snapshot.principal).isEqualTo(borrowAmount), "borrowBalance mismatch");
      assert.ok(etherUnsigned(snapshot.interestIndex).isEqualTo(borrowIndex), "interestIndex mismatch");
      assert.ok(etherUnsigned(await defil.totalBorrows()).isEqualTo(borrowAmount), "totalBorrows mismatch");
      truffleAssert.eventEmitted(res, 'Borrow', (ev) => {
        return ev.borrower == borrower
              && etherUnsigned(ev.borrowAmount).isEqualTo(borrowAmount)
              && etherUnsigned(ev.accountBorrows).isEqualTo(borrowAmount)
              && etherUnsigned(ev.totalBorrows).isEqualTo(borrowAmount);
      });
      truffleAssert.eventEmitted(res, 'Transfer', (ev) => {
        return ev.from == defil.address
              && ev.to == borrower
              && etherUnsigned(ev.amount).isEqualTo(borrowAmount);
      });

      assert.ok((await balanceOf(defil.eFIL, defil.address)).isEqualTo(0), "eFIL balance mismatch");
      assert.ok((await balanceOf(defil.eFIL, borrower)).isEqualTo(borrowAmount), "eFIL balance mismatch");
    });

    it("fails if not allowed", async () => {
      await defil._setBorrowAllowed(false);
      const res = await defil.harnessBorrowFresh(borrower, borrowAmount);
      truffleAssert.eventEmitted(res, 'Failure', (ev) => {
        return ev.error == 3 && ev.info == 12; // Error.REJECTION, FailureInfo.BORROW_REJECTION
      });
    });

    it("success if reset to allowed", async () => {
      const res = await defil.harnessBorrowFresh(borrower, borrowAmount);
      truffleAssert.eventEmitted(res, 'Borrow');
    });

    it("success if borrow max available", async () => {
      const res = await defil.harnessBorrowFresh(borrower, UInt256Max());
      truffleAssert.eventEmitted(res, 'Borrow', (ev) => {
        return ev.borrower == borrower
              && etherUnsigned(ev.borrowAmount).isEqualTo(borrowAmount)
              && etherUnsigned(ev.accountBorrows).isEqualTo(borrowAmount)
              && etherUnsigned(ev.totalBorrows).isEqualTo(borrowAmount);
      });
    });

    it("success if borrow multiple times", async () => {
      const dividedAmount = borrowAmount.dividedBy(4);
      await defil.harnessBorrowFresh(borrower, dividedAmount);
      const res = await defil.harnessBorrowFresh(borrower, UInt256Max());
      truffleAssert.eventEmitted(res, 'Borrow', (ev) => {
        return ev.borrower == borrower
              && etherUnsigned(ev.borrowAmount).isEqualTo(borrowAmount.minus(dividedAmount))
              && etherUnsigned(ev.accountBorrows).isEqualTo(borrowAmount)
              && etherUnsigned(ev.totalBorrows).isEqualTo(borrowAmount);
      });
    });

    it("fails if insufficient collaterals", async () => {
      await defil.harnessSetCollaterals(borrower, borrowAmount.minus(1));
      const res = await defil.harnessBorrowFresh(borrower, borrowAmount);
      truffleAssert.eventEmitted(res, 'Failure', (ev) => {
        return ev.error == 9 && ev.info == 13; // Error.INSUFFICIENT_COLLATERAL, FailureInfo.BORROW_INSUFFICIENT_COLLATERAL
      });
    });

    it("fails if insufficient eFIL", async () => {
      const res = await defil.harnessBorrowFresh(borrower, borrowAmount.plus(1));
      truffleAssert.eventEmitted(res, 'Failure', (ev) => {
        return ev.error == 6 && ev.info == 9; // Error.TOKEN_INSUFFICIENT_CASH, FailureInfo.BORROW_CASH_NOT_AVAILABLE
      });
    });

    // it("fails if calculating account new total borrow balance overflows", async () => {  // javascript是一坨屎
      // await pretendBorrow(defil, borrower, 1e-18, 1e-18, UInt256Max());
      // const res = await defil.harnessBorrowFresh(borrower, borrowAmount);
      // truffleAssert.eventEmitted(res, 'Failure', (ev) => {
        // return ev.error == 4 && ev.info == 11; // Error.MATH_ERROR, FailureInfo.BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED
      // });
    // });

    it("fails if calculation of new total borrow balance overflows", async () => {
      await defil.harnessSetTotalBorrows(UInt256Max())
      const res = await defil.harnessBorrowFresh(borrower, borrowAmount);
      truffleAssert.eventEmitted(res, 'Failure', (ev) => {
        return ev.error == 4 && ev.info == 10; // Error.MATH_ERROR, FailureInfo.BORROW_NEW_TOTAL_BALANCE_CALCULATION_FAILED
      });
    });
  });

  describe('borrow', () => {
    beforeEach(async () => {
      await preBorrow(defil, borrower, borrowAmount, borrowAmount)
    });

    it("emits AccrueInterest/AccrueDFL events", async () => {
      await defil.harnessFastForward(1);
      const res = await defil.borrow(borrowAmount, {from: borrower});
      truffleAssert.eventEmitted(res, 'AccrueInterest');
      truffleAssert.eventEmitted(res, 'AccrueDFL');
    });
  });

  describe('repayBorrowFresh', () => {
    [true, false].forEach((benefactorIsPayer) => {
      let payer;
      const label = benefactorIsPayer ? "benefactor paying" : "borrower paying";
      describe(label, () => {
        beforeEach(async () => {
          payer = benefactorIsPayer ? benefactor : borrower;
          await preRepay(defil, payer, borrower, repayAmount);
        });

        it("Should successfully repayed borrow", async () => {
          const res = await defil.harnessRepayBorrowFresh(payer, borrower, repayAmount);
          const snapshot = await defil.harnessAccountBorrows(borrower);
          const borrowIndex = etherUnsigned(await defil.borrowIndex());
          assert.ok(etherUnsigned(snapshot.principal).isEqualTo(etherUnsigned(0)), "borrowBalance mismatch");
          assert.ok(etherUnsigned(snapshot.interestIndex).isEqualTo(borrowIndex), "interestIndex mismatch");
          assert.ok(etherUnsigned(await defil.totalBorrows()).isEqualTo(etherUnsigned(0)), "totalBorrows mismatch");
          truffleAssert.eventEmitted(res, 'RepayBorrow', (ev) => {
            return ev.payer == payer
                  && ev.borrower == borrower
                  && etherUnsigned(ev.repayAmount).isEqualTo(repayAmount)
                  && etherUnsigned(ev.accountBorrows).isEqualTo(etherUnsigned(0))
                  && etherUnsigned(ev.totalBorrows).isEqualTo(etherUnsigned(0));
          });
          truffleAssert.eventEmitted(res, 'Transfer', (ev) => {
            return ev.from == payer
                  && ev.to == defil.address
                  && etherUnsigned(ev.amount).isEqualTo(repayAmount);
          });

          assert.ok((await balanceOf(defil.eFIL, defil.address)).isEqualTo(repayAmount), "eFIL balance mismatch");
          assert.ok((await balanceOf(defil.eFIL, payer)).isEqualTo(etherUnsigned(0)), "eFIL balance mismatch");
        });

        it("fails if insufficient approve", async () => {
          await preApprove(defil.eFIL, payer, defil.address, repayAmount.dividedBy(2));
          await truffleAssert.fails(
              defil.harnessRepayBorrowFresh(payer, borrower, repayAmount),
              truffleAssert.ErrorType.REVERT,
              "Insufficient allowance"
          );
        });

        it("fails if insufficient balance", async () => {
          await defil.eFIL.harnessSetBalance(payer, repayAmount.dividedBy(2));
          await truffleAssert.fails(
              defil.harnessRepayBorrowFresh(payer, borrower, repayAmount),
              truffleAssert.ErrorType.REVERT,
              "Insufficient balance"
          );
        });
      });
    });
  });

  describe('reayBorrow', () => {
    beforeEach(async () => {
      await preRepay(defil, benefactor, borrower, repayAmount);
    });

    it("emits AccrueInterest/AccrueDFL events", async () => {
      await defil.harnessFastForward(1);
      const res = await defil.repayBorrow(repayAmount, {from: borrower});
      truffleAssert.eventEmitted(res, 'AccrueInterest');
      truffleAssert.eventEmitted(res, 'AccrueDFL');
      truffleAssert.eventEmitted(res, 'RepayBorrow');
    });
  });

  describe('reayBorrowBehalf', () => {
    beforeEach(async () => {
      await preRepay(defil, benefactor, borrower, repayAmount);
    });

    it("emits AccrueInterest/AccrueDFL events", async () => {
      await defil.harnessFastForward(1);
      const res = await defil.repayBorrowBehalf(borrower, repayAmount, {from: benefactor});
      truffleAssert.eventEmitted(res, 'AccrueInterest');
      truffleAssert.eventEmitted(res, 'AccrueDFL');
    });
  });
});

