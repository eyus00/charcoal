import CryptoJS from 'crypto-js';
import { iv, key } from './common';
export function encrypt(str) {
    return CryptoJS.TripleDES.encrypt(str, CryptoJS.enc.Utf8.parse(key), {
        iv: CryptoJS.enc.Utf8.parse(iv),
    }).toString();
}
export function getVerify(str, str2, str3) {
    if (str) {
        return CryptoJS.MD5(CryptoJS.MD5(str2).toString() + str3 + str).toString();
    }
    return null;
}
