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


Requirements
------------
* node v0.10+
* coin daemon


Installation
------------

* Clone repository

    ```bash
    git clone https://github.com/zone117x/node-stratum.git
    cd node-stratum
    ```

* For each coin you would like to start a pool server for, create a file in the "coins" directory titled "(name of coin).json"
  Example configuration for dogecoin.json:

    ```json
    {
        "name": "Dogecoin",
        "symbol": "doge",
        "algorithm": "scrypt",
        "reward": "POW",
        "address": "DDt79i6P3Wro3SD3HSnkRLpMgUGUGdiNhS",
        "stratumPort": 3334,
        "difficulty": 8,
        "daemon": {
            "host": "localhost",
            "port": 8332,
            "user": "test",
            "password": "test"
        }
    }
    ```

  * Supported `"algorithm"` options: `"sha256"` `"scrypt"` `"scrypt-jane"` `"quark"`
  * Supported `"reward"` options: `"POW"` `"POS"`
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
