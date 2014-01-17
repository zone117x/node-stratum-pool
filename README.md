node-stratum
============

[![Build Status](https://travis-ci.org/zone117x/node-stratum.png?branch=master)](https://travis-ci.org/zone117x/node-stratum)

    Under development

High performance Stratum poolserver in Node.js. One instance of this software can startup and manage multiple coin pools, each with their own daemon and stratum port :)

#### Why
This server was built to be more efficient and easier to setup, maintain and scale than existing stratum poolservers which are written in python.
Compared to the spaghetti state of the latest stratum-mining python server, this software should also have a lower barrier to entry for other developers to fork and add features or fix bugs.


Features (need additional testing)
----------------------------------
* Daemon interface
* Stratum TCP socket server
* Block template / job manager
* Optimized generation transaction building
* Process share submissions
* Supports algos: scrypt, scrypt-jane, quark
* Vardiff

#### To do
* Proof-of-stake support
* Statistics module
* Auto-banning flooders


Requirements
------------
* node v0.10+
* coin daemon


Example Usage
-------------

#### Install as a node module by cloning repository

```bash
git clone https://github.com/zone117x/node-stratum node_modules/stratum-pool
npm update
```

#### Module usage

Initialize a new Stratum object
```javascript
var Stratum = require('stratum-pool');

var stratum = new Stratum({
    blockNotifyListener: {
        enabled: false,
        port: 8117,
        password: "test"
    }
});

stratum.on('log', function(text){
    console.log(text);
});
```


Create and start new pool with configuration options and authentication function
```javascript
var pool = stratum.createPool({

    name: "Dogecoin",
    symbol: "doge",
    algorithm: "scrypt", //or "sha256", "scrypt-jane", "quark"
    reward: "POW", //or "POS"
    address: "nhfNedMmQ1Rjb62znwaiJgFhL3f4NQztSp",
    stratumPort: 3334,
    difficulty: 32,
    blockRefreshInterval: 2, //seconds
    daemon: {
        host: "localhost",
        port: 19334,
        user: "testnet",
        password: "testnet"
    },
    varDiff: {
        enabled: true, //set to false to disable vardiff functionality
        minDifficulty: 16, //minimum difficulty. below 16 will cause problems
        maxDifficulty: 1000, //network difficulty will be used if it is lower than this
        daemonDiffUpdateFrequency: 3600, //get the network difficulty every this many seconds
        targetTime: 30, //target time per share (i.e. try to get 1 share per this many seconds)
        retargetTime: 120, //check to see if we should retarget every this many seconds
        variancePercent: 20 //allow average time to very this % from target without retarget
    }

}, function(ip, workerName, password, callback){ //stratum authorization function
    console.log("Authorize " + workerName + ":" + password + "@" + ip);
    callback({
        error: null,
        authorized: true,
        disconnect: false
    });
});
```


Listen to pool events
```javascript
/*
'data' object contains:
    job: 4, //stratum work job ID
    ip: '71.33.19.37', //ip address of client
    worker: 'matt.worker1', //stratum worker name
    difficulty: 64, //stratum client difficulty
    //solution is set if block was found
    solution: '110c0447171ad819dd181216d5d80f41e9218e25d833a2789cb8ba289a52eee4',
    error: 'low share difficulty' //set if share is rejected for some reason
*/
pool.on('share', function(isValidShare, isValidBlock, data){

    if (isValidBlock)
        console.log('Block found');
    else if (isValidShare)
        console.log('Valid share submitted');
    else if (data.solution)
        console.log('We thought a block solution was found but it was rejected by the daemon');
    else
        console.log('Invalid share submitted')

    console.log('share data: ' + JSON.stringify(data));
});



/*
'severity': can be 'debug', 'warning', 'error'
'logKey':   can be 'system' or 'client' indicating if the error
            was caused by our system or a stratum client
*/
pool.on('log', function(severity, logKey, logText){
    console.log(severity + ': ' + '[' + logKey + '] ' + logText);
});
```

Start pool
```javascript
pool.start();
```




#### [Optional, recommended] Setting up blocknotify
  * For stratum initialization options set `blockNotifyListener.enabled` to true
  * Set the `blockNotifyListener.port` and `blockNotifyListener.password`
  * For the blocknotify arguments in your daemon startup parameters or conf file, use:

    ```
    [path to blockNotify.js]
    [pool host]:[pool blockNotifyListener port]
    [blockNotifyListener password]
    [coin symbol set in coin's json config]
    %s"
    ```

    * Example: `dogecoind -blocknotify="scripts/blockNotify.js localhost:8117 mySuperSecurePassword doge %s"`
    * If your daemon is on a different host you will have to copy over `scripts/blockNotify.js`



Credits
-------
* [vekexasia](https://github.com/vekexasia) - co-developer
* pronooob from https://dogehouse.org - being super knowledgeable & helpful
* [Slush0](https://github.com/slush0/stratum-mining) - stratum protocol, documentation and original python code
* [viperaus](https://github.com/viperaus/stratum-mining) - scrypt adaptions to python code
* [ahmedbodi](https://github.com/ahmedbodi/stratum-mining) - more algo adaptions to python code
* [TheSeven](https://github.com/TheSeven) - being super knowledgeable & helpful


Donations
---------
BTC: 1KRotMnQpxu3sePQnsVLRy3EraRFYfJQFR

License
-------
Released under the GNU General Public License v2

http://www.gnu.org/licenses/gpl-2.0.html
