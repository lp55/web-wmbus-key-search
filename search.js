/***
 * Based on https://github.com/ZeWaren/izar-prios-smart-meter-collector/
 */
import { preparePRIOSKey, decodePRIOSPayload, readUInt32LE } from './prior.js';

function tryKey(keyBytes, frame, out) {
    const preparedKey = preparePRIOSKey(keyBytes);
    return decodePRIOSPayload(frame, 11, preparedKey, out);
}

function checkDecodedPayload(decodedFrame, totalConsumption, lastMonthTotalConsumption, year, month, day, consumptionMin, consumptionMax, valid_year, valid_month, valid_day) {
    totalConsumption[0] = readUInt32LE(decodedFrame, 1);
    lastMonthTotalConsumption[0] = readUInt32LE(decodedFrame, 5);
    if (lastMonthTotalConsumption[0] > totalConsumption[0]) {
        return 0;
    }

    // Check consumption ranges
    if (totalConsumption[0] < consumptionMin) {
        return 0;
    }
    if (lastMonthTotalConsumption[0] < consumptionMin) {
        return 0;
    }

    if (totalConsumption[0] > consumptionMax) {
        return 0;
    }
    if (lastMonthTotalConsumption[0] > consumptionMax) {
        return 0;
    }

    // Check date
    year[0] = ((decodedFrame[10] & 0xF0) >> 1) + ((decodedFrame[9] & 0xE0) >> 5);
    month[0] = decodedFrame[10] & 0xF;
    day[0] = decodedFrame[9] & 0x1F;
    if (year[0] > 99 || month[0] > 12 || day[0] > 31) {
        return 0;
    }

    if (valid_year !== undefined && year[0] !== valid_year) {
        return 0;
    }
    //if (valid_month !== undefined && month[0] !== valid_month) {
    //    return 0;
    //}
    //if (valid_day !== undefined && day[0] !== valid_day) {
    //    return 0;
    //}

    return 1;
}

function cracker(frames, startKey, endKey, consumptionMin, consumptionMax, valid_year, valid_month, valid_day) {
    const totalConsumption = [0];
    const lastMonthTotalConsumption = [0];
    const year = [0];
    const month = [0];
    const day = [0];
    let foundKeys = 0;
    const decodedFrame = new Uint8Array(11);
    let prevTime = 0;
    const stepSize = 100000;
    let uInt8Array = new Uint8Array();
    let bigInt64Array = new BigInt64Array();

    if (consumptionMin === undefined) { consumptionMin = 1; }
    if (consumptionMax === undefined) { consumptionMax = 1000000; }

    // Loop over all the possible keys
    let high = 0xF8836DE6
    let key = new Uint8Array(8);
    for (let low = startKey; low < endKey; ++low) {
        const step = (low - startKey) % stepSize;

        if (step == 0) {
            postMessage(stepSize);
        }

        // Test all frames in sequence until one fails
        let success = 1;
        for (let j = 0; j < frames.length; ++j) {
            //convert key to Uint8Array
            key[0] = low & 0xFF;
            key[1] = (low >>> 8) & 0xFF;
            key[2] = (low >>> 16) & 0xFF;
            key[3] = low >>> 24;
            key[4] = high & 0xFF;
            key[5] = (high >>> 8) & 0xFF;
            key[6] = (high >>> 16) & 0xFF;
            key[7] = high >>> 24;

            // Check if the payload can be decoded
            if (!tryKey(key, frames[j], decodedFrame)) {
                success = 0;
                break;
            }

            // Check the decoded payload for consistency
            if (!checkDecodedPayload(decodedFrame, totalConsumption, lastMonthTotalConsumption, year, month, day, consumptionMin, consumptionMax, valid_year, valid_month, valid_day)) {
                success = 0;
                break;
            }
        }

        if (success) {
            let keyStr = Array.from(key).map((i) => i.toString(16).padStart(2, '0')).join("").toUpperCase();
            //let msg = `Candidate key: ${keyStr}: First frame: current: ${totalConsumption[0]}, H0: ${lastMonthTotalConsumption[0]} H0 date: ${year[0]}-${month[0]}-${day[0]}`;
            //postMessage(msg);
            postMessage({
                "key": keyStr,
                "totalConsumption": totalConsumption[0],
                "lastMonthTotalConsumption": lastMonthTotalConsumption[0],
                "date": `${year[0].toString().padStart(2, '0')}-${month[0].toString().padStart(2, '0')}-${day[0].toString().padStart(2, '0')}`
            });
            foundKeys++;
        }
    }

    //leftover progress
    postMessage((endKey - startKey) % stepSize);

    return foundKeys > 0;
}

function convertFrames(frames, meter) {
    let framesHex = [];
    for (let i = 0; i < frames.length; ++i) {
        let frame = []
        for (let d = 0; d < frames[i].length; d += 2) {
            //console.log(`0x${frames[i][d]}${frames[i][d + 1]}`);
            //console.log(parseInt(`0x${frames[i][d]}${frames[i][d + 1]}`));
            //console.log(parseInt(`0x${frames[i][d]}${frames[i][d + 1]}`).toString(16));
            frame.push(parseInt(`0x${frames[i][d]}${frames[i][d + 1]}`));
        }
        if (frame.length == 26) {
            //adds extra crc filler if needed
            frame.splice(10, 0, 0);
            frame.splice(11, 0, 0);
        }
        if (meter == "janz") {
            //swaps id and version (needed for arrow meters - https://github.com/wmbusmeters/wmbusmeters/issues/1416)
            let frameJ = frame.slice(0, 4);
            frameJ = frameJ.concat(frame.slice(6, 10));
            frameJ = frameJ.concat(frame.slice(4, 6));
            frameJ = frameJ.concat(frame.slice(10));
            frame = frameJ;
        }
        framesHex.push(frame);
    }

    return framesHex;
}

self.onmessage = function (e) {
    //const frames = [
    //    [0x19, 0x44, 0x24, 0x34, 0x62, 0x61, 0x91, 0x19, 0x82, 0x07, 0x00, 0x00, 0xA2, 0xED, 0x0E, 0x00, 0x13, 0xC5, 0xF1, 0x35, 0xF9, 0x16, 0x23, 0xB9, 0xCB, 0xC2, 0x8C, 0x6A]
    //];
    //let izar = convertFrames(["19442434820762619119A2ED0E0013C5F135F91623B9CBC28C6A"], "izar")[0];
    //let janz = convertFrames(["19442434820762619119A2ED0E0013C5F135F91623B9CBC28C6A"], "janz")[0];
    //console.log("izar: " + izar.map((i) => i.toString(16).padStart(2, '0')));
    //console.log("janz: " + janz.map((i) => i.toString(16).padStart(2, '0')));
    let data = e.data;
    //console.log(data);
    let frames = convertFrames(data["frames"], data["meter"]);
    //cracker(frames, e.data[0], e.data[1], 1, 1000000, 24);
    cracker(frames, data["startKey"], data["endKey"], data["consumptionMin"], data["consumptionMax"], data["valid_year"], data["valid_month"], data["valid_day"]);
}