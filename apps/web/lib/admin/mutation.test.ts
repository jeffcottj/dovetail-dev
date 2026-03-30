import { describe, expect, it, vi } from 'vitest';
import { runAdminMutation } from './mutation';

describe('runAdminMutation', () => {
  it('calls the success handler and refreshes after a successful mutation', async () => {
    const execute = vi.fn().mockResolvedValue({ id: 'ok' });
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const refresh = vi.fn();

    await runAdminMutation({
      execute,
      onSuccess,
      onError,
      refresh,
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ id: 'ok' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
