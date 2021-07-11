Stratum mining server for Ergo.

This project is based on [Node stratum server](https://github.com/zone117x/node-stratum-pool) 
with necessary modifications to support Ergo.


# Requirements
* Node v10+ (tested with v12+) 
* Ergo node
  - fully synced
  - wallet initialized and unlocked
  - mining = true in node's config


# Simple Usage

- Clone project

  ```bash
  git clone https://github.com/mhssamadani/ErgoStratumServer.git
  npm update
  ```
- Update start.js file and set node address
  - change node url and port
  - user and password fields are not used

  ```
    "daemons": [
          {   //Main daemon instance
              "host": "88.198.13.202",// node's url
              "port": 9053, // node's port
              "user": "litecoinrpc", // anything, not used
              "password": "testnet" // anything, not used
          }
          ...
  ```
- Run start.js

  ```js
  node start.js
  ```


# Mapping
Note that Ergo node generates the candidate block and this process cannot be outsourced to miners.

Here is the mapping between Stratum parameters and thier usage in the ergo implementation; This is a sparse list passed to miner/proxy however network overhead is negligible.
<center>

| Stratum Parameter        | Used Parameter in ergo implementation | Size                       | Encoding                                   |
|:------------------------:|:-------------------------------------:|:--------------------------:|:---------------------------------------------------:|
| Job ID                   | Job ID                                | Variable size (1-10 Characters) | passed as integer with no encoding                  |
| prevHashReversed         | height                                | Variable size (1-10 Characters) | passed as integer with no encoding                  |
| generationTransaction[0] | msg                                   | 64 Characters               | 32 Byte encoded as hex                              |
| generationTransaction[1] | ''                                    |                            |                    empty                                 |
| merkleBranch             | ''                                    |                            |                empty                                     |
| version                  | version                               | 8 Characters                | 4 Byte big endian encoded version passed as hex     |
| nbits                    | b                                     | Variable Size (1-78 Characters) | Big integer stored in a string without any encoding |
| curtime                  | ''                                    |                            |              empty                                       |
| clean job                | clean jobs                            | 5 character                | boolean with 'true' or 'false' value                |

</center>
<p>&nbsp;</p>

Here is the Autolykos v2 variable sizes: 
 <center>
 
| parameter | size |
|:-----:|:-----:|
| nonce | 8 Bytes |
| height | 4 Bytes |
| M | 8192 Bytes |
| j in J | 4 Bytes |
| i | 4 Bytes |
| f | 31 Bytes |
| N | 2^26 init size, will change in future blocks |
| k | 32 |

</center>


# Methods

All methods are same as Stratum v1 methods; just for clarification see the details of these two methods:

- Subscribe: with this method we set two parameters called extraNonce1 and extraNonce2Size. Miner must find a nonce (8 Bytes) for current block which starts with extraNonce1 and extended with extraNonce2Size bytes

  - for example if extraNonce1 is `FADD9871` and extraNonce2Size is `4`, miner must find a nonce in range `[FADD987100000000 - FADD9871FFFFFFFF]`

- Set difficulty: in order to update difficulty `mining.set_difficulty` method is used in stratum. If zero, `b` is used as is; otherwise, for any number greater that zero, proxy multiplies this value to `b` and passes it to miner.



# Configurations (for pool operators)

For details see the comments in the start.js file. Don't mess with these parameters if you are not a pool operator and only using this server for your node.


not used:
- "coin"
- "address"
- "rewardRecipients"
- "p2p"

used:
 - "blockRefreshInterval"
 - "jobRebroadcastTimeout"
 - "connectionTimeout"
 - "emitInvalidBlockHashes"
 - "tcpProxyProtocol"
 - "banning"
 - "ports"
 - "daemons"


# Reference
1. [Stratum V1 Docs](https://braiins.com/stratum-v1/docs)
2. [Ergo Node Setup](https://github.com/ergoplatform/ergo/wiki/Set-up-a-full-node)
3. [Ergo Stratum Proxy ](https://github.com/mhssamadani/ErgoStratumProxy)
