var net = require('net');
var events = require('events');

var pool = require('./pool.js');


var index = module.exports = function index(options){

    var _this = this;
    this.pools = [];


    this.createPool = function(poolOptions, authorizeFn){
        var newPool = new pool(poolOptions, authorizeFn);
        this.pools.push(newPool);
        return newPool;
    };

};
index.prototype.__proto__ = events.EventEmitter.prototype;