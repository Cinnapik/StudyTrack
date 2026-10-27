/** Общий контракт предложения импорта. Из этой схемы генерируется JSON Schema. */
import { z } from 'zod';
const optionalText = z.string().max(3000).nullish();
export const importProposalSchema = z.object({
  documentType: z.enum(['curriculum', 'timetable', 'subject_list', 'unknown']),
  subjects: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        teacher: optionalText,
        control: z.enum(['exam', 'credit', 'graded_credit', 'none']).nullish(),
        coursework: z.boolean().nullish(),
        semester: z.number().int().min(1).max(20).nullish(),
        totalHours: z.number().int().min(0).max(10000).nullish(),
        needsReview: z.boolean(),
        raw: optionalText,
      }),
    )
    .max(100),
  lessons: z
    .array(
      z.object({
        subjectName: z.string().trim().min(1).max(200),
        weekday: z.number().int().min(1).max(7).nullish(),
        date: z.iso.date().nullish(),
        start: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullish(),
        end: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullish(),
        needsReview: z.boolean(),
        raw: optionalText,
      }),
    )
    .max(200),
  warnings: z.array(z.string().max(3000)).max(100),
});
export type ImportProposal = z.infer<typeof importProposalSchema>;
