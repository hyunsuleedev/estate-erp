import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  normalizePhone,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';

@Injectable()
export class ContactRelationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByContact(officeId: string, contactId: string) {
    const [asMain, asRelated] = await Promise.all([
      this.prisma.contactRelation.findMany({
        where: { officeId, contactId },
        include: { relatedContact: { include: { phones: contactPhonesIncludeOrdered } } },
      }),
      this.prisma.contactRelation.findMany({
        where: { officeId, relatedContactId: contactId },
        include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
      }),
    ]);
    return {
      relations: asMain.map((relation) => ({
        ...relation,
        relatedContact: withPrimaryPhone(relation.relatedContact),
      })),
      relatedBy: asRelated.map((relation) => ({
        ...relation,
        contact: withPrimaryPhone(relation.contact),
      })),
    };
  }

  async create(
    officeId: string,
    dto: {
      contactId: string;
      relatedContactId: string;
      relationType: string;
      label?: string;
      memo?: string;
    },
  ) {
    return this.prisma.contactRelation.create({
      data: { officeId, ...dto },
      include: { relatedContact: { include: { phones: contactPhonesIncludeOrdered } } },
    }).then((relation) => ({
      ...relation,
      relatedContact: withPrimaryPhone(relation.relatedContact),
    }));
  }

  async createWithNewContact(
    officeId: string,
    dto: {
      contactId: string;
      relationType: string;
      label?: string;
      phone: string;
      name?: string;
      memo?: string;
    },
  ) {
    const { contactId, relationType, label, phone, name, memo } = dto;

    return this.prisma.$transaction(async (tx) => {
      const normalizedPhone = normalizePhone(phone);
      // 같은 사무소 내 동일 전화번호 검색
      let relatedContact = await tx.contact.findFirst({
        where: { officeId, phones: { some: { normalizedPhone, isActive: true } } },
      });

      if (!relatedContact) {
        // 이름 모르면 관계명으로 자동 생성 (예: "어머니")
        const RELATION_LABELS: Record<string, string> = {
          parent: '부모',
          spouse: '배우자',
          child: '자녀',
          sibling: '형제/자매',
          lawyer: '법무사',
          tax_agent: '세무사',
          other: label || '관련인',
        };
        const autoName = name || label || RELATION_LABELS[relationType] || '관련인';
        relatedContact = await tx.contact.create({
          data: {
            officeId,
            name: autoName,
            phones: {
              create: [{
                phone,
                normalizedPhone,
                label: 'mobile',
                isPrimary: true,
                isActive: true,
                office: { connect: { id: officeId } },
              }],
            },
          },
        });
      }

      const relation = await tx.contactRelation.create({
        data: {
          officeId,
          contactId,
          relatedContactId: relatedContact.id,
          relationType,
          label,
          memo,
        },
        include: { relatedContact: { include: { phones: contactPhonesIncludeOrdered } } },
      });

      return {
        ...relation,
        relatedContact: withPrimaryPhone(relation.relatedContact),
      };
    });
  }

  async remove(id: string, officeId: string) {
    const relation = await this.prisma.contactRelation.findFirst({
      where: { id, officeId },
    });
    if (!relation) throw new NotFoundException('ContactRelation not found');
    return this.prisma.contactRelation.delete({ where: { id } });
  }
}
