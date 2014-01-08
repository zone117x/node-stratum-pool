#ifndef HASHBLOCK_H
#define HASHBLOCK_H

#include "sph_blake.h"
#include "sph_bmw.h"
#include "sph_groestl.h"
#include "sph_jh.h"
#include "sph_keccak.h"
#include "sph_skein.h"



void Hash9(void *state, const void *init)
{
    sph_blake512_context     ctx_blake;
    sph_bmw512_context       ctx_bmw;
    sph_groestl512_context   ctx_groestl;
    sph_jh512_context        ctx_jh;
    sph_keccak512_context    ctx_keccak;
    sph_skein512_context     ctx_skein;
    static unsigned char pblank[1];

	
    uint32_t mask = 8;
    uint32_t zero = 0;

	//these uint512 in the c++ source of the client are backed by an array of uint32
    uint32_t hashA[16], hashB[16];	
	
/*	
	int ii=0;
	printf("Start: ");
	for (ii=0; ii < 80; ii++)
	{
		printf ("%.2x",((uint8_t*)init)[ii]);
	};
	printf ("\n");
*/	
	
    sph_blake512_init(&ctx_blake);
    sph_blake512 (&ctx_blake, init, 80);
    sph_blake512_close (&ctx_blake, hashA);	 //0
	
/*	
	printf("bla512: ");
	for (ii=0; ii < 64; ii++)
	{
		printf ("%.2x",((uint8_t*)hashA)[ii]);
	};
	printf ("\n");
*/	
	
    sph_bmw512_init(&ctx_bmw);
    sph_bmw512 (&ctx_bmw, hashA, 64);    //0
    sph_bmw512_close(&ctx_bmw, hashB);   //1

/*
	printf("bmw512: ");
	for (ii=0; ii < 64; ii++)
	{
		printf ("%.2x",((uint8_t*)hashB)[ii]);
	};
	printf ("\n");	
*/
	
    if ((hashB[0] & mask) != zero)   //1
    {
        sph_groestl512_init(&ctx_groestl);
        sph_groestl512 (&ctx_groestl, hashB, 64); //1
        sph_groestl512_close(&ctx_groestl, hashA); //2
    }
    else
    {
        sph_skein512_init(&ctx_skein);
        sph_skein512 (&ctx_skein, hashB, 64); //1
        sph_skein512_close(&ctx_skein, hashA); //2
    }

/*	
	printf("1stcon: ");
	for (ii=0; ii < 64; ii++)
	{
		printf ("%.2x",((uint8_t*)hashA)[ii]);
	};
	printf ("\n");
*/	
	
    sph_groestl512_init(&ctx_groestl);
    sph_groestl512 (&ctx_groestl, hashA, 64); //2
    sph_groestl512_close(&ctx_groestl, hashB); //3

    sph_jh512_init(&ctx_jh);
    sph_jh512 (&ctx_jh, hashB, 64); //3
    sph_jh512_close(&ctx_jh, hashA); //4

    if ((hashA[0] & mask) != zero) //4
    {
        sph_blake512_init(&ctx_blake);
        sph_blake512 (&ctx_blake, hashA, 64); //
        sph_blake512_close(&ctx_blake, hashB); //5
    }
    else
    {
        sph_bmw512_init(&ctx_bmw);
        sph_bmw512 (&ctx_bmw, hashA, 64); //4
        sph_bmw512_close(&ctx_bmw, hashB);   //5
    }
    
    sph_keccak512_init(&ctx_keccak);
    sph_keccak512 (&ctx_keccak,hashB, 64); //5
    sph_keccak512_close(&ctx_keccak, hashA); //6

    sph_skein512_init(&ctx_skein);
    sph_skein512 (&ctx_skein, hashA, 64); //6
    sph_skein512_close(&ctx_skein, hashB); //7

    if ((hashB[0] & mask) != zero) //7
    {
        sph_keccak512_init(&ctx_keccak);
        sph_keccak512 (&ctx_keccak, hashB, 64); //
        sph_keccak512_close(&ctx_keccak, hashA); //8
    }
    else
    {
        sph_jh512_init(&ctx_jh);
        sph_jh512 (&ctx_jh, hashB, 64); //7
        sph_jh512_close(&ctx_jh, hashA); //8
    }

/*	
	printf("result: ");
	for (ii=0; ii < 64; ii++)
	{
		printf ("%.2x",((uint8_t*)hashA)[ii]);
	};
	printf ("\n");	
*/
    //return hash[8].trim256(); //8
	memcpy(state, hashA, 32);
	
/*	
	printf("result: ");
	for (ii=0; ii < 32; ii++)
	{
		printf ("%.2x",((uint8_t*)state)[ii]);
	};
	printf ("\n");	
*/	
}



void Hash6(void *state, const void *init)

{
    sph_blake512_context     ctx_blake;
    sph_bmw512_context       ctx_bmw;
    sph_groestl512_context   ctx_groestl;
    sph_jh512_context        ctx_jh;
    sph_keccak512_context    ctx_keccak;
    sph_skein512_context     ctx_skein;
    //static unsigned char pblank[1];

    char hashA[64], hashB[64];

    sph_blake512_init(&ctx_blake);
    sph_blake512 (&ctx_blake, init, 80);
//    sph_blake512_close(&ctx_blake, (void*)(&hashA));
    sph_blake512_close (&ctx_blake, hashA);

    sph_bmw512_init(&ctx_bmw);
    sph_bmw512 (&ctx_bmw, (const void*)(hashA), 64);
    sph_bmw512_close(&ctx_bmw, (void*)(hashB));

    sph_groestl512_init(&ctx_groestl);
    sph_groestl512 (&ctx_groestl, (const void*)(hashB), 64);
    sph_groestl512_close(&ctx_groestl, (void*)(hashA));

    sph_jh512_init(&ctx_jh);
    sph_jh512 (&ctx_jh, (const void*)(hashA), 64);
    sph_jh512_close(&ctx_jh, (void*)(hashB));

    sph_keccak512_init(&ctx_keccak);
    sph_keccak512 (&ctx_keccak, (const void*)(hashB), 64);
    sph_keccak512_close(&ctx_keccak, (void*)(hashA));

    sph_skein512_init(&ctx_skein);
    sph_skein512 (&ctx_skein, (const void*)(hashA), 64);
    sph_skein512_close(&ctx_skein, (void*)(hashB));

    memcpy(state, hashB, 32);
};


#endif // HASHBLOCK_H
