import { Document, Packer, Paragraph, ImageRun } from "docx";
import fs from "fs";

// Leer la imagen generada
const imagePath = "C:/Users/Stefany M. Vargas/.gemini/antigravity-ide/brain/08c7f430-bb23-4de7-a5a8-9fdfcc13e8e5/licostock_architecture_1782448068196.png";

if (!fs.existsSync(imagePath)) {
  console.error("ERROR: Image does not exist at " + imagePath);
  process.exit(1);
}

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph("Visual Test of Image Embedding:"),
        new Paragraph({
          children: [
            new ImageRun({
              data: fs.readFileSync(imagePath),
              transformation: {
                width: 400,
                height: 300,
              },
            }),
          ],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("test_image_out.docx", buffer);
  console.log("SUCCESS: Image embedded successfully in test document.");
}).catch((err) => {
  console.error("ERROR:", err);
});
