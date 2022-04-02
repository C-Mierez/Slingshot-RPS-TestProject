// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockDAI is ERC20 {
    constructor() ERC20("MockDAI", "DAI") {}

    function faucet(uint256 _amount) public {
        _mint(msg.sender, _amount);
    }
}
