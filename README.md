High performance Stratum poolserver in Node.js. One instance of this software can startup and manage multiple coin
pools, each with their own daemon and stratum port :)

#### Notice
This is a module for Node.js that will do nothing on its own. Unless you're a Node.js developer who would like to
handle stratum authentication and raw share data then this module will not be of use to you. For a full featured portal
that uses this module, see [NOMP (Node Open Mining Portal)](https://github.com/zone117x/node-open-mining-portal). It
handles payments, website front-end, database layer, mutli-coin/pool support, auto-switching miners between coins/pools,
etc.. The portal also has an [MPOS](https://github.com/MPOS/php-mpos) compatibility mode so that the it can function as
a drop-in-replacement for [python-stratum-mining](https://github.com/Crypto-Expert/stratum-mining).


[![Build Status](https://travis-ci.org/zone117x/node-stratum-pool.png?branch=master)](https://travis-ci.org/zone117x/node-stratum-pool)

[![NPM](https://nodei.co/npm/stratum-pool.png?downloads=true&stars=true)](https://nodei.co/npm/stratum-pool/)

#### Why
This server was built to be more efficient and easier to setup, maintain and scale than existing stratum poolservers
which are written in python. Compared to the spaghetti state of the latest
[stratum-mining python server](https://github.com/Crypto-Expert/stratum-mining/), this software should also have a
lower barrier to entry for other developers to fork and add features or fix bugs.


Features
----------------------------------
* Daemon RPC interface
* Stratum TCP socket server
* Block template / job manager
* Optimized generation transaction building
* Connecting to multiple daemons for redundancy
* Process share submissions
* Session managing for purging DDoS/flood initiated zombie workers
* Auto ban IPs that are flooding with invalid shares
* __POW__ (proof-of-work) & __POS__ (proof-of-stake) support
* Transaction messages support
* Vardiff (variable difficulty / share limiter)
* When started with a coin deamon that hasn't finished syncing to the network it shows the blockchain download progress and initializes once synced

#### Hashing algorithms supported:
* ✓ __SHA256__ (Bitcoin, Freicoin, Peercoin/PPCoin, Terracoin, etc..)
* ✓ __Scrypt__ (Litecoin, Dogecoin, Feathercoin, etc..)
* ✓ __Scrypt-Jane__ (YaCoin, CopperBars, Pennies, Tickets, etc..)
* ✓ __Scrypt-N__ (Vertcoin [VTC])
* ✓ __Quark__ (Quarkcoin [QRK])
* ✓ __X11__ (Darkcoin [DRK])


Under development:
* ✗ *Keccak* (CopperLark [CLR])
* ✗ *Max* (Maxcoin [MAX], HelixCoin [HXC])
* ✗ *Skein* (Skeincoin [SKC])
* ✗ *Bcrypt* (Taojingcoin [TJC])
* ✗ *Hefty1* (Heavycoin [HVC])
* ✗ *Blake* (Blakecoin [BLC])
* ✗ *Fugue* (Fuguecoin [FC])
* ✗ *SHAvite-3* (INKcoin [INK])


#### Under development

* P2P functionality for highly efficient block updates from daemon as a peer node

Requirements
------------
* node v0.10+
* coin daemon (preferably one with a relatively updated API and not some crapcoin :p)


Example Usage
-------------

#### Install as a node module by cloning repository

```bash
git clone https://github.com/zone117x/node-stratum-pool node_modules/stratum-pool
npm update
```

#### Module usage

Create the configuration for your coin:

```javascript
var myCoin = {
    "name": "Dogecoin",
    "symbol": "DOGE",
    "algorithm": "scrypt", //or "sha256", "scrypt-jane", "scrypt-n", "quark", "x11"
    "txMessages": false, //or true (not required, defaults to false)
};
```

If you are using the `scrypt-jane` algorithm there are additional configurations:

```javascript
var myCoin = {
    "name": "Freecoin",
    "symbol": "FEC",
    "algorithm": "scrypt-jane",
    "chainStartTime": 1375801200, //defaults to 1367991200 (YACoin) if not used
    "nMin": 6, //defaults to 4 if not used
    "nMax": 32 //defaults to 30 if not used
};
```

If you are using the `scrypt-n` algorithm there is an additional configuration:
```javascript
var myCoin = {
    "name": "Execoin",
    "symbol": "EXE",
    "algorithm": "scrypt-n",
    /* This defaults to Vertcoin's timetable if not used. It is required for scrypt-n coins that have
       modified their N-factor timetable to be different than Vertcoin's. */
    "timeTable": {
        "2048": 1390959880,
        "4096": 1438295269,
        "8192": 1485630658,
        "16384": 1532966047,
        "32768": 1580301436,
        "65536": 1627636825,
        "131072": 1674972214,
        "262144": 1722307603
    }
};
```

Create and start new pool with configuration options and authentication function

```javascript
var Stratum = require('stratum-pool');

var pool = Stratum.createPool({

    "coin": myCoin,

    "address": "mi4iBXbBsydtcc5yFmsff2zCFVX4XG7qJc", //Address to where block rewards are given
    "blockRefreshInterval": 1000, //How often to poll RPC daemons for new blocks, in milliseconds

    /* How many milliseconds should have passed before new block transactions will trigger a new
       job broadcast. */
    "txRefreshInterval": 20000,

    /* Some miner software is bugged and will consider the pool offline if it doesn't receive
       anything for around a minute, so every time we broadcast jobs, set a timeout to rebroadcast
       in this many seconds unless we find a new job. Set to zero or remove to disable this. */
    "jobRebroadcastTimeout": 55,

    //instanceId: 37, //Recommend not using this because a crypto-random one will be generated

    /* Some attackers will create thousands of workers that use up all available socket connections,
       usually the workers are zombies and don't submit shares after connecting. This features
       detects those and disconnects them. */
    "connectionTimeout": 600, //Remove workers that haven't been in contact for this many seconds

    /* Sometimes you want the block hashes even for shares that aren't block candidates. */
    "emitInvalidBlockHashes": false,

    /* We use proper maximum algorithm difficulties found in the coin daemon source code. Most
       miners/pools that deal with scrypt use a guesstimated one that is about 5.86% off from the
       actual one. So here we can set a tolerable threshold for if a share is slightly too low
       due to mining apps using incorrect max diffs and this pool using correct max diffs. */
    "shareVariancePercent": 10,

    /* Enable for client IP addresses to be detected when using a load balancer with TCP proxy
       protocol enabled, such as HAProxy with 'send-proxy' param:
       http://haproxy.1wt.eu/download/1.5/doc/configuration.txt */
    "tcpProxyProtocol": false,

    /* If a worker is submitting a high threshold of invalid shares we can temporarily ban their IP
       to reduce system/network load. Also useful to fight against flooding attacks. If running
       behind something like HAProxy be sure to enable 'tcpProxyProtocol', otherwise you'll end up
       banning your own IP address (and therefore all workers). */
    "banning": {
        "enabled": true,
        "time": 600, //How many seconds to ban worker for
        "invalidPercent": 50, //What percent of invalid shares triggers ban
        "checkThreshold": 500, //Check invalid percent when this many shares have been submitted
        "purgeInterval": 300 //Every this many seconds clear out the list of old bans
    },

    /* Each pool can have as many ports for your miners to connect to as you wish. Each port can
       be configured to use its own pool difficulty and variable difficulty settings. varDiff is
       optional and will only be used for the ports you configure it for. */
    "ports": {
        "3032": { //A port for your miners to connect to
            "diff": 32, //the pool difficulty for this port

            /* Variable difficulty is a feature that will automatically adjust difficulty for
               individual miners based on their hashrate in order to lower networking overhead */
            "varDiff": {
                "minDiff": 8, //Minimum difficulty
                "maxDiff": 512, //Network difficulty will be used if it is lower than this
                "targetTime": 15, //Try to get 1 share per this many seconds
                "retargetTime": 90, //Check to see if we should retarget every this many seconds
                "variancePercent": 30 //Allow time to very this % from target without retargeting
            }
        },
        "3256": { //Another port for your miners to connect to, this port does not use varDiff
            "diff": 256 //The pool difficulty
        }
    },


    /* Recommended to have at least two daemon instances running in case one drops out-of-sync
       or offline. For redundancy, all instances will be polled for block/transaction updates
       and be used for submitting blocks. Creating a backup daemon involves spawning a daemon
       using the "-datadir=/backup" argument which creates a new daemon instance with it's own
       RPC config. For more info on this see:
          - https://en.bitcoin.it/wiki/Data_directory
          - https://en.bitcoin.it/wiki/Running_bitcoind */
    "daemons": [
        {   //Main daemon instance
            "host": "127.0.0.1",
            "port": 19332,
            "user": "litecoinrpc",
            "password": "testnet"
        },
        {   //Backup daemon instance
            "host": "127.0.0.1",
            "port": 19344,
            "user": "litecoinrpc",
            "password": "testnet"
        }
    ],


    /* This allows the pool to connect to the daemon as a node peer to recieve block updates.
       It may be the most efficient way to get block updates (faster than polling, less
       intensive than blocknotify script). However its still under development (not yet working). */
    "p2p": {
        "enabled": false,
        "host": "127.0.0.1",
        "port": 19333,

        /* Magic value is different for main/testnet and for each coin. It is found in the daemon
           source code as the pchMessageStart variable.
           For example, litecoin mainnet magic: http://git.io/Bi8YFw
           And for litecoin testnet magic: http://git.io/NXBYJA
         */
        "magic": "fcc1b7dc",

        //Found in src as the PROTOCOL_VERSION variable, for example: http://git.io/KjuCrw
        "protocolVersion": 70002,
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
    reward: 5000000000, //the number of satoshis received as payment for solving this block
    height: 443795, //block height
    networkDifficulty: 3349 //network difficulty for this block

    //AAK the block solution - set if block was found
    blockHash: '110c0447171ad819dd181216d5d80f41e9218e25d833a2789cb8ba289a52eee4',

    //Exists if "emitInvalidBlockHashes" is set to true
    blockHashInvalid: '110c0447171ad819dd181216d5d80f41e9218e25d833a2789cb8ba289a52eee4'

    //txHash is the coinbase transaction hash from the block
    txHash: '41bb22d6cc409f9c0bae2c39cecd2b3e3e1be213754f23d12c5d6d2003d59b1d,

    error: 'low share difficulty' //set if share is rejected for some reason
*/
pool.on('share', function(isValidShare, isValidBlock, data){

    if (isValidBlock)
        console.log('Block found');
    else if (isValidShare)
        console.log('Valid share submitted');
    else if (data.blockHash)
        console.log('We thought a block was found but it was rejected by the daemon');
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


Credits
-------
* [vekexasia](https://github.com/vekexasia) - co-developer & great tester
* [TheSeven](https://github.com/TheSeven) - answering an absurd amount of my questions, found the block 1-16 problem, provided example code for peer node functionality
* [pronooob](https://dogehouse.org) - knowledgeable & helpful
* [Slush0](https://github.com/slush0/stratum-mining) - stratum protocol, documentation and original python code
* [viperaus](https://github.com/viperaus/stratum-mining) - scrypt adaptions to python code
* [ahmedbodi](https://github.com/ahmedbodi/stratum-mining) - more algo adaptions to python code
* [steveshit](https://github.com/steveshit) - ported X11 hashing algo from python to node module


Donations
---------
To support development of this project feel free to donate :)

* BTC: `1KRotMnQpxu3sePQnsVLRy3EraRFYfJQFR`
* LTC: `LKfavSDJmwiFdcgaP1bbu46hhyiWw5oFhE`
* VTC: `VgW4uFTZcimMSvcnE4cwS3bjJ6P8bcTykN`
* MAX: `mWexUXRCX5PWBmfh34p11wzS5WX2VWvTRT`
* QRK: `QehPDAhzVQWPwDPQvmn7iT3PoFUGT7o8bC`
* DRK: `XcQmhp8ANR7okWAuArcNFZ2bHSB81jpapQ`
* DOGE: `DBGGVtwAAit1NPZpRm5Nz9VUFErcvVvHYW`
* Cryptsy Trade Key: `254ca13444be14937b36c44ba29160bd8f02ff76`

License
-------
Released under the GNU General Public License v2

http://www.gnu.org/licenses/gpl-2.0.html
