var util = require('./util.js');


/*var merkleJoin = function(h1, h2){
    var buff1 = new Buffer(h1, 'hex');
    var buff2 = new Buffer(h2, 'hex');
    var buffJoined = Buffer.concat([buff2, buff1]);

    var buffJSON = buffJoined.toJSON();
    buffJSON.reverse();
    var buffReversed = new Buffer(buffJSON);

    var hash2 = util.doublesha(buffReversed);

    var dhashJSON = hash2.toJSON();
    dhashJSON.reverse();
    var dhash = new Buffer(dhashJSON);

    return dhash.toString('hex');
};*/



var MerkleTree = module.exports = function MerkleTree(data){

    function merkleJoin(h1, h2){
        var joined = Buffer.concat([h1, h2]);
        var dhashed = util.doublesha(joined);
        return dhashed;
    }

    function calculateSteps(data){
        var L = data;
        var steps = [];
        var PreL = [null];
        var StartL = 2;
        var Ll = L.length;

        if (Ll > 1){
            while (true){

                if (Ll == 1)
                    break;

                steps.push(L[1]);

                if (Ll % 2)
                    L.push(L[L.length - 1]);

                var Ld = [];
                var r = util.range(StartL, Ll, 2);
                r.forEach(function(i){
                    Ld.push(merkleJoin(L[i], L[i + 1]));
                });
                L = PreL.concat(Ld);
                Ll = L.length;
            }
        }
       return steps;
    }

    this.data = data;
    this.steps = calculateSteps(data);

}
MerkleTree.prototype = {

    hashSteps: function(){
        if (!this.stepsHash)
            this.stepsHash = util.doublesha(Buffer.concat(this.steps));
        return this.stepsHash;
    },
    withFirst: function(f){
        this.steps.forEach(function(s){
            f = util.doublesha(Buffer.concat([f, s]));
        });
        return f;
    },
    merkleRoot: function(){
        return this.withFirst(this.data[0]);
    }
};