type AdminMutationOptions<T> = {
  execute: () => Promise<T>;
  onSuccess: (result: T) => void | Promise<void>;
  onError: (error: unknown) => void | Promise<void>;
  refresh: () => void | Promise<void>;
};

export async function runAdminMutation<T>({
  execute,
  onSuccess,
  onError,
  refresh,
}: AdminMutationOptions<T>): Promise<void> {
  try {
    const result = await execute();
    await onSuccess(result);
    await refresh();
  } catch (error) {
    await onError(error);
  }
}
