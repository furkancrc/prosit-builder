import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SOFFICE = process.env.SOFFICE_PATH || "soffice";
const TIMEOUT_MS = 60_000;

export class PdfUnavailableError extends Error {}

// LibreOffice ne supporte pas bien les conversions concurrentes sur un même profil : on les sérialise.
let queue: Promise<unknown> = Promise.resolve();

export function docxToPdf(docx: Buffer): Promise<Buffer> {
  const run = queue.then(() => convert(docx));
  queue = run.catch(() => undefined);
  return run;
}

async function convert(docx: Buffer): Promise<Buffer> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "prosit-pdf-"));
  const profile = path.join(os.tmpdir(), "prosit-lo-profile");
  try {
    const input = path.join(work, "prosit.docx");
    await fs.writeFile(input, docx);
    await new Promise<void>((resolve, reject) => {
      execFile(
        SOFFICE,
        [`-env:UserInstallation=${pathToFileURL(profile).href}`, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", work, input],
        { timeout: TIMEOUT_MS, env: { ...process.env, HOME: process.env.HOME || os.tmpdir() } },
        (err, _stdout, stderr) => {
          if (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === "ENOENT") reject(new PdfUnavailableError("LibreOffice (soffice) est introuvable sur ce serveur."));
            else reject(new Error(`Conversion PDF échouée : ${stderr || err.message}`));
          } else resolve();
        },
      );
    });
    return await fs.readFile(path.join(work, "prosit.pdf"));
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
