const bignum = require('bignum');
const blake3 = require('blake3')
const constants = require('./constants');

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
    this.target = bignum.fromBuffer(this.targetBlob);
    this.chainIndex = this.fromGroup * constants.GroupSize + this.toGroup;

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
        var header = Buffer.concat([nonce, this.headerBlob]);
        return blake3.hash(blake3.hash(header));
    }

    this.getJobParams = function(){
        if (!this.jobParams){
            this.jobParams = {
                jobId: this.jobId,
                fromGroup: this.fromGroup,
                toGroup: this.toGroup,
                headerBlob: this.headerBlob.toString('hex'),
                txsBlob: this.txsBlob.toString('hex'),
                targetBlob: this.targetBlob.toString('hex')
            };
        }
        return this.jobParams;
    };
};
