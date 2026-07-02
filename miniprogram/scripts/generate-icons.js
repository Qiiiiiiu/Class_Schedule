const fs = require('fs');
const path = require('path');

const tabDir = path.join(__dirname, '../images/tab');

// 简单的PNG图标生成函数
function createSimpleIcon(color) {
  // 1x1像素的PNG图片
  // PNG文件结构简化版
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk (image header)
  const width = 24;
  const height = 24;
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type (RGBA)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdrData);
  
  // IDAT chunk (image data) - 简单的实心方块
  const zlib = require('zlib');
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0; // filter byte
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      rawData[offset] = color.r;
      rawData[offset + 1] = color.g;
      rawData[offset + 2] = color.b;
      rawData[offset + 3] = color.a;
    }
  }
  
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);
  
  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([pngHeader, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = [];
  
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// 创建图标
const icons = {
  'home': { r: 102, g: 102, b: 102, a: 255 },
  'home-active': { r: 59, g: 130, b: 246, a: 255 },
  'students': { r: 102, g: 102, b: 102, a: 255 },
  'students-active': { r: 59, g: 130, b: 246, a: 255 },
  'courses': { r: 102, g: 102, b: 102, a: 255 },
  'courses-active': { r: 59, g: 130, b: 246, a: 255 },
  'schedule': { r: 102, g: 102, b: 102, a: 255 },
  'schedule-active': { r: 59, g: 130, b: 246, a: 255 },
  'profile': { r: 102, g: 102, b: 102, a: 255 },
  'profile-active': { r: 59, g: 130, b: 246, a: 255 }
};

if (!fs.existsSync(tabDir)) {
  fs.mkdirSync(tabDir, { recursive: true });
}

Object.keys(icons).forEach(name => {
  const icon = createSimpleIcon(icons[name]);
  const filePath = path.join(tabDir, `${name}.png`);
  fs.writeFileSync(filePath, icon);
  console.log(`Created: ${filePath}`);
});

console.log('All tabBar icons created successfully!');