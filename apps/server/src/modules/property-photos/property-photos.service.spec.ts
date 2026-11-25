import { NotFoundException } from '@nestjs/common';
import { PropertyPhotosService } from './property-photos.service';

describe('PropertyPhotosService', () => {
  function createService() {
    const prisma = {
      property: { findFirst: jest.fn() },
      propertyPhoto: {
        findFirst: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: null } }),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    return { prisma, service: new PropertyPhotosService(prisma as never) };
  }

  it('다른 사무소 매물에는 사진을 붙이지 않는다', async () => {
    const { prisma, service } = createService();
    prisma.property.findFirst.mockResolvedValue(null);

    await expect(
      service.create('office-1', { propertyId: 'other-office-property', fileUrl: 'u', fileName: 'f' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.propertyPhoto.create).not.toHaveBeenCalled();
  });

  it('고칠 때 분류·순서·메모만 받는다', async () => {
    const { prisma, service } = createService();
    prisma.propertyPhoto.findFirst.mockResolvedValue({ id: 'photo-1' });

    await service.update('photo-1', 'office-1', {
      memo: '거실',
      officeId: 'other-office',
      propertyId: 'other-property',
      fileUrl: 'https://evil',
    } as never);

    expect(prisma.propertyPhoto.update).toHaveBeenCalledWith({
      where: { id: 'photo-1' },
      data: { memo: '거실' },
    });
  });
});
