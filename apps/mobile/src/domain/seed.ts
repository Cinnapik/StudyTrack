/** Исходный набор дисциплин для отдельной операции заполнения журнала; не используется как профиль пользователя. */
import type { Subject } from './model';
export const personalSubjects: {
  name: string;
  teacher: string;
  control: Subject['control'];
  count: number;
  coursework?: Subject['coursework'];
}[] = [
  { name: 'Педагогика высшей школы', teacher: 'Тестовый преподаватель', control: 'exam', count: 8 },
  {
    name: 'Моделирование и анализ программного обеспечения',
    teacher: '',
    control: 'credit',
    count: 8,
  },
  { name: 'Алгоритмы и структуры данных', teacher: 'Тестовый преподаватель', control: 'exam', count: 0 },
  {
    name: 'Параллельное программирование',
    teacher: 'Тестовый преподаватель',
    control: 'exam',
    count: 0,
    coursework: 'unknown',
  },
  {
    name: 'Иностранный язык в профессиональной сфере',
    teacher: 'Тестовый преподаватель',
    control: 'credit',
    count: 0,
  },
  { name: 'Системы обработки данных', teacher: 'Тестовый преподаватель', control: 'credit', count: 1 },
  {
    name: 'Программирование клиент-серверных приложений',
    teacher: 'Тестовый преподаватель',
    control: 'exam',
    count: 6,
  },
  { name: 'Технология .NET', teacher: 'Тестовый преподаватель', control: 'credit', count: 0 },
];
