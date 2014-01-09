import binascii
import struct
from hashlib import sha256
import ltc_scrypt

def ser_number(n):
    # For encoding nHeight into coinbase
    s = bytearray(b'\1')
    while n > 127:
        s[0] += 1
        s.append(n % 256)
        n //= 256
    s.append(n)
    return bytes(s)



def ser_string(s):
    if len(s) < 253:
        return chr(len(s)) + s
    elif len(s) < 0x10000:
        print "here"
        return chr(253) + struct.pack("<H", len(s)) + s
    elif len(s) < 0x100000000L:
        return chr(254) + struct.pack("<I", len(s)) + s
    else:
        return chr(255) + struct.pack("<Q", len(s)) + s



def doublesha(b):
    return sha256(sha256(b).digest()).digest()

__b58chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
__b58base = len(__b58chars)

def b58decode(v, length):
    """ decode v into a string of len bytes
    """
    long_value = 0L
    for (i, c) in enumerate(v[::-1]):
        long_value += __b58chars.find(c) * (__b58base**i)

    result = ''
    while long_value >= 256:
        div, mod = divmod(long_value, 256)
        result = chr(mod) + result
        long_value = div
    result = chr(long_value) + result

    nPad = 0
    for c in v:
        if c == __b58chars[0]: nPad += 1
        else: break

    result = chr(0)*nPad + result
    if length is not None and len(result) != length:
        return None
    
    return result

def address_to_pubkeyhash(addr):
    #try:
    addr = b58decode(addr, 25)
    #except:
    #    return None
    
    if addr is None:
        return None
    
    ver = addr[0]
    cksumA = addr[-4:]
    cksumB = doublesha(addr[:-4])[:4]
    
    if cksumA != cksumB:
        return None
    
    return (ver, addr[1:-4])

def script_to_address(addr):
    d = address_to_pubkeyhash(addr)
    if not d:
        raise ValueError('invalid address')
    (ver, pubkeyhash) = d
    print "a - " + binascii.hexlify(pubkeyhash)
    return b'\x76\xa9\x14' + pubkeyhash + b'\x88\xac'


def ser_uint256(u):
    rs = ""
    for i in xrange(8):
        rs += struct.pack("<I", u & 0xFFFFFFFFL)
        u >>= 32
    return rs

def uint256_from_str(s):
    r = 0L
    t = struct.unpack("<IIIIIIII", s[:32])
    for i in xrange(8):
        r += t[i] << (i * 32)
    return r

def ser_uint256_be(u):
    '''ser_uint256 to big endian'''
    rs = ""
    for i in xrange(8):
        rs += struct.pack(">I", u & 0xFFFFFFFFL)
        u >>= 32
    return rs

def reverse_hash(h):
    # This only revert byte order, nothing more
    if len(h) != 64:
        raise Exception('hash must have 64 hexa chars')
    
    return ''.join([ h[56-i:64-i] for i in range(0, 64, 8) ])

def serialize_header(merkle_root_int, ntime_bin, nonce_bin, nVersion, nBits, prevhash_bin):
    '''Serialize header for calculating block hash'''
    r  = struct.pack(">i", nVersion)
    r += prevhash_bin
    r += ser_uint256_be(merkle_root_int)
    r += ntime_bin
    r += struct.pack(">I", nBits)
    r += nonce_bin    
    return r


def diff_to_target(difficulty):
    diff1 = 0x0000ffff00000000000000000000000000000000000000000000000000000000
    return diff1 / difficulty



nonce = "cf280000"
nonce_bin = binascii.unhexlify(nonce)

bits = "1c013403"
nBits = int(bits, 16)

ntime = "52ce31b9"
ntime_bin = binascii.unhexlify(ntime)

merkleroot = "38f3e68be0b74813af175b8da506dfa3c3017ff06fed7ae85e3efee655c9f7fd"

merkle_root_bin = binascii.unhexlify(merkleroot)
merkle_root_int = uint256_from_str(merkle_root_bin)


pbh = "fefbf5b855440b6ac8f742e03558a910969a8232cc0436c59c306e1d493ca917"
prevhash_bin = binascii.unhexlify(reverse_hash(pbh))

version = 1



header_bin = serialize_header(merkle_root_int, ntime_bin, nonce_bin, version, nBits, prevhash_bin)
hash_bin = ''.join([ header_bin[i*4:i*4+4][::-1] for i in range(0, 20) ])
hash_bin = ltc_scrypt.getPoWHash(hash_bin)
hash_int = uint256_from_str(hash_bin)

target_user = diff_to_target(16)

print hash_int
print target_user

if hash_int > target_user:
    print 'bad'
else:
    print 'good'



for x in range(0, 10):
    source = binascii.unhexlify("38f3e68be0b74813af175b8da506dfa3c3017ff06fed7ae85e3efee655c9f7fd");
    print binascii.hexlify(source)
    print "hash " + str(x) + " " + binascii.hexlify(ltc_scrypt.getPoWHash(source))