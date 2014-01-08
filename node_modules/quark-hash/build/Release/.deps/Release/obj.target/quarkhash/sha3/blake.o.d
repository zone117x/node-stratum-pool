cmd_Release/obj.target/quarkhash/sha3/blake.o := cc '-D_LARGEFILE_SOURCE' '-D_FILE_OFFSET_BITS=64' '-DBUILDING_NODE_EXTENSION' -I/home/matt/.node-gyp/0.10.24/src -I/home/matt/.node-gyp/0.10.24/deps/uv/include -I/home/matt/.node-gyp/0.10.24/deps/v8/include  -fPIC -Wall -Wextra -Wno-unused-parameter -pthread -m64 -O2 -fno-strict-aliasing -fno-tree-vrp -fno-omit-frame-pointer  -MMD -MF ./Release/.deps/Release/obj.target/quarkhash/sha3/blake.o.d.raw  -c -o Release/obj.target/quarkhash/sha3/blake.o ../sha3/blake.c
Release/obj.target/quarkhash/sha3/blake.o: ../sha3/blake.c \
 ../sha3/sph_blake.h ../sha3/sph_types.h
../sha3/blake.c:
../sha3/sph_blake.h:
../sha3/sph_types.h:
