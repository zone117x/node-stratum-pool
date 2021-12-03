var http = require('http');
var events = require('events');
var net = require('net');
var Messages = require('./messages');
const constants = require('./constants');

function RestClient(instance, logger){
    function httpRequest(method, path, headers, requestData, callback){
        var options = {
            hostname: instance.hostname,
            port    : instance.port,
            path    : path,
            method  : method,
            headers : headers
        };

        var parseJson = function(res, data){
            var dataJson;

            if (res.statusCode === 401){
                logger('error', 'Unauthorized RPC access - invalid RPC username or password');
                return;
            }

            try{
                dataJson = JSON.parse(data);
            }
            catch(e){
                logger('error', 'Could not parse rpc data from daemon instance ' + instance
                    + '\nRequest Data: ' + jsonData
                    + '\nReponse Data: ' + data);

            }
            callback(dataJson)
        };

        var req = http.request(options, function(res) {
            var data = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function(){
                parseJson(res, data);
            });
        });

        req.on('error', function(e) {
            if (e.code === 'ECONNREFUSED')
                callback({type: 'offline', message: e.message}, null);
            else
                callback({type: 'request error', message: e.message}, null);
        });

        if (requestData) req.end(requestData);
        else req.end();
    }

    this.selfClique = function(callback){
        httpRequest('GET', '/infos/self-clique', {}, '', callback);
    };
}

function MinerClient(instance, logger){
    var client = net.Socket();
    var _this = this;
    this.messages = new Messages();

    this.connect = function(callback){
        client.removeAllListeners('close');
        client.removeAllListeners('error');
        client.removeAllListeners('data');
        client.removeAllListeners('connect');

        client.connect(instance.minerApiPort, instance.hostname);
        client.on('connect', function(){
            logger('debug', 'Connected to mining server');
        });

        var buffer = Buffer.from([]);
        client.on('data', function(data) {
            buffer = Buffer.concat([buffer, data]);
            _this.messages.parseMessage(buffer, function(message, offset){
                buffer = buffer.slice(offset);
                callback(message);
            })
        });

        client.on('error', function(error){
            logger('error', 'Miner connection error: ' + error);
        });

        client.on('close', function(){
            logger('warning', 'Miner connection closed, trying to reconnect...');
            setTimeout(function(){
                _this.connect(callback);
            }, 8000);
        });
    }

    this.submit = function(block, callback){
        var blockSize = block.length;
        var messageSize = 4 + 1 + blockSize; // encodedBlockSize(4 bytes) + messageType(1 byte)
        var msgHeader = Buffer.alloc(9); // encodedMessageSize(4 bytes) + encodedBlockSize(4 bytes) + messageType(1 byte)
        msgHeader.writeUInt32BE(messageSize);
        msgHeader.writeUInt8(constants.SubmitBlockMessageType, 4);
        msgHeader.writeUInt32BE(blockSize, 5);
        var data = Buffer.concat([msgHeader, block]);
        client.write(data, callback);
    }
}

/**
 * The daemon interface interacts with the coin daemon by using the rpc interface.
 * in order to make it work it needs, as constructor, an array of objects containing
 * - 'host'    : hostname where the coin lives
 * - 'port'    : port where the coin accepts rpc connections
**/

function DaemonInterface(instance, logger){

    //private members
    var _this = this;

    this.restClient = new RestClient(instance, logger);

    this.init = function(){
        this.isOnline(function(online){
            if (online)
                _this.emit('online');
        });
    }

    this.isOnline = function(callback){
        _this.restClient.selfClique(function(result){
            var ready = result['selfReady'];
            callback(ready);
            if (!ready)
                _this.emit('cliqueNotReady', result);
        });
    }

    this.isSynced = function(callback){
        _this.restClient.selfClique(function(result){
            callback(result['selfReady'] && result['synced']);
        });
    }

    this.connectToMiningServer = function(callback){
        _this.minerClient = new MinerClient(instance, logger);
        _this.minerClient.connect(callback);
    }

    this.submit = function(block, callback){
        _this.minerClient.submit(block, callback);
    }
}

DaemonInterface.prototype.__proto__ = events.EventEmitter.prototype;

exports.interface = DaemonInterface;
