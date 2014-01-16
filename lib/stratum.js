var net = require('net');
var events = require('events');

var binpack = require('binpack');

var util = require('./util.js');


var SubscriptionCounter = function(){
    var count = 0;
    var padding = 'deadbeefcafebabe';
    return {
        next: function(){
            count++;
            if (Number.MAX_VALUE === count) count = 0;
            return padding + binpack.packUInt64(count, 'big').toString('hex');
        }
    };
};


/**
 * Defining each client that connects to the stratum server. 
 * Emits:
 *  - 'subscription'(obj, cback(error, extraNonce1, extraNonce2Size)) 
 *  - 'submit' FIX THIS.
**/
var StratumClient = function(options){

    //private members
    this.socket = options.socket;

    var _this = this;

    (function init(){
        setupSocket();
    })();

    function handleMessage(message){
        switch(message.method){
            case 'mining.subscribe':
                handleSubscribe(message);
                break;
            case 'mining.authorize':
                handleAuthorize(message);
                break;
            case 'mining.submit':
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
                        ["mining.notify", options.subscriptionId],
                        extraNonce1,
                        extraNonce2Size
                    ],
                    error: null
                });
            }
        );
    }

    function handleAuthorize(message){
        _this.workerIP   = options.socket.address().address; 
        _this.workerName = message.params[0];
        _this.workerPass = message.params[1];
        options.authorizeFn(_this.workerIP, _this.workerName, _this.workerPass, function(result) {
            _this.authorized = (!result.error && result.authorized);
            sendJson({
                    id     : message.id,
                    result : _this.authorized,
                    error  : result.error
                });

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
            return;
        }
        if (!_this.extraNonce1){
            sendJson({
                id    : message.id,
                result: null,
                error : [25, "not subscribed", null]
            });
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
        socket.on('data', function(d){
            dataBuffer += d;
            if (dataBuffer.slice(-1) === '\n'){
                var messages = dataBuffer.split('\n');
                messages.forEach(function(message){
                    if (message.trim() === '') return;
                    var messageJson;
                    try {
                        messageJson = JSON.parse(message);
                    } catch(e) {
                        _this.emit('malformedMessage', message);
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
                _this.emit('socketDisconnect')
            else
                _this.emit('socketError');
        });
    }


    //public members

    /**
     * IF the given difficulty is valid and new it'll send it to the client.
     * returns boolean
     **/
    this.sendDifficulty = function(difficulty){
        if (typeof(difficulty) != 'number') {
            console.error('[StratumClient.sendDifficulty] given difficulty parameter is not a number: ['+difficulty+']');
            return false;
        }

        if (difficulty !== this.difficulty) {
            this.difficulty = difficulty;
            sendJson({
                id    : null,
                method: "mining.set_difficulty",
                params: [difficulty]//[512],
            });
            return true;
        } else {
            return false;
        }

    };

    this.sendMiningJob = function(jobParams){
        sendJson({
            id    : null,
            method: "mining.notify",
            params: jobParams
        });
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
var StratumServer = exports.Server = function StratumServer(options){

    //private members

    var _this = this;
    var socketServer;
    var stratumClients = {};
    var subscriptionCounter = SubscriptionCounter();

    (function init(){
        _socketServer = socketServer = net.createServer({allowHalfOpen: true}, function(c){
            c.setKeepAlive(true);
            var subscriptionId = subscriptionCounter.next();
            var client = new StratumClient(
                {
                    subscriptionId : subscriptionId, 
                    socket         : c,
                    authorizeFn    : options.authorizeFn
                }
            );
            stratumClients[subscriptionId] = client;
            _this.emit('client.connected', client);
            client.on('socketDisconnect', function() {
                delete stratumClients[subscriptionId];
                _this.emit('client.disconnected', client);
            });
        });
        _socketServer.listen(options.port, function(){
            _this.emit('started');
        });
    })();


    //public members

    this.broadcastMiningJobs = function(jobParams) {
        for (var clientId in stratumClients) {
            // if a client gets disconnected WHILE doing this loop a crash might happen.
            // 'm not sure if that can ever happn but an if here doesn't hurt!
            if (typeof(stratumClients[clientId]) !== 'undefined') {
                stratumClients[clientId].sendMiningJob(jobParams);
            }
        }
    };
};
StratumServer.prototype.__proto__ = events.EventEmitter.prototype;