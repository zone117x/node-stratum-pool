var events = require('events');
var async = require('async');

var varDiff = require('./varDiff.js');
var daemon = require('./daemon.js');
var stratum = require('./stratum.js');
var jobManager = require('./jobManager.js');
var util = require('./util.js');
const constants = require('./constants.js');

/*process.on('uncaughtException', function(err) {
    console.log(err.stack);
    throw err;
});*/

var pool = module.exports = function pool(options, authorizeFn){

    this.options = options;

    var _this = this;
    var blockPollingIntervalId;


    var emitLog        = function(text) { _this.emit('log', 'debug'  , text); };
    var emitWarningLog = function(text) { _this.emit('log', 'warning', text); };
    var emitErrorLog   = function(text) { _this.emit('log', 'error'  , text); };
    var emitSpecialLog = function(text) { _this.emit('log', 'special', text); };

    this.submittingBlocks = [];

    function addSubmittingBlock(chainIndex, shareData){
        var shareDatas = _this.submittingBlocks[chainIndex];
        if (shareDatas){
            shareDatas.push(shareData);
        }
        else {
            _this.submittingBlocks[chainIndex] = [shareData];
        }
    }

    function handleSubmitResult(fromGroup, toGroup, succeed){
        var shareDatas = _this.submittingBlocks[chainIndex];
        if (shareDatas){
            var shareData = shareDatas.shift();
            if (shareDatas.length == 0) {
                _this.submittingBlocks[chainIndex] = undefined;
            }
            if (succeed){
                emitShare(shareData)
            }
            else {
                emitLog('Submit block failed, hash: ' + shareData.blockHash.toString('hex'));
            }
        }
        else {
            emitLog('No submitting block for chainIndex: ' + chainIndex(fromGroup, toGroup));
        }
    }

    this.start = function(){
        SetupVarDiff();
        SetupApi();
        SetupDaemonInterface(function(){
            SetupJobManager();
            OnBlockchainSynced(function(){
                StartStratumServer();
            });
        });
    };

    function OnBlockchainSynced(syncedCallback){

        var checkSynced = function(displayNotSynced){
            _this.daemon.isSynced(function(synced){
                if (synced){
                    syncedCallback();
                }
                else{
                    if (displayNotSynced) displayNotSynced();
                    setTimeout(checkSynced, 5000);
                }
            });
        };
        checkSynced(function(){
            //Only let the first fork show synced status or the log wil look flooded with it
            if (!process.env.forkId || process.env.forkId === '0')
                emitErrorLog('Daemon is still syncing with network (download blockchain) - server will be started once synced');
        });
    }


    function SetupApi() {
        if (typeof(options.api) !== 'object' || typeof(options.api.start) !== 'function') {
            return;
        } else {
            options.api.start(_this);
        }
    }

    function SetupVarDiff(){
        _this.varDiff = {};
        Object.keys(options.ports).forEach(function(port) {
            if (options.ports[port].varDiff)
                _this.setVarDiff(port, options.ports[port].varDiff);
        });
    }


    /*
    Coin daemons either use submitblock or getblocktemplate for submitting new blocks
     */
    function SubmitBlock(job, nonce, callback){
        var block = Buffer.concat([nonce, job.headerBlob, job.txsBlob]);
        _this.daemon.cmd(rpcCommand,
            rpcArgs,
            function(results){
                for (var i = 0; i < results.length; i++){
                    var result = results[i];
                    if (result.error) {
                        emitErrorLog('rpc error with daemon instance ' +
                                result.instance.index + ' when submitting block with ' + rpcCommand + ' ' +
                                JSON.stringify(result.error)
                        );
                        return;
                    }
                    else if (result.response === 'rejected') {
                        emitErrorLog('Daemon instance ' + result.instance.index + ' rejected a supposedly valid block');
                        return;
                    }
                }
                emitLog('Submitted Block using ' + rpcCommand + ' successfully to daemon instance(s)');
                callback();
            }
        );

    }

    function emitShare(shareData){
        _this.emit('share', shareData);
    }

    function SetupJobManager(){

        _this.jobManager = new jobManager(options);

        _this.jobManager.on('newJobs', function(templates){
            //Check if stratumServer has been initialized yet
            if (_this.stratumServer) {
                _this.stratumServer.broadcastMiningJobs(templates);
            }
        }).on('updatedBlock', function(blockTemplate){
            //Check if stratumServer has been initialized yet
            if (_this.stratumServer) {
                var job = blockTemplate.getJobParams();
                job[8] = false;
                _this.stratumServer.broadcastMiningJobs(job);
            }
        }).on('share', function(shareData){
            if (shareData.error){
                // TODO: more debug info
                // we only emit valid shares
                emitLog('Invalid share, error: ' + shareData.error);
                return;
            }

            if (!shareData.foundBlock){
                emitShare(shareData);
            }
            else{
                var job = shareData.job;
                emitLog('Found block for chainIndex: ' 
                    + chainIndexStr(job.fromGroup, job.toGroup) 
                    + ', hash: ' + shareData.blockHash.toString('hex')
                );
                addSubmittingBlock(job.chainIndex, shareData);
                var block = Buffer.concat([shareData.nonce, job.headerBlob, job.txsBlob]);
                // emit share after we received submit result
                _this.daemon.submit(block, function(error){
                    emitErrorLog('Submit block error: ' + error);
                });
            }
        }).on('log', function(severity, message){
            _this.emit('log', severity, message);
        });
    }

    function chainIndexStr(fromGroup, toGroup){
        return fromGroup + " -> " + toGroup;
    }

    function SetupDaemonInterface(finishedCallback){

        if (!options.daemon) {
            emitErrorLog('No daemons have been configured - pool cannot start');
            return;
        }

        // TODO: support backup daemons
        _this.daemon = new daemon.interface(options.daemon, function(severity, message){
            _this.emit('log', severity , message);
        });

        _this.daemon.once('online', function(){
            finishedCallback();
            _this.daemon.connectToFullNode(function(message){
                if (message.type == constants.JobsMessageType) {
                    _this.jobManager.processJobs(message.payload);
                }
                else if (message.type == constants.SubmitResultMessageType) {
                    var result = message.payload;
                    handleSubmitResult(result.fromGroup, result.toGroup, result.succeed);
                }
                else {
                    emitErrorLog('Invalid message type: ' + message['type']);
                }
            });
        }).on('connectionFailed', function(error){
            emitErrorLog('Failed to connect daemon(s): ' + JSON.stringify(error));

        }).on('error', function(message){
            emitErrorLog(message);

        });

        _this.daemon.init();
    }


    function StartStratumServer(){
        _this.stratumServer = new stratum.Server(options, authorizeFn);

        _this.stratumServer.on('started', function(){
            _this.stratumServer.broadcastMiningJobs(_this.jobManager.currentJobs);
        }).on('client.connected', function(client){
            if (typeof(_this.varDiff[client.socket.localPort]) !== 'undefined') {
                _this.varDiff[client.socket.localPort].manageClient(client);
            }

            client.on('subscription', function(params, resultCallback){

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
                    params,
                    client.previousDifficulty,
                    client.difficulty,
                    client.remoteAddress,
                    client.socket.localPort,
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

    function CheckBlockAccepted(blockHash, callback){
        //setTimeout(function(){
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
        //}, 500);
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


    this.setVarDiff = function(port, varDiffConfig) {
        if (typeof(_this.varDiff[port]) != 'undefined' ) {
            _this.varDiff[port].removeAllListeners();
        }
        var varDiffInstance = new varDiff(port, varDiffConfig);
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
