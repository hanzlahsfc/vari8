import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { Vari8Matrix } from "@/components/vari8/matrix";

const exportPattern =
  /^export (?:async )?(?:function|const|class) ([A-Z]\w*)/gm;
const rawControlPattern = /<(button|input|select|textarea)(?=[\s/>])/g;

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(absolute);
    return /\.(tsx?|jsx?|mjs)$/.test(entry.name) ? [absolute] : [];
  });
}

function countVari8Exports(srcDir: string) {
  const names = new Set<string>();
  for (const file of collectSourceFiles(
    path.join(srcDir, "components", "vari8"),
  )) {
    if (path.basename(file) === "matrix.tsx") continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(exportPattern)) names.add(match[1]);
  }
  return names.size;
}

function listRawControls(srcDir: string, rootDir: string) {
  const findings: { file: string; line: number; tag: string }[] = [];
  for (const file of collectSourceFiles(srcDir)) {
    const repoPath = path.relative(rootDir, file).split(path.sep).join("/");
    if (repoPath.startsWith("src/components/vari8/")) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((lineText, index) => {
      for (const match of lineText.matchAll(rawControlPattern)) {
        findings.push({ file: repoPath, line: index + 1, tag: match[1] });
      }
    });
  }
  return findings;
}

export default function GalleryPage() {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.NEXT_PUBLIC_V8_GALLERY !== "1"
  ) {
    notFound();
  }

  const rootDir = process.cwd();
  const srcDir = path.join(rootDir, "src");
  const exportTotal = countVari8Exports(srcDir);
  const rawControls = listRawControls(srcDir, rootDir);

  return (
    <main className="v8-gallery">
      <h1>Vari8 component gallery</h1>
      <Vari8Matrix exportTotal={exportTotal} />
      <section>
        <h2>Raw controls outside the matrix</h2>
        {rawControls.length === 0 ? (
          <p>None found.</p>
        ) : (
          <ul>
            {rawControls.map((finding) => (
              <li key={`${finding.file}:${finding.line}:${finding.tag}`}>
                {finding.file}:{finding.line} <code>&lt;{finding.tag}&gt;</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
