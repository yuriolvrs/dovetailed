// What this file is: unit tests for reading PDF/DOCX/PPTX text in the browser.
// The DOCX fixtures are real Word files built with the `docx` package.
// In plain terms: proves resumes are read locally, and that a file with no
// real text is handed back for the document reader.

import { describe, expect, it } from 'vitest';
import { Document, Header, Packer, Paragraph, TextRun } from 'docx';
import { officeXmlToText, pdfItemsToText, readTextLocally, readZipEntries } from './localText';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function docxFile(lines: string[], header?: string): Promise<File> {
  const doc = new Document({
    sections: [
      {
        headers: header ? { default: new Header({ children: [new Paragraph(header)] }) } : undefined,
        children: lines.map((line) => new Paragraph({ children: [new TextRun(line)] })),
      },
    ],
  });
  return new File([new Uint8Array(await Packer.toBuffer(doc))], 'resume.docx', { type: DOCX_TYPE });
}

describe('readTextLocally', () => {
  it('reads a Word resume, header first', async () => {
    const file = await docxFile(
      [
        'Software Engineer, Brightline Logistics',
        'Built a route-planning service in Go that cut planning time by 40% & more',
        'Migrated 12 internal tools to AWS ECS with Terraform',
      ],
      'Alex Rivera · alex@example.com',
    );
    const text = await readTextLocally(file);
    expect(text).toBe(
      [
        'Alex Rivera · alex@example.com',
        'Software Engineer, Brightline Logistics',
        'Built a route-planning service in Go that cut planning time by 40% & more',
        'Migrated 12 internal tools to AWS ECS with Terraform',
      ].join('\n'),
    );
  });

  it('returns null for a file with almost no text, so OCR can try it', async () => {
    expect(await readTextLocally(await docxFile(['Scan']))).toBeNull();
  });

  it('returns null for a damaged file instead of throwing', async () => {
    expect(await readTextLocally(new File(['not a zip'], 'cv.docx', { type: DOCX_TYPE }))).toBeNull();
  });

  it('ignores types it does not read', async () => {
    expect(await readTextLocally(new File(['x'], 'photo.png', { type: 'image/png' }))).toBeNull();
  });
});

describe('readZipEntries', () => {
  it('returns only the wanted entries', async () => {
    const file = await docxFile(['hello']);
    const entries = await readZipEntries(new Uint8Array(await file.arrayBuffer()), (n) => n === 'word/document.xml');
    expect([...entries.keys()]).toEqual(['word/document.xml']);
    expect(entries.get('word/document.xml')).toContain('hello');
  });
});

describe('officeXmlToText', () => {
  it('keeps paragraphs, run tabs and breaks, and decodes entities', () => {
    const xml =
      '<w:body><w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>' +
      '<w:r><w:t>Go</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">R&amp;D &lt;lead&gt;</w:t></w:r></w:p>' +
      '<w:p/><w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r></w:p></w:body>';
    expect(officeXmlToText(xml, 'w')).toBe('Go R&D <lead>\nLine one\nLine two');
  });

  it('reads PowerPoint text', () => {
    const xml = '<p:sp><a:p><a:r><a:t>Q3 results</a:t></a:r></a:p><a:p><a:r><a:t>Grew 20&#37;</a:t></a:r></a:p></p:sp>';
    expect(officeXmlToText(xml, 'a')).toBe('Q3 results\nGrew 20%');
  });
});

describe('pdfItemsToText', () => {
  const item = (str: string, x: number, y: number, width: number, hasEOL = false) => ({
    str,
    transform: [10, 0, 0, 10, x, y],
    width,
    height: 10,
    hasEOL,
  });

  it('joins pieces on one baseline and breaks lines when it moves', () => {
    const text = pdfItemsToText([
      item('Software', 50, 700, 40),
      item('Engineer', 93, 700, 40),
      item('Brightline', 50, 685, 45),
    ]);
    expect(text).toBe('Software Engineer\nBrightline');
  });

  it('does not add a space between pieces that touch', () => {
    expect(pdfItemsToText([item('Engin', 50, 700, 25), item('eer', 75, 700, 15)])).toBe('Engineer');
  });

  it('does not add a blank line after an explicit end of line', () => {
    expect(pdfItemsToText([item('One', 50, 700, 20, true), item('Two', 50, 685, 20, true)])).toBe('One\nTwo');
  });

  it('honours an explicit end of line', () => {
    expect(pdfItemsToText([item('One', 50, 700, 20, true), item('Two', 50, 700, 20)])).toBe('One\nTwo');
  });
});
