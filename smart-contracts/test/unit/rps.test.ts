import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { RPS, MockDAI } from "../../typechain";
import { BigNumber } from "ethers";

describe("RPS", () => {
  let _owner: SignerWithAddress;
  let _signerA: SignerWithAddress;
  let _signerB: SignerWithAddress;
  let _signers: SignerWithAddress[];

  let rps: RPS;
  let daiToken: MockDAI;

  // These Errors could be defined elsewhere
  enum Error_ERC20 {
    InsufficientBalance = "ERC20: transfer amount exceeds balance",
    InsufficientAllowance = "ERC20: insufficient allowance",
  }
  enum Error_RPS {
    ZeroValue = "ZeroValue",
    ZeroBalance = "ZeroBalance",
    AmountExceedsBalance = "AmountExceedsBalance",
    UserAlreadyHosting = "UserAlreadyHosting",
  }

  const fundWithERC20 = async (
    _signers: SignerWithAddress[],
    _amount?: string
  ) => {
    const amount = ethers.utils.parseEther(_amount || "1000");
    for (const signer of _signers) {
      await daiToken.connect(signer).faucet(amount);
    }
  };

  beforeEach(async () => {
    const [owner, signerA, signerB, ...signers] = await ethers.getSigners();
    _owner = owner;
    _signerA = signerA;
    _signerB = signerB;
    _signers = signers;
    daiToken = await (await ethers.getContractFactory("MockDAI")).deploy();

    rps = await (
      await ethers.getContractFactory("RPS")
    ).deploy(daiToken.address);
  });

  describe("Deployment", () => {
    it("should deploy the contract", async () => {
      expect(rps.address).to.exist;
    });

    it("should have a correct erc20 address as a game token", async () => {
      expect(await rps.s_gameToken()).to.equal(daiToken.address);
    });
  });

  describe("Credit Balance", () => {
    it("should have an initial zero credit balance for users", async () => {
      expect(await rps.s_creditBalance(_owner.address)).to.equal(0);
      expect(await rps.s_creditBalance(_signerA.address)).to.equal(0);
    });

    describe("Deposit", () => {
      it("should revert when user does not have enough token allowance", async () => {
        // Arrange
        const depositTx = rps
          .connect(_owner)
          .depositWithPermit(ethers.utils.parseEther("1"));

        // Assert
        await expect(depositTx).to.be.revertedWith(
          Error_ERC20.InsufficientAllowance
        );
        expect(await daiToken.allowance(_owner.address, rps.address)).to.equal(
          0
        );
      });

      it("should revert when user does not have enough tokens to deposit", async () => {
        // Arrange
        const amount = ethers.utils.parseEther("1");
        await daiToken.connect(_owner).increaseAllowance(rps.address, amount);

        const depositTx = rps.connect(_owner).depositWithPermit(amount);

        // Assert
        await expect(depositTx).to.be.revertedWith(
          Error_ERC20.InsufficientBalance
        );
      });

      it("should allow any user to deposit tokens", async () => {
        // Arrange
        const owner_amount = ethers.utils.parseEther("1");
        const signerA_amount = ethers.utils.parseEther("1");

        await fundWithERC20([_owner, _signerA]);

        const owner_initialBal = await daiToken.balanceOf(_owner.address);
        const signerA_initialBal = await daiToken.balanceOf(_signerA.address);

        await daiToken
          .connect(_owner)
          .increaseAllowance(rps.address, owner_amount);
        await daiToken
          .connect(_signerA)
          .increaseAllowance(rps.address, signerA_amount);
        // Act
        await rps.connect(_owner).depositWithPermit(owner_amount);
        await rps.connect(_signerA).depositWithPermit(signerA_amount);

        // Assert
        const owner_expected_balance = owner_initialBal.sub(owner_amount);
        const signerA_expected_balance = signerA_initialBal.sub(signerA_amount);

        // Wallet balance should have subtracted the amount
        expect(await daiToken.balanceOf(_owner.address)).to.equal(
          owner_expected_balance
        );
        expect(await daiToken.balanceOf(_signerA.address)).to.equal(
          signerA_expected_balance
        );

        // Contract credit balance should have the sent amount
        expect(await rps.s_creditBalance(_owner.address)).to.equal(
          owner_amount
        );
        expect(await rps.s_creditBalance(_signerA.address)).to.equal(
          signerA_amount
        );
      });

      it("should revert when staking zero tokens", async () => {
        // Arrange
        const amount = 0;
        await daiToken.connect(_owner).increaseAllowance(rps.address, amount);

        const depositTx = rps.connect(_owner).depositWithPermit(amount);

        // Assert
        await expect(depositTx).to.be.revertedWith(Error_RPS.ZeroValue);
      });

      it("should emit a Deposited event", async () => {
        // Arrange
        const amount = ethers.utils.parseEther("1");
        await fundWithERC20([_owner]);
        await daiToken.connect(_owner).increaseAllowance(rps.address, amount);

        // Act
        const depositTx = rps.connect(_owner).depositWithPermit(amount);

        // Assert
        await expect(depositTx)
          .to.emit(rps, "Deposited")
          .withArgs(_owner.address, amount);
      });
    });

    describe("Withdraw Exact", () => {
      it("should allow any user to withdraw all tokens", async () => {
        // Arrange
        const amount = ethers.utils.parseEther("1");
        await fundWithERC20([_owner]);

        const owner_initialBal = await daiToken.balanceOf(_owner.address);

        await daiToken.increaseAllowance(rps.address, amount);
        await rps.depositWithPermit(amount);

        // Act
        await rps.withdrawExact(amount);

        // Assert
        expect(await daiToken.balanceOf(_owner.address)).to.equal(
          owner_initialBal
        );

        expect(await rps.s_creditBalance(_owner.address)).to.equal(0);
      });

      it("should allow any user to partially withdraw tokens", async () => {
        // Arrange
        const amount = ethers.utils.parseEther("1");
        await fundWithERC20([_owner]);

        const owner_initialBal = await daiToken.balanceOf(_owner.address);

        await daiToken.increaseAllowance(rps.address, amount);
        await rps.depositWithPermit(amount);

        // Act
        await rps.withdrawExact(amount.div(2));

        // Assert
        expect(await daiToken.balanceOf(_owner.address)).to.equal(
          owner_initialBal.sub(amount.div(2))
        );

        expect(await rps.s_creditBalance(_owner.address)).to.equal(
          amount.div(2)
        );
      });

      it("should revert when user does not have enough tokens to withdraw", async () => {
        // Arrange
        const amount = ethers.utils.parseEther("1");
        await fundWithERC20([_owner]);

        await daiToken.increaseAllowance(rps.address, amount);
        await rps.depositWithPermit(amount);

        // Act
        const withdrawTx = rps.withdrawExact(
          amount.add(ethers.utils.parseEther("1"))
        );

        // Assert
        await expect(withdrawTx).to.be.revertedWith(
          Error_RPS.AmountExceedsBalance
        );
      });

      it("should revert when user withdraws a zero ", async () => {
        // Arrange
        const amount = ethers.utils.parseEther("1");
        await fundWithERC20([_owner]);

        await daiToken.increaseAllowance(rps.address, amount);
        await rps.depositWithPermit(amount);

        // Act
        const withdrawTx = rps.withdrawExact(0);

        // Assert
        await expect(withdrawTx).to.be.revertedWith(Error_RPS.ZeroValue);
      });

      it("should revert when user withdraws with zero balance", async () => {
        // Arrange
        const amount = ethers.utils.parseEther("1");
        await fundWithERC20([_owner]);

        // Act
        const withdrawTx = rps.withdrawExact(amount);

        // Assert
        await expect(withdrawTx).to.be.revertedWith(Error_RPS.ZeroBalance);
      });

      it("should emit a Withdrawn event", async () => {
        // Arrange
        const amount = ethers.utils.parseEther("1");
        await fundWithERC20([_owner]);

        await daiToken.increaseAllowance(rps.address, amount);
        await rps.depositWithPermit(amount);

        // Act
        const withdrawTx = rps.withdrawExact(amount);

        // Assert
        await expect(withdrawTx)
          .to.emit(rps, "Withdrawn")
          .withArgs(_owner.address, amount);
      });
    });

    describe("Withdraw All", () => {
      it("should allow any user to withdraw all tokens", async () => {
        // Arrange
        const amount = ethers.utils.parseEther("1");
        await fundWithERC20([_owner]);

        const owner_initialBal = await daiToken.balanceOf(_owner.address);

        await daiToken.increaseAllowance(rps.address, amount);
        await rps.depositWithPermit(amount);

        // Act
        await rps.withdrawAll();

        // Assert
        expect(await daiToken.balanceOf(_owner.address)).to.equal(
          owner_initialBal
        );

        expect(await rps.s_creditBalance(_owner.address)).to.equal(0);
      });

      it("should revert when user withdraws with zero balance", async () => {
        // Arrange
        const amount = ethers.utils.parseEther("1");
        await fundWithERC20([_owner]);

        // Act
        const withdrawTx = rps.withdrawAll();

        // Assert
        await expect(withdrawTx).to.be.revertedWith(Error_RPS.ZeroBalance);
      });

      it("should emit a Withdrawn event", async () => {
        // Arrange
        const amount = ethers.utils.parseEther("1");
        await fundWithERC20([_owner]);

        await daiToken.increaseAllowance(rps.address, amount);
        await rps.depositWithPermit(amount);

        // Act
        const withdrawTx = rps.withdrawAll();

        // Assert
        await expect(withdrawTx)
          .to.emit(rps, "Withdrawn")
          .withArgs(_owner.address, amount);
      });
    });
  });

  describe("Game Hosting", () => {
    enum GameState {
      Closed = 0,
      Betting = 1,
      Revealing = 2,
    }
    describe("Host Game with Credit", () => {
      beforeEach("fund with DAI", async () => {
        await fundWithERC20([_owner, _signerA, _signerB]);
      });

      beforeEach("deposit tokens", async () => {
        const amount = ethers.utils.parseEther("10");

        const signers = [_owner, _signerA];
        for (const signer of signers) {
          await daiToken.connect(signer).increaseAllowance(rps.address, amount);
          await rps.connect(signer).depositWithPermit(amount);
        }
      });

      it("should allow hosting a game with credits", async () => {
        // Arrange
        const bet = ethers.utils.parseEther("1");
        const initialCredits = await rps.s_creditBalance(_owner.address);
        const initialGameState = await rps.s_gameState(_owner.address);

        // Act
        await rps.hostWithCredit(bet);

        // Assert
        const expectedCredits = initialCredits.sub(bet);

        expect(await rps.s_creditBalance(_owner.address)).to.equal(
          expectedCredits
        );

        const expectedGameState = GameState.Betting;
        expect(await rps.s_gameState(_owner.address)).to.equal(
          expectedGameState
        );
        const gameData = await rps.s_gameData(_owner.address);
        expect(gameData.bet).to.equal(bet);
        // expect(await (await rps.s_gameData(_owner.address)).action1).to.equal(action);
      });

      it("should revert when user tries to host a game with credits and zero credit balance", async () => {
        // Arrange
        const bet = ethers.utils.parseEther("1");
        await rps.connect(_owner).withdrawAll();

        // Act
        const hostGameTx = rps.hostWithCredit(bet);

        // Assert
        await expect(hostGameTx).to.be.revertedWith(
          Error_RPS.AmountExceedsBalance
        );
      });

      it("should revert when the user is already hosting a game", async () => {
        // Arrange
        const bet = ethers.utils.parseEther("1");
        await rps.hostWithCredit(bet);

        const expectedGameState = GameState.Betting;
        expect(await rps.s_gameState(_owner.address)).to.equal(
          expectedGameState
        );
        // Act
        const hostGameTx = rps.hostWithCredit(bet);

        // Assert
        await expect(hostGameTx).to.be.revertedWith(
          Error_RPS.UserAlreadyHosting
        );
      });

      it("should emit a HostedGame event", async () => {
        // Arrange
        const bet = ethers.utils.parseEther("1");

        // Act
        const hostTx = await rps.hostWithCredit(bet);

        // Assert
        await expect(hostTx)
          .to.emit(rps, "HostedGame")
          .withArgs(_owner.address, bet);
      });
    });
  });
});
