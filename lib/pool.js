var events = require('events');
var async = require('async');

var varDiff = require('./varDiff.js');
var daemon = require('./daemon.js');
var peer = require('./peer.js');
var stratum = require('./stratum.js');
var jobManager = require('./jobManager.js');
var util = require('./util.js');


var bignum = require('bignum');

/**
 * Main pool object. It emits the following events:
 *  - started() - when the pool is effectively started
 *  - share(isValidShare, isValidBlock, shareData) - When a share is submitted
 *  - log(severity, key, text) - for debug, warning, and error messages
 *
 *  It initializes and connects:
 *  - JobManager - for generating miner work, processing block templates and shares
 *  - DaemonInterface - for RPC communication with daemon
 *  - StratumServer - for TCP socket communication with miners
 *
 */

var pool = module.exports = function pool(options, authorizeFn){

    this.options = options;

    var _this = this;
    var blockPollingIntervalId;


    var emitLog        = function(text) { _this.emit('log', 'debug'  , text); };
    var emitWarningLog = function(text) { _this.emit('log', 'warning', text); };
    var emitErrorLog   = function(text) { _this.emit('log', 'error'  , text); };
    var emitSpecialLog = function(text) { _this.emit('log', 'special', text); };



    if (!(options.coin.algorithm in algos)){
        emitErrorLog('The ' + options.coin.algorithm + ' hashing algorithm is not supported.');
        throw new Error();
    }

    //var diff1 = options.coin.diffShift ?
    //    util.getTruncatedDiff(options.coin.diffShift) :
    //    algos[options.coin.algorithm].diff;


    //Which number to use as dividend when converting difficulty to target
    var maxDifficulty = algos[options.coin.algorithm].maxDiff;


    this.start = function(){
        SetupJobManager();
        SetupVarDiff();
        SetupApi();
        SetupDaemonInterface(function(){
            DetectCoinData(function(){
                OnBlockchainSynced(function(){
                    GetFirstJob(function(){
                        SetupBlockPolling();
                        SetupPeer();
                        StartStratumServer(function(){
                            OutputPoolInfo();
                            _this.emit('started');
                        });
                    });
                });
            });
        });
    };



    function GetFirstJob(finishedCallback){

        GetBlockTemplate(function(error, result){
            if (error) {
                emitErrorLog('Error with getblocktemplate on creating first job, server cannot start');
                return;
            }

            var portWarnings = [];

            Object.keys(options.ports).forEach(function(port){
                var portDiff = options.ports[port].diff;
                if (options.initStats.difficulty < portDiff)
                    portWarnings.push('port ' + port + ' w/ diff ' + portDiff);
            });

            //Only let the first fork show synced status or the log wil look flooded with it
            if (portWarnings.length > 0 && (!process.env.forkId || process.env.forkId === '0')) {
                var warnMessage = 'Network diff of ' + options.initStats.difficulty + ' is lower than '
                    + portWarnings.join(' and ');
                emitWarningLog(warnMessage);
            }

            finishedCallback();

        });
    }


    function OutputPoolInfo(){

        var startMessage = 'Stratum Pool Server Started for ' + options.coin.name +
            ' [' + options.coin.symbol.toUpperCase() + '] {' + options.coin.algorithm + '}';
        if (process.env.forkId && process.env.forkId !== '0'){
            emitLog(startMessage);
            return;
        }
        var infoLines = [startMessage,
                'Network Connected:\t' + (options.testnet ? 'Testnet' : 'Live Blockchain'),
                'Detected Reward Type:\t' + options.coin.reward,
                'Current Block Height:\t' + _this.jobManager.currentJob.rpcData.height,
                'Current Connect Peers:\t' + options.initStats.connections,
                'Current Block Diff:\t' + _this.jobManager.currentJob.difficulty,
                'Network Difficulty:\t' + options.initStats.difficulty,
                'Network Hash Rate:\t' + util.getReadableHashRateString(options.initStats.networkHashRate),
                'Stratum Port(s):\t' + _this.options.initStats.stratumPorts.join(', ')
        ];

        if (typeof options.blockRefreshInterval === "number" && options.blockRefreshInterval > 0)
            infoLines.push('Block polling every:\t' + options.blockRefreshInterval + ' ms');


        emitSpecialLog(infoLines.join('\n\t\t\t\t\t\t'));
    }


    function OnBlockchainSynced(syncedCallback){

        var checkSynced = function(displayNotSynced){
            _this.daemon.cmd('getblocktemplate', [], function(results){
                var synced = results.every(function(r){
                    return !r.error || r.error.code !== -10;
                });
                if (synced){
                    syncedCallback();
                }
                else{
                    if (displayNotSynced) displayNotSynced();
                    setTimeout(checkSynced, 5000);

                    //Only let the first fork show synced status or the log wil look flooded with it
                    if (!process.env.forkId || process.env.forkId === '0')
                        generateProgress();
                }

            });
        };
        checkSynced(function(){
            //Only let the first fork show synced status or the log wil look flooded with it
            if (!process.env.forkId || process.env.forkId === '0')
                emitErrorLog('Daemon is still syncing with network (download blockchain) - server will be started once synced');
        });


        var generateProgress = function(){

            _this.daemon.cmd('getinfo', [], function(results) {
                var blockCount = results.sort(function (a, b) {
                    return b.response.blocks - a.response.blocks;
                })[0].response.blocks;

                //get list of peers and their highest block height to compare to ours
                _this.daemon.cmd('getpeerinfo', [], function(results){

                    var peers = results[0].response;
                    var totalBlocks = peers.sort(function(a, b){
                        return b.startingheight - a.startingheight;
                    })[0].startingheight;

                    var percent = (blockCount / totalBlocks * 100).toFixed(2);
                    emitWarningLog('Downloaded ' + percent + '% of blockchain from ' + peers.length + ' peers');
                });

            });
        };

    }


    function SetupApi() {
        if (typeof(options.api) !== 'object' || typeof(options.api.start) !== 'function') {
            return;
        } else {
            options.api.start(_this);
        }
    }


    function SetupPeer(){
        if (!options.p2p || !options.p2p.enabled)
            return;
        _this.peer = new peer(options);
        _this.peer.on('connected', function() {
            emitLog('p2p connection successful');
        }).on('connectionRejected', function(){
            emitErrorLog('p2p connection failed - likely incorrect p2p magic value');
        }).on('disconnected', function(){
            emitWarningLog('p2p peer node disconnected - attempting reconnection...');
        }).on('connectionFailed', function(e){
            emitErrorLog('p2p connection failed - likely incorrect host or port');
        }).on('socketError', function(e){
            emitErrorLog('p2p had a socket error ' + JSON.stringify(e));
        }).on('error', function(msg){
            emitWarningLog('p2p had an error ' + msg);
        }).on('blockFound', function(hash){
            _this.processBlockNotify(hash, 'p2p');
        });
    }


    function SetupVarDiff(){
        _this.varDiff = {};
        Object.keys(options.ports).forEach(function(port) {
            if (options.ports[port].varDiff)
                _this.setVarDiff(port, new varDiff(port, options.ports[port].varDiff));
        });
    }


    /*
    Coin daemons either use submitblock or getblocktemplate for submitting new blocks
     */
    function SubmitBlock(blockHex, callback){

        var rpcCommand, rpcArgs;
        if (options.hasSubmitMethod){
            rpcCommand = 'submitblock';
            rpcArgs = [blockHex];
        }
        else{
            rpcCommand = 'getblocktemplate';
            rpcArgs = [{'mode': 'submit', 'data': blockHex}];
        }


        _this.daemon.cmd(rpcCommand,
            rpcArgs,
            function(results){
                results.forEach(function(result){
                    if (result.error)
                        emitErrorLog('rpc error with daemon instance ' +
                            result.instance.index + ' when submitting block with ' + rpcCommand + ' ' +
                            JSON.stringify(result.error)
                        );
                    else
                        emitLog('Submitted Block using ' + rpcCommand + ' to daemon instance ' +
                            result.instance.index
                        );
                });
                callback();
            }
        );

    }


    function SetupJobManager(){

        _this.jobManager = new jobManager(maxDifficulty, options);

        _this.jobManager.on('newBlock', function(blockTemplate){
            //Check if stratumServer has been initialized yet
            if ( typeof(_this.stratumServer ) !== 'undefined') {
                _this.stratumServer.broadcastMiningJobs(blockTemplate.getJobParams());
            }
        }).on('updatedBlock', function(blockTemplate){
            //Check if stratumServer has been initialized yet
            if ( typeof(_this.stratumServer ) !== 'undefined') {
                var job = blockTemplate.getJobParams();
                job[8] = false;
                _this.stratumServer.broadcastMiningJobs(job);
            }
        }).on('share', function(shareData, blockHex){
            var isValidShare = !shareData.error;
            var isValidBlock = !!blockHex;
            var emitShare = function(){
                _this.emit('share', isValidShare, isValidBlock, shareData);
            };

            /*
            If we calculated that the block solution was found,
            before we emit the share, lets submit the block,
            then check if it was accepted using RPC getblock
            */
            if (!isValidBlock)
                emitShare();
            else{
                SubmitBlock(blockHex, function(){
                    CheckBlockAccepted(shareData.blockHash, function(isAccepted, tx){
                        isValidBlock = isAccepted;
                        shareData.txHash = tx;
                        emitShare();
                    });
                });
            }
        }).on('log', function(severity, message){
            _this.emit('log', severity, message);
        });
    }


    function SetupDaemonInterface(finishedCallback){

        if (!Array.isArray(options.daemons) || options.daemons.length < 1){
            emitErrorLog('No daemons have been configured - pool cannot start');
            return;
        }

        _this.daemon = new daemon.interface(options.daemons);

        _this.daemon.once('online', function(){
            finishedCallback();

        }).on('connectionFailed', function(error){
            emitErrorLog('Failed to connect daemon(s): ' + JSON.stringify(error));

        }).on('error', function(message){
            emitErrorLog(message);

        });

        _this.daemon.init();
    }


    function DetectCoinData(finishedCallback){


        //TODO: Convert this all into a batch RPC call for better performance

        async.waterfall([

            function(callback){
                _this.daemon.cmd('validateaddress', [options.address], function(results){

                    //Make sure address is valid with each daemon
                    var allValid = results.every(function(result){
                        if (result.error || !result.response){
                            emitErrorLog('validateaddress rpc error on daemon instance ' +
                                result.instance.index + ' - ' + JSON.stringify(result.error));
                        }
                        else if (!result.response.isvalid)
                            emitErrorLog('Daemon instance ' + result.instance.index +
                                ' reports address is not valid');
                        return result.response && result.response.isvalid;
                    });

                    if (!allValid){
                        callback('not all addresses are valid');
                        return;
                    }

                    //Try to find result that owns address in case of POS coin with multi daemons
                    var ownedInfo = results.filter(function(r){
                        return r.response.ismine;
                    });

                    options.coin.addressByte = util.getVersionByte(options.address);

                    callback(null, ownedInfo.length > 0 ? ownedInfo[0].response : results[0].response);

                });
            },

            function(addressInfo, callback){
                var examplePubKey = new Buffer([options.coin.addressByte, new Buffer('010966776006953D5567439E5E39F86A0D273BEE', 'hex')]);
                var dHashed = util.sha256d(examplePubKey);
                var binaryAddress =

                callback(null, addressInfo);
            },

            function(addressInfo, callback){
                _this.daemon.cmd('getdifficulty', [], function(results){

                    //This detects if a coin is POS because getdiff returns an object instead of a number

                    var isPos = results.every(function(result){

                        if (result.error){
                            emitErrorLog('getinfo on init failed with daemon instance ' +
                                    result.instance.index + ', error ' + JSON.stringify(result.error)
                            );
                            return false;
                        }

                        return isNaN(result.response) && 'proof-of-stake' in result.response;
                    });

                    options.coin.reward = isPos ? 'POS' : 'POW';

                    /* POS coins must use the pubkey in coinbase transaction, and pubkey is
                       only given if address is owned by wallet.*/
                    if (options.coin.reward === 'POS' && typeof(addressInfo.pubkey) == 'undefined') {
                        emitErrorLog('The address provided is not from the daemon wallet - this is required for POS coins.');
                        return;
                    }

                    options.publicKeyBuffer = (function(){
                        switch(options.coin.reward){
                            case 'POS':
                                return util.pubkeyToScript(addressInfo.pubkey);
                            case 'POW':
                                return util.addressToScript(addressInfo.address);
                        }
                    })();

                    callback(null);

                });
            },

            function(callback){
                _this.daemon.cmd('getinfo', [], function(results){

                    // Print which network each daemon is running on

                    var isTestnet;
                    var allValid = results.every(function(result){

                        if (result.error){
                            emitErrorLog('getinfo on init failed with daemon instance ' +
                                result.instance.index + ', error ' + JSON.stringify(result.error)
                            );
                            return false;
                        }

                        //Make sure every daemon is on the correct network or the config is wrong
                        if (typeof isTestnet === 'undefined'){
                            isTestnet = result.response.testnet;
                            return true;
                        }
                        else if (isTestnet !== result.response.testnet){
                            emitErrorLog('not all daemons are on same network');
                            return false;
                        }
                        else
                            return true;
                    });


                    if (!allValid){
                        callback('could not getinfo correctly on each daemon');
                        return;
                    }

                    //Find and return the response with the largest block height (most in-sync)
                    var infoResult = results.sort(function(a, b){
                        return b.response.blocks - a.response.blocks;
                    })[0].response;

                    options.testnet = infoResult.testnet;
                    options.protocolVersion = infoResult.protocolversion;

                    options.initStats = { connections: infoResult.connections, difficulty: infoResult.difficulty };

                    callback(null);

                });
            },

            function(callback){
                _this.daemon.cmd('getmininginfo', [], function(results){
                    var allValid = results.every(function(result){
                        if (result.error){
                            emitErrorLog('getmininginfo on init failed with daemon instance ' +
                                    result.instance.index + ', error ' + JSON.stringify(result.error)
                            );
                            return false;
                        }
                        return true;
                    });

                    if (!allValid){
                        callback('could not getmininginfo correctly on each daemon');
                        return;
                    }

                    //Find and return the response with the largest block height (most in-sync)
                    var miningInfoResult = results.sort(function(a, b){
                        return b.response.blocks - a.response.blocks;
                    })[0].response;

                    options.initStats.networkHashRate = miningInfoResult.networkhashps;

                    callback(null);

                });
            },

            function(callback){
                /* This checks to see whether the daemon uses submitblock
                 or getblocktemplate for submitting new blocks */
                _this.daemon.cmd('submitblock', [], function(results){
                    var couldNotDetectMethod = results.every(function(result){
                        if (result.error && result.error.message === 'Method not found'){
                            options.hasSubmitMethod = false;
                            callback(null);
                            return false;
                        }
                        else if (result.error && result.error.code === -1){
                            options.hasSubmitMethod = true;
                            callback(null);
                            return false;
                        }
                        else
                            return true;
                    });
                    if (couldNotDetectMethod){
                        emitErrorLog('Could not detect block submission RPC method, ' + JSON.stringify(results));
                        callback('block submission detection failed');
                    }
                });
            }
        ], function(err, results){
            if (err){
                emitErrorLog('Could not start pool, ' + JSON.stringify(err));
                return;
            }
            finishedCallback();
        });
    }



    function StartStratumServer(finishedCallback){
        _this.stratumServer = new stratum.Server(options, authorizeFn);

        _this.stratumServer.on('started', function(){
            options.initStats.stratumPorts = Object.keys(options.ports);
            _this.stratumServer.broadcastMiningJobs(_this.jobManager.currentJob.getJobParams());
            finishedCallback();
            _this.emit('started');

        }).on('broadcastTimeout', function(){
            emitLog('No new work for ' + options.jobRebroadcastTimeout + ' seconds - updating & rebroadcasting current job');
            _this.jobManager.updateCurrentJob(options.publicKeyBuffer);

        }).on('client.connected', function(client){
            if (typeof(_this.varDiff[client.socket.localPort]) !== 'undefined') {
                _this.varDiff[client.socket.localPort].manageClient(client);
            }

            client.on('difficultyChanged', function(diff){
                _this.emit('difficultyUpdate', client.workerName, diff);

            }).on('subscription', function(params, resultCallback){

                var extraNonce = _this.jobManager.extraNonceCounter.next();
                var extraNonce2Size = _this.jobManager.extraNonce2Size;
                resultCallback(null,
                    extraNonce,
                    extraNonce2Size
                );

                if (typeof(options.ports[client.socket.localPort]) !== 'undefined' && options.ports[client.socket.localPort].diff) {
                    this.sendDifficulty(options.ports[client.socket.localPort].diff);
                } else {
                    this.sendDifficulty(8);
                }
                
                this.sendMiningJob(_this.jobManager.currentJob.getJobParams());
                
            }).on('submit', function(params, resultCallback){
                var result =_this.jobManager.processShare(
                    params.jobId,
                    client.previousDifficulty,
                    client.difficulty,
                    client.extraNonce1,
                    params.extraNonce2,
                    params.nTime,
                    params.nonce,
                    client.remoteAddress,
                    params.name
                );

                resultCallback(result.error, result.result ? true : null);

            }).on('malformedMessage', function (message) {
                emitWarningLog('Malformed message from ' + client.getLabel() + ': ' + message);

            }).on('socketError', function(err) {
                emitWarningLog('Socket error from ' + client.getLabel() + ': ' + JSON.stringify(err));

            }).on('socketTimeout', function(reason){
                emitWarningLog('Connected timed out for ' + client.getLabel() + ': ' + reason)

            }).on('socketDisconnect', function() {
                //emitLog('Socket disconnected from ' + client.getLabel());

            }).on('kickedBannedIP', function(remainingBanTime){
                emitLog('Rejected incoming connection from ' + client.remoteAddress + ' banned for ' + remainingBanTime + ' more seconds');

            }).on('forgaveBannedIP', function(){
                emitLog('Forgave banned IP ' + client.remoteAddress);

            }).on('unknownStratumMethod', function(fullMessage) {
                emitLog('Unknown stratum method from ' + client.getLabel() + ': ' + fullMessage.method);

            }).on('socketFlooded', function() {
                emitWarningLog('Detected socket flooding from ' + client.getLabel());

            }).on('tcpProxyError', function(data) {
                emitErrorLog('Client IP detection failed, tcpProxyProtocol is enabled yet did not receive proxy protocol message, instead got data: ' + data);

            }).on('bootedBannedWorker', function(){
                emitWarningLog('Booted worker ' + client.getLabel() + ' who was connected from an IP address that was just banned');

            }).on('triggerBan', function(reason){
                emitWarningLog('Banned triggered for ' + client.getLabel() + ': ' + reason);
                _this.emit('banIP', client.remoteAddress, client.workerName);
            });
        });
    }



    function SetupBlockPolling(){
        if (typeof options.blockRefreshInterval !== "number" || options.blockRefreshInterval <= 0){
            emitLog('Block template polling has been disabled');
            return;
        }

        var pollingInterval = options.blockRefreshInterval;

        blockPollingIntervalId = setInterval(function () {
            GetBlockTemplate(function(error, result, foundNewBlock){
                if (foundNewBlock)
                    emitLog('Block notification via RPC polling');
            });
        }, pollingInterval);
    }



    function GetBlockTemplate(callback){
        _this.daemon.cmd('getblocktemplate',
            [{"capabilities": [ "coinbasetxn", "workid", "coinbase/append" ]}],
            function(result){
                if (result.error){
                    emitErrorLog('getblocktemplate call failed for daemon instance ' +
                        result.instance.index + ' with error ' + JSON.stringify(result.error));
                    callback(result.error);
                } else {
                    var processedNewBlock = _this.jobManager.processTemplate(result.response, options.publicKeyBuffer);

                    if (processedNewBlock) {

                        Object.keys(_this.varDiff).forEach(function(port){
                            _this.varDiff[port].setNetworkDifficulty(_this.jobManager.currentJob.difficulty);
                        });
                    }
                        

                    callback(null, result.response, processedNewBlock);
                    callback = function(){};
                }
            }, true
        );
    }



    function CheckBlockAccepted(blockHash, callback){
        setTimeout(function(){
            _this.daemon.cmd('getblock',
                [blockHash],
                function(results){
                    var validResults = results.filter(function(result){
                        return result.response && (result.response.hash === blockHash)
                    });

                    if (validResults.length >= 1){
                        callback(true, validResults[0].response.tx[0]);
                    }
                    else{
                        callback(false);
                    }
                }
            );
        }, 500);
    }



    /**
     * This method is being called from the blockNotify so that when a new block is discovered by the daemon
     * We can inform our miners about the newly found block
    **/
    this.processBlockNotify = function(blockHash, sourceTrigger) {
        emitLog('Block notification via ' + sourceTrigger);
        if (typeof(_this.jobManager.currentJob) !== 'undefined' && blockHash !== _this.jobManager.currentJob.rpcData.previousblockhash){
            GetBlockTemplate(function(error, result){
                if (error)
                    emitErrorLog('Block notify error getting block template for ' + options.coin.name);
            })
        }
    };


    this.relinquishMiners = function(filterFn, resultCback) {
        var origStratumClients = this.stratumServer.getStratumClients();

        var stratumClients = [];
        Object.keys(origStratumClients).forEach(function (subId) {
            stratumClients.push({subId: subId, client: origStratumClients[subId]});
        });
        async.filter(
            stratumClients,
            filterFn,
            function (clientsToRelinquish) {
                clientsToRelinquish.forEach(function(cObj) {
                    cObj.client.removeAllListeners();
                    _this.stratumServer.removeStratumClientBySubId(cObj.subId);
                });
                
                process.nextTick(function () {
                    resultCback(
                        clientsToRelinquish.map(
                            function (item) {
                                return item.client;
                            }
                        )
                    );    
                });
            }
        )
    };


    this.attachMiners = function(miners) {
        miners.forEach(function (clientObj) {
            _this.stratumServer.manuallyAddStratumClient(clientObj);
        });
        _this.stratumServer.broadcastMiningJobs(_this.jobManager.currentJob.getJobParams());

    };


    this.getStratumServer = function() {
        return _this.stratumServer;
    };


    this.setVarDiff = function(port, varDiffInstance) {
        if (typeof(_this.varDiff[port]) != 'undefined' ) {
            _this.varDiff[port].removeAllListeners();
        }
        _this.varDiff[port] = varDiffInstance;
        _this.varDiff[port].on('newDifficulty', function(client, newDiff) {

            /* We request to set the newDiff @ the next difficulty retarget
             (which should happen when a new job comes in - AKA BLOCK) */
            client.enqueueNextDifficulty(newDiff);

            /*if (options.varDiff.mode === 'fast'){
                 //Send new difficulty, then force miner to use new diff by resending the
                 //current job parameters but with the "clean jobs" flag set to false
                 //so the miner doesn't restart work and submit duplicate shares
                client.sendDifficulty(newDiff);
                var job = _this.jobManager.currentJob.getJobParams();
                job[8] = false;
                client.sendMiningJob(job);
            }*/

        });
    };

};
pool.prototype.__proto__ = events.EventEmitter.prototype;
