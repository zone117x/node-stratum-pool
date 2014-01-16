node-stratum
============

    Under development

High performance Stratum poolserver in Node.js. One instance of this software can startup and manage multiple coin pools, each with their own daemon and stratum port :)

#### Why
This server was built to be more efficient and easier to setup, maintain and scale than existing stratum poolservers which are written in python.
Compared to the spaghetti state of the latest stratum-mining python server, this software should also have a lower barrier to entry for other developers to fork and add features or fix bugs.


Features (mostly untested)
--------------------------
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

* Install as a node module by cloning repository

    ```bash
    git clone https://github.com/zone117x/node-stratum node_modules/stratum-pool
    npm update
    ```

* Module usage

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

var pool = stratum.createPool({

    name: "Dogecoin",
    symbol: "doge",
    algorithm: "scrypt",
    reward: "POW",
    address: "nhfNedMmQ1Rjb62znwaiJgFhL3f4NQztSp",
    stratumPort: 3334,
    difficulty: 32,
    blockRefreshInterval: 1,
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

pool.on('share', function(isValidShare, isValidBlock, data){
    var shareData = JSON.stringify(data);

    if (isValidBlock)
        console.log('Block found, share data: ' + shareData);
    else if (isValidShare)
        console.log('Valid share submitted, share data: ' + shareData);
    else if (data.solution)
        console.log('We thought a block solution was found but it was rejected by the daemon, share data: ' + shareData);
    else
        console.log('Invalid share submitted, share data: ' + shareData)
});

pool.on('log', function(severity, logKey, logText){
    console.log(severity + ': ' + '[' + logKey + '] ' + logText);
};

pool.start();
```

  * Supported `algorithm` options: `"sha256"` `"scrypt"` `"scrypt-jane"` `"quark"`
  * Supported `reward` options: `"POW"` `"POS"`
  * Ensure the `daemon` properties are configured correctly for RPC communication

* [Optional, recommended] Setting up blocknotify
  * Inside `config.json` make sure `blockNotifyListener.enabled` is set to true
  * Set the `blockNotifyListener.port` and `blockNotifyListener.password`
  * For the blocknotify arguments in your daemon startup parameters or conf file, use:

    ```
    [path to blockNotify.js]
    [pool host]:[pool blockNotifyListener port]
    [blockNotifyListener password]
    [coin symbol set in coin's json config]
    %s"
    ```

    * Example: `dogecoind -blocknotify="blockNotify.js localhost:8117 mySuperSecurePassword doge %s"`
    * If your daemon is on a different host you will have to copy over `blockNotify.js`



Credits
-------
* [vekexasia](https://github.com/vekexasia) - co-developer
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
