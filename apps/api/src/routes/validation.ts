import { z } from 'zod';

export const MAX_DATABASE_ID = 2_147_483_647;
export const MAX_GAMEWEEK_ID = 38;
export const MAX_AVAILABLE_PLAYERS = 100;

export const EmptyQuerySchema = z.object({}).strict();

export const BodyPositiveIdSchema = z.number()
  .finite()
  .int()
  .min(1)
  .max(MAX_DATABASE_ID);

export const BodyGameweekIdSchema = z.number()
  .finite()
  .int()
  .min(1)
  .max(MAX_GAMEWEEK_ID);

export function queryIntegerSchema(min: number, max: number) {
  return z.string()
    .regex(/^(?:0|[1-9]\d*)$/, 'Expected a canonical nonnegative integer')
    .transform(value => Number(value))
    .pipe(z.number().finite().int().min(min).max(max));
}

export const PositiveIdParamSchema = queryIntegerSchema(1, MAX_DATABASE_ID);
export const GameweekIdParamSchema = queryIntegerSchema(1, MAX_GAMEWEEK_ID);

export function hasDuplicateNumbers(values: readonly number[]): boolean {
  return new Set(values).size !== values.length;
}

export function hasDuplicateStrings(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}
