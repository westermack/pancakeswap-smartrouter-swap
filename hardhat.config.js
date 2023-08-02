require("@nomicfoundation/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.7.5",
  networks: {
    hardhat: {
      forking: {
        //url: "https://mainnet.infura.io/v3/2d0f23d46f3242c5ab27e0280afd7aaf",
        //url: "https://data-seed-prebsc-1-s1.binance.org:8545",
        url: "https://bsc-dataseed1.binance.org",
      },
    },
  },
};
