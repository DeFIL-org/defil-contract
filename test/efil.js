const EFIL = artifacts.require("EFIL");

/*
 * uncomment accounts to access the test accounts made available by the
 * Ethereum client
 * See docs: https://www.trufflesuite.com/docs/truffle/testing/writing-tests-in-javascript
 */
contract("EFIL", function ( accounts ) {
  it("eFil mint test!", async function () {
    let ctr = await EFIL.deployed();
    await ctr.mint(accounts[1], 100, {from: accounts[0]});
    let b = await ctr.balanceOf(accounts[1], {from: accounts[1]});
    console.log("BN: ", b);
    let balance = b.toNumber();
    let holders = await ctr.holdersCount();
    console.log("holder: ", holders.toNumber());
    assert.isTrue(holders.toNumber() == 1);
    return assert.isTrue(balance == 100);
  });
  it("eFil burn test!", async function (){
    let ctr = await EFIL.deployed();
    await ctr.mint(accounts[1], 100, {from: accounts[0]});
    let b = await ctr.balanceOf(accounts[1], {from: accounts[1]});
    console.log("BN: ", b);
    let balance = b.toNumber();
    console.log("balance: ", b.toNumber());
    if (balance == 200) {
      await ctr.burn(200, {from: accounts[1]});
      b = await ctr.balanceOf(accounts[1], {from: accounts[1]});
      assert.isTrue(0 == b.toNumber());
    }else{
      assert.isTrue(false);
    }
  });
  it("eFil transfer test", async function (){
    let ctr = await EFIL.deployed();
    await ctr.mint(accounts[1], 100, {from: accounts[0]});
    let b = await ctr.balanceOf(accounts[1], {from: accounts[1]});
    let balance = b.toNumber();
    if (balance == 100) {
      await ctr.transfer(accounts[2], 50, {from: accounts[1]});
      let b2 = await ctr.balanceOf(accounts[2], {from: accounts[2]});
      assert.isTrue(b2.toNumber() == 50);
    } else {
      assert.isTrue(false);
    }
  })
  it("eFil transfer test 2", async function (){
    let ctr = await EFIL.deployed();
    await ctr.mint(accounts[1], 100, {from: accounts[0]});
    let b = await ctr.balanceOf(accounts[1], {from: accounts[1]});
    let balance = b.toNumber();
    console.log("balance: ", balance);
    if (balance == 100) {
      await ctr.transfer(accounts[0], 50, {from: accounts[1]});
      let b2 = await ctr.balanceOf(accounts[0], {from: accounts[0]});
      assert.isTrue(b2.toNumber() == 50);
    } else {
      assert.isTrue(false);
    }
  })
  it("eFil release test", async function (){
    let ctr = await EFIL.deployed();
    let myData = [0x01, 0x02, 0x03, 0x1f];
    await ctr.release(myData, 10, {from: accounts[1]});
    let b = await ctr.balanceOf(accounts[1], {from: accounts[1]});
    let balance = b.toNumber();
    assert.isTrue(balance == 40);
  });
  it("eFil Pausable test", async function (){
    let ctr = await EFIL.deployed();
    await ctr.pause({from: accounts[0]});
    let res = await ctr.transfer(accounts[2], 50, {from: accounts[1]});
    assert.isFalse(res);
  });

});
