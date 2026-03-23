// Generate a 256x256 Clawd app icon PNG (pixel art scaled up)
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

// 16x16 pixel art grid, each pixel will be scaled 16x to make 256x256
// 0=transparent, 1=body #C4876A, 2=dark eye #3B2318, 3=leg #7B5040, 4=bg #2D2D3D
const grid = [
  '4444444444444444',
  '4444444444444444',
  '4444411111114444',
  '4441111111111144',
  '4441111111111144',
  '4411111111111114',
  '4411111111111114',
  '4411121111211114',
  '4411111111111114',
  '4411111111111114',
  '4441111111111144',
  '4444111111114444',
  '4444311331134444',
  '4444311331134444',
  '4444344444434444',
  '4444444444444444',
];

const colors = {
  '0': [0, 0, 0, 0],
  '1': [0xC4, 0x87, 0x6A, 0xFF],
  '2': [0x3B, 0x23, 0x18, 0xFF],
  '3': [0x7B, 0x50, 0x40, 0xFF],
  '4': [0x2D, 0x2D, 0x3D, 0xFF],
};

const SCALE = 16;
const W = 16 * SCALE; // 256
const H = 16 * SCALE; // 256

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// IHDR
const ihdrData = Buffer.alloc(13);
ihdrData.writeUInt32BE(W, 0);
ihdrData.writeUInt32BE(H, 4);
ihdrData[8] = 8; ihdrData[9] = 6;
const ihdrType = Buffer.from('IHDR');
const ihdrCrc = crc32(Buffer.concat([ihdrType, ihdrData]));
const ihdr = Buffer.alloc(25);
ihdr.writeUInt32BE(13, 0);
ihdrType.copy(ihdr, 4);
ihdrData.copy(ihdr, 8);
ihdr.writeInt32BE(ihdrCrc, 21);

// Image data
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  const row = y * (1 + W * 4);
  raw[row] = 0; // filter none
  const gy = Math.floor(y / SCALE);
  for (let x = 0; x < W; x++) {
    const gx = Math.floor(x / SCALE);
    const ch = grid[gy]?.[gx] || '0';
    const c = colors[ch] || colors['0'];
    const px = row + 1 + x * 4;
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

const png = Buffer.concat([sig, ihdr, idat, iend]);
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon.png'), png);
console.log('App icon generated at assets/icon.png (256x256)');
