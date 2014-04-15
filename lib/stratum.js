var net = require('net');
var events = require('events');

var util = require('./util.js');


var SubscriptionCounter = function(){
    var count = 0;
    var padding = 'deadbeefcafebabe';
    return {
        next: function(){
            count++;
            if (Number.MAX_VALUE === count) count = 0;
            return padding + util.packInt64LE(count).toString('hex');
        }
    };
};


/**
 * Defining each client that connects to the stratum server. 
 * Emits:
 *  - subscription(obj, cback(error, extraNonce1, extraNonce2Size))
 *  - submit(data(name, jobID, extraNonce2, ntime, nonce))
**/
var StratumClient = function(options){
    var pendingDifficulty = null;
    //private members
    this.socket = options.socket;

    this.remoteAddress = options.remoteAddress;

    var banning = options.banning;

    var _this = this;

    this.lastActivity = Date.now();

    this.shares = {valid: 0, invalid: 0};

    var considerBan = (!banning || !banning.enabled) ? function(){} : function(shareValid){
        if (shareValid === true) _this.shares.valid++;
        else _this.shares.invalid++;
        var totalShares = _this.shares.valid + _this.shares.invalid;
        if (totalShares >= banning.checkThreshold){
            var percentBad = (_this.shares.invalid / totalShares) * 100;
            if (percentBad >= banning.invalidPercent){
                _this.emit('ban', _this.remoteAddress);
                _this.socket.end();
            }
            else //reset shares
                this.shares = {valid: 0, invalid: 0};
        }
    };

    (function init(){
        setupSocket();
    })();

    function handleMessage(message){
        switch(message.method){
            case 'mining.subscribe':
                handleSubscribe(message);
                break;
            case 'mining.authorize':
                handleAuthorize(message, true /*reply to socket*/);
                break;
            case 'mining.submit':
                _this.lastActivity = Date.now();
                handleSubmit(message);
                break;
            case 'mining.get_transactions':
                sendJson({
                    id     : null,
                    result : [],
                    error  : true
                });
                break;
            default:
                _this.emit('unknownStratumMethod', message);
                break;
        }
    }

    function handleSubscribe(message){
        if (! _this._authorized ) {
            _this.requestedSubscriptionBeforeAuth = true;
        }
        _this.emit('subscription',
            {},
            function(error, extraNonce1, extraNonce2Size){
                if (error){
                    sendJson({
                        id: message.id,
                        result: null,
                        error: error
                    });
                    return;
                }
                _this.extraNonce1 = extraNonce1;
                sendJson({
                    id: message.id,
                    result: [
                        [
                            ["mining.set_difficulty", options.subscriptionId],
                            ["mining.notify", options.subscriptionId]
                        ],
                        extraNonce1,
                        extraNonce2Size
                    ],
                    error: null
                });
            }
        );
    }

    function handleAuthorize(message, replyToSocket){
        _this.workerIP   = options.socket.address().address; 
        _this.workerName = message.params[0].toLowerCase();
        _this.workerPass = message.params[1];
        options.authorizeFn(_this.workerIP, _this.workerName, _this.workerPass, function(result) {
            _this.authorized = (!result.error && result.authorized);
            
            if (replyToSocket) {
                sendJson({
                        id     : message.id,
                        result : _this.authorized,
                        error  : result.error
                    });
            }

            // If the authorizer wants us to close the socket lets do it.
            if (result.disconnect === true) {
                options.socket.end();
            }
        });
    }

    function handleSubmit(message){
        if (!_this.authorized){
            sendJson({
                id    : message.id,
                result: null,
                error : [24, "unauthorized worker", null]
            });
            considerBan(false);
            return;
        }
        if (!_this.extraNonce1){
            sendJson({
                id    : message.id,
                result: null,
                error : [25, "not subscribed", null]
            });
            considerBan(false);
            return;
        }
        _this.emit('submit',
            {
                name        : message.params[0],
                jobId       : message.params[1],
                extraNonce2 : message.params[2],
                nTime       : message.params[3],
                nonce       : message.params[4]
            },
            function(error, result){
                considerBan(result);
                sendJson({
                    id     : message.id,
                    result : result,
                    error  : error
                });
            }
        );
        
    }

    function sendJson(){
        var response = '';
        for (var i = 0; i < arguments.length; i++){
            response += JSON.stringify(arguments[i]) + '\n';
        }
        options.socket.write(response);
    }

    function setupSocket(){
        var socket = options.socket;
        var dataBuffer = '';
        socket.setEncoding('utf8');
        socket.once('data', function(d){
            if (d.indexOf('PROXY') === 0){
                _this.remoteAddress = d.split(' ')[2];
                console.log('detected proxy source IP address of ' + _this.remoteAddress);
            }
            _this.emit('checkBan');
        });
        socket.on('data', function(d){
            dataBuffer += d;
            if (Buffer.byteLength(dataBuffer, 'utf8') > 1024){
                dataBuffer = '';
                _this.emit('socketFlooded');
                socket.end();
                return;
            }
            if (dataBuffer.slice(-1) === '\n'){
                var messages = dataBuffer.split('\n');
                messages.forEach(function(message){
                    if (message.trim() === '') return;
                    var messageJson;
                    try {
                        messageJson = JSON.parse(message);
                    } catch(e) {
                        if (d.indexOf('PROXY') !== 0){
                            _this.emit('malformedMessage', message);
                            socket.end();
                        }
                        return;
                    }

                    if (messageJson) {
                        handleMessage(messageJson);
                    }
                });
                dataBuffer = '';
            }
        });
        socket.on('end', function() {
            _this.emit('socketDisconnect')
        });
        socket.on('error', function(err){
            if (err.code === 'ECONNRESET')
                _this.emit('socketDisconnect');
            else
                _this.emit('socketError', err);
        });
    }

    this.enqueueNextDifficulty = function(requestedNewDifficulty) {
        pendingDifficulty = requestedNewDifficulty;
        return true;
    };

    //public members

    /**
     * IF the given difficulty is valid and new it'll send it to the client.
     * returns boolean
     **/
    this.sendDifficulty = function(difficulty){
        if (difficulty === this.difficulty)
            return false;

        _this.previousDifficulty = _this.difficulty;
        _this.difficulty = difficulty;
        sendJson({
            id    : null,
            method: "mining.set_difficulty",
            params: [difficulty]//[512],
        });
        return true;
    };

    this.sendMiningJob = function(jobParams){

        if (Date.now() - _this.lastActivity > options.socketTimeout){
            _this.socket.end();
            return;
        }

        if (pendingDifficulty !== null){
            var result = _this.sendDifficulty(pendingDifficulty);
            pendingDifficulty = null;
            if (result) {
                _this.emit('difficultyChanged', _this.difficulty);
            }
        }
        sendJson({
            id    : null,
            method: "mining.notify",
            params: jobParams
        });

    };

    this.manuallyAuthClient = function (username, password) {
        handleAuthorize({id: 1, params: [username, password]}, false /*do not reply to miner*/);
    };

    this.manuallySetValues = function (otherClient) {
        _this.extraNonce1        = otherClient.extraNonce1;
        _this.previousDifficulty = otherClient.previousDifficulty;
        _this.difficulty         = otherClient.difficulty;
    };
};
StratumClient.prototype.__proto__ = events.EventEmitter.prototype;




/**
 * The actual stratum server.
 * It emits the following Events:
 *   - 'client.connected'(StratumClientInstance) - when a new miner connects
 *   - 'client.disconnected'(StratumClientInstance) - when a miner disconnects. Be aware that the socket cannot be used anymore.
 *   - 'started' - when the server is up and running
 **/
var StratumServer = exports.Server = function StratumServer(ports, connectionTimeout, jobRebroadcastTimeout, banning, authorizeFn){

    //private members

    var socketTimeout = connectionTimeout * 1000;
    var bannedMS = banning ? banning.time * 1000 : null;

    var _this = this;
    var stratumClients = {};
    var subscriptionCounter = SubscriptionCounter();
    var rebroadcastTimeout;
    var bannedIPs = {};

    //Interval to look through bannedIPs for old bans and remove them in order to prevent a memory leak
    var purgeOldBans = (!banning || !banning.enabled) ? null : setInterval(function(){
        for (ip in bannedIPs){
            var banTime = bannedIPs[ip];
            if (Date.now() - banTime > banning.time)
                delete bannedIPs[ip];
        }
    }, 1000 * banning.purgeInterval);

    var checkBan = function(client){
        if (banning && banning.enabled && client.remoteAddress in bannedIPs){
            var bannedTime = bannedIPs[client.remoteAddress];
            if ((Date.now() - bannedTime) < bannedMS){
                client.socket.end();
                return null;
            }
            else {
                delete bannedIPs[client.remoteAddress];
            }
        }
    };

    this.handleNewClient = function (socket){

        socket.setKeepAlive(true);
        var subscriptionId = subscriptionCounter.next();
        var client = new StratumClient(
            {
                subscriptionId: subscriptionId,
                socket: socket,
                authorizeFn: authorizeFn,
                banning: banning,
                socketTimeout: socketTimeout,
                remoteAddress: socket.remoteAddress
            }
        );

        stratumClients[subscriptionId] = client;
        _this.emit('client.connected', client);
        client.on('socketDisconnect', function() {
            _this.removeStratumClientBySubId(subscriptionId);
            _this.emit('client.disconnected', client);
        }).on('ban', function(ipAddress){
            _this.banIP(ipAddress);
        }).on('checkBan', function(){
            checkBan(client);
        });
        return subscriptionId;
    };
 
    (function init(){
        var serversStarted = 0;
        Object.keys(ports).forEach(function(port){
            net.createServer({allowHalfOpen: false}, function(socket) {
                _this.handleNewClient(socket);
            }).listen(parseInt(port), function() {
                serversStarted++;
                if (serversStarted == Object.keys(ports).length)
                    _this.emit('started');
            });
        });

    })();


    //public members

    this.banIP = function(ipAddress){
        bannedIPs[ipAddress] = Date.now();
    };

    this.broadcastMiningJobs = function(jobParams) {
        for (var clientId in stratumClients) {
            // if a client gets disconnected WHILE doing this loop a crash might happen.
            // 'm not sure if that can ever happen but an if here doesn't hurt!
            var client = stratumClients[clientId];
            if (typeof(client) !== 'undefined') {
                client.sendMiningJob(jobParams);
            }
        }
        
        /* Some miners will consider the pool dead if it doesn't receive a job for around a minute.
           So every time we broadcast jobs, set a timeout to rebroadcast in X seconds unless cleared. */
        if (isNaN(jobRebroadcastTimeout) || jobRebroadcastTimeout <= 0) return;
        clearTimeout(rebroadcastTimeout);
        rebroadcastTimeout = setTimeout(function(){
            var resendParams = jobParams;
            resendParams[8] = false;
            _this.broadcastMiningJobs(resendParams);
        }, jobRebroadcastTimeout * 1000);
    };

    this.getStratumClients = function () {
        return stratumClients;
    };

    this.removeStratumClientBySubId = function (subscriptionId) {
        delete stratumClients[subscriptionId];
    };

    this.manuallyAddStratumClient = function(clientObj) {
        var subId = _this.handleNewClient(clientObj.socket);
        if (subId != null) { // not banned!
            stratumClients[subId].manuallyAuthClient(clientObj.workerName, clientObj.workerPass);
            stratumClients[subId].manuallySetValues(clientObj);
        }
    }

};
StratumServer.prototype.__proto__ = events.EventEmitter.prototype;
