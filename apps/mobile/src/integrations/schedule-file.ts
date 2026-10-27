/** Выбор XLSX, чтение содержимого и освобождение временной копии файла. */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { parseScheduleXlsx } from './xlsx-schedule';
export async function pickSchedule() {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (!asset.name.toLowerCase().endsWith('.xlsx')) throw new Error('Выберите файл .xlsx');
  const file = new File(asset.uri);
  try {
    if (file.size > 5_000_000) throw new Error('Файл больше 5 МБ');
    const rows = parseScheduleXlsx(await file.bytes());
    return { name: asset.name, rows };
  } finally {
    if (file.exists && file.uri.startsWith(Paths.cache.uri)) file.delete();
  }
}
