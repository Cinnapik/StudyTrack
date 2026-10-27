/** Загрузка публичного HTML и разбор учебного плана с объединёнными ячейками и разными кодировками. */
import { cleanText, elements, parseMarkup, type MarkupNode } from './markup';
import { strFromU8 } from 'fflate';
import { subjectSchema, type AcademicPlan, type Subject } from '../domain/model';

export function validatePlanUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Введите полную ссылку на учебный план');
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Нужна открытая HTTPS-ссылка без логина и пароля');
  return url.href;
}
function tableRows(table: MarkupNode): MarkupNode[] {
  return table.children.flatMap((c) =>
    c.tag === 'tr' ? [c] : ['tbody', 'thead', 'tfoot'].includes(c.tag) ? tableRows(c) : [],
  );
}
// Разворачиваем rowspan и colspan, чтобы значения оставались в своих логических колонках.
function grid(rows: MarkupNode[]): string[][] {
  const spans: { text: string; left: number }[] = [];
  return rows.map((row) => {
    const out: string[] = [];
    spans.forEach((s, i) => {
      if (s.left > 0) {
        out[i] = s.text;
        s.left--;
      }
    });
    let col = 0;
    for (const cell of row.children.filter((c) => ['th', 'td'].includes(c.tag))) {
      while (out[col] !== undefined) col++;
      const text = cleanText(cell);
      const width = Math.min(100, Math.max(1, Number(cell.attrs.colspan) || 1));
      const height = Math.min(1000, Math.max(1, Number(cell.attrs.rowspan) || 1));
      for (let i = 0; i < width; i++) {
        out[col] = text;
        spans[col] = { text, left: height - 1 };
        col++;
      }
    }
    return out;
  });
}
export interface PlanPreview {
  plan: AcademicPlan;
  warnings: string[];
}
// WHATWG windows-1251 single-byte mapping; native TextDecoder need not support legacy encodings.
const cp1251 = '\u0402\u0403\u201a\u0453\u201e\u2026\u2020\u2021\u20ac\u2030\u0409\u2039\u040a\u040c\u040b\u040f\u0452\u2018\u2019\u201c\u201d\u2022\u2013\u2014\ufffd\u2122\u0459\u203a\u045a\u045c\u045b\u045f\u00a0\u040e\u045e\u0408\u00a4\u0490\u00a6\u00a7\u0401\u00a9\u0404\u00ab\u00ac\u00ad\u00ae\u0407\u00b0\u00b1\u0406\u0456\u0491\u00b5\u00b6\u00b7\u0451\u2116\u0454\u00bb\u0458\u0405\u0455\u0457';
export function decodePlanHtml(bytes:Uint8Array,contentType:string):string {
  if(bytes.length>5_000_000)throw new Error('Страница слишком большая');
  const prefix=String.fromCharCode(...bytes.slice(0,2048));
  const charset=/charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1] ?? /charset\s*=\s*["']?([\w-]+)/i.exec(prefix)?.[1] ?? 'utf-8';
  if (/^(windows-1251|cp1251)$/i.test(charset)) {
    let text='';
    for(const byte of bytes) text += byte<128?String.fromCharCode(byte):byte<192?cp1251[byte-128]:String.fromCharCode(0x0410+byte-192);
    return text;
  }
  if(!/^(utf-8|utf8|us-ascii)$/i.test(charset))throw new Error('Кодировка страницы не поддерживается: '+charset);
  return strFromU8(bytes);
}
export function parseAcademicPlan(html: string, sourceUrl: string): PlanPreview {
  const url = validatePlanUrl(sourceUrl);
  const doc = parseMarkup(html);
  const tables = elements(doc, 'table');
  const table = tables.find((t) =>
    tableRows(t).some(
      (r) =>
        r.children.some((c) => cleanText(c) === 'Дисциплина') &&
        r.children.some((c) => cleanText(c) === 'Семестр'),
    ),
  );
  if (!table)
    throw new Error(
      'На странице не найдена открытая таблица учебного плана. Проверьте ссылку и доступ без авторизации.',
    );
  const rows = grid(tableRows(table));
  const headerIndex = rows.findIndex((r) => r.includes('Дисциплина') && r.includes('Семестр'));
  const header = rows[headerIndex]!;
  const warnings: string[] = [],
    subjects: Subject[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const get = (name: string) => row[header.indexOf(name)]?.trim() ?? '';
    const name = get('Дисциплина'),
      semester = Number(get('Семестр'));
    if (!name || /ASPx|Блок:/.test(name)) continue;
    if (!Number.isInteger(semester) || semester < 1 || semester > 20) {
      if (/\p{L}/u.test(name))
        warnings.push(`«${name.slice(0, 200)}»: семестр не указан, строка не импортируется.`);
      continue;
    }
    const controlText = get('Контроль'),
      control = controlText.toLowerCase();
    const coursework = /кп|курсовой проект/.test(control)
      ? 'project'
      : /кр|курсовая/.test(control)
        ? 'work'
        : 'none';
    const hours = (column: string) => {
      const s = get(column);
      if (!s) return null;
      const n = Number(s.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 10000) throw new Error(`Некорректные часы: ${name}`);
      return n;
    };
    subjects.push(
      subjectSchema.parse({
        id: `plan-${subjects.length}`,
        name,
        teacher: '',
        semester,
        notes: '',
        coursework,
        control: /экз/.test(control)
          ? coursework === 'none'
            ? 'exam'
            : 'exam_coursework'
          : /зачо|диф|оцен/.test(control)
            ? 'graded_credit'
            : /зач/.test(control)
              ? 'credit'
              : control
                ? 'other'
                : 'none',
        curriculum: {
          sourceUrl: url,
          course: Number(get('Курс')) || Math.ceil(semester / 2),
          totalHours: hours('Всего часов'),
          lectureHours: hours('Лек'),
          practiceHours: hours('Пр'),
          labHours: hours('Лаб'),
          controlText,
        },
      }),
    );
  }
  if (!subjects.length) throw new Error('В таблице нет дисциплин с указанным семестром');
  if (subjects.length > 1000) throw new Error('Слишком большой учебный план');
  const title =
    elements(doc, 'h3')
      .map(cleanText)
      .find((t) => /Учебный план/i.test(t)) ?? 'Учебный план';
  const plain = cleanText(doc);
  const faculty = /Факультет:\s*(.*?)\s*Кафедра:/u.exec(plain)?.[1]?.trim() ?? '';
  const program = plain.split(title)[1]?.split('Факультет:')[0]?.trim().slice(0, 1000) ?? '';
  return {
    plan: { url, title, program, faculty, subjects, importedAt: new Date().toISOString() },
    warnings,
  };
}
// Сетевой ввод отделён от чистого парсера, который можно проверять локальными HTML-образцами.
export async function fetchAcademicPlan(url: string): Promise<PlanPreview> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(validatePlanUrl(url), { signal: controller.signal });
    if (!response.ok) throw new Error(`Сайт вернул ошибку ${response.status}`);
    if (Number(response.headers.get('content-length')) > 5_000_000)
      throw new Error('Страница слишком большая');
    const html = decodePlanHtml(new Uint8Array(await response.arrayBuffer()),response.headers.get('content-type') ?? '');
    if (html.length > 5_000_000) throw new Error('Страница слишком большая');
    return parseAcademicPlan(html, url);
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error('Сайт не ответил за 20 секунд. Повторите позже.');
    if (error instanceof TypeError)
      throw new Error('Не удалось загрузить страницу. Проверьте интернет и доступность сайта.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
