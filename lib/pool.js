var events = require('events');
var async = require('async');

var varDiff = require('./varDiff.js');
var daemon = require('./daemon.js');
var peer = require('./peer.js');
var stratum = require('./stratum.js');
var jobManager = require('./jobManager.js');
var util = require('./util.js');


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
    var publicKeyBuffer;
    var blockPollingIntervalId;


    var emitLog        = function(key, text) { _this.emit('log', 'debug'  , key, text); };
    var emitWarningLog = function(key, text) { _this.emit('log', 'warning', key, text); };
    var emitErrorLog   = function(key, text) { _this.emit('log', 'error'  , key, text); };

    this.start = function(){
        emitLog('system', 'Starting pool for ' + options.coin.name + ' [' + options.coin.symbol.toUpperCase() + ']');
        SetupJobManager();
        SetupVarDiff();
        SetupDaemonInterface(function (err, newDaemon) {
            if (!err) {
                _this.daemon = newDaemon;
                SetupBlockPolling();
                StartStratumServer();
                SetupPeer();
            }
        }); 
        SetupApi();
    };

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
        _this.peer = new peer(options.p2p);
        _this.peer.on('connected', function(){
            emitLog('system', 'connected to daemon as a peer node');
        }).on('disconnected', function(){
            emitWarningLog('system', 'peer node disconnected - attempting reconnection...');
        }).on('connectionFailed', function(){
            emitErrorLog('system', 'failed to connect to daemon as a peer node');
        }).on('error', function(msg){
            emitWarningLog('p2p', msg);
        }).on('blockFound', function(hash){
            this.processBlockNotify(hash);
        });
    }

    function SetupVarDiff(){
        Object.keys(options.ports).forEach(function(port) {
            _this.setVarDiff(port, new varDiff(port, options.ports[port]));    
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
                        emitErrorLog('submitblock', 'rpc error with daemon instance ' +
                            result.instance.index + ' when submitting block with ' + rpcCommand + ' ' +
                            JSON.stringify(result.error)
                        );
                    else
                        emitLog('submitblock', 'Submitted Block using ' + rpcCommand + ' to daemon instance ' +
                            result.instance.index
                        );
                });
                callback();
            }
        );

    }


    function SetupJobManager(){
        _this.jobManager = new jobManager({
            address   : options.address,
            algorithm : options.coin.algorithm,
            reward    : options.coin.reward,
            txMessages: options.coin.txMessages,
            txRefreshInterval: options.txRefreshInterval
        });
        _this.jobManager.on('newBlock', function(blockTemplate){
            //Check if stratumServer has been initialized yet
            if ( typeof(_this.stratumServer ) !== 'undefined') {
                emitLog('system', 'Detected new block');
                _this.stratumServer.broadcastMiningJobs(blockTemplate.getJobParams());
            }
        }).on('updatedBlock', function(blockTemplate){
            //Check if stratumServer has been initialized yet
            if ( typeof(_this.stratumServer ) !== 'undefined') {
                emitLog('system', 'Detected updated block transactions');
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
                    CheckBlockAccepted(shareData.solution, function(isAccepted, tx){
                        isValidBlock = isAccepted;
                        shareData.tx = tx;
                        emitShare();
                    });
                });
            }
        }).on('debugBlockShare', function(debugData) {
            emitLog('debugBlockSubmit', JSON.stringify(debugData));
        });
    }


    function SetupDaemonInterface(cback){
        emitLog('system', 'Connecting to daemon(s)');
        var newDaemon = new daemon.interface(options.daemons);
        newDaemon.once('online', function(){
            async.parallel({
                addressInfo: function(callback){
                    newDaemon.cmd('validateaddress', [options.address], function(results){

                        //Make sure address is valid with each daemon
                        var allValid = results.every(function(result){
                            if (result.error || !result.response){
                                emitErrorLog('system','validateaddress rpc error on daemon instance ' +
                                    result.instance.index + ', error +' + JSON.stringify(result.error));
                            }
                            else if (!result.response.isvalid)
                                emitErrorLog('system', 'Daemon instance ' + result.instance.index +
                                    ' reports address is not valid');
                            return result.response && result.response.isvalid;
                        });

                        if (allValid)
                            callback(null, results[0].response);
                        else{
                            callback('not all addresses are valid')
                        }

                    });
                },
                miningInfo: function(callback){
                    newDaemon.cmd('getmininginfo', [], function(results){

                        // Print which network each daemon is running on

                        var isTestnet;
                        var allValid = results.every(function(result){

                            if (result.error){
                                emitErrorLog('system', 'getmininginfo on init failed with daemon instance ' +
                                    result.instance.index + ', error ' + JSON.stringify(result.error)
                                );
                                return false;
                            }

                            var network = result.response.testnet ? 'testnet' : 'live blockchain';
                            emitLog('system', 'Daemon instance ' + result.instance.index + ' is running on ' + network);

                            if (typeof isTestnet === 'undefined'){
                                isTestnet = result.response.testnet;
                                return true;
                            }
                            else if (isTestnet !== result.response.testnet){
                                emitErrorLog('system', 'not all daemons are on same network');
                                return false;
                            }
                            else
                                return true;
                        });


                        if (!allValid){
                            callback('could not getmininginfo correctly on each daemon');
                            return;
                        }

                        //Find and return the response with the largest block height (most in-sync)
                        var largestHeight = results.sort(function(a, b){
                            return b.response.blocks - a.response.blocks;
                        })[0].response;

                        callback(null, largestHeight);

                    });
                },
                submitMethod: function(callback){
                    /* This checks to see whether the daemon uses submitblock
                       or getblocktemplate for submitting new blocks */
                    newDaemon.cmd('submitblock', [], function(results){
                        var couldNotDetectMethod = results.every(function(result){
                            if (result.error && result.error.message === 'Method not found'){
                                callback(null, false);
                                return false;
                            }
                            else if (result.error && result.error.code === -1){
                                callback(null, true);
                                return false;
                            }
                            else
                                return true;
                        });
                        if (couldNotDetectMethod){
                            emitErrorLog('system', 'Could not detect block submission RPC method');
                            callback('block submission detection failed');
                        }
                    });
                }
            }, function(err, results){
                if (err){
                    emitErrorLog('system', 'Could not start pool, ' + JSON.stringify(err));
                    cback(err);
                    return;
                }

                emitLog('system','Connected to daemon via RPC');


                options.hasSubmitMethod = results.submitMethod;

                if (options.coin.reward === 'POS' && typeof(results.addressInfo.pubkey) == 'undefined') {
                    // address provided is not of the wallet. 
                    emitErrorLog('system', 'The address provided is not from the daemon wallet.');
                    cback(err);
                    return;
                } else {

                    publicKeyBuffer = options.coin.reward === 'POW' ?
                        util.script_to_address(results.addressInfo.address) :
                        util.script_to_pubkey(results.addressInfo.pubkey);

                    //var networkDifficulty = Math.round(results.miningInfo.difficulty * 65536);


                    GetBlockTemplate(newDaemon, function(error, result){
                        if (error) {
                            emitErrorLog('system', 'Error with getblocktemplate on initializing');
                            cback(error);
                        } else {

                            var networkDifficulty = _this.jobManager.currentJob.difficulty;
                            emitLog('network', 'Current block height at ' + results.miningInfo.blocks +
                                ' with block difficulty of ' + networkDifficulty);

                            Object.keys(options.ports).forEach(function(port){
                                var portDiff = options.ports[port].diff;
                                if (portDiff > networkDifficulty)
                                    emitWarningLog('system', 'diff of ' + portDiff + ' on port ' + port +
                                        ' was set higher than network difficulty of ' + networkDifficulty);
                            });


                            cback(null, newDaemon); // finish!
                        }
                    });
                }
            });

        }).on('connectionFailed', function(error){
            emitErrorLog('system','Failed to connect daemon(s): ' + JSON.stringify(error));
        }).on('error', function(message){
            emitErrorLog('system', message);
        });

        newDaemon.init();
    }


    function StartStratumServer(){
        _this.stratumServer = new stratum.Server(options.ports, options.connectionTimeout, options.banning, authorizeFn);
        _this.stratumServer.on('started', function(){
            emitLog('system','Stratum server started on port(s): ' + Object.keys(options.ports).join(', '));
            _this.emit('started');
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
                    client.difficulty,
                    client.extraNonce1,
                    params.extraNonce2,
                    params.nTime,
                    params.nonce,
                    client.socket.remoteAddress,
                    params.name
                );

                resultCallback(result.error, result.result ? true : null);

            }).on('malformedMessage', function (message) {
                emitWarningLog('client', client.workerName + " has sent us a malformed message: " + message);
            }).on('socketError', function(err) {
                emitWarningLog('client', client.workerName + " has somehow had a socket error: " + JSON.stringify(err));
            }).on('socketDisconnect', function() {
                emitLog('client', "Client '" + client.workerName + "' disconnected!");
            }).on('unknownStratumMethod', function(fullMessage) {
                emitLog('client', "Client '" + client.workerName + "' has sent us an unknown stratum method: " + fullMessage.method);
            }).on('socketFlooded', function(){
                emitWarningLog('client', 'Detected socket flooding and purged buffer');
            }).on('ban', function(ipAddress){
                _this.emit('banIP', ipAddress);
                emitWarningLog('client', 'banned IP ' + ipAddress);
            });
        });
    }

    function SetupBlockPolling(){

        if (typeof options.blockRefreshInterval !== "number" || options.blockRefreshInterval <= 0){
            emitLog('system', 'Block template polling has been disabled');
            return;
        }

        var pollingInterval = options.blockRefreshInterval;

        blockPollingIntervalId = setInterval(function () {
            GetBlockTemplate(function(error, result){});
        }, pollingInterval);
        emitLog('system', 'Block polling every ' + pollingInterval + ' milliseconds');
    }

    function GetBlockTemplate(daemonObj, callback){
        if (typeof(callback) === 'undefined') {
            callback = daemonObj;
            daemonObj = _this.daemon;
        }
        daemonObj.cmd('getblocktemplate',
            [{"capabilities": [ "coinbasetxn", "workid", "coinbase/append" ]}],
            function(result){
                if (result.error){
                    emitErrorLog('system', 'getblocktemplate call failed for daemon instance ' +
                        result.instance.index + ' with error ' + JSON.stringify(result.error));
                    callback(result.error);
                } else {
                    var processedNewBlock = _this.jobManager.processTemplate(result.response, publicKeyBuffer);

                    if (processedNewBlock) {
                        Object.keys(_this.varDiff).forEach(function(port){
                            _this.varDiff[port].setNetworkDifficulty(_this.jobManager.currentJob.difficulty);
                        });
                    }
                        

                    callback(null, result.response);
                    callback = function(){};
                }
            }, true
        );
    }

    function CheckBlockAccepted(blockHash, callback){
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
    }


    /**
     * This method is being called from the blockNotify so that when a new block is discovered by the daemon
     * We can inform our miners about the newly found block
    **/
    this.processBlockNotify = function(blockHash) {

        if (typeof(_this.jobManager.currentJob) !== 'undefined' && blockHash !== _this.jobManager.currentJob.rpcData.previousblockhash){
            GetBlockTemplate(function(error, result){
                if (error)
                    emitErrorLog('system', 'Block notify error getting block template for ' + options.coin.name);
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
                    cObj.client.socket.removeAllListeners();
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
        if (typeof(_this.varDiff) === 'undefined') {
            _this.varDiff = {};
        }
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