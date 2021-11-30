var bignum = require('bignum');
var blake3 = require('blake3')
const constants = require('./constants');

var diff1Target = global.diff1Target = bignum.pow(2, 256 - constants.NumZeroAtLeastInHash).sub(1);

/**
 * The BlockTemplate class holds a single job.
 * and provides several methods to validate and submit it to the daemon coin
**/
var BlockTemplate = module.exports = function BlockTemplate(job){

    //private members

    var submits = [];

    //public members

    this.jobId = job.jobId;
    this.fromGroup = job.fromGroup;
    this.toGroup = job.toGroup;
    this.headerBlob = job.headerBlob;
    this.txsBlob = job.txsBlob;
    this.targetBlob = job.targetBlob;
    this.rawData = job.rawData;
    this.target = bignum.fromBuffer(this.targetBlob);
    this.difficulty = diff1Target.div(this.target);

    this.registerSubmit = function(worker, nonce){
        var submission = worker + nonce;
        if (submits.indexOf(submission) === -1){
            submits.push(submission);
            return true;
        }
        return false;
    };

    this.hash = function(nonce){
        if (nonce.length != constants.NonceLength){
            throw new Error("Invalid nonce, size: " + nonce.length);
        }
        var headerExceptNonce = this.headerBlob.slice(constants.NonceLength);
        var header = Buffer.concat([nonce, headerExceptNonce]);
        return blake3.hash(header);
    }

    this.getJobParams = function(){
        if (!this.jobParams){
            this.jobParams = {
                "jobId": this.jobId,
                "fromGroup": this.fromGroup,
                "toGroup": this.toGroup,
                "rawData": this.rawData.toString('hex')
            };
        }
        return this.jobParams;
    };
};
