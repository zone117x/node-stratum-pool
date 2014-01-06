# binpack

_Minimalist numeric binary packing utilities for node.js_

## What's all this?

This is an intentionally simple binary packing/unpacking package for node.js for programmers who prefer to write most of their parsing code in javascript.  This exposes some common binary formats for numbers.

see the included COPYING file for licensing.

the core of the module is the set of `pack`/`unpack` pair functions.  The meaning should be clear from the name - for example, `packInt32` packs a given javascript number into a 32-bit int inside a 4-byte node.js Buffer, while `unpackFloat32` unpacks a 4-byte node.js Buffer containing a native floating point number into a javascript number.

The following types are available for both pack and unpack:

    Float32 
    Float64 
    Int8
    Int16 
    Int32
    Int64
    UInt8 
    UInt16
    UInt32
    UInt64
    
Each `pack*` function takes a javascript number and outputs a node.js Buffer.

Each `unpack*` function takes a node.js Buffer and outputs a javascript number.

Both types of functions take an optional second argument.  If this argument is `"big"`, the output is put in big endian format.  If the argument is `"little"`, the output is put in little endian format.  If the argument is anything else or non-existent, we default to your machine's native encoding.

## How is this different than the `binary` module on npm?

It contains floating point values, and it has packing functions