import * as T from "three";
import { rng } from "../../logic.js";

// One masked atlas for the quarantine's marks. It joins the static material
// batches, so blood, damp and writing do not each need a transparent draw call.
export function quarantineDecals(stage) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const c = canvas.getContext("2d"),
    random = rng(19360617);
  const stain = (color, count, spread = 210) => {
    c.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2,
        radius = random() ** 0.7 * spread;
      c.beginPath();
      c.ellipse(
        256 + Math.cos(angle) * radius,
        256 + Math.sin(angle) * radius * 0.65,
        3 + random() * 43,
        2 + random() * 19,
        random() * 3,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  };
  const hand = (x, y, scale, angle) => {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.scale(scale, scale);
    c.fillStyle = "#712626";
    c.beginPath();
    c.ellipse(0, 8, 30, 40, -0.12, 0, Math.PI * 2);
    c.fill();
    c.lineCap = "round";
    c.strokeStyle = "#712626";
    c.lineWidth = 13;
    for (const [xx, yy, dx] of [
      [-24, -48, -9],
      [-8, -65, -3],
      [9, -59, 4],
      [24, -43, 10],
      [-40, 0, -10],
    ]) {
      c.beginPath();
      c.moveTo(xx * 0.65, 6);
      c.lineTo(xx + dx, yy);
      c.stroke();
    }
    for (let i = 0; i < 12; i++) {
      c.strokeStyle = i % 2 ? "#4b181b" : "#762b28";
      c.lineWidth = 1 + random() * 3;
      c.beginPath();
      c.moveTo((random() - 0.5) * 50, 24);
      c.lineTo((random() - 0.5) * 40, 90 + random() * 130);
      c.stroke();
    }
    c.restore();
  };
  for (let tile = 0; tile < 8; tile++) {
    c.save();
    c.translate((tile % 4) * 512, Math.floor(tile / 4) * 512);
    c.beginPath();
    c.rect(0, 0, 512, 512);
    c.clip();
    if (tile === 0) {
      stain("#41171b", 220);
      stain("#582023", 100, 140);
      stain("#682829", 34, 90);
    } else if (tile === 1) {
      hand(157, 185, 1.3, -0.19);
      hand(336, 245, 1.1, 0.14);
    } else if (tile === 2 || tile === 5) {
      c.translate(256, 240);
      c.rotate(tile === 2 ? -0.04 : 0.03);
      c.fillStyle = "#ad8d75";
      c.textAlign = "center";
      c.font = "bold 57px Georgia";
      const lines =
        tile === 2 ? ["ILS", "REVIENNENT"] : ["NE LES LAISSEZ", "PAS ENTRER"];
      lines.forEach((line, i) => c.fillText(line, 0, i * 77, 470));
      c.strokeStyle = "#914137";
      c.lineWidth = 8;
      c.beginPath();
      c.moveTo(-213, 114);
      c.lineTo(211, 105);
      c.stroke();
    } else if (tile === 3) {
      c.fillStyle = "#b4aa8b";
      c.fillRect(48, 29, 416, 458);
      c.strokeStyle = "#6c2b27";
      c.lineWidth = 6;
      c.strokeRect(60, 41, 392, 434);
      c.fillStyle = "#682723";
      c.fillRect(218, 72, 76, 142);
      c.fillRect(184, 105, 144, 76);
      c.textAlign = "center";
      c.font = "bold 34px Georgia";
      c.fillText("QUARANTAINE", 256, 270, 360);
      c.font = "27px Georgia";
      c.fillText("EAU CONTAMINÉE", 256, 330, 340);
      c.fillText("NE PAS BOIRE", 256, 376, 340);
      c.font = "19px Georgia";
      c.fillText("SERVICE SANITAIRE · 17 JUIN", 256, 440, 345);
      for (let i = 0; i < 1200; i++) {
        c.fillStyle = "#382e2420";
        c.fillRect(
          48 + random() * 416,
          29 + random() * 458,
          random() * 17,
          random() * 4,
        );
      }
    } else if (tile === 4) {
      c.fillStyle = "#1e2825";
      for (let i = 0; i < 190; i++) {
        const x = random() * 512,
          height = 30 + random() * 425;
        c.globalAlpha = 0.35 + random() * 0.6;
        c.fillRect(x, 0, 1 + random() * 10, height);
      }
      c.globalAlpha = 1;
      stain("#24302a", 160, 205);
    } else if (tile === 6) {
      c.strokeStyle = "#632022";
      c.lineWidth = 15;
      for (let row = 0; row < 4; row++) {
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.moveTo(110 + i * 73, 52 + row * 111);
          c.lineTo(98 + i * 73, 128 + row * 111);
          c.stroke();
        }
        c.beginPath();
        c.moveTo(74, 111 + row * 111);
        c.lineTo(357, 62 + row * 111);
        c.stroke();
      }
    } else {
      for (let i = 0; i < 36; i++) {
        c.fillStyle = i % 3 ? "#542022" : "#702928";
        c.beginPath();
        c.ellipse(
          220 + Math.sin(i) * 35,
          10 + i * 13,
          8 + random() * 39,
          5 + random() * 15,
          0,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    }
    c.restore();
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  const material = new T.MeshStandardMaterial({
    map,
    roughness: 0.75,
    alphaTest: 0.24,
    side: T.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return (tile, x, y, z, width, height, rotationY = 0, floor = false) => {
    const geometry = new T.PlaneGeometry(width, height),
      uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(
        i,
        ((tile % 4) + uv.getX(i)) / 4,
        (1 - Math.floor(tile / 4) + uv.getY(i)) / 2,
      );
    const decal = new T.Mesh(geometry, material);
    decal.position.set(x, y, z);
    if (floor) decal.rotation.set(-Math.PI / 2, 0, rotationY);
    else decal.rotation.y = rotationY;
    decal.receiveShadow = true;
    stage.add(decal);
    return decal;
  };
}
