// Crops the welcome dialog's photo out of the Tuttle Creek pilot-study slide
// (notes/photos/tuttle-creek-wid-pilot-study.png, 1278×718): photo C, the
// sediment-laden Water Injection Dredging release below Tuttle Creek Dam, as
// a portrait slice with none of the slide's frame, letters or caption.
// Chromium's canvas does the crop and the JPEG encoding, so no image library
// is needed.
//
//   node scripts/welcome-photo.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const SOURCE = "notes/photos/tuttle-creek-wid-pilot-study.png";
const OUT = "public/welcome/tuttle-creek-release.jpg";
/** Photo C's slice in slide pixels: clear of the slide frame and the "C." label. */
const CROP = { x: 600, y: 32, width: 440, height: 608 };
const QUALITY = 0.85;

const png = await readFile(SOURCE);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(
    async ({ src, crop, quality }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = crop.width;
      canvas.height = crop.height;
      canvas.getContext("2d").drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      return canvas.toDataURL("image/jpeg", quality);
    },
    { src: `data:image/png;base64,${png.toString("base64")}`, crop: CROP, quality: QUALITY },
  );
  await mkdir("public/welcome", { recursive: true });
  const jpg = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  await writeFile(OUT, jpg);
  console.log(`${OUT}: ${CROP.width}×${CROP.height}, ${Math.round(jpg.length / 1024)} KB`);
} finally {
  await browser.close();
}
