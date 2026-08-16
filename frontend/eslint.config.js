// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-config-prettier');

/**
 * Flat config for the frontend.
 *
 * Two blocks, because Angular lints TypeScript and templates with different
 * parsers: `**\/*.ts` for components and services, `**\/*.html` for their
 * templates. `processInlineTemplates` extends the template rules to templates
 * written inline in a decorator — there are none today, and this keeps it that
 * way rather than leaving a gap if one is added.
 *
 * Deliberately NOT type-aware (`recommended`, not `recommendedTypeChecked`).
 * tsconfig.json already sets strict, noImplicitReturns, noImplicitOverride,
 * noPropertyAccessFromIndexSignature and strictTemplates, and `npm run build`
 * enforces all of it in CI — so the type-aware rules would mostly re-prove what
 * the compiler has already proved, at a large cost in lint time.
 *
 * The accessibility preset is not enabled. It flags exactly two sites today —
 * the confirm dialog's backdrop and the admin sidebar's scrim — and both need a
 * UI decision rather than a lint fix. Turning it on belongs with that work.
 */
module.exports = tseslint.config(
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
      // Last, so anything stylistic loses to Prettier rather than fighting it.
      prettier,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended],
    rules: {},
  },
);
