/** Защита изменённой формы при уходе с экрана; после сохранения блокировка снимается явно. */
import { useState } from 'react';
import { usePreventRemove } from 'expo-router';
import { confirm } from './components';
export function useFormGuard(value: unknown) {
  const [initial] = useState(() => JSON.stringify(value));
  const [leaving, setLeaving] = useState(false);
  const disable = usePreventRemove(!leaving && JSON.stringify(value) !== initial, ({ repeat }) => {
    void confirm('Отменить изменения?', 'Несохранённые поля будут сброшены.').then((ok) => {
      if (ok) {
        setLeaving(true);
        repeat();
      }
    });
  });
  // Вызывается после успешного сохранения, чтобы разрешить программный выход из формы.
  return () => {
    setLeaving(true);
    disable();
  };
}
