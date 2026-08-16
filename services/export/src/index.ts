import express from "express";
import cors from "cors";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.post("/export", async (req, res) => {
  const { markdown, format } = req.body;

  if (!markdown || !format) {
    return res.status(400).json({ error: "Missing markdown or format" });
  }

  const allowedFormats = ["pdf", "docx", "html", "latex", "epub"];
  if (!allowedFormats.includes(format)) {
    return res.status(400).json({ error: "Invalid format" });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pandoc-"));
  const inputPath = path.join(tmpDir, "input.md");
  const outputPath = path.join(tmpDir, `output.${format}`);

  try {
    await fs.writeFile(inputPath, markdown);

    let command = `pandoc "${inputPath}" -o "${outputPath}"`;
    if (format === "pdf") {
      command += " --pdf-engine=xelatex";
    } else if (format === "html") {
      command += " --standalone";
    }

    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });

    res.download(outputPath, `export.${format}`, async (err) => {
      if (err) console.error("Download error:", err);
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: "Export failed" });
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Export service running on port ${PORT}`);
});
