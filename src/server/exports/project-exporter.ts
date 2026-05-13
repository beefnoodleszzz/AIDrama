import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { Prisma } from "@prisma/client";

export type ExportFormat = "xlsx" | "pdf" | "csv" | "zip";

export type ExportShot = {
  shotNo: number;
  durationSeconds: number;
  shotType: string | null;
  cameraLanguage: string | null;
  continuityHint: string | null;
  promptText: string | null;
  promptJson: Prisma.JsonValue | null;
};

export type ExportEpisode = {
  episodeNo: number;
  title: string | null;
  rawScript: string;
  shots: ExportShot[];
};

export type ExportCharacter = {
  name: string;
  appearanceLock: string | null;
  outfitLock: string | null;
  negativePrompt: string | null;
};

export type ExportProject = {
  title: string;
  synopsis: string | null;
  episodes: ExportEpisode[];
  characters: ExportCharacter[];
};

function dialogueFromPromptJson(promptJson: Prisma.JsonValue | null): string {
  if (!promptJson || typeof promptJson !== "object" || Array.isArray(promptJson)) return "";
  const dialogue = (promptJson as Record<string, unknown>).dialogue;
  if (typeof dialogue === "string") return dialogue;
  if (Array.isArray(dialogue)) {
    return dialogue.filter((v) => typeof v === "string").join("\\n");
  }
  return "";
}

function buildShotRows(project: ExportProject) {
  const rows: Array<Record<string, string | number>> = [];
  for (const ep of project.episodes) {
    for (const shot of ep.shots) {
      rows.push({
        "集数": ep.episodeNo,
        "镜头号": shot.shotNo,
        "时长(s)": shot.durationSeconds,
        "景别": shot.shotType || "",
        "运镜": shot.cameraLanguage || "",
        "画面连续性": shot.continuityHint || "",
        "台词(dialogue)": dialogueFromPromptJson(shot.promptJson),
        "分镜词(promptText)": shot.promptText || "",
      });
    }
  }
  return rows;
}

export function exportProjectAsCsv(project: ExportProject): Buffer {
  const rows = buildShotRows(project);
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ",", RS: "\n" });
  return Buffer.from(csv, "utf-8");
}

export function exportProjectAsXlsx(project: ExportProject): Buffer {
  const wb = XLSX.utils.book_new();

  const outlineSheet = XLSX.utils.json_to_sheet([
    {
      "项目名称": project.title,
      "项目梗概": project.synopsis || "",
      "分集数量": project.episodes.length,
      "角色数量": project.characters.length,
    },
  ]);
  XLSX.utils.book_append_sheet(wb, outlineSheet, "项目概览");

  const characterRows = project.characters.map((c) => ({
    "角色名": c.name,
    "外貌锁定": c.appearanceLock || "",
    "服装锁定": c.outfitLock || "",
    "负面约束": c.negativePrompt || "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(characterRows), "角色卡");

  const shotRows = buildShotRows(project);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shotRows), "分镜表");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return buffer;
}

export function exportProjectAsPdf(project: ExportProject): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.setFontSize(18);
  doc.text(`项目资料包：${project.title}`, 40, 48);

  doc.setFontSize(11);
  doc.text(`梗概：${project.synopsis || ""}`, 40, 72, { maxWidth: 520 });

  autoTable(doc, {
    startY: 96,
    head: [["角色", "外貌锁定", "服装锁定", "负面约束"]],
    body: project.characters.map((c) => [c.name, c.appearanceLock || "", c.outfitLock || "", c.negativePrompt || ""]),
    styles: { fontSize: 9, cellPadding: 4 },
  });

  const rows = buildShotRows(project);
  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
      ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16
      : 320,
    head: [["集", "镜头", "时长", "景别", "运镜", "连续性", "台词", "分镜词"]],
    body: rows.map((r) => [
      String(r["集数"]),
      String(r["镜头号"]),
      String(r["时长(s)"]),
      String(r["景别"]),
      String(r["运镜"]),
      String(r["画面连续性"]),
      String(r["台词(dialogue)"]).slice(0, 48),
      String(r["分镜词(promptText)"]).slice(0, 72),
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    theme: "grid",
  });

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

export async function exportProjectAsZip(
  project: ExportProject,
  options?: { includeAssets?: boolean; assets?: Array<{ kind: "image" | "video" | "audio"; shotNo: number; url: string }> }
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("xlsx/storyboard.xlsx", exportProjectAsXlsx(project));
  zip.file("pdf/project-package.pdf", exportProjectAsPdf(project));
  zip.file("csv/storyboard.csv", exportProjectAsCsv(project));

  const assetRows = options?.assets?.map((a) => ({
    shotNo: a.shotNo,
    kind: a.kind,
    url: a.url,
  })) || [];
  const assetSheet = XLSX.utils.json_to_sheet(assetRows);
  const assetCsv = XLSX.utils.sheet_to_csv(assetSheet, { FS: ",", RS: "\n" });
  zip.file("manifest/assets-links.csv", Buffer.from(assetCsv, "utf-8"));

  if (options?.includeAssets && options.assets?.length) {
    for (const item of options.assets) {
      try {
        const res = await fetch(item.url);
        if (!res.ok) continue;
        const ab = await res.arrayBuffer();
        const ext = item.kind === "image" ? "jpg" : item.kind === "video" ? "mp4" : "mp3";
        zip.file(`assets/shot-${item.shotNo}-${item.kind}.${ext}`, Buffer.from(ab));
      } catch {
        // Ignore single asset failures, links file remains available.
      }
    }
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
