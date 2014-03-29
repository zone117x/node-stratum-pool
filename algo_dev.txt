In order to implement a new algo in a pool you need three things
   1) the C code to do the actual hashing - which I convert into a native node addon
   2) the max difficulty (diff1) of the coin used to check if shares/blocks are valid
   3) the share multiplier (2^16 for example) to determine the hashrate of a miner/entire pool


Most coins have diff1 in format like (~uint256(0) >> 20)
I believe you can determine the hashrate multiplier by subtracting the 20 used in bitshift from the number 32
so it would be 2^12 for this one. or for (~uint256(0) >> 16) it would be 2^(32 - 16)

so really for every algo you simple need the bitshift on a zero value uint256.


I believe these are the true diff1 values that should be used on pools for each algo
 sha256d:       0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 scrypt:        0x0000f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 scrypt-jane:   0x0000f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 scrypt-n:      0x0000f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 x11:           0x0000f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 quark:         0x0000f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 shavite:       0x0000f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 keccak:        0x000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 fugue:         0x000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 blake:         0x000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 hefty1:        0x0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 bcrypt:        0x00f8ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff

To see how I generated these diff1 values see https://github.com/zone117x/node-stratum-pool/blob/master/diff1.js



So remember how that list to add a new algo had 3 items, well the maxcoin devs very unforutentely did something
that added a fourth step:
 Step 4) Determine which parts of how work-generation / share-processing / creating-blocks work were arbitrarily
 changed and implement them....


Maxcoin devs, it seems, did not simply implement keccek in the way that litecoin devs implemented scrypt.
Or how the darkcoin devs implements x11, or how the quarkcoin devs implemented quark. The maxcoin devs
decided to change several parts of how the the currency works - so that instead of simply changing the block
hashing from sha256d to keccak, you have to change a few other parts of the block creation/submission progress.
I believe there is actually at least one coin that implemented keccak hashing normally - copperlark coin.
Too bad its source and binaries are only on some sketchy russian site and neither will compile/run on my
system.. Anyway, it looks like several coin devs forked this maxcoin and switched out keccak with
a different algo. This group of max-tainted algos I believe to be: keccak, fugue, blake.
There may be more, and there may be coins that implemented those algos the regular way instead of the maxcoin
way. So.. for each of these max-tainted algos we may have to implement, for example, blake and blake-max, or
keccak and keccak-max.



One of my goals is to create a single native node.js addon that has all the hashing functions. So many of them
share the same C code. Also it appears that some coins slightly tweak the way an algo is used which renders
the currernt native node addon for that algo useless unless modified. Seems much better to have one big native
node addon with all the hashing algos, and each configurable for the needs of different coins. It would make
the process of adding a new algo much more simple as well.




hefty1
https://github.com/heavycoin/heavycoin/blob/master/src/main.cpp#L40
00000000ffff0000000000000000000000000000000000000000000000000000
https://github.com/heavycoin/heavycoin-hash-python


keccak
https://github.com/Max-Coin/maxcoin/blob/master/src/main.cpp#L42
https://github.com/wecoin/wecoin/blob/master/src/main.cpp#L44
https://github.com/phusion/node-sha3
https://github.com/GalleonBank/galleon

blake
https://github.com/BlueDragon747/Blakecoin/blob/master/src/main.cpp#L38
https://github.com/BlueDragon747/Blakecoin_Python_POW_Module


bcrypt
https://github.com/TaojingCoin-pd/Taojingcoin/blob/master/src/main.cpp#L35
https://github.com/TaojingCoin-pd/Taojingcoin/blob/master/src/bcrypt.cpp
https://github.com/TaojingCoin-pd/Taojingcoin/blob/master/src/bcrypt.h


scrypt-n
https://github.com/vertcoin/vertcoin/blob/master-0.8/src/main.cpp#L35
https://github.com/scr34m/vertcoin_scrypt
https://github.com/ahmedbodi/stratum-mining/tree/NScrypt


max
https://github.com/Prydie/maxcoin-hash-python
https://github.com/ahmedbodi/stratum-mining-maxcoin


fugue
https://github.com/fuguecoin/fuguecoin/blob/master/src/main.cpp#L40
https://github.com/fuguecoin/fuguecoin


SHAvite-3
https://github.com/inkcoin/inkcoin-project/blob/master/src/main.cpp#L38
https://github.com/inkcoin/inkcoin-project/blob/f729f1070eb6222832f34fbf087b1aea16522962/src/hashblock.h
https://github.com/inkcoin/inkcoin-project
http://www.cs.technion.ac.il/~orrd/SHAvite-3/
https://bitcointalk.org/index.php?topic=481516.0
