var pool = require('./pool.js');

exports.daemon = require('./daemon.js');
exports.varDiff = require('./varDiff.js');

exports.createPool = function(poolOption){
    var newPool = new pool(poolOption);
    return newPool;
};
