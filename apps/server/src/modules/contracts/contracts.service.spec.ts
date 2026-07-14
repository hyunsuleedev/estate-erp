import { ContractsService } from './contracts.service';
import { decryptContractPartyField } from './contract-party-crypto.util';
import type { ReplaceContractPartiesDto } from './dto/contract-party.dto';

describe('ContractsService', () => {
  function createService() {
    const prisma: any = {
      contract: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      deal: {
        findFirst: jest.fn(),
      },
      contact: {
        count: jest.fn(),
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
        delete: jest.fn(),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _max: { sortOrder: null, kindOrder: null } }),
      },
      contractParty: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
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

    prisma.$transaction = jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    );

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
    // report 문서 없음 → 거래신고 상태 'none'
    expect((result as any).transactionReportStatus).toBe('none');
  });

  it('rolls up transaction report status from report documents (레거시 TRAN_REPT_CLSF)', async () => {
    const { prisma, service } = createService();

    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      officeId: 'office-1',
      transactionType: 'sale',
      statedBalanceDate: null,
      attachments: [],
      parties: [],
      documents: [
        {
          id: 'document-1',
          status: 'generated',
          category: 'contract',
          templateId: null,
          title: '아파트 매매 계약서',
        },
        {
          id: 'document-2',
          status: 'draft',
          category: 'report',
          templateId: null,
          title: '부동산거래계약신고서',
        },
        {
          id: 'document-3',
          status: 'submitted',
          category: 'report',
          templateId: null,
          title: '주택취득자금 조달 및 입주계획서',
        },
        {
          id: 'document-4',
          status: 'cancelled',
          category: 'report',
          templateId: null,
          title: '취소된 신고서',
        },
      ],
    });
    prisma.contractDocumentTemplate.findMany.mockResolvedValue([]);

    const result = await service.findOne('contract-1', 'office-1');

    // cancelled 제외, report 문서 중 가장 진행된 상태
    expect((result as any).transactionReportStatus).toBe('submitted');
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

  it('accepts all eight contract transaction types when creating a contract', async () => {
    const allowed = [
      'sale',
      'jeonse',
      'monthly',
      'yearly',
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

  describe('replaceParties', () => {
    function mockPartyStore(prisma: any) {
      const created: any[] = [];

      prisma.contractParty.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `party-${created.length + 1}`,
            parentId: null,
            idNumber: null,
            createdAt: new Date(2026, 0, 1, 0, 0, created.length),
            ...data,
          };
          created.push(row);
          return row;
        },
      );
      prisma.contractParty.findMany.mockImplementation(async () => created);

      return created;
    }

    it('replaces all parties in a single transaction and nests agents under parents', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-1',
        statedBalanceDate: null,
      });
      prisma.contact.count.mockResolvedValue(1);
      mockPartyStore(prisma);

      const dto: ReplaceContractPartiesDto = {
        parties: [
          {
            side: 'office',
            name: '대표중개사',
            officeName: '우리부동산',
            officeRegNo: '11740-2026-001',
          },
          {
            side: 'two',
            name: '박매수',
            contactId: '11111111-1111-4111-8111-111111111111',
          },
          {
            side: 'one',
            name: '김매도',
            idNumber: '900101-1234567',
            agents: [
              { name: '이대리' },
              { name: '최대리', agentLabel: '커스텀대리' },
            ],
          },
        ],
      } as ReplaceContractPartiesDto;

      const result = await service.replaceParties('contract-1', 'office-1', dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.contractParty.deleteMany).toHaveBeenCalledWith({
        where: { contractId: 'contract-1', officeId: 'office-1' },
      });
      // 본인 3행 + 대리인 2행
      expect(prisma.contractParty.create).toHaveBeenCalledTimes(5);
      expect(prisma.contractParty.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            officeId: 'office-1',
            contractId: 'contract-1',
            side: 'one',
            name: '이대리',
            agentLabel: '대리인',
            parentId: expect.any(String),
          }),
        }),
      );

      // side one → two → office 정렬 + 대리인 중첩
      expect(result.map((party: any) => party.side)).toEqual([
        'one',
        'two',
        'office',
      ]);
      const partyOne = result[0] as any;
      expect(partyOne.name).toBe('김매도');
      expect(partyOne.agents.map((agent: any) => agent.name)).toEqual([
        '이대리',
        '최대리',
      ]);
      expect(partyOne.agents[1].agentLabel).toBe('커스텀대리');
      // 잔금일 없음 → 마스킹 없이 그대로
      expect(partyOne.idNumber).toBe('900101-1234567');
    });

    it('rejects replacing parties of a contract owned by another office', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue(null);

      await expect(
        service.replaceParties('contract-1', 'other-office', {
          parties: [{ side: 'one', name: '김매도' }],
        } as ReplaceContractPartiesDto),
      ).rejects.toThrow('Contract not found');

      expect(prisma.contract.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'contract-1', officeId: 'other-office' },
        }),
      );
      expect(prisma.contractParty.deleteMany).not.toHaveBeenCalled();
      expect(prisma.contractParty.create).not.toHaveBeenCalled();
    });

    it('rejects contact links that belong to another office', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-1',
        statedBalanceDate: null,
      });
      prisma.contact.count.mockResolvedValue(0);

      await expect(
        service.replaceParties('contract-1', 'office-1', {
          parties: [
            {
              side: 'one',
              name: '김매도',
              contactId: '22222222-2222-4222-8222-222222222222',
            },
          ],
        } as ReplaceContractPartiesDto),
      ).rejects.toThrow(/다른 사무소의 연락처/);

      expect(prisma.contractParty.deleteMany).not.toHaveBeenCalled();
    });

    it('encrypts idNumber/phone/mobilePhone at rest and decrypts them in the response', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-1',
        statedBalanceDate: null,
      });
      const created = mockPartyStore(prisma);
      // 기존 당사자 없음 (loadExistingPartyIdNumbers)
      prisma.contractParty.findMany.mockImplementationOnce(async () => []);

      const result = await service.replaceParties('contract-1', 'office-1', {
        parties: [
          {
            side: 'one',
            name: '김매도',
            idNumber: '900101-1234567',
            phone: '02-123-4567',
            mobilePhone: '010-1111-2222',
          },
        ],
      } as ReplaceContractPartiesDto);

      // 저장값은 암호문 (레거시 Rsdt_Regi_No/Phne_No 암호화 대응)
      expect(created[0].idNumber).toMatch(/^enc:v1:/);
      expect(created[0].phone).toMatch(/^enc:v1:/);
      expect(created[0].mobilePhone).toMatch(/^enc:v1:/);
      // 응답은 복호화 (잔금일 없음 → 마스킹 없음)
      expect((result[0] as any).idNumber).toBe('900101-1234567');
      expect((result[0] as any).phone).toBe('02-123-4567');
      expect((result[0] as any).mobilePhone).toBe('010-1111-2222');
    });

    it('preserves the stored idNumber when a masked value is round-tripped', async () => {
      const { prisma, service } = createService();

      // 잔금일 + 15일 경과 → GET 응답이 마스킹된 상태로 내려간 계약
      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-1',
        statedBalanceDate: new Date('2020-01-01T00:00:00.000Z'),
      });
      const created = mockPartyStore(prisma);
      // 기존 당사자 (암호화 이전 평문 레거시 행 가정)
      prisma.contractParty.findMany.mockImplementationOnce(async () => [
        {
          id: 'party-old',
          parentId: null,
          side: 'one',
          subId: 1,
          name: '김매도',
          idNumber: '900101-1234567',
        },
      ]);

      const result = await service.replaceParties('contract-1', 'office-1', {
        parties: [
          {
            side: 'one',
            name: '김매도',
            // 클라이언트가 GET 응답(마스킹)을 그대로 되돌려 보낸 경우
            idNumber: '900101-*******',
          },
        ],
      } as ReplaceContractPartiesDto);

      // 마스킹 문자열이 저장되지 않고 기존 원본이 (암호화되어) 유지된다
      const stored = created[0].idNumber as string;
      expect(stored).toMatch(/^enc:v1:/);
      expect(stored).not.toContain('*');
      // 응답은 마스킹 정책 유지 (잔금일 경과)
      expect((result[0] as any).idNumber).toBe('900101-*******');
    });

    it('preserves masked idNumbers by ContractParty.id across reorders/deletions', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-1',
        statedBalanceDate: new Date('2020-01-01T00:00:00.000Z'),
      });
      const created = mockPartyStore(prisma);
      // 공동매도인 2명 — 1번이 계약에서 빠지고 2번이 subId 1 로 승격되는 케이스
      prisma.contractParty.findMany.mockImplementationOnce(async () => [
        {
          id: '11111111-1111-4111-8111-111111111111',
          parentId: null,
          side: 'one',
          subId: 1,
          name: '김매도',
          idNumber: '900101-1234567',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          parentId: null,
          side: 'one',
          subId: 2,
          name: '박공동',
          idNumber: '850505-7654321',
        },
      ]);

      await service.replaceParties('contract-1', 'office-1', {
        parties: [
          {
            // 기존 subId 2 행이 삭제로 subId 1 이 되지만 id 로 본인 원본이 보존된다
            id: '22222222-2222-4222-8222-222222222222',
            side: 'one',
            name: '박공동',
            idNumber: '850505-*******',
          },
        ],
      } as ReplaceContractPartiesDto);

      const stored = created[0].idNumber as string;
      expect(stored).toMatch(/^enc:v1:/);
      // 박공동 본인의 원본이 유지된다 (김매도의 번호가 아니라)
      expect(decryptContractPartyField(stored)).toBe('850505-7654321');
    });

    it('rejects preserving a masked idNumber when the row was renamed to another person', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-1',
        statedBalanceDate: new Date('2020-01-01T00:00:00.000Z'),
      });
      mockPartyStore(prisma);
      prisma.contractParty.findMany.mockImplementationOnce(async () => [
        {
          id: '11111111-1111-4111-8111-111111111111',
          parentId: null,
          side: 'one',
          subId: 1,
          name: '김매도',
          idNumber: '900101-1234567',
        },
      ]);

      await expect(
        service.replaceParties('contract-1', 'office-1', {
          parties: [
            {
              // 같은 행(id)을 다른 사람으로 재활용 — 김매도의 주민번호가
              // 박영희 이름으로 재암호화되는 사고를 차단한다
              id: '11111111-1111-4111-8111-111111111111',
              side: 'one',
              name: '박영희',
              idNumber: '900101-*******',
            },
          ],
        } as ReplaceContractPartiesDto),
      ).rejects.toThrow(/마스킹된 식별번호/);
    });

    it('rejects positional preserve when the name at the same slot differs', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-1',
        statedBalanceDate: new Date('2020-01-01T00:00:00.000Z'),
      });
      mockPartyStore(prisma);
      prisma.contractParty.findMany.mockImplementationOnce(async () => [
        {
          id: '11111111-1111-4111-8111-111111111111',
          parentId: null,
          side: 'one',
          subId: 1,
          name: '김매도',
          idNumber: '900101-1234567',
        },
      ]);

      // id 없이(구형 클라이언트) 같은 위치에 다른 사람 이름 + 마스킹 값
      await expect(
        service.replaceParties('contract-1', 'office-1', {
          parties: [
            { side: 'one', name: '박영희', idNumber: '900101-*******' },
          ],
        } as ReplaceContractPartiesDto),
      ).rejects.toThrow(/마스킹된 식별번호/);
    });

    it('rejects a masked idNumber that has no stored original to preserve', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-1',
        statedBalanceDate: null,
      });
      mockPartyStore(prisma);
      prisma.contractParty.findMany.mockImplementationOnce(async () => []);

      await expect(
        service.replaceParties('contract-1', 'office-1', {
          parties: [
            { side: 'one', name: '김매도', idNumber: '900101-*******' },
          ],
        } as ReplaceContractPartiesDto),
      ).rejects.toThrow(/마스킹된 식별번호/);
    });
  });

  describe('idNumber masking (레거시 changeRegNumber)', () => {
    it('masks the trailing digits after the hyphen', () => {
      const { service } = createService();

      expect(service.maskIdNumber('900101-1234567')).toBe('900101-*******');
      expect(service.maskIdNumber('1101112345678')).toBe('110111*******');
    });

    it('only masks after statedBalanceDate + 15 days', () => {
      const { service } = createService();
      const balanceDate = new Date('2026-01-10T00:00:00.000Z');

      expect(
        service.shouldMaskIdNumbers(balanceDate, new Date('2026-01-20T00:00:00.000Z')),
      ).toBe(false);
      expect(
        service.shouldMaskIdNumbers(balanceDate, new Date('2026-01-25T00:00:00.000Z')),
      ).toBe(false);
      expect(
        service.shouldMaskIdNumbers(balanceDate, new Date('2026-01-26T00:00:00.000Z')),
      ).toBe(true);
      expect(service.shouldMaskIdNumbers(null)).toBe(false);
    });

    it('masks party idNumbers in findOne once the balance date grace period passed', async () => {
      const { prisma, service } = createService();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-1',
        officeId: 'office-1',
        transactionType: 'sale',
        statedBalanceDate: thirtyDaysAgo,
        attachments: [],
        documents: [],
        parties: [
          {
            id: 'party-1',
            parentId: null,
            side: 'one',
            subId: 1,
            name: '김매도',
            idNumber: '900101-1234567',
          },
          {
            id: 'party-2',
            parentId: 'party-1',
            side: 'one',
            subId: 1,
            name: '이대리',
            idNumber: '850505-7654321',
          },
        ],
      });
      prisma.contractDocumentTemplate.findMany.mockResolvedValue([]);

      const result = await service.findOne('contract-1', 'office-1');

      expect(result.parties).toHaveLength(1);
      expect((result.parties[0] as any).idNumber).toBe('900101-*******');
      expect((result.parties[0] as any).agents[0].idNumber).toBe(
        '850505-*******',
      );
    });

    it('keeps raw idNumbers before the grace period passes', async () => {
      const { prisma, service } = createService();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-1',
        officeId: 'office-1',
        transactionType: 'sale',
        statedBalanceDate: yesterday,
        attachments: [],
        documents: [],
        parties: [
          {
            id: 'party-1',
            parentId: null,
            side: 'one',
            subId: 1,
            name: '김매도',
            idNumber: '900101-1234567',
          },
        ],
      });
      prisma.contractDocumentTemplate.findMany.mockResolvedValue([]);

      const result = await service.findOne('contract-1', 'office-1');

      expect((result.parties[0] as any).idNumber).toBe('900101-1234567');
    });
  });

  describe('findAll filters (레거시 DMLS001Q01)', () => {
    it('returns a plain array without query params (하위호환)', async () => {
      const { prisma, service } = createService();

      prisma.contract.findMany.mockResolvedValue([]);

      const result = await service.findAll('office-1');

      expect(Array.isArray(result)).toBe(true);
      expect(prisma.contract.count).not.toHaveBeenCalled();
      expect(prisma.contract.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { officeId: 'office-1' } }),
      );
    });

    it('combines kind/date/price/search/joint-brokerage filters with pagination', async () => {
      const { prisma, service } = createService();

      prisma.contract.findMany.mockResolvedValue([]);
      prisma.contract.count.mockResolvedValue(0);

      const result = await service.findAll('office-1', {
        kind: 'transaction_power_of_attorney,fact_confirmation',
        transactionType: 'sale',
        status: ['draft', 'signed'],
        dateField: 'statedBalanceDate',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        priceField: 'statedDeposit',
        priceMin: 1000,
        priceMax: 5000,
        searchField: 'party',
        search: '김매도',
        isJointBrokerage: true,
        page: 2,
        limit: 10,
      });

      const findManyArgs = prisma.contract.findMany.mock.calls[0][0];
      const conditions = findManyArgs.where.AND;

      expect(conditions).toEqual(
        expect.arrayContaining([
          { officeId: 'office-1' },
          {
            documents: {
              some: {
                status: { not: 'cancelled' },
                OR: [
                  {
                    kind: {
                      in: [
                        'transaction_power_of_attorney',
                        'fact_confirmation',
                      ],
                    },
                  },
                  {
                    template: {
                      code: {
                        in: [
                          'transaction_power_of_attorney',
                          'fact_confirmation',
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
          { transactionType: { in: ['sale'] } },
          { status: { in: ['draft', 'signed'] } },
          {
            statedBalanceDate: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-01-31'),
            },
          },
          { statedDeposit: { gte: 1000, lte: 5000 } },
          {
            OR: [
              { parties: { some: { name: { contains: '김매도', mode: 'insensitive' } } } },
              { buyerContact: { name: { contains: '김매도', mode: 'insensitive' } } },
              { sellerContact: { name: { contains: '김매도', mode: 'insensitive' } } },
            ],
          },
          { deal: { isJointBrokerage: true } },
        ]),
      );
      expect(findManyArgs.skip).toBe(10);
      expect(findManyArgs.take).toBe(10);
      expect(result).toEqual({
        items: [],
        pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
      });
    });

    it('searches address across the deal property chain and document metadata', async () => {
      const { prisma, service } = createService();

      prisma.contract.findMany.mockResolvedValue([]);

      await service.findAll('office-1', {
        searchField: 'address',
        search: '고덕동',
      });

      const conditions = prisma.contract.findMany.mock.calls[0][0].where.AND;
      const searchClause = conditions.find(
        (condition: any) => condition.OR,
      );

      expect(searchClause.OR).toEqual([
        {
          deal: {
            listing: {
              property: {
                site: {
                  OR: [
                    { name: { contains: '고덕동', mode: 'insensitive' } },
                    { roadAddress: { contains: '고덕동', mode: 'insensitive' } },
                    { jibunAddress: { contains: '고덕동', mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        },
        {
          documents: {
            some: {
              metadata: {
                path: ['documentEngine', 'fields', 'propertyAddress'],
                string_contains: '고덕동',
              },
            },
          },
        },
      ]);
    });

    it('rejects unknown date/price/search fields', async () => {
      const { service } = createService();

      await expect(
        service.findAll('office-1', { dateField: 'weirdDate', dateFrom: '2026-01-01' }),
      ).rejects.toThrow(/허용되지 않은 날짜 검색 기준/);
      await expect(
        service.findAll('office-1', { priceField: 'weirdPrice', priceMin: 1 }),
      ).rejects.toThrow(/허용되지 않은 금액 검색 기준/);
      await expect(
        service.findAll('office-1', { searchField: 'weird', search: 'x' }),
      ).rejects.toThrow(/허용되지 않은 텍스트 검색 기준/);
    });

    it('searches by phone across parties and linked contact phones (레거시 PhneNo)', async () => {
      const { prisma, service } = createService();

      prisma.contract.findMany.mockResolvedValue([]);

      await service.findAll('office-1', {
        searchField: 'phone',
        search: '010-1234-5678',
      });

      const conditions = prisma.contract.findMany.mock.calls[0][0].where.AND;
      const searchClause = conditions.find((condition: any) => condition.OR);
      const contains = { contains: '010-1234-5678', mode: 'insensitive' };
      const normalizedContains = { contains: '01012345678', mode: 'insensitive' };

      expect(searchClause.OR).toEqual(
        expect.arrayContaining([
          {
            parties: {
              some: {
                OR: [
                  { phone: contains },
                  { mobilePhone: contains },
                  { contact: { phones: { some: { phone: contains } } } },
                ],
              },
            },
          },
          { buyerContact: { phones: { some: { phone: contains } } } },
          { sellerContact: { phones: { some: { phone: contains } } } },
          // 숫자만 정규화된 번호로도 매칭 (CTI 발신번호 형식 대응)
          {
            buyerContact: {
              phones: { some: { normalizedPhone: normalizedContains } },
            },
          },
        ]),
      );
    });

    it('searches by partner office name (레거시 OffcName)', async () => {
      const { prisma, service } = createService();

      prisma.contract.findMany.mockResolvedValue([]);

      await service.findAll('office-1', {
        searchField: 'partnerOffice',
        search: '강동공인',
      });

      const conditions = prisma.contract.findMany.mock.calls[0][0].where.AND;
      const searchClause = conditions.find((condition: any) => condition.OR);
      const contains = { contains: '강동공인', mode: 'insensitive' };

      expect(searchClause.OR).toEqual([
        { deal: { partnerBroker: { name: contains } } },
        { parties: { some: { officeName: contains } } },
      ]);
    });

    it('filters retention-overdue contracts (레거시 PeriodOver, 기본 5년)', async () => {
      const { prisma, service } = createService();

      prisma.contract.findMany.mockResolvedValue([]);

      await service.findAll('office-1', {
        retentionOverdue: true,
        retentionBefore: '2021-07-14',
      });

      const conditions = prisma.contract.findMany.mock.calls[0][0].where.AND;
      const cutoff = new Date('2021-07-14');

      expect(conditions).toEqual(
        expect.arrayContaining([
          {
            OR: [
              { contractDate: { lte: cutoff } },
              { AND: [{ contractDate: null }, { createdAt: { lte: cutoff } }] },
            ],
          },
        ]),
      );

      await expect(
        service.findAll('office-1', {
          retentionOverdue: true,
          retentionBefore: 'not-a-date',
        }),
      ).rejects.toThrow(/잘못된 보존기간 기준일/);
    });
  });

  describe('document kind/순번 (레거시 Orde/Cntr_Clsf_Orde)', () => {
    it('auto-increments kindOrder when adding another document of the same kind', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({ id: 'contract-1' });
      prisma.contractDocument.aggregate
        .mockResolvedValueOnce({ _max: { sortOrder: 3 } }) // 전체 탭 순서
        .mockResolvedValueOnce({ _max: { kindOrder: 1 } }); // 같은 kind 반복 순번
      prisma.contractDocument.create.mockResolvedValue({ id: 'document-2' });

      await (service as any).createDocument('contract-1', 'office-1', 'user-1', {
        kind: 'transaction_power_of_attorney',
        category: 'attachment',
        title: '부동산거래위임장',
      });

      expect(prisma.contractDocument.aggregate).toHaveBeenNthCalledWith(2, {
        where: {
          contractId: 'contract-1',
          officeId: 'office-1',
          kind: 'transaction_power_of_attorney',
        },
        _max: { kindOrder: true },
      });
      expect(prisma.contractDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'transaction_power_of_attorney',
            sortOrder: 4,
            kindOrder: 2,
          }),
        }),
      );
    });

    it('rejects a document kind outside the shared ContractDocumentKind set', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({ id: 'contract-1' });

      await expect(
        (service as any).createDocument('contract-1', 'office-1', 'user-1', {
          // 오타 kind — transaction_power_of_attorney 가 아님
          kind: 'transaction_power_of_atorney',
          category: 'attachment',
          title: '부동산거래위임장',
        }),
      ).rejects.toThrow(/허용되지 않은 서식 코드/);
      expect(prisma.contractDocument.create).not.toHaveBeenCalled();

      prisma.contractDocument.findFirst.mockResolvedValue({ id: 'document-1' });
      await expect(
        (service as any).updateDocument('contract-1', 'document-1', 'office-1', {
          kind: 'weird_kind',
        }),
      ).rejects.toThrow(/허용되지 않은 서식 코드/);
      expect(prisma.contractDocument.update).not.toHaveBeenCalled();
    });

    it('derives kind from the linked template code when not provided', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({ id: 'contract-1' });
      prisma.contractDocumentTemplate.findFirst.mockResolvedValue({
        id: 'template-proxy',
        officeId: null,
        code: 'transaction_power_of_attorney',
        title: '부동산거래위임장',
        category: 'attachment',
      });
      prisma.contractDocument.create.mockResolvedValue({ id: 'document-1' });

      await (service as any).createDocument('contract-1', 'office-1', 'user-1', {
        templateId: 'template-proxy',
      });

      expect(prisma.contractDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'transaction_power_of_attorney',
            kindOrder: 1,
          }),
        }),
      );
    });
  });

  describe('문서 metadata 특약 새니타이즈 (stored-XSS 방어)', () => {
    const malicious = '<p>정상 특약</p><script>alert(1)</script>';

    it('sanitizes specialTerms under every engine metadata location', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({ id: 'contract-1' });
      prisma.contractDocument.create.mockResolvedValue({ id: 'document-1' });

      await (service as any).createDocument('contract-1', 'office-1', 'user-1', {
        category: 'contract',
        title: '계약서',
        metadata: {
          documentEngine: { version: 1, fields: { specialTerms: malicious } },
          engine: { fields: { specialTerms: malicious } },
          fields: { specialTerms: malicious },
        },
      });

      const metadata =
        prisma.contractDocument.create.mock.calls[0][0].data.metadata;
      expect(metadata.documentEngine.fields.specialTerms).toBe('<p>정상 특약</p>');
      expect(metadata.engine.fields.specialTerms).toBe('<p>정상 특약</p>');
      expect(metadata.fields.specialTerms).toBe('<p>정상 특약</p>');
      // 다른 키는 손대지 않는다
      expect(metadata.documentEngine.version).toBe(1);
    });

    it('sanitizes alternate locations even when documentEngine is absent', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({ id: 'contract-1' });
      prisma.contractDocument.findFirst.mockResolvedValue({ id: 'document-1' });
      prisma.contractDocument.update.mockResolvedValue({ id: 'document-1' });

      await (service as any).updateDocument('contract-1', 'document-1', 'office-1', {
        metadata: { engine: { fields: { specialTerms: malicious } } },
      });

      const metadata =
        prisma.contractDocument.update.mock.calls[0][0].data.metadata;
      expect(metadata.engine.fields.specialTerms).toBe('<p>정상 특약</p>');
    });
  });

  describe('삭제 (레거시 §1.3 삭제 액션)', () => {
    it('deletes a contract owned by the office (documents/parties cascade)', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({ id: 'contract-1' });
      prisma.contract.delete.mockResolvedValue({ id: 'contract-1' });

      const result = await service.remove('contract-1', 'office-1');

      expect(prisma.contract.findFirst).toHaveBeenCalledWith({
        where: { id: 'contract-1', officeId: 'office-1' },
        select: { id: true },
      });
      expect(prisma.contract.delete).toHaveBeenCalledWith({
        where: { id: 'contract-1' },
      });
      expect(result).toEqual({ id: 'contract-1', deleted: true });
    });

    it('rejects deleting a contract owned by another office', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue(null);

      await expect(service.remove('contract-1', 'other-office')).rejects.toThrow(
        'Contract not found',
      );
      expect(prisma.contract.delete).not.toHaveBeenCalled();
    });

    it('deletes a single document after an ownership check', async () => {
      const { prisma, service } = createService();

      prisma.contractDocument.findFirst.mockResolvedValue({ id: 'document-1' });
      prisma.contractDocument.delete.mockResolvedValue({ id: 'document-1' });

      const result = await service.removeDocument(
        'contract-1',
        'document-1',
        'office-1',
      );

      expect(prisma.contractDocument.findFirst).toHaveBeenCalledWith({
        where: { id: 'document-1', contractId: 'contract-1', officeId: 'office-1' },
        select: { id: true },
      });
      expect(prisma.contractDocument.delete).toHaveBeenCalledWith({
        where: { id: 'document-1' },
      });
      expect(result).toEqual({ id: 'document-1', deleted: true });
    });

    it('rejects deleting a document outside the office/contract scope', async () => {
      const { prisma, service } = createService();

      prisma.contractDocument.findFirst.mockResolvedValue(null);

      await expect(
        service.removeDocument('contract-1', 'document-1', 'other-office'),
      ).rejects.toThrow('Contract document not found');
      expect(prisma.contractDocument.delete).not.toHaveBeenCalled();
    });
  });

  describe('사본 (다른저장/계약서 복사)', () => {
    it('copies a single document as a new draft with the next kindOrder', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue({ id: 'contract-1' });
      prisma.contractDocument.findFirst.mockResolvedValue({
        id: 'document-1',
        contractId: 'contract-1',
        officeId: 'office-1',
        templateId: 'template-proxy',
        type: 'generated',
        category: 'attachment',
        title: '부동산거래위임장',
        status: 'generated',
        kind: 'transaction_power_of_attorney',
        sortOrder: 1,
        kindOrder: 1,
        fileUrl: null,
        fileSize: null,
        mimeType: null,
        metadata: { documentEngine: { fields: { agentName: '이대리' } } },
        memo: '원본 메모',
      });
      prisma.contractDocument.aggregate
        .mockResolvedValueOnce({ _max: { sortOrder: 2 } })
        .mockResolvedValueOnce({ _max: { kindOrder: 1 } });
      prisma.contractDocument.create.mockResolvedValue({ id: 'document-copy' });

      await service.copyDocument(
        'contract-1',
        'document-1',
        'office-1',
        'user-1',
      );

      expect(prisma.contractDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            officeId: 'office-1',
            contractId: 'contract-1',
            templateId: 'template-proxy',
            title: '부동산거래위임장',
            status: 'draft',
            kind: 'transaction_power_of_attorney',
            sortOrder: 3,
            kindOrder: 2,
            generatedById: 'user-1',
            metadata: { documentEngine: { fields: { agentName: '이대리' } } },
            memo: '원본 메모',
          }),
        }),
      );
    });

    it('rejects copying a document from another office', async () => {
      const { prisma, service } = createService();

      prisma.contract.findFirst.mockResolvedValue(null);

      await expect(
        service.copyDocument('contract-1', 'document-1', 'other-office', 'user-1'),
      ).rejects.toThrow('Contract not found');
      expect(prisma.contractDocument.create).not.toHaveBeenCalled();
    });

    it('duplicates the whole active document set within the same contract', async () => {
      const { prisma, service } = createService();

      const contract = {
        id: 'contract-1',
        officeId: 'office-1',
        transactionType: 'sale',
        statedBalanceDate: null,
        attachments: [],
        parties: [],
        documents: [
          {
            id: 'document-1',
            templateId: 'template-main',
            type: 'generated',
            category: 'contract',
            title: '아파트 매매 계약서',
            status: 'generated',
            kind: 'base_contract',
            sortOrder: 0,
            kindOrder: 1,
            fileUrl: null,
            fileSize: null,
            mimeType: null,
            metadata: {},
            memo: null,
          },
          {
            id: 'document-2',
            templateId: 'template-proxy',
            type: 'generated',
            category: 'attachment',
            title: '부동산거래위임장',
            status: 'cancelled',
            kind: 'transaction_power_of_attorney',
            sortOrder: 1,
            kindOrder: 1,
            fileUrl: null,
            fileSize: null,
            mimeType: null,
            metadata: {},
            memo: null,
          },
        ],
      };

      prisma.contract.findFirst.mockResolvedValue(contract);
      prisma.contractDocument.create.mockResolvedValue({ id: 'document-copy' });
      prisma.contractDocumentTemplate.findMany.mockResolvedValue([]);

      await service.copyContract('contract-1', 'office-1', 'user-1');

      // cancelled 문서는 복제하지 않는다
      expect(prisma.contractDocument.create).toHaveBeenCalledTimes(1);
      expect(prisma.contractDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contractId: 'contract-1',
            title: '아파트 매매 계약서',
            status: 'draft',
            kind: 'base_contract',
            sortOrder: 2, // 기존 최대 sortOrder(1) + 1
            kindOrder: 2, // 같은 kind 최대 kindOrder(1) + 1
            generatedById: 'user-1',
          }),
        }),
      );
    });
  });
});
