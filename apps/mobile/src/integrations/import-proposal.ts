/** Проверка входного JSON по общему контракту перед созданием черновика импорта. */
import { importProposalSchema } from '../../../../packages/contracts/src';
export function parseImportProposal(value: string) {
  return importProposalSchema.parse(JSON.parse(value));
}
