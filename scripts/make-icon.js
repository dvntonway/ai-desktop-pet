const { Jimp } = require('jimp');
const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../app_icon.png');
const out = path.join(__dirname, '../build/icon.ico');
const tmp = path.join(__dirname, '../build/_tmp_icons');

async function main() {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });

  const sizes = [256, 128, 64, 48, 32, 16];
  const img = await Jimp.read(src);

  const pngs = await Promise.all(sizes.map(async (s) => {
    const p = path.join(tmp, `${s}.png`);
    await img.clone().resize({ w: s, h: s }).write(p);
    return p;
  }));

  const buf = await pngToIco(pngs);
  fs.writeFileSync(out, buf);
  fs.rmSync(tmp, { recursive: true });
  console.log(`build/icon.ico created (${sizes.join('/')}px)`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
