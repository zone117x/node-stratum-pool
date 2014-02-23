var net = require('net');
var crypto = require('crypto');
var events = require('events');

var util = require('./util.js');


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

    //Command strings found at: https://en.bitcoin.it/wiki/Protocol_specification
    var commands = {
        version: new Buffer('76657273696F6E0000000000', 'hex')
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
        var buff = new Buffer([]);
        var msgCommand, msgLength, msgChecksum, readingPayload = false;

        var readData = function(data){
            buff = Buffer.concat([buff, data], 2);
            if (!readingPayload){
                if (buff.length < 24) return;
                var msgMagic = buff.readUInt32LE(0);
                msgCommand = buff.slice(4, 16).toString().split("\0", 1)[0];
                msgLength = buff.readUInt32LE(16);
                msgChecksum = buff.readUInt32LE(20);
                if (msgMagic !== magicInt){
                    buff = new Buffer([]);
                    _this.emit('error', 'bad magic number from peer');
                    return;
                }
                readingPayload = true;
                if (buff.length > 24){
                    var d = buff.slice(24);
                    buff = new Buffer([]);
                    readData(d);
                }
                else
                    buff = new Buffer([]);
            }
            else{
                if (buff.length >= msgLength){

                    var msgPayload = buff.slice(0, msgLength);
                    if (util.doublesha(msgPayload).readUInt32LE(0) !== msgChecksum){
                        _this.emit('error', 'bad payload checksum from peer');
                    }
                    else{
                        HandleMessage(msgCommand, msgPayload);
                    }

                    if (buff.length > msgLength){
                        var d = buff.slice(msgLength);
                        buff = new Buffer([]);
                        readingPayload = false;
                        readData(d);
                    }
                    else{
                        buff = new Buffer([]);
                        readingPayload = false;
                    }
                }
            }
        };

        client.on('data', readData);

    }

    function HandleMessage(command, payload){

        //Parsing inv message https://en.bitcoin.it/wiki/Protocol_specification#inv
        if (command === 'inv'){
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
