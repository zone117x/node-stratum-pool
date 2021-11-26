var net = require('net');
var events = require('events');

var pool = require('./pool.js');

exports.daemon = require('./daemon.js');
exports.varDiff = require('./varDiff.js');


exports.createPool = function(poolOptions, authorizeFn){
    var newPool = new pool(poolOptions, authorizeFn);
    return newPool;
};
