var events = require('events');

/*

Vardiff ported from stratum-mining share-limiter
 https://github.com/ahmedbodi/stratum-mining/blob/master/mining/basic_share_limiter.py

 */


function RingBuffer(maxSize){
    var data = [];
    var cursor = 0;
    var isFull = false;
    this.append = function(x){
        if (isFull){
            data[cursor] = x;
            cursor = (cursor + 1) % maxSize;
        }
        else{
            data.push(x);
            cursor++;
            if (data.length === maxSize){
                cursor = 0;
                isFull = true;
            }
        }
    };
    this.avg = function(){
        var total = data.reduce(function(a, b){
            return a + b;
        });
        return total / (isFull ? maxSize : cursor);
    };
    this.size = function(){
        return isFull ? maxSize : cursor;
    };
    this.clear = function(){
        data = [];
        cursor = 0;
        isFull = false;
    };
}


var varDiff = module.exports = function varDiff(options, poolDifficulty){

    var _this = this;

    if (!options.enabled){
        return;
    }

    var networkDifficulty;
    var bufferSize = options.retargetTime / options.targetTime * 4;
    var variance = options.targetTime * (options.variancePercent / 100);
    var tMin = options.targetTime - variance;
    var tMax = options.targetTime + variance;

    this.setNetworkDifficulty = function(diff){
        networkDifficulty = diff;
    };

    setInterval(function(){
        _this.emit('difficultyRequest');
    }, options.daemonDiffUpdateFrequency * 1000);

    this.manageClient = function(client){
        var lastTs;
        var lastRtc;
        var timeBuffer;

        client.on('submit', function(){

            var ts = Date.now() / 1000;

            if (!lastRtc){
                lastRtc = ts - options.retargetTime / 2;
                lastTs = ts;
                timeBuffer = new RingBuffer(bufferSize);
                console.log('first time share vardiff');
                return;
            }

            timeBuffer.append(ts - lastTs);
            lastTs = ts;

            if ((ts - lastRtc) < options.retargetTime && timeBuffer.size() > 0){
                console.log('do not retarget');
                return;
            }

            lastRtc = ts;
            var avg = timeBuffer.avg();

            if (avg < 1)
                avg = 1;

            var ddiff = (client.difficulty * (options.targetTime / avg)) - client.difficulty;

            if (avg > tMax && client.difficulty > options.minDifficulty){
                if (ddiff > -1)
                    ddiff = -1;
                if (ddiff + client.difficulty < poolDifficulty)
                    ddiff = options.minDifficulty - client.difficulty;
            }
            else if (avg < tMin){
                if (ddiff < 1)
                    ddiff = 1;
                var diffMax = networkDifficulty < options.maxDifficulty ? networkDifficulty : options.maxDifficulty;
                if (ddiff + client.difficulty > diffMax)
                    ddiff = diffMax - client.difficulty;
            }
            else{
                console.log('hashrate in range ' + JSON.stringify({ddiff: ddiff, avg: avg}) );
                return;
            }

            var newDiff = client.difficulty * ddiff;
            timeBuffer.clear();

            console.log('sending new difficutly ' + newDiff);

            _this.emit('newDifficulty', client, newDiff);
        });
    };
};
varDiff.prototype.__proto__ = events.EventEmitter.prototype;