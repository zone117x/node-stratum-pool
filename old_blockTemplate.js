/*

function BlockTemplate(jobId, data){


    this.jobId = jobId;

    //CBlock

    this.nVersion = 1;
    this.hashPrevBlock = 0;
    this.hashMerkleRoot = 0;
    this.nTime = 0;
    this.nBits = 0;
    this.nNonce = 0;
    this.vtx = [];
    this.sha256 = null;
    this.scrypt = null;
    //---


    this.jobId = JobStore.nextId();

    this.submits = [];

    var txHashes = [null].concat(data.transactions.map(function(tx){
        return util.uint256BufferFromHash(tx.hash);
    }));

    this.merkleTree = new merkle.Tree(txHashes);

    this.coinbase = new coinbase.CoinbaseTransaction(
        data.coinbasevalue,
        data.coinbaseaux.flags,
        data.height
    );

    this.vtx = [this.coinbase.tx];

    data.transactions.each(function(tx){
        var t = new coinbase.CTransaction();
        t.deserialize(new Buffer(tx.data, 'hex'));
        this.vtx.push(t);
    });

    this.height = data.height;
    this.nVersion = data.version;
    this.nBits = parseInt(data.bits, 16);
    this.hashMerkleRoot = 0;
    this.nNonce = 0;
    this.curTime = data.curtime;
    this.timeDelt = this.curTime - Math.floor(Date.now() / 1000);
    this.target = util.uint256_from_compact(this.nBits);
    this.prevHashBin = util.reverseBuffer(new Buffer(data.previousblockhash, 'hex'));
    this.broadCastArgs = this.buildBroadcastArgs();
}
BlockTemplate.prototype = {
    registerSubmit: function(extraNonce1, extraNonce2, nTime, nonce){
        var t = [extraNonce1, extraNonce2, nTime, nonce];

        this.submits.forEach(function(s){
            if (s.join(',') == t.join(','))
                return false;
        });
        this.submits.push(t);
        return true;
    },

    buildBroadcastArgs: function(){
        return [
            this.jobId,
            this.prevHashBin.toString('hex'),
            this.coinbase.serialized[0].toString('hex'),
            this.coinbase.serialized[1].toString('hex'),
            this.merkleTree.steps.map(function(s){
                return s.toString('hex');
            }),
            binpack.packInt32(this.nVersion, 'big').toString('hex'),
            binpack.packUInt32(this.nBits, 'big').toString('hex'),
            binpack.packUInt32(this.curTime, 'big').toString('hex'),
            true //cleanJobs
        ];
    },

    serializeCoinbase: function(extraNonce1, extraNonce2){
        var parts = this.coinbase.serialized;
        return Buffer.concat([
            parts[0],
            extraNonce1,
            extraNonce2,
            parts[1]
        ]);
    },

    checkNTime: function(nTime){
        if (nTime < this.curTime)
            return false;

        if (nTime > ((Date.now() / 1000) + 7200))
            return false;

        return true;
    },

    serializeHeader: function(merkleRootInt, nTimeBin, nonceBin){
        return Buffer.concat([
            binpack.packInt32(this.version, 'big'),
            this.prevHashBin,
            util.ser_uint256_be(merkleRootInt),
            nTimeBin,
            binpack.packUInt32(this.nBits, 'big'),
            nonceBin
        ]);
    },

    finalize: function(merkleRootInt, extraNonce1Bin, extraNonce2Bin, nTime, nonce){
        this.hashMerkleRoot = merkleRootInt;
        this.nTime = nTime;
        this.nNonce = nonce;
        this.vtx[0].setExtraNonce(Buffer.concat([extraNonce1Bin, extraNonce2Bin]));
        this.sha256 = null;
    },

    //CBlock

    deserialize: function(f){
        util.makeBufferReadable(f);
        this.nVersion = f.read(4).readInt32LE(0);
        this.hashPrevBlock = util.hexFromReversedBuffer(f.read(32));
        this.hashMerkleRoot = util.hexFromReversedBuffer(f.read(32));
        this.nTime = f.read(4).readUInt32LE(0);
        this.nBits = f.read(4).readUInt32LE(0);
        this.nNonce = f.read(4).readUInt32LE(0);
        this.vtx = util.deser_vector(f, coinbase.CTransaction);
    },

    serialize: function(){
        return Buffer.concat([
            binpack.packInt32(this.nVersion, 'little'),
            util.uint256BufferFromHash(this.hashPrevBlock),
            util.uint256BufferFromHash(this.hashMerkleRoot),
            binpack.packUInt32(this.nTime, 'little'),
            binpack.packUInt32(this.nBits, 'little'),
            binpack.packUInt32(this.nNonce, 'little'),
            util.ser_vector(this.vtx)
        ]);
    },

    calcSha256: function(){
        if (!this.sha256){
            var r = Buffer.concat([
                binpack.packInt32(this.nVersion, 'little'),
                util.uint256BufferFromHash(this.hashPrevBlock),
                util.uint256BufferFromHash(this.hashMerkleRoot),
                binpack.packUInt32(this.nTime, 'little'),
                binpack.packUInt32(this.nBits, 'little'),
                binpack.packUInt32(this.nNonce, 'little')
            ]);
            this.sha256 = util.doublesha(r);
        }
        return this.sha256;
    },

    calc_scrypt: function(){

    },

    is_valid: function(){
        this.calc_sha256();
        var target = bignum.fromBuffer(new Buffer(this.nBits, 'hex'));
        if (bignum.fromBuffer(this.sha256).gt(target))
            return false;
        var hashes = [];
    }




};

*/