import { ApiKeyService } from './api-key.service';

function setup(user: Record<string, unknown> | null) {
  const findFirst = jest.fn().mockResolvedValue(user);
  const service = new ApiKeyService({ user: { findFirst } } as never);
  return { service, findFirst };
}

describe('ApiKeyService.validateAndResolve', () => {
  const key = 'esk_abcdefghijklmnopqrstuvwxyz';

  it('resolves an active user of an active office', async () => {
    const { service, findFirst } = setup({
      id: 'user-1',
      officeId: 'office-1',
      role: 'agent',
      office: { isActive: true },
    });
    await expect(service.validateAndResolve(key)).resolves.toEqual({
      userId: 'user-1',
      officeId: 'office-1',
      role: 'agent',
    });
    // 비활성 직원의 키는 조회 조건에서 걸러진다.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      }),
    );
  });

  it('refuses a key whose office was deactivated', async () => {
    const { service } = setup({
      id: 'user-1',
      officeId: 'office-1',
      role: 'agent',
      office: { isActive: false },
    });
    await expect(service.validateAndResolve(key)).resolves.toBeNull();
  });

  it('refuses unknown keys, office-less users and non-key tokens', async () => {
    await expect(setup(null).service.validateAndResolve(key)).resolves.toBeNull();
    await expect(
      setup({ id: 'user-1', officeId: null, role: 'owner', office: null })
        .service.validateAndResolve(key),
    ).resolves.toBeNull();
    const notAKey = setup({ id: 'user-1', officeId: 'office-1', role: 'agent', office: { isActive: true } });
    await expect(notAKey.service.validateAndResolve('eyJhbGciOi')).resolves.toBeNull();
    expect(notAKey.findFirst).not.toHaveBeenCalled();
  });
});
