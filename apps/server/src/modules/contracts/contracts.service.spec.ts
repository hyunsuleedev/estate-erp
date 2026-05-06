import { ContractsService } from './contracts.service';

describe('ContractsService', () => {
  function createService() {
    const prisma = {
      contract: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      deal: {
        findFirst: jest.fn(),
      },
      contractDocumentTemplate: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      contractDocument: {
        create: jest.fn(),
      },
      officePrintTemplate: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      contractClauseTemplate: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    return {
      prisma,
      service: new ContractsService(prisma as never),
    };
  }

  it('enriches contracts with required document checklist progress', async () => {
    const { prisma, service } = createService();

    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      officeId: 'office-1',
      transactionType: 'monthly',
      attachments: [],
      documents: [
        {
          id: 'document-1',
          status: 'generated',
          templateId: 'template-contract',
          template: {
            id: 'template-contract',
            title: '임대차계약서',
          },
        },
      ],
    });
    prisma.contractDocumentTemplate.findMany.mockResolvedValue([
      {
        id: 'template-contract',
        officeId: null,
        code: 'lease_contract',
        title: '임대차계약서',
        isRequired: true,
        sortOrder: 10,
      },
      {
        id: 'template-identity',
        officeId: null,
        code: 'identity',
        title: '신분증',
        isRequired: true,
        sortOrder: 20,
      },
      {
        id: 'template-report',
        officeId: null,
        code: 'lease_report',
        title: '임대차 신고서',
        isRequired: true,
        sortOrder: 30,
      },
    ]);

    const result = await service.findOne('contract-1', 'office-1');

    expect(result.documentCount).toBe(1);
    expect(result.requiredDocuments).toEqual([
      '임대차계약서',
      '신분증',
      '임대차 신고서',
    ]);
    expect(result.missingDocumentCount).toBe(2);
    expect(result.missingDocuments).toEqual(['신분증', '임대차 신고서']);
  });

  it('creates a contract document only after verifying contract ownership', async () => {
    const { prisma, service } = createService();

    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      officeId: 'office-1',
    });
    prisma.contractDocumentTemplate.findFirst.mockResolvedValue({
      id: 'template-contract',
      officeId: null,
      title: '임대차계약서',
      category: 'contract',
    });
    prisma.contractDocument.create.mockResolvedValue({
      id: 'document-1',
      contractId: 'contract-1',
      officeId: 'office-1',
      title: '임대차계약서',
    });

    const result = await (service as any).createDocument(
      'contract-1',
      'office-1',
      'user-1',
      {
        templateId: 'template-contract',
        type: 'generated',
        category: 'contract',
        title: '임대차계약서',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'document-1',
        contractId: 'contract-1',
      }),
    );
    expect(prisma.contract.findFirst).toHaveBeenCalledWith({
      where: { id: 'contract-1', officeId: 'office-1' },
      select: { id: true },
    });
    expect(prisma.contractDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          officeId: 'office-1',
          contractId: 'contract-1',
          templateId: 'template-contract',
          generatedById: 'user-1',
          type: 'generated',
          category: 'contract',
          title: '임대차계약서',
        }),
      }),
    );
  });

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

  it('accepts all seven contract transaction types when creating a contract', async () => {
    const allowed = [
      'sale',
      'jeonse',
      'monthly',
      'exchange',
      'sublease',
      'transfer',
      'succession',
    ];

    for (const transactionType of allowed) {
      const { prisma, service } = createService();

      prisma.deal.findFirst.mockResolvedValue({
        id: 'deal-1',
        officeId: 'office-1',
        transactionType: 'sale',
        agreedPrice: 50000,
        agreedDeposit: null,
        agreedMonthlyRent: null,
        listing: { transactionType: 'sale', price: 50000, deposit: null, monthlyRent: null },
        buyerContact: {},
        sellerContact: {},
        buyerContactId: 'buyer-1',
        sellerContactId: 'seller-1',
        contract: null,
        specialTerms: null,
      });
      prisma.contract.create.mockResolvedValue({
        id: 'contract-1',
        officeId: 'office-1',
        transactionType,
        attachments: [],
        documents: [],
      });
      prisma.contractDocumentTemplate.findMany.mockResolvedValue([]);

      await (service as any).create('office-1', {
        dealId: 'deal-1',
        transactionType,
        totalPrice: 50000,
      });

      expect(prisma.contract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ transactionType }),
        }),
      );
    }
  });

  it('rejects unknown contract transaction types', async () => {
    const { prisma, service } = createService();

    prisma.deal.findFirst.mockResolvedValue({
      id: 'deal-1',
      officeId: 'office-1',
      transactionType: 'sale',
      agreedPrice: 50000,
      agreedDeposit: null,
      agreedMonthlyRent: null,
      listing: { transactionType: 'sale', price: 50000, deposit: null, monthlyRent: null },
      buyerContact: {},
      sellerContact: {},
      buyerContactId: 'buyer-1',
      sellerContactId: 'seller-1',
      contract: null,
      specialTerms: null,
    });

    await expect(
      (service as any).create('office-1', {
        dealId: 'deal-1',
        transactionType: 'gift',
        totalPrice: 50000,
      }),
    ).rejects.toThrow(/허용되지 않은 계약 거래유형/);

    expect(prisma.contract.create).not.toHaveBeenCalled();
  });
});
