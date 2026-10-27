/** Генерация JSON Schema из TypeScript-контракта; результат не следует редактировать вручную. */
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { importProposalSchema } from '../packages/contracts/src';
const schema = z.toJSONSchema(importProposalSchema);
// Preserve optional evidence fields; no cloud structured-output transformation is needed.
writeFileSync('packages/contracts/import.schema.json', JSON.stringify(schema, null, 2) + '\n');
