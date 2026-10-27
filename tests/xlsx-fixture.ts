/** Создание небольших XLSX-файлов для проверки структуры, заголовков и ошибочных значений. */
import { zipSync, strToU8 } from 'fflate';
const headers = [
  'День недели',
  'Дата',
  'Время с',
  'Время по',
  'Дисциплина',
  'Преподаватель',
  'Аудитория',
  'Группа',
];
export function scheduleFixture(
  options: {
    date?: string;
    reorder?: boolean;
    missingDay?: boolean;
    invalidTime?: boolean;
    sheet?: string;
    formula?: boolean;
  } = {},
) {
  const order = options.reorder ? [4, 1, 6, 0, 5, 7, 3, 2] : [0, 1, 2, 3, 4, 5, 6, 7];
  const data: (string | number)[][] = [
    headers,
    [
      options.missingDay ? '' : 'Понедельник',
      options.date ?? '46319',
      0.375,
      0.4375,
      'Технология net',
      'Иванов',
      '201',
      'ИТ-1',
    ],
    [
      '',
      options.date ?? '2099-01-01',
      options.invalidTime ? '25:00' : '10:40',
      '12:10',
      'Педогогика высшей школы',
      'Петров',
      '202',
      'ИТ-1',
    ],
    [],
    [
      'пн.',
      options.date ?? 'сломанная дата',
      '09:00',
      '10:30',
      'Технология net',
      'Иванов',
      '201',
      'ИТ-1',
    ],
    [
      'Непонятный день',
      options.date ?? '2026-10-26',
      '13:00',
      '14:30',
      'Новая дисциплина',
      '',
      '',
      '',
    ],
  ];
  const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  const rows = data
    .map(
      (values, index) =>
        `<row r="${index + 1}">${order
          .map((col, c) => {
            const value = values[col];
            if (value === undefined) return '';
            const ref = String.fromCharCode(65 + c) + (index + 1);
            if (options.formula && index === 1 && col === 2)
              return `<c r="${ref}"><f>NOW()</f><v>0.375</v></c>`;
            return typeof value === 'number'
              ? `<c r="${ref}"><v>${value}</v></c>`
              : `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
          })
          .join('')}</row>`,
    )
    .join('');
  const parts: Record<string, string> = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${options.sheet ?? 'Расписание'}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData><mergeCells count="1"><mergeCell ref="${options.reorder ? 'D' : 'A'}2:${options.reorder ? 'D' : 'A'}3"/></mergeCells></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(parts).map(([p, s]) => [p, strToU8(s)])));
}
