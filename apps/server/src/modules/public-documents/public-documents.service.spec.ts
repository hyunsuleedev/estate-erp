import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicDocumentProviderService } from './public-document-provider.service';
import { PublicDocumentsService } from './public-documents.service';

const siteId = '10000000-0000-4000-8000-000000000001';
const propertyId = '10000000-0000-4000-8000-000000000002';
const unitId = '10000000-0000-4000-8000-000000000003';
const site = { id: siteId, wardCode: '1168010100', jibunMain: '12' };

function setup() {
  const prisma = {
    property: { findFirst: jest.fn() },
    site: { findFirst: jest.fn().mockResolvedValue(site) },
    publicDocument: { create: jest.fn(), findFirst: jest.fn() },
  };
  const providers = {
    quote: (types: string[]) => types.map((type) => ({ type, available: true })),
  };
  const service = new PublicDocumentsService(
    prisma as unknown as PrismaService,
    providers as unknown as PublicDocumentProviderService,
  );
  return { service, prisma };
}

describe('등기 요청의 매물 연결', () => {
  it('장소 단독 견적에서는 등기만 제외하고 다른 장부는 요청할 수 있다', async () => {
    const { service } = setup();
    const quote = await service.quote('office', { siteId, types: ['registry', 'building_ledger'] });
    expect(quote.items.map((item) => item.available)).toEqual([false, true]);
  });

  it('매물이 없는 등기 단건·일괄 요청과 과거 요청의 재시도를 막는다', async () => {
    const { service, prisma } = setup();
    const document = { siteId, propertyId: null, type: 'registry' };
    prisma.publicDocument.findFirst.mockResolvedValue(document);
    await expect(service.create('office', 'user', { siteId, type: 'registry' })).rejects.toThrow(BadRequestException);
    await expect(service.createBatch('office', 'user', { siteId, types: ['registry'] })).rejects.toThrow(BadRequestException);
    await expect(service.retry('old', 'office')).rejects.toThrow(BadRequestException);
    expect(prisma.publicDocument.create).not.toHaveBeenCalled();
  });

  it('사무소·장소·호실로 매물을 확인하고 그 매물에서 동·호를 읽는다', async () => {
    const { service, prisma } = setup();
    const request = { siteId, propertyId, unitId, types: ['registry'] };
    prisma.property.findFirst.mockResolvedValueOnce(null);
    await expect(service.quote('office', request)).rejects.toThrow(NotFoundException);
    expect(prisma.property.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: propertyId, officeId: 'office', siteId, unitId },
    }));
    prisma.property.findFirst.mockResolvedValue({ site, unit: { name: '1203', dong: { name: '101' } } });
    await expect(service.quote('office', request)).resolves.toMatchObject({
      address: { dongName: '101', unitName: '1203' },
      items: [{ type: 'registry', available: true }],
    });
  });
});
