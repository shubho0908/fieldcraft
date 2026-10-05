import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { resumeFixture } from "./extension";

// Reuse the authored native PDF facts but replace its raster with a textless
// portrait. This remains a real PDF upload, not a parser or browser mock.
export async function portraitResume(): Promise<Buffer> {
  const source = await readFile(resumeFixture("native-text-with-image.pdf"));
  const imageStart = source.indexOf("6 0 obj\n");
  if (imageStart < 0) throw new Error("Native fixture's raster object is missing");
  const prefix = source.subarray(0, imageStart);
  const width = 1032;
  const height = 440;
  const pixels = Buffer.alloc(width * height * 3, 255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const head = (x - 516) ** 2 + (y - 135) ** 2 < 85 ** 2;
      const shoulders = ((x - 516) / 200) ** 2 + ((y - 410) / 170) ** 2 < 1;
      if (head || shoulders) {
        const offset = (y * width + x) * 3;
        pixels[offset] = 110;
        pixels[offset + 1] = 125;
        pixels[offset + 2] = 145;
      }
    }
  }
  const image = deflateSync(pixels);
  const object = Buffer.concat([
    Buffer.from(`6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`),
    image,
    Buffer.from("\nendstream\nendobj\n"),
  ]);
  const offsets = [...prefix.toString("latin1").matchAll(/^([1-5]) 0 obj$/gm)].map((match) => match.index!);
  if (offsets.length !== 5) throw new Error("Native fixture's PDF object layout changed");
  offsets.push(imageStart);
  const xref = prefix.length + object.length;
  const trailer = Buffer.from(`xref\n0 7\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat([prefix, object, trailer]);
}
