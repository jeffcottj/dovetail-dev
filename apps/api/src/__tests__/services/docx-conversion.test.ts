import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { convertDocxBuffer, DocxConversionError } from '../../services/docx-conversion.js';

function makeDocx(documentXml: string) {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`));
  zip.addFile('_rels/.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`));
  zip.addFile('word/document.xml', Buffer.from(documentXml));
  return zip.toBuffer();
}

describe('docx conversion', () => {
  it('converts Word structure into TipTap JSON', async () => {
    const buffer = makeDocx(`<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
            <w:r><w:t>Benefits Appeal</w:t></w:r>
          </w:p>
          <w:p>
            <w:r><w:t>This paragraph has </w:t></w:r>
            <w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r>
            <w:r><w:t> and </w:t></w:r>
            <w:r><w:rPr><w:i/></w:rPr><w:t>italic</w:t></w:r>
            <w:r><w:t> text.</w:t></w:r>
          </w:p>
          <w:tbl>
            <w:tr>
              <w:tc><w:p><w:r><w:t>Deadline</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>30 days</w:t></w:r></w:p></w:tc>
            </w:tr>
          </w:tbl>
        </w:body>
      </w:document>`);

    const result = await convertDocxBuffer(buffer);

    expect(result.suggestedTitle).toBe('Benefits Appeal');
    expect(result.plainText).toContain('This paragraph has');
    expect(result.plainText).toContain('Deadline');
    expect(result.content).toMatchObject({ type: 'doc' });
    expect(JSON.stringify(result.content)).toContain('"type":"heading"');
    expect(JSON.stringify(result.content)).toContain('"type":"bold"');
    expect(JSON.stringify(result.content)).toContain('"type":"italic"');
    expect(JSON.stringify(result.content)).toContain('"type":"table"');
  });

  it('rejects invalid DOCX input', async () => {
    await expect(convertDocxBuffer(Buffer.from('not a docx'))).rejects.toBeInstanceOf(DocxConversionError);
  });
});
