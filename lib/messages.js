const { Parser } = require("binary-parser");
const constants = require("./constants");

var Messages = module.exports = function Messages(){
    var jobParser = new Parser()
        .endianess("big")
        .uint32('fromGroup')
        .uint32('toGroup')
        .uint32('headerBlobLength')
        .buffer('headerBlob', {
            'clone': true,
            'length': 'headerBlobLength'
        })
        .uint32('txsBlobLength')
        .buffer('txsBlob', {
            'clone': true,
            'length': 'txsBlobLength'
        })
        .uint32('targetLength')
        .buffer('target', {
            'clone': true,
            'length': 'targetLength'
        });

    var jobsParser = new Parser()
        .endianess('big')
        .uint32('jobSize')
        .array('jobs', {
            'type': jobParser,
            'length': 'jobSize'
        });

    var submitResultParser = new Parser(); // TODO: submit result parser

    var headerSize = 4; // 4 bytes body length

    function selectParser(type, callback){
        if (type == constants.JobsMessageType) {
            callback(jobsParser);
        } 
        else if (type == constants.SubmitResultMessageType) {
            callback(submitResultParser);
        }
        else {
            throw Error("Invalid message type"); // TODO: handle error properly
        }
    }

    this.parseMessage = function(buffer, callback){
        if (buffer.length < headerSize) {
            callback(null);
        }
        else {
            var bodyLength = buffer.readUInt32BE();
            var messageType = buffer.readUInt8(headerSize);
            if (buffer.length < (headerSize + bodyLength)) {
                callback(null);
            }
            else {
                var startOffset = headerSize + 1; // 1 byte message type
                var endOffset = headerSize + bodyLength;
                var message = buffer.slice(startOffset, endOffset);
                selectParser(messageType, function(parser){
                    var result = parser.parse(message);
                    result['type'] = messageType;
                    callback(result, endOffset);
                });
            }
        }
    };
};
