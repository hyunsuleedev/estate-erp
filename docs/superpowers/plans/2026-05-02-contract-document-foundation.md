# Contract Document Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first contract document foundation from the MySpider taxonomy: richer document type seeds plus reusable office print/clause template APIs.

**Architecture:** Keep `ContractDocumentTemplate` as the document requirement/type registry. Add `OfficePrintTemplate` for cover/receipt/settlement reusable forms and `ContractClauseTemplate` for office-specific contract clauses, special terms, and confirmation text. Implement both inside the existing contracts module and shared API client.

**Tech Stack:** NestJS, Prisma, PostgreSQL JSONB, Jest, TypeScript, pnpm monorepo.

---

### Task 1: Contract Document Template Seed

**Files:**
- Modify: `prisma/schema/migrations/20260502170000_add_contract_documents/migration.sql`
- Test: `apps/server/src/modules/contracts/contracts.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add a test that expects the service to preserve MySpider metadata from DB templates:

```ts
it('returns document templates with MySpider metadata for reusable code mapping', async () => {
  const { prisma, service } = createService();
  prisma.contractDocumentTemplate.findMany.mockResolvedValue([
    {
      id: 'template-1',
      officeId: null,
      code: 'lease_declaration',
      title: '임대차계약 신고서',
      category: 'report',
      transactionTypes: ['jeonse', 'monthly'],
      isRequired: true,
      isActive: true,
      sortOrder: 50,
      metadata: {
        mySpiderCntrClsf: ['44', '47', '49'],
        mySpiderTableName: ['TPCT30S', 'TPCT33S', 'TPCT36S'],
      },
    },
  ]);

  const result = await service.getDocumentTemplates('office-1', {
    transactionType: 'monthly',
  });

  expect(result).toEqual([
    expect.objectContaining({
      code: 'lease_declaration',
      metadata: expect.objectContaining({
        mySpiderCntrClsf: ['44', '47', '49'],
      }),
    }),
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails if metadata/code handling regresses**

Run: `pnpm --filter @estate-erp/server test -- contracts.service.spec.ts`

Expected: PASS after current service, but this protects the seed contract.

- [ ] **Step 3: Update migration seed**

Replace the initial eight `contract_document_templates` seed rows with the MySpider-aligned document type set:

- `base_contract`
- `purchase_right_contract`
- `union_member_right_contract`
- `commercial_premium_contract`
- `right_transfer_contract`
- `right_succession_contract`
- `standard_lease_contract`
- `commercial_standard_lease_contract`
- `house_lease_contract`
- `sublease_contract`
- `sublease_agreement`
- `broker_explanation`
- `broker_explanation_residential`
- `broker_explanation_non_residential`
- `broker_explanation_land`
- `broker_explanation_special`
- `real_estate_transaction_report`
- `real_estate_transaction_cancel_report`
- `house_transaction_report`
- `lease_declaration`
- `lease_change_declaration`
- `renewal_confirmation`
- `guarantee_non_enrollment_agreement`
- `guarantee_partial_enrollment_agreement`
- `jeonse_registration_not_requested`
- `cash_receipt_document`
- `privacy_agreement`
- `identity`
- `registry_document`
- `broker_fee_receipt`

Use `metadata` to store `mySpiderCntrClsf`, `mySpiderTableName`, and `mySpiderService` where known.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @estate-erp/server test -- contracts.service.spec.ts`

Expected: PASS.

### Task 2: Office Print Templates

**Files:**
- Modify: `prisma/schema/crm.prisma`
- Modify: `prisma/schema/office.prisma`
- Create: `prisma/schema/migrations/20260502173000_add_contract_office_templates/migration.sql`
- Modify: `apps/server/src/modules/contracts/contracts.service.ts`
- Modify: `apps/server/src/modules/contracts/contracts.controller.ts`
- Modify: `apps/server/src/modules/contracts/contracts.service.spec.ts`
- Modify: `packages/api-client/src/modules/contracts.ts`
- Modify: `packages/api-client/src/index.ts`

- [ ] **Step 1: Write failing service test**

Add:

```ts
it('creates a reusable office print template and clears the previous default of the same type', async () => {
  const { prisma, service } = createService();
  prisma.officePrintTemplate.updateMany.mockResolvedValue({ count: 1 });
  prisma.officePrintTemplate.create.mockResolvedValue({
    id: 'print-template-1',
    officeId: 'office-1',
    type: 'contract_cover',
    title: '기본 매매 표지',
    isDefault: true,
  });

  await (service as any).createPrintTemplate('office-1', 'user-1', {
    type: 'contract_cover',
    title: '기본 매매 표지',
    transactionTypes: ['sale'],
    isDefault: true,
    data: { includedDocuments: ['계약서 1부'] },
  });

  expect(prisma.officePrintTemplate.updateMany).toHaveBeenCalledWith({
    where: { officeId: 'office-1', type: 'contract_cover', isDefault: true },
    data: { isDefault: false },
  });
  expect(prisma.officePrintTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        officeId: 'office-1',
        type: 'contract_cover',
        title: '기본 매매 표지',
        transactionTypes: ['sale'],
        isDefault: true,
        createdById: 'user-1',
      }),
    }),
  );
});
```

- [ ] **Step 2: Add Prisma model**

Create `OfficePrintTemplate` with `officeId`, `type`, `title`, `transactionTypes`, `isDefault`, `isActive`, `data JsonB`, `createdById`, timestamps, and Office/User relations.

- [ ] **Step 3: Add migration**

Create `office_print_templates` table, indexes on `[office_id, type, is_active]`, and foreign keys to `offices` and `users`.

- [ ] **Step 4: Implement service/controller/API client**

Add endpoints:

- `GET /contracts/print-templates`
- `POST /contracts/print-templates`
- `PATCH /contracts/print-templates/:templateId`

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter @estate-erp/server prisma:generate
pnpm --filter @estate-erp/server test -- contracts.service.spec.ts
pnpm --filter @estate-erp/server typecheck
pnpm --filter @estate-erp/api-client typecheck
```

Expected: all pass.

### Task 3: Contract Clause Templates

**Files:**
- Modify: `prisma/schema/crm.prisma`
- Modify: `prisma/schema/office.prisma`
- Modify: `prisma/schema/migrations/20260502173000_add_contract_office_templates/migration.sql`
- Modify: `apps/server/src/modules/contracts/contracts.service.ts`
- Modify: `apps/server/src/modules/contracts/contracts.controller.ts`
- Modify: `apps/server/src/modules/contracts/contracts.service.spec.ts`
- Modify: `packages/api-client/src/modules/contracts.ts`
- Modify: `packages/api-client/src/index.ts`

- [ ] **Step 1: Write failing service test**

Add:

```ts
it('creates a reusable contract clause template scoped to office and transaction type', async () => {
  const { prisma, service } = createService();
  prisma.contractClauseTemplate.create.mockResolvedValue({
    id: 'clause-template-1',
    officeId: 'office-1',
    type: 'special_terms_clause',
    title: '기본 누수 특약',
  });

  await (service as any).createClauseTemplate('office-1', 'user-1', {
    type: 'special_terms_clause',
    contractKind: 'base_contract',
    transactionTypes: ['monthly'],
    title: '기본 누수 특약',
    content: '누수 발생 시 수리 책임은 당사자 협의에 따른다.',
    isDefault: false,
    sortOrder: 10,
  });

  expect(prisma.contractClauseTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        officeId: 'office-1',
        type: 'special_terms_clause',
        contractKind: 'base_contract',
        transactionTypes: ['monthly'],
        title: '기본 누수 특약',
        content: '누수 발생 시 수리 책임은 당사자 협의에 따른다.',
        createdById: 'user-1',
      }),
    }),
  );
});
```

- [ ] **Step 2: Add Prisma model**

Create `ContractClauseTemplate` with `officeId`, `type`, `contractKind`, `transactionTypes`, `title`, `content`, `isDefault`, `isActive`, `sortOrder`, `createdById`, timestamps, and Office/User relations.

- [ ] **Step 3: Add endpoints**

Add:

- `GET /contracts/clause-templates`
- `POST /contracts/clause-templates`
- `PATCH /contracts/clause-templates/:templateId`

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @estate-erp/server prisma:generate
pnpm --filter @estate-erp/server test -- contracts.service.spec.ts
pnpm --filter @estate-erp/server typecheck
pnpm --filter @estate-erp/api-client typecheck
```

Expected: all pass.

## Self-review

- Spec coverage: This plan implements document type seed alignment, office print templates, and office clause templates. It does not implement the later regulated document detail tables; those remain separate follow-up work.
- Placeholder scan: No placeholder code paths are required.
- Type consistency: The service names are `createPrintTemplate`, `updatePrintTemplate`, `listPrintTemplates`, `createClauseTemplate`, `updateClauseTemplate`, and `listClauseTemplates`.
