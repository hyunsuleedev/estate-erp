/**
 * SupabaseModule — Supabase Auth 통합 (Global).
 *
 * @Global()로 선언해서 어디서든 SupabaseService 주입 가능.
 * Auth만 외주 — DB는 자체 (RDS 또는 docker postgres) 사용.
 */

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { SupabaseService, SUPABASE_ADMIN_CLIENT } from './supabase.service';

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_ADMIN_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('SUPABASE_URL');
        const serviceRoleKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

        if (!url || !serviceRoleKey) {
          throw new Error(
            'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
          );
        }

        return createClient(url, serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        });
      },
    },
    SupabaseService,
  ],
  exports: [SupabaseService],
})
export class SupabaseModule {}
