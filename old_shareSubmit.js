

/*
var binpack = require('/usr/lib/node_modules/binpack');
var bignum = require('/usr/lib/node_modules/bignum');

var merkle = require('./merkleTree.js');
var coinbase = require('./transactions.js');
var util = require('./util.js');



exports.submit = function(job_id, worker_name, extranonce1_bin, extranonce2, ntime, nonce, difficulty){

    var job = JobStore.find(job_id);

    var extraNonce2Size = transactions.extranonce_size - ExtraNonceCounter.size();

    if (extranonce2.length != extraNonce2Size * 2)
        return {error: 'rejected'} //Incorrect size of extranonce2

    if (!job)
        return {error: 'unknown-work'}

    if (ntime.length != 8)
        return {error: 'rejected'}

    if (!job.check_ntime(parseInt(ntime, 16)))
        return {error: 'time-invalid'};

    if (nonce.length != 8)
        return {error: 'rejected'};

    if (!job.register_submit(extranonce1_bin, extranonce2, ntime ,nonce))
        return {error: 'duplicate'};


    var extranonce2_bin = new Buffer(extranonce2, 'hex');
    var ntime_bin = new Buffer(ntime, 'hex');
    var nonce_bin = new Buffer(nonce, 'hex');

    var coinbase_bin = job.serialize_coinbase(extranonce1_bin, extranonce2_bin);
    var coinbase_hash = util.doublesha(coinbase_bin);

    var merkle_root_bin = job.template.merkleTree.withFirst(coinbase_hash);
    var merkle_root_int = util.uint


};

    */