const { Parser } = require("binary-parser");
const constants = require("./constants");

var headerSize = 4; // 4 bytes body length

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
    .buffer('targetBlob', {
        'clone': true,
        'length': 'targetLength'
    })
    .saveOffset('rawDataLength');

exports.parseMessage = function(buffer, callback){
    if (buffer.length < headerSize) {
        callback(null, 0);
    }
    else {
        var bodyLength = buffer.readUInt32BE();
        if (buffer.length < (headerSize + bodyLength)) {
            callback(null, 0);
        }
        else {
            var messageType = buffer.readUInt8(headerSize);
            var startOffset = headerSize + 1; // 1 byte message type
            var endOffset = headerSize + bodyLength;
            var message = buffer.slice(startOffset, endOffset);
            var payload = parse(messageType, message);
            var result = {
                type: messageType,
                payload: payload
            };
            callback(result, endOffset);
        }
    }
}

function parse(messageType, buffer){
    if (messageType == constants.JobsMessageType) {
        return parseJobs(buffer);
    }
    else if (messageType == constants.SubmitResultMessageType) {
        return parseSubmitResult(buffer);
    }
    else {
        throw Error("Invalid message type"); // TODO: handle error properly
    }
}

function parseJobs(buffer){
    var jobSize = buffer.readUInt32BE();
    var offset = 4;
    var jobs = [];
    for (var index = 0; index < jobSize; index++){
        var job = jobParser.parse(buffer.slice(offset));
        var length = job.rawDataLength;
        job.rawData = buffer.slice(offset, offset+length);
        jobs[index] = job;
        offset += length;
    }
    return jobs;
}

function parseSubmitResult(buffer){
    var fromGroup = buffer.readUInt32BE();
    var toGroup = buffer.readUInt32BE(4);
    var result = buffer.readUInt8(8);
    var succeed = result == 1;
    return {
        fromGroup: fromGroup,
        toGroup: toGroup,
        succeed: succeed
    };
}
