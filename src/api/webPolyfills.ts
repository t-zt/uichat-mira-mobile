// React Native polyfills for Web APIs used by Relay transport

// TextEncoder polyfill
export class TextEncoder {
  encode(text: string): Uint8Array {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i) & 0xff;
    }
    return bytes;
  }
}

// TextDecoder polyfill
export class TextDecoder {
  decode(bytes: Uint8Array): string {
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      result += String.fromCharCode(bytes[i]);
    }
    return result;
  }
}

// btoa polyfill
export function btoa(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const strLen = str.length;
  
  for (let i = 0; i < strLen; i += 3) {
    const b1 = str.charCodeAt(i);
    const b2 = i + 1 < strLen ? str.charCodeAt(i + 1) : 0;
    const b3 = i + 2 < strLen ? str.charCodeAt(i + 2) : 0;
    
    result += chars[b1 >> 2];
    result += chars[((b1 & 0x03) << 4) | (b2 >> 4)];
    result += i + 1 < strLen ? chars[((b2 & 0x0f) << 2) | (b3 >> 6)] : '=';
    result += i + 2 < strLen ? chars[b3 & 0x3f] : '=';
  }
  
  return result;
}

// atob polyfill
export function atob(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Array(128).fill(-1);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  
  const strLen = str.length;
  let result = '';
  
  for (let i = 0; i < strLen; i += 4) {
    const c1 = lookup[str.charCodeAt(i)];
    const c2 = lookup[str.charCodeAt(i + 1)];
    const c3 = i + 2 < strLen && str.charAt(i + 2) !== '=' ? lookup[str.charCodeAt(i + 2)] : 0;
    const c4 = i + 3 < strLen && str.charAt(i + 3) !== '=' ? lookup[str.charCodeAt(i + 3)] : 0;
    
    result += String.fromCharCode((c1 << 2) | (c2 >> 4));
    if (i + 2 < strLen && str.charAt(i + 2) !== '=') {
      result += String.fromCharCode(((c2 & 0x0f) << 4) | (c3 >> 2));
    }
    if (i + 3 < strLen && str.charAt(i + 3) !== '=') {
      result += String.fromCharCode(((c3 & 0x03) << 6) | c4);
    }
  }
  
  return result;
}

// MessageEvent type
export interface MessageEvent {
  data: string;
}
