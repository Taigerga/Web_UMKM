import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { StoreMembership } from '../../stores/store-access.service.js';

/**
 * `@CurrentStoreMembership()` menyuntikkan hasil `assertAccess` yang sudah
 * ditempel `StoreScopeGuard` ke `request.storeMembership`.
 *
 * Hanya bermakna pada route bertanda `@StoreAccess()`. Di route lain nilainya
 * `undefined`; memakainya di sana berarti controller mengarang akses yang tidak
 * pernah diverifikasi.
 */
export const CurrentStoreMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext): StoreMembership | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<{ storeMembership?: StoreMembership }>();
    return request.storeMembership;
  },
);