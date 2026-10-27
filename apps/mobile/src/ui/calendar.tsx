/** Календарь выбора локальной даты в нижней панели. */
import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { localDate } from '../domain/model';
import { Button, Field, IconButton, Label, Row, Sheet, usePalette } from './components';
export function Calendar({
  value,
  onChange,
  visible,
  onClose,
}: {
  value: Date;
  onChange: (date: Date) => void;
  visible: boolean;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1, 12));
  const [year, setYear] = useState(String(value.getFullYear()));
  const c = usePalette();
  const { width } = useWindowDimensions();
  const offset = (month.getDay() + 6) % 7,
    days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const shift = (n: number) => {
    const date = new Date(month.getFullYear(), month.getMonth() + n, 1, 12);
    setMonth(date);
    setYear(String(date.getFullYear()));
  };
  return (
    <Sheet title="Выбрать дату" visible={visible} onClose={onClose}>
      <Row>
        <IconButton name="back" label="Предыдущий месяц" onPress={() => shift(-1)} />
        <Label bold>{month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</Label>
        <IconButton name="next" label="Следующий месяц" onPress={() => shift(1)} />
      </Row>
      <Field
        label="Год (1900–2200)"
        value={year}
        keyboardType="number-pad"
        onChangeText={(v) => {
          setYear(v);
          const n = Number(v);
          if (n >= 1900 && n <= 2200) setMonth(new Date(n, month.getMonth(), 1, 12));
        }}
      />
      <ScrollView horizontal>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            width: Math.max(336, Math.min(width, 760) - 32),
          }}
        >
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
            <View key={day} style={{ width: '14.285%', alignItems: 'center', paddingVertical: 10 }}>
              <Label muted size={13}>
                {day}
              </Label>
            </View>
          ))}
          {Array.from({ length: offset + days }, (_, index) => {
            const day = index - offset + 1;
            const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
            return (
              <Pressable
                key={index}
                disabled={day < 1}
                accessibilityRole="button"
                accessibilityLabel={day < 1 ? '' : date.toLocaleDateString('ru-RU')}
                onPress={() => {
                  onChange(date);
                  onClose();
                }}
                style={{
                  width: '14.285%',
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 10,
                  backgroundColor:
                    day > 0 && localDate(date) === localDate(value) ? c.soft : undefined,
                }}
              >
                <Label bold={day > 0 && localDate(date) === localDate(value)}>
                  {day > 0 ? String(day) : ''}
                </Label>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <Button
        title="Сегодня"
        secondary
        onPress={() => {
          onChange(new Date());
          onClose();
        }}
      />
    </Sheet>
  );
}
