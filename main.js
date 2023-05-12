const { ethers } = require('ethers')
const { fs } = require('fs')
const { flatted } = require('flatted')
const { abi: IUniswapV3PoolABI } = require('@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json')
const { abi: SwapRouterABI } = require('@uniswap/v3-periphery/artifacts/contracts/interfaces/ISwapRouter.sol/ISwapRouter.json')
const { abi: WETH9ABI } = require('@uniswap/v3-periphery/artifacts/contracts/interfaces/external/IWETH9.sol/IWETH9.json')
const { abi: OFTABI } = require('./OFT_ABI.json')
const { getPoolImmutables, getPoolState } = require('./helpers')
const { AccountsData } = require('./AccountsData')
const ERC20ABI = require('./abi.json')
const { randomInt } = require('crypto')

/*
 * Logs function.
 */

// Opening a file for recording
const logFile = fs.createWriteStream('logs.txt', { flags: 'a' });

// Function for logging to a file
function writeLog(log) {
  const logString = flatted.stringify(log);
  logFile.write(`${new Date().toISOString()} ${logString}\n`);
}

/*
 * Setup provider.
 */

const NODE_URL = "https://arb1.arbitrum.io/rpc"
const provider = new ethers.providers.JsonRpcProvider(NODE_URL) // Arbitrum

/*
 * Address setup.
 */

const poolAddress = "0x0DcF98667c5400b7bc8De4ec2E4d03C5Cd11fA85" // WETH/GETH
const swapRouterAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564' // Swap router
const bridgeAddress = '0xdd69db25f6d620a7bad3023c5d32761d353d3de9' // Bridge
const ChainId = '154'

// Max approve value.
const MAX_APPROVE_VALUE = "115792089237316195423570985008687907853269984665640564039457584007913129639935"

// ETH depositAmount = 0.00009 + random
const randomMin = 1000; // 0.00001
const randomMax = 8000; // 0.00008

/*
 * Gas Limit const.
 */

const gasLimitDepositValue = 2000000 // 2 000 000
const gasLimitApproveValue = 3000000 // 3 000 000
const gasLimitSwapValue = 5000000    // 5 000 000 
const gasLimitBridgeValue = 10000000 // 10 000 000 

/*
 * Wrapped Ether data.
 */

const name0 = 'Wrapped Ether'
const symbol0 = 'WETH'
const decimals0 = 18
const address0 = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'

/*
 * Goerli ETH Token data.
 */

const name1 = 'Goerli ETH Token'
const symbol1 = 'GETH'
const decimals1 = 18
const address1 = '0xdd69db25f6d620a7bad3023c5d32761d353d3de9'

/*
 * Main function.
 */

async function main() {
  
  // Work cycle
  for (let i = 0; i <= AccountsData.length - 1; i++){

    let WALLET_SECRET = AccountsData[i];
    const wallet = new ethers.Wallet(WALLET_SECRET);
    let WALLET_ADDRESS = wallet.address;

    var nonce = await provider.getTransactionCount(WALLET_ADDRESS);

    depositeFunction(AccountsData[i], nonce);

    swapFunction(AccountsData[i], nonce);
    
    bridgeFunction(AccountsData[i], nonce);
    
    let timer = randomInt(11000 - 3000);
    
    writeLog(`Work with account №${i} is finished`);
    console.log(`Work with account №${i} is finished`);
    writeLog(`Waiting ${timer/1000} sec`);
    console.log(`Waiting ${timer/1000} sec`);

    await new Promise(r => setTimeout(r, timer)); // Wait 3-11 sec

  }
}

/*
 * EstimateFee function.
 */

async function estimateFee(AccountsData, amount){
  
  let WALLET_SECRET = AccountsData;

  const wallet = new ethers.Wallet(WALLET_SECRET)
  const connectedWallet = wallet.connect(provider)
  
  let WALLET_ADDRESS = wallet.address;

  const bridgeContract = new ethers.Contract(
    bridgeAddress,
    OFTABI,
    provider
  )  

  const estimateFeeTransaction = await bridgeContract.connect(connectedWallet).estimateSendFee(
    ChainId,
    WALLET_ADDRESS,
    amount,
    '0',
    '0x',
  )
    writeLog(`Bridge swap nativeFee =${ethers.utils.formatUnits(
      estimateFeeTransaction.nativeFee,
      decimals0
    )}`);
    
    console.log(`Bridge swap nativeFee =${ethers.utils.formatUnits(
      estimateFeeTransaction.nativeFee,
      decimals0
    )}`);
    
  return estimateFeeTransaction.nativeFee;

}

/*
 * Bridge swap function (ARB --> Goerli).
 */

async function bridgeFunction(AccountsData, nonce){

  let WALLET_SECRET = AccountsData;

  const wallet = new ethers.Wallet(WALLET_SECRET)
  const connectedWallet = wallet.connect(provider)
  
  let WALLET_ADDRESS = wallet.address;

  const tokenContract1 = new ethers.Contract(
    address1,
    ERC20ABI,
    provider
  )

  const token1Balance = await tokenContract1.connect(connectedWallet).balanceOf(
    WALLET_ADDRESS
  )
   
  const token1Allowance = await tokenContract1.connect(connectedWallet).allowance(
    WALLET_ADDRESS,
    bridgeAddress
  )

  if(token1Allowance.isZero()){
    const approvalResponse = await tokenContract1.connect(connectedWallet).approve(
      bridgeAddress,
      MAX_APPROVE_VALUE,
      {
        gasPrice: await provider.getGasPrice(),
        gasLimit: gasLimitApproveValue,
        nonce: nonce,
      }
    ).then(transaction => {
      writeLog("Goerli ETH Token approve success!");
      writeLog(transaction.hash);
      console.log("Goerli ETH Token approve success!");
      console.log(transaction.hash);
      var nonce = nonce + 1;
    })
  }

  const bridgeContract = new ethers.Contract(
    bridgeAddress,
    OFTABI,
    provider
  )  

  const bridgeTransaction = await bridgeContract.connect(connectedWallet).sendFrom(
    WALLET_ADDRESS,
    ChainId,
    WALLET_ADDRESS,
    token1Balance,
    WALLET_ADDRESS,
    "0x0000000000000000000000000000000000000000",
    [],
    {
      value: await estimateFee(WALLET_SECRET, token1Balance),
      gasPrice: await provider.getGasPrice(),
      gasLimit: gasLimitBridgeValue,
      nonce: nonce,
    }
  ).then(transaction => {
    writeLog("bridgeTransaction success!");
    writeLog(transaction.hash);
    console.log("bridgeTransaction success!");
    console.log(transaction.hash);
    var nonce = nonce + 1;
  })

}

async function depositeFunction(AccountsData, nonce){

  let WALLET_SECRET = AccountsData;

  const wallet = new ethers.Wallet(WALLET_SECRET)
  const connectedWallet = wallet.connect(provider)

  const depositContract0 = new ethers.Contract(
    address0,
    WETH9ABI,
    provider
  )

  let random = randomInt(randomMax - randomMin) / 100000000;
  var depositAmount = 0.00009 + random // ETH

  const depositIn = ethers.utils.parseUnits(
    depositAmount.toString(),
    decimals0
  )

  const depositResponse = await depositContract0.connect(connectedWallet).deposit(
    {
      value: depositIn,
      gasPrice: await provider.getGasPrice(),
      gasLimit: gasLimitDepositValue,
      nonce: nonce,
    }
  ).then(transaction => {
    writeLog("depositTransaction success!");
    writeLog(transaction.hash);
    console.log("depositTransaction success!");
    console.log(transaction.hash);
    var nonce = nonce + 1;
  });

}

/*
 * Swap function (arbETH --> Goerli ETH Token).
 */

async function swapFunction(AccountsData, nonce){

  let WALLET_SECRET = AccountsData;

  const wallet = new ethers.Wallet(WALLET_SECRET)
  const connectedWallet = wallet.connect(provider)
  
  let WALLET_ADDRESS = wallet.address;

  const tokenContract0 = new ethers.Contract(
    address0,
    ERC20ABI,
    provider
  )

  const token0Balance = await tokenContract0.connect(connectedWallet).balanceOf(
    WALLET_ADDRESS
  )
   
  const token0Allowance = await tokenContract0.connect(connectedWallet).allowance(
    WALLET_ADDRESS,
    swapRouterAddress
  )

  if(token0Allowance.isZero()){
    const approvalResponse = await tokenContract0.connect(connectedWallet).approve(
      swapRouterAddress,
      MAX_APPROVE_VALUE,
      {
        gasPrice: await provider.getGasPrice(),
        gasLimit: gasLimitApproveValue,
        nonce: nonce,
      }
    ).then(transaction => {
      writeLog("WETH approve success!");
      writeLog(transaction.hash);
      console.log("WETH approve success!");
      console.log(transaction.hash);
      var nonce = nonce + 1;
    });
  } 
  
  const poolContract = new ethers.Contract(
    poolAddress,
    IUniswapV3PoolABI,
    provider
  )

  const immutables = await getPoolImmutables(poolContract)
  const state = await getPoolState(poolContract)

  const swapRouterContract = new ethers.Contract(
    swapRouterAddress,
    SwapRouterABI,
    provider
  )

  const swapParams = {
    tokenIn: immutables.token0,
    tokenOut: immutables.token1,
    fee: immutables.fee,
    recipient: WALLET_ADDRESS,
    deadline: Math.floor(Date.now() / 1000) + (60 * 10),
    amountIn: token0Balance,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0,
  }

  const swapTransaction = swapRouterContract.connect(connectedWallet).exactInputSingle(
    swapParams,
    {
      gasPrice: await provider.getGasPrice(),
      gasLimit: gasLimitSwapValue,
      nonce: nonce,
    }
  ).then(transaction => {
    writeLog("Swap WETH --> Goerli ETH Token success!");
    writeLog(transaction.hash);
    console.log("Swap WETH --> Goerli ETH Token success!");
    console.log(transaction.hash);
    var nonce = nonce + 1;
  });

}

main();