import { ConstraintValidationResult } from './types';

export class OptimizerInputError extends Error {
  constructor(
    public readonly code: string,
    public readonly validation: ConstraintValidationResult
  ) {
    super(code);
    this.name = 'OptimizerInputError';
  }
}
