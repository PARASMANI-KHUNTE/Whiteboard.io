type SocketHandler = (...args: any[]) => void | Promise<void>;

/**
 * Socket.IO invokes listeners outside a try/catch. Wrap every handler so a
 * malformed payload or a failing async call becomes a reported error instead
 * of an uncaughtException that terminates the whole server.
 */
export function guardSocketHandler<T extends SocketHandler>(
  handler: T,
  onError: (error: unknown) => void
): (...args: Parameters<T>) => void {
  return (...args: Parameters<T>) => {
    try {
      const result = handler(...args);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch(onError);
      }
    } catch (error) {
      onError(error);
    }
  };
}
