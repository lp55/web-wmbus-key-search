/**
  * @brief  Extract a 32 bit unsigned integer encoded into a stream of data in 
  *         little-endian format.
  * @param  Uint8Array data Location of where to extract the int from.
  * @param  number offset Offset from the start of the location.
  * @retval number
  */
export function readUInt32LE(data, offset) {
    let result = (data[offset + 3] << 24) >>> 0;
    result |= (data[offset + 2] << 16) >>> 0;
    result |= (data[offset + 1] << 8) >>> 0;
    result |= data[offset];
    return result;
}

/**
  * @brief  Extract a 32 bit unsigned integer encoded into a stream of data in 
  *         big-endian format.
  * @param  Uint8Array data Location of where to extract the int from.
  * @param  number offset Offset from the start of the location.
  * @retval number
  */
function readUInt32BE(data, offset) {
    let result = (data[offset] << 24) >>> 0;
    result |= (data[offset + 1] << 16) >>> 0;
    result |= (data[offset + 2] << 8) >>> 0;
    result |= data[offset + 3];
    return result;
}

/**
  * @brief  Prepare the base value used to decode a Prios packet from the key 
  *         in a stream of bytes.
  * @param  Uint8Array bytes Location of where to extract the key from.
  * @retval number
  */
export function preparePRIOSKey(bytes) {
    const key1 = readUInt32BE(bytes, 0);
    const key2 = readUInt32BE(bytes, 4);
    const key = key1 ^ key2;
    return key;
}

/**
  * Decode a Prios payload with a key.
  * Original author: Jacek Tomasiak
  * Reference:
  * - "Suggestion: Add support for Water Sappel/IZAR RC 868 #20": https://github.com/weetmuts/wmbusmeters/issues/20
  * - https://github.com/skazi0/wmbusmeters/blob/7e6d075d940c4d668f75de461d26e9d7258df719/src/meter_izar.cc#L166
  * 
  * @brief  Decode a Prios payload with a key.
  * @param  Uint8Array in The location of the WMBus frame
  * @param  number payload_len The length of the payload to decode
  * @param  number key The key to use to decode
  * @param  Uint8Array out Buffer to store the decoded data
  * @retval number
  */
export function decodePRIOSPayload(inData, payload_len, key, out) {
    // modify seed key with header values
    key ^= readUInt32BE(inData, 2); // manufacturer + address[0-1]
    key ^= readUInt32BE(inData, 6); // address[2-3] + version + type
    key ^= readUInt32BE(inData, 12); // ci + some more bytes from the telegram...

    for (let i = 0; i < payload_len; ++i) {
        // calculate new key (LFSR)
        for (let j = 0; j < 8; ++j) {
            // calculate new bit value (xor of selected bits from previous key)
            const bit = ((key & 0x2) !== 0) ^ ((key & 0x4) !== 0) ^ ((key & 0x800) !== 0) ^ ((key & 0x80000000) !== 0);
            // shift key bits and add new one at the end
            key = (key << 1) | bit;
        }
        // decode i-th content byte with fresh/last 8-bits of key
        out[i] = inData[i + 17] ^ (key & 0xFF);
        // check-byte doesn't match?
        if (out[0] !== 0x4B) {
            return 0;
        }
    }

    return 1;
}

