//forward declarations

int calcBase64EncodedLength(int len);
int calcBase64DecodedLength(const char* b64input);

void base64_encode(const unsigned char *input, int length, char* b64str);
void base64_decode(const char *input, int length, unsigned char *output);
