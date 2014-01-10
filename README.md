node-stratum
============

    Under development

High performance Stratum poolserver in Node.js. One instance of this software can startup and manage multiple coin pools, each with their own daemon and stratum port :)


Features (mostly untested)
--------------------------
* Daemon interface
* Stratum TCP socket server
* Block template / job manager
* Optimized generation transaction building
* Process share submissions
* Supports algos: scrypt, scrypt-jane, quark

#### To do
* Proof-of-stake support
* Payment processing module
* Vardiff
* Statistics module
* Integrate with PostgreSQL database
* Web frontend


Requirements
------------
* node v0.10+
* coin daemon
* PostgreSQL
* npm dependencies
  * [scrypt256-hash](https://github.com/zone117x/node-scrypt256-hash)
  * [scrypt-jane-hash](https://github.com/zone117x/node-scrypt-jane-hash)
  * [quark-hash](https://github.com/zone117x/node-quark-hash)
  * [binpack](https://github.com/russellmcc/node-binpack)
  * [bignum](https://github.com/justmoon/node-bignum)
  * [buffertools] (https://github.com/bnoordhuis/node-buffertools)
  * [base58-native](https://github.com/gasteve/node-base58)
  * [async](https://github.com/caolan/async)


Credits
-------
* [Slush0](https://github.com/slush0/stratum-mining) - stratum protocol, documentation and original python code
* [viperaus](https://github.com/viperaus/stratum-mining) - scrypt adaptions to python code
* [ahmedbodi](https://github.com/ahmedbodi/stratum-mining) - more algo adaptions to python code
* [TheSeven](https://github.com/TheSeven) - being super knowledgeable & helpful
* [vekexasia](https://github.com/vekexasia) - lots of help with research and development

Donations
---------
BTC: 1KRotMnQpxu3sePQnsVLRy3EraRFYfJQFR

License
-------
Released under the GNU General Public License v2

http://www.gnu.org/licenses/gpl-2.0.html
