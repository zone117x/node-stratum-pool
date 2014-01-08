var scryptJane = require('./build/Release/scryptjanehash');

var data = new Buffer('3459083906839048590834983687495679485760485646', 'hex');

var hashed = scryptJane.digest(data, Date.now() / 1000 | 0);
console.log(hashed.toString('hex'));