{
    'targets' : [
        {
            'target_name': 'scrypt_lib',
            'type': 'static_library',
            'include_dirs' : [
                'scrypt/scrypt-1.1.6',
                'scrypt/scrypt-1.1.6/lib/util',
                'scrypt/scrypt-1.1.6/lib/crypto',
                'scrypt/scrypt-1.1.6/lib/scryptenc',
            ],
            'sources': [
                'scrypt/scrypt-1.1.6/lib/scryptenc/scryptenc.c',
                'scrypt/scrypt-1.1.6/lib/util/memlimit.c',
                'scrypt/scrypt-1.1.6/lib/scryptenc/scryptenc_cpuperf.c',
                'scrypt/scrypt-1.1.6/lib/crypto/sha256.c',
                'scrypt/scrypt-1.1.6/lib/crypto/crypto_aesctr.c',
                'scrypt/scrypt-1.1.6/lib/crypto/crypto_scrypt-ref.c'
            ],
            'defines': [ #This config file is custom generated for each POSIX OS
                'CONFIG_H_FILE="../config.h"',
            ],
            'conditions': [
                [
                    'OS != "win"', { #Build config file for posix OS (i.e. not windows)
                        'variables' : { #Configuration file is also built with this command
                            'libs' : '<!(scrypt/configuration/posixconfig)',
                        },
                        'include_dirs': [
                            '<(node_root_dir)/deps/openssl/openssl/include',
                        ],
                        'libraries' : [
                            '<@(libs)', #-lrt will be included here if it exists in the target OS
                        ],
                    },
                ],
            ],
        },
        {
            'target_name': 'scrypt_passwordhash',
            'type': 'static_library',
            'defines': [
                'HAVE_CONFIG_H'                
            ],
            'sources': [
                'src/passwordhash/scrypthash.c'
            ],
            'include_dirs' : [
                'scrypt/scrypt-1.1.6/lib/util',
                'scrypt/scrypt-1.1.6/lib/crypto',
                'scrypt/scrypt-1.1.6/lib/scryptenc',
                'scrypt/scrypt-1.1.6'
            ],
        },
        {
            'target_name': 'scrypt_node_boilerplate',
            'type': 'static_library',
            'defines': [
                'HAVE_CONFIG_H'                
            ],
            'sources': [
                'src/node-boilerplate/scrypt_node_async.cc',
                'src/node-boilerplate/scrypt_node_sync.cc',
                'src/node-boilerplate/scrypt_common.cc',
                'src/util/base64.cc',
            ],
            'include_dirs' : [
                'src/util',
                'src/passwordhash',
            ],
        },
        {
            'target_name': 'scrypt',
            'sources': [
                'scrypt_node.cc',
            ],
            'dependencies': ['scrypt_lib','scrypt_passwordhash','scrypt_node_boilerplate'],
        },
    ],
}
