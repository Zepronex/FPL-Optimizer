## Summary

-

## Validation

- [ ] `pnpm.cmd run build` passes
- [ ] `pnpm.cmd run test:api` passes for API or optimizer changes
- [ ] `pnpm.cmd run test:smoke` passes for smoke-helper changes
- [ ] `pnpm.cmd run pipeline:test` passes for pipeline changes
- [ ] `pnpm.cmd run model:test` passes for expected-points model changes
- [ ] `pnpm.cmd run security:check` passes for security-sensitive or dependency changes
- [ ] No secrets, local `.env` files, service account files, or database dumps are committed
- [ ] Model-performance claims are supported by current evaluation artifacts
- [ ] UI changes preserve React escaping and avoid embedding server-only configuration
- [ ] Docs are updated when setup, architecture, data contracts, or reviewer workflows change
