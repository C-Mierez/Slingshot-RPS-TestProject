// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/* -------------------------------------------------------------------------- */
/*                                   Errors                                   */
/* -------------------------------------------------------------------------- */
error UserAlreadyHosting(address user);
error ZeroValue(uint256 value);
error AmountExceedsBalance(uint256 amount, uint256 balance);
error ZeroBalance(uint256 balance);

/// @title RPS
/// @author CMierez
/// @notice RockPaperScissors game for peer-to-peer match-ups.
contract RPS {
    /* -------------------------------------------------------------------------- */
    /*                                 Assumptions                                */
    /* -------------------------------------------------------------------------- */
    /* I have decided to:
     * - Make the game Peer-to-Peer. This means, each game is bound to the user that
     * created it. And thus to participate in a game, the game's "ID" is the user's
     * address.
     * - A user can only have one active hosted game at a time.
     * - A user can participate in many games at the same time, whether they are
     * - hosting a game or not.
     *
     * - I do not keep historical records of the games. When a user creates a new
     * game, all the information of the previous one is overwritten. IMO this kind
     * of data would be better off kept out of the contract to save on storage use,
     * and if needed, it can be aggregated from a subgraph using the emitted events.
     *
     * I manage the user balances and rewards by a "Credits" system, this way I can
     * avoid transferring tokens around unless strictly necessary. (Only when
     * deposited or claimed)
     *
     * @dev I'm using Chainlink's notation for storage variables prefixed with "s_"
     */

    /// @notice The game's ERC20 token used for playing.
    IERC20 public s_gameToken;

    /// @notice State to represent the phase a game is in.
    /// @dev Used to determine whether action Commits or Reveals are
    /// accepted.
    enum GameState {
        Closed,
        Betting,
        Revealing
    }

    /// @notice The information used for the game-specific logic.
    struct GameData {
        uint256 bet;
        bytes32 action1;
        bytes32 action2;
    }

    /// @dev The following mappings are separated to avoid having to load a whole
    /// struct when accessing the states, which will be a common operation. Only the
    /// game-specific info is stored in a struct.

    /// @notice Matches a user to its game's data, which includes the bet and actions
    /// User -> GameData
    mapping(address => GameData) public s_gameData;

    /// @notice Matches a user to its game's state.
    /// @dev When the state is not [GameState.Closed] it can be interpreted as the
    /// user having an open game, thus they can't start a new one until it's closed.
    /// User -> GameState
    mapping(address => GameState) public s_gameState;

    /// @notice The credit balance of each user.
    mapping(address => uint256) public s_creditBalance;

    /* ------------------------------- Constructor ------------------------------ */
    constructor(IERC20 _gameToken) {
        s_gameToken = _gameToken;
    }

    /* -------------------------------- Modifiers ------------------------------- */
    modifier checkNonZeroValue(uint256 _amount) {
        if (_amount == 0) revert ZeroValue(0);
        _;
    }

    modifier checkNonZeroBalance(address _user) {
        if (s_creditBalance[_user] == 0) revert ZeroBalance(0);
        _;
    }

    /* ---------------------------------- Game ---------------------------------- */
    function hostWithCredit(uint256 _bet) public {
        if (s_gameState[msg.sender] != GameState.Closed)
            revert UserAlreadyHosting(msg.sender);

        if (s_creditBalance[msg.sender] < _bet)
            revert AmountExceedsBalance(_bet, s_creditBalance[msg.sender]);

        s_creditBalance[msg.sender] -= _bet;
        s_gameState[msg.sender] = GameState.Betting;
        s_gameData[msg.sender].bet = _bet;

        emit HostedGame(msg.sender, _bet);
    }

    /* --------------------------------- Credits -------------------------------- */
    function depositWithPermit(uint256 _amount)
        external
        checkNonZeroValue(_amount)
    {
        s_creditBalance[msg.sender] += _amount;
        s_gameToken.transferFrom(msg.sender, address(this), _amount);

        emit Deposited(msg.sender, _amount);
    }

    function withdrawExact(uint256 _amount)
        public
        checkNonZeroBalance(msg.sender)
        checkNonZeroValue(_amount)
    {
        if (_amount > s_creditBalance[msg.sender])
            revert AmountExceedsBalance(_amount, s_creditBalance[msg.sender]);

        s_creditBalance[msg.sender] -= _amount;
        s_gameToken.transfer(msg.sender, _amount);

        emit Withdrawn(msg.sender, _amount);
    }

    function withdrawAll() external checkNonZeroBalance(msg.sender) {
        // Checks are done in the underlying function
        withdrawExact(s_creditBalance[msg.sender]);
    }

    /* --------------------------------- Events --------------------------------- */
    event HostedGame(address indexed user, uint256 _bet);

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
}
