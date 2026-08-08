import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ContactRelationsService } from './contact-relations.service';

const OFFICE_ID = '00000000-0000-4000-8000-000000000001';
const CONTACT_ID = '00000000-0000-4000-8000-000000000002';
const RELATED_ID = '00000000-0000-4000-8000-000000000003';

function contact(id: string, name: string) {
  return {
    id,
    officeId: OFFICE_ID,
    name,
    email: null,
    tags: [],
    memo: null,
    createdAt: new Date('2026-08-06T10:00:00.000Z'),
    updatedAt: new Date('2026-08-06T10:00:00.000Z'),
    phones: [],
  };
}

function relation(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000004',
    officeId: OFFICE_ID,
    contactId: CONTACT_ID,
    relatedContactId: RELATED_ID,
    relationType: 'parent',
    label: null,
    inverseLabel: null,
    memo: null,
    createdAt: new Date('2026-08-06T10:00:00.000Z'),
    updatedAt: new Date('2026-08-06T10:00:00.000Z'),
    ...overrides,
  };
}

describe('ContactRelationsService', () => {
  function createService() {
    const prisma = {
      contact: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      contactRelation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    return {
      prisma,
      service: new ContactRelationsService(prisma as never),
    };
  }

  it('자기 자신과의 관계를 거부한다', async () => {
    const { service } = createService();

    await expect(
      service.create(OFFICE_ID, {
        contactId: CONTACT_ID,
        relatedContactId: CONTACT_ID,
        relationType: 'parent',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('다른 사무소 연락처가 섞이면 관계를 만들지 않는다', async () => {
    const { prisma, service } = createService();
    prisma.contact.findMany.mockResolvedValue([{ id: CONTACT_ID }]);

    await expect(
      service.create(OFFICE_ID, {
        contactId: CONTACT_ID,
        relatedContactId: RELATED_ID,
        relationType: 'parent',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('A→B가 있으면 B→A 역방향 중복도 거부한다', async () => {
    const { prisma, service } = createService();
    prisma.contact.findMany.mockResolvedValue([
      { id: CONTACT_ID },
      { id: RELATED_ID },
    ]);
    prisma.contactRelation.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create(OFFICE_ID, {
        contactId: RELATED_ID,
        relatedContactId: CONTACT_ID,
        relationType: 'child',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.contactRelation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          officeId: OFFICE_ID,
          OR: [
            { contactId: RELATED_ID, relatedContactId: CONTACT_ID },
            { contactId: CONTACT_ID, relatedContactId: RELATED_ID },
          ],
        }),
      }),
    );
  });

  it('한 관계를 각 연락처 관점의 올바른 유형으로 조회한다', async () => {
    const { prisma, service } = createService();
    prisma.contact.findFirst.mockResolvedValue({ id: CONTACT_ID });
    prisma.contactRelation.findMany
      .mockResolvedValueOnce([
        relation({
          label: '어머니',
          inverseLabel: '둘째 아들',
          relatedContact: contact(RELATED_ID, '김어머니'),
        }),
      ])
      .mockResolvedValueOnce([
        relation({
          contactId: RELATED_ID,
          relatedContactId: CONTACT_ID,
          label: '아버지',
          inverseLabel: '딸',
          contact: contact(RELATED_ID, '이자녀'),
        }),
      ]);

    const result = await service.findByContact(OFFICE_ID, CONTACT_ID);

    expect(result.relations[0]).toMatchObject({
      displayRelationType: 'parent',
      displayLabel: '어머니',
      isReverse: false,
    });
    expect(result.relatedBy[0]).toMatchObject({
      displayRelationType: 'child',
      displayLabel: '딸',
      isReverse: true,
    });
    expect(result.items).toHaveLength(2);
  });

  it('관계 유형과 양쪽 호칭을 수정한다', async () => {
    const { prisma, service } = createService();
    const relatedContact = contact(RELATED_ID, '김배우자');
    prisma.contactRelation.findFirst.mockResolvedValue(
      relation({ relatedContact }),
    );
    prisma.contactRelation.update.mockResolvedValue(
      relation({
        relationType: 'spouse',
        label: '배우자',
        inverseLabel: '남편',
        relatedContact,
      }),
    );

    await expect(
      service.update(
        '00000000-0000-4000-8000-000000000004',
        OFFICE_ID,
        {
          relationType: 'spouse',
          label: ' 배우자 ',
          inverseLabel: ' 남편 ',
        },
      ),
    ).resolves.toMatchObject({
      relationType: 'spouse',
      displayRelationType: 'spouse',
    });

    expect(prisma.contactRelation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          relationType: 'spouse',
          label: '배우자',
          inverseLabel: '남편',
        }),
      }),
    );
  });
});
