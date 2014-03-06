var net = require('net');
var crypto = require('crypto');
var events = require('events');

var util = require('./util.js');


//Example of p2p in node from TheSeven: http://paste.pm/e54.js


var commandStringBuffer = function(s){
    var buff = new Buffer(12);
    buff.fill(0);
    buff.write(s);
    return buff;
};

/* Reads a set amount of bytes from a flowing stream, argument descriptions:
   - stream to read from, must have data emitter
   - amount of bytes to read
   - preRead argument can be used to set start with an existing data buffer
   - callback returns 1) data buffer and 2) lopped/over-read data */
var readFlowingBytes = function(stream, amount, preRead, callback){

    var buff = preRead ? preRead : new Buffer([]);

    var readData = function(data){
        buff = Buffer.concat([buff, data], 2);
        if (buff.length >= amount){
            var returnData = buff.slice(0, amount);
            var lopped = buff.length > amount ? buff.slice(amount): null;
            callback(returnData, lopped);
        }
        else
            stream.once('data', readData);
    };

    readData(buff);
};

var Peer = module.exports = function(options){

    var _this = this;
    var client;
    var magic = new Buffer(options.magic, 'hex');
    var magicInt = magic.readUInt32LE(0);

    //https://en.bitcoin.it/wiki/Protocol_specification#Inventory_Vectors
    var invVectMsgBlock = 2; //Hash from inventory message is related to a data block

    var networkServices = new Buffer('0100000000000000', 'hex'); //NODE_NETWORK services (value 1 packed as uint64)
    var emptyNetAddress = new Buffer('010000000000000000000000000000000000ffff000000000000', 'hex');
    var userAgent = util.varStringBuffer('/node-stratum/');
    var blockStartHeight = new Buffer('00000000', 'hex'); //block start_height, can be empty

    //If protocol version is new enough, add do not relay transactions flag byte, outlined in BIP37
    //https://github.com/bitcoin/bips/blob/master/bip-0037.mediawiki#extensions-to-existing-messages
    var relayTransactions = options.protocolVersion >= 70001 ? new Buffer([false]) : new Buffer([]);

    var commands = {
        version: commandStringBuffer('version'),
        inv: commandStringBuffer('inv')
    };


    (function init(){
        Connect();
    })();


    function Connect(){

        client = net.connect(options.host, options.port, function(){
            _this.emit('connected');
            SendVersion();
        });
        client.on('end', function(){
            _this.emit('disconnected');
            Connect();
        });
        client.on('error', function(){
            _this.emit('connectionFailed');
        });


        SetupMessageParser(client);

    }

    function SetupMessageParser(client){

        var beginReadingMessage = function(preRead){

            readFlowingBytes(client, 24, preRead, function(header, lopped){
                var msgMagic = header.readUInt32LE(0);
                if (msgMagic !== magicInt){
                    _this.emit('error', 'bad magic number from peer');
                    beginReadingMessage(null);
                    return;
                }
                var msgCommand = header.slice(4, 16).toString();
                var msgLength = header.readUInt32LE(16);
                var msgChecksum = header.readUInt32LE(20);
                readFlowingBytes(client, msgLength, lopped, function(payload, lopped){
                    if (util.doublesha(payload).readUInt32LE(0) !== msgChecksum){
                        _this.emit('error', 'bad payload - failed checksum');
                        beginReadingMessage(null);
                        return;
                    }
                    HandleMessage(msgCommand, payload);
                    beginReadingMessage(lopped);
                });
            });
        };

        beginReadingMessage(null);
    }


    //Parsing inv message https://en.bitcoin.it/wiki/Protocol_specification#inv
    function HandleInv(payload){
        //sloppy varint decoding
        var count = payload.readUInt8(0);
        payload = payload.slice(1);
        if (count >= 0xfd)
        {
            count = payload.readUInt16LE(0);
            payload = payload.slice(2);
        }
        while (count--)
        {
            if (payload.readUInt32LE(0) === invVectMsgBlock){
                var block = payload.slice(4, 36).toString('hex');
                console.log('block found ' + block);
                _this.emit('blockFound', block);
            }
            payload = payload.slice(36);
        }
    }

    function HandleMessage(command, payload){

        switch(command){
            case commands.inv.toString():
                HandleInv(payload);
                break;
        }

    }

    //Message structure defined at: https://en.bitcoin.it/wiki/Protocol_specification#Message_structure
    function SendMessage(command, payload){
        var message = Buffer.concat([
            magic,
            command,
            util.packUInt32LE(payload.length),
            util.doublesha(payload).slice(0, 4),
            payload
        ]);
        client.write(message);
    }

    function SendVersion(){
        var payload = Buffer.concat([
            util.packUInt32LE(options.protocolVersion),
            networkServices,
            util.packUInt32LE(Date.now() / 1000 | 0),
            emptyNetAddress, //addr_recv, can be empty
            emptyNetAddress, //addr_from, can be empty
            crypto.pseudoRandomBytes(8), //nonce, random unique ID
            userAgent,
            blockStartHeight,
            relayTransactions
        ]);
        SendMessage(commands.version, payload);
    }

};

Peer.prototype.__proto__ = events.EventEmitter.prototype;
