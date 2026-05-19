/* global require, __dirname, process, console, Buffer */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS_DIR = path.join(__dirname, '../assets/images');
const SVG_FILE = path.join(ASSETS_DIR, 'app-icon.svg');

// Ensure assets directory exists
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Check if assets are already up to date
const checkUpToDate = () => {
  try {
    const iconPath = path.join(ASSETS_DIR, 'icon.png');
    const playStoreIconPath = path.join(ASSETS_DIR, 'play-store-icon.png');
    const foregroundPath = path.join(ASSETS_DIR, 'android-icon-foreground.png');
    const backgroundPath = path.join(ASSETS_DIR, 'android-icon-background.png');
    const monochromePath = path.join(ASSETS_DIR, 'android-icon-monochrome.png');
    const faviconPath = path.join(ASSETS_DIR, 'favicon.png');
    const splashPath = path.join(ASSETS_DIR, 'splash-icon.png');

    const requiredFiles = [
      iconPath,
      playStoreIconPath,
      foregroundPath,
      backgroundPath,
      monochromePath,
      faviconPath,
      splashPath,
    ];

    if (!fs.existsSync(SVG_FILE)) {
      return false;
    }

    const svgMtime = fs.statSync(SVG_FILE).mtime;

    for (const file of requiredFiles) {
      if (!fs.existsSync(file)) {
        return false;
      }
      const fileMtime = fs.statSync(file).mtime;
      if (fileMtime < svgMtime) {
        return false; // Out of date
      }
    }

    return true; // All files exist and are newer than the SVG
  } catch (_e) {
    return false;
  }
};

if (checkUpToDate()) {
  console.log('✓ App icon assets are up to date.');
  process.exit(0);
}

// 1. Read the original SVG content (the absolute single source of truth)
const originalSvg = fs.readFileSync(SVG_FILE, 'utf8');

// Helper to extract the defs block from the original SVG
const getDefs = svg => {
  const match = svg.match(/<defs>([\s\S]*?)<\/defs>/);
  return match ? match[0] : '';
};

// Helper to extract the core artwork group contents from the original SVG
const getArtwork = svg => {
  const startIndex = svg.indexOf('<g>');
  const endIndex = svg.lastIndexOf('</g>');
  if (startIndex !== -1 && endIndex !== -1) {
    return svg.substring(startIndex + 3, endIndex).trim();
  }
  return '';
};

// 2. Generate standard icon.png (1024x1024)
const generateIcon = async () => {
  console.log('Generating icon.png...');
  await sharp(Buffer.from(originalSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ASSETS_DIR, 'icon.png'));
  console.log('✓ icon.png generated.');
};

// 3. Generate favicon.png (48x48)
const generateFavicon = async () => {
  console.log('Generating favicon.png...');
  await sharp(Buffer.from(originalSvg))
    .resize(48, 48)
    .png()
    .toFile(path.join(ASSETS_DIR, 'favicon.png'));
  console.log('✓ favicon.png generated.');
};

// 4. Generate android-icon-background.png (1024x1024) - Uses the exact solid color from the original SVG
const generateAndroidBackground = async () => {
  console.log('Generating android-icon-background.png...');

  // Extract background color dynamically from originalSvg
  const match = originalSvg.match(/<rect[^>]*fill="([^"]+)"/);
  const bgColor = match ? match[1] : '#E5F4EC';

  const bgSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="${bgColor}"/>
</svg>
  `.trim();

  await sharp(Buffer.from(bgSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ASSETS_DIR, 'android-icon-background.png'));
  console.log('✓ android-icon-background.png generated.');
};

// 5. Generate android-icon-foreground.png (1024x1024, transparent background, scaled to 80% safe zone)
const generateAndroidForeground = async () => {
  console.log('Generating android-icon-foreground.png...');
  const defs = getDefs(originalSvg);
  const artwork = getArtwork(originalSvg);

  const foregroundSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <!-- scale by 0.8 and translate to center in the 1024x1024 box to fit adaptive icon safe zone -->
  <g transform="translate(102.4, 102.4) scale(0.8)">
    ${artwork}
  </g>
</svg>
  `.trim();

  await sharp(Buffer.from(foregroundSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ASSETS_DIR, 'android-icon-foreground.png'));
  console.log('✓ android-icon-foreground.png generated.');
};

// 6. Generate android-icon-monochrome.png (1024x1024, transparent background, solid white, scaled to 80% safe zone)
const generateAndroidMonochrome = async () => {
  console.log('Generating android-icon-monochrome.png...');
  const artwork = getArtwork(originalSvg);

  // Convert all organic forest greens (#052E16) and sage accent greens (#3F8C63)
  // dynamically to pure white (#ffffff) to satisfy standard Android adaptive guidelines.
  const whiteArtwork = artwork
    .replace(/#052E16/g, '#ffffff')
    .replace(/#3F8C63/g, '#ffffff')
    .replace(/url\(#fillGradient\)/g, 'url(#fillGradientWhite)');

  const monochromeSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- soft fill white -->
    <linearGradient id="fillGradientWhite" x1="0" y1="0.8" x2="1" y2="1" gradientTransform="rotate(90)">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05"/>
    </linearGradient>
  </defs>
  
  <!-- scale by 0.8 and translate to center in the 1024x1024 box to fit adaptive icon safe zone -->
  <g transform="translate(102.4, 102.4) scale(0.8)">
    ${whiteArtwork}
  </g>
</svg>
  `.trim();

  await sharp(Buffer.from(monochromeSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ASSETS_DIR, 'android-icon-monochrome.png'));
  console.log('✓ android-icon-monochrome.png generated.');
};

// 7. Generate splash-icon.png (1024x1024) - reusing the beautiful original SVG
const generateSplashIcon = async () => {
  console.log('Generating splash-icon.png...');
  await sharp(Buffer.from(originalSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ASSETS_DIR, 'splash-icon.png'));
  console.log('✓ splash-icon.png generated.');
};

// 8. Generate play-store-icon.png (512x512) - required for Play Store listing
const generatePlayStoreIcon = async () => {
  console.log('Generating play-store-icon.png...');
  await sharp(Buffer.from(originalSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(ASSETS_DIR, 'play-store-icon.png'));
  console.log('✓ play-store-icon.png generated.');
};

const main = async () => {
  try {
    await generateIcon();
    await generateFavicon();
    await generateAndroidBackground();
    await generateAndroidForeground();
    await generateAndroidMonochrome();
    await generateSplashIcon();
    await generatePlayStoreIcon();
    console.log('🎉 All assets successfully generated dynamically!');
  } catch (error) {
    console.error('Error generating assets:', error);
    process.exit(1);
  }
};

main();
