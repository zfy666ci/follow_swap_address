const WebSocket = require("ws");
const BlocknativeSdk = require("bnc-sdk");
const Web3 = require("web3");
const config = require("./f_config.json");
const bep20 = require("./bep20.json");
const web3 = new Web3(config.rpc);
const uniswapV2RouterAbi = require("./swap_abi");
const UniswapContractRouter = new web3.eth.Contract(
  uniswapV2RouterAbi,
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d"
);

const options = {
  dappId: config.apikey,
  ws: WebSocket,
  networkId: 1,
  onerror: (error) => {
    console.log(error.message);
  },
  onopen: () => console.log("WSS链接成功"),
};

const blocknative = new BlocknativeSdk(options);
const { emitter } = blocknative.account(config.followAddress);

emitter.on("txPool", async (transaction) => {
  console.log(`监控到[${config.followAddress}]发出交易`);

  const { maxFeePerGas, maxPriorityFeePerGas, gasPrice, value } = transaction;
  const methods = transaction?.contractCall?.methodName;
  console.log(methods);
  if (methods == "swapExactETHForTokens") {
    const contract = transaction?.contractCall?.params?.path[1];
    const sendValue = web3.utils.fromWei(value, "ether");
    const mysendValue = formatRoundNum(sendValue * 1 * config["Purchase proportion"],'6') 
    console.log(mysendValue, "我发送的金额",sendValue,'对吗发送的');

    let amounout = await limit( web3.utils.toWei(mysendValue.toString(),'ether'), contract);
    let nonce = await web3.eth.getTransactionCount(config.myaddress, "pending");
    send(
      gasPrice ? gasPrice : gasPrice,
      maxFeePerGas ? maxFeePerGas : maxFeePerGas,
      maxPriorityFeePerGas ? maxPriorityFeePerGas : maxPriorityFeePerGas,
      contract,
      methods,
      amounout,
      web3.utils.toWei(mysendValue.toString(),'ether') ,
      nonce
    );
  }
});

//获取比例和滑点
async function limit(sendvalue, contract) {
  try {
    const bep202 = new web3.eth.Contract(bep20, contract);
    var dec = await bep202.methods.decimals().call();
    const res = await UniswapContractRouter.methods
      .getAmountsOut(sendvalue, [
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        contract,
      ])
      .call();

    //保存六位小数
    console.log(res)
    const min = formatRoundNum(getLanceWei(res[1], dec), "6");
    const amountInmMin = calculateMinReceivedAmount(min, config.Slippage);
    console.log('最少收到',outLanceWei(amountInmMin.toString(), dec))
    return outLanceWei(amountInmMin.toString(), dec);
  } catch (error) {
    console.log(error);
  }
}

//滑点计算
function calculateMinReceivedAmount(amountIn, slippage) {
  const slippagePercent = slippage / 100;
  const minReceivedAmount = amountIn / (1 + slippagePercent);
  return formatRoundNum(minReceivedAmount, 6);
}

async function send(
  gasPrice,
  maxFeePerGas,
  maxPriorityFeePerGas,
  contract,
  methods,
  amounout,
  value,
  nonce
) {
  const deadline = Math.floor(Date.now() / 1000) + 60 * parseInt(20);

  //swapETHForExactTokens
  const transfer = UniswapContractRouter.methods[methods](
    amounout,
    ["0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", contract],
    config.myaddress,
    deadline
  );
  const encodedABI = transfer.encodeABI();

  let tx = gasPrice
    ? {
        from: config.myaddress,
        to: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
        value,
        nonce,
        data: encodedABI,
      }
    : {
        from: config.myaddress,
        to: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
        value,
        nonce,
        data: encodedABI,
      };
  try {
    const gaslimit = parseInt((await web3.eth.estimateGas(tx)) * 1.2) + "";
    tx = gasPrice
      ? {
          from: config.myaddress,
          to: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
          gas: gaslimit,
          value,
          nonce,
          gasPrice: web3.utils.toWei(gasPrice, "gwei"),
          data: encodedABI,
        }
      : {
          from: config.myaddress,
          to: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
          gas: gaslimit,
          maxFeePerGas,
          value,
          nonce,
          maxPriorityFeePerGas,
          data: encodedABI,
        };
        console.log(tx);
        sendTry(tx, config.private).then(console.log);
  } catch (error) {
    console.log(error.message);
  }

}

async function sendTry(tx, privateKey) {
  try {
    var signed = await web3.eth.accounts.signTransaction(tx, privateKey);
   
    var tran = await web3.eth.sendSignedTransaction(signed.rawTransaction);
    return tran;
  } catch (error) {
    console.log(error);
  }
}


// 保留位数
const formatRoundNum = (num, pre) =>
  (Math.floor(num * Math.pow(10, pre)) / Math.pow(10, pre)).toFixed(pre);

function getLanceWei(amount, decimal) {
  var out_amount = amount;
  var wei = "ether";
  var length_d = 19 - decimal;
  if (decimal != 18) {
    amount = PrefixInteger(amount, length_d);
  }
  out_amount = web3.utils.fromWei(amount, "ether");
  return out_amount;
}
function outLanceWei(amount, decimal) {
  var out_amount = amount;
  var wei = "ether";
  var length_d = 18 - decimal;
  out_amount = web3.utils.toWei(amount, "ether");
  if (decimal != 18) {
    out_amount = out_amount.substr(0, out_amount.length - length_d);
  }
  return out_amount;
}
function PrefixInteger(num, length) {
  return num + Array(length).join("0");
}
