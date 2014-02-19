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
        var sum = data.reduce(function(a, b){ return a + b });
        return sum / (isFull ? maxSize : cursor);
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
    console.log(options);
    var _this = this;

    var networkDifficulty;
    var bufferSize = options.retargetTime / options.targetTime * 4;
    var variance = options.targetTime * (options.variancePercent / 100);
    var tMin = options.targetTime - variance;
    var tMax = options.targetTime + variance;


    setInterval(function(){
        _this.emit('difficultyRequest');
    }, options.daemonDiffUpdateFrequency * 1000);


    this.setNetworkDifficulty = function(diff){
        networkDifficulty = diff;
    };
    this.setPoolDifficulty = function(diff){
        poolDifficulty = diff;
    };


    this.manageClient = function(client){
        var lastTs;
        var lastRtc;
        var timeBuffer;

        client.on('submit', function(){

            var ts = (Date.now() / 1000) | 0;

            if (!lastRtc){
                lastRtc = ts - options.retargetTime / 2;
                lastTs = ts;
                timeBuffer = new RingBuffer(bufferSize);
                console.log(bufferSize+ ' first time share vardiff curdiff: '+client.difficulty);
                return;
            }
            var sinceLast = ts - lastTs;

            timeBuffer.append(sinceLast);
            lastTs = ts;

            if ((ts - lastRtc) < options.retargetTime && timeBuffer.size() > 0){
                console.log('do not retarget');
                return;
            }

            lastRtc = ts;
            var avg = timeBuffer.avg();


            var ddiff;

            if (avg > tMax && client.difficulty > options.minDifficulty) {
                ddiff = 0.5;
                if (ddiff * client.difficulty < options.minDifficulty) {
                    ddiff = options.minDifficulty / client.difficulty;
                }
            } else if (avg < tMin) {
                ddiff = 2;

                var diffMax = networkDifficulty < options.maxDifficulty ? networkDifficulty : options.maxDifficulty;
                var diffMax = options.maxDifficulty;
                console.log("Max & network", diffMax, networkDifficulty);
                if (ddiff * client.difficulty > diffMax) {
                    ddiff = diffMax / client.difficulty;
                }

                console.log('increasing difficulty, ddiff: ' + ddiff);
            }
            else{
                console.log('hashrate in range ' + JSON.stringify({ddiff: ddiff, avg: avg}) );
                return;
            }

            var newDiff = client.difficulty * ddiff;
            timeBuffer.clear();

            //console.log('sending new difficutly ' + newDiff);

            _this.emit('newDifficulty', client, newDiff);
        });
    };
};
varDiff.prototype.__proto__ = events.EventEmitter.prototype;