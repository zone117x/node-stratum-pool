const Redis = require('ioredis');
const fs = require('fs');
const HttpClient = require('./httpClient');
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
        return {error: "not enough balance", sum: sum, selected: selected};
    }

    function prepareTransaction(fromPublicKey, utxos, balances){
        var txInputs = [], txDestinations = [], changedBalances = {};
        var now = Date.now(), inputSum = 0, outputSum = 0;
        var estimatedGas = txBaseGas + p2pkUnlockGas + gasPerOutput; // change output

        var addDestination = function(output){
            var amount = util.fromALPH(output.amount);
            outputSum += amount;
            txDestinations.push({address: output.address, amount: amount});
            changedBalances[output.address] = output.amount;
            estimatedGas += gasPerOutput
        }

        var popDestination = function(){
            var destination = txDestinations.pop();
            outputSum -= destination.amount;
            delete changedBalances[destination.address];
            estimatedGas -= gasPerOutput;
        }

        var addInputs = function(selected, selectedSum){
            txInputs.push(selected);
            estimatedGas += selected.length * gasPerInput;
            inputSum += selectedSum;
        }

        var popInputs = function(selectedSum){
            var selected = txInputs.pop();
            estimatedGas -= selected.length * gasPerInput;
            selected.forEach(output => utxos.push(output));
            inputSum -= selectedSum;
        }

        var calcTxFee = function(){
            var txGas = Math.max(minimumGas, estimatedGas);
            return txGas * defaultGasFee;
        }

        // pay as many miners as possible in one tx
        while (balances.length > 0){
            addDestination(balances.shift());
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
            addInputs(result.selected, result.sum);
            if (estimatedGas > maxGasPerTx){
                popInputs(result.sum);
                popDestination();
                break;
            }
        }

        var txFee = calcTxFee();
        var remain = inputSum - outputSum;

        // add more inputs until we can cover the gas fee
        while (remain < txFee){
            var result = getUtxoForTransfer(utxos, txFee - remain, now);
            if (result.error){
                // TODO: drop some outputs, this should rarely happen
                return {error: result.error};
            }

            addInputs(result.selected, result.sum);
            if (estimatedGas > maxGasPerTx){
                // TODO: drop some outputs, this should rarely happen
                return {error: 'gas exceed maxGasPerTx'};
            }
            remain = inputSum - outputSum;
            txFee = calcTxFee();
        }

        return {
            fromPublicKey: fromPublicKey,
            gasAmount: Math.max(minimumGas, estimatedGas),
            inputs: txInputs.flat().map(output => output.ref),
            destinations: txDestinations.map(e => ({address: e.address, amount: e.amount.toString()})),
            changedBalances: changedBalances,
        };
    }

    function prepareTransactions(fromAddress, fromPublicKey, utxos, balances){
        var txsData = [];
        logger.debug(JSON.stringify({utxos: utxos, balances: balances}));
        while (balances.length > 0 && utxos.length > 0){
            var result = prepareTransaction(fromPublicKey, utxos, balances);
            if (result.error){
                logger.error('Prepare transaction error: ' + result.error + ', fromAddress: ' + fromAddress);
                return txsData;
            }
            txsData.push(result);
        }
        logger.debug(JSON.stringify(txsData));
        return txsData;
    }

    function transferForGroup(balances, groupIndex, callback){
        var addressInfo = _this.addressInfo[groupIndex];
        var fromAddress = addressInfo.address;
        var fromPublicKey = addressInfo.publicKey;
        httpClient.getUtxos(fromAddress, function(result){
            if (result.error){
                logger.error('Get utxos failed, error: ' + result.error +
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
                    amount: balances[address]
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
                    logger.error('Unlock wallet ' + config.wallet.name + ' failed, error: ' + result.error);
                    callback(result.error);
                    return;
                }

                httpClient.changeActiveAddress(
                    config.wallet.name,
                    fromAddress,
                    function(result){
                        if (result.error){
                            logger.error('Change active address failed, error: ' + result.error + ', address: ' + fromAddress);
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
                        logger.error('Build unsigned tx failed, error: ' + unsignedTx.error +
                            ', fromAddress: ' + fromAddress +
                            ', destinations: ' + JSON.stringify(txData.destinations) +
                            ', inputs: ' + JSON.stringify(txData.inputs) +
                            ', gas: ' + JSON.stringify(txData.gasAmount)
                        );
                        callback();
                        return;
                    }

                    httpClient.signTx(config.wallet.name, unsignedTx.txId, function(result){
                        if (result.error){
                            logger.error('Sign tx failed, error: ' + result.error +
                                ', fromAddress: ' + fromAddress +
                                ', txId: ' + unsignedTx.txId
                            );
                            callback();
                            return;
                        }

                        var signedTx = {
                            txId: unsignedTx.txId,
                            changedBalances: txData.changedBalances,
                            signature: result.signature,
                            unsignedTx: unsignedTx.unsignedTx
                        };
                        submitTxAndUpdateBalance(signedTx, _ => callback());
                    })
                }
            )
        };

        prepareSendTxs(fromAddress, function(error){
            if (error){
                callback(error);
                return;
            }
            util.executeForEach(txsData, sendTx, _ => callback(null));
        })
    }

    function submitTxAndUpdateBalance(signedTx, callback){
        httpClient.submitTx(
            signedTx.unsignedTx, 
            signedTx.signature, 
            function(result){
                if (result.error){
                    logger.error('Submit tx failed, error: ' + result.error + ', txId: ' + signedTx.txId);
                    callback(result.error);
                    return;
                }

                logger.info('Tx ' + result.txId + ' submitted');
                var commands = [];
                for (var address in signedTx.changedBalances){
                    var amount = signedTx.changedBalances[address];
                    commands.push(['hincrbyfloat', balancesKey, address, (-amount).toString()]);
                }
                redisClient.multi(commands).exec(function(error, _){
                    if (error){
                        clearInterval(_this.task);
                        logger.error('Fatal error: payment tx submitted but update miner balance failed, error: ' + error +
                            ', write final commands to redisCommands.txt, which must be ran manually'
                        );
                        fs.appendFile('redisCommands.txt', JSON.stringify(commands), function(error){
                            if (error){
                                logger.error("Fatal error: write commands failed, error: " + error);
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

    function transfer(allBalances){
        var allGroupBalances = grouping(allBalances);
        util.executeForEach(
            allGroupBalances, 
            function(groupBalances, callback){
                transferForGroup(
                    groupBalances.balances, 
                    groupBalances.group, 
                    function(result){
                        if (result.error){
                            callback();
                            return;
                        }

                        sendTxs(result.fromAddress, result.txsData, _ => callback())
                    })
            }, 
            _ => logger.info('Payment loop completed')
        );
    }

    function grouping(allBalances){
        // we have 4 groups
        var groups = [{}, {}, {}, {}];
        for (var address in allBalances){
            var balance = parseFloat(allBalances[address]);
            if (balance >= minPaymentCoins){
                var groupIndex = addressGroupCache[address];
                if (!groupIndex){
                    var result = util.groupOfAddress(address);
                    if (result[1]){
                        logger.error('Unknown group index address: ' + address);
                        continue;
                    }
                    groupIndex = result[0];
                    addressGroupCache[address] = groupIndex;
                }
                var group = groups[groupIndex];
                group[address] = balance;
            }
        }
        var groupBalances = [];
        for (var idx in groups){
            if (Object.keys(groups[idx]).length > 0){
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
                logger.error('Get balances error: ' + error);
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
                logger.error('Load public key, unlock wallet failed, error: ' + result.error);
                process.exit(1);
            }

            util.executeForEach(
                config.addresses, 
                function(address, callback){
                    httpClient.getAddressInfo(walletName, address, function(result){
                        if (result.error){
                            logger.error('Load public key, get address info failed, error: ' + result.error);
                            process.exit(1);
                        }

                        _this.addressInfo.push({
                            address: address,
                            publicKey: result.publicKey
                        });
                        callback();
                    });
                }, 
                _ => callback()
            );
        });
    }
    
    function checkAddress(addresses){
        if (addresses.length != constants.GroupSize){
            logger.error('Expect ' + constants.GroupSize + ' miner addresses, but have ' + addresses.length);
            process.exit(1);
        }

        for (var idx = 0; idx < constants.GroupSize; idx++){
            var result = util.isValidAddress(addresses[idx], idx);
            if (!result[0]){
                logger.error('Invalid miner address: ' + addresses[idx] + ', error: ' + result[1]);
                process.exit(1);
            }
        }
    }
}
