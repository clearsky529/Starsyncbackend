import { Injectable } from '@nestjs/common';
import { TripleDES } from 'crypto-js';
import { ord, strpos } from 'locutus/php/strings';
import * as crypto from 'crypto';

@Injectable()
export class PasswordHash {
  private itoa64 =
    './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  constructor() {}

  encode64(input: string, count: number) {
    let output = '';
    let i = 0;
    let value;
    let v;

    do {
      value = ord(input.charAt(i++));
      v = value & 0x3f;
      output = `${output}${this.itoa64.charAt(v)}`;
      if (i < count) {
        value |= ord(input.charAt(i)) << 8;
      }
      v = (value >> 6) & 0x3f;
      output = `${output}${this.itoa64.charAt(v)}`;
      if (i++ >= count) {
        break;
      }
      if (i < count) {
        value |= ord(input.charAt(i)) << 16;
      }
      v = (value >> 12) & 0x3f;
      output = `${output}${this.itoa64.charAt(v)}`;
      if (i++ >= count) {
        break;
      }
      v = (value >> 18) & 0x3f;
      output = `${output}${this.itoa64.charAt(v)}`;
    } while (i < count);

    return output;
  }

  getRandomBytes() {
    let text = '';
    const possible =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < 6; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  genSalt() {
    const randomBytes = this.getRandomBytes();
    let output = '$P$';
    output += this.itoa64[Math.min(8 + 5, 30)];
    output += this.encode64(randomBytes, 6);
    return output;
  }

  hashPassword(password: string) {
    const salt = this.genSalt();
    const hash = this.cryptPrivate(password, salt);
    return hash;
  }

  cryptPrivate(password: string, setting: string) {
    let output = '*0';

    if (setting.substr(0, 2) == output) {
      output = '*1';
    }

    const id = setting.substr(0, 3);
    // We use "$P$", phpBB3 uses "$H$" for the same thing
    if (id != '$P$' && id != '$H$') {
      return output;
    }

    const count_log2 = strpos(this.itoa64, setting.charAt(3));
    if (count_log2 < 7 || count_log2 > 30) {
      return output;
    }

    let count = 1 << count_log2;

    const salt = setting.substr(4, 8);
    if (salt.length != 8) {
      return output;
    }

    let hash = crypto
      .createHash('md5')
      .update(`${salt}${password}`, 'binary')
      .digest('binary');
    do {
      hash = crypto
        .createHash('md5')
        .update(`${hash}${password}`, 'binary')
        .digest('binary');
    } while (--count);
    output = setting.substr(0, 12);
    output = `${output}${this.encode64(hash, 16)}`;

    return output;
  }

  checkPassword(password: string, stored_hash: string) {
    if (password.length > 4096) {
      return false;
    }

    let hash = this.cryptPrivate(password, stored_hash);
    if (hash.charAt(0) == '*') {
      hash = TripleDES.encrypt(password, stored_hash).toString();
    }

    return hash === stored_hash;
  }
}
