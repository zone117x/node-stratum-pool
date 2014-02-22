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


    var emitLog        = function(key, text) { _this.emit('log', 'debug'  , key, text); };
    var emitWarningLog = function(key, text) { _this.emit('log', 'warning', key, text); };
    var emitErrorLog   = function(key, text) { _this.emit('log', 'error'  , key, text); };

    this.start = function(){
        SetupJobManager();
        SetupVarDiff();
        SetupDaemonInterface();
    };

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
        if (!options.varDiff.enabled){
            emitLog('system', 'VarDiff has been disabled');
            return;
        }
        _this.varDiff = new varDiff(options.varDiff, options.difficulty);
        _this.varDiff.on('difficultyRequest', function(){
            emitLog('varDiff', 'Difficulty requested for vardiff');
            if (_this.stratumServer)
                RequestDifficulty(function(){});
        }).on('newDifficulty', function(client, newDiff) {


            if (options.varDiff.mode === 'safe'){
                /* We request to set the newDiff @ the next difficulty retarget
                  (which should happen when a new job comes in - AKA BLOCK) */
                client.enqueueNextDifficulty(newDiff);
            }
            else{
                /* Send new difficulty, then force miner to use new diff by resending the
                   current job parameters but with the "clean jobs" flag set to false
                   so the miner doesn't restart work and submit duplicate shares */
                client.sendDifficulty(newDiff);
                var job = _this.jobManager.currentJob.getJobParams();
                job[8] = false;
                client.sendMiningJob(job);
            }
        });
        emitLog("system", "VarDiff enabled and setup");
    }


    function RequestDifficulty(callback){
        _this.daemon.cmd('getmininginfo',
            [],
            function(error, result){
                if (error) {
                    emitErrorLog('getdifficulty', 'Error requesting difficulty from daemon for vardiff');
                } else {
                    if (options.varDiff.enabled)
                        _this.varDiff.setNetworkDifficulty(result.difficulty);
                    callback(error, result);
                }
            }
        );
    }

    /*
    Coin daemons either use submitblock or getblocktemplate for submitting new blocks
     */
    function SubmitBlock(blockHex, callback){
        if (options.hasSubmitMethod) {
            _this.daemon.cmd('submitblock',
                [blockHex],
                function(error, result){
                    emitLog('submitblock', JSON.stringify([error,result]));
                    
                    if (error)
                        emitErrorLog('submitblock', 'rpc error when submitting block with submitblock')
                    else
                        emitLog('submitblock', 'Submitted Block using submitblock');
                    callback();
                }
            );
        } else {
            _this.daemon.cmd('getblocktemplate',
                [{'mode': 'submit', 'data': blockHex}],
                function(error, result){
                    emitLog('submitblock', JSON.stringify([error,result]));

                    if (error)
                        emitErrorLog('submitblock', 'rpc error when submitting block with getblocktemplate')
                    else
                        emitLog('submitblock', 'Submitted Block using getblocktemplate');
                    callback()
                }
            );
        }
    }


    function SetupJobManager(){
        _this.jobManager = new jobManager({
            algorithm : options.algorithm,
            address   : options.address,
            reward    : options.reward,
            txMessages: options.txMessages
        });
        _this.jobManager.on('newBlock', function(blockTemplate){
            //Check if stratumServer has been initialized yet
            if ( typeof(_this.stratumServer ) !== 'undefined') {
                emitLog('system', 'Detected new block');
                _this.stratumServer.broadcastMiningJobs(blockTemplate.getJobParams());
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
                    CheckBlockAccepted(shareData.solution, function(isAccepted){
                        isValidBlock = isAccepted;
                        emitShare();
                    });
                });
            }
        }).on('debugBlockShare', function(debugData) {
            emitLog('debugBlockSubmit', JSON.stringify(debugData));
        });
    }


    function SetupDaemonInterface(){
        //emitLog('system','Connecting to daemon');
        _this.daemon = new daemon.interface(options.daemon);
        _this.daemon.on('online', function(){
            async.parallel({
                networkDifficulty: RequestDifficulty,
                addressInfo: function(callback){
                    _this.daemon.cmd('validateaddress',
                        [options.address],
                        function(error, result){
                            if (error){
                                emitErrorLog('system','validateaddress rpc error');
                                callback(error);
                            } else if (!result.isvalid) {
                                emitErrorLog('system','address is not valid');
                                callback("address-not-valid");
                            } else {
                                callback(error, result);
                            }
                        }
                    );
                },
                miningInfo: function(callback){
                    _this.daemon.cmd('getmininginfo', [], function(error, result){
                        if (!error && result){
                            emitLog('system', 'Daemon is running on ' +
                                (result.testnet ? 'testnet' : 'live blockchain'))
                        }
                        else
                            emitErrorLog('system', 'getmininginfo on init failed');

                        callback(error, result);
                    });
                },
                submitMethod: function(callback){
                    /* This checks to see whether the daemon uses submitblock
                       or getblocktemplate for submitting new blocks */
                    _this.daemon.cmd('submitblock',
                        [],
                        function(error, result){
                            if (error && error.message === 'Method not found')
                                callback(null, false);
                            else
                                callback(null, true);
                        }
                    );
                }
            }, function(err, results){
                if (err){
                    emitErrorLog('system', 'Failed to daemon');
                    return;
                }

                emitLog('system','Connected to daemon');

                options.hasSubmitMethod = results.submitMethod;

                if (options.reward === 'POS' && typeof(results.addressInfo.pubkey) == 'undefined') {
                    // address provided is not of the wallet. 
                    emitErrorLog('system', 'The address provided is not from the daemon wallet.');
                    return;
                } else {

                    publicKeyBuffer = options.reward === 'POW' ?
                        util.script_to_address(results.addressInfo.address) :
                        util.script_to_pubkey(results.addressInfo.pubkey);

                    if (options.difficulty > results.networkDifficulty && options.difficulty > 16){
                        var newDiff = results.networkDifficulty > 16 ? results.networkDifficulty : 16;
                        emitWarningLog('system', 'pool difficulty was set higher than network difficulty of ' + results.networkDifficulty);
                        emitWarningLog('system', 'lowering pool diff from ' + options.difficulty + ' to ' + newDiff);

                        options.difficulty = newDiff

                        if (options.varDiff.enabled)
                            _this.varDiff.setPoolDifficulty(options.difficulty);
                    }

                    GetBlockTemplate(function(error, result){
                        if (error){
                            console.error(error);
                            emitErrorLog('system', 'Error with initial getblocktemplate');
                        }
                        else{
                            SetupBlockPolling();
                            StartStratumServer();
                            SetupPeer();
                        }
                    });
                }
            });

        }).on('startFailed', function(){
            emitErrorLog('system','Failed to start daemon');
        }).on('error', function(message){
            emitErrorLog('system', message);
        });
    }


    function StartStratumServer(){
        //emitLog('system', 'Stratum server starting on port ' + options.stratumPort);
        _this.stratumServer = new stratum.Server({
            port: options.stratumPort,
            authorizeFn: authorizeFn
        });
        _this.stratumServer.on('started', function(){
            emitLog('system','Stratum server started on port ' + options.stratumPort);
            _this.emit('started');
        }).on('client.connected', function(client){

            if (options.varDiff.enabled)
                _this.varDiff.manageClient(client);

            client.on('difficultyChanged', function(diff){
                _this.emit('difficultyUpdate', client.workerName, diff);
            }).on('subscription', function(params, resultCallback){

                var extraNonce = _this.jobManager.extraNonceCounter.next();
                var extraNonce2Size = _this.jobManager.extraNonce2Size;
                resultCallback(null,
                    extraNonce,
                    extraNonce2Size
                );

                this.sendDifficulty(options.difficulty);
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
                emitWarningLog('client', client.workerName+" has sent us a malformed message: "+message);
            }).on('socketError', function() {
                emitWarningLog('client', client.workerName+" has somehow had a socket error");
            }).on('socketDisconnect', function() {
                emitLog('client', "Client '"+client.workerName+"' disconnected!");
            }).on('unknownStratumMethod', function(fullMessage) {
                emitLog('client', "Client '"+client.workerName+"' has sent us an unknown stratum method: "+fullMessage.method);
            }).on('socketFlooded', function(){
                emitWarningLog('client', 'Detected socket flooding and purged buffer');
            });
        });
    }

    function SetupBlockPolling(){

        if (options.blockRefreshInterval === 0){
            emitLog('system', 'Block template polling has been disabled');
            return;
        }

        var pollingInterval = options.blockRefreshInterval * 1000;

        setInterval(function () {
            GetBlockTemplate(function(error, result) {
                if (error) {
                    emitErrorLog('system', "Block polling error getting block template for " + options.name)
                }
                
            });
            
        }, pollingInterval);
        emitLog('system', 'Block polling every ' + pollingInterval + ' milliseconds');
    }

    function GetBlockTemplate(callback){
        _this.daemon.cmd('getblocktemplate',
            [{"capabilities": [ "coinbasetxn", "workid", "coinbase/append" ]}],
            function(error, result){
                if (error) {
                    callback(error);
                } else {
                    _this.jobManager.processTemplate(result, publicKeyBuffer);
                    callback(null, result);
                }
            }
        );
    }

    function CheckBlockAccepted(blockHash, callback){
        _this.daemon.cmd('getblock',
            [blockHash],
            function(error, result){
                if (error)
                    callback(false);
                else if (result.hash === blockHash)
                    callback(true);
                else
                    callback(false);
            }
        );
    }

    /**
     * This method is being called from the blockNotify so that when a new block is discovered by the daemon
     * We can inform our miners about the newly found block
    **/
    this.processBlockNotify = function(blockHash){
        if (blockHash !== _this.jobManager.currentJob.rpcData.previousblockhash){
            GetBlockTemplate(function(error, result){
                if (error)
                    emitErrorLog('system', 'Block notify error getting block template for ' + options.name);
            })
        }
    }

};
pool.prototype.__proto__ = events.EventEmitter.prototype;