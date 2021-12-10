const Redis = require('ioredis');
const fs = require('fs');
const HttpClient = require('./httpClient');
const async = require('async');
const util = require('./util');
const constants = require('./constants');

var PaymentProcessor = module.exports = function PaymentProcessor(config, logger){
    var redisClient = new Redis(config.redis.port, config.redis.host);
    var httpClient = new HttpClient(config.daemon.host, config.daemon.port);

    var balancesKey = "balances";
    var addressGroupCache = {};
    var minPaymentCoins = parseFloat(config.minPaymentCoins);

    // gas constants
    const maxGasPerTx = 625000;
    const minimumGas = 20000;
    const gasPerInput = 2000;
    const gasPerOutput = 4500;
    const txBaseGas = 1000;
    const p2pkUnlockGas = 2060;
    const defaultGasFee = 100000000000;

    var _this = this;
    this.addressInfo = [];

    function getUtxoForTransfer(utxos, amount, now){
        var sum = 0;
        var selected = [];
        while (utxos.length > 0){
            if (sum >= amount){
                break;
            }

            var utxoData = utxos.shift();
            if (utxoData.lockTime <= now){
                var utxoAmount = parseInt(utxoData.amount);
                sum += utxoAmount;
                selected.push(utxoData);
            }
        }
        if (sum >= amount){
            return {sum: sum, selected: selected};
        }
        return {error: "not enough balance"};
    }

    function prepareTransaction(fromPublicKey, utxos, balances){
        var txInputs = [], txDestinations = [], changedBalances = [];
        var now = Date.now(), inputSum = 0, outputSum = 0;
        var estimatedGas = txBaseGas + p2pkUnlockGas + gasPerOutput; // change output

        var addDestination = function(address, amount){
            outputSum += amount;
            txDestinations.push({address: address, amount: amount.toString()});
            changedBalances[address] = util.toALPH(amount);
            estimatedGas += gasPerOutput
        }

        var popDestination = function(){
            var destination = txDestinations.pop();
            delete changedBalances[destination.address];
            estimatedGas -= gasPerOutput;
            outputSum -= parseInt(destination.amount);
        }

        var addInputs = function(utxos, utxoAmountSum){
            utxos.forEach(output => txInputs.push({hint: output.ref.hint, key: output.ref.key}));
            estimatedGas += utxos.length * gasPerInput;
            inputSum += utxoAmountSum;
        }

        var calcTxFee = function(){
            var txGas = Math.max(minimumGas, estimatedGas);
            return txGas * defaultGasFee;
        }

        // pay as many miners as possible in one tx
        while (true){
            var output = balances.shift();
            if (!output){
                break;
            }

            addDestination(output.address, output.amount);
            if (estimatedGas > maxGasPerTx){
                popDestination();
                break;
            }
            if (outputSum < inputSum){
                continue;
            }

            var result = getUtxoForTransfer(utxos, outputSum - inputSum, now);
            if (result.error){
                popDestination();
                break;
            }

            if ((estimatedGas + result.selected.length * gasPerInput) > maxGasPerTx){
                popDestination();
                break;
            }
            addInputs(result.selected, result.sum);
        }

        var txFee = calcTxFee();
        var remain = inputSum - outputSum;

        // add more inputs until we can cover the gas fee
        while (remain < txFee){
            var result = getUtxoForTransfer(utxos, txFee - remain, now);
            if (result.error){
                // TODO: drop some outputs, this should rarely happen
                return {error: 'Gas exceed maxGasPerTx when try to cover gas fee'};
            }

            if ((estimatedGas + result.selected.length * gasPerInput) > maxGasPerTx){
                // TODO: drop some outputs, this should rarely happen
                return {error: 'Gas exceed maxGasPerTx when try to cover gas fee'};
            }
            addInputs(result.selected, result.sum);
            remain = inputSum - outputSum;
            txFee = calcTxFee();
        }

        return {
            remainUtxos: utxos,
            txData: {
                fromPublicKey: fromPublicKey,
                gasAmount: Math.max(minimumGas, estimatedGas),
                inputs: txInputs,
                destinations: txDestinations,
                changedBalances: changedBalances,
            }
        };
    }

    // balances: Array[(Address, Int)]
    function prepareTransactions(fromAddress, fromPublicKey, utxos, balances){
        var remainUtxos = utxos;
        var txsData = [];
        while (balances.length > 0 && remainUtxos.length > 0){
            var result = prepareTransaction(fromPublicKey, remainUtxos, balances);
            if (result.error){
                logger('Prepare transaction error: ' + result.error + ', fromAddress: ' + fromAddress);
                return txsData;
            }
            txsData.push(result.txData);
            remainUtxos = result.remainUtxos;
        }
        return txsData;
    }

    function transferForGroup(balances, groupIndex, callback){
        var addressInfo = _this.addressInfo[groupIndex];
        var fromAddress = addressInfo.address;
        var fromPublicKey = addressInfo.publicKey;
        httpClient.getUtxos(fromAddress, function(result){
            if (result.error){
                logger('Get utxos failed, error: ' + result.error +
                    ', group: ' + groupIndex +
                    ', fromAddress: ' + fromAddress
                );
                callback({error: result.error});
                return;
            }

            var balanceArray = [];
            for (var address in balances){
                balanceArray.push({
                    address: address,
                    amount: util.fromALPH(balances[address])
                });
            }
            var txsData = prepareTransactions(fromAddress, fromPublicKey, result.utxos, balanceArray);
            callback({fromAddress: fromAddress, txsData: txsData});
        });
    }

    function prepareSendTxs(fromAddress, callback){
        httpClient.unlockWallet(
            config.wallet.name, 
            config.wallet.password,
            config.wallet.mnemonicPassphrase,
            function(result){
                if (result.error){
                    logger('Unlock wallet ' + config.wallet.name + ' failed, error: ' + result.error);
                    callback(result.error);
                    return;
                }

                httpClient.changeActiveAddress(
                    config.wallet.name,
                    fromAddress,
                    function(result){
                        if (result.error){
                            logger('Change active address failed, error: ' + result.error + ', address: ' + fromAddress);
                            callback(result.error);
                            return;
                        }
                        callback(null);
                    }
                )
            }
        )
    }

    function sendTxs(fromAddress, txsData, callback){
        var sendTx = function(txData, callback){
            httpClient.buildUnsignedTxFromUtxos(
                txData.fromPublicKey,
                txData.destinations,
                txData.inputs,
                txData.gasAmount,
                function(unsignedTx){
                    if (unsignedTx.error){
                        logger('Build unsigned tx failed, error: ' + unsignedTx.error +
                            ', fromAddress: ' + fromAddress +
                            ', destinations: ' + JSON.stringify(txData.destinations) +
                            ', inputs: ' + JSON.stringify(txData.inputs) +
                            ', gas: ' + JSON.stringify(txData.gasAmount)
                        );
                        callback(null);
                        return;
                    }

                    httpClient.signTx(config.wallet.name, unsignedTx.txId, function(result){
                        if (result.error){
                            logger('Sign tx failed, error: ' + result.error +
                                ', fromAddress: ' + fromAddress +
                                ', txId: ' + unsignedTx.txId
                            );
                            callback(null);
                            return;
                        }

                        var signedTx = {
                            txId: unsignedTx.txId,
                            changedBalances: txData.changedBalances,
                            signature: result.signature,
                            unsignedTx: unsignedTx.unsignedTx
                        };
                        submitTxAndUpdateBalance(signedTx, _ => callback(null));
                    })
                }
            )
        };

        prepareSendTxs(fromAddress, function(error){
            if (error){
                callback(error);
                return;
            }
            async.eachSeries(txsData, sendTx, function(_){
                callback(null);
            });
        })
    }

    function submitTxAndUpdateBalance(signedTx, callback){
        httpClient.submitTx(
            signedTx.unsignedTx, 
            signedTx.signature, 
            function(result){
                if (result.error){
                    logger('Submit tx failed, error: ' + result.error + ', txId: ' + signedTx.txId);
                    callback(result.error);
                    return;
                }

                logger('Tx ' + result.txId + ' submitted');
                var commands = [];
                for (var address in signedTx.changedBalances){
                    var amount = signedTx.changedBalances[address];
                    commands.push(['hincrbyfloat', balancesKey, address, (-amount).toString()]);
                }
                redisClient.multi(commands).exec(function(error, _){
                    if (error){
                        clearInterval(_this.task);
                        logger('Fatal error: payment tx submitted but update miner balance failed, error: ' + error +
                            ', write final commands to redisCommands.txt, which must be ran manually'
                        );
                        fs.appendFile('redisCommands.txt', JSON.stringify(commands), function(error){
                            if (error){
                                logger("Fatal error: write commands failed, error: " + error);
                                process.exit(1);
                            }
                        });
                        callback(result.error);
                        return;
                    }
                    callback(null);
                });
            }
        );
    }

    // allBalances: Array[(Address, Double)]
    function transfer(allBalances){
        var allGroupBalances = grouping(allBalances);
        async.eachSeries(allGroupBalances, function(groupBalances, callback){
            transferForGroup(
                groupBalances.balances, 
                groupBalances.group, 
                function(result){
                    if (result.error){
                        callback(null);
                        return;
                    }

                    sendTxs(result.fromAddress, result.txsData, _ => callback(null))
                })
            }, function(_){
                logger('Payment loop completed')
            }
        );
    }

    function grouping(allBalances){
        var groups = [{}, {}, {}, {}];
        for (var address in allBalances){
            var balance = parseFloat(allBalances[address]);
            if (balance >= minPaymentCoins){
                var groupIndex = addressGroupCache[address];
                if (!groupIndex){
                    var result = util.groupOfAddress(address);
                    groupIndex = result[0];
                    if (result[1]){
                        logger('Unknown group index address: ' + address);
                        continue;
                    }
                    addressGroupCache[address] = groupIndex;
                }
                var group = groups[groupIndex];
                group[address] = balance;
            }
        }
        var groupBalances = [];
        for (var idx in groups){
            if (Object.keys(groups).length > 0){
                groupBalances.push({
                    group: idx,
                    balances: groups[idx]
                });
            }
        }
        return groupBalances;
    }

    function payment(){
        redisClient.hgetall(balancesKey, function(error, result){
            if (error){
                logger('Get balances error: ' + error);
            }
            else{
                transfer(result);
            }
        });
    }

    this.start = function(){
        checkAddress(config.addresses);
        loadPublicKey(config.wallet, function(){
            _this.task = setInterval(payment, config.paymentInterval * 1000);
        });
    }

    function loadPublicKey(walletConfig, callback){
        var walletName = walletConfig.name;
        var password = walletConfig.password;
        var mnemonicPassphrase = walletConfig.mnemonicPassphrase;
        httpClient.unlockWallet(walletName, password, mnemonicPassphrase, function(result){
            if (result.error){
                logger('Load public key, unlock wallet failed, error: ' + result.error);
                process.exit(1);
            }

            async.eachSeries(config.addresses, function(address, callback){
                httpClient.getAddressInfo(walletName, address, function(result){
                    if (result.error){
                        logger('Load public key, get address info failed, error: ' + result.error);
                        process.exit(1);
                    }

                    _this.addressInfo.push({
                        address: address,
                        publicKey: result.publicKey
                    });
                    callback();
                });
            }, function(_){
                callback();
            });
        });
    }
    
    function checkAddress(addresses){
        if (addresses.length != constants.GroupSize){
            logger('Expect ' + constants.GroupSize + ' miner addresses, but have ' + addresses.length);
            process.exit(1);
        }

        for (var idx = 0; idx < constants.GroupSize; idx++){
            var result = util.isValidAddress(addresses[idx], idx);
            if (!result[0]){
                logger('Invalid miner address: ' + addresses[idx] + ', error: ' + result[1]);
                process.exit(1);
            }
        }
    }
}
