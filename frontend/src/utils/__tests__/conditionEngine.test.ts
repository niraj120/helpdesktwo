/**
 * Unit tests for conditionEngine (US-8)
 *
 * Run with:  cd frontend && npx jest conditionEngine
 */

import { conditionEngine, FormFieldSchema } from '../conditionEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const field = (
  fieldName: string,
  overrides: Partial<FormFieldSchema> = {},
): FormFieldSchema => ({
  fieldName,
  fieldType: 'text',
  ...overrides,
});

// ─── Basic visibility (no conditions) ────────────────────────────────────────

describe('default visibility', () => {
  it('includes all fields when no conditions are set', () => {
    const fields = [field('a'), field('b'), field('c')];
    const { visibleFields } = conditionEngine(fields, {});
    expect([...visibleFields]).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(visibleFields.size).toBe(3);
  });

  it('field with empty conditions array is always visible', () => {
    const fields = [field('x', { conditions: [] })];
    const { visibleFields } = conditionEngine(fields, {});
    expect(visibleFields.has('x')).toBe(true);
  });
});

// ─── Fixed fields ─────────────────────────────────────────────────────────────

describe('isFixed fields', () => {
  it('fixed field is always visible regardless of values', () => {
    const fields = [field('subject', { isFixed: true, required: true })];
    const { visibleFields, requiredFields } = conditionEngine(fields, {});
    expect(visibleFields.has('subject')).toBe(true);
    expect(requiredFields.has('subject')).toBe(true);
  });

  it('fixed field ignores any conditions attached to it', () => {
    const fields = [
      field('subject', {
        isFixed: true,
        // These conditions would hide the field — they should be ignored
        conditions: [{ triggerField: 'type', operator: 'equals', value: 'NEVER' }],
        conditionAction: 'show',
      }),
    ];
    const { visibleFields } = conditionEngine(fields, { type: 'anything' });
    expect(visibleFields.has('subject')).toBe(true);
  });
});

// ─── conditionAction: 'show' ─────────────────────────────────────────────────

describe('conditionAction: show', () => {
  const fields: FormFieldSchema[] = [
    field('details', {
      conditions: [{ triggerField: 'category', operator: 'equals', value: 'billing' }],
      conditionAction: 'show',
    }),
  ];

  it('shows field when condition matches', () => {
    const { visibleFields } = conditionEngine(fields, { category: 'billing' });
    expect(visibleFields.has('details')).toBe(true);
  });

  it('hides field when condition does not match', () => {
    const { visibleFields } = conditionEngine(fields, { category: 'technical' });
    expect(visibleFields.has('details')).toBe(false);
  });

  it('hides field when trigger field is absent', () => {
    const { visibleFields } = conditionEngine(fields, {});
    expect(visibleFields.has('details')).toBe(false);
  });
});

// ─── conditionAction: 'hide' ─────────────────────────────────────────────────

describe('conditionAction: hide', () => {
  const fields: FormFieldSchema[] = [
    field('oldForm', {
      conditions: [{ triggerField: 'isNewUser', operator: 'equals', value: 'true' }],
      conditionAction: 'hide',
    }),
  ];

  it('hides field when condition matches', () => {
    const { visibleFields } = conditionEngine(fields, { isNewUser: 'true' });
    expect(visibleFields.has('oldForm')).toBe(false);
  });

  it('shows field when condition does not match', () => {
    const { visibleFields } = conditionEngine(fields, { isNewUser: 'false' });
    expect(visibleFields.has('oldForm')).toBe(true);
  });
});

// ─── Default conditionAction (missing → 'show') ───────────────────────────────

describe('conditionAction defaults to show', () => {
  it('shows field when condition matches and no conditionAction set', () => {
    const fields: FormFieldSchema[] = [
      field('optional', {
        conditions: [{ triggerField: 'type', operator: 'equals', value: 'x' }],
        // conditionAction intentionally omitted
      }),
    ];
    const { visibleFields } = conditionEngine(fields, { type: 'x' });
    expect(visibleFields.has('optional')).toBe(true);
  });
});

// ─── AND logic (multiple conditions) ─────────────────────────────────────────

describe('AND logic for multiple conditions', () => {
  const fields: FormFieldSchema[] = [
    field('details', {
      conditions: [
        { triggerField: 'cat', operator: 'equals', value: 'billing' },
        { triggerField: 'priority', operator: 'equals', value: 'high' },
      ],
      conditionAction: 'show',
    }),
  ];

  it('shows only when ALL conditions match', () => {
    const { visibleFields } = conditionEngine(fields, { cat: 'billing', priority: 'high' });
    expect(visibleFields.has('details')).toBe(true);
  });

  it('hides when only first condition matches', () => {
    const { visibleFields } = conditionEngine(fields, { cat: 'billing', priority: 'low' });
    expect(visibleFields.has('details')).toBe(false);
  });

  it('hides when only second condition matches', () => {
    const { visibleFields } = conditionEngine(fields, { cat: 'other', priority: 'high' });
    expect(visibleFields.has('details')).toBe(false);
  });

  it('hides when none match', () => {
    const { visibleFields } = conditionEngine(fields, {});
    expect(visibleFields.has('details')).toBe(false);
  });
});

// ─── Operators ───────────────────────────────────────────────────────────────

describe('operators', () => {
  const testOp = (
    operator: FormFieldSchema['conditions'][0]['operator'],
    triggerValue: any,
    condValue: string,
    expectVisible: boolean,
  ) => {
    const fields: FormFieldSchema[] = [
      field('f', {
        conditions: [{ triggerField: 't', operator, value: condValue }],
        conditionAction: 'show',
      }),
    ];
    const { visibleFields } = conditionEngine(fields, { t: triggerValue });
    expect(visibleFields.has('f')).toBe(expectVisible);
  };

  it('equals — match', () => testOp('equals', 'hello', 'hello', true));
  it('equals — no match', () => testOp('equals', 'hello', 'world', false));
  it('equals — case insensitive', () => testOp('equals', 'Hello', 'hello', true));
  it('not_equals — match', () => testOp('not_equals', 'a', 'b', true));
  it('not_equals — no match', () => testOp('not_equals', 'a', 'a', false));
  it('contains — match', () => testOp('contains', 'hello world', 'world', true));
  it('contains — no match', () => testOp('contains', 'hello', 'world', false));
  it('not_contains — match', () => testOp('not_contains', 'hello', 'world', true));
  it('not_contains — no match', () => testOp('not_contains', 'hello world', 'world', false));
  it('is_empty — empty string', () => testOp('is_empty', '', '', true));
  it('is_empty — null', () => testOp('is_empty', null, '', true));
  it('is_empty — not empty', () => testOp('is_empty', 'x', '', false));
  it('is_not_empty — not empty', () => testOp('is_not_empty', 'x', '', true));
  it('is_not_empty — empty', () => testOp('is_not_empty', '', '', false));
  it('greater_than — match', () => testOp('greater_than', 10, '5', true));
  it('greater_than — no match', () => testOp('greater_than', 3, '5', false));
  it('less_than — match', () => testOp('less_than', 3, '5', true));
  it('less_than — no match', () => testOp('less_than', 10, '5', false));

  it('equals with array trigger — any item matches', () => {
    const fields: FormFieldSchema[] = [
      field('f', {
        conditions: [{ triggerField: 't', operator: 'equals', value: 'billing' }],
        conditionAction: 'show',
      }),
    ];
    const { visibleFields } = conditionEngine(fields, { t: ['technical', 'billing'] });
    expect(visibleFields.has('f')).toBe(true);
  });
});

// ─── Required mode ────────────────────────────────────────────────────────────

describe('requiredMode', () => {
  it('requiredMode: always → required when visible', () => {
    const fields = [field('f', { requiredMode: 'always' })];
    const { requiredFields } = conditionEngine(fields, {});
    expect(requiredFields.has('f')).toBe(true);
  });

  it('requiredMode: optional → not required', () => {
    const fields = [field('f', { requiredMode: 'optional' })];
    const { requiredFields } = conditionEngine(fields, {});
    expect(requiredFields.has('f')).toBe(false);
  });

  it('requiredMode: conditional → required when requiredConditions met', () => {
    const fields: FormFieldSchema[] = [
      field('f', {
        requiredMode: 'conditional',
        requiredConditions: [{ triggerField: 'type', operator: 'equals', value: 'urgent' }],
      }),
    ];
    const { requiredFields: req1 } = conditionEngine(fields, { type: 'urgent' });
    expect(req1.has('f')).toBe(true);

    const { requiredFields: req2 } = conditionEngine(fields, { type: 'normal' });
    expect(req2.has('f')).toBe(false);
  });

  it('requiredMode: conditional with no requiredConditions → not required', () => {
    const fields = [field('f', { requiredMode: 'conditional', requiredConditions: [] })];
    const { requiredFields } = conditionEngine(fields, {});
    expect(requiredFields.has('f')).toBe(false);
  });

  it('legacy required: true → treated as requiredMode: always', () => {
    const fields = [field('f', { required: true })];
    const { requiredFields } = conditionEngine(fields, {});
    expect(requiredFields.has('f')).toBe(true);
  });

  it('legacy required: false → not required', () => {
    const fields = [field('f', { required: false })];
    const { requiredFields } = conditionEngine(fields, {});
    expect(requiredFields.has('f')).toBe(false);
  });

  it('hidden field is never required', () => {
    const fields: FormFieldSchema[] = [
      field('f', {
        required: true,
        conditions: [{ triggerField: 'x', operator: 'equals', value: 'yes' }],
        conditionAction: 'show',
      }),
    ];
    // x is not 'yes' → field hidden
    const { visibleFields, requiredFields } = conditionEngine(fields, { x: 'no' });
    expect(visibleFields.has('f')).toBe(false);
    expect(requiredFields.has('f')).toBe(false);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('empty fields array returns empty sets', () => {
    const { visibleFields, requiredFields } = conditionEngine([], {});
    expect(visibleFields.size).toBe(0);
    expect(requiredFields.size).toBe(0);
  });

  it('formValues is empty — fields with no conditions remain visible', () => {
    const fields = [field('a'), field('b')];
    const { visibleFields } = conditionEngine(fields, {});
    expect(visibleFields.size).toBe(2);
  });

  it('unknown operator returns false (field hidden when action=show)', () => {
    const fields: FormFieldSchema[] = [
      field('f', {
        conditions: [
          { triggerField: 't', operator: 'unknown_op' as any, value: 'x' },
        ],
        conditionAction: 'show',
      }),
    ];
    const { visibleFields } = conditionEngine(fields, { t: 'x' });
    expect(visibleFields.has('f')).toBe(false);
  });
});
