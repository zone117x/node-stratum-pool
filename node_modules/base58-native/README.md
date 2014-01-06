base58
======

An implementation of Base58 and Base58Check encodings for nodejs.  Note, the
implementation of Base58Check differs slightly from that described on Wikipedia
in that it does not prepend a version byte onto the data being encoded.  This
implementation uses the bignum library (which is a native module and uses the
openssl bignumber library functions).

NOTE: earlier versions of this package used native C code instead of bignum, but
it was found to be unstable in a production environment (likely due to bugs in the
C code).  This version uses bignum and appears to be very stable, but slower.  The
C version of this package is still available on the "native-module" branch.  A few
additional methods added to bignum would probably bring the speed of this version 
on part with with C version.  

Installation
============

    npm install base58-native

Usage
=====

    var base58 = require('base58-native');
    base58.encode(base58.decode('mqqa8xSMVDyf9QxihGnPtap6Mh6qemUkcu'));

    var base58Check = require('base58-native').base58Check;
    base58Check.encode(base58Check.decode('mqqa8xSMVDyf9QxihGnPtap6Mh6qemUkcu'));
