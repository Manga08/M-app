import sharp from "sharp";
import { fileURLToPath } from "node:url";

const file = (path) => fileURLToPath(new URL(path, import.meta.url));
const source = file("../public/moneva-icon.svg");
await Promise.all([
  sharp(source).resize(192, 192).png().toFile(file("../public/moneva-icon-192.png")),
  sharp(source).resize(512, 512).png().toFile(file("../public/moneva-icon-512.png")),
  sharp(source).resize(410, 410).extend({ top: 51, bottom: 51, left: 51, right: 51, background: "#101512" }).png().toFile(file("../public/moneva-maskable-512.png")),
]);
