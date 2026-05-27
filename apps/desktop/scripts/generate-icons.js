const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pngToIcoRaw = require('png-to-ico');
const pngToIco = typeof pngToIcoRaw === 'function' ? pngToIcoRaw : pngToIcoRaw.default;

if (typeof pngToIco !== 'function') {
  console.error('✗ Failed to load png-to-ico as a function. Struct:', pngToIcoRaw);
  process.exit(1);
}

const assetsDir = path.join(__dirname, '../assets');
const sourceFile = path.join(assetsDir, 'icon.png');
const inputPng = path.join(assetsDir, 'icon_actual.png'); // 진짜 PNG 형식의 소스
const outputIcns = path.join(assetsDir, 'icon.icns');
const outputIco = path.join(assetsDir, 'icon.ico');

console.log('Starting icon generation...');

// 0. Convert raw JPEG (named icon.png) into actual PNG format using sips
try {
  console.log('Converting source image to true PNG format...');
  execSync(`sips -s format png "${sourceFile}" --out "${inputPng}"`, { stdio: 'inherit' });
} catch (err) {
  console.error('✗ Failed to convert source to true PNG:', err.message);
  process.exit(1);
}

// 1. Generate macOS .icns using sips and iconutil
try {
  console.log('Creating macOS .icns...');
  const iconsetDir = path.join(assetsDir, 'icon.iconset');
  if (fs.existsSync(iconsetDir)) {
    fs.rmSync(iconsetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(iconsetDir);

  const sizes = [
    { size: 16, name: 'icon_16x16.png' },
    { size: 32, name: 'icon_16x16@2x.png' },
    { size: 32, name: 'icon_32x32.png' },
    { size: 64, name: 'icon_32x32@2x.png' },
    { size: 128, name: 'icon_128x128.png' },
    { size: 256, name: 'icon_128x128@2x.png' },
    { size: 256, name: 'icon_256x256.png' },
    { size: 512, name: 'icon_256x256@2x.png' },
    { size: 512, name: 'icon_512x512.png' },
    { size: 1024, name: 'icon_512x512@2x.png' }
  ];

  for (const s of sizes) {
    const dest = path.join(iconsetDir, s.name);
    console.log(`Generating: ${s.name} (${s.size}x${s.size})`);
    execSync(`sips -z ${s.size} ${s.size} "${inputPng}" --out "${dest}"`, { stdio: 'inherit' });
  }

  // Compile using iconutil
  console.log('Running iconutil...');
  execSync(`iconutil -c icns "${iconsetDir}" -o "${outputIcns}"`, { stdio: 'inherit' });
  
  // Clean up temporary iconset directory
  fs.rmSync(iconsetDir, { recursive: true, force: true });
  console.log('✓ Created apps/desktop/assets/icon.icns successfully.');
} catch (error) {
  console.error('✗ Failed to generate macOS .icns:', error.message);
}

// 2. Generate Windows .ico using png-to-ico
console.log('Creating Windows .ico...');
pngToIco(inputPng)
  .then((buf) => {
    fs.writeFileSync(outputIco, buf);
    console.log('✓ Created apps/desktop/assets/icon.ico successfully.');
    
    // Clean up temporary icon_actual.png
    if (fs.existsSync(inputPng)) {
      fs.unlinkSync(inputPng);
    }
    console.log('Icon generation complete!');
  })
  .catch((err) => {
    console.error('✗ Failed to generate Windows .ico:', err.message);
    if (fs.existsSync(inputPng)) {
      fs.unlinkSync(inputPng);
    }
  });
