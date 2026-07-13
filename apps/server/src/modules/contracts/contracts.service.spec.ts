import { ContractsService } from './contracts.service';
import { createResidentialSaleAgreementDraft } from '@estate-erp/shared';

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
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      contractDocumentRevision: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      officePrintTemplate: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      contractClauseTemplate: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));

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
    expect(result.requiredDocuments).toEqual(['임대차계약서', '신분증', '임대차 신고서']);
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

    const result = await (service as any).createDocument('contract-1', 'office-1', 'user-1', {
      templateId: 'template-contract',
      type: 'generated',
      category: 'contract',
      title: '임대차계약서',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'document-1',
        contractId: 'contract-1',
      }),
    );
    expect(prisma.contract.findFirst).toHaveBeenCalledWith({
      where: { id: 'contract-1', officeId: 'office-1' },
      select: { id: true, transactionType: true },
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

  it('deletes an office print template after verifying office ownership', async () => {
    const { prisma, service } = createService();

    prisma.officePrintTemplate.findFirst.mockResolvedValue({
      id: 'print-template-1',
      isDefault: false,
    });
    prisma.officePrintTemplate.delete.mockResolvedValue({
      id: 'print-template-1',
    });

    await service.removePrintTemplate('print-template-1', 'office-1');

    expect(prisma.officePrintTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 'print-template-1', officeId: 'office-1' },
      select: { id: true, isDefault: true },
    });
    expect(prisma.officePrintTemplate.delete).toHaveBeenCalledWith({
      where: { id: 'print-template-1' },
    });
  });

  it('refuses to delete a default print template', async () => {
    const { prisma, service } = createService();

    prisma.officePrintTemplate.findFirst.mockResolvedValue({
      id: 'print-template-1',
      isDefault: true,
    });

    await expect(service.removePrintTemplate('print-template-1', 'office-1')).rejects.toThrow(
      /기본 템플릿은 삭제할 수 없습니다/,
    );
    expect(prisma.officePrintTemplate.delete).not.toHaveBeenCalled();
  });

  it('rejects deleting a print template owned by another office', async () => {
    const { prisma, service } = createService();

    prisma.officePrintTemplate.findFirst.mockResolvedValue(null);

    await expect(service.removePrintTemplate('print-template-1', 'other-office')).rejects.toThrow(
      'Office print template not found',
    );
    expect(prisma.officePrintTemplate.delete).not.toHaveBeenCalled();
  });

  it('deletes a clause template but protects default templates', async () => {
    const { prisma, service } = createService();

    prisma.contractClauseTemplate.findFirst
      .mockResolvedValueOnce({ id: 'clause-template-1', isDefault: false })
      .mockResolvedValueOnce({ id: 'clause-template-2', isDefault: true });
    prisma.contractClauseTemplate.delete.mockResolvedValue({
      id: 'clause-template-1',
    });

    await service.removeClauseTemplate('clause-template-1', 'office-1');

    expect(prisma.contractClauseTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 'clause-template-1', officeId: 'office-1' },
      select: { id: true, isDefault: true },
    });
    expect(prisma.contractClauseTemplate.delete).toHaveBeenCalledWith({
      where: { id: 'clause-template-1' },
    });

    await expect(service.removeClauseTemplate('clause-template-2', 'office-1')).rejects.toThrow(
      /기본 템플릿은 삭제할 수 없습니다/,
    );
    expect(prisma.contractClauseTemplate.delete).toHaveBeenCalledTimes(1);
  });

  it('accepts all seven contract transaction types when creating a contract', async () => {
    const allowed = ['sale', 'jeonse', 'monthly', 'exchange', 'sublease', 'transfer', 'succession'];

    for (const transactionType of allowed) {
      const { prisma, service } = createService();

      prisma.deal.findFirst.mockResolvedValue({
        id: 'deal-1',
        officeId: 'office-1',
        transactionType: 'sale',
        agreedPrice: 50000,
        agreedDeposit: null,
        agreedMonthlyRent: null,
        listing: {
          transactionType: 'sale',
          price: 50000,
          deposit: null,
          monthlyRent: null,
        },
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
      listing: {
        transactionType: 'sale',
        price: 50000,
        deposit: null,
        monthlyRent: null,
      },
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

  it('prepares a residential sale agreement draft from contract relations', async () => {
    const { prisma, service } = createService();

    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      officeId: 'office-1',
      transactionType: 'sale',
      totalPrice: 158000,
      statedDeposit: 15000,
      statedInterimPayment: 30000,
      statedInterimDate: new Date('2026-08-01T00:00:00.000Z'),
      statedBalance: 113000,
      statedBalanceDate: new Date('2026-09-01T00:00:00.000Z'),
      contractDate: new Date('2026-07-20T00:00:00.000Z'),
      moveInDate: new Date('2026-09-01T00:00:00.000Z'),
      specialTerms: '현 시설 상태에서 인도한다.',
      office: {
        id: 'office-1',
        name: '우리동네 중개사무소',
        licenseNo: '11740-2026-00001',
        ceoName: '김중개',
        phone: '02-123-4567',
        address: '서울 강동구',
      },
      buyerContact: {
        id: 'buyer-1',
        name: '박매수',
        phones: [{ phone: '010-2222-3333' }],
      },
      sellerContact: {
        id: 'seller-1',
        name: '이매도',
        phones: [{ phone: '010-1111-2222' }],
      },
      deal: {
        listing: {
          property: {
            site: {
              name: '고덕그라시움',
              roadAddress: '서울 강동구 고덕로 333',
              jibunAddress: '서울 강동구 고덕동 693',
              metadata: {
                landCategory: '대',
                landAreaM2: 50000,
                buildingStructure: '철근콘크리트조',
                mainUse: '공동주택',
              },
            },
            unit: {
              name: '1201호',
              exclusiveAreaM2: null,
              dong: { name: '101', isPlaceholder: false },
              siteUnitType: { exclusiveAreaM2: 84.9 },
            },
          },
        },
      },
      documents: [],
    });
    prisma.contractDocumentTemplate.findMany.mockResolvedValue([
      {
        id: 'base-template',
        officeId: null,
        code: 'base_contract',
        title: '부동산 매매계약서',
        category: 'contract',
        transactionTypes: ['sale'],
        isRequired: true,
        isActive: true,
        sortOrder: 10,
        metadata: {},
      },
    ]);
    prisma.contractDocument.create.mockImplementation(async ({ data }) => ({
      id: 'document-1',
      ...data,
    }));
    prisma.contractDocumentRevision.findFirst.mockResolvedValue(null);
    prisma.contractDocumentRevision.create.mockImplementation(async ({ data }) => ({
      id: 'revision-1',
      ...data,
    }));

    const result = await service.prepareSaleContractDraft('contract-1', 'office-1', 'user-1', {
      rightsTransferDetails: '잔금과 동시에 말소 및 이전한다.',
    });

    const createCall = prisma.contractDocument.create.mock.calls[0]?.[0];
    const revisionCall = prisma.contractDocumentRevision.create.mock.calls[0]?.[0];
    const agreement = revisionCall.data.payload.contractAgreement;
    expect(createCall.data).toEqual(
      expect.objectContaining({
        templateId: 'base-template',
        status: 'draft',
        generatedById: 'user-1',
        metadata: {},
      }),
    );
    expect(revisionCall.data).toEqual(
      expect.objectContaining({
        officeId: 'office-1',
        documentId: 'document-1',
        revisionNo: 1,
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        createdBy: 'user-1',
      }),
    );
    expect(agreement).toEqual(
      expect.objectContaining({
        actualAgreementAt: '2026-07-20',
        property: expect.objectContaining({
          roadAddress: '서울 강동구 고덕로 333',
          targetDescription: '고덕그라시움 101동 1201호',
          buildingAreaM2: 84.9,
        }),
        payment: expect.objectContaining({
          totalPriceManwon: 158000,
          balanceManwon: 113000,
          balanceDueAt: '2026-09-01',
        }),
        sellers: [expect.objectContaining({ name: '이매도', phone: '010-1111-2222' })],
        buyers: [expect.objectContaining({ name: '박매수', phone: '010-2222-3333' })],
        brokerage: expect.objectContaining({
          officeName: '우리동네 중개사무소',
          registrationNo: '11740-2026-00001',
          representativeName: '김중개',
        }),
      }),
    );
    expect(agreement.sellers[0]).not.toHaveProperty('identificationNo');
    expect(result.revision).toEqual(expect.objectContaining({ id: 'revision-1', revisionNo: 1 }));
    expect(result.validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'sellers.0.address' }),
        expect.objectContaining({ path: 'buyers.0.address' }),
      ]),
    );
  });

  it('preserves existing structured sale agreement metadata and overrides selected fields', async () => {
    const { prisma, service } = createService();
    const existingAgreement = createResidentialSaleAgreementDraft({
      actualAgreementAt: '2026-07-20',
      property: {
        roadAddress: '기존 주소',
        targetDescription: '기존 부동산 표시',
      },
      payment: { totalPriceManwon: 100000, balanceDueAt: '2026-09-01' },
      seller: { name: '기존 매도인', address: '매도인 주소' },
      buyer: { name: '기존 매수인', address: '매수인 주소' },
      brokerage: {
        officeName: '기존 사무소',
        registrationNo: '등록-1',
        representativeName: '대표자',
      },
    });

    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      officeId: 'office-1',
      transactionType: 'sale',
      documents: [
        {
          id: 'document-1',
          status: 'draft',
          metadata: {
            editorState: { zoom: 90 },
            contractAgreement: existingAgreement,
          },
          template: { code: 'base_contract' },
        },
      ],
    });
    prisma.contractDocumentTemplate.findMany.mockResolvedValue([
      {
        id: 'base-template',
        officeId: null,
        code: 'base_contract',
        title: '부동산 매매계약서',
        category: 'contract',
        sortOrder: 10,
      },
    ]);
    prisma.contractDocumentRevision.findFirst.mockResolvedValue({
      id: 'revision-3',
      officeId: 'office-1',
      documentId: 'document-1',
      revisionNo: 3,
      contentHash: 'previous-hash',
      payload: {
        editorState: { zoom: 90 },
        contractAgreement: existingAgreement,
      },
    });
    prisma.contractDocumentRevision.create.mockImplementation(async ({ data }) => ({
      id: 'revision-1',
      ...data,
    }));

    await service.prepareSaleContractDraft('contract-1', 'office-1', 'user-1', {
      conditions: '잔금 지급과 동시에 인도한다.',
      specialTerms: '누수 특약을 확인한다.',
    });

    const metadata = prisma.contractDocumentRevision.create.mock.calls[0]?.[0].data.payload;
    expect(prisma.contractDocument.update).not.toHaveBeenCalled();
    expect(prisma.contractDocumentRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revisionNo: 4 }) }),
    );
    expect(metadata.editorState).toEqual({ zoom: 90 });
    expect(metadata.contractAgreement).toEqual(
      expect.objectContaining({
        property: expect.objectContaining({ roadAddress: '기존 주소' }),
        sellers: [expect.objectContaining({ name: '기존 매도인' })],
        transfer: expect.objectContaining({
          conditions: '잔금 지급과 동시에 인도한다.',
        }),
        specialTerms: '누수 특약을 확인한다.',
      }),
    );
  });

  it('rejects completing a structured sale contract document with validation errors', async () => {
    const { prisma, service } = createService();
    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      transactionType: 'sale',
    });
    prisma.contractDocumentTemplate.findFirst.mockResolvedValue({
      id: 'base-template',
      officeId: null,
      code: 'base_contract',
      title: '부동산 매매계약서',
      category: 'contract',
    });

    const incompleteAgreement = createResidentialSaleAgreementDraft();
    await expect(
      service.createDocument('contract-1', 'office-1', 'user-1', {
        templateId: 'base-template',
        status: 'generated',
        metadata: { contractAgreement: incompleteAgreement } as never,
      }),
    ).rejects.toThrow(/매매계약서 필수 항목/);
    expect(prisma.contractDocument.create).not.toHaveBeenCalled();

    prisma.contractDocument.create.mockResolvedValue({ id: 'document-1' });
    await expect(
      service.createDocument('contract-1', 'office-1', 'user-1', {
        templateId: 'base-template',
        status: 'draft',
        metadata: { contractAgreement: incompleteAgreement } as never,
      }),
    ).resolves.toEqual({ id: 'document-1' });
  });

  it('validates the structured metadata stored on the current sale contract draft', async () => {
    const { prisma, service } = createService();
    const agreement = createResidentialSaleAgreementDraft({
      actualAgreementAt: '2026-07-20',
      property: {
        roadAddress: '서울 강동구 고덕로 333',
        targetDescription: '고덕그라시움 101동 1201호',
      },
      payment: {
        totalPriceManwon: 100000,
        depositManwon: 10000,
        balanceManwon: 90000,
        balanceDueAt: '2026-09-01',
      },
      transfer: {
        deliveryAt: '2026-09-01',
        ownershipTransferAt: '2026-09-01',
        rightsTransferDetails: '잔금과 동시에 이전한다.',
        explanationDeliveredAt: '2026-07-20',
      },
      seller: { name: '이매도', address: '서울 강동구' },
      buyer: { name: '박매수', address: '서울 송파구' },
      brokerage: {
        officeName: '우리동네 중개사무소',
        registrationNo: '11740-2026-00001',
        representativeName: '김중개',
      },
    });
    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      transactionType: 'sale',
      documents: [
        {
          id: 'document-1',
          status: 'draft',
          metadata: { contractAgreement: agreement },
          template: { code: 'base_contract' },
        },
      ],
    });
    prisma.contractDocumentRevision.findFirst.mockResolvedValue(null);

    const result = await service.validateSaleContractDraft('contract-1', 'office-1');

    expect(result.isReadyForGeneration).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a signed transition when an existing structured sale draft is incomplete', async () => {
    const { prisma, service } = createService();
    prisma.contractDocument.findFirst.mockResolvedValue({
      id: 'document-1',
      status: 'draft',
      metadata: {
        contractAgreement: createResidentialSaleAgreementDraft(),
      },
      template: { code: 'base_contract' },
      contract: { transactionType: 'sale' },
    });

    await expect(
      service.updateDocument('contract-1', 'document-1', 'office-1', {
        status: 'signed',
      }),
    ).rejects.toThrow(/매매계약서 필수 항목/);
    expect(prisma.contractDocument.update).not.toHaveBeenCalled();
  });

  it('applies only the exact reviewed revision and records the human decision', async () => {
    const { prisma, service } = createService();
    const payload = { editorState: { zoom: 90 } };
    prisma.contractDocument.findFirst.mockResolvedValue({
      id: 'document-1',
      status: 'draft',
      currentRevisionId: 'revision-1',
      template: { code: 'base_contract' },
      contract: { transactionType: 'sale' },
    });
    prisma.contractDocumentRevision.findFirst.mockResolvedValue({
      id: 'revision-2',
      officeId: 'office-1',
      documentId: 'document-1',
      revisionNo: 2,
      contentHash: 'a'.repeat(64),
      payload,
    });
    prisma.contractDocument.update.mockResolvedValue({
      id: 'document-1',
      currentRevisionId: 'revision-2',
      metadata: payload,
    });
    prisma.contractDocumentRevision.update.mockImplementation(async ({ data }) => ({
      id: 'revision-2',
      ...data,
    }));

    const result = await service.applyRevision(
      'document-1',
      'revision-2',
      'office-1',
      'owner-1',
      'a'.repeat(64),
    );

    expect(prisma.contractDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'document-1', officeId: 'office-1' } }),
    );
    expect(prisma.contractDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'document-1' },
        data: { metadata: payload, currentRevisionId: 'revision-2' },
      }),
    );
    expect(prisma.contractDocumentRevision.update).toHaveBeenCalledWith({
      where: { id: 'revision-2' },
      data: { appliedBy: 'owner-1', appliedAt: expect.any(Date) },
    });
    expect(result.revision).toEqual(expect.objectContaining({ appliedBy: 'owner-1' }));
  });

  it('does not apply a revision when the reviewed content hash is stale', async () => {
    const { prisma, service } = createService();
    prisma.contractDocument.findFirst.mockResolvedValue({
      id: 'document-1',
      status: 'draft',
      currentRevisionId: 'revision-1',
      template: { code: 'base_contract' },
      contract: { transactionType: 'sale' },
    });
    prisma.contractDocumentRevision.findFirst.mockResolvedValue({
      id: 'revision-2',
      officeId: 'office-1',
      documentId: 'document-1',
      revisionNo: 2,
      contentHash: 'a'.repeat(64),
      payload: {},
    });

    await expect(
      service.applyRevision(
        'document-1',
        'revision-2',
        'office-1',
        'owner-1',
        'b'.repeat(64),
      ),
    ).rejects.toThrow(/내용 해시가 일치하지 않습니다/);

    expect(prisma.contractDocument.update).not.toHaveBeenCalled();
    expect(prisma.contractDocumentRevision.update).not.toHaveBeenCalled();
  });

  it('does not apply an exact revision while mandatory contract fields are invalid', async () => {
    const { prisma, service } = createService();
    prisma.contractDocument.findFirst.mockResolvedValue({
      id: 'document-1',
      status: 'draft',
      currentRevisionId: null,
      template: { code: 'base_contract' },
      contract: { transactionType: 'sale' },
    });
    prisma.contractDocumentRevision.findFirst.mockResolvedValue({
      id: 'revision-1',
      officeId: 'office-1',
      documentId: 'document-1',
      revisionNo: 1,
      contentHash: 'a'.repeat(64),
      payload: {
        contractAgreement: createResidentialSaleAgreementDraft(),
      },
    });

    await expect(
      service.applyRevision(
        'document-1',
        'revision-1',
        'office-1',
        'owner-1',
        'a'.repeat(64),
      ),
    ).rejects.toThrow(/필수 항목/);

    expect(prisma.contractDocument.update).not.toHaveBeenCalled();
  });

  it('does not apply a reviewed revision after a newer revision exists', async () => {
    const { prisma, service } = createService();
    prisma.contractDocument.findFirst.mockResolvedValue({
      id: 'document-1',
      status: 'draft',
      currentRevisionId: 'revision-1',
      template: { code: 'base_contract' },
      contract: { transactionType: 'sale' },
    });
    prisma.contractDocumentRevision.findFirst
      .mockResolvedValueOnce({
        id: 'revision-2',
        officeId: 'office-1',
        documentId: 'document-1',
        revisionNo: 2,
        contentHash: 'a'.repeat(64),
        payload: {},
      })
      .mockResolvedValueOnce({ id: 'revision-3', revisionNo: 3 });

    await expect(
      service.applyRevision(
        'document-1',
        'revision-2',
        'office-1',
        'owner-1',
        'a'.repeat(64),
      ),
    ).rejects.toThrow(/더 최신 계약서 revision/);

    expect(prisma.contractDocument.update).not.toHaveBeenCalled();
    expect(prisma.contractDocumentRevision.update).not.toHaveBeenCalled();
  });
});
