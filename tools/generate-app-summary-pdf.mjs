import fs from 'node:fs';
import path from 'node:path';

const outputPath = path.resolve(process.cwd(), 'vid-vision-app-summary.pdf');

const page = {
  width: 595.28,
  height: 841.89,
  margin: 38,
  gutter: 24,
};

const content = {
  title: 'Vid Vision App Summary',
  subtitle: 'Evidence-based repo overview',
  left: [
    {
      heading: 'What It Is',
      body: [
        'Vid Vision, branded in the repo as Janso Studio, is a React + Express app for YouTube creators with AI-assisted creation, optimization, and channel analysis tools.',
        'The codebase presents it as a unified YouTube creator platform and a next-generation VidIQ-style competitor.',
      ],
    },
    {
      heading: 'Who It Is For',
      body: [
        'Primary persona: YouTube creators and channel operators who want analytics, idea generation, SEO help, scripting, thumbnails, Shorts, and coaching in one workspace.',
      ],
    },
    {
      heading: 'What It Does',
      bullets: [
        'Optimizes titles, descriptions, tags, and metadata with the SEO workspace.',
        'Supports content strategy, keyword research, and script drafting for new videos.',
        'Provides Thumbnail Studio tools including concepting, heatmaps, authorizations, and A/B-style optimization flows.',
        'Generates AI voiceovers in Neural Voice Studio using Gemini-based text-to-speech.',
        'Finds and cuts short-form clips, analyzes remix opportunities, and supports Shorts workflows.',
        'Shows channel analytics, video lists, comment insights, competitor research, and collaboration search.',
      ],
    },
  ],
  right: [
    {
      heading: 'How It Works',
      bullets: [
        'Frontend: React 19 + TypeScript SPA in src/App.tsx switches between creator workspaces and settings; Vite handles the frontend build.',
        'Backend: server.ts runs an Express server that serves the app and exposes REST endpoints for auth, analytics, videos, comments, thumbnails, Shorts, snapshots, and Gemini key validation.',
        'Auth/data: Google OAuth handles YouTube connection; Supabase clients/helpers support authenticated account storage and multi-account flows; Express sessions/cookies are also used.',
        'AI: Gemini powers insight generation, voiceover, thumbnail/image prompts, script placeholders, coaching, and viral clip analysis via src/services/geminiService.ts and src/services/viralClipService.ts.',
        'Media processing: FFmpeg.wasm cuts video clips client-side in src/services/ffmpegService.ts; multer handles uploads and youtube-dl-exec is used server-side for some video ingestion.',
        'Persistence: better-sqlite3 stores channel snapshot history in channel_snapshots.db, while Supabase is used for server-side user and YouTube account records.',
      ],
    },
    {
      heading: 'How To Run',
      bullets: [
        'Install dependencies: npm install',
        'Create .env.local and set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SESSION_SECRET.',
        'Start the app: npm run dev',
        'Open http://localhost:3000',
        'For AI features, add a Gemini API key in Settings > API Keys after launch.',
      ],
    },
  ],
};

function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function widthFactor(char) {
  if (/[A-Z]/.test(char)) return 0.64;
  if (/[mwMW]/.test(char)) return 0.78;
  if (/[ilI1.,'` ]/.test(char)) return 0.26;
  if (/[-/]/.test(char)) return 0.34;
  return 0.54;
}

function estimateTextWidth(text, fontSize) {
  let units = 0;
  for (const char of text) {
    units += widthFactor(char);
  }
  return units * fontSize;
}

function wrapText(text, fontSize, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (estimateTextWidth(next, fontSize) <= maxWidth) {
      current = next;
    } else if (!current) {
      lines.push(word);
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function buildColumnSections(sections, startX, startY, width) {
  const commands = [];
  let y = startY;
  const headingFontSize = 11.5;
  const bodyFontSize = 8.9;
  const bulletFontSize = 8.7;
  const headingGap = 14;
  const lineGap = 10.8;
  const sectionGap = 12;
  const bulletIndent = 10;
  const bodyWidth = width;
  const bulletWidth = width - bulletIndent;

  const addText = (text, x, baselineY, fontSize, fontName = 'F1') => {
    commands.push(`BT /${fontName} ${fontSize} Tf 1 0 0 1 ${x.toFixed(2)} ${baselineY.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`);
  };

  for (const section of sections) {
    addText(section.heading, startX, y, headingFontSize, 'F2');
    y -= headingGap;

    if (section.body) {
      for (const paragraph of section.body) {
        const lines = wrapText(paragraph, bodyFontSize, bodyWidth);
        for (const line of lines) {
          addText(line, startX, y, bodyFontSize, 'F1');
          y -= lineGap;
        }
        y -= 2;
      }
    }

    if (section.bullets) {
      for (const bullet of section.bullets) {
        const lines = wrapText(bullet, bulletFontSize, bulletWidth);
        lines.forEach((line, index) => {
          if (index === 0) {
            addText('-', startX, y, bulletFontSize, 'F2');
          }
          addText(line, startX + bulletIndent, y, bulletFontSize, 'F1');
          y -= lineGap;
        });
        y -= 1.5;
      }
    }

    y -= sectionGap;
  }

  return { commands, finalY: y };
}

function buildPdf() {
  const colWidth = (page.width - (page.margin * 2) - page.gutter) / 2;
  const headerTop = page.height - page.margin;
  const headerRuleY = page.height - 104;
  const contentTop = page.height - 130;
  const rightX = page.margin + colWidth + page.gutter;

  const leftColumn = buildColumnSections(content.left, page.margin, contentTop, colWidth);
  const rightColumn = buildColumnSections(content.right, rightX, contentTop, colWidth);

  const footerY = 28;
  const minSafeY = footerY + 18;
  if (leftColumn.finalY < minSafeY || rightColumn.finalY < minSafeY) {
    throw new Error(`Content overflow risk detected (left=${leftColumn.finalY.toFixed(2)}, right=${rightColumn.finalY.toFixed(2)}).`);
  }
  const streamParts = [
    '0.18 w',
    '0.10 0.12 0.18 RG',
    `${page.margin} ${headerRuleY} m ${page.width - page.margin} ${headerRuleY} l S`,
    '0.95 0.97 1 rg',
    `${page.margin} ${page.height - 86} ${page.width - (page.margin * 2)} 56 re f`,
    '0 0 0 rg',
    `BT /F2 20 Tf 1 0 0 1 ${page.margin.toFixed(2)} ${(headerTop - 36).toFixed(2)} Tm (${escapePdfText(content.title)}) Tj ET`,
    `BT /F1 9.2 Tf 1 0 0 1 ${page.margin.toFixed(2)} ${(headerTop - 52).toFixed(2)} Tm (${escapePdfText(content.subtitle)}) Tj ET`,
    ...leftColumn.commands,
    ...rightColumn.commands,
    `BT /F1 7.5 Tf 1 0 0 1 ${page.margin.toFixed(2)} ${footerY.toFixed(2)} Tm (${escapePdfText('Sources: README.md, SETUP.md, package.json, src/App.tsx, server.ts, src/services/*.ts, supabaseServer.ts')}) Tj ET`,
  ];

  const contentStream = streamParts.join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width.toFixed(2)} ${page.height.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj',
    `6 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return pdf;
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, buildPdf(), 'binary');
console.log(outputPath);
