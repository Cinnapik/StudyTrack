/** Выбор резервной копии и передача JSON/CSV через системные файловые средства. */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
export async function shareBackup(content: string, extension: 'json' | 'csv') {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('На устройстве недоступна передача файлов');
  const file = new File(Paths.cache, `studytrack-export.${extension}`);
  try {
    file.create({ overwrite: true });
    file.write(content);
    await Sharing.shareAsync(file.uri, {
      mimeType: extension === 'json' ? 'application/json' : 'text/csv',
      dialogTitle: 'Сохранить резервную копию StudyTrack',
    });
  } finally {
    if (file.exists) file.delete();
  }
}
export async function pickBackup(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const file = new File(asset.uri);
  try {
    if (file.size > 20_000_000) throw new Error('Файл слишком большой (максимум 20 МБ)');
    return await file.text();
  } finally {
    if (file.exists && file.uri.startsWith(Paths.cache.uri)) file.delete();
  }
}
