import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common'
import type { Response } from 'express'
import { type Observable, tap } from 'rxjs'

/** Spec §3.1. The CDN caches for 5 minutes and may serve stale for a day while revalidating. */
export const PUBLIC_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=86400'

/** For public reads only. Errors never reach `tap`, so they keep the filter's `no-store`. */
@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap(() => {
        context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', PUBLIC_CACHE_CONTROL)
      }),
    )
  }
}
