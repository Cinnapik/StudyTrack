/** Чтение листа «Расписание» из OOXML по именованным заголовкам. Колонка даты не участвует в расчёте недели. */
import { unzipSync, strFromU8 } from 'fflate';
import { parseMarkup, elements, content, type MarkupNode } from './markup';
import { lessonSlot, normalizeName } from '../domain/model';
import {
  parseTime,
  parseWeekday,
  scheduleErrors,
  type ScheduleRow,
} from '../domain/weekly-schedule';

const MAX_BYTES = 20_000_000;
export function parseScheduleXlsx(bytes: Uint8Array): ScheduleRow[] {
  if (bytes.length > 5_000_000) throw new Error('Размер XLSX должен быть не больше 5 МБ');
  // Ограничиваем число записей и распакованный размер, чтобы архив не исчерпал память.
  let expanded = 0,
    entries = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter(file) {
        expanded += file.originalSize;
        if (++entries > 500 || expanded > MAX_BYTES) throw new Error('Слишком большой архив');
        return /^xl\/(workbook.xml|_rels\/workbook.xml.rels|sharedStrings.xml|worksheets\/[^/]+.xml)$/.test(
          file.name,
        );
      },
    });
  } catch {
    throw new Error('Не удалось открыть XLSX: файл повреждён, зашифрован или слишком большой');
  }
  if (Object.values(files).reduce((n, v) => n + v.length, 0) > MAX_BYTES)
    throw new Error('Слишком большой XLSX');
  const xml = (path: string) => {
    const data = files[path];
    if (!data) throw new Error('В XLSX отсутствует обязательный раздел');
    return parseMarkup(strFromU8(data), true);
  };
  const sheet = elements(xml('xl/workbook.xml'), 'sheet').find(
    (s) => normalizeName(s.attrs.name ?? '') === 'расписание',
  );
  if (!sheet) throw new Error('В файле нет листа «Расписание»');
  const relation = elements(xml('xl/_rels/workbook.xml.rels'), 'Relationship').find(
    (r) => r.attrs.Id === sheet.attrs['r:id'],
  );
  const target = relation?.attrs.Target ?? '';
  if (relation?.attrs.TargetMode === 'External' || target.includes('..'))
    throw new Error('Недопустимый путь листа');
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const shared = files['xl/sharedStrings.xml']
    ? elements(xml('xl/sharedStrings.xml'), 'si').map((n) => elements(n, 't').map(content).join(''))
    : [];
  const rows = elements(xml(path), 'row');
  if (rows.length > 5001) throw new Error('В файле больше 5000 строк');
  const cellValue = (cell?: MarkupNode): string => {
    if (!cell) return '';
    // Formulas are never evaluated. Required fields with formulas must be corrected in preview.
    if (elements(cell, 'f').length) return '';
    if (cell.attrs.t === 'inlineStr') return elements(cell, 't').map(content).join('');
    const value = elements(cell, 'v').map(content).join('');
    return cell.attrs.t === 's' ? (shared[Number(value)] ?? '') : value;
  };
  // Привязка идёт по названиям колонок; их порядок в книге может меняться.
  const required = [
    'день недели',
    'время с',
    'время по',
    'дисциплина',
    'преподаватель',
    'аудитория',
    'группа',
  ];
  let columns: Record<string, string> | undefined;
  let day = 0;
  const result: ScheduleRow[] = [];
  const keys = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const cells = new Map(
      row.children
        .filter((c) => c.tag === 'c')
        .map((c) => [c.attrs.r?.replace(/\d/g, '') ?? '', c]),
    );
    if (!columns) {
      const found: Record<string, string> = {};
      for (const [col, cell] of cells) found[normalizeName(cellValue(cell))] = col;
      if (required.every((h) => found[h])) columns = found;
      continue;
    }
    // Only named business columns are accessed. The date column has no role at all.
    const get = (name: string) => cellValue(cells.get(columns![name]!)).trim();
    const name = get('дисциплина'),
      start = get('время с'),
      end = get('время по'),
      weekday = get('день недели');
    if (weekday) day = parseWeekday(weekday);
    if (!name && !start && !end) continue;
    const lesson = {
      id: `xlsx-${index}`,
      subjectId: null,
      subjectName: name,
      weekday: day,
      start: parseTime(start),
      end: parseTime(end),
      teacher: get('преподаватель'),
      room: get('аудитория'),
      groupName: get('группа'),
      lessonType: '',
      notes: '',
    };
    const errors = scheduleErrors(lesson);
    const key = lessonSlot(lesson),
      duplicate = keys.has(key);
    keys.add(key);
    result.push({
      row: Number(row.attrs.r) || index + 1,
      lesson,
      errors,
      duplicate,
      include: !duplicate,
    });
  }
  if (!columns)
    throw new Error(
      'Не найдены заголовки: День недели, Время с, Время по, Дисциплина, Преподаватель, Аудитория, Группа',
    );
  if (!result.length) throw new Error('На листе «Расписание» нет занятий');
  return result;
}
