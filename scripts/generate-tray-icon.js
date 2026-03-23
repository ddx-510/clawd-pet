// Generate a 22x22 crab tray icon PNG
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return crc ^ -1;
}

function createPNG() {
  const W = 22, H = 22;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(W, 0);
  ihdrData.writeUInt32BE(H, 4);
  ihdrData[8] = 8; ihdrData[9] = 6; // 8bit RGBA
  const ihdrType = Buffer.from('IHDR');
  const ihdrCrc = crc32(Buffer.concat([ihdrType, ihdrData]));
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdrType.copy(ihdr, 4);
  ihdrData.copy(ihdr, 8);
  ihdr.writeInt32BE(ihdrCrc, 21);

  // Pixel art crab (22x22)
  // 0=transparent, 1=orange body, 2=dark brown (eyes/outline)
  const grid = [
    '0000000000000000000000',
    '0000110000000011000000',
    '0001100000000001100000',
    '0011000000000000110000',
    '0010000000000000010000',
    '0011000000000000110000',
    '0001100000000001100000',
    '0000111111111111000000',
    '0001111111111111100000',
    '0001111111111111100000',
    '0001111211111211100000',
    '0001111111111111100000',
    '0001111111111111100000',
    '0000111111111111000000',
    '0000011111111110000000',
    '0000001111111100000000',
    '0000010001000100000000',
    '0000100000001000000000',
    '0000100000001000000000',
    '0000000000000000000000',
    '0000000000000000000000',
    '0000000000000000000000',
  ];

  const colors = {
    '0': [0, 0, 0, 0],
    '1': [0xD4, 0x84, 0x5A, 0xFF],
    '2': [0x2D, 0x1B, 0x14, 0xFF],
  };

  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter none
    for (let x = 0; x < W; x++) {
      const c = colors[grid[y][x]] || colors['0'];
      const px = y * (1 + W * 4) + 1 + x * 4;
      raw[px] = c[0]; raw[px+1] = c[1]; raw[px+2] = c[2]; raw[px+3] = c[3];
    }
  }

  const compressed = zlib.deflateSync(raw);
  const idatType = Buffer.from('IDAT');
  const idatCrc = crc32(Buffer.concat([idatType, compressed]));
  const idat = Buffer.alloc(12 + compressed.length);
  idat.writeUInt32BE(compressed.length, 0);
  idatType.copy(idat, 4);
  compressed.copy(idat, 8);
  idat.writeInt32BE(idatCrc, 8 + compressed.length);

  const iendType = Buffer.from('IEND');
  const iendCrc = crc32(iendType);
  const iend = Buffer.alloc(12);
  iend.writeUInt32BE(0, 0);
  iendType.copy(iend, 4);
  iend.writeInt32BE(iendCrc, 8);

  return Buffer.concat([sig, ihdr, idat, iend]);
}

const png = createPNG();
fs.writeFileSync(path.join(__dirname, '..', 'src', 'tray-icon.png'), png);
console.log('Crab tray icon generated!');
