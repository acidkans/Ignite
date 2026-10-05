import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { normalizeWbsName } from '../common/normalize.util';

// @anchor normalize-wbs-name-data — normalizuje `name` w danych zapisu węzła WBS (obiekt lub tablica createMany).
const normalizeNameIn = (data: any) => {
  if (Array.isArray(data)) return data.forEach(normalizeNameIn);
  if (data && typeof data === 'object' && typeof data.name === 'string') {
    data.name = normalizeWbsName(data.name);
  }
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super();
    // @anchor prisma-wbs-name-middleware — jedno miejsce normalizacji nazw WBS dla WSZYSTKICH
    // dróg zapisu (drzewo, PATCH, import, klon wersji, generowanie z materiałów, zamówienia) —
    // węzły powstają w kilku serwisach i łatanie każdego z osobna by się rozjechało.
    this.$use(async (params, next) => {
      if (params.model === 'WbsNode' && params.args) {
        normalizeNameIn(params.args.data);
        normalizeNameIn(params.args.create);
        normalizeNameIn(params.args.update);
      }
      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
