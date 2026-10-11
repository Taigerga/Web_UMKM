import { describe, expect, it } from 'vitest';
import { redactInvitationToken } from './all-exceptions.filter.js';

/**
 * Sensor token undangan pada log 5xx.
 *
 * Fungsi ini murni dan diekspor supaya bisa diuji langsung. Test e2e di
 * `test/stores.e2e.spec.ts` ("token undangan tidak bocor ke log internal")
 * menguji perilaku yang sama melalui `Logger.prototype.error` pada request
 * sungguhan - test di sini menutup bentuk URL yang tidak praktis dibentuk lewat
 * HTTP.
 *
 * Yang dipin:
 * - segmen SETELAH `/invitations/` diganti `[REDACTED]`, termasuk pada kedua
 *   route produksi;
 * - URL lain TIDAK tersentuh - tidak ada pelemahan umum atas baris log;
 * - `id`/`storeId` pada URL lain tetap terbaca untuk penelusuran insiden.
 */
describe('redactInvitationToken', () => {
  it('menyensor token pada GET /invitations/:token', () => {
    const token = 'RAHASIA-super-panjang-123';
    expect(redactInvitationToken(`/api/v1/invitations/${token}`)).toBe(
      '/api/v1/invitations/[REDACTED]',
    );
  });

  it('menyensor token pada POST /invitations/:token/accept', () => {
    const token = 'RAHASIA-super-panjang-123';
    expect(redactInvitationToken(`/api/v1/invitations/${token}/accept`)).toBe(
      '/api/v1/invitations/[REDACTED]/accept',
    );
  });

  it('menyensor pada URL absolut maupun relatif, dengan maupun tanpa prefix global', () => {
    const token = 'abc123';
    for (const url of [
      `/invitations/${token}`,
      `/api/v1/invitations/${token}`,
      `http://localhost:3000/api/v1/invitations/${token}/accept`,
    ]) {
      const redacted = redactInvitationToken(url);
      expect(redacted).not.toContain(token);
      expect(redacted).toContain('/invitations/[REDACTED]');
    }
  });

  it('menyensor beberapa kemunculan sekaligus', () => {
    const redacted = redactInvitationToken(
      '/api/v1/invitations/aaa?next=/api/v1/invitations/bbb',
    );
    expect(redacted).not.toContain('aaa');
    expect(redacted).not.toContain('bbb');
    expect(redacted.match(/\[REDACTED\]/g)).toHaveLength(2);
  });

  it('TIDAK menyentuh URL tanpa segmen undangan', () => {
    // Pelemahan baris log untuk semua route akan menghapus kemampuan
    // menelusuri insiden di mana saja - harga yang lebih besar dari yang
    // dicegah. Test ini yang menjaganya tetap sempit.
    const untouched = [
      '/api/v1/auth/login',
      '/api/v1/stores/6e8e8f0b-a054-4fd6-9dbf-b0fd01f53fbf',
      '/api/v1/stores/6e8e8f0b/members/a054-4fd6-9dbf-b0fd01f53fbf',
      '/api/v1/admin/users',
      '/api/v1/echo/boom-http',
      '/api/v1/invitations',
      '/api/v1/invitations-other/abc',
      '/api/v1/invitations-notifications',
    ];
    for (const url of untouched) {
      expect(redactInvitationToken(url)).toBe(url);
    }
  });

  it('membiarkan id toko tetap terbaca pada baris log', () => {
    const storeId = '6e8e8f0b-a054-4fd6-9dbf-b0fd01f53fbf';
    const redacted = redactInvitationToken(`/api/v1/stores/${storeId}/members/x`);
    expect(redacted).toContain(storeId);
  });
});