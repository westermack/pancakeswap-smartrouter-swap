const hardhatDev = require("hardhat");
require("dotenv").config();
const fetch = require("node-fetch");
globalThis.fetch = fetch;
const {
  CurrencyAmount,
  TradeType,
  ChainId,
  Percent,
  Native,
} = require("@pancakeswap/sdk");
const {
  SmartRouter,
  SmartRouterTrade,
  SMART_ROUTER_ADDRESSES,
  SwapRouter,
} = require("@pancakeswap/smart-router/evm");
const {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  custom,
  publicActions,
  walletActions,
  parseUnits,
  parseEther,
  hexToBigInt,
} = require("viem");
const { mainnet, bsc, hardhat, foundry } = require("viem/chains");
const { privateKeyToAccount, generatePrivateKey } = require("viem/accounts");
const { GraphQLClient } = require("graphql-request");
const { bscTokens } = require("@pancakeswap/tokens");
const bep20Abi = require("./abis/bep20.json");

const SIGNER_ADDRESS = "0xe2fc31F816A9b94326492132018C3aEcC4a93aE1";
const SIGNER_SECRET = "";
const BSC_RPC_URL = "";

const assetsToBuy = [
  {
    id: 1,
    name: "Bitcoin",
    imternalName: "Binance BTC",
    chainId: 1, //Decide what this means
    symbol: "BTC",
    internalSymbol: "btcb",
    decimals: 18,
    address: "0x8E4b2E6f25C80Cf28Bc33B076471aE8904AE7ed6",
    weight: 0.33,
    //contractAddress: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
  },
  {
    id: 2,
    name: "Ethereum",
    chainId: 1,
    symbol: "ETH",
    internalSymbol: "eth",
    decimals: 18,
    address: "0x85Ad518eB6f17D28f902A745A6Decb7a983fC4Ba",
    weight: 0.33,
    //contractAddress: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
  },
  // {
  //   id: 3,
  //   chainId:1,
  //   name:"BNB",
  //   symbol: "BNB",
  //   internalSymbol: "bnb",
  //   decimals:18,
  //   address: "0xEdDEF4E6843963aE44e579c69B70D05d87E6beA3",
  //   weight: 0.25,
  //   //contractAddress: "",
  // },
  {
    id: 4,
    chainId: 1,
    name: "Ripple",
    symbol: "XRP",
    internalSymbol: "xrp",
    decimals: 18,
    address: "0x8a670a72A929d488BFB4657fb424aBef02F6f7b4",
    weight: 0.33,
    //contractAddress: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
  },
];

const numAssetsToBuy = assetsToBuy.length;

const successfulTX = [];
const failedTX = [];

const chainId = ChainId.BSC;

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
//console.log(account);

const client = createWalletClient({
  account,
  chain: bsc,
  transport: http("https://bsc-dataseed1.binance.org"),
  batch: {
    multicall: {
      batchSize: 1024 * 200,
    },
  },
}).extend(publicActions);

// const testClient = createTestClient({
//   account,
//   chain: hardhat,
//   mode: "hardhat",
//   transport: custom(hardhatDev.ethers.provider),
// });

const v3SubgraphClient = new GraphQLClient(
  "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc"
);
const v2SubgraphClient = new GraphQLClient(
  "https://proxy-worker-api.pancakeswap.com/bsc-exchange"
);

const quoteProvider = SmartRouter.createQuoteProvider({
  onChainProvider: () => client,
});

//const swapFrom = Native.onChain(chainId);
const swapFrom = bscTokens.usdt;

const usdtToSpend = 140000;
const usdtToSpendWei = parseUnits(usdtToSpend.toString(), "18");

const getInputAmount = (weight = 1) => {
  const inputAmountWei = parseUnits((usdtToSpend * weight).toString(), "18");
  return CurrencyAmount.fromRawAmount(swapFrom, inputAmountWei);
};

const getPoolsForSwap = (swapTo) => {
  return Promise.all([
    SmartRouter.getV2CandidatePools({
      onChainProvider: () => client,
      v2SubgraphProvider: () => v2SubgraphClient,
      v3SubgraphProvider: () => v3SubgraphClient,
      currencyA: swapFrom,
      currencyB: swapTo,
    }),
    SmartRouter.getV3CandidatePools({
      onChainProvider: () => client,
      subgraphProvider: () => v3SubgraphClient,
      currencyA: swapFrom,
      currencyB: swapTo,
    }),
  ]);
};

const provider = hardhatDev.ethers.provider;

const getAssetBalance = async (asset) => {
  const assetContract = new hardhatDev.ethers.Contract(
    bscTokens[asset.internalSymbol].address,
    bep20Abi,
    provider
  );

  const assetBalance = await assetContract.balanceOf(asset.address);
  console.log(
    `${asset.symbol.toLocaleUpperCase()} public wallet balance:`,
    hardhatDev.ethers.utils.formatUnits(assetBalance.toString(), 18)
  );
};

const main = async () => {
  //DEVELOPMENT
  console.log("================= BEFORE SWAP");
  const signer = await hardhatDev.ethers.getImpersonatedSigner(SIGNER_ADDRESS);
  const preSwapBNBBalance = await signer.getBalance();
  console.log(
    "BNB balance (used for gas):",
    hardhatDev.ethers.utils.formatEther(preSwapBNBBalance, 18)
  );

  const usdtContract = new hardhatDev.ethers.Contract(
    swapFrom.address,
    bep20Abi,
    provider
  );

  const usdtBalance = await usdtContract.balanceOf(SIGNER_ADDRESS);
  console.log(
    "USDT balance:",
    hardhatDev.ethers.utils.formatUnits(usdtBalance.toString(), 18)
  );
  assetsToBuy.map((asset) => {
    //Display pre-swap asset balance
    getAssetBalance(asset);
  });

  //REFACTOR - probably don't need to instantiate signer again here
  hardhatDev.ethers
    .getImpersonatedSigner(SIGNER_ADDRESS)
    .then((signer) => {
      //console.log(signer);
      //get permission to spend USDT

      const routerAddress = SMART_ROUTER_ADDRESSES[chainId];
      usdtContract
        .connect(signer)
        .approve(routerAddress, usdtToSpendWei.toString())
        .then((res) => {
          //console.log(res);
          console.log("\n");
          console.log(
            "USDT spend permission granted to PancakeSwap SmartRouter..."
          );
          console.log("\n");

          assetsToBuy.map((asset, i) => {
            //loop through each asset to get respective swap pools,
            //then best possible trade from those pools
            const swapTo = bscTokens[asset.internalSymbol];
            getPoolsForSwap(swapTo)
              .then(([v2Pools, v3Pools]) => {
                const pools = [...v2Pools, ...v3Pools];
                SmartRouter.getBestTrade(
                  getInputAmount(asset.weight),
                  swapTo,
                  TradeType.EXACT_INPUT,
                  {
                    gasPriceWei: () => client.getGasPrice(),
                    maxHops: 2,
                    maxSplits: 2,
                    poolProvider: SmartRouter.createStaticPoolProvider(pools),
                    quoteProvider,
                    quoterOptimization: true,
                  }
                )
                  .then((trade) => {
                    if (!trade) {
                      //REVISIT - propely consider this edge case and what
                      //it means in the execution flow
                      return null;
                    }

                    //do swaps, buy all assets in turn

                    //current swap recipient address
                    const address = asset.address;

                    const { value, calldata } = SwapRouter.swapCallParameters(
                      trade,
                      {
                        recipient: address,
                        slippageTolerance: new Percent(1),
                      }
                    );

                    const transaction = {
                      to: routerAddress,
                      data: calldata,
                      value: hexToBigInt(value),
                    };

                    signer
                      .sendTransaction(transaction)
                      .then((res) => {
                        //console.log(res);
                        //save TX hashes to database?
                        successfulTX.push(asset);
                      })
                      .catch((error) => {
                        console.log(error);
                        //count as failed TX and include in array
                        console.log("\n");
                        console.log(
                          `USDT-${asset.symbol.toLocaleUpperCase()} swap failed. Included in failed TXs.`
                        );
                        //REFACTOR - check to see that asset wasn't there before push?
                        failedTX.push(asset);
                      })
                      .finally(() => {
                        //only after last swap-- irrespective of success
                        if (i === numAssetsToBuy - 1) {
                          //display balances after swaps are done
                          console.log("\n");
                          console.log("================= AFTER SWAP");
                          console.log("Failed TXs:", failedTX);
                          console.log("\n");
                          signer.getBalance().then((balance) => {
                            console.log(
                              "Total BNB used for gas:",
                              hardhatDev.ethers.utils.formatEther(
                                preSwapBNBBalance,
                                18
                              ) -
                                hardhatDev.ethers.utils.formatEther(balance, 18)
                            );
                            console.log("\n");
                            console.log(
                              "BNB balance (used for gas):",
                              hardhatDev.ethers.utils.formatEther(balance, 18)
                            );
                          });
                          usdtContract
                            .balanceOf(SIGNER_ADDRESS)
                            .then((balance) =>
                              console.log(
                                "USDT balance:",
                                hardhatDev.ethers.utils.formatUnits(
                                  balance.toString(),
                                  18
                                )
                              )
                            );

                          assetsToBuy.map((asset) => {
                            //Display post-swap asset balance
                            getAssetBalance(asset);
                          });
                        }
                      });
                  })
                  .catch((error) => {
                    //somehow failed to get trade
                    //consider how to handle this edge case
                    console.log(error);
                  })
                  .finally(() => {});
              })
              .catch((error) => {
                //somehow failed to get pools
                //consider how to handle this edge case
                console.log(error);
              })
              .finally(() => {});
          });

          //PRODUCTION
          // client
          //   .sendTransaction(tx)
          //   .then((res) => {
          //     console.log(res);
          //     //save TX hashes to database?
          //   })
          //   .catch((error) => {
          //     console.log(error);
          //     //count as failed TX and include in array
          //     // console.log("\n");
          //     // console.log(
          //     //   `USDT-${asset.symbol.toLocaleUpperCase()} swap failed. Included in failed TXs.`
          //     // );
          //     //REFACTOR - check to see that asset wasn't there before push
          //     //failedTX.push(asset);
          //   })
          //   .finally(() => {});
        })
        .catch((error) => {
          //somehow failed to get permission to spend USDT
          //consider how to handle this edge case
          console.log(error);
        })
        .finally(() => {});
    })
    .catch((error) => {
      //somehow failed to get signer
      //consider how to handle this edge case
      console.log(error);
    })
    .finally(() => {});
};

main();